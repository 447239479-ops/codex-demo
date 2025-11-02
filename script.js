/*
 * 简易贪吃蛇游戏 - 使用原生 Canvas 渲染
 * 逻辑参数通过 CONFIG 配置，方便二次开发
 */
const CONFIG = {
  GRID_SIZE: 20,
  CELL_SIZE: 20,
  BASE_SPEED: 8, // 每秒基础步数
  SPEED_INCREMENT: 0.35, // 每得一分提升的速度
  MAX_SPEED: 14,
  STORAGE_KEY: 'snakeHighScore'
};

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('highScore');
const overlay = document.getElementById('gameOverlay');
const overlayMessage = document.getElementById('overlayMessage');
const restartBtn = document.getElementById('restartBtn');
const pauseBtn = document.getElementById('pauseBtn');
const mobileButtons = document.querySelectorAll('.direction-btn');

let snake = [];
let direction = { x: 1, y: 0 };
let nextDirection = { x: 1, y: 0 };
let food = { x: 0, y: 0 };
let score = 0;
let highScore = Number(localStorage.getItem(CONFIG.STORAGE_KEY)) || 0;
let running = false;
let paused = false;
let lastUpdate = 0;

highScoreEl.textContent = highScore.toString();

/**
 * 初始化或重置游戏状态
 */
function initGame() {
  const centerX = Math.floor(CONFIG.GRID_SIZE / 2);
  const centerY = Math.floor(CONFIG.GRID_SIZE / 2);

  snake = [
    { x: centerX + 1, y: centerY },
    { x: centerX, y: centerY },
    { x: centerX - 1, y: centerY }
  ];

  direction = { x: 1, y: 0 };
  nextDirection = { x: 1, y: 0 };
  score = 0;
  paused = false;
  running = true;
  lastUpdate = 0;

  updateScoreBoard();
  spawnFood();
  overlay.classList.add('hidden');
  overlayMessage.textContent = '';
  pauseBtn.textContent = '暂停';

  draw();
  requestAnimationFrame(gameLoop);
}

/**
 * 游戏主循环，通过 requestAnimationFrame 控制节奏
 * @param {number} timestamp - 当前帧时间戳
 */
function gameLoop(timestamp) {
  if (!running) {
    return;
  }

  requestAnimationFrame(gameLoop);

  if (paused) {
    return;
  }

  if (!lastUpdate) {
    lastUpdate = timestamp;
  }

  const frameInterval = getFrameInterval();
  if (timestamp - lastUpdate >= frameInterval) {
    update();
    draw();
    lastUpdate = timestamp;
  }
}

/**
 * 根据当前分数动态调整速度
 * @returns {number} 每帧间隔（毫秒）
 */
function getFrameInterval() {
  const stepsPerSecond = Math.min(
    CONFIG.MAX_SPEED,
    CONFIG.BASE_SPEED + score * CONFIG.SPEED_INCREMENT
  );
  return 1000 / stepsPerSecond;
}

/**
 * 更新游戏逻辑：移动蛇、检测碰撞、生成食物
 */
function update() {
  direction = nextDirection;
  const newHead = {
    x: snake[0].x + direction.x,
    y: snake[0].y + direction.y
  };

  if (isCollision(newHead)) {
    endGame();
    return;
  }

  snake.unshift(newHead);

  if (newHead.x === food.x && newHead.y === food.y) {
    score += 1;
    updateHighScore();
    updateScoreBoard();
    spawnFood();
  } else {
    snake.pop();
  }
}

/**
 * 绘制画面：背景网格、蛇、食物
 */
function draw() {
  drawBackground();
  drawFood();
  drawSnake();
}

function drawBackground() {
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
  ctx.lineWidth = 1;

  for (let i = 1; i < CONFIG.GRID_SIZE; i += 1) {
    const position = i * CONFIG.CELL_SIZE;
    ctx.beginPath();
    ctx.moveTo(position, 0);
    ctx.lineTo(position, canvas.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, position);
    ctx.lineTo(canvas.width, position);
    ctx.stroke();
  }
}

