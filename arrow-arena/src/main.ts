/**
 * ARROW ARENA
 *
 * A Brawlhalla-style 2D physics arena game with floating platforms in the sky.
 * Control circular characters, use bow and arrow weapons to knock opponents
 * off the platforms. Fall off-screen = death!
 *
 * Controls:
 * - A/D: Move left/right
 * - W: Jump (works anytime)
 * - Z (hold): Charge arrow, A/D to rotate aim
 * - Z (release): Fire arrow with accumulated charge
 *
 * Mobile:
 * - D-Pad: Move and jump
 * - Aim area: Touch, hold to charge, drag to aim, release to fire
 */

// ============= CONFIGURATION =============
const CONFIG = {
  // Player
  PLAYER_RADIUS: 20,
  PLAYER_MOVE_SPEED: 1.8,
  PLAYER_JUMP_FORCE: 11,
  PLAYER_MAX_VELOCITY: 6,
  PLAYER_GROUND_FRICTION: 0.96,
  PLAYER_AIR_FRICTION: 0.92,
  PLAYER_BOUNCE: 0.3,

  // Physics
  GRAVITY: 0.4,
  TERMINAL_VELOCITY: 12,

  // Arrow
  ARROW_SPEED: 13,
  ARROW_LENGTH: 25,
  ARROW_WIDTH: 4,
  ARROW_LIFETIME: 3000, // ms
  ARROW_COOLDOWN: 350, // ms - faster shooting
  ARROW_GRAVITY: 0.25, // Gravity applied to arrows
  AIM_ROTATION_SPEED: 2.5, // degrees per frame (slower)

  // Knockback
  KNOCKBACK_FORCE: 16, // Base knockback
  HIT_STUN_DURATION: 120, // ms

  // Charge mechanics
  CHARGE_MIN_TIME: 100, // ms - minimum charge for any shot
  CHARGE_MAX_TIME: 1300, // ms - full charge
  CHARGE_MIN_SPEED_MULT: 0.5, // arrow speed at min charge
  CHARGE_MAX_SPEED_MULT: 1.8, // arrow speed at full charge
  CHARGE_MIN_KNOCKBACK_MULT: 0.6,
  CHARGE_MAX_KNOCKBACK_MULT: 2.0,

  // Mass (affects knockback received)
  PLAYER_MASS: 1.0, // Normal knockback received
  BOT_MASS: 0.6, // Bots get LAUNCHED by player arrows
  MOVEMENT_WHILE_CHARGING: 0.4, // 40% movement speed while charging

  // Sky theme colors
  SKY_TOP: "#1a1a2e",
  SKY_MIDDLE: "#16213e",
  SKY_BOTTOM: "#0f3460",
  CLOUD_COLOR: "rgba(255, 255, 255, 0.08)",
  MOUNTAIN_COLOR: "#1a1a3e",

  // Platform floating island colors
  PLATFORM_GRASS_TOP: "#4ade80",
  PLATFORM_GRASS_DARK: "#22c55e",
  PLATFORM_EARTH: "#92400e",
  PLATFORM_EARTH_DARK: "#78350f",
  PLATFORM_STONE: "#6b7280",

  // AI
  AI_REACTION_TIME: 250, // ms
  AI_AIM_VARIANCE: 12, // degrees
  AI_SHOOT_CHANCE: 0.02, // per frame when aiming
  BOT_RADIUS: 14, // Bots are smaller than player
  BOT_SPAWN_INTERVAL: 9000, // Spawn new bot every 9 seconds

  // Arena constraints
  MAX_ARENA_WIDTH: 500, // Max playable width for consistent gameplay

  // Fall death thresholds
  FALL_DEATH_BOTTOM: 100, // pixels below screen
  FALL_DEATH_SIDES: 80, // pixels off sides

  // Colors
  PLAYER_COLORS: [
    "#f72585", // Player - pink
    "#4cc9f0", // Bot 1 - cyan
    "#7209b7", // Bot 2 - purple
    "#f77f00", // Bot 3 - orange
    "#06d6a0", // Bot 4 - green
    "#ef476f", // Bot 5 - red
    "#ffd166", // Bot 6 - yellow
    "#118ab2", // Bot 7 - blue
  ],

  // Safe areas
  TOP_SAFE_DESKTOP: 45,
  TOP_SAFE_MOBILE: 120,
};

// ============= TYPES =============
type GameState = "START" | "PLAYING" | "GAME_OVER" | "PAUSED";

interface Vector2 {
  x: number;
  y: number;
}

interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  isGrounded: boolean;
  isAiming: boolean;
  aimAngle: number;
  lastShotTime: number;
  hitStunEnd: number;
  isPlayer: boolean;
  isAlive: boolean;
  isFalling: boolean; // True when falling off-screen to death
  chargeStartTime: number; // When Z was pressed (0 if not charging)
  // AI properties
  aiTargetX: number;
  aiTargetPlatformIndex: number; // Which platform AI is trying to reach
  aiLastDecisionTime: number;
  aiWantsToJump: boolean;
  aiWantsToShoot: boolean;
  aiChargeTime: number; // How long AI will charge
}

interface Arrow {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  ownerId: number;
  spawnTime: number;
  isActive: boolean;
  knockbackForce: number; // Scales with charge
}

interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  // Floating island style
  isMainPlatform?: boolean;
  hasLeftEdge?: boolean;
  hasRightEdge?: boolean;
}

// Cloud for parallax background
interface Cloud {
  x: number;
  y: number;
  scale: number;
  speed: number;
  opacity: number;
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

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

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

function normalizeAngle(angle: number): number {
  while (angle < 0) angle += Math.PI * 2;
  while (angle >= Math.PI * 2) angle -= Math.PI * 2;
  return angle;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
}

// ============= GLOBALS =============
const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const gameContainer = document.getElementById("game-container")!;

// UI Elements
const startScreen = document.getElementById("startScreen")!;
const gameOverScreen = document.getElementById("gameOverScreen")!;
const pauseScreen = document.getElementById("pauseScreen")!;
const settingsModal = document.getElementById("settingsModal")!;
const settingsBtn = document.getElementById("settingsBtn")!;
const pauseBtn = document.getElementById("pauseBtn")!;
const hud = document.getElementById("hud")!;
const mobileControls = document.getElementById("mobile-controls")!;
const roundDisplay = document.getElementById("roundDisplay")!;
const killsDisplay = document.getElementById("killsDisplay")!;
const finalScore = document.getElementById("finalScore")!;
const finalRound = document.getElementById("finalRound")!;

// State
let gameState: GameState = "START";
let w = 0;
let h = 0;
const isMobile = window.matchMedia("(pointer: coarse)").matches;

// Game objects
let players: Player[] = [];
let arrows: Arrow[] = [];
let platforms: Platform[] = [];
let particles: Particle[] = [];
let clouds: Cloud[] = [];

// Game progress
let totalKills = 0;
let gameStartTime = 0;
let nextBotSpawnTime = 0;
let botCount = 0;
let currentWave = 1; // Wave number = how many bots spawn each round

// Input state
let keysDown: Set<string> = new Set();
let mobileAiming = false;
let mobileAimAngle = 0;

// Screen shake
let screenShake = 0;

// Settings
let settings: Settings = {
  music: localStorage.getItem("arrowArena_music") !== "false",
  fx: localStorage.getItem("arrowArena_fx") !== "false",
  haptics: localStorage.getItem("arrowArena_haptics") !== "false",
};

// ============= AUDIO =============
let audioContext: AudioContext | null = null;

function initAudio(): void {
  if (!audioContext) {
    audioContext = new AudioContext();
    console.log("[initAudio] Audio context initialized");
  }
}

function playShootSound(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(400, audioContext.currentTime);
  osc.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.1);

