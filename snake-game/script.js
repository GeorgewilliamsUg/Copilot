/* Classic Snake Game (JavaScript)
   Improvements added:
   - Speed ramps up as score increases
   - Multiple game modes (timed / survival / challenge / autopilot)
   - Power-ups and obstacles
   - Persistent high score + leaderboard
   - Theme selection + sound effects
*/

// --- Constants & Config ---
const BASE_SPEED = 120; // ms per tick for base difficulty
const MIN_SPEED = 60; // fastest pace possible
const SPEED_STEP = 3; // how many ms faster per score point
const POWERUP_CHANCE = 0.12; // chance to spawn a power-up each tick
const POWERUP_DURATION = 5000; // ms effect duration
const TIMED_MODE_SECONDS = 45;
const SURVIVAL_OBSTACLE_INTERVAL = 7000; // ms
const MAX_LEADERBOARD = 5;

// --- DOM references ---
const board = document.getElementById("gameBoard");
const scoreEl = document.getElementById("score");
const highScoreEl = document.getElementById("highScore");
const timerEl = document.getElementById("timer");
const modeSelect = document.getElementById("modeSelect");
const boardSizeSelect = document.getElementById("boardSizeSelect");
const themeSelect = document.getElementById("themeSelect");
const soundToggle = document.getElementById("soundToggle");
const leaderboardList = document.getElementById("leaderboardList");
const gameOverOverlay = document.getElementById("gameOver");
const finalScoreEl = document.getElementById("finalScore");
const restartBtn = document.getElementById("restartBtn");
const playAgainBtn = document.getElementById("playAgainBtn");

// --- Game state ---
let boardSize = 20;
let tickInterval = BASE_SPEED;
let snake = [];
let direction = { x: 0, y: 0 };
let nextDirection = { x: 0, y: 0 };
let food = null;
let score = 0;
let highScore = 0;
let leaderboard = [];
let tickTimer = null;
let mode = "classic";
let timeLeft = 0;
let timerTimer = null;
let gameOver = false;
let obstacles = [];
let lastObstacleAt = 0;
let powerUps = [];
let activeEffects = { slow: 0, ghost: 0, multiplier: 1 };
let autoPlay = false;
let audioContext = null;

// --- Utility helpers ---

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function coordToKey({ x, y }) {
  return `${x}:${y}`;
}

function setTheme(theme) {
  document.body.classList.remove("theme-neon", "theme-retro");
  if (theme === "neon") document.body.classList.add("theme-neon");
  if (theme === "retro") document.body.classList.add("theme-retro");
}

function playBeep(freq = 440, duration = 80, volume = 0.2) {
  if (!soundToggle.checked) return;
  try {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start();
    osc.stop(audioContext.currentTime + duration / 1000);
  } catch (e) {
    // ignore audio errors (e.g., when blocked by browser)
  }
}

// --- Persistence ---
function loadSettings() {
  const storedHigh = localStorage.getItem("snakeHighScore");
  if (storedHigh) highScore = Math.max(highScore, Number(storedHigh));

  const storedLeaderboard = localStorage.getItem("snakeLeaderboard");
  if (storedLeaderboard) {
    try {
      leaderboard = JSON.parse(storedLeaderboard);
    } catch {
      leaderboard = [];
    }
  }

  const storedTheme = localStorage.getItem("snakeTheme");
  if (storedTheme) {
    themeSelect.value = storedTheme;
    setTheme(storedTheme);
  }

  const storedSize = localStorage.getItem("snakeBoardSize");
  if (storedSize) {
    boardSizeSelect.value = storedSize;
    boardSize = Number(storedSize);
  }

  const storedMode = localStorage.getItem("snakeMode");
  if (storedMode) {
    modeSelect.value = storedMode;
    mode = storedMode;
  }

  const storedSound = localStorage.getItem("snakeSound");
  if (storedSound !== null) {
    soundToggle.checked = storedSound === "true";
  }

  renderLeaderboard();
}

