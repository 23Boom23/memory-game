const symbols = [
  { id: 'sun', name: 'солнце' },
  { id: 'moon', name: 'луна' },
  { id: 'heart', name: 'сердце' },
  { id: 'star', name: 'звезда' },
  { id: 'leaf', name: 'лист' },
  { id: 'flower', name: 'цветок' },
  { id: 'bolt', name: 'молния' },
  { id: 'planet', name: 'планета' },
];

const storageKey = 'memory-game-results-v1';
const mismatchDelay = 1000;
const winDelay = 500;

const state = {
  deck: [],
  firstCard: null,
  moves: 0,
  pairs: 0,
  locked: false,
  finished: false,
  timeout: null,
  gameId: 0,
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text, className, onClick) {
  const node = element('button', className, text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

function shuffle(cards) {
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [cards[index], cards[other]] = [cards[other], cards[index]];
  }
  return cards;
}

function readResults() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(stored)) return [];
    return stored.filter((result) =>
      Number.isInteger(result.moves) && result.moves > 0 &&
      Number.isFinite(result.playedAt) && result.playedAt > 0
    );
  } catch {
    return [];
  }
}

function saveResult(moves) {
  const results = readResults();
  results.push({ moves, playedAt: Date.now() });
  results.sort((a, b) => a.moves - b.moves || a.playedAt - b.playedAt);
  try {
    localStorage.setItem(storageKey, JSON.stringify(results.slice(0, 10)));
  } catch {
    // The completed game stays playable when storage is unavailable.
  }
}

const app = element('div', 'app');
const header = element('header', 'site-header');
const headerInner = element('div', 'header-inner');
const brand = element('div', 'brand');
const brandMark = element('span', 'brand-mark');
brandMark.setAttribute('aria-hidden', 'true');
const brandText = element('span', 'brand-text', 'MEMORY GAME');
brand.append(brandMark, brandText);

const headerActions = element('nav', 'header-actions');
headerActions.setAttribute('aria-label', 'Действия игры');
const newGameButton = button('Новая игра', 'action-button action-button-primary', startGame);
const leaderboardButton = button('Таблица лидеров', 'action-button action-button-secondary', showLeaderboard);
headerActions.append(newGameButton, leaderboardButton);
headerInner.append(brand, headerActions);
header.append(headerInner);

const main = element('main', 'main');
const headingRow = element('div', 'heading-row');
const heading = element('h1', 'page-title', 'Найди пары');
const subtitle = element('p', 'page-subtitle', 'Открой все 8 пар за меньшее число ходов.');
headingRow.append(heading, subtitle);

const game = element('section', 'game');
game.setAttribute('aria-label', 'Игровое поле');
const stats = element('div', 'stats');
const movesStat = element('div', 'stat');
const movesLabel = element('span', 'stat-label', 'Ходы');
const movesValue = element('strong', 'stat-value', '0');
movesValue.setAttribute('aria-live', 'polite');
movesStat.append(movesLabel, movesValue);
const pairsStat = element('div', 'stat');
const pairsLabel = element('span', 'stat-label', 'Найдено пар');
const pairsValue = element('strong', 'stat-value');
pairsValue.setAttribute('aria-live', 'polite');
pairsStat.append(pairsLabel, pairsValue);
stats.append(movesStat, pairsStat);
const board = element('div', 'board');
board.setAttribute('aria-label', '16 карточек');
game.append(stats, board);
main.append(headingRow, game);

const footer = element('footer', 'site-footer', 'MEMORY GAME');
const dialog = element('dialog', 'modal');
dialog.setAttribute('aria-modal', 'true');
let focusBeforeModal = null;

function closeModal() {
  if (!dialog.open) return;
  dialog.close();
}

dialog.addEventListener('close', () => {
  document.body.classList.remove('modal-open');
  if (focusBeforeModal && focusBeforeModal.isConnected) focusBeforeModal.focus();
  focusBeforeModal = null;
});

dialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeModal();
});

dialog.addEventListener('click', (event) => {
  if (event.target === dialog) closeModal();
});

function openModal(title, content, actions) {
  if (dialog.open) closeModal();
  focusBeforeModal = document.activeElement;
  const panel = element('div', 'modal-panel');
  const top = element('div', 'modal-top');
  const heading = element('h2', 'modal-title', title);
  heading.id = 'modal-title';
  dialog.setAttribute('aria-labelledby', heading.id);
  top.append(heading);
  const body = element('div', 'modal-body');
  body.append(content);
  const footer = element('div', 'modal-actions');
  footer.append(...actions);
  panel.append(top, body, footer);
  dialog.replaceChildren(panel);
  document.body.classList.add('modal-open');
  dialog.showModal();
  actions[0]?.focus();
}