  gain.gain.setValueAtTime(0.2, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.1);
}

function playHitSound(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.type = "square";
  osc.frequency.setValueAtTime(150, audioContext.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, audioContext.currentTime + 0.15);

  gain.gain.setValueAtTime(0.3, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);

  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.15);
}

function playDeathSound(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(300, audioContext.currentTime);
  osc.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.4);

  gain.gain.setValueAtTime(0.3, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);

  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.4);
}

function playJumpSound(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.type = "sine";
  osc.frequency.setValueAtTime(300, audioContext.currentTime);
  osc.frequency.exponentialRampToValueAtTime(500, audioContext.currentTime + 0.1);

  gain.gain.setValueAtTime(0.15, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.1);
}

function playWinSound(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
  notes.forEach((freq, i) => {
    const osc = audioContext!.createOscillator();
    const gain = audioContext!.createGain();
    osc.connect(gain);
    gain.connect(audioContext!.destination);

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, audioContext!.currentTime + i * 0.1);

    gain.gain.setValueAtTime(0.2, audioContext!.currentTime + i * 0.1);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext!.currentTime + i * 0.1 + 0.2);

    osc.start(audioContext!.currentTime + i * 0.1);
    osc.stop(audioContext!.currentTime + i * 0.1 + 0.2);
  });
}

function playUIClick(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.type = "sine";
  osc.frequency.setValueAtTime(600, audioContext.currentTime);

  gain.gain.setValueAtTime(0.15, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.05);

  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.05);
}

// ============= HAPTICS =============
function triggerHaptic(type: string): void {
  if (!settings.haptics) return;
  if (typeof (window as any).triggerHaptic === "function") {
    (window as any).triggerHaptic(type);
  }
}

// ============= ARENA SETUP =============
// Arena bounds for constrained gameplay
let arenaLeft = 0;
let arenaRight = 0;
let arenaWidth = 0;

function setupClouds(): void {
  clouds = [];
  // Create layered clouds for parallax effect
  for (let i = 0; i < 8; i++) {
    clouds.push({
      x: Math.random() * w * 1.5,
      y: 50 + Math.random() * h * 0.4,
      scale: 0.5 + Math.random() * 1.0,
      speed: 0.1 + Math.random() * 0.3,
      opacity: 0.03 + Math.random() * 0.06,
    });
  }
}

function setupArena(): void {
  console.log("[setupArena] Setting up Brawlhalla-style floating arena:", w, "x", h);

  platforms = [];

  // Constrain arena width for consistent gameplay
  arenaWidth = Math.min(w, CONFIG.MAX_ARENA_WIDTH);
  arenaLeft = (w - arenaWidth) / 2;
  arenaRight = arenaLeft + arenaWidth;

  const platformHeight = 20;

  // Brawlhalla-style floating platform layout
  // All platforms float in the sky - fall off = death

  // === BOTTOM TIER (Main Battle Area) ===
  const bottomY = h - 120;

  // Main center platform (largest, primary fighting area)
  platforms.push({
    x: arenaLeft + arenaWidth * 0.2,
    y: bottomY,
    width: arenaWidth * 0.6,
    height: platformHeight,
    isMainPlatform: true,
    hasLeftEdge: true,
    hasRightEdge: true,
  });

  // === MIDDLE TIER (Flanking platforms) ===
  const midY = bottomY - 90;

  // Left mid platform
  platforms.push({
    x: arenaLeft + arenaWidth * 0.05,
    y: midY,
    width: arenaWidth * 0.28,
    height: platformHeight,
    hasLeftEdge: true,
    hasRightEdge: true,
  });

  // Right mid platform
  platforms.push({
    x: arenaLeft + arenaWidth * 0.67,
    y: midY,
    width: arenaWidth * 0.28,
    height: platformHeight,
    hasLeftEdge: true,
    hasRightEdge: true,
  });

  // === TOP TIER (High ground) ===
  const topY = midY - 85;

  // Center top platform (smallest, hardest to reach)
  platforms.push({
    x: arenaLeft + arenaWidth * 0.32,
    y: topY,
    width: arenaWidth * 0.36,
    height: platformHeight,
    hasLeftEdge: true,
    hasRightEdge: true,
  });

  // Setup parallax clouds
  setupClouds();

  console.log("[setupArena] Floating arena created with", platforms.length, "platforms");
}

// ============= PLAYER CREATION =============
function createPlayer(x: number, y: number, colorIndex: number, isPlayer: boolean): Player {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    radius: isPlayer ? CONFIG.PLAYER_RADIUS : CONFIG.BOT_RADIUS,
    color: CONFIG.PLAYER_COLORS[colorIndex % CONFIG.PLAYER_COLORS.length],
    isGrounded: false,
    isAiming: false,
    aimAngle: isPlayer ? -Math.PI / 2 : Math.random() * Math.PI * 2,
    lastShotTime: 0,
    hitStunEnd: 0,
    isPlayer,
    isAlive: true,
    isFalling: false,
    chargeStartTime: 0,
    aiTargetX: x,
    aiTargetPlatformIndex: 0,
    aiLastDecisionTime: 0,
    aiWantsToJump: false,
    aiWantsToShoot: false,
    aiChargeTime: 0,
  };
}

function spawnPlayers(): void {
  players = [];
  botCount = 0;

  // Spawn player on the main center platform
  const mainPlatform = platforms[0]; // Main center platform
  const spawnY = mainPlatform.y - CONFIG.PLAYER_RADIUS - 5;
  const centerX = mainPlatform.x + mainPlatform.width / 2;

  players.push(createPlayer(centerX, spawnY, 0, true));

  // Spawn first bot
  spawnNewBot();

  console.log("[spawnPlayers] Spawned player and initial bot on floating platforms");
}

function spawnNewBot(): void {
  // Find the player to spawn near them
  const human = players.find(p => p.isPlayer && p.isAlive);

  let spawnX: number;
  if (human && Math.random() < 0.7) {
    // 70% chance: Spawn near the player (but offset so not right on top)
    const offset = (Math.random() < 0.5 ? -1 : 1) * (80 + Math.random() * 120);
    spawnX = clamp(human.x + offset, arenaLeft + 30, arenaRight - 30);
  } else {
    // 30% chance: Spawn on a random platform
    const randomPlatform = platforms[Math.floor(Math.random() * platforms.length)];
    spawnX = randomPlatform.x + Math.random() * randomPlatform.width;
  }

  const spawnY = -50 - Math.random() * 30; // Above screen

  botCount++;
  const colorIndex = botCount % (CONFIG.PLAYER_COLORS.length - 1) + 1; // Skip player color

  const bot = createPlayer(spawnX, spawnY, colorIndex, false);
  players.push(bot);

  // Spawn warning indicator at top of screen
  spawnSpawnIndicator(spawnX);

  console.log("[spawnNewBot] Bot #" + botCount + " spawning above x=" + spawnX.toFixed(0));
}

// Visual indicator showing where a bot will spawn
function spawnSpawnIndicator(x: number): void {
  // Create downward-pointing particles at top of screen
  for (let i = 0; i < 5; i++) {
    particles.push({
      x: x + (Math.random() - 0.5) * 20,
      y: 20 + Math.random() * 10,
      vx: (Math.random() - 0.5) * 2,
      vy: 3 + Math.random() * 2,
      life: 800,
      maxLife: 800,
      size: 6 + Math.random() * 4,
      color: "#ff6b6b",
    });
  }
}