function saveSettings() {
  localStorage.setItem("snakeHighScore", String(highScore));
  localStorage.setItem("snakeLeaderboard", JSON.stringify(leaderboard));
  localStorage.setItem("snakeTheme", themeSelect.value);
  localStorage.setItem("snakeBoardSize", boardSizeSelect.value);
  localStorage.setItem("snakeMode", modeSelect.value);
  localStorage.setItem("snakeSound", String(soundToggle.checked));
}

function updateLeaderboard(score) {
  leaderboard.push({ score, date: new Date().toISOString() });
  leaderboard.sort((a, b) => b.score - a.score);
  leaderboard = leaderboard.slice(0, MAX_LEADERBOARD);
  saveSettings();
  renderLeaderboard();
}

// --- Game state helpers ---

function getGameSpeed() {
  const base = Math.max(MIN_SPEED, BASE_SPEED - score * SPEED_STEP);
  if (activeEffects.slow > 0) return base * 1.8;
  return base;
}

function getOccupiedMap() {
  return new Set(snake.map(coordToKey));
}

function isCellBlocked(x, y) {
  if (x < 0 || y < 0 || x >= boardSize || y >= boardSize) return true;
  if (mode !== "challenge" && obstacles.some((o) => o.x === x && o.y === y)) return true;
  const occupied = getOccupiedMap();
  return occupied.has(`${x}:${y}`);
}

function spawnFood() {
  const occupied = getOccupiedMap();
  const available = [];

  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      const key = `${x}:${y}`;
      if (occupied.has(key)) continue;
      if (mode !== "challenge" && obstacles.some((o) => o.x === x && o.y === y)) continue;
      if (powerUps.some((p) => p.x === x && p.y === y)) continue;
      available.push({ x, y });
    }
  }

  if (!available.length) return null;
  return available[randomInt(0, available.length - 1)];
}

function spawnPowerUp() {
  if (Math.random() > POWERUP_CHANCE) return;

  const type = ["slow", "ghost", "double"][randomInt(0, 2)];
  const pos = spawnFood();
  if (!pos) return;
  powerUps.push({ ...pos, type, expiresAt: Date.now() + POWERUP_DURATION });
}

function spawnObstacle() {
  if (mode !== "survival") return;
  if (Date.now() - lastObstacleAt < SURVIVAL_OBSTACLE_INTERVAL) return;

  const candidate = spawnFood();
  if (!candidate) return;
  obstacles.push(candidate);
  lastObstacleAt = Date.now();
}

function applyPowerUp(type) {
  switch (type) {
    case "slow":
      activeEffects.slow = POWERUP_DURATION;
      playBeep(220, 100);
      break;
    case "ghost":
      activeEffects.ghost = POWERUP_DURATION;
      playBeep(520, 120);
      break;
    case "double":
      activeEffects.multiplier = 2;
      setTimeout(() => {
        activeEffects.multiplier = 1;
      }, POWERUP_DURATION);
      playBeep(720, 120);
      break;
    default:
      break;
  }
}

function applyEffects(delta) {
  if (activeEffects.slow > 0) activeEffects.slow -= delta;
  if (activeEffects.ghost > 0) activeEffects.ghost -= delta;
  if (activeEffects.slow < 0) activeEffects.slow = 0;
  if (activeEffects.ghost < 0) activeEffects.ghost = 0;
}

function isCollision({ x, y }) {
  const hitsWall = x < 0 || y < 0 || x >= boardSize || y >= boardSize;
  if (hitsWall && activeEffects.ghost <= 0) return true;

  if (mode === "challenge") {
    return snake.some((segment) => segment.x === x && segment.y === y);
  }

  if (activeEffects.ghost > 0) return false;

  const selfHit = snake.some((segment) => segment.x === x && segment.y === y);
  const obstacleHit = obstacles.some((o) => o.x === x && o.y === y);
  return selfHit || obstacleHit;
}

function updateTimerDisplay() {
  if (mode !== "timed") {
    timerEl.parentElement.classList.add("hidden");
    return;
  }
  timerEl.parentElement.classList.remove("hidden");
  timerEl.textContent = Math.max(0, Math.ceil(timeLeft / 1000)).toString();
}

function updateScoreDisplay() {
  scoreEl.textContent = score.toString();
  highScoreEl.textContent = highScore.toString();
}