function showLeaderboard() {
  const results = readResults();
  const content = element('div');
  if (results.length === 0) {
    content.append(element('p', 'empty-state', 'Пока нет результатов'));
  } else {
    const table = element('table', 'leaderboard-table');
    const caption = element('caption', 'visually-hidden', 'Лучшие результаты');
    const thead = element('thead');
    const headRow = element('tr');
    for (const label of ['Место', 'Ходы', 'Дата']) {
      const cell = element('th', '', label);
      cell.scope = 'col';
      headRow.append(cell);
    }
    thead.append(headRow);
    const tbody = element('tbody');
    const dateFormat = new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
    results.forEach((result, index) => {
      const row = element('tr');
      row.append(
        element('td', '', String(index + 1)),
        element('td', '', String(result.moves)),
        element('td', '', dateFormat.format(new Date(result.playedAt)))
      );
      tbody.append(row);
    });
    table.append(caption, thead, tbody);
    content.append(table);
  }
  openModal('Таблица лидеров', content, [button('Закрыть', 'action-button action-button-primary', closeModal)]);
}

function showVictory() {
  const content = element('div', 'victory-content');
  const badge = element('div', 'victory-badge', '✦');
  badge.setAttribute('aria-hidden', 'true');
  const message = element('p', 'victory-message', 'Все пары найдены!');
  const result = element('p', 'victory-result');
  result.append(element('span', '', 'Ходов: '), element('strong', '', String(state.moves)));
  content.append(badge, message, result);
  openModal('Победа!', content, [
    button('Новая игра', 'action-button action-button-primary', startGame),
    button('Закрыть', 'action-button action-button-secondary', closeModal),
  ]);
}

function updateStats() {
  movesValue.textContent = String(state.moves);
  pairsValue.textContent = `${state.pairs} / 8`;
}

function createCard(card, index) {
  const cardButton = button(undefined, 'card', () => selectCard(card));
  cardButton.setAttribute('aria-label', `Карточка ${index + 1}, закрыта`);
  const inner = element('span', 'card-inner');
  const back = element('span', 'card-face card-back');
  const backMark = element('span', 'card-back-mark');
  backMark.setAttribute('aria-hidden', 'true');
  back.append(backMark);
  const front = element('span', 'card-face card-front');
  const picture = element('img', 'card-image');
  picture.src = `assets/${card.symbol.id}.svg`;
  picture.alt = '';
  picture.draggable = false;
  front.append(picture);
  inner.append(back, front);
  cardButton.append(inner);
  card.button = cardButton;
  card.position = index + 1;
  return cardButton;
}

function reveal(card) {
  card.open = true;
  card.button.classList.add('is-open');
  card.button.setAttribute('aria-label', `Карточка ${card.position}, ${card.symbol.name}`);
}

function conceal(card) {
  card.open = false;
  card.button.classList.remove('is-open');
  card.button.setAttribute('aria-label', `Карточка ${card.position}, закрыта`);
}

function selectCard(card) {
  if (state.finished || state.locked || card.open || card.matched) return;
  reveal(card);
  if (!state.firstCard) {
    state.firstCard = card;
    return;
  }

  const first = state.firstCard;
  state.firstCard = null;
  state.moves += 1;

  if (first.symbol.id === card.symbol.id) {
    first.matched = true;
    card.matched = true;
    first.button.classList.add('is-matched');
    card.button.classList.add('is-matched');
    state.pairs += 1;
    updateStats();
    if (state.pairs === symbols.length) {
      state.finished = true;
      saveResult(state.moves);
      const gameId = state.gameId;
      state.timeout = setTimeout(() => {
        if (gameId === state.gameId) showVictory();
        state.timeout = null;
      }, winDelay);
    }
    return;
  }

  state.locked = true;
  updateStats();
  const gameId = state.gameId;
  state.timeout = setTimeout(() => {
    if (gameId !== state.gameId) return;
    conceal(first);
    conceal(card);
    state.locked = false;
    state.timeout = null;
  }, mismatchDelay);
}

function startGame() {
  if (state.timeout !== null) clearTimeout(state.timeout);
  state.gameId += 1;
  state.timeout = null;
  state.firstCard = null;
  state.moves = 0;
  state.pairs = 0;
  state.locked = false;
  state.finished = false;
  const deck = shuffle(symbols.flatMap((symbol) => [
    { symbol, open: false, matched: false },
    { symbol, open: false, matched: false },
  ]));
  state.deck = deck;
  board.replaceChildren(...deck.map(createCard));
  updateStats();
  closeModal();
}

app.append(header, main, footer, dialog);
document.body.append(app);
startGame();
