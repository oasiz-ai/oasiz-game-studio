/**
 * PAPER PLANET - A doodly roguelike planet defender
 * 
 * Features:
 * - Twin-stick shooting with WASD + mouse
 * - Data-driven enemies, bullets, items, and bosses
 * - Synergy-first item system with tags and effects
 * - Round-based progression with escalating difficulty
 * - Flash-inspired hand-drawn aesthetic
 */

// Import JSON data directly (gets bundled by Vite)
import bulletsJson from "../data/bullets.json";
import enemiesJson from "../data/enemies.json";
import itemsJson from "../data/items.json";
import roundsJson from "../data/rounds.json";
import statusEffectsJson from "../data/status-effects.json";

// ============= TYPE DEFINITIONS =============

interface Vec2 {
  x: number;
  y: number;
}

interface BulletData {
  id: string;
  name: string;
  baseDamage: number;
  fireRateMultiplier: number;
  speed: number;
  lifetime: number;
  collisionRadius: number;
  pierce: number;
  bounce: number;
  chain: number;
  chainRange?: number;
  chainDamageMultiplier?: number;
  aoeRadius: number;
  damageType: string;
  statusEffects: { type: string; stacks: number; chance: number }[];
  knockback?: number;
  spread?: { count: number; angle: number };
  homing?: { enabled: boolean; turnRate: number; seekRadius: number };
  onHit?: { spawnProjectile: string; count: number; chance: number };
  visual: {
    shape: string;
    color: string;
    radius?: number;
    length?: number;
    width?: number;
    height?: number;
  };
}

interface EnemyData {
  id: string;
  name: string;
  hp: number;
  speed: number;
  dashSpeed?: number;
  contactDamage: number;
  attackStyle: string;
  behaviorProfile: string;
  behaviorParams?: Record<string, number>;
  projectile?: { damage: number; speed: number; fireRate: number };
  spawnCost: number;
  xpValue: number;
  drops: { currency: { min: number; max: number } };
  onDeath?: { spawn: string; count: number };
  shield?: { frontalReduction: number; arcDegrees: number };
  visual: {
    shape: string;
    color: string;
    radius?: number;
    size?: number;
    outlineWidth: number;
    shieldColor?: string;
    image?: string;
  };
}

interface ItemData {
  id: string;
  name: string;
  description: string;
  rarity: string;
  type: string;
  duration?: number;
  tags: string[];
  effects: ItemEffect[];
  stacking?: string;
  stackBonus?: Record<string, number>;
}

interface ItemEffect {
  type: string;
  stat?: string;
  value?: number;
  spawnProjectile?: string;
  applyStatus?: string;
  count?: number;
  chance?: number;
  stacks?: number;
  heal?: number;
  createEntity?: string;
  ifTag?: string;
  then?: ItemEffect;
  teleportToNearest?: boolean;
  range?: number;
  duration?: number;
}

interface RoundData {
  round: number;
  spawnBudget: number;
  spawnPattern: string;
  enemyPool: string[];
  spawnInterval: number;
  burstSize?: number;
  isBoss?: boolean;
  bossId?: string;
  additionalEnemies?: {
    spawnBudget: number;
    enemyPool: string[];
    spawnInterval: number;
  };
}

interface StatusEffectData {
  id: string;
  name: string;
  type: string;
  damagePerSecond?: number;
  damagePerStack?: number;
  speedMultiplier?: number;
  damageMultiplier?: number;
  stunDuration?: number;
  duration: number;
  maxStacks: number;
  visual: { color: string };
}

// Runtime types
interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  lifetime: number;
  maxLifetime: number;
  radius: number;
  pierce: number;
  pierceCount: number;
  bounce: number;
  chain: number;
  chainRange: number;
  chainDamageMultiplier: number;
  aoeRadius: number;
  damageType: string;
  statusEffects: { type: string; stacks: number; chance: number }[];
  knockback: number;
  homing?: { turnRate: number; seekRadius: number };
  visual: BulletData["visual"];
  hitEnemies: Set<number>;
  isPlayerProjectile: boolean;
  isMeteor?: boolean;
  showTutorial?: boolean;
}

interface Enemy {
  id: number;
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  speed: number;
  contactDamage: number;
  data: EnemyData;
  behaviorState: Record<string, unknown>;
  statusEffects: Map<string, { stacks: number; duration: number }>;
  invulnerableTime: number;
  facingAngle: number;
  lastFireTime: number;
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
}

interface OwnedItem {
  data: ItemData;
  stacks: number;
  remainingRounds?: number;
}

// ============= GAME STATE =============

type GameState = "menu" | "playing" | "paused" | "reward" | "gameover";

let gameState: GameState = "menu";
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

// Data loaded from JSON
let bulletsData: BulletData[] = [];
let enemiesData: EnemyData[] = [];
let itemsData: ItemData[] = [];
let roundsData: { config: Record<string, unknown>; rounds: RoundData[] } = { config: {}, rounds: [] };
let statusEffectsData: StatusEffectData[] = [];

// Planet (central object to defend)
const planet = {
  x: 0,
  y: 0,
  radius: 120, // Larger planet
  hp: 100,
  maxHp: 100,
};

// Player state (orbits around planet)
const player = {
  orbitAngle: 0, // Angle around the planet (radians)
  orbitRadius: 135, // Sits on the planet surface
  orbitSpeed: 3.0, // Radians per second
  x: 0, // Computed from orbit
  y: 0, // Computed from orbit
  hp: 100,
  maxHp: 100,
  baseDamage: 10,
  fireRate: 5,
  lastFireTime: 0,
  projectileSpeed: 600,
  critChance: 0.05,
  critMultiplier: 2.0,
  pickupRadius: 50,
  luck: 0,
  damageReduction: 0,
  pierce: 0,
  bounce: 0,
  chain: 0,
  aoeRadius: 0,
  projectilesPerShot: 1,
  aimAngle: 0,
  invulnerableTime: 0,
  isBlocking: false,
  blockTime: 0,
  blockCooldown: 0,
};

// Meteor tracking
let meteorSpawnTimer = 0;
let meteorSpawnInterval = 8; // seconds between meteors
let hasShownMeteorTutorial = false;

// Game entities
let projectiles: Projectile[] = [];
let enemies: Enemy[] = [];
let particles: Particle[] = [];
let enemyIdCounter = 0;

// Round state
let currentRound = 1;
let roundTimer = 0;
let spawnTimer = 0;
let spawnBudgetRemaining = 0;
let enemiesKilledThisRound = 0;
let totalEnemiesKilled = 0;
let score = 0;

// Combo system
let combo = 0;
let comboTimer = 0;
const comboDecayTime = 2.0; // Seconds before combo starts decaying
const comboDecayRate = 5; // Combo lost per second after decay starts
let currencyEarned = 0; // Combo converted to currency at round end

// Items
let ownedItems: OwnedItem[] = [];
let shotCounter = 0;
let killCounter = 0;

// Reward screen targets
interface RewardTarget {
  x: number;
  y: number;
  width: number;
  height: number;
  item: ItemData | null; // null for skip
  cost: number;
}
let rewardTargets: RewardTarget[] = [];

// Image cache for enemy sprites
const imageCache: Map<string, HTMLImageElement> = new Map();

function loadImage(url: string): HTMLImageElement | null {
  if (imageCache.has(url)) {
    const img = imageCache.get(url)!;
    return img.complete ? img : null;
  }
  
  const img = new Image();
  img.src = url;
  imageCache.set(url, img);
  return null; // Not loaded yet
}

// Input state
const keys: Record<string, boolean> = {};
let mouseX = 0;
let mouseY = 0;
let mouseDown = false;
const isMobile = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

// Joystick state
const moveJoystick = { active: false, dx: 0, dy: 0 };
const aimJoystick = { active: false, dx: 0, dy: 0 };

// Screen shake
let screenShake = { intensity: 0, duration: 0 };

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

function randomInt(min: number, max: number): number {
  return Math.floor(randomRange(min, max + 1));
}

function weightedRandom<T extends { weight?: number }>(items: T[], weightKey = "weight"): T {
  const totalWeight = items.reduce((sum, item) => sum + ((item as Record<string, number>)[weightKey] || 1), 0);
  let random = Math.random() * totalWeight;
  for (const item of items) {
    random -= (item as Record<string, number>)[weightKey] || 1;
    if (random <= 0) return item;
  }
  return items[0];
}

function addScreenShake(intensity: number, duration: number): void {
  screenShake.intensity = Math.max(screenShake.intensity, intensity);
  screenShake.duration = Math.max(screenShake.duration, duration);
}

// ============= DATA LOADING =============

function loadGameData(): void {
  console.log("[loadGameData] Loading game data from bundled JSON...");
  
  // Data is imported at build time and bundled into the game
  bulletsData = bulletsJson.bullets;
  enemiesData = enemiesJson.enemies;
  itemsData = itemsJson.items;
  roundsData = roundsJson;
  statusEffectsData = statusEffectsJson.statusEffects;
  
  console.log("[loadGameData] Loaded:", {
    bullets: bulletsData.length,
    enemies: enemiesData.length,
    items: itemsData.length,
    rounds: roundsData.rounds.length,
    statusEffects: statusEffectsData.length,
  });
}

