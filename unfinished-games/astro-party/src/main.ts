/**
 * ASTRO PARTY - Single Player Survival Mode
 *
 * Core mechanics:
 * - Ships can ONLY turn right (clockwise)
 * - Limited to 3 bullets at a time
 * - Screen wrapping on all edges
 * - Pilot ejection when ships are destroyed
 * - Floating asteroids as obstacles
 * - Wave-based survival with AI opponents
 */

// ============= TYPE DEFINITIONS =============

interface Vec2 {
  x: number;
  y: number;
}

interface Entity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
}

interface Ship extends Entity {
  color: string;
  trailColor: string;
  isPlayer: boolean;
  alive: boolean;
  turnRate: number;
  speed: number;
  isTurning: boolean;
  bullets: Bullet[];
  maxBullets: number;
  fireTimer: number;
  fireCooldown: number;
  invulnerableTime: number;
  // AI properties
  aiThinkTimer: number;
  aiWantsTurn: boolean;
  aiWantsFire: boolean;
  aiDifficulty: number;
}

interface Bullet extends Entity {
  lifetime: number;
  ownerId: number;
  color: string;
}

interface Asteroid extends Entity {
  size: number;
  rotationSpeed: number;
  rotation: number;
  vertices: Vec2[];
}

interface Pilot extends Entity {
  lifetime: number;
  fromPlayer: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface Star {
  x: number;
  y: number;
  size: number;
  brightness: number;
  twinkleSpeed: number;
  twinkleOffset: number;
}

// ============= GAME CONSTANTS =============

const SHIP_SPEED = 200;
const SHIP_TURN_RATE = Math.PI; // 180 degrees per second
const BULLET_SPEED = 400;
const BULLET_LIFETIME = 2.0;
const MAX_BULLETS = 3;
const FIRE_COOLDOWN = 0.15;
const PILOT_LIFETIME = 5.0;
const PILOT_SPEED = 30;
const INVULNERABLE_TIME = 2.0;

// ============= GAME STATE =============

type GameState = "menu" | "playing" | "wave_transition" | "gameover";

let gameState: GameState = "menu";
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

// Player
let player: Ship | null = null;
let playerLives = 3;

// Entities
let enemies: Ship[] = [];
let bullets: Bullet[] = [];
let asteroids: Asteroid[] = [];
let pilots: Pilot[] = [];
let particles: Particle[] = [];
let stars: Star[] = [];

// Game stats
let score = 0;
let highScore = 0;
let currentWave = 1;
let enemiesDestroyedTotal = 0;
let pilotsCollectedTotal = 0;
let waveEnemiesRemaining = 0;

// Wave system
let waveTransitionTimer = 0;
const WAVE_TRANSITION_DURATION = 2.5;

// Screen shake
let screenShake = { intensity: 0, duration: 0 };

// Input
const keys: Record<string, boolean> = {};
let mouseDown = false;
const isMobile =
  typeof window !== "undefined" &&
  window.matchMedia("(pointer: coarse)").matches;

// Mobile input
let mobileFirePressed = false;
let mobileTurnPressed = false;

// Entity ID counter
let nextEntityId = 0;

// ============= UTILITY FUNCTIONS =============

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function angleDiff(from: number, to: number): number {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function normalizeAngle(angle: number): number {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function addScreenShake(intensity: number, duration: number): void {
  screenShake.intensity = Math.max(screenShake.intensity, intensity);
  screenShake.duration = Math.max(screenShake.duration, duration);
}

// Screen wrapping helper
function wrapPosition(entity: Entity): void {
  if (entity.x < -entity.radius) entity.x = canvas.width + entity.radius;
  if (entity.x > canvas.width + entity.radius) entity.x = -entity.radius;
  if (entity.y < -entity.radius) entity.y = canvas.height + entity.radius;
  if (entity.y > canvas.height + entity.radius) entity.y = -entity.radius;
}

// Wrapped distance (for screen wrapping)
function wrappedDistance(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const w = canvas.width;
  const h = canvas.height;

  let dx = Math.abs(x2 - x1);
  let dy = Math.abs(y2 - y1);

  if (dx > w / 2) dx = w - dx;
  if (dy > h / 2) dy = h - dy;

  return Math.sqrt(dx * dx + dy * dy);
}

// Get shortest angle to target considering screen wrap
function getAngleToTarget(from: Entity, toX: number, toY: number): number {
  const w = canvas.width;
  const h = canvas.height;

  // Try all 9 possible positions (original + 8 wrapped)
  let bestDx = toX - from.x;
  let bestDy = toY - from.y;
  let bestDist = bestDx * bestDx + bestDy * bestDy;

  for (const ox of [-w, 0, w]) {
    for (const oy of [-h, 0, h]) {
      if (ox === 0 && oy === 0) continue;
      const dx = toX + ox - from.x;
      const dy = toY + oy - from.y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        bestDx = dx;
        bestDy = dy;
      }
    }
  }

  return Math.atan2(bestDy, bestDx);
}

// ============= STAR FIELD =============

function initStars(): void {
  console.log("[initStars] Creating star field");
  stars = [];
  const starCount = Math.floor((canvas.width * canvas.height) / 3000);
  for (let i = 0; i < starCount; i++) {
    stars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: randomRange(0.5, 2),
      brightness: randomRange(0.3, 1),
      twinkleSpeed: randomRange(1, 4),
      twinkleOffset: Math.random() * Math.PI * 2,
    });
  }
}

