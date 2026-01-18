// Bar Bounce - A one-tap physics climbing game using Matter.js
// Bounce a ball upward through numbered levels by rotating bars with a tap

import Matter from "matter-js";

const { Engine, World, Bodies, Body, Events } = Matter;

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface Level {
  number: number;
  bar: Matter.Body;
  y: number; // World Y position (negative = higher)
  xOffset: number; // Horizontal offset from center
}

type GamePhase = "start" | "playing" | "gameOver";

// ============================================================================
// CONSTANTS
// ============================================================================

// Physics
const GRAVITY = 1.4;
const BALL_RADIUS = 18;
const BALL_RESTITUTION = 0.4;
const BALL_FRICTION = 0.05;

// Bar dimensions
const BAR_WIDTH_BASE = 220;
const BAR_WIDTH_MIN = 140;
const BAR_HEIGHT = 16;
const BAR_FRICTION = 0.2;

// Level spacing
const LEVEL_SPACING = 200; // Vertical distance between levels
const MAX_OFFSET_BASE = 80; // Starting horizontal offset range
const MAX_OFFSET_GROWTH = 2; // Additional offset per level

// Rotation
const KICK_ANGLE = Math.PI / 5; // ~36 degrees kick
const KICK_DURATION = 160; // ms the bar stays tilted
const ROTATE_COOLDOWN = 250; // ms between kicks
const PROPULSION_FORCE = -13; // Upward velocity boost

// Camera
const CAMERA_SMOOTHING = 0.08;
const CAMERA_LEAD = 100; // How far ahead of ball to look

// Fail condition
const FAIL_DISTANCE = 600; // How far ball can fall below highest bar before game over

// Walls
const WALL_THICKNESS = 40;

// Visual colors (hand-drawn theme)
const COLORS = {
  sky: "#87CEEB",
  skyGradientTop: "#a8d8ea",
  skyGradientBottom: "#5ba3c0",
  ball: "#e63946",
  ballStroke: "#a11d2a",
  bar: "#1a1a1a",
  barStroke: "#333",
  wall: "#2c3e50",
  number: "#222",
  numberShadow: "rgba(255,255,255,0.4)",
};

// ============================================================================
// GAME STATE
// ============================================================================

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

let engine: Matter.Engine;
let world: Matter.World;

let gamePhase: GamePhase = "start";
let ball: Matter.Body;
let leftWall: Matter.Body;
let rightWall: Matter.Body;

let levels: Level[] = [];
let highestLevelReached = 0;
let highestY = 0; // Highest point ball has reached (most negative Y)

// Camera
let cameraY = 0; // World Y offset for rendering
let targetCameraY = 0;

// Layout
let w = 0;
let h = 0;
let centerX = 0;
let isMobile = false;

// Trail effect
interface TrailPoint {
  x: number;
  y: number;
  age: number;
}
let trail: TrailPoint[] = [];
const TRAIL_MAX_AGE = 300;

// Last contact tracking
let lastBarContactY = 0;

// ============================================================================
// INITIALIZATION
// ============================================================================

function init(): void {
  console.log("[init] Starting Bar Bounce game");

  canvas = document.getElementById("game") as HTMLCanvasElement;
  ctx = canvas.getContext("2d")!;

  isMobile = window.matchMedia("(pointer: coarse)").matches;

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  setupInputHandlers();
  setupUIHandlers();

  // Start render loop (game logic only runs when playing)
  requestAnimationFrame(gameLoop);
}

function resizeCanvas(): void {
  w = window.innerWidth;
  h = window.innerHeight;
  canvas.width = w;
  canvas.height = h;
  centerX = w / 2;

  console.log("[resizeCanvas] Canvas resized to", w, "x", h);
}