function getBulletData(id: string): BulletData | undefined {
  return bulletsData.find(b => b.id === id);
}

function getEnemyData(id: string): EnemyData | undefined {
  return enemiesData.find(e => e.id === id);
}

function getItemData(id: string): ItemData | undefined {
  return itemsData.find(i => i.id === id);
}

function getStatusEffectData(id: string): StatusEffectData | undefined {
  return statusEffectsData.find(s => s.id === id);
}

function getRoundData(round: number): RoundData | undefined {
  return roundsData.rounds.find(r => r.round === round);
}

// ============= PLAYER STATS =============

function getPlayerStat(stat: string): number {
  let base = (player as Record<string, number>)[stat] || 0;
  let additive = 0;
  let multiplicative = 1;

  for (const owned of ownedItems) {
    for (const effect of owned.data.effects) {
      if (effect.stat === stat) {
        if (effect.type === "stat_add") {
          additive += (effect.value || 0) * owned.stacks;
        } else if (effect.type === "stat_mult") {
          multiplicative *= effect.value || 1;
        } else if (effect.type === "stat_set") {
          return effect.value || 0;
        }
      }
    }
  }

  return (base + additive) * multiplicative;
}

// ============= PROJECTILE SYSTEM =============

function createPlayerProjectile(angle: number, bulletId = "pencil_shot"): void {
  const bulletData = getBulletData(bulletId);
  if (!bulletData) {
    console.log("[createPlayerProjectile] Unknown bullet type:", bulletId);
    return;
  }

  const damage = getPlayerStat("baseDamage") * (bulletData.baseDamage / 10);
  const speed = bulletData.speed;
  const pierce = bulletData.pierce + Math.floor(getPlayerStat("pierce"));
  const bounce = bulletData.bounce + Math.floor(getPlayerStat("bounce"));
  const chain = bulletData.chain + Math.floor(getPlayerStat("chain"));
  const aoeRadius = bulletData.aoeRadius + getPlayerStat("aoeRadius");

  const projectile: Projectile = {
    x: player.x,
    y: player.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    damage,
    lifetime: bulletData.lifetime,
    maxLifetime: bulletData.lifetime,
    radius: bulletData.collisionRadius,
    pierce,
    pierceCount: 0,
    bounce,
    chain,
    chainRange: bulletData.chainRange || 100,
    chainDamageMultiplier: bulletData.chainDamageMultiplier || 0.7,
    aoeRadius,
    damageType: bulletData.damageType,
    statusEffects: bulletData.statusEffects,
    knockback: bulletData.knockback || 0,
    homing: bulletData.homing?.enabled ? { turnRate: bulletData.homing.turnRate, seekRadius: bulletData.homing.seekRadius } : undefined,
    visual: bulletData.visual,
    hitEnemies: new Set(),
    isPlayerProjectile: true,
  };

  projectiles.push(projectile);

  // Handle spread shots
  if (bulletData.spread) {
    const spreadAngle = (bulletData.spread.angle * Math.PI) / 180;
    for (let i = 1; i < bulletData.spread.count; i++) {
      const offsetAngle = ((i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * spreadAngle) / (bulletData.spread.count - 1);
      const spreadProjectile = { ...projectile, hitEnemies: new Set<number>() };
      spreadProjectile.vx = Math.cos(angle + offsetAngle) * speed;
      spreadProjectile.vy = Math.sin(angle + offsetAngle) * speed;
      projectiles.push(spreadProjectile);
    }
  }
}

function firePlayerWeapon(): void {
  const now = performance.now() / 1000;
  const fireRate = getPlayerStat("fireRate");
  const fireInterval = 1 / fireRate;

  if (now - player.lastFireTime < fireInterval) return;
  player.lastFireTime = now;

  const projectilesPerShot = Math.max(1, Math.floor(getPlayerStat("projectilesPerShot")));
  
  for (let i = 0; i < projectilesPerShot; i++) {
    const spread = projectilesPerShot > 1 ? ((i - (projectilesPerShot - 1) / 2) * 0.1) : 0;
    createPlayerProjectile(player.aimAngle + spread);
  }

  shotCounter++;

  // Trigger on_shot effects
  for (const owned of ownedItems) {
    for (const effect of owned.data.effects) {
      if (effect.type === "on_shot" && effect.spawnProjectile) {
        if (Math.random() < (effect.chance || 1)) {
          for (let i = 0; i < (effect.count || 1); i++) {
            const angle = player.aimAngle + randomRange(-0.3, 0.3);
            createPlayerProjectile(angle, effect.spawnProjectile);
          }
        }
      }
      if (effect.type === "on_shot_count" && effect.count) {
        if (shotCounter % effect.count === 0) {
          // Create entity (like electric wall)
          console.log("[firePlayerWeapon] Triggered on_shot_count effect:", effect.createEntity);
        }
      }
    }
  }
}

function updateProjectiles(dt: number): void {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];

    // Homing behavior
    if (p.homing) {
      let nearestEnemy: Enemy | null = null;
      let nearestDist = p.homing.seekRadius;
      for (const enemy of enemies) {
        const dist = distance(p.x, p.y, enemy.x, enemy.y);
        if (dist < nearestDist && !p.hitEnemies.has(enemy.id)) {
          nearestDist = dist;
          nearestEnemy = enemy;
        }
      }
      if (nearestEnemy) {
        const targetAngle = Math.atan2(nearestEnemy.y - p.y, nearestEnemy.x - p.x);
        const currentAngle = Math.atan2(p.vy, p.vx);
        let angleDiff = targetAngle - currentAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        const turn = clamp(angleDiff, -p.homing.turnRate * dt, p.homing.turnRate * dt);
        const newAngle = currentAngle + turn;
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        p.vx = Math.cos(newAngle) * speed;
        p.vy = Math.sin(newAngle) * speed;
      }
    }

    // Move
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.lifetime -= dt;

    // Wall bounce
    if (p.bounce > 0) {
      if (p.x < p.radius || p.x > canvas.width - p.radius) {
        p.vx *= -1;
        p.bounce--;
        p.x = clamp(p.x, p.radius, canvas.width - p.radius);
      }
      if (p.y < p.radius || p.y > canvas.height - p.radius) {
        p.vy *= -1;
        p.bounce--;
        p.y = clamp(p.y, p.radius, canvas.height - p.radius);
      }
    }

    // Check collision with enemies (player projectiles)
    if (p.isPlayerProjectile) {
      for (const enemy of enemies) {
        if (p.hitEnemies.has(enemy.id)) continue;
        const dist = distance(p.x, p.y, enemy.x, enemy.y);
        const enemyRadius = enemy.data.visual.radius || enemy.data.visual.size || 15;
        if (dist < p.radius + enemyRadius) {
          p.hitEnemies.add(enemy.id);
          damageEnemy(enemy, p.damage, p);
          
          // Knockback
          if (p.knockback > 0) {
            const kb = normalize(enemy.x - p.x, enemy.y - p.y);
            enemy.vx += kb.x * p.knockback;
            enemy.vy += kb.y * p.knockback;
          }

          // AOE damage
          if (p.aoeRadius > 0) {
            for (const other of enemies) {
              if (other.id !== enemy.id && !p.hitEnemies.has(other.id)) {
                const aoeDist = distance(p.x, p.y, other.x, other.y);
                if (aoeDist < p.aoeRadius) {
                  p.hitEnemies.add(other.id);
                  damageEnemy(other, p.damage * 0.5, p);
                }
              }
            }
            // AOE particles
            for (let j = 0; j < 10; j++) {
              spawnParticle(p.x, p.y, p.visual.color, "explosion");
            }
          }

          // Chain to next enemy
          if (p.chain > 0) {
            let chainTarget: Enemy | null = null;
            let chainDist = p.chainRange;
            for (const other of enemies) {
              if (!p.hitEnemies.has(other.id)) {
                const d = distance(enemy.x, enemy.y, other.x, other.y);
                if (d < chainDist) {
                  chainDist = d;
                  chainTarget = other;
                }
              }
            }
            if (chainTarget) {
              const chainProjectile: Projectile = {
                ...p,
                x: enemy.x,
                y: enemy.y,
                vx: 0,
                vy: 0,
                damage: p.damage * p.chainDamageMultiplier,
                chain: p.chain - 1,
                hitEnemies: new Set(p.hitEnemies),
                lifetime: 0.1,
              };
              const angle = Math.atan2(chainTarget.y - enemy.y, chainTarget.x - enemy.x);
              const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
              chainProjectile.vx = Math.cos(angle) * speed;
              chainProjectile.vy = Math.sin(angle) * speed;
              projectiles.push(chainProjectile);
            }
          }

          // Pierce or destroy
          p.pierceCount++;
          if (p.pierceCount > p.pierce) {
            p.lifetime = 0;
          }
          break;
        }
      }
    }

    // Remove dead projectiles
    if (p.lifetime <= 0 || p.x < -100 || p.x > canvas.width + 100 || p.y < -100 || p.y > canvas.height + 100) {
      projectiles.splice(i, 1);
    }
  }
}

// ============= ENEMY SYSTEM =============

