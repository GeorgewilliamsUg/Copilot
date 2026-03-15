/* Classic Snake Game (JavaScript)
   Use arrow keys or WASD to move the snake.
   Eat the food to grow longer. Don't hit the walls or your own body.
*/

// --- Game configuration ---
const BOARD_SIZE = 20; // Board is BOARD_SIZE × BOARD_SIZE cells
const START_SPEED = 120; // Game loop speed in milliseconds per tick

// --- DOM references ---
const board = document.getElementById("gameBoard");
const scoreEl = document.getElementById("score");
const highScoreEl = document.getElementById("highScore");
const finalScoreEl = document.getElementById("finalScore");
const gameOverOverlay = document.getElementById("gameOver");
const restartBtn = document.getElementById("restartBtn");
const playAgainBtn = document.getElementById("playAgainBtn");

// --- Game state ---
let snake = []; // Ordered list of segments (from tail -> head)
let direction = { x: 0, y: 0 }; // Current movement direction
let nextDirection = { x: 0, y: 0 }; // Queued direction for next tick
let food = null; // Current food position
let score = 0; // Current score
let highScore = 0; // Best session score
let tickTimer = null; // Interval handle for game loop

// --- Utility helpers ---

/**
 * Clamp a value between min and max.
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Return a random integer between min and max (inclusive).
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Convert a coordinate into a stable string key (used for lookups).
 */
function coordToKey({ x, y }) {
  return `${x}:${y}`;
}

/**
 * Create a DOM element for a board cell (snake segment or food).
 */
function createCell({ x, y }, className) {
  const cell = document.createElement("div");
  cell.className = `cell ${className}`;
  cell.style.left = `${(x / BOARD_SIZE) * 100}%`;
  cell.style.top = `${(y / BOARD_SIZE) * 100}%`;
  return cell;
}

// --- Game logic ---

/**
 * Find a random empty cell to place food.
 */
function placeFood() {
  // Build a set of occupied cells (snake body) for quick lookups.
  const occupied = new Set(snake.map(coordToKey));
  const available = [];

  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const key = `${x}:${y}`;
      if (!occupied.has(key)) available.push({ x, y });
    }
  }

  if (!available.length) return null; // Board is full (rare)

  const idx = randomInt(0, available.length - 1);
  return available[idx];
}

/**
 * Reset the game state and start the game loop.
 */
function resetGame() {
  // Start with a 2-segment snake in the center of the board.
  snake = [
    { x: Math.floor(BOARD_SIZE / 2) - 1, y: Math.floor(BOARD_SIZE / 2) },
    { x: Math.floor(BOARD_SIZE / 2), y: Math.floor(BOARD_SIZE / 2) },
  ];

  // Initial direction is to the right.
  direction = { x: 1, y: 0 };
  nextDirection = { ...direction };

  score = 0;
  updateScore();

  food = placeFood();
  gameOverOverlay.classList.add("hidden");

  // Restart the game loop timer.
  if (tickTimer) {
    clearInterval(tickTimer);
  }

  tickTimer = setInterval(tick, START_SPEED);
  render();
}

/**
 * Update the on-screen score and high score values.
 */
function updateScore() {
  scoreEl.textContent = score.toString();
  highScoreEl.textContent = highScore.toString();
}

/**
 * Show the game-over overlay and stop the game loop.
 */
function setGameOver() {
  gameOverOverlay.classList.remove("hidden");
  finalScoreEl.textContent = score.toString();

  // Update high score if needed.
  if (score > highScore) {
    highScore = score;
    updateScore();
  }

  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

/**
 * Called once per tick to advance the game by one step.
 */
function tick() {
  // Apply the queued direction change.
  direction = nextDirection;

  // Determine next head position (wrap around the board edges).
  const head = {
    x: (snake[snake.length - 1].x + direction.x + BOARD_SIZE) % BOARD_SIZE,
    y: (snake[snake.length - 1].y + direction.y + BOARD_SIZE) % BOARD_SIZE,
  };

  const collidedWithSelf = snake.some(
    (segment) => segment.x === head.x && segment.y === head.y
  );

  if (collidedWithSelf) {
    setGameOver();
    return;
  }

  // Add new head segment.
  snake.push(head);

  // If we ate food, grow and spawn new food.
  if (food && head.x === food.x && head.y === food.y) {
    score += 1;
    updateScore();
    food = placeFood();
  } else {
    // Otherwise, remove tail segment (snake moves).
    snake.shift();
  }

  render();
}

/**
 * Update the DOM board to reflect current game state.
 */
function render() {
  board.innerHTML = "";

  if (food) {
    board.appendChild(createCell(food, "food"));
  }

  snake.forEach((segment) => {
    board.appendChild(createCell(segment, "snake"));
  });
}

/**
 * Handle keyboard input and queue direction changes.
 */
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
  if (!next) return; // Ignore other keys.

  // Prevent reversing direction directly (e.g., from left to right).
  const isOpposite =
    next.x === -direction.x && next.y === -direction.y;
  if (isOpposite) return;

  nextDirection = next;
}

/**
 * Attach event listeners (keyboard + UI buttons).
 */
function attachEvents() {
  window.addEventListener("keydown", handleKey);

  restartBtn.addEventListener("click", () => {
    resetGame();
  });

  playAgainBtn.addEventListener("click", () => {
    resetGame();
  });
}

attachEvents();
resetGame();