function initPhysics(): void {
  console.log("[initPhysics] Creating Matter.js engine");

  engine = Engine.create({
    gravity: { x: 0, y: GRAVITY },
  });
  world = engine.world;

  // Generate initial levels first so we can position ball on level 1
  levels = [];
  generateInitialLevels();
  const firstLevel = levels[0];

  // Create ball on the first level's bar
  const startY = firstLevel.y - BAR_HEIGHT / 2 - BALL_RADIUS - 5;
  ball = Bodies.circle(centerX, startY, BALL_RADIUS, {
    restitution: BALL_RESTITUTION,
    friction: BALL_FRICTION,
    frictionAir: 0.001,
    density: 0.002,
    label: "ball",
  });

  // Create walls (extend very far up and down)
  const wallHeight = 50000;
  leftWall = Bodies.rectangle(
    -WALL_THICKNESS / 2,
    -wallHeight / 2,
    WALL_THICKNESS,
    wallHeight,
    {
      isStatic: true,
      friction: 0.1,
      restitution: 0.5,
      label: "leftWall",
    },
  );

  rightWall = Bodies.rectangle(
    w + WALL_THICKNESS / 2,
    -wallHeight / 2,
    WALL_THICKNESS,
    wallHeight,
    {
      isStatic: true,
      friction: 0.1,
      restitution: 0.5,
      label: "rightWall",
    },
  );

  World.add(world, [ball, leftWall, rightWall]);

  // Set up collision detection for bar contacts
  Events.on(engine, "collisionStart", handleCollision);

  // Initialize camera and tracking
  // Position camera so ball is in the lower-middle of the screen
  cameraY = startY - h * 0.6;
  targetCameraY = cameraY;
  highestY = startY;
  lastBarContactY = firstLevel.y;
  highestLevelReached = 0;

  console.log(
    "[initPhysics] Physics initialized with",
    levels.length,
    "initial levels. Ball starting at level 1.",
  );
}

function handleCollision(event: Matter.IEventCollision<Matter.Engine>): void {
  for (const pair of event.pairs) {
    const labels = [pair.bodyA.label, pair.bodyB.label];

    // Check for ball-bar collision
    if (labels.includes("ball") && labels.some((l) => l.startsWith("bar-"))) {
      const barBody = pair.bodyA.label.startsWith("bar-")
        ? pair.bodyA
        : pair.bodyB;
      const levelNum = parseInt(barBody.label.split("-")[1]);

      // Update highest level
      if (levelNum > highestLevelReached) {
        highestLevelReached = levelNum;
        updateHUD();

        // Success haptic for reaching a new height
        if (typeof (window as any).triggerHaptic === "function") {
          (window as any).triggerHaptic("success");
        }
      } else {
        // Standard hit haptic
        if (typeof (window as any).triggerHaptic === "function") {
          (window as any).triggerHaptic("medium");
        }
      }

      // Track last bar contact position
      lastBarContactY = barBody.position.y;

      console.log("[handleCollision] Ball hit bar", levelNum);
    }
  }
}

// ============================================================================
// LEVEL GENERATION
// ============================================================================

function generateInitialLevels(): void {
  // Generate levels from below screen to above
  const startLevel = 1;
  const numLevels = Math.ceil(h / LEVEL_SPACING) + 5;
  const firstLevelY = h * 0.75; // Start level 1 at 75% of screen height

  for (let i = 0; i < numLevels; i++) {
    const levelNum = startLevel + i;
    const y = firstLevelY - i * LEVEL_SPACING;
    createLevel(levelNum, y);
  }
}

function createLevel(levelNum: number, y: number): Level {
  // Calculate horizontal offset - increases with level
  const maxOffset = MAX_OFFSET_BASE + levelNum * MAX_OFFSET_GROWTH;
  const clampedOffset = Math.min(maxOffset, (w - BAR_WIDTH_MIN) / 2 - 20);

  // Alternate pattern with some randomness
  let xOffset: number;
  if (levelNum <= 3) {
    // First 3 levels are centered (tutorial)
    xOffset = 0;
  } else {
    // Alternate left/right with increasing range
    const direction = levelNum % 2 === 0 ? 1 : -1;
    const randomFactor = 0.5 + Math.random() * 0.5;
    xOffset = direction * clampedOffset * randomFactor;
  }

  // Calculate bar width - decreases slightly with level
  const barWidth = Math.max(BAR_WIDTH_MIN, BAR_WIDTH_BASE - levelNum * 2);

  // Create bar body
  const bar = Bodies.rectangle(centerX + xOffset, y, barWidth, BAR_HEIGHT, {
    isStatic: true,
    friction: BAR_FRICTION,
    restitution: 0.3,
    angle: 0,
    label: "bar-" + levelNum,
    chamfer: { radius: 3 },
  });

  World.add(world, bar);

  const level: Level = {
    number: levelNum,
    bar,
    y,
    xOffset,
  };

  levels.push(level);
  return level;
}