function spawnEnemy(typeId: string, x?: number, y?: number): Enemy | null {
  const data = getEnemyData(typeId);
  if (!data) {
    console.log("[spawnEnemy] Unknown enemy type:", typeId);
    return null;
  }

  // Random spawn position at screen edge if not specified
  if (x === undefined || y === undefined) {
    const side = Math.floor(Math.random() * 4);
    switch (side) {
      case 0: x = randomRange(0, canvas.width); y = -30; break;
      case 1: x = canvas.width + 30; y = randomRange(0, canvas.height); break;
      case 2: x = randomRange(0, canvas.width); y = canvas.height + 30; break;
      case 3: x = -30; y = randomRange(0, canvas.height); break;
    }
  }

  const config = roundsData.config as { scaling?: { hpMultiplierPerRound?: number; speedMultiplierPerRound?: number; damageMultiplierPerRound?: number } };
  const hpScale = 1 + (currentRound - 1) * (config.scaling?.hpMultiplierPerRound || 0.05);
  const speedScale = 1 + (currentRound - 1) * (config.scaling?.speedMultiplierPerRound || 0.02);

  const enemy: Enemy = {
    id: enemyIdCounter++,
    type: typeId,
    x: x!,
    y: y!,
    vx: 0,
    vy: 0,
    hp: data.hp * hpScale,
    maxHp: data.hp * hpScale,
    speed: data.speed * speedScale,
    contactDamage: data.contactDamage,
    data,
    behaviorState: {},
    statusEffects: new Map(),
    invulnerableTime: 0,
    facingAngle: 0,
    lastFireTime: 0,
  };

  enemies.push(enemy);
  return enemy;
}

function damageEnemy(enemy: Enemy, damage: number, projectile?: Projectile): void {
  if (enemy.invulnerableTime > 0) return;

  // Shield check
  if (enemy.data.shield) {
    const angleToPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    let angleDiff = Math.abs(angleToPlayer - enemy.facingAngle);
    while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - Math.PI * 2);
    const shieldArc = (enemy.data.shield.arcDegrees * Math.PI) / 180 / 2;
    if (angleDiff < shieldArc) {
      damage *= 1 - enemy.data.shield.frontalReduction;
    }
  }

  // Crit check
  if (Math.random() < getPlayerStat("critChance")) {
    damage *= getPlayerStat("critMultiplier");
    spawnParticle(enemy.x, enemy.y - 20, "#ffd700", "crit");
  }

  // Mark debuff
  const mark = enemy.statusEffects.get("mark");
  if (mark) {
    const markData = getStatusEffectData("mark");
    if (markData) {
      damage *= markData.damageMultiplier || 1.5;
    }
  }

  enemy.hp -= damage;
  enemy.invulnerableTime = 0.05;

  // Apply status effects from projectile
  if (projectile) {
    for (const se of projectile.statusEffects) {
      if (Math.random() < se.chance) {
        applyStatusEffect(enemy, se.type, se.stacks);
      }
    }
  }

  // Damage particles
  spawnParticle(enemy.x, enemy.y, enemy.data.visual.color, "hit");

  // Check death
  if (enemy.hp <= 0) {
    killEnemy(enemy);
  }
}

function killEnemy(enemy: Enemy): void {
  console.log("[killEnemy] Enemy killed:", enemy.type);
  
  // Death particles
  for (let i = 0; i < 8; i++) {
    spawnParticle(enemy.x, enemy.y, enemy.data.visual.color, "death");
  }

  // Score and tracking
  score += enemy.data.xpValue * 10;
  totalEnemiesKilled++;
  enemiesKilledThisRound++;
  killCounter++;

  // Combo system - increase combo and reset timer
  combo += 1 + Math.floor(combo * 0.1); // Combo grows faster at higher values
  comboTimer = comboDecayTime;

  // On death spawn
  if (enemy.data.onDeath) {
    for (let i = 0; i < enemy.data.onDeath.count; i++) {
      const offset = randomRange(-20, 20);
      spawnEnemy(enemy.data.onDeath.spawn, enemy.x + offset, enemy.y + offset);
    }
  }

  // On kill item effects
  for (const owned of ownedItems) {
    for (const effect of owned.data.effects) {
      if (effect.type === "on_kill_count" && effect.count) {
        if (killCounter % effect.count === 0 && effect.heal) {
          player.hp = Math.min(player.maxHp, player.hp + effect.heal);
        }
      }
    }
  }

  // Remove enemy
  const index = enemies.indexOf(enemy);
  if (index >= 0) enemies.splice(index, 1);

  addScreenShake(3, 0.1);
}

function applyStatusEffect(enemy: Enemy, effectId: string, stacks: number): void {
  const data = getStatusEffectData(effectId);
  if (!data) return;

  const existing = enemy.statusEffects.get(effectId);
  if (existing) {
    existing.stacks = Math.min(existing.stacks + stacks, data.maxStacks);
    existing.duration = data.duration;
  } else {
    enemy.statusEffects.set(effectId, { stacks, duration: data.duration });
  }
}

function updateEnemies(dt: number): void {
  for (const enemy of enemies) {
    // Update status effects
    for (const [effectId, effect] of enemy.statusEffects) {
      effect.duration -= dt;
      if (effect.duration <= 0) {
        enemy.statusEffects.delete(effectId);
        continue;
      }

      const data = getStatusEffectData(effectId);
      if (!data) continue;

      // DoT damage
      if (data.type === "dot" && data.damagePerSecond) {
        const dotDamage = (data.damagePerSecond + (data.damagePerStack || 0) * (effect.stacks - 1)) * dt;
        enemy.hp -= dotDamage;
        if (enemy.hp <= 0) {
          killEnemy(enemy);
          continue;
        }
      }
    }

    // Update invulnerability
    if (enemy.invulnerableTime > 0) {
      enemy.invulnerableTime -= dt;
    }

    // Get speed modifier from status effects
    let speedMod = 1;
    const slow = enemy.statusEffects.get("slow");
    if (slow) {
      const slowData = getStatusEffectData("slow");
      if (slowData) {
        speedMod *= slowData.speedMultiplier || 0.5;
      }
    }

    // Check stun
    const shock = enemy.statusEffects.get("shock");
    if (shock) {
      const shockData = getStatusEffectData("shock");
      if (shockData && shock.duration > shockData.duration - (shockData.stunDuration || 0)) {
        continue; // Stunned, skip movement
      }
    }

    // Behavior update
    updateEnemyBehavior(enemy, dt, speedMod);

    // Apply velocity
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;

    // Friction
    enemy.vx *= 0.9;
    enemy.vy *= 0.9;

    // Contact damage to planet (enemies reaching the planet damage it)
    const planetDist = distance(enemy.x, enemy.y, planet.x, planet.y);
    if (planetDist < planet.radius + 15) {
      damagePlanet(enemy.contactDamage);
      // Destroy enemy on contact with planet
      enemy.hp = 0; // Mark for removal
    }

    // Contact damage to player (if enemy touches orbiting player)
    const playerDist = distance(enemy.x, enemy.y, player.x, player.y);
    if (playerDist < 30 && player.invulnerableTime <= 0) {
      damagePlayer(enemy.contactDamage);
    }
  }
}