// ============= PHYSICS =============
function updatePlayerPhysics(player: Player): void {
  if (!player.isAlive) return;

  // Apply gravity
  player.vy += CONFIG.GRAVITY;
  player.vy = Math.min(player.vy, CONFIG.TERMINAL_VELOCITY);

  // Apply friction
  if (player.isGrounded) {
    player.vx *= CONFIG.PLAYER_GROUND_FRICTION;
  } else {
    player.vx *= CONFIG.PLAYER_AIR_FRICTION;
  }

  // Update position
  player.x += player.vx;
  player.y += player.vy;

  // Platform collision
  player.isGrounded = false;

  for (const platform of platforms) {
    // Check if player is colliding with platform
    const closestX = clamp(player.x, platform.x, platform.x + platform.width);
    const closestY = clamp(player.y, platform.y, platform.y + platform.height);
    const distX = player.x - closestX;
    const distY = player.y - closestY;
    const dist = Math.sqrt(distX * distX + distY * distY);

    if (dist < player.radius) {
      // Collision detected - resolve it
      const overlap = player.radius - dist;

      if (dist > 0) {
        const nx = distX / dist;
        const ny = distY / dist;

        player.x += nx * overlap;
        player.y += ny * overlap;

        // If landing on top of platform
        if (ny < -0.5 && player.vy > 0) {
          player.vy = 0;
          player.isGrounded = true;
        } else if (ny > 0.5 && player.vy < 0) {
          // Hit from below
          player.vy = 0;
        } else {
          // Side collision
          player.vx *= -CONFIG.PLAYER_BOUNCE;
        }
      }
    }
  }

  // No invisible walls - players can fall off anywhere
  // Death is handled by checkFallDeath() when they go off-screen
}

// Check if player has fallen off screen (Brawlhalla-style death)
function checkFallDeath(player: Player): boolean {
  // Mark as falling if they're past the actual screen edges
  if (!player.isFalling) {
    if (player.y > h + 20 || player.x < -20 || player.x > w + 20) {
      player.isFalling = true;
    }
  }

  // Create falling trail effect while falling
  if (player.isFalling && Math.random() < 0.5) {
    particles.push({
      x: player.x + (Math.random() - 0.5) * player.radius,
      y: player.y - player.radius,
      vx: (Math.random() - 0.5) * 2,
      vy: -2 - Math.random() * 3,
      life: 300,
      maxLife: 300,
      size: 4 + Math.random() * 4,
      color: player.color,
    });
  }

  // Actually die when WAY off the actual screen (not arena bounds)
  return (
    player.y > h + 150 ||
    player.x < -150 ||
    player.x > w + 150
  );
}

// Player-to-player collision (only player vs bots, bots pass through each other)
function handlePlayerCollisions(): void {
  const human = players.find(p => p.isPlayer && p.isAlive);
  if (!human) return;

  for (let j = 0; j < players.length; j++) {
    const bot = players[j];
    if (bot.isPlayer || !bot.isAlive) continue;

    const dx = bot.x - human.x;
    const dy = bot.y - human.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = human.radius + bot.radius;

    if (dist < minDist && dist > 0) {
      // Collision! Push apart
      const overlap = minDist - dist;
      const nx = dx / dist;
      const ny = dy / dist;

      // Push each away by half the overlap
      const pushX = nx * overlap * 0.5;
      const pushY = ny * overlap * 0.5;

      human.x -= pushX;
      human.y -= pushY;
      bot.x += pushX;
      bot.y += pushY;

      // Bounce off each other
      const relVelX = human.vx - bot.vx;
      const relVelY = human.vy - bot.vy;
      const relVelDotNormal = relVelX * nx + relVelY * ny;

      if (relVelDotNormal > 0) {
        const bounce = 0.4;
        const impulse = relVelDotNormal * bounce;

        human.vx -= impulse * nx;
        human.vy -= impulse * ny;
        bot.vx += impulse * nx;
        bot.vy += impulse * ny;
      }
    }
  }
}

// ============= ARROWS =============
function getChargeLevel(chargeStartTime: number): number {
  if (chargeStartTime === 0) return 0;
  const now = Date.now();
  const chargeTime = now - chargeStartTime;
  // Clamp between 0 and 1 based on charge time
  return clamp((chargeTime - CONFIG.CHARGE_MIN_TIME) / (CONFIG.CHARGE_MAX_TIME - CONFIG.CHARGE_MIN_TIME), 0, 1);
}

function createArrow(player: Player, playerId: number): void {
  const now = Date.now();
  if (now - player.lastShotTime < CONFIG.ARROW_COOLDOWN) return;

  // Calculate charge level (0 to 1)
  const chargeLevel = player.chargeStartTime > 0 ? getChargeLevel(player.chargeStartTime) : 0;

  // Calculate speed and knockback multipliers based on charge
  const speedMult = lerp(CONFIG.CHARGE_MIN_SPEED_MULT, CONFIG.CHARGE_MAX_SPEED_MULT, chargeLevel);
  const knockbackMult = lerp(CONFIG.CHARGE_MIN_KNOCKBACK_MULT, CONFIG.CHARGE_MAX_KNOCKBACK_MULT, chargeLevel);

  const arrowSpeed = CONFIG.ARROW_SPEED * speedMult;
  const knockbackForce = CONFIG.KNOCKBACK_FORCE * knockbackMult;

  player.lastShotTime = now;
  player.chargeStartTime = 0; // Reset charge

  const spawnDist = player.radius + 5;
  const arrow: Arrow = {
    x: player.x + Math.cos(player.aimAngle) * spawnDist,
    y: player.y + Math.sin(player.aimAngle) * spawnDist,
    vx: Math.cos(player.aimAngle) * arrowSpeed,
    vy: Math.sin(player.aimAngle) * arrowSpeed,
    angle: player.aimAngle,
    ownerId: playerId,
    spawnTime: now,
    isActive: true,
    knockbackForce: knockbackForce,
  };

  arrows.push(arrow);
  playShootSound();
  triggerHaptic(chargeLevel > 0.7 ? "medium" : "light");

  console.log("[createArrow] Player", playerId, "fired arrow with charge", (chargeLevel * 100).toFixed(0) + "%");
}