function drawSnake() {
  snake.forEach((segment, index) => {
    const x = segment.x * CONFIG.CELL_SIZE;
    const y = segment.y * CONFIG.CELL_SIZE;

    ctx.fillStyle = index === 0 ? '#38bdf8' : '#0ea5e9';
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.4)';
    ctx.lineWidth = 2;

    const rectX = x + 2;
    const rectY = y + 2;
    const rectSize = CONFIG.CELL_SIZE - 4;

    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(rectX, rectY, rectSize, rectSize, 6);
    } else {
      ctx.rect(rectX, rectY, rectSize, rectSize);
    }
    ctx.fill();
    ctx.stroke();
  });
}

function drawFood() {
  const x = food.x * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
  const y = food.y * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
  const radius = (CONFIG.CELL_SIZE / 2) * 0.7;

  const gradient = ctx.createRadialGradient(x - 3, y - 3, 3, x, y, radius);
  gradient.addColorStop(0, '#fef08a');
  gradient.addColorStop(1, '#facc15');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 生成不会与蛇重合的新食物位置
 */
function spawnFood() {
  let newFood;
  do {
    newFood = {
      x: Math.floor(Math.random() * CONFIG.GRID_SIZE),
      y: Math.floor(Math.random() * CONFIG.GRID_SIZE)
    };
  } while (snake.some((segment) => segment.x === newFood.x && segment.y === newFood.y));

  food = newFood;
}

/**
 * 检查新位置是否撞墙或撞到自己
 * @param {{x: number, y: number}} headPosition
 * @returns {boolean}
 */
function isCollision(headPosition) {
  const { x, y } = headPosition;
  const hitWall =
    x < 0 ||
    y < 0 ||
    x >= CONFIG.GRID_SIZE ||
    y >= CONFIG.GRID_SIZE;

  if (hitWall) {
    return true;
  }

  return snake.some(
    (segment) => segment.x === headPosition.x && segment.y === headPosition.y
  );
}

function updateScoreBoard() {
  scoreEl.textContent = score.toString();
  highScoreEl.textContent = highScore.toString();
}

function updateHighScore() {
  if (score > highScore) {
    highScore = score;
    localStorage.setItem(CONFIG.STORAGE_KEY, highScore.toString());
  }
}

function endGame() {
  running = false;
  overlayMessage.textContent = `Game Over! 分数：${score}`;
  overlay.classList.remove('hidden');
  pauseBtn.textContent = '开始';
}

function togglePause() {
  if (!running) {
    return;
  }

  paused = !paused;
  pauseBtn.textContent = paused ? '继续' : '暂停';
}

function setDirectionFromInput(dir) {
  const directionVectors = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

  const newDirection = directionVectors[dir];
  if (!newDirection) {
    return;
  }

  const isOpposite =
    newDirection.x === -direction.x && newDirection.y === -direction.y;

  if (!isOpposite) {
    nextDirection = newDirection;
  }
}

function handleKeydown(event) {
  const { key } = event;

  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
    event.preventDefault();
  }

  switch (key) {
    case 'ArrowUp':
      setDirectionFromInput('up');
      break;
    case 'ArrowDown':
      setDirectionFromInput('down');
      break;
    case 'ArrowLeft':
      setDirectionFromInput('left');
      break;
    case 'ArrowRight':
      setDirectionFromInput('right');
      break;
    case 'p':
    case 'P':
      togglePause();
      break;
    case 'r':
    case 'R':
      if (!running) {
        initGame();
      }
      break;
    default:
      break;
  }
}

function handleDirectionButton(event) {
  const dir = event.currentTarget.dataset.direction;
  setDirectionFromInput(dir);
}

restartBtn.addEventListener('click', initGame);
pauseBtn.addEventListener('click', () => {
  if (!running) {
    initGame();
  } else {
    togglePause();
  }
});
window.addEventListener('keydown', handleKeydown);
mobileButtons.forEach((button) => {
  button.addEventListener('click', handleDirectionButton);
  button.addEventListener('touchstart', (event) => {
    event.preventDefault();
    setDirectionFromInput(button.dataset.direction);
  });
});

// 启动游戏
initGame();