function updateEnemyBehavior(enemy: Enemy, dt: number, speedMod: number): void {
  const profile = enemy.data.behaviorProfile;
  const params = enemy.data.behaviorParams || {};
  // Enemies target the planet (center), not the player
  const toPlanet = normalize(planet.x - enemy.x, planet.y - enemy.y);
  enemy.facingAngle = Math.atan2(toPlanet.y, toPlanet.x);

  switch (profile) {
    case "drifter": {
      enemy.vx += toPlanet.x * enemy.speed * speedMod * dt * 2;
      enemy.vy += toPlanet.y * enemy.speed * speedMod * dt * 2;
      break;
    }

    case "zigzag": {
      const time = performance.now() / 1000;
      const wave = Math.sin(time * (params.waveFrequency || 3)) * (params.waveAmplitude || 50);
      const perpX = -toPlanet.y;
      const perpY = toPlanet.x;
      enemy.vx += (toPlanet.x * enemy.speed + perpX * wave) * speedMod * dt * 2;
      enemy.vy += (toPlanet.y * enemy.speed + perpY * wave) * speedMod * dt * 2;
      break;
    }

    case "dasher": {
      const state = enemy.behaviorState as { dashCooldown?: number; dashing?: boolean; dashTime?: number };
      state.dashCooldown = (state.dashCooldown || 0) - dt;

      if (state.dashing) {
        state.dashTime = (state.dashTime || 0) - dt;
        if (state.dashTime! <= 0) {
          state.dashing = false;
          state.dashCooldown = params.dashCooldown || 2;
        }
      } else if (state.dashCooldown! <= 0) {
        state.dashing = true;
        state.dashTime = params.dashDuration || 0.3;
        const dashSpeed = enemy.data.dashSpeed || 400;
        enemy.vx = toPlanet.x * dashSpeed;
        enemy.vy = toPlanet.y * dashSpeed;
      } else {
        // Slow approach
        enemy.vx += toPlanet.x * enemy.speed * speedMod * dt * 0.5;
        enemy.vy += toPlanet.y * enemy.speed * speedMod * dt * 0.5;
      }
      break;
    }

    case "orbiter": {
      const orbitRadius = params.orbitRadius || 200;
      const orbitSpeed = params.orbitSpeed || 2;
      const state = enemy.behaviorState as { angle?: number };
      state.angle = (state.angle || Math.atan2(enemy.y - planet.y, enemy.x - planet.x)) + orbitSpeed * dt;
      
      const targetX = planet.x + Math.cos(state.angle) * orbitRadius;
      const targetY = planet.y + Math.sin(state.angle) * orbitRadius;
      
      enemy.vx += (targetX - enemy.x) * 3 * dt;
      enemy.vy += (targetY - enemy.y) * 3 * dt;

      // Fire at planet
      if (enemy.data.projectile) {
        const now = performance.now() / 1000;
        if (now - enemy.lastFireTime > 1 / enemy.data.projectile.fireRate) {
          enemy.lastFireTime = now;
          createEnemyProjectile(enemy);
        }
      }
      break;
    }

    case "sniper": {
      const preferredDist = params.preferredDistance || 300;
      const dist = distance(enemy.x, enemy.y, planet.x, planet.y);
      
      if (dist < preferredDist - 50) {
        // Too close, back up
        enemy.vx -= toPlanet.x * enemy.speed * speedMod * dt * 2;
        enemy.vy -= toPlanet.y * enemy.speed * speedMod * dt * 2;
      } else if (dist > preferredDist + 50) {
        // Too far, approach
        enemy.vx += toPlanet.x * enemy.speed * speedMod * dt * 2;
        enemy.vy += toPlanet.y * enemy.speed * speedMod * dt * 2;
      }

      // Fire at planet
      if (enemy.data.projectile) {
        const now = performance.now() / 1000;
        if (now - enemy.lastFireTime > 1 / enemy.data.projectile.fireRate) {
          enemy.lastFireTime = now;
          createEnemyProjectile(enemy);
        }
      }
      break;
    }

    case "bomber": {
      const state = enemy.behaviorState as { retreating?: boolean; bombDropped?: boolean };
      const dropRadius = params.dropRadius || 80;
      const dist = distance(enemy.x, enemy.y, planet.x, planet.y);

      if (state.retreating) {
        enemy.vx -= toPlanet.x * enemy.speed * speedMod * dt * 3;
        enemy.vy -= toPlanet.y * enemy.speed * speedMod * dt * 3;
        if (dist > (params.retreatDistance || 250)) {
          state.retreating = false;
          state.bombDropped = false;
        }
      } else {
        enemy.vx += toPlanet.x * enemy.speed * speedMod * dt * 3;
        enemy.vy += toPlanet.y * enemy.speed * speedMod * dt * 3;
        if (dist < dropRadius && !state.bombDropped) {
          // Drop bomb (simplified - just damage)
          state.bombDropped = true;
          state.retreating = true;
          spawnParticle(enemy.x, enemy.y, "#ff9f43", "bomb");
        }
      }
      break;
    }

    default: {
      // Default to drifter behavior - head toward planet
      enemy.vx += toPlanet.x * enemy.speed * speedMod * dt * 2;
      enemy.vy += toPlanet.y * enemy.speed * speedMod * dt * 2;
    }
  }
}

function createEnemyProjectile(enemy: Enemy): void {
  if (!enemy.data.projectile) return;

  const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
  const projectile: Projectile = {
    x: enemy.x,
    y: enemy.y,
    vx: Math.cos(angle) * enemy.data.projectile.speed,
    vy: Math.sin(angle) * enemy.data.projectile.speed,
    damage: enemy.data.projectile.damage,
    lifetime: 3,
    maxLifetime: 3,
    radius: 6,
    pierce: 0,
    pierceCount: 0,
    bounce: 0,
    chain: 0,
    chainRange: 0,
    chainDamageMultiplier: 0,
    aoeRadius: 0,
    damageType: "kinetic",
    statusEffects: [],
    knockback: 0,
    visual: { shape: "circle", color: "#ff4444", radius: 6 },
    hitEnemies: new Set(),
    isPlayerProjectile: false,
  };

  projectiles.push(projectile);
}

function spawnMeteor(): void {
  console.log("[spawnMeteor] Spawning meteor targeting player");
  
  // Spawn from edge of screen, aimed at player
  const angle = Math.random() * Math.PI * 2;
  const spawnDist = Math.max(canvas.width, canvas.height) * 0.7;
  const spawnX = planet.x + Math.cos(angle) * spawnDist;
  const spawnY = planet.y + Math.sin(angle) * spawnDist;
  
  // Aim at player's current position
  const toPlayer = normalize(player.x - spawnX, player.y - spawnY);
  const speed = 180 + currentRound * 10;
  
  const showTutorial = !hasShownMeteorTutorial;
  hasShownMeteorTutorial = true;
  
  const meteor: Projectile = {
    x: spawnX,
    y: spawnY,
    vx: toPlayer.x * speed,
    vy: toPlayer.y * speed,
    damage: 25,
    lifetime: 8,
    maxLifetime: 8,
    radius: 18,
    pierce: 0,
    pierceCount: 0,
    bounce: 0,
    chain: 0,
    chainRange: 0,
    chainDamageMultiplier: 0,
    aoeRadius: 0,
    damageType: "fire",
    statusEffects: [],
    knockback: 0,
    visual: { shape: "circle", color: "#ff9800", radius: 18, trail: true, trailColor: "#ff5722" },
    hitEnemies: new Set(),
    isPlayerProjectile: false,
    isMeteor: true,
    showTutorial,
  };
  
  projectiles.push(meteor);
}

// ============= PLANET =============

function damagePlanet(damage: number): void {
  planet.hp -= damage;
  console.log("[damagePlanet] Planet took", damage, "damage. HP:", planet.hp);

  addScreenShake(10, 0.3);
  spawnParticle(planet.x, planet.y, "#ff6b6b", "hit");

  if (planet.hp <= 0) {
    planet.hp = 0;
    gameOver();
  }
}

// ============= PLAYER =============

function damagePlayer(damage: number): void {
  // Blocking makes player immune
  if (player.isBlocking) {
    spawnParticle(player.x, player.y, "#4fc3f7", "block");
    addScreenShake(3, 0.1);
    return;
  }
  
  if (player.invulnerableTime > 0) return;

  const reduction = getPlayerStat("damageReduction");
  const actualDamage = damage * (1 - reduction);
  
  player.hp -= actualDamage;
  player.invulnerableTime = 0.5;

  addScreenShake(8, 0.2);
  spawnParticle(player.x, player.y, "#ff6b6b", "hit");

  if (player.hp <= 0) {
    gameOver();
  }
}

function activateBlock(): void {
  if (player.blockCooldown > 0) return;
  
  console.log("[activateBlock] Block activated!");
  player.isBlocking = true;
  player.blockTime = 0.5; // Block lasts 0.5 seconds
  player.blockCooldown = 2.0; // 2 second cooldown
  
  // Visual feedback
  spawnParticle(player.x, player.y, "#4fc3f7", "shield");
}

function getClosestEnemy(): Enemy | null {
  let closest: Enemy | null = null;
  let minDist = Infinity;
  for (const enemy of enemies) {
    // Check if enemy is blocked by the planet
    if (!hasLineOfSight(player.x, player.y, enemy.x, enemy.y, planet.x, planet.y, planet.radius - 5)) {
      continue;
    }

    const d = distance(player.x, player.y, enemy.x, enemy.y);
    if (d < minDist) {
      minDist = d;
      closest = enemy;
    }
  }
  return closest;
}