function updateArrows(): void {
  const now = Date.now();

  for (let i = arrows.length - 1; i >= 0; i--) {
    const arrow = arrows[i];

    if (!arrow.isActive) {
      arrows.splice(i, 1);
      continue;
    }

    // Apply gravity to arrow
    arrow.vy += CONFIG.ARROW_GRAVITY;

    // Move arrow
    arrow.x += arrow.vx;
    arrow.y += arrow.vy;

    // Update arrow angle to match trajectory
    arrow.angle = Math.atan2(arrow.vy, arrow.vx);

    // Check lifetime or if fallen way off screen (no invisible walls)
    if (now - arrow.spawnTime > CONFIG.ARROW_LIFETIME ||
        arrow.y > h + 200 ||
        arrow.x < -200 ||
        arrow.x > w + 200 ||
        arrow.y < -200) {
      arrow.isActive = false;
      continue;
    }

    // Check platform collision
    for (const platform of platforms) {
      if (
        arrow.x > platform.x &&
        arrow.x < platform.x + platform.width &&
        arrow.y > platform.y &&
        arrow.y < platform.y + platform.height
      ) {
        arrow.isActive = false;
        spawnParticles(arrow.x, arrow.y, "#fff", 5);
        break;
      }
    }

    if (!arrow.isActive) continue;

    // Check player collision
    for (let j = 0; j < players.length; j++) {
      const player = players[j];
      if (!player.isAlive) continue;
      if (j === arrow.ownerId) continue; // Can't hit yourself

      const dist = distance(arrow.x, arrow.y, player.x, player.y);
      if (dist < player.radius) {
        // Hit!
        arrow.isActive = false;

        // Player arrows are stronger against bots
        const isPlayerArrow = arrow.ownerId === 0;
        const targetMass = player.isPlayer ? CONFIG.PLAYER_MASS : CONFIG.BOT_MASS;
        const damageBonus = isPlayerArrow && !player.isPlayer ? 1.4 : 1.0; // 40% bonus vs bots

        const knockbackAngle = arrow.angle;
        const effectiveKnockback = (arrow.knockbackForce * damageBonus) / targetMass;
        player.vx += Math.cos(knockbackAngle) * effectiveKnockback;
        player.vy += Math.sin(knockbackAngle) * effectiveKnockback;
        player.hitStunEnd = now + CONFIG.HIT_STUN_DURATION;
        player.isGrounded = false;

        // Effects - stronger feedback for charged shots
        playHitSound();
        const isStrongHit = arrow.knockbackForce > CONFIG.KNOCKBACK_FORCE;
        triggerHaptic(isStrongHit ? "heavy" : "medium");
        screenShake = isStrongHit ? 10 : 6;
        spawnParticles(arrow.x, arrow.y, player.color, isStrongHit ? 20 : 12);

        console.log("[updateArrows] Hit! Force:", effectiveKnockback.toFixed(1));
        break;
      }
    }
  }
}

// ============= AI =============

// Get which platform a player is standing on (or null if in air)
function getStandingPlatform(p: Player): Platform | null {
  if (!p.isGrounded) return null;
  for (const plat of platforms) {
    if (p.x >= plat.x - 5 && p.x <= plat.x + plat.width + 5 &&
        p.y >= plat.y - p.radius - 10 && p.y <= plat.y + 5) {
      return plat;
    }
  }
  return null;
}

// Find a platform that's below the given position
function findPlatformBelow(x: number, y: number): Platform | null {
  let best: Platform | null = null;
  let bestDist = Infinity;
  for (const plat of platforms) {
    if (plat.y > y && x >= plat.x - 30 && x <= plat.x + plat.width + 30) {
      const dist = plat.y - y;
      if (dist < bestDist) {
        bestDist = dist;
        best = plat;
      }
    }
  }
  return best;
}

// AI with platform navigation
function updateAI(player: Player, playerIndex: number): void {
  if (!player.isAlive || player.isPlayer || player.isFalling) return;

  const now = Date.now();
  const target = players.find(p => p.isPlayer && p.isAlive);
  if (!target) return;
  if (now < player.hitStunEnd) return;

  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  const myPlatform = getStandingPlatform(player);
  const targetPlatform = getStandingPlatform(target);

  // Make decisions
  if (now - player.aiLastDecisionTime > 150 + Math.random() * 150) {
    player.aiLastDecisionTime = now;

    // Default: move toward player
    const spread = ((playerIndex * 31) % 5 - 2) * 25;
    player.aiTargetX = target.x + spread;
    player.aiWantsToJump = false;

    if (myPlatform) {
      // I'm on a platform
      const safeLeft = myPlatform.x + 20;
      const safeRight = myPlatform.x + myPlatform.width - 20;

      if (targetPlatform && targetPlatform !== myPlatform) {
        // Target is on a DIFFERENT platform
        if (targetPlatform.y < myPlatform.y - 30) {
          // Target platform is ABOVE - jump toward it
          player.aiTargetX = clamp(target.x, safeLeft - 30, safeRight + 30);
          player.aiWantsToJump = true;
        } else if (targetPlatform.y > myPlatform.y + 30) {
          // Target platform is BELOW - walk off edge toward target
          if (target.x < player.x) {
            player.aiTargetX = myPlatform.x - 15;
          } else {
            player.aiTargetX = myPlatform.x + myPlatform.width + 15;
          }
        }
      } else if (!targetPlatform && target.y > player.y + 50) {
        // Target is below (in air or falling) - check if safe to follow
        const platBelow = findPlatformBelow(target.x, player.y);
        if (platBelow) {
          // There's a platform below - drop toward target
          if (target.x < player.x) {
            player.aiTargetX = myPlatform.x - 15;
          } else {
            player.aiTargetX = myPlatform.x + myPlatform.width + 15;
          }
        } else {
          // No platform below - stay safe, just shoot
          player.aiTargetX = clamp(target.x, safeLeft, safeRight);
        }
      } else if (target.y < player.y - 30) {
        // Target is above (in air) - jump toward them
        player.aiTargetX = clamp(target.x, safeLeft - 20, safeRight + 20);
        player.aiWantsToJump = true;
      } else {
        // Same level - chase but stay safe
        player.aiTargetX = clamp(target.x + spread, safeLeft, safeRight);
        if (Math.random() < 0.05) player.aiWantsToJump = true;
      }
    } else {
      // In the air - just move toward target
      player.aiTargetX = target.x;
    }

    // Shooting
    if (dist < 300 && player.chargeStartTime === 0 && Math.random() < 0.2) {
      player.chargeStartTime = now;
      player.aiChargeTime = 250 + Math.random() * 450;
      player.isAiming = true;
    }

    // Aim
    player.aimAngle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.2;
  }

  // Execute movement
  const moveDx = player.aiTargetX - player.x;
  if (Math.abs(moveDx) > 8) {
    const speed = player.chargeStartTime > 0 ? 0.25 : 0.4;
    player.vx += Math.sign(moveDx) * CONFIG.PLAYER_MOVE_SPEED * speed;
  }

  // Execute jump
  if (player.aiWantsToJump && player.isGrounded) {
    player.vy = -CONFIG.PLAYER_JUMP_FORCE;
    player.isGrounded = false;
    player.aiWantsToJump = false;
  }

  // Execute shoot
  if (player.chargeStartTime > 0 && now - player.chargeStartTime >= player.aiChargeTime) {
    createArrow(player, playerIndex);
    player.chargeStartTime = 0;
    player.isAiming = false;
  }
}

// ============= PARTICLES =============
function spawnParticles(x: number, y: number, color: string, count: number): void {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const speed = 2 + Math.random() * 5;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 500,
      maxLife: 500,
      size: 3 + Math.random() * 4,
      color,
    });
  }
}

