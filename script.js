const TILE_SIZE = 24;
const BASE_GRID = [
  "###################",
  "#o......#......#o#",
  "#.###.#.#.###.#..#",
  "#.....#.#.....#..#",
  "#.###.#.#.###.#.##",
  "#.................#",
  "###.#.#######.#.###",
  "#...#....#....#...#",
  "#.#.###. # .###.#.#",
  "#.#.....   .....#.#",
  "#.#.###.###.###.#.#",
  "#.....#.....#.....#",
  "#.###.#.###.#.###.#",
  "#o....#..P..#....o#",
  "###################",
];

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreNode = document.getElementById("score");
const livesNode = document.getElementById("lives");
const statusNode = document.getElementById("status");
const startButton = document.getElementById("start-button");
const muteButton = document.getElementById("mute-button");

const directions = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

const ghostPalette = ["#ff4f70", "#65f5ff", "#ff9f43"];
let lastFrame = 0;
let game = null;
let audioContext = null;
let isMuted = false;

function cloneGrid() {
  const width = Math.max(...BASE_GRID.map((row) => row.length));
  return BASE_GRID.map((row) => row.padEnd(width, "#").split(""));
}

function createGame() {
  const grid = cloneGrid();
  let pellets = 0;
  let playerStart = { x: 9, y: 13 };

  grid.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell === "." || cell === "o") {
        pellets += 1;
      }
      if (cell === "P") {
        playerStart = { x, y };
        grid[y][x] = " ";
      }
    });
  });

  return {
    grid,
    pellets,
    score: 0,
    lives: 3,
    state: "idle",
    message: "Press Start or Enter, then move with Arrow keys or WASD.",
    player: {
      ...playerStart,
      startX: playerStart.x,
      startY: playerStart.y,
      dir: "left",
      nextDir: "left",
    },
    ghosts: [
      createGhost(9, 7, "left", ghostPalette[0]),
      createGhost(8, 9, "right", ghostPalette[1]),
      createGhost(10, 9, "up", ghostPalette[2]),
    ],
    powerUntil: 0,
    playerAccumulator: 0,
    ghostAccumulator: 0,
  };
}

function createGhost(x, y, dir, color) {
  return {
    x,
    y,
    homeX: x,
    homeY: y,
    dir,
    color,
    frightenedUntil: 0,
  };
}

function ensureAudio() {
  if (audioContext || isMuted) {
    return;
  }
  audioContext = new window.AudioContext();
}