function hasLineOfSight(x1: number, y1: number, x2: number, y2: number, cx: number, cy: number, r: number): boolean {
  // Check distance from center (cx, cy) to line segment (x1, y1) -> (x2, y2)
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(x1, y1, cx, cy) > r;

  // Projection of center onto the line
  let t = ((cx - x1) * dx + (cy - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;

  const distSq = (cx - closestX) ** 2 + (cy - closestY) ** 2;
  return distSq > r * r;
}

function updatePlayer(dt: number): void {
  // Orbital movement: A = counter-clockwise, D = clockwise
  let rotationDir = 0;

  if (isMobile) {
    rotationDir = -moveJoystick.dx; // Left stick horizontal for rotation
  } else {
    if (keys["a"] || keys["arrowleft"]) rotationDir -= 1;
    if (keys["d"] || keys["arrowright"]) rotationDir += 1;
  }

  // Update orbit angle
  player.orbitAngle += rotationDir * player.orbitSpeed * dt;

  // Compute player position from orbit
  player.x = planet.x + Math.cos(player.orbitAngle) * player.orbitRadius;
  player.y = planet.y + Math.sin(player.orbitAngle) * player.orbitRadius;

  // Update aim (point toward mouse/touch, or auto-aim)
  let manuallyAiming = false;
  if (isMobile) {
    if (aimJoystick.active && (aimJoystick.dx !== 0 || aimJoystick.dy !== 0)) {
      player.aimAngle = Math.atan2(aimJoystick.dy, aimJoystick.dx);
      manuallyAiming = true;
    }
  } else {
    // On desktop, we consider it manual aiming if the mouse button is down 
    // OR if we want to always track mouse. But to allow auto-aim, 
    // let's say it auto-aims when NOT clicking.
    if (mouseDown) {
      player.aimAngle = Math.atan2(mouseY - player.y, mouseX - player.x);
      manuallyAiming = true;
    }
  }

  if (!manuallyAiming) {
    const closest = getClosestEnemy();
    if (closest) {
      player.aimAngle = Math.atan2(closest.y - player.y, closest.x - player.x);
    } else if (!isMobile) {
      // Default to mouse position if no enemies and on desktop
      player.aimAngle = Math.atan2(mouseY - player.y, mouseX - player.x);
    }
  }

  // Auto-fire weapon during gameplay
  firePlayerWeapon();

  // Update invulnerability
  if (player.invulnerableTime > 0) {
    player.invulnerableTime -= dt;
  }

  // Update block timer
  if (player.isBlocking) {
    player.blockTime -= dt;
    if (player.blockTime <= 0) {
      player.isBlocking = false;
    }
  }

  // Update block cooldown
  if (player.blockCooldown > 0) {
    player.blockCooldown -= dt;
  }

  // Spawn meteors periodically (target the player)
  meteorSpawnTimer -= dt;
  if (meteorSpawnTimer <= 0 && gameState === "playing") {
    spawnMeteor();
    meteorSpawnTimer = meteorSpawnInterval;
    // Speed up meteor spawns over time
    meteorSpawnInterval = Math.max(4, meteorSpawnInterval - 0.5);
  }

  // Check collision with projectiles hitting the planet or player
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    
    // Check if projectile hits planet
    const planetDist = distance(p.x, p.y, planet.x, planet.y);
    if (planetDist < p.radius + planet.radius - 10) { // Slight buffer so they don't pop instantly on fire
      if (!p.isPlayerProjectile) {
        damagePlanet(p.damage);
      }
      projectiles.splice(i, 1);
      continue;
    }

    // Check if projectile hits player (only for enemy projectiles)
    if (!p.isPlayerProjectile) {
      const playerDist = distance(p.x, p.y, player.x, player.y);
      if (playerDist < p.radius + 20) {
        damagePlayer(p.damage);
        projectiles.splice(i, 1);
      }
    }
  }
}

// ============= ROUND SYSTEM =============

function startRound(): void {
  const roundData = getRoundData(currentRound);
  if (!roundData) {
    console.log("[startRound] No data for round", currentRound, "- using default");
    spawnBudgetRemaining = 10 + currentRound * 5;
    spawnTimer = 2;
    roundTimer = 60;
    return;
  }

  console.log("[startRound] Starting round", currentRound, roundData);

  if (roundData.isBoss) {
    // Boss round
    console.log("[startRound] Boss round - spawning boss:", roundData.bossId);
    // For now, spawn extra enemies as mini-boss placeholder
    spawnBudgetRemaining = roundData.additionalEnemies?.spawnBudget || 20;
    spawnTimer = roundData.additionalEnemies?.spawnInterval || 3;
  } else {
    spawnBudgetRemaining = roundData.spawnBudget;
    spawnTimer = roundData.spawnInterval;
  }

  roundTimer = (roundsData.config as { roundDuration?: number }).roundDuration || 60;
  enemiesKilledThisRound = 0;
}

function updateRound(dt: number): void {
  const roundData = getRoundData(currentRound);

  // Spawn enemies
  spawnTimer -= dt;
  if (spawnTimer <= 0 && spawnBudgetRemaining > 0) {
    const enemyPool = roundData?.enemyPool || ["drifter"];
    const validEnemies = enemyPool
      .map(id => getEnemyData(id))
      .filter(e => e && e.spawnCost <= spawnBudgetRemaining) as EnemyData[];

    if (validEnemies.length > 0) {
      const maxEnemies = (roundsData.config as { maxEnemiesAlive?: number }).maxEnemiesAlive || 30;
      if (enemies.length < maxEnemies) {
        const toSpawn = weightedRandom(validEnemies.map(e => ({ ...e, weight: 1 / e.spawnCost })));
        spawnEnemy(toSpawn.id);
        spawnBudgetRemaining -= toSpawn.spawnCost;
      }
    }

    spawnTimer = roundData?.spawnInterval || 1.5;
  }

  // Check round end
  if (spawnBudgetRemaining <= 0 && enemies.length === 0) {
    endRound();
  }

  // Update round timer
  roundTimer -= dt;
  if (roundTimer <= 0) {
    endRound();
  }
}

function endRound(): void {
  console.log("[endRound] Round", currentRound, "complete!");
  currentRound++;
  
  // Clean up remaining enemies
  enemies = [];
  projectiles = [];

  // Decrement temporary item durations
  for (let i = ownedItems.length - 1; i >= 0; i--) {
    const item = ownedItems[i];
    if (item.data.type === "temporary" && item.remainingRounds !== undefined) {
      item.remainingRounds--;
      if (item.remainingRounds <= 0) {
        console.log("[endRound] Temporary item expired:", item.data.name);
        ownedItems.splice(i, 1);
      }
    }
  }

  // Show reward screen only after round 2
  if (currentRound >= 2) {
    showRewardScreen();
  } else {
    // First two rounds - just continue
    startRound();
  }
}

// ============= COMBO SYSTEM =============

function updateCombo(dt: number): void {
  if (comboTimer > 0) {
    comboTimer -= dt;
  } else if (combo > 0) {
    // Decay combo
    combo = Math.max(0, combo - comboDecayRate * dt);
  }
}

// ============= REWARD SYSTEM =============

function showRewardScreen(): void {
  gameState = "reward";
  
  // Convert current combo to currency
  currencyEarned = Math.floor(combo);
  combo = 0;
  comboTimer = 0;
  
  console.log("[showRewardScreen] Currency earned:", currencyEarned);
  
  // Generate 2 reward options
  const rewards = generateRewardOptions(2);
  
  // Calculate costs based on rarity
  const rarityCosts: Record<string, number> = {
    common: 10,
    rare: 25,
    epic: 50,
    legendary: 100,
    cursed: 15,
  };
  
  // Set up shootable targets
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const cardWidth = 180;
  const cardHeight = 220;
  const spacing = 50;
  
  rewardTargets = [];
  
  // Left item
  if (rewards[0]) {
    rewardTargets.push({
      x: centerX - cardWidth - spacing / 2,
      y: centerY - cardHeight / 2 - 30,
      width: cardWidth,
      height: cardHeight,
      item: rewards[0],
      cost: rarityCosts[rewards[0].rarity] || 20,
    });
  }
  
  // Right item
  if (rewards[1]) {
    rewardTargets.push({
      x: centerX + spacing / 2,
      y: centerY - cardHeight / 2 - 30,
      width: cardWidth,
      height: cardHeight,
      item: rewards[1],
      cost: rarityCosts[rewards[1].rarity] || 20,
    });
  }
  
  // Skip button at bottom
  rewardTargets.push({
    x: centerX - 80,
    y: centerY + cardHeight / 2 + 20,
    width: 160,
    height: 50,
    item: null, // null means skip
    cost: 0,
  });
  
  document.getElementById("rewardScreen")!.classList.remove("hidden");
  document.getElementById("hud")!.style.display = "none";
}

function generateRewardOptions(count: number): ItemData[] {
  const options: ItemData[] = [];
  const availableItems = [...itemsData];
  
  // Weight by rarity
  const rarityWeights: Record<string, number> = {
    common: 50,
    rare: 30,
    epic: 15,
    legendary: 4,
    cursed: 1 + (currentRound > 5 ? 4 : 0),
  };

  for (let i = 0; i < count && availableItems.length > 0; i++) {
    const weighted = availableItems.map(item => ({
      ...item,
      weight: rarityWeights[item.rarity] || 10,
    }));
    const selected = weightedRandom(weighted);
    options.push(selected);
    
    // Remove from available if unique
    if (selected.stacking === "unique") {
      const idx = availableItems.findIndex(item => item.id === selected.id);
      if (idx >= 0) availableItems.splice(idx, 1);
    }
  }

  return options;
}

function updateRewardScreen(dt: number): void {
  // Update player position for aiming during reward screen
  player.x = planet.x + Math.cos(player.orbitAngle) * player.orbitRadius;
  player.y = planet.y + Math.sin(player.orbitAngle) * player.orbitRadius;
  
  // Update aim
  player.aimAngle = Math.atan2(mouseY - player.y, mouseX - player.x);
  
  // Check for projectile hits on reward targets
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    if (!p.isPlayerProjectile) continue;
    
    for (const target of rewardTargets) {
      if (p.x >= target.x && p.x <= target.x + target.width &&
          p.y >= target.y && p.y <= target.y + target.height) {
        // Hit a target!
        projectiles.splice(i, 1);
        
        if (target.item === null) {
          // Skip selected
          skipReward();
        } else if (currencyEarned >= target.cost) {
          // Can afford - select this item
          selectReward(target.item, target.cost);
        } else {
          // Can't afford - visual feedback
          spawnParticle(target.x + target.width / 2, target.y + target.height / 2, "#ff4444", "hit");
          addScreenShake(3, 0.1);
        }
        break;
      }
    }
  }
  
  // Allow shooting during reward screen
  if (mouseDown) {
    firePlayerWeapon();
  }
}