function drawStars(): void {
  const time = performance.now() / 1000;
  for (const star of stars) {
    const twinkle =
      0.5 + 0.5 * Math.sin(time * star.twinkleSpeed + star.twinkleOffset);
    const alpha = star.brightness * twinkle;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ============= SHIP SYSTEM =============

function createShip(
  x: number,
  y: number,
  angle: number,
  isPlayer: boolean,
  color: string,
  trailColor: string,
  difficulty: number = 1,
): Ship {
  console.log("[createShip] Creating ship at", x, y, "isPlayer:", isPlayer);
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    angle,
    radius: 15,
    color,
    trailColor,
    isPlayer,
    alive: true,
    turnRate: SHIP_TURN_RATE,
    speed: SHIP_SPEED,
    isTurning: false,
    bullets: [],
    maxBullets: MAX_BULLETS,
    fireTimer: 0,
    fireCooldown: FIRE_COOLDOWN,
    invulnerableTime: isPlayer ? INVULNERABLE_TIME : 0,
    aiThinkTimer: 0,
    aiWantsTurn: false,
    aiWantsFire: false,
    aiDifficulty: difficulty,
  };
}

function updateShip(ship: Ship, dt: number): void {
  if (!ship.alive) return;

  // Handle turning (RIGHT ONLY!)
  if (ship.isTurning) {
    ship.angle += ship.turnRate * dt; // Always clockwise
    ship.angle = normalizeAngle(ship.angle);
  }

  // Ships always move forward
  ship.vx = Math.cos(ship.angle) * ship.speed;
  ship.vy = Math.sin(ship.angle) * ship.speed;

  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;

  // Screen wrapping
  wrapPosition(ship);

  // Update fire cooldown
  if (ship.fireTimer > 0) {
    ship.fireTimer -= dt;
  }

  // Update invulnerability
  if (ship.invulnerableTime > 0) {
    ship.invulnerableTime -= dt;
  }

  // Spawn trail particles
  if (Math.random() < 0.5) {
    const trailX = ship.x - Math.cos(ship.angle) * 15;
    const trailY = ship.y - Math.sin(ship.angle) * 15;
    spawnParticle(trailX, trailY, ship.trailColor, "trail");
  }
}

function countActiveBullets(ship: Ship): number {
  return bullets.filter(
    (b) => b.ownerId === (ship.isPlayer ? -1 : nextEntityId),
  ).length;
}

function getShipBulletCount(isPlayer: boolean, shipIndex: number = -1): number {
  const ownerId = isPlayer ? -1 : shipIndex;
  return bullets.filter((b) => b.ownerId === ownerId).length;
}

function fireShipBullet(ship: Ship, ownerId: number): void {
  const bulletCount = bullets.filter((b) => b.ownerId === ownerId).length;
  if (bulletCount >= ship.maxBullets) return;
  if (ship.fireTimer > 0) return;

  ship.fireTimer = ship.fireCooldown;

  const bulletX = ship.x + Math.cos(ship.angle) * 20;
  const bulletY = ship.y + Math.sin(ship.angle) * 20;

  bullets.push({
    x: bulletX,
    y: bulletY,
    vx: Math.cos(ship.angle) * BULLET_SPEED + ship.vx * 0.3,
    vy: Math.sin(ship.angle) * BULLET_SPEED + ship.vy * 0.3,
    angle: ship.angle,
    radius: 4,
    lifetime: BULLET_LIFETIME,
    ownerId,
    color: ship.color,
  });

  // Muzzle flash
  for (let i = 0; i < 3; i++) {
    spawnParticle(bulletX, bulletY, ship.color, "muzzle");
  }
}

function destroyShip(ship: Ship): void {
  if (!ship.alive) return;
  console.log("[destroyShip] Ship destroyed at", ship.x, ship.y);

  ship.alive = false;

  // Spawn explosion particles
  for (let i = 0; i < 20; i++) {
    spawnParticle(ship.x, ship.y, ship.color, "explosion");
  }
  for (let i = 0; i < 10; i++) {
    spawnParticle(ship.x, ship.y, "#ffffff", "explosion");
  }

  // Eject pilot
  const pilotAngle = Math.random() * Math.PI * 2;
  pilots.push({
    x: ship.x,
    y: ship.y,
    vx: Math.cos(pilotAngle) * PILOT_SPEED,
    vy: Math.sin(pilotAngle) * PILOT_SPEED,
    angle: 0,
    radius: 8,
    lifetime: PILOT_LIFETIME,
    fromPlayer: ship.isPlayer,
  });

  addScreenShake(12, 0.4);
}

function drawShip(ship: Ship): void {
  if (!ship.alive) return;

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle + Math.PI / 2);

  // Flash when invulnerable
  if (
    ship.invulnerableTime > 0 &&
    Math.floor(ship.invulnerableTime * 10) % 2 === 0
  ) {
    ctx.globalAlpha = 0.5;
  }

  const s = ship.radius;

  // Engine glow
  ctx.fillStyle = ship.trailColor;
  ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.6;
  ctx.beginPath();
  ctx.moveTo(-s * 0.4, s * 0.8);
  ctx.lineTo(s * 0.4, s * 0.8);
  ctx.lineTo(0, s * 1.5 + Math.random() * s * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = ship.invulnerableTime > 0 ? 0.5 : 1;

  // Ship body - triangular
  ctx.fillStyle = ship.color;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(-s * 0.8, s * 0.7);
  ctx.lineTo(0, s * 0.3);
  ctx.lineTo(s * 0.8, s * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Cockpit
  ctx.fillStyle = "#00ffff";
  ctx.beginPath();
  ctx.arc(0, -s * 0.2, s * 0.25, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ============= AI SYSTEM =============

function updateAI(ship: Ship, dt: number): void {
  if (!ship.alive || ship.isPlayer) return;

  ship.aiThinkTimer -= dt;
  if (ship.aiThinkTimer > 0) return;

  // Think interval based on difficulty (higher = faster reactions)
  ship.aiThinkTimer = lerp(0.2, 0.05, (ship.aiDifficulty - 1) / 5);

  // Find target (player)
  if (!player || !player.alive) {
    ship.aiWantsTurn = Math.random() < 0.3;
    ship.aiWantsFire = false;
    return;
  }

  // Calculate angle to player
  const angleToPlayer = getAngleToTarget(ship, player.x, player.y);
  const currentAngle = normalizeAngle(ship.angle);
  const diff = angleDiff(currentAngle, angleToPlayer);

  // Since we can only turn right, we need to decide if turning is efficient
  // If target is to the right (positive diff), turn
  // If target is to the left (negative diff), we need to turn almost full circle

  // Calculate how far we need to turn right to face target
  let rightTurnAmount = diff;
  if (rightTurnAmount < 0) {
    rightTurnAmount += Math.PI * 2; // Turn the long way around
  }

  // Turn if we're not facing target
  const facingThreshold = lerp(0.3, 0.15, (ship.aiDifficulty - 1) / 5);
  if (Math.abs(diff) > facingThreshold) {
    // Turn right - but add some randomness to avoid perfect tracking
    const turnChance = lerp(0.6, 0.9, (ship.aiDifficulty - 1) / 5);
    ship.aiWantsTurn = Math.random() < turnChance;
  } else {
    ship.aiWantsTurn = Math.random() < 0.1; // Small random turns
  }

  // Evade bullets - check if any bullets are heading toward us
  let evading = false;
  for (const bullet of bullets) {
    if (bullet.ownerId === -1) {
      // Player bullet
      const dist = wrappedDistance(ship.x, ship.y, bullet.x, bullet.y);
      if (dist < 100) {
        // Predict if bullet will hit us
        const bulletAngle = Math.atan2(bullet.vy, bullet.vx);
        const angleToUs = getAngleToTarget(
          { ...bullet, radius: 4 } as Entity,
          ship.x,
          ship.y,
        );
        const bulletDiff = Math.abs(angleDiff(bulletAngle, angleToUs));
        if (bulletDiff < 0.4) {
          // Bullet heading toward us - turn to evade!
          ship.aiWantsTurn = true;
          evading = true;
          break;
        }
      }
    }
  }

  // Fire if facing player and have bullets
  if (!evading && Math.abs(diff) < facingThreshold) {
    const fireChance = lerp(0.3, 0.7, (ship.aiDifficulty - 1) / 5);
    ship.aiWantsFire = Math.random() < fireChance;
  } else {
    ship.aiWantsFire = false;
  }

  // Avoid asteroids
  for (const asteroid of asteroids) {
    const dist = wrappedDistance(ship.x, ship.y, asteroid.x, asteroid.y);
    if (dist < asteroid.size + 80) {
      const angleToAsteroid = getAngleToTarget(ship, asteroid.x, asteroid.y);
      const asteroidDiff = angleDiff(ship.angle, angleToAsteroid);
      // If asteroid is ahead, turn!
      if (Math.abs(asteroidDiff) < Math.PI / 3) {
        ship.aiWantsTurn = true;
      }
    }
  }
}

// ============= BULLET SYSTEM =============

function updateBullets(dt: number): void {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];

    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.lifetime -= dt;

    // Screen wrapping
    wrapPosition(bullet);

    // Remove expired bullets
    if (bullet.lifetime <= 0) {
      bullets.splice(i, 1);
      continue;
    }

    // Check collision with ships
    // Player bullets hit enemies
    if (bullet.ownerId === -1) {
      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        const dist = wrappedDistance(bullet.x, bullet.y, enemy.x, enemy.y);
        if (dist < bullet.radius + enemy.radius) {
          destroyShip(enemy);
          bullets.splice(i, 1);
          score += 100;
          enemiesDestroyedTotal++;
          waveEnemiesRemaining--;
          updateHUD();
          break;
        }
      }
    } else {
      // Enemy bullets hit player
      if (player && player.alive && player.invulnerableTime <= 0) {
        const dist = wrappedDistance(bullet.x, bullet.y, player.x, player.y);
        if (dist < bullet.radius + player.radius) {
          damagePlayer();
          bullets.splice(i, 1);
        }
      }
    }

    // Check collision with asteroids
    for (const asteroid of asteroids) {
      const dist = wrappedDistance(bullet.x, bullet.y, asteroid.x, asteroid.y);
      if (dist < bullet.radius + asteroid.size) {
        // Bullet destroyed by asteroid
        for (let p = 0; p < 5; p++) {
          spawnParticle(bullet.x, bullet.y, bullet.color, "hit");
        }
        bullets.splice(i, 1);
        break;
      }
    }
  }
}

function drawBullets(): void {
  for (const bullet of bullets) {
    ctx.save();
    ctx.translate(bullet.x, bullet.y);
    ctx.rotate(bullet.angle);

    // Glow
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, bullet.radius * 3);
    gradient.addColorStop(0, bullet.color);
    gradient.addColorStop(1, "transparent");
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, bullet.radius * 3, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, 0, bullet.radius * 0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = bullet.color;
    ctx.beginPath();
    ctx.arc(0, 0, bullet.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

// ============= ASTEROID SYSTEM =============

function createAsteroid(
  x: number,
  y: number,
  size: number,
  vx?: number,
  vy?: number,
): Asteroid {
  const vertexCount = Math.floor(randomRange(7, 12));
  const vertices: Vec2[] = [];
  for (let i = 0; i < vertexCount; i++) {
    const angle = (i / vertexCount) * Math.PI * 2;
    const r = size * randomRange(0.7, 1.0);
    vertices.push({
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
    });
  }

  return {
    x,
    y,
    vx: vx ?? randomRange(-20, 20),
    vy: vy ?? randomRange(-20, 20),
    angle: Math.random() * Math.PI * 2,
    radius: size,
    size,
    rotationSpeed: randomRange(-1, 1),
    rotation: 0,
    vertices,
  };
}

function initAsteroids(): void {
  console.log("[initAsteroids] Creating asteroids");
  asteroids = [];
  const count = Math.floor(randomRange(5, 8));

  for (let i = 0; i < count; i++) {
    // Spawn away from center
    let x: number, y: number;
    do {
      x = Math.random() * canvas.width;
      y = Math.random() * canvas.height;
    } while (distance(x, y, canvas.width / 2, canvas.height / 2) < 150);

    const size = randomRange(30, 60);
    asteroids.push(createAsteroid(x, y, size));
  }
}

function updateAsteroids(dt: number): void {
  for (const asteroid of asteroids) {
    asteroid.x += asteroid.vx * dt;
    asteroid.y += asteroid.vy * dt;
    asteroid.rotation += asteroid.rotationSpeed * dt;

    wrapPosition(asteroid);
  }
}

function checkAsteroidCollisions(): void {
  // Player collision
  if (player && player.alive && player.invulnerableTime <= 0) {
    for (const asteroid of asteroids) {
      const dist = wrappedDistance(player.x, player.y, asteroid.x, asteroid.y);
      if (dist < player.radius + asteroid.size * 0.8) {
        damagePlayer();
        break;
      }
    }
  }

  // Enemy collisions
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    for (const asteroid of asteroids) {
      const dist = wrappedDistance(enemy.x, enemy.y, asteroid.x, asteroid.y);
      if (dist < enemy.radius + asteroid.size * 0.8) {
        destroyShip(enemy);
        waveEnemiesRemaining--;
        break;
      }
    }
  }
}

function drawAsteroids(): void {
  for (const asteroid of asteroids) {
    ctx.save();
    ctx.translate(asteroid.x, asteroid.y);
    ctx.rotate(asteroid.rotation);

    // Shadow/depth
    ctx.fillStyle = "#1a1a2e";
    ctx.beginPath();
    ctx.moveTo(asteroid.vertices[0].x + 3, asteroid.vertices[0].y + 3);
    for (let i = 1; i < asteroid.vertices.length; i++) {
      ctx.lineTo(asteroid.vertices[i].x + 3, asteroid.vertices[i].y + 3);
    }
    ctx.closePath();
    ctx.fill();

    // Main body
    const gradient = ctx.createRadialGradient(
      -asteroid.size * 0.3,
      -asteroid.size * 0.3,
      0,
      0,
      0,
      asteroid.size,
    );
    gradient.addColorStop(0, "#6b6b7b");
    gradient.addColorStop(1, "#3a3a4a");
    ctx.fillStyle = gradient;
    ctx.strokeStyle = "#8a8a9a";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(asteroid.vertices[0].x, asteroid.vertices[0].y);
    for (let i = 1; i < asteroid.vertices.length; i++) {
      ctx.lineTo(asteroid.vertices[i].x, asteroid.vertices[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Crater details
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.beginPath();
    ctx.arc(
      asteroid.size * 0.2,
      asteroid.size * 0.1,
      asteroid.size * 0.15,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.beginPath();
    ctx.arc(
      -asteroid.size * 0.25,
      asteroid.size * 0.2,
      asteroid.size * 0.1,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    ctx.restore();
  }
}

// ============= PILOT SYSTEM =============

function updatePilots(dt: number): void {
  for (let i = pilots.length - 1; i >= 0; i--) {
    const pilot = pilots[i];

    pilot.x += pilot.vx * dt;
    pilot.y += pilot.vy * dt;
    pilot.lifetime -= dt;

    // Slow down
    pilot.vx *= 0.99;
    pilot.vy *= 0.99;

    wrapPosition(pilot);

    // Remove expired pilots
    if (pilot.lifetime <= 0) {
      pilots.splice(i, 1);
      continue;
    }

    // Check if player collects enemy pilot
    if (!pilot.fromPlayer && player && player.alive) {
      const dist = wrappedDistance(player.x, player.y, pilot.x, pilot.y);
      if (dist < player.radius + pilot.radius) {
        collectPilot(pilot, i);
        continue;
      }
    }
  }
}

function collectPilot(pilot: Pilot, index: number): void {
  console.log("[collectPilot] Pilot collected!");
  pilots.splice(index, 1);
  score += 250;
  pilotsCollectedTotal++;
  updateHUD();

  // Celebration particles
  for (let i = 0; i < 15; i++) {
    spawnParticle(pilot.x, pilot.y, "#00ff88", "sparkle");
  }
}

function drawPilots(): void {
  for (const pilot of pilots) {
    const flash =
      pilot.lifetime < 1.5 && Math.floor(pilot.lifetime * 5) % 2 === 0;

    ctx.save();
    ctx.translate(pilot.x, pilot.y);

    if (flash) ctx.globalAlpha = 0.5;

    // Parachute
    ctx.fillStyle = pilot.fromPlayer ? "#00f0ff" : "#ff00aa";
    ctx.beginPath();
    ctx.arc(0, -12, 12, Math.PI, Math.PI * 2);
    ctx.fill();

    // Strings
    ctx.strokeStyle = "#888";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-10, -8);
    ctx.lineTo(0, 5);
    ctx.moveTo(10, -8);
    ctx.lineTo(0, 5);
    ctx.moveTo(0, -12);
    ctx.lineTo(0, 5);
    ctx.stroke();

    // Pilot body
    ctx.fillStyle = "#ffcc88";
    ctx.beginPath();
    ctx.arc(0, 8, 5, 0, Math.PI * 2);
    ctx.fill();

    // Helmet
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, 6, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

// ============= PARTICLE SYSTEM =============

function spawnParticle(
  x: number,
  y: number,
  color: string,
  type: string,
): void {
  const angle = Math.random() * Math.PI * 2;
  let speed: number;
  let life: number;
  let size: number;

  switch (type) {
    case "explosion":
      speed = randomRange(80, 200);
      life = randomRange(0.3, 0.6);
      size = randomRange(3, 8);
      break;
    case "trail":
      speed = randomRange(10, 30);
      life = randomRange(0.2, 0.4);
      size = randomRange(2, 4);
      break;
    case "muzzle":
      speed = randomRange(50, 100);
      life = randomRange(0.1, 0.2);
      size = randomRange(2, 5);
      break;
    case "hit":
      speed = randomRange(40, 80);
      life = randomRange(0.2, 0.4);
      size = randomRange(2, 4);
      break;
    case "sparkle":
      speed = randomRange(60, 120);
      life = randomRange(0.3, 0.5);
      size = randomRange(3, 6);
      break;
    default:
      speed = 50;
      life = 0.3;
      size = 3;
  }

  particles.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life,
    maxLife: life,
    size,
    color,
  });
}

function updateParticles(dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.95;
    p.vy *= 0.95;
    p.life -= dt;

    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function drawParticles(): void {
  for (const p of particles) {
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ============= WAVE SYSTEM =============

function startWave(waveNumber: number): void {
  console.log("[startWave] Starting wave", waveNumber);
  currentWave = waveNumber;

  // Calculate enemy count based on wave
  let enemyCount: number;
  if (waveNumber === 1) {
    enemyCount = 1;
  } else if (waveNumber === 2) {
    enemyCount = 2;
  } else {
    enemyCount = Math.min(2 + Math.floor((waveNumber - 2) * 0.5), 5);
  }

  waveEnemiesRemaining = enemyCount;

  // Calculate difficulty (1 to 6)
  const difficulty = Math.min(1 + (waveNumber - 1) * 0.3, 6);

  // Spawn enemies
  enemies = [];
  const colors = ["#ff00aa", "#ff6600", "#aa00ff", "#ff0066", "#ffaa00"];

  for (let i = 0; i < enemyCount; i++) {
    // Spawn at random edge position away from player
    let x: number, y: number;
    let attempts = 0;
    do {
      const edge = Math.floor(Math.random() * 4);
      switch (edge) {
        case 0:
          x = Math.random() * canvas.width;
          y = 50;
          break;
        case 1:
          x = canvas.width - 50;
          y = Math.random() * canvas.height;
          break;
        case 2:
          x = Math.random() * canvas.width;
          y = canvas.height - 50;
          break;
        default:
          x = 50;
          y = Math.random() * canvas.height;
      }
      attempts++;
    } while (
      player &&
      wrappedDistance(x, y, player.x, player.y) < 200 &&
      attempts < 20
    );

    const angle = Math.random() * Math.PI * 2;
    const color = colors[i % colors.length];
    const trailColor = color;

    const enemy = createShip(x, y, angle, false, color, trailColor, difficulty);
    enemies.push(enemy);
  }

  // Show wave announcement
  showWaveAnnouncement(waveNumber);
  updateHUD();
}

function showWaveAnnouncement(wave: number): void {
  const announcement = document.getElementById("waveAnnouncement")!;
  announcement.textContent = "WAVE " + wave;
  announcement.classList.add("show");

  setTimeout(() => {
    announcement.classList.remove("show");
  }, 1500);
}

function checkWaveComplete(): void {
  if (waveEnemiesRemaining <= 0 && pilots.length === 0) {
    // All enemies and pilots cleared
    waveTransitionTimer = WAVE_TRANSITION_DURATION;
    gameState = "wave_transition";
    console.log("[checkWaveComplete] Wave", currentWave, "complete!");
  }
}

// ============= PLAYER SYSTEM =============

function damagePlayer(): void {
  if (!player || player.invulnerableTime > 0) return;

  console.log("[damagePlayer] Player hit! Lives:", playerLives - 1);
  playerLives--;
  player.invulnerableTime = INVULNERABLE_TIME;

  addScreenShake(15, 0.5);

  // Explosion particles
  for (let i = 0; i < 15; i++) {
    spawnParticle(player.x, player.y, "#00f0ff", "explosion");
  }

  if (playerLives <= 0) {
    destroyShip(player);
    gameOver();
  }

  updateLivesDisplay();
}

function respawnPlayer(): void {
  if (!player) return;
  console.log("[respawnPlayer] Respawning player");
  player.x = canvas.width / 2;
  player.y = canvas.height / 2;
  player.angle = -Math.PI / 2;
  player.invulnerableTime = INVULNERABLE_TIME;
  player.alive = true;
}

// ============= HUD =============

function updateHUD(): void {
  document.getElementById("scoreValue")!.textContent = score.toLocaleString();
  document.getElementById("waveValue")!.textContent = currentWave.toString();
  updateAmmoDisplay();
}

function updateLivesDisplay(): void {
  const container = document.getElementById("livesDisplay")!;
  container.innerHTML = "";

  for (let i = 0; i < 3; i++) {
    const icon = document.createElement("div");
    icon.className = "life-icon" + (i >= playerLives ? " lost" : "");
    container.appendChild(icon);
  }
}

function updateAmmoDisplay(): void {
  const container = document.getElementById("ammoDisplay")!;
  const bulletCount = getShipBulletCount(true);

  const bullets_el = container.querySelectorAll(".ammo-bullet");
  bullets_el.forEach((el, i) => {
    if (i < MAX_BULLETS - bulletCount) {
      el.classList.remove("empty");
    } else {
      el.classList.add("empty");
    }
  });
}

// ============= GAME FLOW =============

function resetGame(): void {
  console.log("[resetGame] Resetting game");

  // Reset stats
  score = 0;
  playerLives = 3;
  currentWave = 1;
  enemiesDestroyedTotal = 0;
  pilotsCollectedTotal = 0;

  // Clear entities
  bullets = [];
  enemies = [];
  pilots = [];
  particles = [];

  // Create player
  player = createShip(
    canvas.width / 2,
    canvas.height / 2,
    -Math.PI / 2,
    true,
    "#00f0ff",
    "#00aaff",
  );

  // Reset asteroids
  initAsteroids();
}

function startGame(): void {
  console.log("[startGame] Starting game");

  resetGame();
  gameState = "playing";

  document.getElementById("startScreen")!.classList.add("hidden");
  document.getElementById("gameOverScreen")!.classList.add("hidden");
  document.getElementById("hud")!.style.display = "flex";

  if (isMobile) {
    document.getElementById("mobileControls")!.classList.add("show");
  }

  updateLivesDisplay();
  updateHUD();

  // Start first wave
  startWave(1);
}

function gameOver(): void {
  console.log("[gameOver] Game over! Score:", score);
  gameState = "gameover";

  // Submit score
  if (
    typeof (window as unknown as { submitScore?: (score: number) => void })
      .submitScore === "function"
  ) {
    (window as unknown as { submitScore: (score: number) => void }).submitScore(
      score,
    );
  }

  // Check high score
  const isNewHighScore = score > highScore;
  if (isNewHighScore) {
    highScore = score;
    localStorage.setItem("astroparty_highscore", highScore.toString());
  }

  // Update UI
  document.getElementById("finalScore")!.textContent = score.toLocaleString();
  document.getElementById("wavesSurvived")!.textContent =
    currentWave.toString();
  document.getElementById("enemiesDestroyed")!.textContent =
    enemiesDestroyedTotal.toString();
  document.getElementById("pilotsCollected")!.textContent =
    pilotsCollectedTotal.toString();

  const badge = document.getElementById("highScoreBadge")!;
  if (isNewHighScore) {
    badge.classList.add("show");
  } else {
    badge.classList.remove("show");
  }

  document.getElementById("hud")!.style.display = "none";
  if (isMobile) {
    document.getElementById("mobileControls")!.classList.remove("show");
  }
  document.getElementById("gameOverScreen")!.classList.remove("hidden");
}

// ============= RENDERING =============

function render(): void {
  // Clear
  ctx.fillStyle = "#0a0a12";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Apply screen shake
  ctx.save();
  if (screenShake.duration > 0) {
    const shakeX = (Math.random() - 0.5) * screenShake.intensity;
    const shakeY = (Math.random() - 0.5) * screenShake.intensity;
    ctx.translate(shakeX, shakeY);
  }

  // Draw layers
  drawStars();
  drawAsteroids();
  drawPilots();
  drawBullets();

  // Draw enemies
  for (const enemy of enemies) {
    drawShip(enemy);
  }

  // Draw player
  if (player) {
    drawShip(player);
  }

  drawParticles();

  ctx.restore();
}

// ============= GAME LOOP =============

let lastTime = 0;

function gameLoop(timestamp: number): void {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;

  // Update screen shake
  if (screenShake.duration > 0) {
    screenShake.duration -= dt;
    if (screenShake.duration <= 0) {
      screenShake.intensity = 0;
    }
  }

  if (gameState === "playing" && player) {
    // Player input
    player.isTurning =
      keys["arrowright"] || keys["d"] || mouseDown || mobileTurnPressed;

    const wantsFire = keys[" "] || keys["space"] || mobileFirePressed;
    if (wantsFire) {
      fireShipBullet(player, -1);
    }

    // Update player
    updateShip(player, dt);

    // Update enemies
    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      updateAI(enemy, dt);
      enemy.isTurning = enemy.aiWantsTurn;
      if (enemy.aiWantsFire) {
        fireShipBullet(enemy, i);
      }
      updateShip(enemy, dt);
    }

    // Update systems
    updateBullets(dt);
    updateAsteroids(dt);
    updatePilots(dt);
    updateParticles(dt);
    checkAsteroidCollisions();

    // Check wave completion
    checkWaveComplete();

    // Update ammo display
    updateAmmoDisplay();
  } else if (gameState === "wave_transition" && player) {
    waveTransitionTimer -= dt;

    // Keep updating particles and movement
    updateParticles(dt);
    updateShip(player, dt);
    player.isTurning =
      keys["arrowright"] || keys["d"] || mouseDown || mobileTurnPressed;

    if (waveTransitionTimer <= 0) {
      gameState = "playing";
      startWave(currentWave + 1);
    }
  }

  render();
  requestAnimationFrame(gameLoop);
}

// ============= INPUT HANDLING =============

function setupInput(): void {
  console.log("[setupInput] Setting up input handlers");

  // Keyboard
  window.addEventListener("keydown", (e) => {
    keys[e.key.toLowerCase()] = true;
    // Prevent space from scrolling
    if (e.key === " ") e.preventDefault();
  });

  window.addEventListener("keyup", (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  // Mouse (for desktop turn)
  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0) mouseDown = true;
  });

  canvas.addEventListener("mouseup", () => {
    mouseDown = false;
  });

  canvas.addEventListener("mouseleave", () => {
    mouseDown = false;
  });

  // Buttons
  document.getElementById("startButton")!.onclick = startGame;
  document.getElementById("restartButton")!.onclick = startGame;

  // Mobile controls
  if (isMobile) {
    setupMobileControls();
  }
}

function setupMobileControls(): void {
  console.log("[setupMobileControls] Setting up mobile controls");

  const fireZone = document.getElementById("fireZone")!;
  const turnZone = document.getElementById("turnZone")!;

  // Fire zone
  fireZone.addEventListener("touchstart", (e) => {
    e.preventDefault();
    mobileFirePressed = true;
    fireZone.classList.add("active");
  });

  fireZone.addEventListener("touchend", () => {
    mobileFirePressed = false;
    fireZone.classList.remove("active");
  });

  fireZone.addEventListener("touchcancel", () => {
    mobileFirePressed = false;
    fireZone.classList.remove("active");
  });

  // Turn zone
  turnZone.addEventListener("touchstart", (e) => {
    e.preventDefault();
    mobileTurnPressed = true;
    turnZone.classList.add("active");
  });

  turnZone.addEventListener("touchend", () => {
    mobileTurnPressed = false;
    turnZone.classList.remove("active");
  });

  turnZone.addEventListener("touchcancel", () => {
    mobileTurnPressed = false;
    turnZone.classList.remove("active");
  });
}

// ============= CANVAS SETUP =============

function resizeCanvas(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  console.log("[resizeCanvas] Canvas:", canvas.width, "x", canvas.height);

  // Reinit stars for new size
  if (stars.length > 0) {
    initStars();
  }
}

// ============= INITIALIZATION =============

function init(): void {
  console.log("[init] Initializing Astro Party");

  canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
  ctx = canvas.getContext("2d")!;

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // Load high score
  const savedHighScore = localStorage.getItem("astroparty_highscore");
  if (savedHighScore) {
    highScore = parseInt(savedHighScore, 10);
  }

  initStars();
  setupInput();

  // Start game loop (renders menu background)
  requestAnimationFrame(gameLoop);
}

// Start when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