function updateLevels(): void {
  // Get the highest level currently in the array
  const highestLevel =
    levels.length > 0 ? Math.max(...levels.map((l) => l.number)) : 0;

  // Generate new levels above camera view
  const generateThreshold = cameraY - h - LEVEL_SPACING;
  const highestLevelY =
    levels.length > 0 ? Math.min(...levels.map((l) => l.y)) : h / 2;

  while (highestLevelY > generateThreshold) {
    const newLevelNum = highestLevel + 1;
    const newY = highestLevelY - LEVEL_SPACING;
    createLevel(newLevelNum, newY);
    break; // One at a time
  }

  // Remove levels that are far below camera
  const removeThreshold = cameraY + h + LEVEL_SPACING * 2;
  for (let i = levels.length - 1; i >= 0; i--) {
    if (levels[i].y > removeThreshold) {
      World.remove(world, levels[i].bar);
      levels.splice(i, 1);
    }
  }
}

// ============================================================================
// INPUT HANDLING
// ============================================================================

function setupInputHandlers(): void {
  // Use pointerdown to handle both mouse and touch once
  canvas.addEventListener("pointerdown", handleTap);

  // Keyboard for desktop
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && gamePhase === "playing") {
      e.preventDefault();
      rotateBars();
    }
  });
}

function handleTap(e: Event): void {
  // If it's a pointer event, we can check pointerType if needed,
  // but pointerdown handles both touch and mouse safely.
  e.preventDefault();

  if (gamePhase === "start") {
    startGame();
  } else if (gamePhase === "playing") {
    rotateBars();
  }
}

let lastRotateTime = 0;

function rotateBars(): void {
  const now = Date.now();
  if (now - lastRotateTime < ROTATE_COOLDOWN) return;
  lastRotateTime = now;

  // Check if ball is touching any bar
  let touchingBar: Matter.Body | null = null;
  for (const level of levels) {
    if (Matter.Query.collides(ball, [level.bar]).length > 0) {
      touchingBar = level.bar;
      break;
    }
  }

  // Kick bars to angle
  for (const level of levels) {
    // Tilt direction depends on where the bar is relative to center
    // If bar is left, tilt clockwise (right side down)
    // If bar is right, tilt counter-clockwise (left side down)
    const direction = level.xOffset < 0 ? 1 : -1;
    Body.setAngle(level.bar, direction * KICK_ANGLE);
  }

  // If touching, propel the ball
  if (touchingBar) {
    // Apply propulsion boost
    // We combine the current horizontal velocity with a strong upward boost
    const currentVel = ball.velocity;
    Body.setVelocity(ball, {
      x: currentVel.x * 1.2 + (Math.random() - 0.5) * 2,
      y: PROPULSION_FORCE,
    });

    if (typeof (window as any).triggerHaptic === "function") {
      (window as any).triggerHaptic("heavy");
    }

    console.log("[rotateBars] Propelled ball from bar");
  } else {
    if (typeof (window as any).triggerHaptic === "function") {
      (window as any).triggerHaptic("light");
    }
  }

  // Revert bars back immediately after duration
  setTimeout(() => {
    if (gamePhase === "playing") {
      for (const level of levels) {
        Body.setAngle(level.bar, 0);
      }
    }
  }, KICK_DURATION);
}

// ============================================================================
// UI HANDLING
// ============================================================================