function selectReward(item: ItemData, cost: number): void {
  console.log("[selectReward] Selected:", item.name, "Cost:", cost);
  
  currencyEarned -= cost;

  // Add to owned items
  const existing = ownedItems.find(o => o.data.id === item.id);
  if (existing && item.stacking !== "unique") {
    existing.stacks++;
  } else {
    const owned: OwnedItem = { data: item, stacks: 1 };
    if (item.type === "temporary") {
      owned.remainingRounds = item.duration || 3;
    }
    ownedItems.push(owned);
  }

  // Update HUD
  updateItemsDisplay();
  
  // Particles for purchase
  spawnParticle(canvas.width / 2, canvas.height / 2, "#4caf50", "death");

  // Hide reward screen and continue
  finishRewardScreen();
}

function skipReward(): void {
  console.log("[skipReward] Skipping reward");
  finishRewardScreen();
}

function finishRewardScreen(): void {
  document.getElementById("rewardScreen")!.classList.add("hidden");
  document.getElementById("hud")!.style.display = "flex";
  rewardTargets = [];
  projectiles = []; // Clear any remaining projectiles
  gameState = "playing";
  startRound();
}

function updateItemsDisplay(): void {
  const container = document.getElementById("itemsDisplay")!;
  container.innerHTML = "";
  
  for (const owned of ownedItems) {
    const icon = document.createElement("div");
    icon.className = "item-icon";
    icon.title = `${owned.data.name}${owned.stacks > 1 ? " x" + owned.stacks : ""}`;
    icon.textContent = owned.data.name.charAt(0).toUpperCase();
    container.appendChild(icon);
  }
}

// ============= GAME FLOW =============

function startGame(): void {
  console.log("[startGame] Starting new game");
  
  // Reset state
  gameState = "playing";
  currentRound = 1;
  score = 0;
  totalEnemiesKilled = 0;
  shotCounter = 0;
  killCounter = 0;
  projectiles = [];
  enemies = [];
  particles = [];
  ownedItems = [];

  // Reset planet (center of screen)
  planet.x = canvas.width / 2;
  planet.y = canvas.height / 2;
  planet.hp = planet.maxHp;

  // Reset player (orbiting around planet)
  player.orbitAngle = -Math.PI / 2; // Start at top
  player.x = planet.x + Math.cos(player.orbitAngle) * player.orbitRadius;
  player.y = planet.y + Math.sin(player.orbitAngle) * player.orbitRadius;
  player.hp = 100;
  player.maxHp = 100;
  player.invulnerableTime = 0;
  player.isBlocking = false;
  player.blockTime = 0;
  player.blockCooldown = 0;

  // Reset meteor spawning
  meteorSpawnTimer = 5; // First meteor after 5 seconds
  meteorSpawnInterval = 8;
  hasShownMeteorTutorial = false;

  // Reset combo
  combo = 0;
  comboTimer = 0;
  currencyEarned = 0;

  // Hide overlays
  document.getElementById("startScreen")!.classList.add("hidden");
  document.getElementById("gameOverScreen")!.classList.add("hidden");
  document.getElementById("hud")!.style.display = "flex";

  updateItemsDisplay();
  startRound();
}

function gameOver(): void {
  console.log("[gameOver] Game over! Score:", score);
  gameState = "gameover";

  // Submit score
  if (typeof (window as unknown as { submitScore?: (score: number) => void }).submitScore === "function") {
    (window as unknown as { submitScore: (score: number) => void }).submitScore(score);
  }

  // Update UI
  document.getElementById("finalScore")!.textContent = score.toString();
  document.getElementById("roundsCleared")!.textContent = (currentRound - 1).toString();
  document.getElementById("enemiesKilled")!.textContent = totalEnemiesKilled.toString();
  document.getElementById("itemsCollected")!.textContent = ownedItems.length.toString();

  document.getElementById("hud")!.style.display = "none";
  document.getElementById("gameOverScreen")!.classList.remove("hidden");
}

function pauseGame(): void {
  if (gameState !== "playing") return;
  console.log("[pauseGame] Game paused");
  gameState = "paused";
  document.getElementById("pauseScreen")!.classList.remove("hidden");
}

function resumeGame(): void {
  if (gameState !== "paused") return;
  console.log("[resumeGame] Game resumed");
  gameState = "playing";
  document.getElementById("pauseScreen")!.classList.add("hidden");
}

function togglePause(): void {
  if (gameState === "playing") {
    pauseGame();
  } else if (gameState === "paused") {
    resumeGame();
  }
}

// ============= PARTICLES =============