function updateParticles(dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.2; // Gravity
    p.life -= dt;

    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

// ============= INPUT HANDLING =============
function handlePlayerInput(): void {
  const player = players.find(p => p.isPlayer && p.isAlive);
  if (!player) return;

  const now = Date.now();
  if (now < player.hitStunEnd) return; // In hit stun

  // Check if charging (Z key held or mobile aim)
  const isCharging = keysDown.has("z") || keysDown.has("Z") || mobileAiming;
  player.isAiming = isCharging;

  // Start charging if Z just pressed
  if (isCharging && player.chargeStartTime === 0) {
    player.chargeStartTime = now;
  }

  if (isCharging) {
    // WHILE CHARGING: Can only jump and rotate aim - NO movement
    // Aim rotation with A/D or arrow keys
    if (keysDown.has("a") || keysDown.has("A") || keysDown.has("ArrowLeft")) {
      player.aimAngle -= CONFIG.AIM_ROTATION_SPEED * (Math.PI / 180);
    }
    if (keysDown.has("d") || keysDown.has("D") || keysDown.has("ArrowRight")) {
      player.aimAngle += CONFIG.AIM_ROTATION_SPEED * (Math.PI / 180);
    }

    // Use mobile aim angle if mobile aiming
    if (mobileAiming) {
      player.aimAngle = mobileAimAngle;
    }

    player.aimAngle = normalizeAngle(player.aimAngle);
  } else {
    // NOT CHARGING: Can move with A/D
    if (keysDown.has("a") || keysDown.has("A") || keysDown.has("ArrowLeft")) {
      player.vx -= CONFIG.PLAYER_MOVE_SPEED * 0.4;
    }
    if (keysDown.has("d") || keysDown.has("D") || keysDown.has("ArrowRight")) {
      player.vx += CONFIG.PLAYER_MOVE_SPEED * 0.4;
    }
  }

  // Clamp velocity
  player.vx = clamp(player.vx, -CONFIG.PLAYER_MAX_VELOCITY, CONFIG.PLAYER_MAX_VELOCITY);

  // Jump (can jump anytime, including while charging)
  if ((keysDown.has("w") || keysDown.has("W")) && player.isGrounded) {
    player.vy = -CONFIG.PLAYER_JUMP_FORCE;
    player.isGrounded = false;
    playJumpSound();
    triggerHaptic("light");
  }
}

// ============= DRAWING =============
function drawBackground(): void {
  // Deep sky gradient (night/dusk theme)
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, CONFIG.SKY_TOP);
  gradient.addColorStop(0.5, CONFIG.SKY_MIDDLE);
  gradient.addColorStop(1, CONFIG.SKY_BOTTOM);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  // Stars (subtle)
  ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
  for (let i = 0; i < 30; i++) {
    const starX = (i * 73 + 17) % w;
    const starY = (i * 41 + 13) % (h * 0.4);
    const starSize = (i % 3) + 1;
    ctx.beginPath();
    ctx.arc(starX, starY, starSize, 0, Math.PI * 2);
    ctx.fill();
  }

  // Distant mountains silhouette
  ctx.fillStyle = CONFIG.MOUNTAIN_COLOR;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h * 0.75);
  ctx.lineTo(w * 0.1, h * 0.65);
  ctx.lineTo(w * 0.2, h * 0.72);
  ctx.lineTo(w * 0.35, h * 0.58);
  ctx.lineTo(w * 0.45, h * 0.68);
  ctx.lineTo(w * 0.55, h * 0.62);
  ctx.lineTo(w * 0.7, h * 0.7);
  ctx.lineTo(w * 0.85, h * 0.6);
  ctx.lineTo(w * 0.95, h * 0.72);
  ctx.lineTo(w, h * 0.65);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();

  // Animated clouds (parallax layers)
  const time = Date.now();
  for (const cloud of clouds) {
    // Update cloud position
    cloud.x -= cloud.speed;
    if (cloud.x + 150 * cloud.scale < 0) {
      cloud.x = w + 100;
    }

    // Draw cloud
    ctx.fillStyle = `rgba(255, 255, 255, ${cloud.opacity})`;
    drawCloud(cloud.x, cloud.y, cloud.scale);
  }

  // Additional moving cloud layer (faster, lower)
  ctx.fillStyle = CONFIG.CLOUD_COLOR;
  for (let i = 0; i < 4; i++) {
    const x = ((i * w / 3 + time * 0.015) % (w + 300)) - 150;
    const y = h * 0.5 + i * 40;
    drawCloud(x, y, 0.8 + (i % 2) * 0.3);
  }
}