function playTone(frequency, duration, type = "sine", volume = 0.03) {
  if (isMuted) {
    return;
  }
  ensureAudio();
  if (!audioContext) {
    return;
  }

  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function playChomp() {
  playTone(520, 0.09, "square");
}

function playPower() {
  playTone(320, 0.12, "triangle", 0.05);
  setTimeout(() => playTone(640, 0.16, "triangle", 0.04), 80);
}

function playGhostSound() {
  playTone(760, 0.14, "sawtooth", 0.04);
}

function playLoseLife() {
  playTone(280, 0.35, "square", 0.05);
}

function playWin() {
  [523, 659, 784].forEach((tone, index) => {
    setTimeout(() => playTone(tone, 0.18, "triangle", 0.04), index * 120);
  });
}

function canMove(entity, dir) {
  const nextX = entity.x + directions[dir].x;
  const nextY = entity.y + directions[dir].y;
  return game.grid[nextY]?.[nextX] && game.grid[nextY][nextX] !== "#";
}

function resetRound() {
  game.player.x = game.player.startX;
  game.player.y = game.player.startY;
  game.player.dir = "left";
  game.player.nextDir = "left";

  game.ghosts.forEach((ghost, index) => {
    ghost.x = ghost.homeX;
    ghost.y = ghost.homeY;
    ghost.dir = index % 2 === 0 ? "left" : "right";
    ghost.frightenedUntil = 0;
  });
}

function setStatus(message) {
  game.message = message;
  statusNode.textContent = message;
}

function updateHud() {
  scoreNode.textContent = game.score;
  livesNode.textContent = game.lives;
}

function startGame() {
  if (!game || game.state === "running") {
    return;
  }
  ensureAudio();
  if (audioContext?.state === "suspended") {
    audioContext.resume();
  }
  if (game.state === "won" || game.state === "gameover") {
    game = createGame();
  }
  resetRound();
  game.state = "running";
  setStatus("Collect every pellet and avoid the ghosts.");
  updateHud();
}

function handlePlayerStep(now) {
  if (canMove(game.player, game.player.nextDir)) {
    game.player.dir = game.player.nextDir;
  }

  if (!canMove(game.player, game.player.dir)) {
    return;
  }

  game.player.x += directions[game.player.dir].x;
  game.player.y += directions[game.player.dir].y;

  const cell = game.grid[game.player.y][game.player.x];
  if (cell === ".") {
    game.grid[game.player.y][game.player.x] = " ";
    game.score += 10;
    game.pellets -= 1;
    playChomp();
  } else if (cell === "o") {
    game.grid[game.player.y][game.player.x] = " ";
    game.score += 50;
    game.pellets -= 1;
    game.powerUntil = now + 8000;
    game.ghosts.forEach((ghost) => {
      ghost.frightenedUntil = game.powerUntil;
    });
    playPower();
  }
}

function directionOptions(entity) {
  return Object.keys(directions).filter((dir) => canMove(entity, dir));
}

function chooseGhostDirection(ghost, frightened) {
  const options = directionOptions(ghost).filter((dir) => {
    const current = directions[ghost.dir];
    return !(current && current.x + directions[dir].x === 0 && current.y + directions[dir].y === 0);
  });
  const available = options.length ? options : directionOptions(ghost);
  if (frightened) {
    return available[Math.floor(Math.random() * available.length)];
  }

  return available
    .map((dir) => ({
      dir,
      score:
        Math.abs(ghost.x + directions[dir].x - game.player.x) +
        Math.abs(ghost.y + directions[dir].y - game.player.y),
    }))
    .sort((a, b) => a.score - b.score)[0].dir;
}

function handleGhosts(now) {
  game.ghosts.forEach((ghost) => {
    const frightened = ghost.frightenedUntil > now;
    ghost.dir = chooseGhostDirection(ghost, frightened);
    if (canMove(ghost, ghost.dir)) {
      ghost.x += directions[ghost.dir].x;
      ghost.y += directions[ghost.dir].y;
    }
  });
}

function handleCollisions() {
  for (const ghost of game.ghosts) {
    if (ghost.x !== game.player.x || ghost.y !== game.player.y) {
      continue;
    }

    if (ghost.frightenedUntil > performance.now()) {
      game.score += 200;
      ghost.x = ghost.homeX;
      ghost.y = ghost.homeY;
      ghost.frightenedUntil = 0;
      playGhostSound();
      updateHud();
      continue;
    }

    game.lives -= 1;
    updateHud();
    playLoseLife();

    if (game.lives <= 0) {
      game.state = "gameover";
      setStatus("Game over. Press Start or Enter to try again.");
      return;
    }

    resetRound();
    setStatus(`You were caught. ${game.lives} lives remaining.`);
    return;
  }
}

function maybeWin() {
  if (game.pellets > 0) {
    return;
  }
  game.state = "won";
  playWin();
  setStatus("You cleared the maze! Press Start or Enter to play again.");
}

function update(now, delta) {
  if (game.state !== "running") {
    return;
  }

  game.playerAccumulator += delta;
  game.ghostAccumulator += delta;

  if (game.playerAccumulator >= 140) {
    game.playerAccumulator = 0;
    handlePlayerStep(now);
    handleCollisions();
    maybeWin();
  }

  if (game.state !== "running") {
    return;
  }

  if (game.ghostAccumulator >= 180) {
    game.ghostAccumulator = 0;
    handleGhosts(now);
    handleCollisions();
  }
}

function drawCell(x, y, cell) {
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;

  if (cell === "#") {
    ctx.fillStyle = "#1538ff";
    ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    ctx.fillStyle = "#7da2ff";
    ctx.fillRect(px + 7, py + 7, TILE_SIZE - 14, TILE_SIZE - 14);
  } else if (cell === ".") {
    ctx.fillStyle = "#ffd86b";
    ctx.beginPath();
    ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (cell === "o") {
    ctx.fillStyle = "#fff7c2";
    ctx.beginPath();
    ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlayer() {
  const centerX = game.player.x * TILE_SIZE + TILE_SIZE / 2;
  const centerY = game.player.y * TILE_SIZE + TILE_SIZE / 2;
  const angleMap = {
    right: 0.2,
    down: 0.7,
    left: 1.2,
    up: 1.7,
  };
  const startAngle = Math.PI * angleMap[game.player.dir];
  const endAngle = Math.PI * (2 - angleMap[game.player.dir]);

  ctx.fillStyle = "#ffd400";
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.arc(centerX, centerY, TILE_SIZE / 2 - 2, startAngle, endAngle);
  ctx.closePath();
  ctx.fill();
}

function drawGhost(ghost) {
  const frightened = ghost.frightenedUntil > performance.now();
  const baseX = ghost.x * TILE_SIZE;
  const baseY = ghost.y * TILE_SIZE;

  ctx.fillStyle = frightened ? "#5770ff" : ghost.color;
  ctx.beginPath();
  ctx.arc(baseX + TILE_SIZE / 2, baseY + TILE_SIZE / 2, TILE_SIZE / 2 - 3, Math.PI, 0);
  ctx.lineTo(baseX + TILE_SIZE - 3, baseY + TILE_SIZE - 4);
  ctx.lineTo(baseX + TILE_SIZE - 8, baseY + TILE_SIZE - 9);
  ctx.lineTo(baseX + TILE_SIZE / 2, baseY + TILE_SIZE - 4);
  ctx.lineTo(baseX + 8, baseY + TILE_SIZE - 9);
  ctx.lineTo(baseX + 3, baseY + TILE_SIZE - 4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(baseX + 9, baseY + 11, 4, 0, Math.PI * 2);
  ctx.arc(baseX + TILE_SIZE - 9, baseY + 11, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = frightened ? "#fff" : "#101010";
  ctx.beginPath();
  ctx.arc(baseX + 10, baseY + 11, 2, 0, Math.PI * 2);
  ctx.arc(baseX + TILE_SIZE - 10, baseY + 11, 2, 0, Math.PI * 2);
  ctx.fill();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#02050f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  game.grid.forEach((row, y) => {
    row.forEach((cell, x) => drawCell(x, y, cell));
  });

  drawPlayer();
  game.ghosts.forEach(drawGhost);

  if (game.state !== "running") {
    ctx.fillStyle = "rgba(3, 6, 17, 0.64)";
    ctx.fillRect(0, canvas.height / 2 - 40, canvas.width, 80);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 26px Arial";
    ctx.textAlign = "center";
    ctx.fillText(
      game.state === "won" ? "YOU WIN" : game.state === "gameover" ? "GAME OVER" : "READY?",
      canvas.width / 2,
      canvas.height / 2 + 8,
    );
  }
}

function loop(timestamp) {
  const delta = timestamp - lastFrame;
  lastFrame = timestamp;
  update(timestamp, delta);
  draw();
  requestAnimationFrame(loop);
}

function setDirectionFromKey(key) {
  const map = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
    a: "left",
    d: "right",
    w: "up",
    s: "down",
  };

  const nextDir = map[key];
  if (nextDir) {
    game.player.nextDir = nextDir;
  }
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    startGame();
  }
  setDirectionFromKey(event.key);
});

startButton.addEventListener("click", startGame);
muteButton.addEventListener("click", () => {
  isMuted = !isMuted;
  muteButton.textContent = isMuted ? "Unmute sounds" : "Mute sounds";
});

game = createGame();
updateHud();
setStatus(game.message);
requestAnimationFrame(loop);