function setupUIHandlers(): void {
  const startBtn = document.getElementById("start-btn");
  const restartBtn = document.getElementById("restart-btn");

  if (startBtn) {
    startBtn.addEventListener("click", () => {
      triggerLightHaptic();
      startGame();
    });
  }
  if (restartBtn) {
    restartBtn.addEventListener("click", () => {
      triggerLightHaptic();
      restartGame();
    });
  }
}

function triggerLightHaptic(): void {
  if (typeof (window as any).triggerHaptic === "function") {
    (window as any).triggerHaptic("light");
  }
}

function startGame(): void {
  if (gamePhase === "playing") return;
  console.log("[startGame] Starting game");

  gamePhase = "playing";
  trail = [];

  // Initialize physics
  initPhysics();

  // Give ball initial upward velocity
  Body.setVelocity(ball, { x: 0, y: -8 });

  // Hide start screen, show HUD
  document.getElementById("start-screen")!.classList.add("hidden");
  document.getElementById("hud")!.classList.remove("hidden");

  updateHUD();
}

function restartGame(): void {
  console.log("[restartGame] Restarting game");

  document.getElementById("game-over")!.classList.add("hidden");
  startGame();
}

function endGame(): void {
  console.log("[endGame] Game over at level", highestLevelReached);

  gamePhase = "gameOver";

  // Trigger error haptic on game over
  if (typeof (window as any).triggerHaptic === "function") {
    (window as any).triggerHaptic("error");
  }

  // Submit score
  if (typeof (window as any).submitScore === "function") {
    (window as any).submitScore(highestLevelReached);
  }

  // Update UI
  document.getElementById("hud")!.classList.add("hidden");
  document.getElementById("final-level")!.textContent =
    String(highestLevelReached);

  // Show game over after short delay
  setTimeout(() => {
    document.getElementById("game-over")!.classList.remove("hidden");
  }, 500);

  // Clean up physics
  if (engine) {
    Events.off(engine, "collisionStart", handleCollision);
    World.clear(world, false);
    Engine.clear(engine);
  }
}

function updateHUD(): void {
  const levelDisplay = document.getElementById("level-display");
  if (levelDisplay) {
    levelDisplay.textContent = "Level " + highestLevelReached;
  }
}

// ============================================================================
// GAME LOOP
// ============================================================================

let lastTime = 0;

function gameLoop(currentTime: number): void {
  const deltaTime = lastTime ? Math.min(currentTime - lastTime, 32) : 16;
  lastTime = currentTime;

  if (gamePhase === "playing") {
    update(deltaTime);
  }

  render();
  requestAnimationFrame(gameLoop);
}

function update(dt: number): void {
  // Update physics
  Engine.update(engine, dt);

  // Update camera to follow ball
  updateCamera();

  // Generate/remove levels as needed
  updateLevels();

  // Update trail
  updateTrail(dt);

  // Check fail condition
  checkFailCondition();

  // Track highest point
  if (ball.position.y < highestY) {
    highestY = ball.position.y;
  }
}

function updateCamera(): void {
  // Camera should follow ball upward smoothly
  // Target is slightly above ball position
  const targetY = ball.position.y - h / 3;

  // Only move camera up, never down (or allow slight down movement)
  if (targetY < targetCameraY - 50) {
    targetCameraY = targetY;
  }

  // Smooth camera movement
  cameraY += (targetCameraY - cameraY) * CAMERA_SMOOTHING;
}

function updateTrail(dt: number): void {
  // Add new trail point
  trail.push({
    x: ball.position.x,
    y: ball.position.y,
    age: 0,
  });

  // Update ages and remove old points
  for (let i = trail.length - 1; i >= 0; i--) {
    trail[i].age += dt;
    if (trail[i].age > TRAIL_MAX_AGE) {
      trail.splice(i, 1);
    }
  }

  // Limit trail length
  while (trail.length > 30) {
    trail.shift();
  }
}

function checkFailCondition(): void {
  // Ball has fallen too far below the last bar contact
  const fallDistance = ball.position.y - lastBarContactY;

  if (fallDistance > FAIL_DISTANCE) {
    console.log("[checkFailCondition] Ball fell too far, game over");
    endGame();
  }
}