function drawCloud(x: number, y: number, scale: number): void {
  ctx.beginPath();
  ctx.arc(x, y, 35 * scale, 0, Math.PI * 2);
  ctx.arc(x + 30 * scale, y - 15 * scale, 28 * scale, 0, Math.PI * 2);
  ctx.arc(x + 55 * scale, y - 5 * scale, 32 * scale, 0, Math.PI * 2);
  ctx.arc(x + 85 * scale, y, 25 * scale, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlatforms(): void {
  for (const platform of platforms) {
    const x = platform.x;
    const y = platform.y;
    const width = platform.width;
    const height = platform.height;
    const depth = 25; // Visual depth of floating island

    // Shadow below platform
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.beginPath();
    ctx.ellipse(x + width / 2, y + height + depth + 15, width * 0.4, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Earth/dirt underside (floating island depth)
    const earthGradient = ctx.createLinearGradient(x, y + height, x, y + height + depth);
    earthGradient.addColorStop(0, CONFIG.PLATFORM_EARTH);
    earthGradient.addColorStop(1, CONFIG.PLATFORM_EARTH_DARK);
    ctx.fillStyle = earthGradient;

    // Draw rounded bottom of floating island
    ctx.beginPath();
    ctx.moveTo(x + 5, y + height);
    ctx.lineTo(x + width - 5, y + height);
    ctx.quadraticCurveTo(x + width + 5, y + height + depth * 0.5, x + width * 0.7, y + height + depth);
    ctx.quadraticCurveTo(x + width * 0.5, y + height + depth + 8, x + width * 0.3, y + height + depth);
    ctx.quadraticCurveTo(x - 5, y + height + depth * 0.5, x + 5, y + height);
    ctx.fill();

    // Stone/rock patches on underside
    ctx.fillStyle = CONFIG.PLATFORM_STONE;
    ctx.beginPath();
    ctx.arc(x + width * 0.3, y + height + depth * 0.6, 8, 0, Math.PI * 2);
    ctx.arc(x + width * 0.6, y + height + depth * 0.4, 6, 0, Math.PI * 2);
    ctx.fill();

    // Main platform top (grass)
    const grassGradient = ctx.createLinearGradient(x, y, x, y + height);
    grassGradient.addColorStop(0, CONFIG.PLATFORM_GRASS_TOP);
    grassGradient.addColorStop(1, CONFIG.PLATFORM_GRASS_DARK);
    ctx.fillStyle = grassGradient;

    // Rounded rectangle for platform top
    const radius = 6;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();

    // Grass highlight on top
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fillRect(x + 2, y + 2, width - 4, 4);

    // Grass tufts on top
    ctx.fillStyle = CONFIG.PLATFORM_GRASS_TOP;
    const tufts = Math.floor(width / 25);
    for (let i = 0; i < tufts; i++) {
      const tx = x + 15 + i * 25 + (i % 2) * 8;
      const tHeight = 6 + (i % 3) * 3;
      ctx.beginPath();
      ctx.moveTo(tx - 3, y);
      ctx.lineTo(tx, y - tHeight);
      ctx.lineTo(tx + 3, y);
      ctx.fill();
    }

    // Small decorative rocks
    if (platform.isMainPlatform) {
      ctx.fillStyle = "#9ca3af";
      ctx.beginPath();
      ctx.arc(x + 20, y - 2, 4, 0, Math.PI * 2);
      ctx.arc(x + width - 25, y - 2, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Platform outline
    ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.stroke();
  }
}

function drawPlayer(player: Player, _index: number): void {
  if (!player.isAlive) return;

  ctx.save();
  ctx.translate(player.x, player.y);

  // Falling effect - spin and fade when falling to death
  if (player.isFalling) {
    const spinAmount = (Date.now() % 1000) / 1000 * Math.PI * 4;
    ctx.rotate(spinAmount);
    ctx.globalAlpha = 0.6;
  }

  // Shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
  ctx.beginPath();
  ctx.ellipse(4, player.radius - 5, player.radius * 0.8, player.radius * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Glow effect
  const glowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, player.radius * 1.5);
  glowGradient.addColorStop(0, hexToRgba(player.color, 0.3));
  glowGradient.addColorStop(1, hexToRgba(player.color, 0));
  ctx.fillStyle = glowGradient;
  ctx.beginPath();
  ctx.arc(0, 0, player.radius * 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Main body
  ctx.fillStyle = player.color;
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Inner highlight
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.beginPath();
  ctx.arc(-player.radius * 0.3, -player.radius * 0.3, player.radius * 0.4, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  const eyeOffset = player.radius * 0.25;
  const eyeRadius = player.radius * 0.15;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(-eyeOffset, -eyeOffset * 0.5, eyeRadius, 0, Math.PI * 2);
  ctx.arc(eyeOffset, -eyeOffset * 0.5, eyeRadius, 0, Math.PI * 2);
  ctx.fill();

  // Pupils - look in aim direction if aiming
  const pupilOffset = player.isAiming ? 2 : 0;
  const pupilX = Math.cos(player.aimAngle) * pupilOffset;
  const pupilY = Math.sin(player.aimAngle) * pupilOffset;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(-eyeOffset + pupilX, -eyeOffset * 0.5 + pupilY, eyeRadius * 0.5, 0, Math.PI * 2);
  ctx.arc(eyeOffset + pupilX, -eyeOffset * 0.5 + pupilY, eyeRadius * 0.5, 0, Math.PI * 2);
  ctx.fill();

  // Draw aim indicator if aiming/charging
  if (player.isAiming && player.chargeStartTime > 0) {
    const chargeLevel = getChargeLevel(player.chargeStartTime);

    // Aim length grows with charge
    const baseAimLength = 40;
    const maxAimLength = 80;
    const aimLength = baseAimLength + (maxAimLength - baseAimLength) * chargeLevel;

    const aimStartX = Math.cos(player.aimAngle) * player.radius;
    const aimStartY = Math.sin(player.aimAngle) * player.radius;
    const aimEndX = Math.cos(player.aimAngle) * (player.radius + aimLength);
    const aimEndY = Math.sin(player.aimAngle) * (player.radius + aimLength);

    // Color changes from white to yellow to red with charge
    let aimColor: string;
    if (chargeLevel < 0.5) {
      aimColor = `rgba(255, 255, ${255 - chargeLevel * 200}, 0.9)`;
    } else {
      aimColor = `rgba(255, ${255 - (chargeLevel - 0.5) * 300}, 50, 0.9)`;
    }

    // Aim line - thickness grows with charge
    ctx.strokeStyle = aimColor;
    ctx.lineWidth = 3 + chargeLevel * 4;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(aimStartX, aimStartY);
    ctx.lineTo(aimEndX, aimEndY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrow head - size grows with charge
    const arrowSize = 10 + chargeLevel * 8;
    const arrowAngle = player.aimAngle;
    ctx.fillStyle = aimColor;
    ctx.beginPath();
    ctx.moveTo(aimEndX, aimEndY);
    ctx.lineTo(
      aimEndX - Math.cos(arrowAngle - 0.4) * arrowSize,
      aimEndY - Math.sin(arrowAngle - 0.4) * arrowSize
    );
    ctx.lineTo(
      aimEndX - Math.cos(arrowAngle + 0.4) * arrowSize,
      aimEndY - Math.sin(arrowAngle + 0.4) * arrowSize
    );
    ctx.closePath();
    ctx.fill();

    // Charge bar around player
    if (chargeLevel > 0) {
      ctx.strokeStyle = aimColor;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, player.radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * chargeLevel);
      ctx.stroke();
    }
  }

  // Player indicator (only for human player)
  if (player.isPlayer) {
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px Fredoka";
    ctx.textAlign = "center";
    ctx.fillText("YOU", 0, -player.radius - 10);
  }

  ctx.restore();
}

function drawArrows(): void {
  for (const arrow of arrows) {
    if (!arrow.isActive) continue;

    ctx.save();
    ctx.translate(arrow.x, arrow.y);
    ctx.rotate(arrow.angle);

    // Arrow shaft
    ctx.fillStyle = "#8b4513";
    ctx.fillRect(-CONFIG.ARROW_LENGTH / 2, -CONFIG.ARROW_WIDTH / 2, CONFIG.ARROW_LENGTH, CONFIG.ARROW_WIDTH);

    // Arrow head
    ctx.fillStyle = "#666";
    ctx.beginPath();
    ctx.moveTo(CONFIG.ARROW_LENGTH / 2 + 10, 0);
    ctx.lineTo(CONFIG.ARROW_LENGTH / 2, -6);
    ctx.lineTo(CONFIG.ARROW_LENGTH / 2, 6);
    ctx.closePath();
    ctx.fill();

    // Fletching
    ctx.fillStyle = "#c00";
    ctx.beginPath();
    ctx.moveTo(-CONFIG.ARROW_LENGTH / 2, 0);
    ctx.lineTo(-CONFIG.ARROW_LENGTH / 2 - 8, -5);
    ctx.lineTo(-CONFIG.ARROW_LENGTH / 2 - 5, 0);
    ctx.lineTo(-CONFIG.ARROW_LENGTH / 2 - 8, 5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}

function drawParticles(): void {
  for (const p of particles) {
    const alpha = p.life / p.maxLife;
    ctx.fillStyle = hexToRgba(p.color, alpha);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ============= GAME STATE =============
function resetGame(): void {
  console.log("[resetGame] Resetting game");
  totalKills = 0;
  botCount = 0;
  currentWave = 1;
  gameStartTime = Date.now();
  nextBotSpawnTime = gameStartTime + CONFIG.BOT_SPAWN_INTERVAL;

  arrows = [];
  particles = [];
  screenShake = 0;

  setupArena();
  spawnPlayers();

  updateHUD();
}

function updateHUD(): void {
  // Show survival time
  const survivalTime = Math.floor((Date.now() - gameStartTime) / 1000);
  roundDisplay.textContent = survivalTime + "s";
  killsDisplay.textContent = totalKills.toString();
}

function getCountdownToNextBot(): number {
  const now = Date.now();
  return Math.max(0, Math.ceil((nextBotSpawnTime - now) / 1000));
}

function checkGameState(): void {
  const now = Date.now();
  const humanAlive = players.some(p => p.isPlayer && p.isAlive);

  // Check deaths (falling off screen)
  for (const player of players) {
    if (!player.isAlive) continue;

    if (checkFallDeath(player)) {
      player.isAlive = false;
      playDeathSound();
      triggerHaptic("heavy");
      screenShake = 12;

      // Spawn death particles at the edge where they fell off
      let deathX = clamp(player.x, 20, w - 20);
      let deathY = clamp(player.y, 20, h - 20);
      spawnParticles(deathX, deathY, player.color, 25);

      if (!player.isPlayer) {
        totalKills++;
      }

      console.log("[checkGameState] Player fell to death:", player.isPlayer ? "HUMAN" : "BOT");
    }
  }

  // Check game over
  if (!humanAlive) {
    gameOver();
    return;
  }

  // Spawn new wave - top up bots to match wave number
  if (now >= nextBotSpawnTime) {
    currentWave++;
    const aliveBots = players.filter(p => !p.isPlayer && p.isAlive).length;
    const botsToSpawn = Math.max(0, currentWave - aliveBots);
    for (let i = 0; i < botsToSpawn; i++) {
      spawnNewBot();
    }
    nextBotSpawnTime = now + CONFIG.BOT_SPAWN_INTERVAL;
    playWinSound(); // Alert sound for new wave
  }

  // Update HUD
  updateHUD();
}

function gameOver(): void {
  const survivalTime = Math.floor((Date.now() - gameStartTime) / 1000);
  console.log("[gameOver] Game over after", survivalTime, "s with", totalKills, "kills");
  gameState = "GAME_OVER";

  // Submit score
  if (typeof (window as any).submitScore === "function") {
    (window as any).submitScore(totalKills);
    console.log("[gameOver] Score submitted:", totalKills);
  }

  triggerHaptic("error");

  // Update UI
  finalScore.textContent = totalKills.toString();
  finalRound.textContent = "Wave " + currentWave + " | " + survivalTime + "s";

  // Hide gameplay UI
  hud.classList.add("hidden");
  mobileControls.classList.add("hidden");
  settingsBtn.classList.add("hidden");
  pauseBtn.classList.add("hidden");

  // Show game over screen
  gameOverScreen.classList.remove("hidden");
}

function startGame(): void {
  console.log("[startGame] Starting game");
  gameState = "PLAYING";
  initAudio();
  resetGame();

  // Show gameplay UI
  startScreen.classList.add("hidden");
  gameOverScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  hud.classList.remove("hidden");
  settingsBtn.classList.remove("hidden");
  pauseBtn.classList.remove("hidden");
  if (isMobile) {
    mobileControls.classList.remove("hidden");
  }

  playUIClick();
  triggerHaptic("light");
}

function pauseGame(): void {
  if (gameState !== "PLAYING") return;
  console.log("[pauseGame] Game paused");
  gameState = "PAUSED";
  pauseScreen.classList.remove("hidden");
  triggerHaptic("light");
}

function resumeGame(): void {
  if (gameState !== "PAUSED") return;
  console.log("[resumeGame] Game resumed");
  gameState = "PLAYING";
  pauseScreen.classList.add("hidden");
  triggerHaptic("light");
}

function showStartScreen(): void {
  console.log("[showStartScreen] Showing start screen");
  gameState = "START";

  startScreen.classList.remove("hidden");
  gameOverScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  hud.classList.add("hidden");
  mobileControls.classList.add("hidden");
  settingsBtn.classList.add("hidden");
  pauseBtn.classList.add("hidden");
}

// ============= INPUT SETUP =============
function setupInputHandlers(): void {
  // Keyboard
  window.addEventListener("keydown", (e) => {
    keysDown.add(e.key);

    if (e.key === "Escape") {
      if (gameState === "PLAYING") pauseGame();
      else if (gameState === "PAUSED") resumeGame();
    }

    if (e.key === " " && gameState === "START") {
      startGame();
    }
  });

  window.addEventListener("keyup", (e) => {
    keysDown.delete(e.key);

    // Fire arrow on Z release (if was charging)
    if ((e.key === "z" || e.key === "Z") && gameState === "PLAYING") {
      const player = players.find(p => p.isPlayer && p.isAlive);
      if (player && player.chargeStartTime > 0) {
        createArrow(player, 0);
        player.chargeStartTime = 0; // Reset charge
        player.isAiming = false;
      }
    }
  });

  // UI Buttons
  document.getElementById("startButton")!.addEventListener("click", () => {
    startGame();
  });

  settingsBtn.addEventListener("click", () => {
    settingsModal.classList.remove("hidden");
    playUIClick();
    triggerHaptic("light");
  });

  document.getElementById("settingsClose")!.addEventListener("click", () => {
    settingsModal.classList.add("hidden");
    playUIClick();
    triggerHaptic("light");
  });

  pauseBtn.addEventListener("click", pauseGame);
  document.getElementById("resumeButton")!.addEventListener("click", resumeGame);
  document.getElementById("pauseRestartButton")!.addEventListener("click", () => {
    pauseScreen.classList.add("hidden");
    startGame();
  });
  document.getElementById("pauseMenuButton")!.addEventListener("click", showStartScreen);

  document.getElementById("restartButton")!.addEventListener("click", startGame);
  document.getElementById("backToStartButton")!.addEventListener("click", showStartScreen);

  // Settings toggles
  const musicToggle = document.getElementById("musicToggle")!;
  const fxToggle = document.getElementById("fxToggle")!;
  const hapticToggle = document.getElementById("hapticToggle")!;

  musicToggle.classList.toggle("active", settings.music);
  fxToggle.classList.toggle("active", settings.fx);
  hapticToggle.classList.toggle("active", settings.haptics);

  musicToggle.addEventListener("click", () => {
    settings.music = !settings.music;
    musicToggle.classList.toggle("active", settings.music);
    localStorage.setItem("arrowArena_music", settings.music.toString());
    playUIClick();
    triggerHaptic("light");
  });

  fxToggle.addEventListener("click", () => {
    settings.fx = !settings.fx;
    fxToggle.classList.toggle("active", settings.fx);
    localStorage.setItem("arrowArena_fx", settings.fx.toString());
    if (settings.fx) playUIClick();
    triggerHaptic("light");
  });

  hapticToggle.addEventListener("click", () => {
    settings.haptics = !settings.haptics;
    hapticToggle.classList.toggle("active", settings.haptics);
    localStorage.setItem("arrowArena_haptics", settings.haptics.toString());
    playUIClick();
    triggerHaptic("light");
  });

  // Mobile controls
  setupMobileControls();
}

// Mobile charge state
let mobileChargeStartTime = 0;
let lastHapticPulse = 0;

function setupMobileControls(): void {
  const leftBtn = document.getElementById("leftBtn")!;
  const rightBtn = document.getElementById("rightBtn")!;
  const jumpBtn = document.getElementById("jumpBtn")!;
  const aimArea = document.getElementById("aimArea")!;
  const aimIndicator = document.getElementById("aimIndicator")!;

  function addButtonHandler(btn: HTMLElement, key: string): void {
    btn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      keysDown.add(key);
      btn.classList.add("active");
      triggerHaptic("light");
    }, { passive: false });

    btn.addEventListener("touchend", (e) => {
      e.preventDefault();
      keysDown.delete(key);
      btn.classList.remove("active");
    }, { passive: false });

    btn.addEventListener("touchcancel", () => {
      keysDown.delete(key);
      btn.classList.remove("active");
    });
  }

  addButtonHandler(leftBtn, "a");
  addButtonHandler(rightBtn, "d");
  addButtonHandler(jumpBtn, "w");

  // Aim area - touch and hold to charge, drag to aim, release to fire
  let aimStartX = 0;
  let aimStartY = 0;

  aimArea.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const rect = aimArea.getBoundingClientRect();
    aimStartX = rect.left + rect.width / 2;
    aimStartY = rect.top + rect.height / 2;
    mobileAiming = true;
    mobileChargeStartTime = Date.now();
    lastHapticPulse = 0;

    // Start player charging
    if (gameState === "PLAYING") {
      const player = players.find(p => p.isPlayer && p.isAlive);
      if (player) {
        player.chargeStartTime = Date.now();
        player.isAiming = true;
      }
    }

    triggerHaptic("light");
    aimArea.classList.add("charging");
  }, { passive: false });

  aimArea.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (!mobileAiming) return;

    const touch = e.touches[0];
    const dx = touch.clientX - aimStartX;
    const dy = touch.clientY - aimStartY;

    mobileAimAngle = Math.atan2(dy, dx);

    // Update indicator position
    const dist = Math.min(50, Math.sqrt(dx * dx + dy * dy));
    const indicatorX = Math.cos(mobileAimAngle) * dist;
    const indicatorY = Math.sin(mobileAimAngle) * dist;
    aimIndicator.style.transform = `translate(${indicatorX}px, ${indicatorY}px)`;

    // Update player aim angle in real-time
    if (gameState === "PLAYING") {
      const player = players.find(p => p.isPlayer && p.isAlive);
      if (player) {
        player.aimAngle = mobileAimAngle;
      }
    }

    // Haptic feedback pulses as charge builds
    const chargeTime = Date.now() - mobileChargeStartTime;
    const chargeLevel = clamp((chargeTime - CONFIG.CHARGE_MIN_TIME) / (CONFIG.CHARGE_MAX_TIME - CONFIG.CHARGE_MIN_TIME), 0, 1);

    // Pulse every 300ms, faster as charge increases
    const pulseInterval = 400 - chargeLevel * 250;
    if (chargeTime - lastHapticPulse > pulseInterval && chargeLevel > 0.1) {
      triggerHaptic(chargeLevel > 0.7 ? "medium" : "light");
      lastHapticPulse = chargeTime;
    }

    // Update charge indicator visual (CSS class based on charge level)
    updateMobileChargeVisual(chargeLevel);
  }, { passive: false });

  aimArea.addEventListener("touchend", (e) => {
    e.preventDefault();
    if (mobileAiming && gameState === "PLAYING") {
      const player = players.find(p => p.isPlayer && p.isAlive);
      if (player && player.chargeStartTime > 0) {
        player.aimAngle = mobileAimAngle;
        createArrow(player, 0);
        player.chargeStartTime = 0;
        player.isAiming = false;
      }
    }
    mobileAiming = false;
    mobileChargeStartTime = 0;
    aimIndicator.style.transform = "translate(0, 0)";
    aimArea.classList.remove("charging");
    resetMobileChargeVisual();
  }, { passive: false });

  aimArea.addEventListener("touchcancel", () => {
    mobileAiming = false;
    mobileChargeStartTime = 0;
    aimIndicator.style.transform = "translate(0, 0)";
    aimArea.classList.remove("charging");
    resetMobileChargeVisual();

    // Cancel player charging
    if (gameState === "PLAYING") {
      const player = players.find(p => p.isPlayer && p.isAlive);
      if (player) {
        player.chargeStartTime = 0;
        player.isAiming = false;
      }
    }
  });
}

function updateMobileChargeVisual(chargeLevel: number): void {
  const aimArea = document.getElementById("aimArea")!;
  const aimIndicator = document.getElementById("aimIndicator")!;

  // Change border color based on charge
  if (chargeLevel < 0.3) {
    aimArea.style.borderColor = "rgba(255, 200, 100, 0.6)";
    aimIndicator.style.background = "rgba(255, 200, 100, 0.8)";
  } else if (chargeLevel < 0.7) {
    aimArea.style.borderColor = "rgba(255, 150, 50, 0.7)";
    aimIndicator.style.background = "rgba(255, 150, 50, 0.9)";
  } else {
    aimArea.style.borderColor = "rgba(255, 80, 80, 0.8)";
    aimIndicator.style.background = "rgba(255, 80, 80, 1)";
  }

  // Pulse size based on charge
  const scale = 1 + chargeLevel * 0.3;
  aimIndicator.style.width = `${20 * scale}px`;
  aimIndicator.style.height = `${20 * scale}px`;
}

function resetMobileChargeVisual(): void {
  const aimArea = document.getElementById("aimArea")!;
  const aimIndicator = document.getElementById("aimIndicator")!;

  aimArea.style.borderColor = "";
  aimIndicator.style.background = "";
  aimIndicator.style.width = "";
  aimIndicator.style.height = "";
}

// ============= RESIZE =============
function resizeCanvas(): void {
  w = gameContainer.clientWidth;
  h = gameContainer.clientHeight;
  canvas.width = w;
  canvas.height = h;

  if (gameState === "PLAYING") {
    setupArena();
  }

  console.log("[resizeCanvas] Canvas resized to:", w, "x", h);
}

// ============= GAME LOOP =============
let lastTime = 0;

function gameLoop(timestamp: number): void {
  const dt = Math.min(timestamp - lastTime, 50);
  lastTime = timestamp;

  ctx.save();

  // Screen shake
  if (screenShake > 0) {
    const shakeX = (Math.random() - 0.5) * screenShake;
    const shakeY = (Math.random() - 0.5) * screenShake;
    ctx.translate(shakeX, shakeY);
    screenShake *= 0.9;
    if (screenShake < 0.5) screenShake = 0;
  }

  // Draw background (sky, clouds, mountains)
  drawBackground();
  // Draw floating platforms
  drawPlatforms();

  if (gameState === "PLAYING") {
    // Handle input
    handlePlayerInput();

    // Update AI
    for (let i = 0; i < players.length; i++) {
      updateAI(players[i], i);
    }

    // Update physics
    for (const player of players) {
      updatePlayerPhysics(player);
    }

    // Handle player-to-player collisions
    handlePlayerCollisions();

    // Update arrows
    updateArrows();

    // Check game state (deaths, new bot spawns)
    checkGameState();

    // Update particles
    updateParticles(dt);

    // Draw game objects
    drawArrows();
    for (let i = 0; i < players.length; i++) {
      drawPlayer(players[i], i);
    }
    drawParticles();

    // Draw wave info and countdown
    const countdown = getCountdownToNextBot();
    const aliveBots = players.filter(p => !p.isPlayer && p.isAlive).length;

    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    // Wave indicator
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.font = "bold 20px Fredoka";
    ctx.fillText("Wave " + currentWave, w / 2, 8);

    // Countdown or warning - shows how many bots will spawn to reach wave number
    const nextWave = currentWave + 1;
    const botsNeeded = Math.max(0, nextWave - aliveBots);
    if (countdown > 0) {
      ctx.fillStyle = "rgba(200, 200, 200, 0.8)";
      ctx.font = "16px Fredoka";
      ctx.fillText("Wave " + nextWave + " in: " + countdown + "s (+" + botsNeeded + " bots)", w / 2, 32);
    } else {
      ctx.fillStyle = "rgba(255, 100, 100, 0.9)";
      ctx.font = "bold 16px Fredoka";
      ctx.fillText("WAVE " + nextWave + "!", w / 2, 32);
    }

    // Active bots count
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.font = "14px Fredoka";
    ctx.fillText("Active bots: " + aliveBots, w / 2, 52);
  } else if (gameState === "START") {
    // Draw preview players
    const previewY = h * 0.6;
    const player1 = createPlayer(w * 0.35, previewY, 0, true);
    const player2 = createPlayer(w * 0.65, previewY, 1, false);
    player1.aimAngle = 0;
    player2.aimAngle = Math.PI;

    drawPlayer(player1, 0);
    drawPlayer(player2, 1);
  }

  ctx.restore();

  requestAnimationFrame(gameLoop);
}

// ============= INIT =============
function init(): void {
  console.log("[init] Initializing Arrow Arena");

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  setupInputHandlers();

  showStartScreen();

  requestAnimationFrame(gameLoop);

  console.log("[init] Game initialized");
}

init();