function spawnParticle(x: number, y: number, color: string, type: string): void {
  const angle = Math.random() * Math.PI * 2;
  const speed = randomRange(50, 150);
  particles.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: randomRange(0.3, 0.6),
    maxLife: 0.5,
    size: randomRange(3, 8),
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

// ============= RENDERING =============

function render(): void {
  // Clear
  ctx.fillStyle = "#fdf6e3";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw paper texture (subtle grid)
  ctx.strokeStyle = "rgba(200, 190, 170, 0.3)";
  ctx.lineWidth = 1;
  const gridSize = 40;
  for (let x = 0; x < canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Apply screen shake
  if (screenShake.duration > 0) {
    const shakeX = (Math.random() - 0.5) * screenShake.intensity;
    const shakeY = (Math.random() - 0.5) * screenShake.intensity;
    ctx.translate(shakeX, shakeY);
  }

  // Draw particles (behind)
  for (const p of particles) {
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Draw projectiles
  for (const p of projectiles) {
    drawProjectile(p);
  }

  // Draw enemies
  for (const enemy of enemies) {
    drawEnemy(enemy);
  }

  // Draw planet (central object)
  drawPlanet();

  // Draw player
  drawPlayer();

  // Reset transform
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Update HUD
  updateHUD();

  // Draw reward screen targets LAST (on top of everything)
  if (gameState === "reward") {
    drawRewardScreen();
  }
}

function drawRewardScreen(): void {
  // Draw currency display
  ctx.font = "bold 32px 'Bangers', cursive";
  ctx.fillStyle = "#ffd93d";
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 3;
  ctx.textAlign = "center";
  const currencyText = `COMBO COINS: ${currencyEarned}`;
  ctx.strokeText(currencyText, canvas.width / 2, 80);
  ctx.fillText(currencyText, canvas.width / 2, 80);
  
  // Draw instruction
  ctx.font = "18px 'Comic Neue', cursive";
  ctx.fillStyle = "#666";
  ctx.fillText("SHOOT to select an item!", canvas.width / 2, 110);
  
  // Draw each target
  for (const target of rewardTargets) {
    ctx.save();
    
    const canAfford = target.item === null || currencyEarned >= target.cost;
    const isSkip = target.item === null;
    
    // Card background
    ctx.fillStyle = canAfford ? "#fff" : "rgba(255, 255, 255, 0.5)";
    ctx.strokeStyle = isSkip ? "#888" : (canAfford ? "#333" : "#ccc");
    ctx.lineWidth = 3;
    
    // Rounded rect
    ctx.beginPath();
    ctx.roundRect(target.x, target.y, target.width, target.height, 10);
    ctx.fill();
    ctx.stroke();
    
    if (isSkip) {
      // Skip button
      ctx.font = "bold 24px 'Bangers', cursive";
      ctx.fillStyle = "#666";
      ctx.textAlign = "center";
      ctx.fillText("SKIP", target.x + target.width / 2, target.y + target.height / 2 + 8);
    } else if (target.item) {
      // Item card
      const item = target.item;
      const cx = target.x + target.width / 2;
      let y = target.y + 30;
      
      // Rarity color
      const rarityColors: Record<string, string> = {
        common: "#888",
        rare: "#4fc3f7",
        epic: "#ab47bc",
        legendary: "#ffd93d",
        cursed: "#8b0000",
      };
      
      // Rarity badge
      ctx.fillStyle = rarityColors[item.rarity] || "#888";
      ctx.font = "12px 'Comic Neue', cursive";
      ctx.textAlign = "center";
      ctx.fillText(item.rarity.toUpperCase(), cx, y);
      y += 25;
      
      // Item name
      ctx.font = "bold 18px 'Bangers', cursive";
      ctx.fillStyle = canAfford ? "#333" : "#999";
      ctx.fillText(item.name, cx, y);
      y += 25;
      
      // Description (word wrap)
      ctx.font = "14px 'Comic Neue', cursive";
      ctx.fillStyle = canAfford ? "#555" : "#aaa";
      const words = item.description.split(" ");
      let line = "";
      const maxWidth = target.width - 20;
      for (const word of words) {
        const testLine = line + word + " ";
        if (ctx.measureText(testLine).width > maxWidth) {
          ctx.fillText(line.trim(), cx, y);
          line = word + " ";
          y += 18;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line.trim(), cx, y);
      y += 30;
      
      // Cost
      ctx.font = "bold 20px 'Bangers', cursive";
      ctx.fillStyle = canAfford ? "#ffd93d" : "#ff4444";
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 2;
      const costText = `${target.cost} coins`;
      ctx.strokeText(costText, cx, target.y + target.height - 20);
      ctx.fillText(costText, cx, target.y + target.height - 20);
      
      if (!canAfford) {
        // "Can't afford" overlay
        ctx.fillStyle = "rgba(255, 0, 0, 0.1)";
        ctx.beginPath();
        ctx.roundRect(target.x, target.y, target.width, target.height, 10);
        ctx.fill();
      }
    }
    
    ctx.restore();
  }
  
  // Draw projectiles on top of cards so player can see their shots
  for (const p of projectiles) {
    drawProjectile(p);
  }
}

function drawProjectile(p: Projectile): void {
  ctx.save();
  ctx.translate(p.x, p.y);

  const angle = Math.atan2(p.vy, p.vx);

  // Special meteor rendering
  if (p.isMeteor) {
    // Fiery trail
    ctx.save();
    ctx.rotate(angle);
    const gradient = ctx.createLinearGradient(-40, 0, 10, 0);
    gradient.addColorStop(0, "rgba(255, 87, 34, 0)");
    gradient.addColorStop(0.5, "rgba(255, 152, 0, 0.6)");
    gradient.addColorStop(1, "rgba(255, 193, 7, 0.8)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(-50, 0);
    ctx.quadraticCurveTo(-25, -12, 0, -8);
    ctx.lineTo(0, 8);
    ctx.quadraticCurveTo(-25, 12, -50, 0);
    ctx.fill();
    ctx.restore();

    // Main meteor body
    ctx.fillStyle = "#ff9800";
    ctx.strokeStyle = "#e65100";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Crater details
    ctx.fillStyle = "#f57c00";
    ctx.beginPath();
    ctx.arc(-4, -3, 5, 0, Math.PI * 2);
    ctx.arc(5, 4, 4, 0, Math.PI * 2);
    ctx.arc(-2, 6, 3, 0, Math.PI * 2);
    ctx.fill();

    // Glow effect
    ctx.shadowColor = "#ff9800";
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(0, 0, p.radius - 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Tutorial label
    if (p.showTutorial) {
      ctx.rotate(-angle); // Undo rotation for text
      ctx.font = "bold 16px 'Comic Neue', cursive";
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 3;
      ctx.textAlign = "center";
      const text = "RIGHT CLICK TO BLOCK!";
      ctx.strokeText(text, 0, -35);
      ctx.fillText(text, 0, -35);
      
      // Arrow pointing at meteor
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(0, -25);
      ctx.lineTo(-6, -30);
      ctx.lineTo(6, -30);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
    return;
  }

  ctx.rotate(angle);

  ctx.fillStyle = p.visual.color;
  ctx.strokeStyle = "#2d2d2d";
  ctx.lineWidth = 2;

  switch (p.visual.shape) {
    case "circle":
      ctx.beginPath();
      ctx.arc(0, 0, p.visual.radius || 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case "line":
      ctx.lineCap = "round";
      ctx.lineWidth = p.visual.width || 3;
      ctx.strokeStyle = p.visual.color;
      ctx.beginPath();
      ctx.moveTo(-(p.visual.length || 15) / 2, 0);
      ctx.lineTo((p.visual.length || 15) / 2, 0);
      ctx.stroke();
      break;
    case "triangle":
      ctx.beginPath();
      ctx.moveTo(p.visual.radius || 5, 0);
      ctx.lineTo(-(p.visual.radius || 5), -(p.visual.radius || 5) * 0.6);
      ctx.lineTo(-(p.visual.radius || 5), (p.visual.radius || 5) * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    default:
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
  }

  ctx.restore();
}

function drawEnemy(enemy: Enemy): void {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);

  const visual = enemy.data.visual;
  const radius = visual.radius || visual.size || 15;

  // Flash when damaged
  if (enemy.invulnerableTime > 0) {
    ctx.globalAlpha = 0.6;
  }

  // Try to use image if available
  if (visual.image) {
    const img = loadImage(visual.image);
    if (img) {
      const size = radius * 2.5; // Scale image to enemy size
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
      ctx.restore();
      return;
    }
  }

  // Fallback to shape rendering
  ctx.fillStyle = visual.color;
  ctx.strokeStyle = "#2d2d2d";
  ctx.lineWidth = visual.outlineWidth;

  switch (visual.shape) {
    case "circle":
    case "blob":
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case "diamond":
      ctx.beginPath();
      ctx.moveTo(0, -radius);
      ctx.lineTo(radius, 0);
      ctx.lineTo(0, radius);
      ctx.lineTo(-radius, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    case "triangle":
      ctx.rotate(enemy.facingAngle);
      ctx.beginPath();
      ctx.moveTo(radius, 0);
      ctx.lineTo(-radius * 0.7, -radius * 0.8);
      ctx.lineTo(-radius * 0.7, radius * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    case "square":
      ctx.beginPath();
      ctx.rect(-radius, -radius, radius * 2, radius * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case "ring":
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case "shielded_circle":
      // Draw shield arc
      if (enemy.data.shield) {
        ctx.fillStyle = visual.shieldColor || "#c8d6e5";
        ctx.beginPath();
        const shieldArc = (enemy.data.shield.arcDegrees * Math.PI) / 180 / 2;
        ctx.arc(0, 0, radius + 5, enemy.facingAngle - shieldArc, enemy.facingAngle + shieldArc);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.fill();
      }
      // Draw body
      ctx.fillStyle = visual.color;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    default:
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
  }

  // Draw status effect indicators
  let effectOffset = 0;
  for (const [effectId] of enemy.statusEffects) {
    const effectData = getStatusEffectData(effectId);
    if (effectData) {
      ctx.fillStyle = effectData.visual.color;
      ctx.beginPath();
      ctx.arc(-radius + effectOffset * 8, -radius - 8, 4, 0, Math.PI * 2);
      ctx.fill();
      effectOffset++;
    }
  }

  ctx.restore();
}

function drawPlanet(): void {
  ctx.save();
  ctx.translate(planet.x, planet.y);

  // Flash red when damaged
  const flashRed = planet.hp < planet.maxHp * 0.3;

  // Draw planet body (minimalist paper style)
  const wobble = Math.sin(performance.now() / 800) * 1.5;
  
  // Planet shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
  ctx.beginPath();
  ctx.arc(4, 4, planet.radius + wobble, 0, Math.PI * 2);
  ctx.fill();

  // Planet base - white/cream with sketch outline
  ctx.fillStyle = flashRed ? "#ffeeee" : "#fafaf8";
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, planet.radius + wobble, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Subtle paper texture lines
  ctx.strokeStyle = "rgba(0, 0, 0, 0.05)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + performance.now() / 10000;
    ctx.beginPath();
    ctx.arc(0, 0, planet.radius * (0.3 + i * 0.12), angle, angle + Math.PI * 0.5);
    ctx.stroke();
  }

  // Draw simple paper trees/plants around the planet surface
  const treePositions = [
    { angle: -Math.PI * 0.7, size: 1.0 },
    { angle: -Math.PI * 0.3, size: 0.7 },
    { angle: Math.PI * 0.1, size: 0.85 },
    { angle: Math.PI * 0.5, size: 0.6 },
    { angle: Math.PI * 0.8, size: 0.9 },
  ];

  for (const tree of treePositions) {
    ctx.save();
    const tx = Math.cos(tree.angle) * planet.radius;
    const ty = Math.sin(tree.angle) * planet.radius;
    ctx.translate(tx, ty);
    ctx.rotate(tree.angle + Math.PI / 2);
    
    const s = tree.size * 12;
    
    // Tree trunk (simple line)
    ctx.strokeStyle = "#5d4037";
    ctx.lineWidth = 2 * tree.size;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -s * 1.2);
    ctx.stroke();
    
    // Tree top (simple triangle/diamond shape)
    ctx.fillStyle = "#66bb6a";
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -s * 2.5);
    ctx.lineTo(-s * 0.8, -s * 0.8);
    ctx.lineTo(0, -s * 1.2);
    ctx.lineTo(s * 0.8, -s * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    ctx.restore();
  }

  // Health bar above planet
  const barWidth = 100;
  const barHeight = 8;
  const hpPercent = planet.hp / planet.maxHp;

  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-barWidth / 2 - 4, -planet.radius - 30, barWidth + 8, barHeight + 8, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = hpPercent > 0.3 ? "#66bb6a" : "#ef5350";
  ctx.beginPath();
  ctx.roundRect(-barWidth / 2, -planet.radius - 26, barWidth * hpPercent, barHeight, 2);
  ctx.fill();

  ctx.restore();
}

function drawPlayer(): void {
  ctx.save();
  ctx.translate(player.x, player.y);
  
  // Rotate so "up" points away from planet center
  ctx.rotate(player.orbitAngle + Math.PI / 2);

  // Flash when invulnerable
  if (player.invulnerableTime > 0 && Math.floor(player.invulnerableTime * 10) % 2 === 0) {
    ctx.globalAlpha = 0.5;
  }

  // Draw dotted aim line (in world space, not rotated)
  ctx.save();
  ctx.rotate(-(player.orbitAngle + Math.PI / 2)); // Undo rotation for aim line
  
  // Calculate distance to mouse for aim line length
  const aimDist = distance(player.x, player.y, mouseX, mouseY);
  const lineLength = Math.max(40, aimDist); // Minimum 40px
  
  ctx.strokeStyle = "rgba(51, 51, 51, 0.3)";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(Math.cos(player.aimAngle) * 30, Math.sin(player.aimAngle) * 30);
  ctx.lineTo(Math.cos(player.aimAngle) * lineLength, Math.sin(player.aimAngle) * lineLength);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Small aim dot at mouse position
  const dotX = Math.cos(player.aimAngle) * lineLength;
  const dotY = Math.sin(player.aimAngle) * lineLength;
  ctx.fillStyle = "rgba(239, 83, 80, 0.5)";
  ctx.beginPath();
  ctx.arc(dotX, dotY, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Draw rhombus character sitting on planet
  // The character is oriented with point down (sits on planet surface)
  const size = 18;
  
  // Shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
  ctx.beginPath();
  ctx.moveTo(2, -size * 1.3 + 2);
  ctx.lineTo(size + 2, 2);
  ctx.lineTo(2, size * 0.6 + 2);
  ctx.lineTo(-size + 2, 2);
  ctx.closePath();
  ctx.fill();

  // Main rhombus body
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, -size * 1.3); // Top point
  ctx.lineTo(size, 0);        // Right point
  ctx.lineTo(0, size * 0.6);  // Bottom point (shorter, sits on planet)
  ctx.lineTo(-size, 0);       // Left point
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Simple face
  ctx.fillStyle = "#333";
  // Eyes
  ctx.beginPath();
  ctx.arc(-5, -4, 3, 0, Math.PI * 2);
  ctx.arc(5, -4, 3, 0, Math.PI * 2);
  ctx.fill();

  // Determined mouth
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-4, 4);
  ctx.lineTo(4, 4);
  ctx.stroke();

  // Draw barrel/cannon pointing toward aim
  ctx.save();
  ctx.rotate(-(player.orbitAngle + Math.PI / 2)); // Back to world space
  ctx.rotate(player.aimAngle); // Rotate to aim direction
  
  // Cannon barrel
  ctx.fillStyle = "#555";
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(8, -4, 22, 8, 2);
  ctx.fill();
  ctx.stroke();
  
  // Cannon tip
  ctx.fillStyle = "#444";
  ctx.beginPath();
  ctx.roundRect(26, -5, 6, 10, 1);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Draw force field when blocking
  if (player.isBlocking) {
    ctx.save();
    ctx.rotate(-(player.orbitAngle + Math.PI / 2)); // Undo rotation
    
    // Pulsing force field
    const pulse = Math.sin(performance.now() / 50) * 0.2 + 0.8;
    const fieldRadius = 35 * pulse;
    
    // Outer glow
    ctx.strokeStyle = "rgba(79, 195, 247, 0.8)";
    ctx.lineWidth = 4;
    ctx.shadowColor = "#4fc3f7";
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(0, 0, fieldRadius, 0, Math.PI * 2);
    ctx.stroke();
    
    // Inner field
    ctx.fillStyle = "rgba(79, 195, 247, 0.2)";
    ctx.beginPath();
    ctx.arc(0, 0, fieldRadius - 2, 0, Math.PI * 2);
    ctx.fill();
    
    // Hexagon pattern
    ctx.strokeStyle = "rgba(79, 195, 247, 0.5)";
    ctx.lineWidth = 1;
    ctx.shadowBlur = 0;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * fieldRadius, Math.sin(a) * fieldRadius);
      ctx.stroke();
    }
    
    ctx.restore();
  }

  // Draw block cooldown indicator
  if (player.blockCooldown > 0 && !player.isBlocking) {
    ctx.save();
    ctx.rotate(-(player.orbitAngle + Math.PI / 2)); // Undo rotation
    
    const cooldownPercent = player.blockCooldown / 2.0;
    ctx.strokeStyle = "rgba(150, 150, 150, 0.4)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 30, -Math.PI / 2, -Math.PI / 2 + (1 - cooldownPercent) * Math.PI * 2);
    ctx.stroke();
    
    ctx.restore();
  }

  ctx.restore();
}

function updateHUD(): void {
  // Show planet HP in the HUD (that's what we're defending)
  const hpPercent = (planet.hp / planet.maxHp) * 100;
  document.getElementById("hpBar")!.style.width = hpPercent + "%";
  
  // Show combo instead of score
  const comboDisplay = document.getElementById("scoreDisplay")!;
  comboDisplay.textContent = Math.floor(combo).toString();
  
  // Pulse effect when combo is high
  if (combo > 20) {
    comboDisplay.style.color = "#ffd93d";
    comboDisplay.style.transform = `scale(${1 + Math.sin(performance.now() / 100) * 0.1})`;
  } else {
    comboDisplay.style.color = "";
    comboDisplay.style.transform = "";
  }
  
  document.getElementById("roundDisplay")!.textContent = currentRound.toString();
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
    updateProjectiles(dt);
    updateEnemies(dt);
    updateParticles(dt);
    updateRound(dt);
    updateCombo(dt);
  } else if (gameState === "reward") {
    updateRewardScreen(dt);
    updateParticles(dt);
  }

  render();
  requestAnimationFrame(gameLoop);
}

// ============= INPUT HANDLING =============

function setupInput(): void {
  // Keyboard
  window.addEventListener("keydown", (e) => {
    keys[e.key.toLowerCase()] = true;
    
    // Escape to pause/resume
    if (e.key === "Escape") {
      togglePause();
    }
    
    // Space to flip to other side of planet
    if (e.key === " " && gameState === "playing") {
      player.orbitAngle += Math.PI; // 180 degree flip
    }
  });

  window.addEventListener("keyup", (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  // Mouse
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
  });

  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      mouseDown = true;
    } else if (e.button === 2 && gameState === "playing") {
      // Right-click to block
      activateBlock();
    }
  });

  canvas.addEventListener("mouseup", (e) => {
    if (e.button === 0) {
      mouseDown = false;
    }
  });

  canvas.addEventListener("mouseleave", () => {
    mouseDown = false;
  });

  // Prevent context menu on right-click
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  // Touch joysticks
  if (isMobile) {
    setupJoysticks();
  }

  // UI buttons
  document.getElementById("startButton")!.onclick = startGame;
  document.getElementById("restartButton")!.onclick = startGame;
  document.getElementById("resumeButton")!.onclick = resumeGame;
  document.getElementById("quitButton")!.onclick = quitToMenu;
}

function quitToMenu(): void {
  console.log("[quitToMenu] Returning to menu");
  gameState = "menu";
  document.getElementById("pauseScreen")!.classList.add("hidden");
  document.getElementById("hud")!.style.display = "none";
  document.getElementById("startScreen")!.classList.remove("hidden");
}

function setupJoysticks(): void {
  const moveZone = document.getElementById("moveJoystick")!;
  const moveThumb = document.getElementById("moveThumb")!;
  const aimZone = document.getElementById("aimJoystick")!;
  const aimThumb = document.getElementById("aimThumb")!;

  let moveTouch: number | null = null;
  let aimTouch: number | null = null;

  const handleJoystick = (
    zone: HTMLElement,
    thumb: HTMLElement,
    joystick: typeof moveJoystick,
    touch: Touch
  ) => {
    const rect = zone.getBoundingClientRect();
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

    joystick.dx = dx / maxDist;
    joystick.dy = dy / maxDist;
    joystick.active = true;

    thumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  };

  const resetJoystick = (thumb: HTMLElement, joystick: typeof moveJoystick) => {
    joystick.dx = 0;
    joystick.dy = 0;
    joystick.active = false;
    thumb.style.transform = "translate(-50%, -50%)";
  };

  document.addEventListener("touchstart", (e) => {
    for (const touch of Array.from(e.changedTouches)) {
      const moveRect = moveZone.getBoundingClientRect();
      const aimRect = aimZone.getBoundingClientRect();

      if (
        touch.clientX >= moveRect.left &&
        touch.clientX <= moveRect.right &&
        touch.clientY >= moveRect.top &&
        touch.clientY <= moveRect.bottom
      ) {
        moveTouch = touch.identifier;
        handleJoystick(moveZone, moveThumb, moveJoystick, touch);
      } else if (
        touch.clientX >= aimRect.left &&
        touch.clientX <= aimRect.right &&
        touch.clientY >= aimRect.top &&
        touch.clientY <= aimRect.bottom
      ) {
        aimTouch = touch.identifier;
        handleJoystick(aimZone, aimThumb, aimJoystick, touch);
      }
    }
  });

  document.addEventListener("touchmove", (e) => {
    for (const touch of Array.from(e.changedTouches)) {
      if (touch.identifier === moveTouch) {
        handleJoystick(moveZone, moveThumb, moveJoystick, touch);
      } else if (touch.identifier === aimTouch) {
        handleJoystick(aimZone, aimThumb, aimJoystick, touch);
      }
    }
  });

  document.addEventListener("touchend", (e) => {
    for (const touch of Array.from(e.changedTouches)) {
      if (touch.identifier === moveTouch) {
        moveTouch = null;
        resetJoystick(moveThumb, moveJoystick);
      } else if (touch.identifier === aimTouch) {
        aimTouch = null;
        resetJoystick(aimThumb, aimJoystick);
      }
    }
  });
}

// ============= CANVAS SETUP =============

function resizeCanvas(): void {
  const container = document.getElementById("game-container");
  if (container) {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
  } else {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  
  // Center planet on resize
  planet.x = canvas.width / 2;
  planet.y = canvas.height / 2;
  
  console.log("[resizeCanvas] Canvas resized to", canvas.width, "x", canvas.height);
}

// ============= INITIALIZATION =============

async function init(): Promise<void> {
  console.log("[init] Initializing Paper Planet");

  canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
  ctx = canvas.getContext("2d")!;

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  loadGameData();
  setupInput();

  // Start game loop
  requestAnimationFrame(gameLoop);
}

// Start when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
