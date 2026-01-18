/**
 * TIME PILOT - Roguelike Arcade Shooter
 * 
 * Features:
 * - 360-degree flight and combat
 * - Wave-based progression with shop between waves
 * - 30+ wacky upgrades with synergy effects
 * - Boss battles and mini-bosses
 * - Deep bullet modification system
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

type WeaponClass = "none" | "machine_gun" | "rockets";
type WaveState = "waiting" | "active" | "complete" | "shop";
type EnemyAIState = "approach" | "orbit" | "attack" | "flee" | "special";
type ItemRarity = "common" | "rare" | "legendary";
type ItemCategory = "universal" | "machine_gun" | "rockets";

// Effect types for bullet modifications
interface BulletEffect {
  type: string;
  value: number;
}

interface Bullet extends Entity {
  lifetime: number;
  isPlayer: boolean;
  damage: number;
  isRocket?: boolean;
  piercing?: number;
  effects?: string[];
  size?: number;
  speed?: number;
  homing?: boolean;
  bounces?: number;
  splitting?: boolean;
  trail?: boolean;
}

interface EnemyAI {
  state: EnemyAIState;
  stateTimer: number;
  behaviorTimer: number;
  orbitDirection: number;
}

interface Enemy extends Entity {
  type: string;
  hp: number;
  maxHp: number;
  speed: number;
  maxSpeed: number;
  fireRate: number;
  lastFireTime: number;
  points: number;
  xpValue: number;
  behaviorTimer: number;
  targetAngle: number;
  isBoss: boolean;
  isMini: boolean;
  bossPhase: number;
  ai: EnemyAI;
}

interface Cloud {
  x: number;
  y: number;
  size: number;
  opacity: number;
  layer: number;
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
  type: string;
  active?: boolean;
}

interface Pickup {
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: string;
  lifetime: number;
}

interface Era {
  name: string;
  year: number;
  skyColor: string;
  cloudColor: string;
  enemyTypes: string[];
  bossType: string;
  enemiesRequired: number;
  enemySpeed: number;
  musicTempo: number;
}

interface WaveConfig {
  waveNumber: number;
  enemyCount: number;
  enemyTypes: string[];
  spawnInterval: number;
  maxActive: number;
  miniBoss?: string;
}

interface Item {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  rarity: ItemRarity;
  cost: number;
  effects: { type: string; value: number }[];
  synergiesWith?: string[];
  icon: string;
}

interface PlayerProgression {
  points: number;
  xp: number;
  waveLevel: number;
  combo: number;
  comboTimer: number;
  items: string[];
}

// Computed stats from items
interface ComputedStats {
  damageMultiplier: number;
  fireRateMultiplier: number;
  bulletSpeedMultiplier: number;
  bulletSizeMultiplier: number;
  piercing: number;
  homing: boolean;
  bounces: number;
  splitting: boolean;
  splitCount: number;
  explosionRadius: number;
  chainLightning: boolean;
  boomerang: boolean;
  trail: boolean;
  aura: boolean;
}

// ============= GAME STATE =============

type GameState = "menu" | "playing" | "weapon_select" | "shop" | "gameover";

let gameState: GameState = "menu";
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

// Player state
const player: Entity & {
  turnSpeed: number;
  thrust: number;
  maxSpeed: number;
  lives: number;
  invulnerableTime: number;
  fireRate: number;
  baseFireRate: number;
  lastFireTime: number;
  weaponClass: WeaponClass;
  progression: PlayerProgression;
  computedStats: ComputedStats;
} = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  angle: -Math.PI / 2,
  radius: 18,
  turnSpeed: 4.5,
  thrust: 280,
  maxSpeed: 320,
  lives: 3,
  invulnerableTime: 0,
  fireRate: 6,
  baseFireRate: 6,
  lastFireTime: 0,
  weaponClass: "none",
  progression: {
    points: 0,
    xp: 0,
    waveLevel: 1,
    combo: 0,
    comboTimer: 0,
    items: [],
  },
  computedStats: {
    damageMultiplier: 1,
    fireRateMultiplier: 1,
    bulletSpeedMultiplier: 1,
    bulletSizeMultiplier: 1,
    piercing: 0,
    homing: false,
    bounces: 0,
    splitting: false,
    splitCount: 2,
    explosionRadius: 0,
    chainLightning: false,
    boomerang: false,
    trail: false,
    aura: false,
  },
};

// Game entities
let bullets: Bullet[] = [];
let enemies: Enemy[] = [];
let clouds: Cloud[] = [];
let particles: Particle[] = [];
let pickups: Pickup[] = [];

// Entity pools for performance
const bulletPool: Bullet[] = [];
const particlePool: Particle[] = [];
const POOL_SIZE = 200;

// Camera (world position)
const camera = { x: 0, y: 0 };

// Game stats
let score = 0;
let highScore = 0;
let currentEra = 0;
let enemiesKilled = 0;
let enemiesKilledThisEra = 0;
let bossesDefeated = 0;
let totalEnemiesDestroyed = 0;

// Wave system
let waveState: WaveState = "waiting";
let currentWave = 0;
let enemiesKilledThisWave = 0;
let enemiesSpawnedThisWave = 0;
let waveEnemyCount = 0;
let waveCountdown = 3;
let waveCompleteTimer = 0;

// Spawn timing
let enemySpawnTimer = 0;
let enemySpawnInterval = 1.5;
let bossSpawned = false;
let bossActive = false;

// Shop
let shopItems: Item[] = [];

// Screen shake
let screenShake = { intensity: 0, duration: 0 };

// Input
const keys: Record<string, boolean> = {};
let mouseDown = false;
const isMobile = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

// Mobile joystick
const moveJoystick = { active: false, angle: 0, magnitude: 0 };
let fireButtonPressed = false;

// ============= ERA DEFINITIONS =============

const eras: Era[] = [
  {
    name: "Dawn of Flight",
    year: 1910,
    skyColor: "#87CEEB",
    cloudColor: "#ffffff",
    enemyTypes: ["biplane"],
    bossType: "zeppelin",
    enemiesRequired: 25,
    enemySpeed: 1.0,
    musicTempo: 1.0,
  },
  {
    name: "World War II",
    year: 1940,
    skyColor: "#5a7d9a",
    cloudColor: "#d0d0d0",
    enemyTypes: ["fighter", "bomber"],
    bossType: "superfortress",
    enemiesRequired: 30,
    enemySpeed: 1.2,
    musicTempo: 1.1,
  },
  {
    name: "Jet Age",
    year: 1970,
    skyColor: "#4a90c2",
    cloudColor: "#e8e8e8",
    enemyTypes: ["jet", "interceptor"],
    bossType: "bomberjet",
    enemiesRequired: 35,
    enemySpeed: 1.4,
    musicTempo: 1.2,
  },
  {
    name: "Modern Era",
    year: 1982,
    skyColor: "#3a6ea5",
    cloudColor: "#f0f0f0",
    enemyTypes: ["f16", "stealth"],
    bossType: "carrier",
    enemiesRequired: 40,
    enemySpeed: 1.6,
    musicTempo: 1.3,
  },
  {
    name: "Future",
    year: 2001,
    skyColor: "#1a1a3e",
    cloudColor: "#4080c0",
    enemyTypes: ["ufo", "drone"],
    bossType: "mothership",
    enemiesRequired: 50,
    enemySpeed: 1.8,
    musicTempo: 1.5,
  },
];

// ============= ITEM REGISTRY =============

const ITEMS: Item[] = [
  // === UNIVERSAL ITEMS ===
  {
    id: "accelerometer",
    name: "Accelerometer",
    description: "Bullets speed up over time. +1 Piercing!",
    category: "universal",
    rarity: "common",
    cost: 400,
    effects: [{ type: "piercing", value: 1 }, { type: "accelerate", value: 1 }],
    icon: "accel",
  },
  {
    id: "split_bullets",
    name: "Split Bullets",
    description: "Bullets split into 2 on impact.",
    category: "universal",
    rarity: "rare",
    cost: 800,
    effects: [{ type: "splitting", value: 1 }],
    synergiesWith: ["piercing_tip"],
    icon: "split",
  },
  {
    id: "boomerang_core",
    name: "Boomerang Core",
    description: "Bullets return after max distance.",
    category: "universal",
    rarity: "rare",
    cost: 700,
    effects: [{ type: "boomerang", value: 1 }],
    icon: "boom",
  },
  {
    id: "tesla_coil",
    name: "Tesla Coil",
    description: "Lightning arcs between nearby bullets.",
    category: "universal",
    rarity: "legendary",
    cost: 1500,
    effects: [{ type: "chain_lightning", value: 1 }],
    icon: "tesla",
  },
  {
    id: "mirror_shots",
    name: "Mirror Shots",
    description: "Duplicate bullet spawns opposite side.",
    category: "universal",
    rarity: "rare",
    cost: 900,
    effects: [{ type: "mirror", value: 1 }],
    icon: "mirror",
  },
  {
    id: "piercing_tip",
    name: "Drill Tip",
    description: "+3 Piercing, damage up per pierce.",
    category: "universal",
    rarity: "common",
    cost: 500,
    effects: [{ type: "piercing", value: 3 }],
    synergiesWith: ["split_bullets"],
    icon: "drill",
  },
  {
    id: "chain_reaction",
    name: "Chain Reaction",
    description: "Enemies explode on death, damaging nearby.",
    category: "universal",
    rarity: "rare",
    cost: 850,
    effects: [{ type: "explosion_radius", value: 50 }],
    icon: "chain",
  },
  {
    id: "snowball",
    name: "Snowball Effect",
    description: "Bullets grow in size and damage over time.",
    category: "universal",
    rarity: "common",
    cost: 450,
    effects: [{ type: "snowball", value: 1 }],
    icon: "snow",
  },
  {
    id: "rubber_bullets",
    name: "Rubber Bullets",
    description: "Bullets bounce off screen edges.",
    category: "universal",
    rarity: "common",
    cost: 400,
    effects: [{ type: "bounces", value: 3 }],
    icon: "rubber",
  },
  {
    id: "damage_up",
    name: "Heavy Rounds",
    description: "+30% damage to all bullets.",
    category: "universal",
    rarity: "common",
    cost: 350,
    effects: [{ type: "damage_mult", value: 0.3 }],
    icon: "damage",
  },
  {
    id: "speed_up",
    name: "Velocity Boost",
    description: "+25% bullet speed.",
    category: "universal",
    rarity: "common",
    cost: 300,
    effects: [{ type: "speed_mult", value: 0.25 }],
    icon: "speed",
  },
  {
    id: "bullet_aura",
    name: "Cursed Aura",
    description: "Bullets emit damaging aura.",
    category: "universal",
    rarity: "rare",
    cost: 1000,
    effects: [{ type: "aura", value: 1 }],
    icon: "aura",
  },
  // === MACHINE GUN ITEMS ===
  {
    id: "overclock",
    name: "Overclocked Barrel",
    description: "1.5x fire rate, +5 deg spread.",
    category: "machine_gun",
    rarity: "common",
    cost: 450,
    effects: [{ type: "firerate_mult", value: 0.5 }, { type: "spread", value: 5 }],
    icon: "overclock",
  },
  {
    id: "minigun_spinup",
    name: "Minigun Spin-Up",
    description: "Fire rate increases while shooting (up to 3x).",
    category: "machine_gun",
    rarity: "rare",
    cost: 800,
    effects: [{ type: "spinup", value: 1 }],
    icon: "minigun",
  },
  {
    id: "tracer_rounds",
    name: "Tracer Rounds",
    description: "Every 3rd shot deals 2.5x damage.",
    category: "machine_gun",
    rarity: "common",
    cost: 500,
    effects: [{ type: "tracer", value: 1 }],
    icon: "tracer",
  },
  {
    id: "spray_paint",
    name: "Spray Paint",
    description: "1.3x fire rate, slight homing.",
    category: "machine_gun",
    rarity: "rare",
    cost: 750,
    effects: [{ type: "firerate_mult", value: 0.3 }, { type: "homing", value: 0.3 }],
    icon: "spray",
  },
  {
    id: "burst_fire",
    name: "Burst Fire",
    description: "Fire in bursts of 3.",
    category: "machine_gun",
    rarity: "common",
    cost: 400,
    effects: [{ type: "burst", value: 3 }],
    icon: "burst",
  },
  {
    id: "sidewinders",
    name: "Sidewinders",
    description: "Additional bullets fire 45 deg to sides.",
    category: "machine_gun",
    rarity: "rare",
    cost: 700,
    effects: [{ type: "sidewinders", value: 1 }],
    icon: "side",
  },
  {
    id: "twin_beams",
    name: "Twin Beams",
    description: "Two parallel laser streams.",
    category: "machine_gun",
    rarity: "legendary",
    cost: 1200,
    effects: [{ type: "twin_beam", value: 1 }],
    icon: "twin",
  },
  // === ROCKET ITEMS ===
  {
    id: "cluster_bombs",
    name: "Cluster Bombs",
    description: "Rockets explode into 5 mini-rockets.",
    category: "rockets",
    rarity: "rare",
    cost: 900,
    effects: [{ type: "cluster", value: 5 }],
    icon: "cluster",
  },
  {
    id: "mirv",
    name: "MIRV Warheads",
    description: "Rockets split into 3 homing pieces mid-flight.",
    category: "rockets",
    rarity: "legendary",
    cost: 1400,
    effects: [{ type: "mirv", value: 3 }],
    icon: "mirv",
  },
  {
    id: "napalm",
    name: "Napalm Trail",
    description: "Rockets leave fire trail that damages.",
    category: "rockets",
    rarity: "rare",
    cost: 850,
    effects: [{ type: "trail", value: 1 }],
    icon: "napalm",
  },
  {
    id: "mega_rockets",
    name: "Mega Rockets",
    description: "2x size, 2x damage, 0.5x fire rate.",
    category: "rockets",
    rarity: "common",
    cost: 600,
    effects: [{ type: "size_mult", value: 1 }, { type: "damage_mult", value: 1 }, { type: "firerate_mult", value: -0.5 }],
    icon: "mega",
  },
  {
    id: "seeker",
    name: "Seeker Module",
    description: "Rockets home toward enemies.",
    category: "rockets",
    rarity: "rare",
    cost: 800,
    effects: [{ type: "homing", value: 1 }],
    icon: "seeker",
  },
  {
    id: "proximity",
    name: "Proximity Fuse",
    description: "Rockets explode near enemies.",
    category: "rockets",
    rarity: "common",
    cost: 500,
    effects: [{ type: "proximity", value: 60 }],
    icon: "prox",
  },
  {
    id: "rocket_barrage",
    name: "Rocket Barrage",
    description: "Fire 3 rockets in spread.",
    category: "rockets",
    rarity: "rare",
    cost: 950,
    effects: [{ type: "barrage", value: 3 }],
    icon: "barrage",
  },
  {
    id: "nuclear",
    name: "Nuclear Core",
    description: "Massive explosion, screen shake.",
    category: "rockets",
    rarity: "legendary",
    cost: 1600,
    effects: [{ type: "nuclear", value: 1 }],
    icon: "nuke",
  },
  {
    id: "afterburner",
    name: "Afterburner",
    description: "Rockets accelerate over time.",
    category: "rockets",
    rarity: "common",
    cost: 400,
    effects: [{ type: "accelerate", value: 2 }],
    icon: "after",
  },
  {
    id: "emp",
    name: "EMP Rockets",
    description: "Slow enemies in blast radius.",
    category: "rockets",
    rarity: "rare",
    cost: 700,
    effects: [{ type: "emp", value: 1 }],
    icon: "emp",
  },
  // === LEGENDARY ITEMS ===
  {
    id: "fractal_engine",
    name: "Fractal Engine",
    description: "Bullets recursively split (up to 4x).",
    category: "universal",
    rarity: "legendary",
    cost: 2000,
    effects: [{ type: "fractal", value: 4 }],
    icon: "fractal",
  },
  {
    id: "turret_bullets",
    name: "Turret Bullets",
    description: "Some bullets become stationary turrets.",
    category: "universal",
    rarity: "legendary",
    cost: 1800,
    effects: [{ type: "turret", value: 1 }],
    icon: "turret",
  },
  {
    id: "living_bullets",
    name: "Living Bullets",
    description: "Bullets occasionally spawn new bullets.",
    category: "universal",
    rarity: "legendary",
    cost: 1700,
    effects: [{ type: "living", value: 1 }],
    icon: "living",
  },
];

// Get item by ID
function getItem(id: string): Item | undefined {
  return ITEMS.find(item => item.id === id);
}

// Get random items for shop
function getShopItems(count: number, wave: number): Item[] {
  console.log("[getShopItems] Getting", count, "items for wave", wave);
  
  const availableItems = ITEMS.filter(item => {
    // Filter by weapon class
    if (item.category !== "universal" && item.category !== player.weaponClass) {
      return false;
    }
    // Don't show items player already has
    if (player.progression.items.includes(item.id)) {
      return false;
    }
    // Legendaries only after wave 3
    if (item.rarity === "legendary" && wave < 3) {
      return false;
    }
    return true;
  });
  
  // Shuffle and pick
  const shuffled = availableItems.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// ============= WAVE CONFIGURATION =============

function getWaveConfig(waveNumber: number): WaveConfig {
  const era = eras[Math.min(currentEra, eras.length - 1)];
  // Start with more enemies - wave 1 has 12, scales up
  const baseCount = 12 + Math.floor(waveNumber * 2);
  const isMiniWave = waveNumber > 0 && waveNumber % 4 === 0;
  
  return {
    waveNumber,
    enemyCount: baseCount,
    enemyTypes: era.enemyTypes,
    spawnInterval: Math.max(0.4, 1.2 - waveNumber * 0.05),
    maxActive: Math.min(15, 6 + Math.floor(waveNumber / 2)),
    miniBoss: isMiniWave ? getRandomMiniBoss() : undefined,
  };
}

function getRandomMiniBoss(): string {
  const miniBosses = ["ace", "heavy_bomber", "stealth_hunter", "drone_commander"];
  return miniBosses[Math.floor(Math.random() * miniBosses.length)];
}

// ============= EFFECT ENGINE =============

function recomputeStats(): void {
  console.log("[recomputeStats] Recalculating player stats from items");
  
  // Reset to base
  const stats = player.computedStats;
  stats.damageMultiplier = 1;
  stats.fireRateMultiplier = 1;
  stats.bulletSpeedMultiplier = 1;
  stats.bulletSizeMultiplier = 1;
  stats.piercing = 0;
  stats.homing = false;
  stats.bounces = 0;
  stats.splitting = false;
  stats.splitCount = 2;
  stats.explosionRadius = 0;
  stats.chainLightning = false;
  stats.boomerang = false;
  stats.trail = false;
  stats.aura = false;
  
  // Apply all item effects
  for (const itemId of player.progression.items) {
    const item = getItem(itemId);
    if (!item) continue;
    
    for (const effect of item.effects) {
      switch (effect.type) {
        case "damage_mult":
          stats.damageMultiplier += effect.value;
          break;
        case "firerate_mult":
          stats.fireRateMultiplier += effect.value;
          break;
        case "speed_mult":
          stats.bulletSpeedMultiplier += effect.value;
          break;
        case "size_mult":
          stats.bulletSizeMultiplier += effect.value;
          break;
        case "piercing":
          stats.piercing += effect.value;
          break;
        case "homing":
          stats.homing = true;
          break;
        case "bounces":
          stats.bounces += effect.value;
          break;
        case "splitting":
          stats.splitting = true;
          break;
        case "explosion_radius":
          stats.explosionRadius += effect.value;
          break;
        case "chain_lightning":
          stats.chainLightning = true;
          break;
        case "boomerang":
          stats.boomerang = true;
          break;
        case "trail":
          stats.trail = true;
          break;
        case "aura":
          stats.aura = true;
          break;
      }
    }
  }
  
  // Apply synergy bonuses
  const synergies = getActiveSynergies();
  for (const synergy of synergies) {
    console.log("[recomputeStats] Active synergy:", synergy);
    
    // Split + Drill Tip = more split bullets
    if (synergy.includes("split_bullets") && synergy.includes("piercing_tip")) {
      stats.splitCount = 4; // Split into 4 instead of 2
      stats.damageMultiplier += 0.2;
    }
    
    // Additional synergy bonuses can be added here
  }
  
  // Apply to fire rate
  player.fireRate = player.baseFireRate * stats.fireRateMultiplier;
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

function normalize(x: number, y: number): Vec2 {
  const len = Math.sqrt(x * x + y * y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function angleDiff(a: number, b: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function addScreenShake(intensity: number, duration: number): void {
  screenShake.intensity = Math.max(screenShake.intensity, intensity);
  screenShake.duration = Math.max(screenShake.duration, duration);
}

// ============= CLOUD SYSTEM =============

function initClouds(): void {
  clouds = [];
  for (let i = 0; i < 50; i++) {
    clouds.push({
      x: randomRange(-2000, 2000),
      y: randomRange(-2000, 2000),
      size: randomRange(60, 200),
      opacity: randomRange(0.3, 0.7),
      layer: Math.floor(Math.random() * 3),
    });
  }
}

function updateClouds(): void {
  // Keep clouds around the player
  for (const cloud of clouds) {
    const dx = cloud.x - camera.x;
    const dy = cloud.y - camera.y;
    const wrapDist = 2500;
    
    if (dx > wrapDist) cloud.x -= wrapDist * 2;
    if (dx < -wrapDist) cloud.x += wrapDist * 2;
    if (dy > wrapDist) cloud.y -= wrapDist * 2;
    if (dy < -wrapDist) cloud.y += wrapDist * 2;
  }
}

function drawClouds(layer: number): void {
  const era = eras[currentEra];
  const parallax = [0.3, 0.5, 0.8][layer];
  
  for (const cloud of clouds) {
    if (cloud.layer !== layer) continue;
    
    const screenX = (cloud.x - camera.x * parallax) + canvas.width / 2;
    const screenY = (cloud.y - camera.y * parallax) + canvas.height / 2;
    
    // Skip if off screen
    if (screenX < -cloud.size || screenX > canvas.width + cloud.size ||
        screenY < -cloud.size || screenY > canvas.height + cloud.size) {
      continue;
    }
    
    ctx.save();
    ctx.globalAlpha = cloud.opacity * (0.5 + layer * 0.2);
    ctx.fillStyle = era.cloudColor;
    
    // Draw fluffy cloud shape
    const s = cloud.size;
    ctx.beginPath();
    ctx.arc(screenX, screenY, s * 0.4, 0, Math.PI * 2);
    ctx.arc(screenX - s * 0.3, screenY + s * 0.1, s * 0.3, 0, Math.PI * 2);
    ctx.arc(screenX + s * 0.35, screenY + s * 0.05, s * 0.35, 0, Math.PI * 2);
    ctx.arc(screenX + s * 0.1, screenY + s * 0.2, s * 0.25, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }
}

// ============= PLAYER SYSTEM =============

function updatePlayer(dt: number): void {
  // Handle turning
  let turnInput = 0;
  
  if (isMobile) {
    if (moveJoystick.active && moveJoystick.magnitude > 0.2) {
      // Turn toward joystick direction
      const targetAngle = moveJoystick.angle;
      const diff = angleDiff(player.angle, targetAngle);
      turnInput = clamp(diff * 3, -1, 1);
    }
  } else {
    if (keys["arrowleft"] || keys["a"]) turnInput = -1;
    if (keys["arrowright"] || keys["d"]) turnInput = 1;
  }
  
  player.angle += turnInput * player.turnSpeed * dt;
  
  // Always moving forward
  const speed = player.maxSpeed;
  player.vx = Math.cos(player.angle) * speed;
  player.vy = Math.sin(player.angle) * speed;
  
  // Update position
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  
  // Update camera to follow player
  camera.x = lerp(camera.x, player.x, 0.1);
  camera.y = lerp(camera.y, player.y, 0.1);
  
  // Handle shooting
  const wantsFire = mouseDown || keys[" "] || keys["space"] || fireButtonPressed;
  if (wantsFire) {
    firePlayerBullet();
  }
  
  // Update invulnerability
  if (player.invulnerableTime > 0) {
    player.invulnerableTime -= dt;
  }
}

function firePlayerBullet(): void {
  const now = performance.now() / 1000;
  if (now - player.lastFireTime < 1 / player.fireRate) return;
  player.lastFireTime = now;
  
  const stats = player.computedStats;
  const baseSpeed = 600 * stats.bulletSpeedMultiplier;
  const baseDamage = stats.damageMultiplier;
  const baseSize = stats.bulletSizeMultiplier;
  
  if (player.weaponClass === "machine_gun") {
    // Check for sidewinders effect
    const hasSidewinders = player.progression.items.includes("sidewinders");
    const angles = hasSidewinders 
      ? [player.angle - Math.PI/4, player.angle, player.angle + Math.PI/4]
      : [player.angle];
    
    for (const fireAngle of angles) {
      // Dual stream for main angle
      const offsets = fireAngle === player.angle ? [-1, 1] : [0];
      for (const i of offsets) {
        const offsetX = Math.cos(fireAngle + Math.PI / 2) * 8 * i;
        const offsetY = Math.sin(fireAngle + Math.PI / 2) * 8 * i;
        spawnPlayerBullet(
          player.x + Math.cos(fireAngle) * 25 + offsetX,
          player.y + Math.sin(fireAngle) * 25 + offsetY,
          fireAngle,
          baseSpeed,
          0.7 * baseDamage,
          3 * baseSize,
          1.0,
          false
        );
      }
    }
  } else if (player.weaponClass === "rockets") {
    // Check for barrage effect
    const hasBarrage = player.progression.items.includes("rocket_barrage");
    const angles = hasBarrage 
      ? [player.angle - 0.15, player.angle, player.angle + 0.15]
      : [player.angle];
    
    for (const fireAngle of angles) {
      spawnPlayerBullet(
        player.x + Math.cos(fireAngle) * 25,
        player.y + Math.sin(fireAngle) * 25,
        fireAngle,
        baseSpeed * 0.8,
        2 * baseDamage,
        6 * baseSize,
        2.5,
        true
      );
    }
  } else {
    // Default starting weapon
    spawnPlayerBullet(
      player.x + Math.cos(player.angle) * 25,
      player.y + Math.sin(player.angle) * 25,
      player.angle,
      baseSpeed,
      1 * baseDamage,
      4,
      1.2,
      false
    );
  }
  
  // Check for mirror shots
  if (player.progression.items.includes("mirror_shots") && player.weaponClass !== "none") {
    const mirrorAngle = player.angle + Math.PI;
    spawnPlayerBullet(
      player.x + Math.cos(mirrorAngle) * 25,
      player.y + Math.sin(mirrorAngle) * 25,
      mirrorAngle,
      baseSpeed * 0.8,
      0.5 * baseDamage,
      3,
      1.0,
      player.weaponClass === "rockets"
    );
  }
}

function spawnPlayerBullet(
  x: number, y: number, 
  angle: number, 
  speed: number, 
  damage: number, 
  size: number, 
  lifetime: number,
  isRocket: boolean
): void {
  const stats = player.computedStats;
  
  const bullet: Bullet = {
    x,
    y,
    vx: Math.cos(angle) * speed + player.vx * 0.3,
    vy: Math.sin(angle) * speed + player.vy * 0.3,
    angle,
    radius: size,
    lifetime,
    isPlayer: true,
    damage,
    isRocket,
    piercing: stats.piercing,
    homing: stats.homing,
    bounces: stats.bounces,
    splitting: stats.splitting,
    trail: stats.trail || isRocket,
    speed,
    size,
    effects: [],
  };
  
  // Track effects for special behaviors
  if (stats.boomerang) bullet.effects!.push("boomerang");
  if (stats.aura) bullet.effects!.push("aura");
  if (player.progression.items.includes("snowball")) bullet.effects!.push("snowball");
  if (player.progression.items.includes("accelerometer")) bullet.effects!.push("accelerate");
  
  bullets.push(bullet);
}

function damagePlayer(): void {
  if (player.invulnerableTime > 0) return;
  
  player.lives--;
  player.invulnerableTime = 2.0;
  
  addScreenShake(15, 0.5);
  
  // Explosion particles
  for (let i = 0; i < 20; i++) {
    spawnParticle(player.x, player.y, "#ff6600", "explosion");
  }
  
  console.log("[damagePlayer] Lives remaining:", player.lives);
  
  if (player.lives <= 0) {
    gameOver();
  }
  
  updateLivesDisplay();
}

function drawPlayer(): void {
  const screenX = player.x - camera.x + canvas.width / 2;
  const screenY = player.y - camera.y + canvas.height / 2;
  
  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.rotate(player.angle + Math.PI / 2);
  
  // Flash when invulnerable
  if (player.invulnerableTime > 0 && Math.floor(player.invulnerableTime * 10) % 2 === 0) {
    ctx.globalAlpha = 0.5;
  }
  
  // Draw jet based on era
  const era = currentEra;
  
  if (era <= 1) {
    // Biplane/propeller style
    drawBiplane(0, 0, 1, "#00aaff", true);
  } else if (era <= 2) {
    // WWII fighter style
    drawFighter(0, 0, 1, "#00ccff", true);
  } else {
    // Modern jet style
    drawJet(0, 0, 1, "#00e5ff", true);
  }

  // Draw Weapon Visuals
  if (player.weaponClass === "machine_gun") {
    ctx.fillStyle = "#aaa";
    ctx.fillRect(-15, -10, 4, 15);
    ctx.fillRect(11, -10, 4, 15);
    ctx.fillStyle = "#00e5ff";
    ctx.fillRect(-15, -12, 4, 4);
    ctx.fillRect(11, -12, 4, 4);
  } else if (player.weaponClass === "rockets") {
    ctx.fillStyle = "#e53e3e";
    ctx.fillRect(-20, 5, 6, 12);
    ctx.fillRect(14, 5, 6, 12);
    ctx.beginPath();
    ctx.moveTo(-20, 5); ctx.lineTo(-17, 0); ctx.lineTo(-14, 5); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(14, 5); ctx.lineTo(17, 0); ctx.lineTo(20, 5); ctx.fill();
  }
  
  // Engine exhaust
  if (era >= 2) {
    ctx.fillStyle = "#ff8800";
    ctx.globalAlpha = 0.6 + Math.random() * 0.4;
    ctx.beginPath();
    ctx.moveTo(-4, 20);
    ctx.lineTo(4, 20);
    ctx.lineTo(0, 35 + Math.random() * 10);
    ctx.closePath();
    ctx.fill();
  }
  
  ctx.restore();
}

function drawBiplane(x: number, y: number, scale: number, color: string, isPlayer: boolean): void {
  const s = scale * 18;
  
  // Wings (two sets for biplane)
  ctx.fillStyle = isPlayer ? color : "#8B4513";
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1.5;
  
  // Top wing
  ctx.fillRect(x - s * 1.8, y - s * 0.8, s * 3.6, s * 0.4);
  ctx.strokeRect(x - s * 1.8, y - s * 0.8, s * 3.6, s * 0.4);
  
  // Bottom wing
  ctx.fillRect(x - s * 1.5, y + s * 0.2, s * 3, s * 0.35);
  ctx.strokeRect(x - s * 1.5, y + s * 0.2, s * 3, s * 0.35);
  
  // Fuselage
  ctx.fillStyle = isPlayer ? "#ffffff" : "#a67c52";
  ctx.beginPath();
  ctx.ellipse(x, y, s * 0.4, s * 1.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  
  // Propeller
  ctx.fillStyle = "#333";
  ctx.save();
  ctx.translate(x, y - s * 1.1);
  ctx.rotate(performance.now() / 30);
  ctx.fillRect(-s * 0.6, -s * 0.08, s * 1.2, s * 0.16);
  ctx.restore();
  
  // Tail
  ctx.fillStyle = isPlayer ? color : "#8B4513";
  ctx.beginPath();
  ctx.moveTo(x - s * 0.4, y + s * 0.8);
  ctx.lineTo(x + s * 0.4, y + s * 0.8);
  ctx.lineTo(x, y + s * 1.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawFighter(x: number, y: number, scale: number, color: string, isPlayer: boolean): void {
  const s = scale * 18;
  
  // Wings
  ctx.fillStyle = isPlayer ? color : "#4a6741";
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1.5;
  
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.3);
  ctx.lineTo(x - s * 2, y + s * 0.5);
  ctx.lineTo(x - s * 1.8, y + s * 0.8);
  ctx.lineTo(x, y + s * 0.2);
  ctx.lineTo(x + s * 1.8, y + s * 0.8);
  ctx.lineTo(x + s * 2, y + s * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // Fuselage
  ctx.fillStyle = isPlayer ? "#ffffff" : "#3d5c3a";
  ctx.beginPath();
  ctx.moveTo(x, y - s * 1.3);
  ctx.lineTo(x - s * 0.35, y + s * 0.8);
  ctx.lineTo(x + s * 0.35, y + s * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // Cockpit
  ctx.fillStyle = isPlayer ? "#003366" : "#1a1a1a";
  ctx.beginPath();
  ctx.ellipse(x, y - s * 0.3, s * 0.2, s * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Tail
  ctx.fillStyle = isPlayer ? color : "#4a6741";
  ctx.beginPath();
  ctx.moveTo(x - s * 0.5, y + s * 0.6);
  ctx.lineTo(x + s * 0.5, y + s * 0.6);
  ctx.lineTo(x, y + s * 1.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawJet(x: number, y: number, scale: number, color: string, isPlayer: boolean): void {
  const s = scale * 18;
  
  // Delta wings
  ctx.fillStyle = isPlayer ? color : "#555555";
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1.5;
  
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.8);
  ctx.lineTo(x - s * 1.6, y + s * 0.8);
  ctx.lineTo(x - s * 0.3, y + s * 0.4);
  ctx.lineTo(x + s * 0.3, y + s * 0.4);
  ctx.lineTo(x + s * 1.6, y + s * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // Fuselage
  ctx.fillStyle = isPlayer ? "#ffffff" : "#444444";
  ctx.beginPath();
  ctx.moveTo(x, y - s * 1.4);
  ctx.lineTo(x - s * 0.3, y + s * 0.9);
  ctx.lineTo(x + s * 0.3, y + s * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // Cockpit
  ctx.fillStyle = isPlayer ? "#0066aa" : "#222222";
  ctx.beginPath();
  ctx.ellipse(x, y - s * 0.6, s * 0.15, s * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Vertical stabilizer
  ctx.fillStyle = isPlayer ? color : "#555555";
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.2);
  ctx.lineTo(x, y + s * 1.1);
  ctx.lineTo(x + s * 0.3, y + s * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// ============= ENEMY SYSTEM =============

function spawnEnemy(): void {
  const era = eras[currentEra];
  const typeIndex = Math.floor(Math.random() * era.enemyTypes.length);
  const type = era.enemyTypes[typeIndex];
  
  // Get safe spawn position
  const pos = getSafeSpawnPosition();
  
  const hp = getEnemyHP(type);
  const speed = getEnemySpeed(type) * era.enemySpeed;
  
  const enemy: Enemy = {
    x: pos.x,
    y: pos.y,
    vx: 0,
    vy: 0,
    angle: Math.atan2(player.y - pos.y, player.x - pos.x),
    radius: 18,
    type,
    hp,
    maxHp: hp,
    speed,
    maxSpeed: speed,
    fireRate: getEnemyFireRate(type),
    lastFireTime: 0,
    points: getEnemyPoints(type),
    xpValue: getEnemyXP(type),
    behaviorTimer: Math.random() * 3,
    targetAngle: 0,
    isBoss: false,
    isMini: false,
    bossPhase: 0,
    ai: { 
      state: "approach", 
      stateTimer: 0, 
      behaviorTimer: 0,
      orbitDirection: Math.random() > 0.5 ? 1 : -1,
    },
  };
  
  enemies.push(enemy);
}

function getSafeSpawnPosition(): Vec2 {
  const minDist = 400;
  const maxDist = 800;
  
  for (let i = 0; i < 30; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = minDist + Math.random() * (maxDist - minDist);
    const x = player.x + Math.cos(angle) * dist;
    const y = player.y + Math.sin(angle) * dist;
    
    // Check not too close to other enemies
    let valid = true;
    for (const enemy of enemies) {
      if (distance(x, y, enemy.x, enemy.y) < 100) {
        valid = false;
        break;
      }
    }
    
    if (valid) return { x, y };
  }
  
  // Fallback to edge spawn
  const angle = Math.random() * Math.PI * 2;
  return {
    x: player.x + Math.cos(angle) * maxDist,
    y: player.y + Math.sin(angle) * maxDist,
  };
}

function getEnemyXP(type: string): number {
  const xpMap: Record<string, number> = {
    biplane: 10,
    fighter: 20,
    bomber: 30,
    jet: 25,
    interceptor: 35,
    f16: 40,
    stealth: 50,
    ufo: 60,
    drone: 45,
  };
  return xpMap[type] || 10;
}

function spawnBoss(): void {
  const era = eras[currentEra];
  const type = era.bossType;
  
  // Spawn boss at edge
  const spawnAngle = Math.random() * Math.PI * 2;
  const spawnDist = 800;
  const hp = getBossHP(type);
  
  const boss: Enemy = {
    x: player.x + Math.cos(spawnAngle) * spawnDist,
    y: player.y + Math.sin(spawnAngle) * spawnDist,
    vx: 0,
    vy: 0,
    angle: spawnAngle + Math.PI,
    radius: 50,
    type,
    hp,
    maxHp: hp,
    speed: 80,
    maxSpeed: 80,
    fireRate: 2,
    lastFireTime: 0,
    points: 5000 + currentEra * 2000,
    xpValue: 500,
    behaviorTimer: 0,
    targetAngle: 0,
    isBoss: true,
    isMini: false,
    bossPhase: 0,
    ai: { state: "orbit", stateTimer: 0, behaviorTimer: 0, orbitDirection: 1 },
  };
  
  enemies.push(boss);
  bossActive = true;
  bossSpawned = true;
  
  console.log("[spawnBoss] Boss spawned:", type);
}

function getEnemyHP(type: string): number {
  const hpMap: Record<string, number> = {
    biplane: 1,
    fighter: 1,
    bomber: 2,
    jet: 1,
    interceptor: 2,
    f16: 2,
    stealth: 3,
    ufo: 2,
    drone: 1,
  };
  return hpMap[type] || 1;
}

function getBossHP(type: string): number {
  const hpMap: Record<string, number> = {
    zeppelin: 20,
    superfortress: 25,
    bomberjet: 30,
    carrier: 40,
    mothership: 50,
  };
  return hpMap[type] || 20;
}

function getEnemySpeed(type: string): number {
  const speedMap: Record<string, number> = {
    biplane: 120,
    fighter: 180,
    bomber: 100,
    jet: 220,
    interceptor: 250,
    f16: 280,
    stealth: 200,
    ufo: 300,
    drone: 350,
  };
  return speedMap[type] || 150;
}

function getEnemyFireRate(type: string): number {
  const rateMap: Record<string, number> = {
    biplane: 0.5,
    fighter: 1,
    bomber: 0.3,
    jet: 1.5,
    interceptor: 2,
    f16: 2,
    stealth: 1,
    ufo: 3,
    drone: 4,
  };
  return rateMap[type] || 1;
}

function getEnemyPoints(type: string): number {
  const pointsMap: Record<string, number> = {
    biplane: 100,
    fighter: 200,
    bomber: 300,
    jet: 300,
    interceptor: 400,
    f16: 500,
    stealth: 600,
    ufo: 700,
    drone: 800,
  };
  return pointsMap[type] || 100;
}

function updateEnemies(dt: number): void {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    
    if (enemy.isBoss) {
      updateBoss(enemy, dt);
    } else {
      updateEnemy(enemy, dt);
    }
    
    // Remove enemies too far from player
    const dist = distance(enemy.x, enemy.y, player.x, player.y);
    if (dist > 1500 && !enemy.isBoss) {
      enemies.splice(i, 1);
    }
  }
}

function updateEnemy(enemy: Enemy, dt: number): void {
  const ai = enemy.ai;
  ai.stateTimer += dt;
  ai.behaviorTimer -= dt;
  
  const distToPlayer = distance(enemy.x, enemy.y, player.x, player.y);
  
  // Update AI at 10Hz for performance
  if (ai.behaviorTimer <= 0) {
    ai.behaviorTimer = 0.1;
    
    // State transitions - more aggressive AI
    switch (ai.state) {
      case "approach":
        if (distToPlayer < 300) {
          // 50% chance to attack, 50% to orbit
          transitionAI(enemy, Math.random() < 0.5 ? "attack" : "orbit");
        }
        break;
        
      case "orbit":
        // Shorter orbit time, then attack
        if (ai.stateTimer > 1.5 + Math.random()) {
          transitionAI(enemy, "attack");
        }
        if (distToPlayer > 500) {
          transitionAI(enemy, "approach");
        }
        break;
        
      case "attack":
        // Dive toward player then pull away
        if (ai.stateTimer > 2 || distToPlayer < 100) {
          transitionAI(enemy, "flee");
        }
        break;
        
      case "flee":
        if (ai.stateTimer > 1.5 || distToPlayer > 400) {
          transitionAI(enemy, "approach");
        }
        break;
    }
  }
  
  // Apply steering based on state - more aggressive movement
  let steering: Vec2 = { x: 0, y: 0 };
  const steerStrength = 8; // Higher = more responsive
  
  switch (ai.state) {
    case "approach":
      steering = steerSeek(enemy, player.x, player.y);
      steering.x *= 1.2;
      steering.y *= 1.2;
      break;
      
    case "orbit":
      steering = steerOrbit(enemy, player.x, player.y, 280, ai.orbitDirection);
      // Try to fire when orbiting and facing player
      tryEnemyFireDirectional(enemy);
      break;
      
    case "attack":
      // Aggressive dive toward player
      steering = steerSeek(enemy, player.x, player.y);
      steering.x *= 2;
      steering.y *= 2;
      // Fire when attacking and facing player
      tryEnemyFireDirectional(enemy);
      break;
      
    case "flee":
      steering = steerFlee(enemy, player.x, player.y);
      steering.x *= 1.5;
      steering.y *= 1.5;
      break;
  }
  
  // Apply steering to velocity with stronger force
  enemy.vx += steering.x * dt * steerStrength;
  enemy.vy += steering.y * dt * steerStrength;
  
  // Ensure minimum speed - enemies should always be moving
  const speed = Math.sqrt(enemy.vx ** 2 + enemy.vy ** 2);
  const minSpeed = enemy.maxSpeed * 0.5;
  if (speed < minSpeed && speed > 0.01) {
    const boost = minSpeed / speed;
    enemy.vx *= boost;
    enemy.vy *= boost;
  } else if (speed > enemy.maxSpeed) {
    enemy.vx = (enemy.vx / speed) * enemy.maxSpeed;
    enemy.vy = (enemy.vy / speed) * enemy.maxSpeed;
  }
  
  // Update position and angle (face movement direction)
  enemy.x += enemy.vx * dt;
  enemy.y += enemy.vy * dt;
  enemy.angle = Math.atan2(enemy.vy, enemy.vx);
}

// Only fire when facing the player (within a cone)
function tryEnemyFireDirectional(enemy: Enemy): void {
  const toPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);
  const facingDiff = Math.abs(angleDiff(enemy.angle, toPlayer));
  
  // Only fire if facing within 30 degrees of player
  if (facingDiff < 0.5) {
    tryEnemyFire(enemy);
  }
}

function transitionAI(enemy: Enemy, newState: EnemyAIState): void {
  enemy.ai.state = newState;
  enemy.ai.stateTimer = 0;
}

function steerSeek(entity: Entity, targetX: number, targetY: number): Vec2 {
  const dx = targetX - entity.x;
  const dy = targetY - entity.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return { x: 0, y: 0 };
  return { x: dx / dist, y: dy / dist };
}

function steerFlee(entity: Entity, threatX: number, threatY: number): Vec2 {
  const dx = entity.x - threatX;
  const dy = entity.y - threatY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return { x: 0, y: 0 };
  return { x: dx / dist, y: dy / dist };
}

function steerOrbit(entity: Entity, centerX: number, centerY: number, radius: number, direction: number): Vec2 {
  const dx = entity.x - centerX;
  const dy = entity.y - centerY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  if (dist < 1) return { x: 0, y: 0 };
  
  // Perpendicular direction for orbiting
  const perpX = -dy * direction;
  const perpY = dx * direction;
  const perpLen = Math.sqrt(perpX * perpX + perpY * perpY);
  
  // Also steer toward/away from center to maintain radius
  const radiusError = dist - radius;
  const towardCenterX = -dx / dist * radiusError * 0.02;
  const towardCenterY = -dy / dist * radiusError * 0.02;
  
  return {
    x: perpX / perpLen + towardCenterX,
    y: perpY / perpLen + towardCenterY,
  };
}

function updateBoss(boss: Enemy, dt: number): void {
  const ai = boss.ai;
  ai.stateTimer += dt;
  boss.behaviorTimer -= dt;
  
  const distToPlayer = distance(boss.x, boss.y, player.x, player.y);
  const hpPercent = boss.hp / boss.maxHp;
  
  // Phase transitions with screen shake and speed boost
  if (hpPercent < 0.5 && boss.bossPhase === 0) {
    boss.bossPhase = 1;
    boss.fireRate *= 1.5;
    boss.maxSpeed *= 1.2;
    addScreenShake(10, 0.5);
    for (let i = 0; i < 20; i++) {
      spawnParticle(boss.x, boss.y, "#ff0000", "explosion");
    }
    console.log("[updateBoss] Phase 1 - Enraged!");
  }
  if (hpPercent < 0.25 && boss.bossPhase === 1) {
    boss.bossPhase = 2;
    boss.fireRate *= 1.3;
    boss.maxSpeed *= 1.1;
    addScreenShake(15, 0.6);
    for (let i = 0; i < 30; i++) {
      spawnParticle(boss.x, boss.y, "#ff4400", "explosion");
    }
    console.log("[updateBoss] Phase 2 - Desperate!");
  }
  
  // Boss behavior based on phase
  if (boss.behaviorTimer <= 0) {
    boss.behaviorTimer = 0.1;
    
    // Behavior selection based on phase
    if (boss.bossPhase === 0) {
      // Phase 0: Steady orbit and fire
      if (ai.stateTimer > 4) {
        ai.state = ai.state === "orbit" ? "attack" : "orbit";
        ai.stateTimer = 0;
      }
    } else if (boss.bossPhase === 1) {
      // Phase 1: More aggressive, occasional charges
      if (ai.stateTimer > 2.5) {
        const rand = Math.random();
        if (rand < 0.4) {
          ai.state = "attack";
        } else if (rand < 0.7) {
          ai.state = "special";
        } else {
          ai.state = "orbit";
        }
        ai.stateTimer = 0;
      }
    } else {
      // Phase 2: Chaotic, rapid attacks
      if (ai.stateTimer > 1.5) {
        ai.state = Math.random() < 0.6 ? "attack" : "special";
        ai.stateTimer = 0;
      }
    }
  }
  
  // Apply behavior
  let steering: Vec2 = { x: 0, y: 0 };
  
  switch (ai.state) {
    case "orbit":
      steering = steerOrbit(boss, player.x, player.y, 350, ai.orbitDirection);
      tryEnemyFire(boss);
      break;
      
    case "attack":
      // Charge toward player
      steering = steerSeek(boss, player.x, player.y);
      steering.x *= 2;
      steering.y *= 2;
      tryEnemyFire(boss);
      if (distToPlayer < 150) {
        ai.state = "flee";
        ai.stateTimer = 0;
      }
      break;
      
    case "flee":
      steering = steerFlee(boss, player.x, player.y);
      if (distToPlayer > 400 || ai.stateTimer > 2) {
        ai.state = "orbit";
        ai.stateTimer = 0;
      }
      break;
      
    case "special":
      // Special attack - spawn pattern based on boss type
      if (ai.stateTimer < 0.1) {
        bossFire(boss);
      }
      steering = steerOrbit(boss, player.x, player.y, 300, ai.orbitDirection);
      break;
  }
  
  // Apply steering
  boss.vx += steering.x * dt * 3;
  boss.vy += steering.y * dt * 3;
  
  // Clamp speed
  const speed = Math.sqrt(boss.vx ** 2 + boss.vy ** 2);
  if (speed > boss.maxSpeed) {
    boss.vx = (boss.vx / speed) * boss.maxSpeed;
    boss.vy = (boss.vy / speed) * boss.maxSpeed;
  }
  
  boss.x += boss.vx * dt;
  boss.y += boss.vy * dt;
  boss.angle = Math.atan2(boss.vy, boss.vx);
}

function bossFire(boss: Enemy): void {
  // Special attack pattern based on boss phase
  const toPlayer = Math.atan2(player.y - boss.y, player.x - boss.x);
  const bulletSpeed = 300;
  const bulletCount = 5 + boss.bossPhase * 3;
  
  for (let i = 0; i < bulletCount; i++) {
    const angle = toPlayer + (i - bulletCount / 2) * 0.15;
    bullets.push({
      x: boss.x + Math.cos(angle) * 50,
      y: boss.y + Math.sin(angle) * 50,
      vx: Math.cos(angle) * bulletSpeed,
      vy: Math.sin(angle) * bulletSpeed,
      angle,
      radius: 8,
      lifetime: 3,
      isPlayer: false,
      damage: 1,
    });
  }
  
  addScreenShake(5, 0.2);
}

function tryEnemyFire(enemy: Enemy): void {
  const now = performance.now() / 1000;
  if (now - enemy.lastFireTime < 1 / enemy.fireRate) return;
  enemy.lastFireTime = now;
  
  // Fire in the direction the enemy is FACING (not toward player)
  const fireAngle = enemy.angle;
  const bulletSpeed = 350;
  
  if (enemy.isBoss) {
    // Boss fires spread shot in facing direction
    for (let i = -1; i <= 1; i++) {
      const angle = fireAngle + i * 0.2;
      bullets.push({
        x: enemy.x + Math.cos(angle) * 30,
        y: enemy.y + Math.sin(angle) * 30,
        vx: Math.cos(angle) * bulletSpeed,
        vy: Math.sin(angle) * bulletSpeed,
        angle,
        radius: 6,
        lifetime: 2,
        isPlayer: false,
        damage: 1,
      });
    }
  } else {
    // Regular enemies fire in facing direction
    bullets.push({
      x: enemy.x + Math.cos(fireAngle) * 20,
      y: enemy.y + Math.sin(fireAngle) * 20,
      vx: Math.cos(fireAngle) * bulletSpeed + enemy.vx * 0.3,
      vy: Math.sin(fireAngle) * bulletSpeed + enemy.vy * 0.3,
      angle: fireAngle,
      radius: 4,
      lifetime: 2,
      isPlayer: false,
      damage: 1,
    });
  }
}

function damageEnemy(enemy: Enemy, damage: number): void {
  enemy.hp -= damage;
  
  // Hit particles
  spawnParticle(enemy.x, enemy.y, "#ffaa00", "hit");
  
  if (enemy.hp <= 0) {
    killEnemy(enemy);
  }
}

function killEnemy(enemy: Enemy): void {
  console.log("[killEnemy] Enemy destroyed:", enemy.type, "Points:", enemy.points);
  
  // Explosion
  const particleCount = enemy.isBoss ? 40 : enemy.isMini ? 25 : 15;
  for (let i = 0; i < particleCount; i++) {
    spawnParticle(enemy.x, enemy.y, enemy.isBoss ? "#ff4400" : "#ff8800", "explosion");
  }
  
  // Chain reaction effect
  if (player.computedStats.explosionRadius > 0) {
    for (const other of enemies) {
      if (other === enemy) continue;
      const dist = distance(enemy.x, enemy.y, other.x, other.y);
      if (dist < player.computedStats.explosionRadius) {
        damageEnemy(other, 1);
        spawnParticle(other.x, other.y, "#ff6600", "explosion");
      }
    }
  }
  
  // Combo system
  player.progression.combo++;
  player.progression.comboTimer = 2; // 2 seconds to maintain combo
  const comboMult = Math.min(3, 1 + player.progression.combo * 0.1);
  
  // Points with combo multiplier
  const earnedPoints = Math.floor(enemy.points * comboMult);
  player.progression.points += earnedPoints;
  score += earnedPoints;
  
  // XP
  player.progression.xp += enemy.xpValue;
  
  totalEnemiesDestroyed++;
  
  if (!enemy.isBoss && !enemy.isMini) {
    enemiesKilled++;
    enemiesKilledThisEra++;
    enemiesKilledThisWave++;
  } else if (enemy.isBoss) {
    bossesDefeated++;
    bossActive = false;
    advanceEra();
  } else if (enemy.isMini) {
    // Mini-boss gives bonus
    player.progression.points += 500;
  }

  // Trigger weapon select after first kill
  if (totalEnemiesDestroyed === 1 && player.weaponClass === "none") {
    showWeaponSelect();
  }
  
  // Maybe spawn pickup
  if (Math.random() < 0.15) {
    spawnPickup(enemy.x, enemy.y);
  }
  
  addScreenShake(enemy.isBoss ? 20 : enemy.isMini ? 10 : 5, enemy.isBoss ? 0.6 : 0.15);
  
  // Remove enemy
  const index = enemies.indexOf(enemy);
  if (index >= 0) enemies.splice(index, 1);
  
  updateEnemiesBar();
  updatePointsDisplay();
}

function showWeaponSelect(): void {
  console.log("[showWeaponSelect] Opening weapon selection");
  gameState = "weapon_select";
  document.getElementById("weaponSelectScreen")!.classList.remove("hidden");
}

function selectWeapon(weapon: WeaponClass): void {
  console.log("[selectWeapon] Weapon selected:", weapon);
  player.weaponClass = weapon;
  
  // Adjust player stats based on weapon
  if (weapon === "machine_gun") {
    player.fireRate = 12;
  } else if (weapon === "rockets") {
    player.fireRate = 3.5;
  }
  
  document.getElementById("weaponSelectScreen")!.classList.add("hidden");
  gameState = "playing";
}

function drawEnemies(): void {
  for (const enemy of enemies) {
    const screenX = enemy.x - camera.x + canvas.width / 2;
    const screenY = enemy.y - camera.y + canvas.height / 2;
    
    // Skip if off screen
    if (screenX < -100 || screenX > canvas.width + 100 ||
        screenY < -100 || screenY > canvas.height + 100) {
      continue;
    }
    
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(enemy.angle + Math.PI / 2);
    
    if (enemy.isBoss) {
      drawBoss(enemy);
    } else {
      drawEnemyByType(enemy);
    }
    
    ctx.restore();
    
    // Draw health bar for boss
    if (enemy.isBoss) {
      const barWidth = 100;
      const barHeight = 8;
      const hpPercent = enemy.hp / enemy.maxHp;
      
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(screenX - barWidth / 2, screenY - 80, barWidth, barHeight);
      
      ctx.fillStyle = hpPercent > 0.3 ? "#00ff00" : "#ff4400";
      ctx.fillRect(screenX - barWidth / 2, screenY - 80, barWidth * hpPercent, barHeight);
      
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.strokeRect(screenX - barWidth / 2, screenY - 80, barWidth, barHeight);
    }
  }
}

function drawEnemyByType(enemy: Enemy): void {
  const scale = 1;
  
  switch (enemy.type) {
    case "biplane":
      drawBiplane(0, 0, scale, "#cc4444", false);
      break;
    case "fighter":
    case "bomber":
      drawFighter(0, 0, scale, "#557755", false);
      break;
    case "jet":
    case "interceptor":
      drawJet(0, 0, scale * 0.9, "#666666", false);
      break;
    case "f16":
    case "stealth":
      drawJet(0, 0, scale, "#444444", false);
      break;
    case "ufo":
    case "drone":
      drawUFO(0, 0, scale);
      break;
    default:
      drawFighter(0, 0, scale, "#888888", false);
  }
}

function drawUFO(x: number, y: number, scale: number): void {
  const s = scale * 20;
  
  // Saucer body
  ctx.fillStyle = "#aaaacc";
  ctx.beginPath();
  ctx.ellipse(x, y, s * 1.5, s * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Dome
  ctx.fillStyle = "#88aaff";
  ctx.beginPath();
  ctx.ellipse(x, y - s * 0.2, s * 0.6, s * 0.5, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  
  // Lights
  ctx.fillStyle = "#ff00ff";
  ctx.globalAlpha = 0.5 + Math.sin(performance.now() / 100) * 0.5;
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + performance.now() / 500;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * s, y + Math.sin(angle) * s * 0.3, s * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBoss(enemy: Enemy): void {
  const type = enemy.type;
  const s = 50;
  
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 2;
  
  switch (type) {
    case "zeppelin":
      // Zeppelin body
      ctx.fillStyle = "#888899";
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 2, s * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      // Gondola
      ctx.fillStyle = "#665544";
      ctx.fillRect(-s * 0.4, s * 0.5, s * 0.8, s * 0.3);
      
      // Fins
      ctx.fillStyle = "#888899";
      ctx.beginPath();
      ctx.moveTo(s * 1.5, 0);
      ctx.lineTo(s * 2.2, -s * 0.5);
      ctx.lineTo(s * 2.2, s * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
      
    case "superfortress":
    case "bomberjet":
      // Large bomber
      ctx.fillStyle = "#556655";
      // Wings
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.5);
      ctx.lineTo(-s * 2.5, s * 0.3);
      ctx.lineTo(-s * 2.2, s * 0.6);
      ctx.lineTo(0, s * 0.2);
      ctx.lineTo(s * 2.2, s * 0.6);
      ctx.lineTo(s * 2.5, s * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Fuselage
      ctx.fillStyle = "#445544";
      ctx.beginPath();
      ctx.moveTo(0, -s * 1.2);
      ctx.lineTo(-s * 0.4, s * 0.8);
      ctx.lineTo(s * 0.4, s * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Engines
      ctx.fillStyle = "#333";
      for (const ex of [-s * 1.2, -s * 0.6, s * 0.6, s * 1.2]) {
        ctx.beginPath();
        ctx.ellipse(ex, s * 0.1, s * 0.15, s * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
      
    case "carrier":
      // Aircraft carrier
      ctx.fillStyle = "#444455";
      ctx.beginPath();
      ctx.moveTo(0, -s * 1.5);
      ctx.lineTo(-s * 0.8, -s);
      ctx.lineTo(-s * 0.8, s * 1.2);
      ctx.lineTo(s * 0.8, s * 1.2);
      ctx.lineTo(s * 0.8, -s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Deck
      ctx.fillStyle = "#555566";
      ctx.fillRect(-s * 0.7, -s * 0.8, s * 1.4, s * 1.8);
      
      // Island
      ctx.fillStyle = "#666677";
      ctx.fillRect(s * 0.3, -s * 0.5, s * 0.4, s * 0.8);
      break;
      
    case "mothership":
      // UFO mothership
      ctx.fillStyle = "#7788aa";
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 2, s * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      // Dome
      ctx.fillStyle = "#99aaff";
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.3, s, s * 0.6, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      
      // Pulsing lights
      ctx.fillStyle = "#ff00ff";
      ctx.globalAlpha = 0.5 + Math.sin(performance.now() / 80) * 0.5;
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + performance.now() / 300;
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * s * 1.5, Math.sin(angle) * s * 0.5, s * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
      
    default:
      // Default boss shape
      ctx.fillStyle = "#ff4444";
      ctx.beginPath();
      ctx.arc(0, 0, s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
  }
}

// ============= BULLET SYSTEM =============

function updateBullets(dt: number): void {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    
    // Handle special effects
    if (bullet.isPlayer && bullet.effects) {
      // Homing behavior
      if (bullet.homing) {
        let nearestEnemy: Enemy | null = null;
        let nearestDist = 300;
        for (const enemy of enemies) {
          const dist = distance(bullet.x, bullet.y, enemy.x, enemy.y);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestEnemy = enemy;
          }
        }
        if (nearestEnemy) {
          const targetAngle = Math.atan2(nearestEnemy.y - bullet.y, nearestEnemy.x - bullet.x);
          const diff = angleDiff(bullet.angle, targetAngle);
          bullet.angle += clamp(diff * 3, -2 * dt, 2 * dt);
          const speed = bullet.speed || 500;
          bullet.vx = Math.cos(bullet.angle) * speed;
          bullet.vy = Math.sin(bullet.angle) * speed;
        }
      }
      
      // Accelerate effect
      if (bullet.effects.includes("accelerate")) {
        const accel = 1.02;
        bullet.vx *= accel;
        bullet.vy *= accel;
      }
      
      // Snowball effect - grow over time
      if (bullet.effects.includes("snowball")) {
        bullet.radius = Math.min(20, (bullet.radius || 4) + dt * 3);
        bullet.damage = (bullet.damage || 1) + dt * 0.5;
      }
      
      // Aura damage
      if (bullet.effects.includes("aura")) {
        for (const enemy of enemies) {
          const dist = distance(bullet.x, bullet.y, enemy.x, enemy.y);
          if (dist < 50 && dist > bullet.radius) {
            enemy.hp -= 0.5 * dt;
            if (Math.random() < 0.1) {
              spawnParticle(enemy.x, enemy.y, "#ff00ff", "hit");
            }
          }
        }
      }
      
      // Trail particles
      if (bullet.trail && Math.random() < 0.3) {
        spawnParticle(bullet.x, bullet.y, bullet.isRocket ? "#ff6600" : "#00e5ff", "hit");
      }
    }
    
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.lifetime -= dt;
    
    // Boomerang effect - reverse direction at half lifetime
    if (bullet.isPlayer && bullet.effects?.includes("boomerang")) {
      const originalLifetime = bullet.isRocket ? 2.5 : 1.0;
      if (bullet.lifetime < originalLifetime * 0.4 && !bullet.effects.includes("returned")) {
        bullet.effects.push("returned");
        bullet.vx = -bullet.vx;
        bullet.vy = -bullet.vy;
        bullet.angle = Math.atan2(bullet.vy, bullet.vx);
      }
    }
    
    // Bounce off screen edges
    if (bullet.bounces && bullet.bounces > 0) {
      const screenX = bullet.x - camera.x + canvas.width / 2;
      const screenY = bullet.y - camera.y + canvas.height / 2;
      
      if (screenX < 0 || screenX > canvas.width) {
        bullet.vx = -bullet.vx;
        bullet.angle = Math.atan2(bullet.vy, bullet.vx);
        bullet.bounces--;
        spawnParticle(bullet.x, bullet.y, "#ffff00", "hit");
      }
      if (screenY < 0 || screenY > canvas.height) {
        bullet.vy = -bullet.vy;
        bullet.angle = Math.atan2(bullet.vy, bullet.vx);
        bullet.bounces--;
        spawnParticle(bullet.x, bullet.y, "#ffff00", "hit");
      }
    }
    
    if (bullet.lifetime <= 0) {
      bullets.splice(i, 1);
      continue;
    }
    
    // Check collisions
    if (bullet.isPlayer) {
      // Check against enemies
      for (const enemy of enemies) {
        const dist = distance(bullet.x, bullet.y, enemy.x, enemy.y);
        if (dist < bullet.radius + enemy.radius) {
          damageEnemy(enemy, bullet.damage);
          
          // Piercing - reduce but don't remove bullet
          if (bullet.piercing && bullet.piercing > 0) {
            bullet.piercing--;
            bullet.damage *= 0.8; // Slight damage reduction per pierce
          } else if (bullet.splitting) {
            // Split into smaller bullets
            for (let s = 0; s < 2; s++) {
              const splitAngle = bullet.angle + (s === 0 ? -0.5 : 0.5);
              spawnPlayerBullet(
                bullet.x, bullet.y, splitAngle,
                (bullet.speed || 500) * 0.8, 
                bullet.damage * 0.5, 
                bullet.radius * 0.7, 
                bullet.lifetime * 0.5,
                false
              );
            }
            bullets.splice(i, 1);
          } else {
            bullets.splice(i, 1);
          }
          break;
        }
      }
    } else {
      // Check against player
      const dist = distance(bullet.x, bullet.y, player.x, player.y);
      if (dist < bullet.radius + player.radius) {
        damagePlayer();
        bullets.splice(i, 1);
      }
    }
  }
}

function drawBullets(): void {
  for (const bullet of bullets) {
    const screenX = bullet.x - camera.x + canvas.width / 2;
    const screenY = bullet.y - camera.y + canvas.height / 2;
    
    if (screenX < -50 || screenX > canvas.width + 50 ||
        screenY < -50 || screenY > canvas.height + 50) {
      continue;
    }
    
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(bullet.angle);
    
    if (bullet.isPlayer) {
      if (bullet.isRocket) {
        // Rocket visual
        ctx.fillStyle = "#e53e3e";
        ctx.fillRect(-8, -3, 16, 6);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(8, -3);
        ctx.lineTo(14, 0);
        ctx.lineTo(8, 3);
        ctx.closePath();
        ctx.fill();
        // Rocket trail
        spawnParticle(bullet.x, bullet.y, "#ffaa00", "hit");
      } else {
        // Player bullets - cyan laser
        const gradient = ctx.createLinearGradient(-12, 0, 12, 0);
        gradient.addColorStop(0, "rgba(0, 229, 255, 0)");
        gradient.addColorStop(0.5, "rgba(0, 229, 255, 1)");
        gradient.addColorStop(1, "rgba(0, 229, 255, 0)");
        
        ctx.fillStyle = gradient;
        ctx.fillRect(-12, -2, 24, 4);
        
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(-6, -1, 12, 2);
      }
    } else {
      // Enemy bullets - red/orange
      ctx.fillStyle = "#ff4400";
      ctx.beginPath();
      ctx.arc(0, 0, bullet.radius, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = "#ffaa00";
      ctx.beginPath();
      ctx.arc(0, 0, bullet.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }
}

// ============= PICKUP SYSTEM =============

function spawnPickup(x: number, y: number): void {
  pickups.push({
    x,
    y,
    vx: randomRange(-30, 30),
    vy: randomRange(-30, 30),
    type: "parachute",
    lifetime: 10,
  });
}

function updatePickups(dt: number): void {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pickup = pickups[i];
    
    pickup.x += pickup.vx * dt;
    pickup.y += pickup.vy * dt;
    pickup.vy += 20 * dt; // Gravity
    pickup.lifetime -= dt;
    
    if (pickup.lifetime <= 0) {
      pickups.splice(i, 1);
      continue;
    }
    
    // Check collection
    const dist = distance(pickup.x, pickup.y, player.x, player.y);
    if (dist < player.radius + 30) {
      collectPickup(pickup);
      pickups.splice(i, 1);
    }
  }
}

function collectPickup(pickup: Pickup): void {
  console.log("[collectPickup] Collected:", pickup.type);
  
  score += 1000;
  
  // Collect particles
  for (let i = 0; i < 10; i++) {
    spawnParticle(pickup.x, pickup.y, "#00ff00", "sparkle");
  }
}

function drawPickups(): void {
  for (const pickup of pickups) {
    const screenX = pickup.x - camera.x + canvas.width / 2;
    const screenY = pickup.y - camera.y + canvas.height / 2;
    
    ctx.save();
    ctx.translate(screenX, screenY);
    
    // Parachute
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, -10, 15, Math.PI, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Strings
    ctx.beginPath();
    ctx.moveTo(-12, -5);
    ctx.lineTo(0, 15);
    ctx.moveTo(12, -5);
    ctx.lineTo(0, 15);
    ctx.moveTo(0, -10);
    ctx.lineTo(0, 15);
    ctx.stroke();
    
    // Person
    ctx.fillStyle = "#ffcc88";
    ctx.beginPath();
    ctx.arc(0, 20, 5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }
}

// ============= PARTICLE SYSTEM =============

function spawnParticle(x: number, y: number, color: string, type: string): void {
  const angle = Math.random() * Math.PI * 2;
  const speed = type === "explosion" ? randomRange(100, 300) : randomRange(50, 150);
  
  particles.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: randomRange(0.3, 0.8),
    maxLife: 0.6,
    size: randomRange(3, 10),
    color,
    type,
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
    const screenX = p.x - camera.x + canvas.width / 2;
    const screenY = p.y - camera.y + canvas.height / 2;
    
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    
    ctx.beginPath();
    ctx.arc(screenX, screenY, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ============= ERA PROGRESSION =============

function advanceEra(): void {
  currentEra++;
  enemiesKilledThisEra = 0;
  bossSpawned = false;
  bossActive = false;
  
  if (currentEra >= eras.length) {
    // Game completed! Loop back with harder difficulty
    currentEra = 0;
    score += 50000; // Big bonus
  }
  
  console.log("[advanceEra] Now in era:", eras[currentEra].name);
  updateEraDisplay();
  updateEnemiesBar();
}

// ============= WAVE SYSTEM =============

function updateWaveSystem(dt: number): void {
  switch (waveState) {
    case "waiting":
      waveCountdown -= dt;
      if (waveCountdown <= 0) {
        startWave();
      }
      break;
      
    case "active":
      updateWaveSpawning(dt);
      // Check if wave complete
      if (enemiesKilledThisWave >= waveEnemyCount && enemies.length === 0) {
        completeWave();
      }
      break;
      
    case "complete":
      waveCompleteTimer -= dt;
      if (waveCompleteTimer <= 0) {
        openShop();
      }
      break;
      
    case "shop":
      // Shop is open, wait for player input
      break;
  }
}

function startWave(): void {
  const config = getWaveConfig(currentWave);
  console.log("[startWave] Starting wave", currentWave, "with", config.enemyCount, "enemies");
  
  waveState = "active";
  waveEnemyCount = config.enemyCount;
  enemiesKilledThisWave = 0;
  enemiesSpawnedThisWave = 0;
  enemySpawnInterval = config.spawnInterval;
  enemySpawnTimer = 0.5; // Small delay before first spawn
  
  // Spawn mini-boss if configured
  if (config.miniBoss) {
    spawnMiniBoss(config.miniBoss);
  }
  
  updateWaveDisplay();
}

function completeWave(): void {
  console.log("[completeWave] Wave", currentWave, "complete!");
  waveState = "complete";
  waveCompleteTimer = 1.5; // Brief celebration before shop
  
  // Check for era boss
  const era = eras[currentEra];
  if (enemiesKilledThisEra >= era.enemiesRequired && !bossSpawned) {
    spawnBoss();
    waveState = "active"; // Stay in active for boss fight
    return;
  }
  
  currentWave++;
}

function openShop(): void {
  console.log("[openShop] Opening shop");
  waveState = "shop";
  gameState = "shop";
  
  // Get 2-3 items based on wave
  const itemCount = currentWave >= 5 ? 3 : 2;
  shopItems = getShopItems(itemCount, currentWave);
  
  showShopUI();
}

function closeShop(): void {
  console.log("[closeShop] Closing shop, starting next wave");
  waveState = "waiting";
  waveCountdown = 2;
  gameState = "playing";
  hideShopUI();
}

function purchaseItem(itemId: string): void {
  const item = getItem(itemId);
  if (!item) return;
  
  console.log("[purchaseItem] Purchasing:", item.name, "for", item.cost, "points");
  
  if (player.progression.points >= item.cost) {
    player.progression.points -= item.cost;
    player.progression.items.push(itemId);
    recomputeStats();
    updatePointsDisplay();
    
    // Visual feedback
    addScreenShake(5, 0.2);
    for (let i = 0; i < 15; i++) {
      spawnParticle(player.x, player.y, "#00ff88", "sparkle");
    }
  }
}

function updateWaveSpawning(dt: number): void {
  const config = getWaveConfig(currentWave);
  
  // Don't spawn during boss fight
  if (bossActive) return;
  
  // Don't spawn if we've spawned all enemies for this wave
  if (enemiesSpawnedThisWave >= config.enemyCount) return;
  
  enemySpawnTimer -= dt;
  if (enemySpawnTimer <= 0 && enemies.length < config.maxActive) {
    spawnEnemy();
    enemiesSpawnedThisWave++;
    enemySpawnTimer = config.spawnInterval;
  }
}

function spawnMiniBoss(type: string): void {
  console.log("[spawnMiniBoss] Spawning mini-boss:", type);
  
  const spawnAngle = Math.random() * Math.PI * 2;
  const spawnDist = 700;
  
  const miniBoss: Enemy = {
    x: player.x + Math.cos(spawnAngle) * spawnDist,
    y: player.y + Math.sin(spawnAngle) * spawnDist,
    vx: 0,
    vy: 0,
    angle: spawnAngle + Math.PI,
    radius: 35,
    type,
    hp: 15,
    maxHp: 15,
    speed: 150,
    maxSpeed: 150,
    fireRate: 2,
    lastFireTime: 0,
    points: 1000,
    xpValue: 100,
    behaviorTimer: 0,
    targetAngle: 0,
    isBoss: false,
    isMini: true,
    bossPhase: 0,
    ai: { state: "approach", stateTimer: 0, behaviorTimer: 0, orbitDirection: Math.random() > 0.5 ? 1 : -1 },
  };
  
  enemies.push(miniBoss);
}

// ============= COLLISION WITH ENEMIES =============

function checkPlayerEnemyCollision(): void {
  for (const enemy of enemies) {
    const dist = distance(player.x, player.y, enemy.x, enemy.y);
    if (dist < player.radius + enemy.radius * 0.7) {
      damagePlayer();
      
      // Also damage/destroy the enemy
      if (!enemy.isBoss) {
        killEnemy(enemy);
      }
      break;
    }
  }
}

// ============= HUD UPDATES =============

function updateHUD(): void {
  document.getElementById("scoreDisplay")!.textContent = score.toLocaleString();
  
  // Update combo display
  const comboEl = document.getElementById("comboDisplay");
  if (comboEl) {
    if (player.progression.combo > 1) {
      comboEl.textContent = "x" + player.progression.combo.toFixed(1);
      comboEl.style.opacity = "1";
    } else {
      comboEl.style.opacity = "0";
    }
  }
}

function updateLivesDisplay(): void {
  const container = document.getElementById("livesDisplay")!;
  container.innerHTML = "";
  
  for (let i = 0; i < 3; i++) {
    const icon = document.createElement("div");
    icon.className = "life-icon" + (i >= player.lives ? " lost" : "");
    container.appendChild(icon);
  }
}

function updateEraDisplay(): void {
  const era = eras[currentEra];
  document.getElementById("eraDisplay")!.textContent = era.year.toString();
}

function updateWaveDisplay(): void {
  const waveEl = document.getElementById("waveDisplay");
  if (waveEl) {
    waveEl.textContent = (currentWave + 1).toString();
  }
}

function updatePointsDisplay(): void {
  const pointsEl = document.getElementById("pointsDisplay");
  if (pointsEl) {
    pointsEl.textContent = player.progression.points.toLocaleString();
  }
}

function updateEnemiesBar(): void {
  const percent = waveEnemyCount > 0 
    ? Math.min(100, (enemiesKilledThisWave / waveEnemyCount) * 100)
    : 0;
  document.getElementById("enemiesFill")!.style.width = percent + "%";
}

// ============= SHOP UI =============

function showShopUI(): void {
  console.log("[showShopUI] Displaying shop with", shopItems.length, "items");
  
  const shopScreen = document.getElementById("shopScreen");
  if (!shopScreen) return;
  
  // Update points display in shop
  const shopPoints = document.getElementById("shopPoints");
  if (shopPoints) {
    shopPoints.textContent = player.progression.points.toLocaleString();
  }
  
  // Update wave complete text
  const waveText = document.getElementById("shopWaveText");
  if (waveText) {
    waveText.textContent = "WAVE " + (currentWave + 1) + " COMPLETE";
  }
  
  // Build item cards
  const container = document.getElementById("shopItemsContainer");
  if (container) {
    container.innerHTML = "";
    
    for (const item of shopItems) {
      const card = createItemCard(item);
      container.appendChild(card);
    }
  }
  
  shopScreen.classList.remove("hidden");
}

function createItemCard(item: Item): HTMLElement {
  const card = document.createElement("div");
  card.className = "shop-card " + item.rarity;
  card.dataset.itemId = item.id;
  
  const canAfford = player.progression.points >= item.cost;
  if (!canAfford) card.classList.add("unaffordable");
  
  // Check for synergies with owned items
  const hasSynergy = checkItemSynergy(item);
  if (hasSynergy) {
    card.classList.add("has-synergy");
  }
  
  // Icon
  const icon = document.createElement("div");
  icon.className = "shop-icon";
  icon.innerHTML = getItemIconSVG(item.icon);
  card.appendChild(icon);
  
  // Name
  const name = document.createElement("div");
  name.className = "shop-name";
  name.textContent = item.name;
  card.appendChild(name);
  
  // Description
  const desc = document.createElement("div");
  desc.className = "shop-desc";
  desc.textContent = item.description;
  card.appendChild(desc);
  
  // Synergy indicator
  if (hasSynergy) {
    const synergy = document.createElement("div");
    synergy.className = "shop-synergy";
    synergy.textContent = "SYNERGY!";
    card.appendChild(synergy);
  }
  
  // Rarity badge
  const rarity = document.createElement("div");
  rarity.className = "shop-rarity";
  rarity.textContent = item.rarity.toUpperCase();
  card.appendChild(rarity);
  
  // Cost
  const cost = document.createElement("div");
  cost.className = "shop-cost";
  cost.textContent = item.cost.toLocaleString() + " pts";
  card.appendChild(cost);
  
  // Click handler
  card.onclick = () => {
    if (canAfford) {
      purchaseItem(item.id);
      closeShop();
    }
  };
  
  return card;
}

function checkItemSynergy(item: Item): boolean {
  if (!item.synergiesWith) return false;
  
  for (const synergyId of item.synergiesWith) {
    if (player.progression.items.includes(synergyId)) {
      return true;
    }
  }
  return false;
}

function getActiveSynergies(): string[] {
  const synergies: string[] = [];
  
  for (const itemId of player.progression.items) {
    const item = getItem(itemId);
    if (!item || !item.synergiesWith) continue;
    
    for (const synergyId of item.synergiesWith) {
      if (player.progression.items.includes(synergyId)) {
        const synergyKey = [itemId, synergyId].sort().join("+");
        if (!synergies.includes(synergyKey)) {
          synergies.push(synergyKey);
        }
      }
    }
  }
  
  return synergies;
}

function getItemIconSVG(iconType: string): string {
  // Procedural icons based on type
  const icons: Record<string, string> = {
    accel: '<svg viewBox="0 0 60 60"><path d="M30 10 L50 50 H10 Z" fill="currentColor"/><rect x="27" y="25" width="6" height="20" fill="#00e5ff"/></svg>',
    split: '<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="8" fill="currentColor"/><path d="M30 22 L20 10 M30 22 L40 10" stroke="currentColor" stroke-width="3" fill="none"/></svg>',
    boom: '<svg viewBox="0 0 60 60"><path d="M10 30 Q30 10 50 30 Q30 50 10 30" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="30" cy="30" r="5" fill="currentColor"/></svg>',
    tesla: '<svg viewBox="0 0 60 60"><path d="M15 50 L25 30 L20 30 L30 10 L25 25 L30 25 L20 50" fill="#ffff00"/></svg>',
    mirror: '<svg viewBox="0 0 60 60"><rect x="28" y="10" width="4" height="40" fill="currentColor"/><circle cx="15" cy="30" r="6" fill="#00e5ff"/><circle cx="45" cy="30" r="6" fill="#00e5ff"/></svg>',
    drill: '<svg viewBox="0 0 60 60"><path d="M30 10 L35 25 L32 25 L32 45 L28 45 L28 25 L25 25 Z" fill="currentColor"/><path d="M25 45 L30 55 L35 45" fill="currentColor"/></svg>',
    chain: '<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="10" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="15" cy="20" r="5" fill="#ff6600"/><circle cx="45" cy="20" r="5" fill="#ff6600"/><circle cx="30" cy="50" r="5" fill="#ff6600"/></svg>',
    snow: '<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="8" fill="currentColor"/><circle cx="30" cy="30" r="15" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="5,5"/></svg>',
    rubber: '<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="12" fill="currentColor"/><path d="M15 45 L45 15" stroke="#00e5ff" stroke-width="2"/></svg>',
    damage: '<svg viewBox="0 0 60 60"><rect x="25" y="10" width="10" height="40" rx="2" fill="currentColor"/><rect x="15" y="25" width="30" height="10" rx="2" fill="currentColor"/></svg>',
    speed: '<svg viewBox="0 0 60 60"><path d="M10 35 L40 35 L35 25 L50 35 L35 45 L40 35" fill="currentColor"/><path d="M10 25 L25 25" stroke="currentColor" stroke-width="2"/><path d="M10 45 L25 45" stroke="currentColor" stroke-width="2"/></svg>',
    aura: '<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="8" fill="currentColor"/><circle cx="30" cy="30" r="15" fill="none" stroke="#ff00ff" stroke-width="2"/><circle cx="30" cy="30" r="22" fill="none" stroke="#ff00ff" stroke-width="1" opacity="0.5"/></svg>',
    overclock: '<svg viewBox="0 0 60 60"><rect x="27" y="10" width="6" height="35" fill="currentColor"/><circle cx="30" cy="50" r="6" fill="#ff6600"/></svg>',
    minigun: '<svg viewBox="0 0 60 60"><rect x="25" y="15" width="3" height="30" fill="currentColor"/><rect x="29" y="15" width="3" height="30" fill="currentColor"/><rect x="33" y="15" width="3" height="30" fill="currentColor"/><rect x="20" y="40" width="20" height="8" rx="2" fill="currentColor"/></svg>',
    tracer: '<svg viewBox="0 0 60 60"><circle cx="20" cy="30" r="4" fill="currentColor"/><circle cx="30" cy="30" r="4" fill="#ffff00"/><circle cx="40" cy="30" r="4" fill="currentColor"/></svg>',
    spray: '<svg viewBox="0 0 60 60"><path d="M25 45 L30 10 L35 45" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="20" cy="15" r="3" fill="currentColor"/><circle cx="40" cy="15" r="3" fill="currentColor"/></svg>',
    burst: '<svg viewBox="0 0 60 60"><circle cx="30" cy="20" r="4" fill="currentColor"/><circle cx="30" cy="32" r="4" fill="currentColor"/><circle cx="30" cy="44" r="4" fill="currentColor"/></svg>',
    side: '<svg viewBox="0 0 60 60"><rect x="28" y="20" width="4" height="25" fill="currentColor"/><rect x="15" y="30" width="10" height="4" transform="rotate(-45 20 32)" fill="currentColor"/><rect x="35" y="30" width="10" height="4" transform="rotate(45 40 32)" fill="currentColor"/></svg>',
    twin: '<svg viewBox="0 0 60 60"><rect x="22" y="15" width="4" height="30" fill="#00e5ff"/><rect x="34" y="15" width="4" height="30" fill="#00e5ff"/></svg>',
    cluster: '<svg viewBox="0 0 60 60"><path d="M30 10 L35 30 L30 25 L25 30 Z" fill="#e53e3e"/><circle cx="20" cy="45" r="4" fill="#e53e3e"/><circle cx="30" cy="50" r="4" fill="#e53e3e"/><circle cx="40" cy="45" r="4" fill="#e53e3e"/></svg>',
    mirv: '<svg viewBox="0 0 60 60"><path d="M30 10 L35 35 L30 30 L25 35 Z" fill="#e53e3e"/><circle cx="20" cy="48" r="4" fill="#00e5ff"/><circle cx="30" cy="52" r="4" fill="#00e5ff"/><circle cx="40" cy="48" r="4" fill="#00e5ff"/></svg>',
    napalm: '<svg viewBox="0 0 60 60"><path d="M30 10 L35 30 L30 25 L25 30 Z" fill="#e53e3e"/><path d="M25 35 Q30 50 35 35" fill="#ff6600"/><path d="M20 40 Q30 55 40 40" fill="#ff4400" opacity="0.7"/></svg>',
    mega: '<svg viewBox="0 0 60 60"><path d="M30 5 L40 40 L30 30 L20 40 Z" fill="#e53e3e" transform="scale(1.3) translate(-7,-5)"/></svg>',
    seeker: '<svg viewBox="0 0 60 60"><path d="M30 10 L35 35 L30 30 L25 35 Z" fill="#e53e3e"/><circle cx="30" cy="20" r="3" fill="#00e5ff"/><path d="M20 25 Q30 15 40 25" stroke="#00e5ff" stroke-width="2" fill="none"/></svg>',
    prox: '<svg viewBox="0 0 60 60"><path d="M30 15 L35 35 L30 30 L25 35 Z" fill="#e53e3e"/><circle cx="30" cy="40" r="12" fill="none" stroke="#ff6600" stroke-width="2" stroke-dasharray="3,3"/></svg>',
    barrage: '<svg viewBox="0 0 60 60"><path d="M20 15 L23 40 L20 35 L17 40 Z" fill="#e53e3e"/><path d="M30 10 L33 35 L30 30 L27 35 Z" fill="#e53e3e"/><path d="M40 15 L43 40 L40 35 L37 40 Z" fill="#e53e3e"/></svg>',
    nuke: '<svg viewBox="0 0 60 60"><path d="M30 10 L35 35 L30 30 L25 35 Z" fill="#e53e3e"/><circle cx="30" cy="45" r="10" fill="none" stroke="#ffff00" stroke-width="3"/><circle cx="30" cy="45" r="5" fill="#ffff00"/></svg>',
    after: '<svg viewBox="0 0 60 60"><path d="M30 15 L35 35 L30 30 L25 35 Z" fill="#e53e3e"/><path d="M27 40 L30 55 L33 40" fill="#ff6600"/><path d="M25 45 L30 60 L35 45" fill="#ff8800" opacity="0.6"/></svg>',
    emp: '<svg viewBox="0 0 60 60"><path d="M30 15 L35 35 L30 30 L25 35 Z" fill="#e53e3e"/><circle cx="30" cy="45" r="8" fill="none" stroke="#00e5ff" stroke-width="2"/><path d="M22 45 L38 45 M30 37 L30 53" stroke="#00e5ff" stroke-width="2"/></svg>',
    fractal: '<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="6" fill="currentColor"/><circle cx="18" cy="18" r="4" fill="currentColor"/><circle cx="42" cy="18" r="4" fill="currentColor"/><circle cx="18" cy="42" r="4" fill="currentColor"/><circle cx="42" cy="42" r="4" fill="currentColor"/><circle cx="10" cy="10" r="2" fill="currentColor"/><circle cx="50" cy="10" r="2" fill="currentColor"/></svg>',
    turret: '<svg viewBox="0 0 60 60"><rect x="25" y="30" width="10" height="15" fill="currentColor"/><rect x="28" y="15" width="4" height="20" fill="currentColor"/><circle cx="30" cy="38" r="8" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    living: '<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="8" fill="currentColor"/><circle cx="27" cy="28" r="2" fill="#00e5ff"/><circle cx="33" cy="28" r="2" fill="#00e5ff"/><path d="M26 33 Q30 36 34 33" stroke="#00e5ff" stroke-width="2" fill="none"/><circle cx="15" cy="20" r="4" fill="currentColor" opacity="0.5"/><circle cx="45" cy="40" r="4" fill="currentColor" opacity="0.5"/></svg>',
  };
  return icons[iconType] || '<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="15" fill="currentColor"/></svg>';
}

function hideShopUI(): void {
  const shopScreen = document.getElementById("shopScreen");
  if (shopScreen) {
    shopScreen.classList.add("hidden");
  }
}

// ============= RENDERING =============

function render(): void {
  const era = eras[currentEra];
  
  // Clear with sky color
  ctx.fillStyle = era.skyColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Apply screen shake
  if (screenShake.duration > 0) {
    const shakeX = (Math.random() - 0.5) * screenShake.intensity;
    const shakeY = (Math.random() - 0.5) * screenShake.intensity;
    ctx.translate(shakeX, shakeY);
  }
  
  // Draw background clouds (far)
  drawClouds(0);
  
  // Draw mid clouds
  drawClouds(1);
  
  // Draw pickups
  drawPickups();
  
  // Draw bullets
  drawBullets();
  
  // Draw enemies
  drawEnemies();
  
  // Draw player
  drawPlayer();
  
  // Draw particles
  drawParticles();
  
  // Draw near clouds (for depth)
  drawClouds(2);
  
  // Reset transform
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  
  // Update HUD
  updateHUD();
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
  
  if (gameState === "playing") {
    updatePlayer(dt);
    updateBullets(dt);
    updateEnemies(dt);
    updatePickups(dt);
    updateParticles(dt);
    updateClouds();
    updateWaveSystem(dt);
    checkPlayerEnemyCollision();
    
    // Update combo timer
    if (player.progression.comboTimer > 0) {
      player.progression.comboTimer -= dt;
      if (player.progression.comboTimer <= 0) {
        player.progression.combo = 0;
      }
    }
  } else if (gameState === "weapon_select" || gameState === "shop") {
    // Game is paused - just render
  }
  
  render();
  requestAnimationFrame(gameLoop);
}

// ============= GAME FLOW =============

function resetGame(): void {
  console.log("[resetGame] Resetting all game state");
  
  // Reset player position and state
  player.x = 0;
  player.y = 0;
  player.vx = 0;
  player.vy = 0;
  player.angle = -Math.PI / 2;
  player.lives = 3;
  player.invulnerableTime = 1;
  player.weaponClass = "none";
  player.fireRate = 6;
  player.baseFireRate = 6;
  
  // Reset progression
  player.progression = {
    points: 0,
    xp: 0,
    waveLevel: 1,
    combo: 0,
    comboTimer: 0,
    items: [],
  };
  
  // Reset computed stats
  player.computedStats = {
    damageMultiplier: 1,
    fireRateMultiplier: 1,
    bulletSpeedMultiplier: 1,
    bulletSizeMultiplier: 1,
    piercing: 0,
    homing: false,
    bounces: 0,
    splitting: false,
    splitCount: 2,
    explosionRadius: 0,
    chainLightning: false,
    boomerang: false,
    trail: false,
    aura: false,
  };
  
  // Clear all entity arrays
  bullets.length = 0;
  enemies.length = 0;
  particles.length = 0;
  pickups.length = 0;
  
  // Reset game stats
  score = 0;
  currentEra = 0;
  enemiesKilled = 0;
  enemiesKilledThisEra = 0;
  bossesDefeated = 0;
  totalEnemiesDestroyed = 0;
  
  // Reset wave state
  currentWave = 0;
  waveState = "waiting";
  waveCountdown = 3;
  enemiesKilledThisWave = 0;
  enemiesSpawnedThisWave = 0;
  waveEnemyCount = 0;
  
  // Reset spawn timers
  enemySpawnTimer = 0;
  bossSpawned = false;
  bossActive = false;
  
  // Reset camera
  camera.x = 0;
  camera.y = 0;
  
  // Reinit clouds
  initClouds();
}

function startGame(): void {
  console.log("[startGame] Starting new game");
  
  resetGame();
  
  gameState = "playing";
  waveState = "waiting";
  waveCountdown = 2;
  
  // Hide all overlays
  document.getElementById("startScreen")!.classList.add("hidden");
  document.getElementById("gameOverScreen")!.classList.add("hidden");
  document.getElementById("weaponSelectScreen")!.classList.add("hidden");
  const shopScreen = document.getElementById("shopScreen");
  if (shopScreen) shopScreen.classList.add("hidden");
  
  document.getElementById("hud")!.style.display = "flex";
  
  updateLivesDisplay();
  updateEraDisplay();
  updateWaveDisplay();
  updatePointsDisplay();
  updateEnemiesBar();
}

function gameOver(): void {
  console.log("[gameOver] Game over! Score:", score);
  gameState = "gameover";
  
  // Submit score
  if (typeof (window as unknown as { submitScore?: (score: number) => void }).submitScore === "function") {
    (window as unknown as { submitScore: (score: number) => void }).submitScore(score);
  }
  
  // Check high score
  const isNewHighScore = score > highScore;
  if (isNewHighScore) {
    highScore = score;
    localStorage.setItem("timepilot_highscore", highScore.toString());
  }
  
  // Update UI
  document.getElementById("finalScore")!.textContent = score.toLocaleString();
  document.getElementById("enemiesDestroyed")!.textContent = totalEnemiesDestroyed.toString();
  document.getElementById("erasReached")!.textContent = (currentEra + 1).toString();
  document.getElementById("bossesDefeated")!.textContent = bossesDefeated.toString();
  
  const badge = document.getElementById("highScoreBadge")!;
  if (isNewHighScore) {
    badge.classList.add("show");
  } else {
    badge.classList.remove("show");
  }
  
  document.getElementById("hud")!.style.display = "none";
  document.getElementById("gameOverScreen")!.classList.remove("hidden");
}

// ============= INPUT HANDLING =============

function setupInput(): void {
  // Keyboard
  window.addEventListener("keydown", (e) => {
    keys[e.key.toLowerCase()] = true;
  });
  
  window.addEventListener("keyup", (e) => {
    keys[e.key.toLowerCase()] = false;
  });
  
  // Mouse
  canvas.addEventListener("mousedown", () => {
    mouseDown = true;
  });
  
  canvas.addEventListener("mouseup", () => {
    mouseDown = false;
  });
  
  canvas.addEventListener("mouseleave", () => {
    mouseDown = false;
  });
  
  // Mobile controls
  if (isMobile) {
    setupMobileControls();
  }
  
  // Buttons
  document.getElementById("startButton")!.onclick = startGame;
  document.getElementById("restartButton")!.onclick = startGame;

  // Weapon cards
  document.getElementById("machineGunCard")!.onclick = () => selectWeapon("machine_gun");
  document.getElementById("rocketsCard")!.onclick = () => selectWeapon("rockets");
  
  // Shop skip button
  const skipBtn = document.getElementById("shopSkipButton");
  if (skipBtn) {
    skipBtn.onclick = closeShop;
  }
}

function setupMobileControls(): void {
  const joystickZone = document.getElementById("moveJoystick")!;
  const joystickThumb = document.getElementById("moveThumb")!;
  const fireBtn = document.getElementById("fireButton")!;
  
  let touchId: number | null = null;
  
  const handleJoystick = (touch: Touch) => {
    const rect = joystickZone.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxDist = rect.width / 2 - 25;
    
    let dx = touch.clientX - centerX;
    let dy = touch.clientY - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist > maxDist) {
      dx = (dx / dist) * maxDist;
      dy = (dy / dist) * maxDist;
    }
    
    moveJoystick.angle = Math.atan2(dy, dx);
    moveJoystick.magnitude = Math.min(dist / maxDist, 1);
    moveJoystick.active = true;
    
    joystickThumb.style.transform = "translate(calc(-50% + " + dx + "px), calc(-50% + " + dy + "px))";
  };
  
  const resetJoystick = () => {
    moveJoystick.active = false;
    moveJoystick.magnitude = 0;
    joystickThumb.style.transform = "translate(-50%, -50%)";
  };
  
  document.addEventListener("touchstart", (e) => {
    for (const touch of Array.from(e.changedTouches)) {
      const rect = joystickZone.getBoundingClientRect();
      if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
          touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
        touchId = touch.identifier;
        handleJoystick(touch);
      }
    }
  });
  
  document.addEventListener("touchmove", (e) => {
    for (const touch of Array.from(e.changedTouches)) {
      if (touch.identifier === touchId) {
        handleJoystick(touch);
      }
    }
  });
  
  document.addEventListener("touchend", (e) => {
    for (const touch of Array.from(e.changedTouches)) {
      if (touch.identifier === touchId) {
        touchId = null;
        resetJoystick();
      }
    }
  });
  
  // Fire button
  fireBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    fireButtonPressed = true;
  });
  
  fireBtn.addEventListener("touchend", () => {
    fireButtonPressed = false;
  });
}

// ============= CANVAS SETUP =============

function resizeCanvas(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  console.log("[resizeCanvas] Canvas:", canvas.width, "x", canvas.height);
}

// ============= INITIALIZATION =============

function init(): void {
  console.log("[init] Initializing Time Pilot");
  
  canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
  ctx = canvas.getContext("2d")!;
  
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  
  // Load high score
  const savedHighScore = localStorage.getItem("timepilot_highscore");
  if (savedHighScore) {
    highScore = parseInt(savedHighScore, 10);
  }
  
  initClouds();
  setupInput();
  
  requestAnimationFrame(gameLoop);
}

// Start when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
