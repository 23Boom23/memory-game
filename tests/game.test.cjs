const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = readFileSync(join(__dirname, '..', 'script.js'), 'utf8');

function createGame(savedData = new Map()) {
  const timers = new Map();
  let now = 0;
  let nextTimer = 1;
  let document;

  class Node {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.attributes = new Map();
      this.listeners = new Map();
      this.className = '';
      this.open = false;
      this.isConnected = true;
      this._textContent = '';
      this.classList = {
        add: (name) => {
          this.className = [...new Set([...this.className.split(' ').filter(Boolean), name])].join(' ');
        },
        remove: (name) => {
          this.className = this.className.split(' ').filter((part) => part !== name).join(' ');
        },
      };
    }

    set textContent(value) {
      this._textContent = String(value);
      this.children = [];
    }

    get textContent() {
      return this._textContent + this.children.map((child) => child.textContent).join('');
    }

    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name); }
    addEventListener(name, listener) {
      const listeners = this.listeners.get(name) || [];
      listeners.push(listener);
      this.listeners.set(name, listeners);
    }
    trigger(name, event = {}) {
      for (const listener of this.listeners.get(name) || []) listener(event);
    }
    click() { this.trigger('click', { target: this }); }
    focus() { document.activeElement = this; }
    showModal() { this.open = true; }
    close() {
      this.open = false;
      this.trigger('close');
    }
  }

  document = { body: new Node('body'), activeElement: null, createElement: (tag) => new Node(tag) };
  const context = {
    document,
    localStorage: {
      getItem: (key) => savedData.get(key) ?? null,
      setItem: (key, value) => savedData.set(key, value),
    },
    setTimeout: (callback, delay) => {
      const id = nextTimer++;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    Intl,
    Date,
    Math,
  };
  vm.runInNewContext(source, context);

  function all(predicate, root = document.body) {
    return [root, ...root.children.flatMap((child) => all(predicate, child))].filter(predicate);
  }

  function one(className) {
    const found = all((node) => node.className.split(' ').includes(className));
    assert.equal(found.length, 1, `Expected one .${className}`);
    return found[0];
  }

  function cards() {
    return all((node) => node.className.split(' ').includes('card'));
  }

  function image(card) {
    return all((node) => node.tagName === 'img', card)[0].src;
  }

  function action(label) {
    return all((node) => node.tagName === 'button' && node.textContent === label)[0];
  }

  function advance(milliseconds) {
    now += milliseconds;
    for (const [id, timer] of [...timers]) {
      if (timer.at <= now) {
        timers.delete(id);
        timer.callback();
      }
    }
  }

  return { document, all, one, cards, image, action, advance, savedData };
}

test('game starts with eight hidden pairs and zero counters', () => {
  const game = createGame();
  const cards = game.cards();
  const counts = new Map();
  for (const card of cards) {
    assert.match(card.getAttribute('aria-label'), /закрыта/);
    counts.set(game.image(card), (counts.get(game.image(card)) || 0) + 1);
  }
  assert.equal(cards.length, 16);
  assert.equal(counts.size, 8);
  assert.ok([...counts.values()].every((count) => count === 2));
  assert.equal(game.one('stats').textContent, 'Ходы0Найдено пар0 / 8');
});

test('mismatch locks the board, closes under leaderboard, and reset cancels its timer', () => {
  const game = createGame();
  const first = game.cards()[0];
  const second = game.cards().find((card) => game.image(card) !== game.image(first));
  const third = game.cards().find((card) => game.image(card) !== game.image(first) && game.image(card) !== game.image(second));
  first.click();
  first.click();
  assert.equal(game.one('stats').textContent, 'Ходы0Найдено пар0 / 8');
  assert.equal(first.getAttribute('aria-label').includes('закрыта'), false);
  second.click();
  third.click();
  assert.equal(game.one('stats').textContent, 'Ходы1Найдено пар0 / 8');
  assert.equal(third.getAttribute('aria-label').includes('закрыта'), true);
  game.action('Таблица лидеров').click();
  assert.equal(game.one('modal').open, true);
  game.advance(1000);
  assert.match(first.getAttribute('aria-label'), /закрыта/);
  assert.match(second.getAttribute('aria-label'), /закрыта/);
  game.action('Закрыть').click();
  assert.equal(game.one('modal').open, false);

  first.click();
  second.click();
  game.action('Новая игра').click();
  assert.equal(game.one('stats').textContent, 'Ходы0Найдено пар0 / 8');
  assert.ok(game.cards().every((card) => card.getAttribute('aria-label').includes('закрыта')));
  game.advance(1000);
  assert.equal(game.one('stats').textContent, 'Ходы0Найдено пар0 / 8');
});

test('victory saves once, finished cards stay inert, and leaderboard survives reload', () => {
  const savedData = new Map();
  const game = createGame(savedData);
  const groups = new Map();
  for (const card of game.cards()) {
    const key = game.image(card);
    groups.set(key, [...(groups.get(key) || []), card]);
  }
  for (const pair of groups.values()) {
    pair[0].click();
    pair[1].click();
  }
  assert.equal(game.one('stats').textContent, 'Ходы8Найдено пар8 / 8');
  game.advance(500);
  assert.equal(game.one('modal').open, true);
  assert.match(game.one('modal').textContent, /Победа!/);
  game.action('Закрыть').click();
  game.cards()[0].click();
  assert.equal(game.one('stats').textContent, 'Ходы8Найдено пар8 / 8');
  game.action('Таблица лидеров').click();
  assert.match(game.one('modal').textContent, /08|8/);
  game.action('Закрыть').click();
  assert.equal(JSON.parse([...savedData.values()][0]).length, 1);

  const reloaded = createGame(savedData);
  assert.equal(reloaded.one('stats').textContent, 'Ходы0Найдено пар0 / 8');
  reloaded.action('Таблица лидеров').click();
  assert.equal(reloaded.all((node) => node.tagName === 'tbody')[0].children.length, 1);
});