function renderLeaderboard() {
  if (!leaderboardList) return;
  leaderboardList.innerHTML = "";
  leaderboard.forEach((entry) => {
    const li = document.createElement("li");
    const date = new Date(entry.date);
    li.textContent = `${entry.score} — ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
    leaderboardList.appendChild(li);
  });
}

function setGameOver() {
  gameOver = true;
  gameOverOverlay.classList.remove("hidden");
  finalScoreEl.textContent = score.toString();

  if (score > highScore) {
    highScore = score;
  }

  updateLeaderboard(score);
  updateScoreDisplay();
  saveSettings();
  stopGameLoop();
}

function stopGameLoop() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  if (timerTimer) {
    clearInterval(timerTimer);
    timerTimer = null;
  }
}

function startGameLoop() {
  stopGameLoop();
  tickInterval = getGameSpeed();
  tickTimer = setInterval(gameTick, tickInterval);
  if (mode === "timed") {
    timeLeft = TIMED_MODE_SECONDS * 1000;
    timerTimer = setInterval(() => {
      timeLeft -= 1000;
      updateTimerDisplay();
      if (timeLeft <= 0) setGameOver();
    }, 1000);
  }
}

function resetGame() {
  boardSize = Number(boardSizeSelect.value);
  mode = modeSelect.value;
  autoPlay = mode === "autopilot";

  snake = [];
  obstacles = [];
  powerUps = [];
  activeEffects = { slow: 0, ghost: 0, multiplier: 1 };

  const mid = Math.floor(boardSize / 2);
  if (mode === "challenge") {
    // Start with a longer snake and a tighter board for a tougher challenge.
    snake = Array.from({ length: 6 }, (_, i) => ({ x: mid - 3 + i, y: mid }));
  } else {
    snake = [
      { x: mid - 1, y: mid },
      { x: mid, y: mid },
    ];
  }

  if (mode === "survival") {
    // Seed a few obstacles to make survival mode harder right away.
    for (let i = 0; i < 4; i++) {
      const o = spawnFood();
      if (o) obstacles.push(o);
    }
  }

  direction = { x: 1, y: 0 };
  nextDirection = { ...direction };

  score = 0;
  food = spawnFood();
  gameOver = false;
  gameOverOverlay.classList.add("hidden");

  updateScoreDisplay();
  renderLeaderboard();
  updateTimerDisplay();
  setTheme(themeSelect.value);

  startGameLoop();
  render();
}

function createCell({ x, y }, className) {
  const cell = document.createElement("div");
  cell.className = `cell ${className}`;
  const sizePercent = 100 / boardSize;
  cell.style.width = `${sizePercent}%`;
  cell.style.height = `${sizePercent}%`;
  cell.style.left = `${(x / boardSize) * 100}%`;
  cell.style.top = `${(y / boardSize) * 100}%`;
  return cell;
}

function spawnLoot() {
  if (Math.random() < 0.6) return spawnFood();
  return null;
}

function spawnFood() {
  const occupied = getOccupiedMap();
  const available = [];

  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      const key = `${x}:${y}`;
      if (occupied.has(key)) continue;
      if (obstacles.some((o) => o.x === x && o.y === y)) continue;
      if (powerUps.some((p) => p.x === x && p.y === y)) continue;
      available.push({ x, y });
    }
  }

  if (!available.length) return null;
  return available[randomInt(0, available.length - 1)];
}

function makeParticle({ x, y }) {
  const part = document.createElement("div");
  part.className = "particle";
  part.style.left = `${(x / boardSize) * 100}%`;
  part.style.top = `${(y / boardSize) * 100}%`;
  const dx = randomInt(-20, 20);
  const dy = randomInt(-20, 20);
  part.style.setProperty("--dx", `${dx}px`);
  part.style.setProperty("--dy", `${dy}px`);
  board.appendChild(part);

  setTimeout(() => {
    part.remove();
  }, 500);
}

function getNextAutoplayDirection() {
  // BFS to nearest food ignoring snake head
  const start = snake[snake.length - 1];
  const target = food;
  if (!target) return direction;

  const visited = new Set();
  const queue = [{ pos: start, path: [] }];
  const moves = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ];

  while (queue.length) {
    const { pos, path } = queue.shift();
    const key = coordToKey(pos);
    if (visited.has(key)) continue;
    visited.add(key);

    if (pos.x === target.x && pos.y === target.y) {
      return path[0] || direction;
    }

    for (const move of moves) {
      const nxt = { x: pos.x + move.x, y: pos.y + move.y };
      if (nxt.x < 0 || nxt.y < 0 || nxt.x >= boardSize || nxt.y >= boardSize) continue;
      if (obstacles.some((o) => o.x === nxt.x && o.y === nxt.y)) continue;
      if (snake.some((seg) => seg.x === nxt.x && seg.y === nxt.y)) continue;
      const nxtKey = coordToKey(nxt);
      if (visited.has(nxtKey)) continue;
      queue.push({ pos: nxt, path: [...path, move] });
    }
  }

  return direction;
}

function gameTick() {
  if (gameOver) return;

  const delta = tickInterval;
  applyEffects(delta);

  if (autoPlay) {
    nextDirection = getNextAutoplayDirection();
  }

  direction = nextDirection;

  const head = {
    x: snake[snake.length - 1].x + direction.x,
    y: snake[snake.length - 1].y + direction.y,
  };

  if (isCollision(head)) {
    setGameOver();
    playBeep(120, 180);
    return;
  }

  snake.push(head);

  // Handle food consumption
  if (food && head.x === food.x && head.y === food.y) {
    const points = 1 * activeEffects.multiplier;
    score += points;
    updateScoreDisplay();
    playBeep(440, 90);
    makeParticle(head);
    food = spawnFood();
    spawnPowerUp();
  } else {
    snake.shift();
  }

  // Handle power-ups
  const powerIdx = powerUps.findIndex((p) => p.x === head.x && p.y === head.y);
  if (powerIdx !== -1) {
    const power = powerUps.splice(powerIdx, 1)[0];
    applyPowerUp(power.type);
    makeParticle(head);
  }

  // Remove expired powerups
  const now = Date.now();
  powerUps = powerUps.filter((p) => p.expiresAt > now);

  // Spawn obstacles when in survival mode
  if (mode === "survival") {
    spawnObstacle();
  }

  // Speed ramp
  const newInterval = getGameSpeed();
  if (newInterval !== tickInterval) {
    tickInterval = newInterval;
    startGameLoop();
  }

  render();
}

function render() {
  board.innerHTML = "";

  // Draw obstacles
  obstacles.forEach((cell) => {
    board.appendChild(createCell(cell, "cell obstacle"));
  });

  // Draw food
  if (food) {
    board.appendChild(createCell(food, "food"));
  }

  // Draw power-ups
  powerUps.forEach((p) => {
    board.appendChild(createCell(p, `powerup ${p.type}`));
  });

  // Draw snake
  snake.forEach((segment) => {
    board.appendChild(createCell(segment, "snake"));
  });
}

function handleKey(event) {
  const key = event.key;
  const dirMap = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    w: { x: 0, y: -1 },
    s: { x: 0, y: 1 },
    a: { x: -1, y: 0 },
    d: { x: 1, y: 0 },
  };

  const next = dirMap[key];
  if (!next) return;

  const isOpposite = next.x === -direction.x && next.y === -direction.y;
  if (isOpposite) return;

  nextDirection = next;
}

function attachEvents() {
  window.addEventListener("keydown", handleKey);

  restartBtn.addEventListener("click", () => {
    resetGame();
  });

  playAgainBtn.addEventListener("click", () => {
    resetGame();
  });

  modeSelect.addEventListener("change", () => {
    mode = modeSelect.value;
    saveSettings();
    resetGame();
  });

  boardSizeSelect.addEventListener("change", () => {
    boardSize = Number(boardSizeSelect.value);
    saveSettings();
    resetGame();
  });

  themeSelect.addEventListener("change", () => {
    setTheme(themeSelect.value);
    saveSettings();
  });

  soundToggle.addEventListener("change", () => {
    saveSettings();
  });
}

// --- Initialization ---
loadSettings();
attachEvents();
resetGame();