// ============================================================================
// RENDERING
// ============================================================================

function render(): void {
  // Clear with sky gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, COLORS.skyGradientTop);
  gradient.addColorStop(1, COLORS.skyGradientBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  if (gamePhase === "start") {
    // Just render sky background for start screen
    return;
  }

  // Apply camera transform
  ctx.save();
  ctx.translate(0, -cameraY);

  // Draw walls
  drawWalls();

  // Draw levels (numbers and bars)
  drawLevels();

  // Draw ball trail
  drawTrail();

  // Draw ball
  drawBall();

  ctx.restore();
}

function drawWalls(): void {
  // Draw subtle wall indicators
  ctx.fillStyle = COLORS.wall;

  // Left wall
  ctx.fillRect(-WALL_THICKNESS, cameraY - 100, WALL_THICKNESS + 5, h + 200);

  // Right wall
  ctx.fillRect(w - 5, cameraY - 100, WALL_THICKNESS + 5, h + 200);
}

function drawLevels(): void {
  for (const level of levels) {
    const screenY = level.y - cameraY;

    // Only draw if on screen
    if (screenY < -100 || screenY > h + 100) continue;

    // Draw large level number behind bar
    drawLevelNumber(level);

    // Draw bar
    drawBar(level);
  }
}

function drawLevelNumber(level: Level): void {
  const x = centerX + level.xOffset;
  const y = level.y + 60; // Below the bar

  // Large hand-drawn style number
  ctx.save();
  ctx.font = 'bold 72px "Patrick Hand", cursive';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Shadow
  ctx.fillStyle = COLORS.numberShadow;
  ctx.fillText(String(level.number), x + 3, y + 3);

  // Main text
  ctx.fillStyle = COLORS.number;
  ctx.globalAlpha = 0.3;
  ctx.fillText(String(level.number), x, y);

  ctx.restore();
}

function drawBar(level: Level): void {
  const bar = level.bar;

  ctx.save();
  ctx.translate(bar.position.x, bar.position.y);
  ctx.rotate(bar.angle);

  // Get bar dimensions from vertices
  const width = BAR_WIDTH_BASE - level.number * 2;
  const clampedWidth = Math.max(BAR_WIDTH_MIN, width);

  // Bar shadow
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.roundRect(
    -clampedWidth / 2 + 3,
    -BAR_HEIGHT / 2 + 3,
    clampedWidth,
    BAR_HEIGHT,
    4,
  );
  ctx.fill();

  // Bar fill
  ctx.fillStyle = COLORS.bar;
  ctx.beginPath();
  ctx.roundRect(
    -clampedWidth / 2,
    -BAR_HEIGHT / 2,
    clampedWidth,
    BAR_HEIGHT,
    4,
  );
  ctx.fill();

  // Bar stroke (hand-drawn effect)
  ctx.strokeStyle = COLORS.barStroke;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

function drawTrail(): void {
  if (trail.length < 2) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let i = 1; i < trail.length; i++) {
    const point = trail[i];
    const prevPoint = trail[i - 1];
    const alpha = 1 - point.age / TRAIL_MAX_AGE;
    const width = (1 - point.age / TRAIL_MAX_AGE) * BALL_RADIUS * 0.8;

    ctx.strokeStyle = "rgba(230, 57, 70, " + alpha * 0.5 + ")";
    ctx.lineWidth = width;

    ctx.beginPath();
    ctx.moveTo(prevPoint.x, prevPoint.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawBall(): void {
  ctx.save();
  ctx.translate(ball.position.x, ball.position.y);

  // Ball shadow
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.arc(3, 3, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // Ball fill
  ctx.fillStyle = COLORS.ball;
  ctx.beginPath();
  ctx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // Ball stroke (hand-drawn)
  ctx.strokeStyle = COLORS.ballStroke;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Highlight
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.beginPath();
  ctx.arc(
    -BALL_RADIUS * 0.3,
    -BALL_RADIUS * 0.3,
    BALL_RADIUS * 0.3,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  ctx.restore();
}

// ============================================================================
// START GAME
// ============================================================================

init();
