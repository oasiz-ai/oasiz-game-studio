/**
 * PAPER PLANE ASTEROID SURVIVOR
 *
 * A vertical-scrolling roguelike shooter with hand-drawn paper aesthetic.
 * Features event-driven architecture with object pooling for performance.
 */

// ============= CONFIGURATION =============
const CONFIG = {
  // Player
  PLAYER_Y_RATIO: 0.85,
  PLAYER_WIDTH: 50,
  PLAYER_HEIGHT: 60,
  PLAYER_SPEED: 8,
  PLAYER_FIRE_RATE: 333, // ms between shots

  // Bullets
  BULLET_SPEED: 12,
  BULLET_WIDTH: 6,
  BULLET_HEIGHT: 20,
  BULLET_POOL_SIZE: 200,

  // Asteroids
  ASTEROID_POOL_SIZE: 100,
  ASTEROID_SIZES: {
    large: { radius: 58, health: 4, speed: 2.0, coins: 15 },
    medium: { radius: 42, health: 2, speed: 2.8, coins: 8 },
    small: { radius: 28, health: 1, speed: 3.5, coins: 3 },
  },
  SPAWN_INTERVAL_START: 1800,
  SPAWN_INTERVAL_MIN: 350,

  // Boss
  BOSS_HEALTH: 60,
  BOSS_RADIUS: 120,
  BOSS_THROW_INTERVAL: 3000, // ms between asteroid throws
  BOSS_ASTEROID_HEALTH: 10,
  BOSS_MAX_THROWS: 5,
  BOSS_Y_POSITION: 180, // Where boss sits at top of screen

  // Drones
  DRONE_ORBIT_RADIUS: 60,
  DRONE_SIZE: 20,

  // Particles
  PARTICLE_POOL_SIZE: 500,

  // Difficulty
  ASTEROIDS_PER_UPGRADE: 6, // Destroy 6 asteroids to trigger upgrade
  SPEED_INCREASE_INTERVAL: 60000,
  HEALTH_INCREASE_INTERVAL: 60000,

  // Visual
  BACKGROUND_SCROLL_SPEED: 50,
  GRID_SIZE: 40,

  // Colors
  PAPER_BG: "#f5f5dc",
  GRID_LINE: "#d4d4c4",
  PENCIL_DARK: "#2d2d2d",
  PENCIL_MEDIUM: "#4a4a4a",
  PENCIL_LIGHT: "#6d6d6d",
  COIN_GOLD: "#ffd700",
  FONT_FAMILY: "Caveat, cursive",
};

// ============= TYPES =============
type GameState = "START" | "PLAYING" | "UPGRADE" | "PAUSED" | "GAME_OVER" | "BOSS";
type PlaneType = "dart" | "glider" | "bomber";
type AsteroidSize = "large" | "medium" | "small";
type ItemCategory = "stat" | "bullet" | "buddy" | "shield" | "special";
type BulletShape = "line" | "note" | "star" | "bolt" | "rocket" | "bubble";

interface Vec2 {
  x: number;
  y: number;
}

interface GameEvent {
  type: string;
  data?: unknown;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  pierceRemaining: number;
  explosive: boolean;
  chainLightning: boolean;
  active: boolean;
  fromDrone: boolean;
  age: number;
  maxAge: number;
  size: number;
  color: string;
  shape: BulletShape;
  wobblePhase: number;
  bounceRemaining: number;
  loop: boolean;
  homingStrength: number;
  snowball: boolean;
  snowballMax: number;
  sticky: boolean;
  stuckToId: number;
  stuckOffsetX: number;
  stuckOffsetY: number;
  drag: number;
  acceleration: number;
  gravity: number;
  splitOnHit: number;
  trailTimer: number;
  jitterOffset: number;
  prismSplit: boolean;
}

interface Asteroid {
  id: number;
  size: AsteroidSize;
  health: number;
  maxHealth: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  active: boolean;
  hitFlash: number;
  isBossAsteroid?: boolean; // Special asteroids thrown by boss
}

interface Boss {
  x: number;
  y: number;
  targetY: number;
  health: number;
  maxHealth: number;
  rotation: number;
  throwCount: number;
  throwTimer: number;
  active: boolean;
  entering: boolean;
  defeated: boolean;
  pulsePhase: number; // For breathing animation
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
  type: "spark" | "paper" | "coin" | "explosion";
  rotation: number;
  rotationSpeed: number;
}

interface Drone {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  wanderTimer: number;
  fireTimer: number;
  facingAngle: number;
  active: boolean;
}

type OrbitalType = "shield" | "prism" | "rat";

interface Orbital {
  type: OrbitalType;
  angle: number;
  radius: number;
  x: number;
  y: number;
  timer: number;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
  size: number;
}

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

interface StatModifiers {
  damageFlat: number;
  damageMult: number;
  fireRateMult: number;
  bulletSpeedMult: number;
  moveSpeedFlat: number;
  moveSpeedMult: number;
  pierceFlat: number;
  shotsAdd: number;
  spreadAdd: number;
  maxLivesAdd: number;
  bulletSizeMult: number;
  invincibilityBonus: number;
  coinMult: number;
}

interface PlayerStats {
  damage: number;
  fireRateMs: number;
  bulletSpeed: number;
  moveSpeed: number;
  pierce: number;
  shots: number;
  spread: number;
  maxLives: number;
  bulletSize: number;
}

interface ItemEffects {
  starOnHit: number;
  splitOnHit: number;
  bounceCount: number;
  loopBullets: boolean;
  homingStrength: number;
  snowball: boolean;
  snowballMax: number;
  sticky: boolean;
  fireTrail: boolean;
  lightning: boolean;
  explosive: boolean;
  mirrorShots: boolean;
  teleportShots: boolean;
  waveBullets: boolean;
  dragBullets: boolean;
  accelerateBullets: boolean;
  gravityBullets: boolean;
  voodooOnHit: number;
  creepyGunpowder: boolean;
  detonator: boolean;
  castleCrusher: boolean;
  tidalWave: boolean;
  momentum: boolean;
  carnageEngine: boolean;
  minigun: boolean;
  cyclotron: boolean;
  burstFire: number;
  turretBuddies: number;
  shieldBuddies: number;
  ratBuddies: number;
  prismBuddies: number;
  mirrorBuddies: number;
  shieldCharges: number;
  bulletShape: BulletShape | null;
}

interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  isCursed: boolean;
  stats?: Partial<StatModifiers>;
  effects?: Partial<ItemEffects>;
  bulletShape?: BulletShape;
  bulletColor?: string;
}

// ============= UTILITY FUNCTIONS =============
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeOutElastic(t: number): number {
  if (t === 0 || t === 1) return t;
  return (
    Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1
  );
}

// ============= EVENT BUS =============
class EventBus {
  private listeners: Map<string, Array<(data: unknown) => void>> = new Map();

  on(event: string, callback: (data: unknown) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback: (data: unknown) => void): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const idx = callbacks.indexOf(callback);
      if (idx !== -1) callbacks.splice(idx, 1);
    }
  }

  emit(event: string, data?: unknown): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((cb) => cb(data));
    }
  }
}

// ============= OBJECT POOL =============
class ObjectPool<T> {
  private pool: T[] = [];
  private createFn: () => T;
  private resetFn: (obj: T) => void;

  constructor(
    createFn: () => T,
    resetFn: (obj: T) => void,
    initialSize: number = 0,
  ) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(createFn());
    }
  }

  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.createFn();
  }

  release(obj: T): void {
    this.resetFn(obj);
    this.pool.push(obj);
  }

  reset(): void {
    this.pool = [];
  }
}

// ============= AUDIO MANAGER =============
class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private initialized = false;
  settings: Settings;

  constructor(settings: Settings) {
    this.settings = settings;
    console.log("[AudioManager] Created");
  }

  init(): void {
    if (this.initialized) return;
    try {
      this.ctx = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      )();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.5;
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.3;
      this.musicGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.5;
      this.sfxGain.connect(this.masterGain);

      this.initialized = true;
      console.log("[AudioManager.init] Audio context initialized");
    } catch (e) {
      console.warn("[AudioManager.init] Failed:", e);
    }
  }

  playShoot(): void {
    if (!this.ctx || !this.sfxGain || !this.settings.fx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.05);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  playHit(): void {
    if (!this.ctx || !this.sfxGain || !this.settings.fx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  playDestroy(size: AsteroidSize): void {
    if (!this.ctx || !this.sfxGain || !this.settings.fx) return;
    const now = this.ctx.currentTime;
    const baseFreq = size === "large" ? 80 : size === "medium" ? 120 : 200;

    // Noise burst for paper tearing
    const bufferSize = this.ctx.sampleRate * 0.2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] =
        (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.05));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = baseFreq * 4;
    filter.Q.value = 1;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(now);
  }

  playCoin(): void {
    if (!this.ctx || !this.sfxGain || !this.settings.fx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1100, now + 0.05);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  playUpgrade(): void {
    if (!this.ctx || !this.sfxGain || !this.settings.fx) return;
    const now = this.ctx.currentTime;
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.15);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.2);
    });
  }

  playGameOver(): void {
    if (!this.ctx || !this.sfxGain || !this.settings.fx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.5);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1000, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + 0.4);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.6);
  }

  triggerHaptic(type: string): void {
    if (!this.settings.haptics) return;
    if (
      typeof (window as unknown as { triggerHaptic: (t: string) => void })
        .triggerHaptic === "function"
    ) {
      (
        window as unknown as { triggerHaptic: (t: string) => void }
      ).triggerHaptic(type);
    }
  }
}

// ============= PARTICLE SYSTEM =============
class ParticleSystem {
  particles: Particle[] = [];
  private pool: ObjectPool<Particle>;

  constructor() {
    this.pool = new ObjectPool<Particle>(
      () => ({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 4,
        color: "#fff",
        type: "spark",
        rotation: 0,
        rotationSpeed: 0,
      }),
      (p) => {
        p.life = 0;
      },
      CONFIG.PARTICLE_POOL_SIZE,
    );
  }

  emit(
    x: number,
    y: number,
    color: string,
    count: number,
    type: Particle["type"] = "spark",
  ): void {
    for (let i = 0; i < count; i++) {
      const p = this.pool.acquire();
      const angle = Math.random() * Math.PI * 2;
      const speed =
        type === "explosion" ? 3 + Math.random() * 5 : 1 + Math.random() * 3;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = 1;
      p.maxLife = 1;
      p.size =
        type === "paper"
          ? 8 + Math.random() * 12
          : type === "explosion"
            ? 6 + Math.random() * 8
            : 3 + Math.random() * 4;
      p.color = color;
      p.type = type;
      p.rotation = Math.random() * Math.PI * 2;
      p.rotationSpeed = (Math.random() - 0.5) * 0.3;
      this.particles.push(p);
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.vy += 0.1 * dt * 60;
      p.rotation += p.rotationSpeed * dt * 60;
      p.life -= (p.type === "paper" ? 0.015 : 0.025) * dt * 60;

      if (p.life <= 0) {
        this.pool.release(p);
        this.particles.splice(i, 1);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = p.life * 0.8;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);

      if (p.type === "paper") {
        // Draw torn paper scraps
        ctx.fillStyle = p.color;
        ctx.beginPath();
        const s = p.size * p.life;
        ctx.moveTo(-s / 2, -s / 3);
        ctx.lineTo(s / 2, -s / 4);
        ctx.lineTo(s / 3, s / 3);
        ctx.lineTo(-s / 3, s / 2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = CONFIG.PENCIL_LIGHT;
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (p.type === "coin") {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Spark/explosion
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  clear(): void {
    for (const p of this.particles) {
      this.pool.release(p);
    }
    this.particles = [];
  }
}

// ============= FLOATING TEXT SYSTEM =============
class FloatingTextSystem {
  texts: FloatingText[] = [];

  add(
    x: number,
    y: number,
    text: string,
    color: string = "#fff",
    size: number = 20,
  ): void {
    this.texts.push({ x, y, text, life: 1, color, size });
  }

  update(dt: number): void {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.y -= 40 * dt;
      t.life -= 0.02 * dt * 60;
      if (t.life <= 0) {
        this.texts.splice(i, 1);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const t of this.texts) {
      ctx.save();
      ctx.globalAlpha = t.life;
      ctx.font =
        "700 " +
        t.size * easeOutBack(Math.min(1, (1 - t.life) * 3 + 0.3)) +
        "px Caveat, cursive";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillText(t.text, t.x + 2, t.y + 2);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    }
  }

  clear(): void {
    this.texts = [];
  }
}

// ============= ITEM DEFINITIONS =============
const BASE_STATS: PlayerStats = {
  damage: 1,
  fireRateMs: CONFIG.PLAYER_FIRE_RATE,
  bulletSpeed: CONFIG.BULLET_SPEED,
  moveSpeed: CONFIG.PLAYER_SPEED,
  pierce: 0,
  shots: 1,
  spread: 0,
  maxLives: 3,
  bulletSize: 1,
};

const ITEM_DEFS: ItemDefinition[] = [
  {
    id: "zenith_hat",
    name: "Zenith's Spare Hat",
    description:
      "Bullets that hit summon a star strike for half damage.",
    category: "bullet",
    isCursed: false,
    effects: { starOnHit: 0.5 },
    bulletShape: "star",
  },
  {
    id: "yellow_gem",
    name: "Yellow Gem",
    description:
      "Summon an orbiting buddy that fires weak homing shots.",
    category: "buddy",
    isCursed: false,
    effects: { turretBuddies: 1, homingStrength: 0.4 },
  },
  {
    id: "wildfire_can",
    name: "Wildfire's Can of Totally Legal Flammables",
    description:
      "Charged power replaced with a blazing aura trail.",
    category: "bullet",
    isCursed: false,
    stats: { damageMult: 1.2, fireRateMult: 0.8 },
    effects: { fireTrail: true },
  },
  {
    id: "whole_milk",
    name: "Whole Milk",
    description:
      "Damage way up, fire rate way down.",
    category: "stat",
    isCursed: false,
    stats: {
      damageMult: 3,
      pierceFlat: 5,
      fireRateMult: 0.5,
      bulletSpeedMult: 0.7,
    },
  },
  {
    id: "voodoo_doll",
    name: "Voodoo Doll",
    description:
      "Damage up. Hits echo to nearby asteroids of the same size.",
    category: "bullet",
    isCursed: true,
    stats: { damageFlat: 5 },
    effects: { voodooOnHit: 0.6 },
  },
  {
    id: "violet_petal",
    name: "Violet's Petal",
    description:
      "A flower bud blocks incoming hits.",
    category: "shield",
    isCursed: true,
    effects: { shieldCharges: 1 },
  },
  {
    id: "unstable_core",
    name: "Unstable Power Core",
    description:
      "Huge stats, but max health becomes 1.",
    category: "stat",
    isCursed: false,
    stats: {
      damageFlat: 10,
      moveSpeedFlat: 40,
      pierceFlat: 1,
      bulletSpeedMult: 1.5,
      fireRateMult: 1.5,
      maxLivesAdd: -2,
    },
  },
  {
    id: "uncommon_sweet",
    name: "Uncommon Sweet",
    description:
      "All stats up.",
    category: "stat",
    isCursed: false,
    stats: {
      maxLivesAdd: 2,
      damageFlat: 3,
      moveSpeedFlat: 10,
      bulletSpeedMult: 1.2,
      fireRateMult: 1.3,
    },
  },
  {
    id: "ultra_octagon",
    name: "Ultra Octagon",
    description: "Speed up.",
    category: "stat",
    isCursed: false,
    stats: { moveSpeedFlat: 30 },
  },
  {
    id: "tyrant_crown",
    name: "Tyrant's Crown",
    description:
      "Shots slow but aggressively seek targets.",
    category: "bullet",
    isCursed: true,
    stats: { fireRateMult: 0.8, bulletSpeedMult: 0.6 },
    effects: { homingStrength: 0.8 },
  },
  {
    id: "pho_drone_bay",
    name: "Pho's Drone Bay",
    description:
      "Launch an aggressive drone that never stops hunting.",
    category: "buddy",
    isCursed: false,
    effects: { turretBuddies: 1 },
  },
  {
    id: "dei_beam_buddy",
    name: "Dei's Beam Buddy",
    description:
      "A buddy fires piercing beam bursts.",
    category: "buddy",
    isCursed: false,
    effects: { turretBuddies: 1, lightning: true },
  },
  {
    id: "turret_bullets",
    name: "Turret Bullets",
    description:
      "Bullets can split into stationary turrets on impact.",
    category: "bullet",
    isCursed: false,
    effects: { splitOnHit: 1 },
  },
  {
    id: "turret_buddy",
    name: "Turret Buddy",
    description:
      "An orbiting buddy shoots nearby enemies.",
    category: "buddy",
    isCursed: false,
    effects: { turretBuddies: 1 },
  },
  {
    id: "trigun",
    name: "Trigun",
    description:
      "Triple shot with a wide spread.",
    category: "bullet",
    isCursed: true,
    stats: { shotsAdd: 2, spreadAdd: 24 },
  },
  {
    id: "tidal_wave",
    name: "Tidal Wave",
    description:
      "Moving fires extra bullets upward.",
    category: "special",
    isCursed: false,
    effects: { tidalWave: true },
  },
  {
    id: "tesla_coil",
    name: "Tesla Coil",
    description:
      "Electric arcs chain between targets.",
    category: "bullet",
    isCursed: false,
    effects: { lightning: true },
  },
  {
    id: "tank_plating",
    name: "Tank Plating",
    description:
      "Health up, speed down.",
    category: "stat",
    isCursed: false,
    stats: { maxLivesAdd: 3, moveSpeedFlat: -20 },
  },
  {
    id: "super_glue",
    name: "Super Glue",
    description:
      "Bullets stick and keep damaging enemies.",
    category: "bullet",
    isCursed: false,
    effects: { sticky: true },
  },
  {
    id: "stumpy_ukulele",
    name: "Stumpy's Ukulele",
    description:
      "Notes weave through the air and pierce once more.",
    category: "bullet",
    isCursed: false,
    stats: { pierceFlat: 1 },
    effects: { waveBullets: true },
    bulletShape: "note",
  },
  {
    id: "spreadshot",
    name: "Spreadshot",
    description:
      "Five shots in a barrier spread.",
    category: "bullet",
    isCursed: true,
    stats: { shotsAdd: 4, spreadAdd: 60, fireRateMult: 0.7 },
  },
  {
    id: "spray_paint",
    name: "Spray Paint",
    description:
      "Fire rate up, bullet speed down.",
    category: "stat",
    isCursed: false,
    stats: { fireRateMult: 1.3, bulletSpeedMult: 0.8 },
  },
  {
    id: "split_bullets",
    name: "Split Bullets",
    description:
      "Bullets split into two on impact.",
    category: "bullet",
    isCursed: true,
    effects: { splitOnHit: 2 },
  },
  {
    id: "spicy_cheezo",
    name: "Spicy Cheezo Sushi",
    description:
      "Damage up and a full heal.",
    category: "stat",
    isCursed: false,
    stats: { damageFlat: 3 },
  },
  {
    id: "snowball",
    name: "Snowball",
    description:
      "Bullets grow stronger the longer they fly.",
    category: "bullet",
    isCursed: true,
    stats: { bulletSpeedMult: 0.6 },
    effects: { snowball: true, snowballMax: 2 },
  },
  {
    id: "shield_projector",
    name: "Shield Projector",
    description:
      "Project a thinner shield that recharges quickly.",
    category: "shield",
    isCursed: false,
    effects: { shieldCharges: 1 },
  },
  {
    id: "shield_buddy",
    name: "Shield Buddy",
    description:
      "A buddy blocks incoming asteroids.",
    category: "shield",
    isCursed: false,
    effects: { shieldBuddies: 1 },
  },
  {
    id: "shellcore",
    name: "Shellcore",
    description:
      "Fire rate up, health down.",
    category: "stat",
    isCursed: false,
    stats: { fireRateMult: 1.3, maxLivesAdd: -1 },
  },
  {
    id: "sharps_turrets",
    name: "Sharp's Turrets",
    description:
      "Two extra turret buddies join the fight.",
    category: "buddy",
    isCursed: false,
    effects: { turretBuddies: 2 },
  },
  {
    id: "sharp_dart",
    name: "Sharp Dart",
    description:
      "Piercing up.",
    category: "stat",
    isCursed: false,
    stats: { pierceFlat: 2 },
  },
  {
    id: "creepy_gunpowder",
    name: "Creepy Gunpowder",
    description:
      "Enemies explode on death.",
    category: "bullet",
    isCursed: false,
    effects: { creepyGunpowder: true },
  },
  {
    id: "cracked_overcharger",
    name: "Cracked Overcharger",
    description: "Damage up.",
    category: "stat",
    isCursed: false,
    stats: { damageFlat: 4 },
  },
  {
    id: "coolant",
    name: "Coolant",
    description:
      "Balanced boost to all stats.",
    category: "stat",
    isCursed: false,
    stats: {
      damageFlat: 3,
      fireRateMult: 1.1,
      moveSpeedFlat: 10,
      maxLivesAdd: 1,
    },
  },
  {
    id: "coffee",
    name: "Coffee",
    description:
      "Speed and fire rate up.",
    category: "stat",
    isCursed: false,
    stats: { moveSpeedFlat: 15, fireRateMult: 1.1 },
  },
  {
    id: "castle_crusher",
    name: "Castle Crusher",
    description:
      "Every third volley is devastating.",
    category: "bullet",
    isCursed: false,
    effects: { castleCrusher: true },
  },
  {
    id: "carnage_engine",
    name: "Carnage Engine",
    description:
      "Hits ramp damage up to a deadly peak.",
    category: "stat",
    isCursed: true,
    stats: { moveSpeedFlat: 20 },
    effects: { carnageEngine: true },
  },
  {
    id: "cannon",
    name: "Cannon",
    description:
      "Damage up, bullet speed down.",
    category: "stat",
    isCursed: false,
    stats: { damageFlat: 5, bulletSpeedMult: 0.8 },
  },
  {
    id: "burst_laser",
    name: "Burst Laser",
    description:
      "Fires in bursts of three.",
    category: "bullet",
    isCursed: false,
    stats: { fireRateMult: 0.55 },
    effects: { burstFire: 3 },
  },
  {
    id: "bullet_teleporter",
    name: "Bullet Teleporter",
    description:
      "Bullets spawn from your cursor.",
    category: "bullet",
    isCursed: false,
    effects: { teleportShots: true },
  },
  {
    id: "bubble_bullets",
    name: "Bubble Bullets",
    description:
      "Bubbles pop and home toward targets.",
    category: "bullet",
    isCursed: true,
    effects: { homingStrength: 0.6 },
    bulletShape: "bubble",
  },
  {
    id: "broken_capacitor",
    name: "Broken Capacitor",
    description:
      "Fire rate up.",
    category: "stat",
    isCursed: false,
    stats: { fireRateMult: 1.2 },
  },
  {
    id: "blackhole",
    name: "Blackhole",
    description:
      "Bullets pull asteroids slightly inward.",
    category: "bullet",
    isCursed: false,
    effects: { homingStrength: 0.25 },
  },
  {
    id: "bay_blade",
    name: "Bay Blade",
    description:
      "Spinning shots with slower speed.",
    category: "bullet",
    isCursed: false,
    stats: { bulletSpeedMult: 0.7 },
    effects: { waveBullets: true },
  },
  {
    id: "bandaid",
    name: "Bandaid",
    description:
      "Health and speed up.",
    category: "stat",
    isCursed: false,
    stats: { maxLivesAdd: 1, moveSpeedFlat: 10 },
  },
  {
    id: "almond_milk",
    name: "Almond Milk",
    description:
      "Extreme fire rate, low damage.",
    category: "stat",
    isCursed: false,
    stats: { fireRateMult: 4, damageMult: 0.35 },
  },
  {
    id: "cyclotron",
    name: "Cyclotron",
    description:
      "Cycling shot patterns and speeds.",
    category: "bullet",
    isCursed: false,
    stats: { fireRateMult: 0.75 },
    effects: { cyclotron: true },
  },
  {
    id: "rubber_band_ball",
    name: "Rubber Band Ball",
    description:
      "Bullets bounce based on piercing.",
    category: "bullet",
    isCursed: false,
    stats: { pierceFlat: 1 },
    effects: { bounceCount: 1 },
  },
  {
    id: "remote_control",
    name: "Remote Control",
    description:
      "Bullets accelerate toward your aim.",
    category: "bullet",
    isCursed: true,
    effects: { homingStrength: 0.9 },
  },
  {
    id: "reinforced_core",
    name: "Reinforced Core",
    description:
      "Longer invincibility after hits.",
    category: "shield",
    isCursed: false,
    stats: { invincibilityBonus: 2 },
  },
  {
    id: "reaper_pearl",
    name: "Reaper Pearl",
    description:
      "Massive damage with a small heal chance.",
    category: "stat",
    isCursed: true,
    stats: { damageFlat: 10 },
  },
  {
    id: "rat_buddy",
    name: "Rat Buddy",
    description:
      "A rat buddy drops cheese for massive buffs.",
    category: "buddy",
    isCursed: false,
    effects: { ratBuddies: 1 },
  },
  {
    id: "rail_gun",
    name: "Rail Gun",
    description:
      "Slow but extremely powerful shots.",
    category: "bullet",
    isCursed: false,
    stats: {
      damageMult: 4,
      bulletSpeedMult: 2,
      fireRateMult: 0.5,
      pierceFlat: 5,
    },
  },
  {
    id: "prism_buddy",
    name: "Prism Buddy",
    description:
      "Bullets split when passing a prism.",
    category: "buddy",
    isCursed: false,
    effects: { prismBuddies: 1 },
  },
  {
    id: "phase_bullets",
    name: "Phase Bullets",
    description:
      "Bullets loop across screen edges.",
    category: "bullet",
    isCursed: false,
    stats: { pierceFlat: 1 },
    effects: { loopBullets: true },
  },
  {
    id: "overcharged_engine",
    name: "Overcharged Engine",
    description:
      "Speed builds over time and boosts fire rate.",
    category: "special",
    isCursed: false,
    effects: { momentum: true },
  },
  {
    id: "origami_clover",
    name: "Origami Clover",
    description:
      "Enemies drop more paperclips.",
    category: "special",
    isCursed: false,
    stats: { coinMult: 1.33 },
  },
  {
    id: "neo_crt",
    name: "Neo's CRT",
    description:
      "A mirrored buddy fires opposite you.",
    category: "buddy",
    isCursed: false,
    effects: { mirrorBuddies: 1 },
  },
  {
    id: "multibarrel",
    name: "Multibarrel",
    description:
      "Rapid fire with a messy spread.",
    category: "stat",
    isCursed: false,
    stats: { fireRateMult: 1.4, damageFlat: -3, spreadAdd: 6 },
  },
  {
    id: "momentum",
    name: "Momentum",
    description:
      "Damage scales with your speed.",
    category: "stat",
    isCursed: false,
    stats: { moveSpeedFlat: 30 },
    effects: { momentum: true },
  },
  {
    id: "mirror_bullets",
    name: "Mirror Bullets",
    description:
      "Shots echo from the opposite edge.",
    category: "bullet",
    isCursed: true,
    effects: { mirrorShots: true },
  },
  {
    id: "minigun",
    name: "Minigun",
    description:
      "Sustained firing increases fire rate and spread.",
    category: "stat",
    isCursed: true,
    stats: { fireRateMult: 0.8 },
    effects: { minigun: true },
  },
  {
    id: "magnet",
    name: "Magnet",
    description:
      "Bullets home in on asteroids.",
    category: "bullet",
    isCursed: false,
    effects: { homingStrength: 0.6 },
  },
  {
    id: "mag_coil",
    name: "Mag Coil",
    description:
      "Piercing and bullet speed up.",
    category: "stat",
    isCursed: false,
    stats: { pierceFlat: 1, bulletSpeedMult: 1.3 },
  },
  {
    id: "loop_bullets",
    name: "Loop Bullets",
    description:
      "Bullets loop around the screen edges.",
    category: "bullet",
    isCursed: false,
    effects: { loopBullets: true },
  },
  {
    id: "linked_shield",
    name: "Linked Shield",
    description:
      "Gain an additional shield charge.",
    category: "shield",
    isCursed: false,
    effects: { shieldCharges: 1 },
  },
  {
    id: "lightweight_chassis",
    name: "Lightweight Chassis",
    description:
      "Speed and fire rate up, max health down.",
    category: "stat",
    isCursed: false,
    stats: {
      fireRateMult: 1.1,
      moveSpeedFlat: 30,
      bulletSpeedMult: 1.2,
      maxLivesAdd: -1,
    },
  },
  {
    id: "lightspeed_bullets",
    name: "Lightspeed Bullets",
    description:
      "Bullet speed way up.",
    category: "stat",
    isCursed: false,
    stats: { bulletSpeedMult: 2 },
  },
  {
    id: "rocket",
    name: "Rocket",
    description:
      "Explosive rounds with slower speed.",
    category: "bullet",
    isCursed: true,
    stats: { fireRateMult: 0.8, bulletSpeedMult: 0.5 },
    effects: { explosive: true },
    bulletShape: "rocket",
  },
  {
    id: "ironplate_potion",
    name: "Ironplate Potion",
    description:
      "Health up.",
    category: "stat",
    isCursed: false,
    stats: { maxLivesAdd: 2 },
  },
  {
    id: "hero_bow",
    name: "Hero Bow",
    description:
      "Fire rate and bullet speed up.",
    category: "stat",
    isCursed: false,
    stats: { fireRateMult: 1.15, bulletSpeedMult: 1.3 },
  },
  {
    id: "heckfire_bullets",
    name: "Heckfire Bullets",
    description:
      "Bullets leave burning trails.",
    category: "bullet",
    isCursed: true,
    effects: { fireTrail: true },
  },
  {
    id: "heavy_shots",
    name: "Heavy Shots",
    description:
      "Bullets fall under heavy gravity.",
    category: "bullet",
    isCursed: false,
    effects: { gravityBullets: true },
  },
  {
    id: "gro_mush",
    name: "Gro Mush",
    description:
      "Damage up, speed down.",
    category: "stat",
    isCursed: false,
    stats: { damageFlat: 5, moveSpeedFlat: -20 },
  },
  {
    id: "forbidden_gummi",
    name: "Forbidden Gummi",
    description:
      "All stats up with a full heal.",
    category: "stat",
    isCursed: true,
    stats: {
      damageFlat: 8,
      fireRateMult: 1.5,
      moveSpeedFlat: 20,
      bulletSpeedMult: 1.5,
      maxLivesAdd: 2,
    },
  },
  {
    id: "flask_cannon",
    name: "Fla(s)k Cannon",
    description:
      "Adds extra random bullets on fire.",
    category: "bullet",
    isCursed: false,
    stats: { shotsAdd: 1, spreadAdd: 20 },
  },
  {
    id: "firework_bullets",
    name: "Firework Bullets",
    description:
      "Bullets burst into smaller shots on hit.",
    category: "bullet",
    isCursed: true,
    effects: { splitOnHit: 3, explosive: true },
  },
  {
    id: "fanciful_pants",
    name: "Fanciful Pants",
    description:
      "Speed up.",
    category: "stat",
    isCursed: false,
    stats: { moveSpeedFlat: 25 },
  },
  {
    id: "eraser",
    name: "Eraser",
    description:
      "Damage and fire rate up.",
    category: "stat",
    isCursed: false,
    stats: { damageFlat: 3, fireRateMult: 1.1 },
  },
  {
    id: "energy_drink",
    name: "Energy Drink",
    description:
      "Speed multiplier up.",
    category: "stat",
    isCursed: false,
    stats: { moveSpeedMult: 1.5 },
  },
  {
    id: "empty_dragon_egg",
    name: "Empty Dragon Egg",
    description:
      "Gain damage for each item acquired.",
    category: "stat",
    isCursed: false,
  },
  {
    id: "drill_bullets",
    name: "Drill Bullets",
    description:
      "Piercing up, damage ramps after hits.",
    category: "bullet",
    isCursed: true,
    stats: { pierceFlat: 3 },
  },
  {
    id: "drag_bullets",
    name: "Drag Bullets",
    description:
      "Bullets slow down over time, fire rate up.",
    category: "bullet",
    isCursed: false,
    stats: { fireRateMult: 1.3 },
    effects: { dragBullets: true },
  },
  {
    id: "detonator",
    name: "Detonator",
    description:
      "Enemies explode into extra bullets when they die.",
    category: "bullet",
    isCursed: false,
    effects: { detonator: true },
  },
  {
    id: "cursed_bullets",
    name: "Cursed Bullets",
    description:
      "Bullets burn with a dark aura.",
    category: "bullet",
    isCursed: true,
    stats: { damageMult: 1.2 },
    effects: { fireTrail: true },
  },
  {
    id: "xl_ammo_box",
    name: "XL Ammo Box",
    description:
      "Fire rate up, speed down.",
    category: "stat",
    isCursed: false,
    stats: { fireRateMult: 1.3, moveSpeedFlat: -15 },
  },
  {
    id: "accelerometer",
    name: "Accelerometer",
    description:
      "Bullets accelerate endlessly.",
    category: "bullet",
    isCursed: false,
    stats: { pierceFlat: 1 },
    effects: { accelerateBullets: true },
  },
  {
    id: "broken_pipe",
    name: "Broken Pipe",
    description: "Damage up.",
    category: "stat",
    isCursed: false,
    stats: { damageFlat: 4 },
  },
  {
    id: "bullet_charm",
    name: "Bullet Charm",
    description:
      "More bullets on screen increase your power.",
    category: "special",
    isCursed: false,
  },
  {
    id: "elastic_cables",
    name: "Elastic Cables",
    description:
      "Damage scales with bullet speed.",
    category: "special",
    isCursed: false,
  },
  {
    id: "fractal_bullets",
    name: "Fractal Bullets",
    description:
      "Bullets split repeatedly on impact.",
    category: "bullet",
    isCursed: true,
    effects: { splitOnHit: 2 },
  },
  {
    id: "friendly_snail",
    name: "Friendly Snail",
    description:
      "Damage and fire rate up, bullet speed down.",
    category: "stat",
    isCursed: false,
    stats: { damageFlat: 3, fireRateMult: 1.2, bulletSpeedMult: 0.5 },
  },
  {
    id: "hot_stuff",
    name: "Hot Stuff",
    description:
      "Bullets shed shrapnel as they fly.",
    category: "bullet",
    isCursed: true,
    effects: { fireTrail: true },
  },
  {
    id: "lightning_bottle",
    name: "Lightning Bottle",
    description:
      "Zig-zagging lightning shots.",
    category: "bullet",
    isCursed: false,
    effects: { waveBullets: true, lightning: true },
    bulletShape: "bolt",
  },
  {
    id: "mark_ii",
    name: "Mark II",
    description:
      "Double shot with smaller spread.",
    category: "bullet",
    isCursed: false,
    stats: { shotsAdd: 1, spreadAdd: 8, fireRateMult: 0.8 },
  },
];

const ITEM_MAP = new Map(ITEM_DEFS.map((item) => [item.id, item]));

// ============= DEMO ANIMATION TYPES =============
interface DemoBullet {
  x: number;
  y: number;
  vy: number;
  active: boolean;
}

interface DemoAsteroid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  rotation: number;
  rotationSpeed: number;
  health: number;
  active: boolean;
}

interface DemoParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
}

// ============= MAIN GAME CLASS =============
class PaperPlaneGame {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  gameContainer: HTMLElement;
  eventBus: EventBus;

  // Systems
  particles: ParticleSystem;
  floatingText: FloatingTextSystem;
  audio: AudioManager;

  // Pools
  bulletPool: ObjectPool<Bullet>;
  asteroidPool: ObjectPool<Asteroid>;

  // Active entities
  bullets: Bullet[] = [];
  asteroids: Asteroid[] = [];
  drones: Drone[] = [];
  orbitals: Orbital[] = [];

  // Game state
  gameState: GameState = "START";
  selectedPlane: PlaneType = "dart";
  playerX: number = 0;
  playerY: number = 0;
  playerVelocityX: number = 0;
  playerVelocityY: number = 0;
  targetX: number = 0;
  targetY: number = 0;

  // Spin animation (barrel roll)
  spinAngle: number = 0;
  spinDirection: number = 0; // 1 = clockwise, -1 = counter-clockwise
  lastPlayerX: number = 0;

  // Lives and damage
  lives: number = 3;
  maxLives: number = 3;
  damageTimer: number = 0; // Invincibility frames timer
  damageFlashTimer: number = 0; // For blinking effect
  isInvincible: boolean = false;

  // Boss
  boss: Boss | null = null;
  bossDefeated: boolean = false;
  bossAnnouncementTimer: number = 0;

  // Stats
  survivalTime: number = 0;
  coins: number = 0;
  score: number = 0;

  // Timers
  fireTimer: number = 0;
  spawnTimer: number = 0;
  destroyedCount: number = 0; // Asteroids destroyed since last upgrade
  totalUpgrades: number = 0; // Total upgrades collected

  // Item system
  itemsOwned: string[] = [];
  currentItemChoices: ItemDefinition[] = [];
  currentStats: PlayerStats = { ...BASE_STATS };
  statModifiers: StatModifiers = {
    damageFlat: 0,
    damageMult: 1,
    fireRateMult: 1,
    bulletSpeedMult: 1,
    moveSpeedFlat: 0,
    moveSpeedMult: 1,
    pierceFlat: 0,
    shotsAdd: 0,
    spreadAdd: 0,
    maxLivesAdd: 0,
    bulletSizeMult: 1,
    invincibilityBonus: 0,
    coinMult: 1,
  };
  itemEffects: ItemEffects = {
    starOnHit: 0,
    splitOnHit: 0,
    bounceCount: 0,
    loopBullets: false,
    homingStrength: 0,
    snowball: false,
    snowballMax: 1,
    sticky: false,
    fireTrail: false,
    lightning: false,
    explosive: false,
    mirrorShots: false,
    teleportShots: false,
    waveBullets: false,
    dragBullets: false,
    accelerateBullets: false,
    gravityBullets: false,
    voodooOnHit: 0,
    creepyGunpowder: false,
    detonator: false,
    castleCrusher: false,
    tidalWave: false,
    momentum: false,
    carnageEngine: false,
    minigun: false,
    cyclotron: false,
    burstFire: 0,
    turretBuddies: 0,
    shieldBuddies: 0,
    ratBuddies: 0,
    prismBuddies: 0,
    mirrorBuddies: 0,
    shieldCharges: 0,
    bulletShape: null,
  };
  dynamicDamageMult: number = 1;
  dynamicFireRateMult: number = 1;
  dynamicMoveSpeedMult: number = 1;
  shieldCharges: number = 0;
  maxShieldCharges: number = 0;
  itemDamageBuff: number = 0;
  itemDamageBuffTimer: number = 0;
  minigunHeat: number = 0;
  cyclotronIndex: number = 0;
  castleCrusherCounter: number = 0;
  tidalWaveTimer: number = 0;
  cheeseBuffTimer: number = 0;
  cheeseDamageMult: number = 1;
  regenTimer: number = 0;
  ratDropTimer: number = 0;

  // Difficulty
  difficultyLevel: number = 0;
  healthBonus: number = 0;
  speedMultiplier: number = 1;

  // Layout
  w: number = 0;
  h: number = 0;
  isMobile: boolean = false;
  bgOffset: number = 0;

  // Screen shake
  screenShake: { x: number; y: number; intensity: number } = {
    x: 0,
    y: 0,
    intensity: 0,
  };

  // Input
  keysDown: Set<string> = new Set();
  touchX: number | null = null;
  touchY: number | null = null;
  mouseX: number | null = null;
  mouseY: number | null = null;
  isDragging: boolean = false;

  // Settings
  settings: Settings;

  // Timing
  lastTime: number = 0;
  asteroidIdCounter: number = 0;

  // Upgrade selection timer
  upgradeAutoSelectTimer: number = 0;

  // Demo animation
  demoCanvas: HTMLCanvasElement | null = null;
  demoCtx: CanvasRenderingContext2D | null = null;
  demoPlaneX: number = 0;
  demoPlaneY: number = 0;
  demoPlaneTargetX: number = 0;
  demoPlaneDirection: number = 1;
  demoBullets: DemoBullet[] = [];
  demoAsteroids: DemoAsteroid[] = [];
  demoParticles: DemoParticle[] = [];
  demoFireTimer: number = 0;
  demoSpawnTimer: number = 0;
  demoBgOffset: number = 0;

  constructor() {
    console.log("[PaperPlaneGame] Initializing");

    this.canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.gameContainer = document.getElementById("game-container")!;

    this.eventBus = new EventBus();
    this.particles = new ParticleSystem();
    this.floatingText = new FloatingTextSystem();

    // Load settings
    this.settings = {
      music: localStorage.getItem("paperPlane_music") !== "false",
      fx: localStorage.getItem("paperPlane_fx") !== "false",
      haptics: localStorage.getItem("paperPlane_haptics") !== "false",
    };

    this.audio = new AudioManager(this.settings);

    this.isMobile = window.matchMedia("(pointer: coarse)").matches;

    // Initialize demo canvas
    this.demoCanvas = document.getElementById("demoCanvas") as HTMLCanvasElement;
    if (this.demoCanvas) {
      this.demoCtx = this.demoCanvas.getContext("2d");
      this.initDemoAnimation();
    }

    // Initialize pools
    this.bulletPool = new ObjectPool<Bullet>(
      () => ({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        damage: 1,
        pierceRemaining: 0,
        explosive: false,
        chainLightning: false,
        active: false,
        fromDrone: false,
        age: 0,
        maxAge: 3,
        size: 1,
        color: CONFIG.PENCIL_DARK,
        shape: "line",
        wobblePhase: 0,
        bounceRemaining: 0,
        loop: false,
        homingStrength: 0,
        snowball: false,
        snowballMax: 1,
        sticky: false,
        stuckToId: -1,
        stuckOffsetX: 0,
        stuckOffsetY: 0,
        drag: 0,
        acceleration: 0,
        gravity: 0,
        splitOnHit: 0,
        trailTimer: 0,
        jitterOffset: 0,
        prismSplit: false,
      }),
      (b) => {
        b.active = false;
        b.fromDrone = false;
        b.age = 0;
        b.maxAge = 3;
        b.stuckToId = -1;
        b.trailTimer = 0;
        b.prismSplit = false;
      },
      CONFIG.BULLET_POOL_SIZE,
    );

    this.asteroidPool = new ObjectPool<Asteroid>(
      () => ({
        id: 0,
        size: "medium",
        health: 1,
        maxHealth: 1,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        rotation: 0,
        rotationSpeed: 0,
        active: false,
        hitFlash: 0,
        isBossAsteroid: false,
      }),
      (a) => {
        a.active = false;
        a.isBossAsteroid = false;
      },
      CONFIG.ASTEROID_POOL_SIZE,
    );

    // Setup events
    this.setupEventListeners();
    this.setupGameEvents();

    // Initial resize
    this.resizeCanvas();
    window.addEventListener("resize", () => this.resizeCanvas());

    // Start loop
    requestAnimationFrame((t) => this.gameLoop(t));
  }

  setupEventListeners(): void {
    // Keyboard
    window.addEventListener("keydown", (e) => {
      this.keysDown.add(e.key);
      if (e.key === "Escape" && this.gameState === "PLAYING") {
        this.pauseGame();
      } else if (e.key === "Escape" && this.gameState === "PAUSED") {
        this.resumeGame();
      }
    });

    window.addEventListener("keyup", (e) => {
      this.keysDown.delete(e.key);
    });

    // Touch (mobile) - plane follows finger with drag
    this.canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      if (this.gameState === "PLAYING" || this.gameState === "BOSS") {
        this.isDragging = true;
        this.touchX = this.getRelativeX(e.touches[0].clientX);
        this.touchY = this.getRelativeY(e.touches[0].clientY);
      }
    });

    this.canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      if (this.isDragging && (this.gameState === "PLAYING" || this.gameState === "BOSS")) {
        this.touchX = this.getRelativeX(e.touches[0].clientX);
        this.touchY = this.getRelativeY(e.touches[0].clientY);
      }
    });

    this.canvas.addEventListener("touchend", (e) => {
      e.preventDefault();
      this.isDragging = false;
      // Keep target at current position so plane stays in place
      this.targetX = this.playerX;
      this.targetY = this.playerY;
      this.touchX = null;
      this.touchY = null;
    });

    // Mouse (desktop) - plane follows cursor automatically, no clicking needed
    this.canvas.addEventListener("mousemove", (e) => {
      if ((this.gameState === "PLAYING" || this.gameState === "BOSS") && !this.isMobile) {
        this.mouseX = this.getRelativeX(e.clientX);
        this.mouseY = this.getRelativeY(e.clientY);
      }
    });

    this.canvas.addEventListener("mouseleave", () => {
      // When mouse leaves, keep plane at current position
      this.mouseX = null;
      this.mouseY = null;
    });

    // UI Buttons
    document.getElementById("startButton")?.addEventListener("click", () => {
      this.audio.triggerHaptic("light");
      this.startGame();
    });

    document.getElementById("restartButton")?.addEventListener("click", () => {
      this.audio.triggerHaptic("light");
      this.startGame();
    });

    document.getElementById("menuButton")?.addEventListener("click", () => {
      this.audio.triggerHaptic("light");
      this.showStartScreen();
    });

    document.getElementById("pauseBtn")?.addEventListener("click", () => {
      this.audio.triggerHaptic("light");
      this.pauseGame();
    });

    document.getElementById("resumeButton")?.addEventListener("click", () => {
      this.audio.triggerHaptic("light");
      this.resumeGame();
    });

    document
      .getElementById("pauseRestartBtn")
      ?.addEventListener("click", () => {
        this.audio.triggerHaptic("light");
        this.startGame();
      });

    document.getElementById("pauseMenuBtn")?.addEventListener("click", () => {
      this.audio.triggerHaptic("light");
      this.showStartScreen();
    });

    // Settings
    document.getElementById("settingsBtn")?.addEventListener("click", () => {
      this.audio.triggerHaptic("light");
      document.getElementById("settingsModal")?.classList.remove("hidden");
    });

    document.getElementById("settingsClose")?.addEventListener("click", () => {
      this.audio.triggerHaptic("light");
      document.getElementById("settingsModal")?.classList.add("hidden");
    });

    // Setting toggles
    this.setupSettingToggle("musicToggle", "music");
    this.setupSettingToggle("fxToggle", "fx");
    this.setupSettingToggle("hapticToggle", "haptics");

    // Plane selection screen buttons
    document.getElementById("galleryButton")?.addEventListener("click", () => {
      this.audio.triggerHaptic("light");
      this.showGalleryScreen();
    });

    document.getElementById("backFromGalleryBtn")?.addEventListener("click", () => {
      this.audio.triggerHaptic("light");
      this.hideGalleryScreen();
    });

    // Plane selection
    document.querySelectorAll(".plane-card").forEach((card) => {
      card.addEventListener("click", () => {
        this.audio.triggerHaptic("light");
        const type = card.getAttribute("data-plane") as PlaneType;
        this.selectPlane(type);
        this.hideGalleryScreen();
      });
    });

    // Item cards
    document.querySelectorAll(".item-card").forEach((card) => {
      card.addEventListener("click", () => {
        if (this.gameState !== "UPGRADE") return;
        this.audio.triggerHaptic("medium");
        const itemId = card.getAttribute("data-item-id");
        if (!itemId) return;
        this.selectItem(itemId);
      });
    });
  }

  setupSettingToggle(elementId: string, settingKey: keyof Settings): void {
    const el = document.getElementById(elementId);
    if (!el) return;

    el.classList.toggle("active", this.settings[settingKey]);

    el.addEventListener("click", () => {
      this.settings[settingKey] = !this.settings[settingKey];
      el.classList.toggle("active", this.settings[settingKey]);
      localStorage.setItem(
        "paperPlane_" + settingKey,
        this.settings[settingKey].toString(),
      );
      this.audio.triggerHaptic("light");
    });
  }

  setupGameEvents(): void {
    this.eventBus.on("ASTEROID_DESTROYED", (data) => {
      const { asteroid, coins } = data as { asteroid: Asteroid; coins: number };
      console.log("[Event] ASTEROID_DESTROYED", asteroid.size, "coins:", coins);

      this.coins += coins;
      this.audio.playDestroy(asteroid.size);
      this.audio.playCoin();
      this.audio.triggerHaptic(asteroid.size === "large" ? "heavy" : "medium");

      // Particles
      this.particles.emit(asteroid.x, asteroid.y, CONFIG.PAPER_BG, 12, "paper");
      this.particles.emit(
        asteroid.x,
        asteroid.y,
        CONFIG.PENCIL_DARK,
        8,
        "explosion",
      );

      // Floating text
      this.floatingText.add(
        asteroid.x,
        asteroid.y,
        "+" + coins,
        CONFIG.COIN_GOLD,
        24,
      );

      // Screen shake based on size
      const intensity =
        asteroid.size === "large"
          ? 0.5
          : asteroid.size === "medium"
            ? 0.3
            : 0.15;
      this.triggerScreenShake(intensity);

      // Increment destroyed count and check for upgrade
      if (this.gameState === "BOSS") return;
      this.destroyedCount++;
      this.updateProgressBar();
      if (this.destroyedCount >= this.getAsteroidsForNextUpgrade() && this.gameState === "PLAYING") {
        console.log("[Game] Triggering upgrade after", this.destroyedCount, "asteroids destroyed");
        this.showUpgradeScreen();
      }
    });

    this.eventBus.on("ASTEROID_HIT", (data) => {
      const { asteroid, damage } = data as {
        asteroid: Asteroid;
        damage: number;
      };
      this.audio.playHit();
      this.audio.triggerHaptic("light");

      // Hit flash
      asteroid.hitFlash = 0.2;

      // Small particles
      this.particles.emit(
        asteroid.x,
        asteroid.y,
        CONFIG.PENCIL_LIGHT,
        4,
        "spark",
      );
    });

    this.eventBus.on("PLAYER_HIT", () => {
      if (this.isInvincible) return; // Ignore hits during invincibility
      
      this.lives--;
      console.log("[Event] PLAYER_HIT - Lives remaining:", this.lives);
      
      if (this.lives <= 0) {
      this.gameOver();
      } else {
        // Trigger damage effect
        this.triggerDamageEffect();
      }
    });

    this.eventBus.on("UPGRADE_ROUND_START", () => {
      console.log("[Event] UPGRADE_ROUND_START");
      this.showUpgradeScreen();
    });

    this.eventBus.on("ON_FIRE", (data) => {
      if (!this.hasItem("flask_cannon")) return;
      const stats = (data as { stats: PlayerStats }).stats;
      const extraShots = Math.floor(randomRange(1, 4));
      for (let i = 0; i < extraShots; i++) {
        const angle = -Math.PI / 2 + randomRange(-0.4, 0.4);
        this.spawnBullet(angle, stats, 0.5, 0, 0.8);
      }
    });

    this.eventBus.on("ON_MOVE", (data) => {
      if (!this.itemEffects.tidalWave) return;
      const { speed } = data as { speed: number };
      if (speed < 2) return;
      this.tidalWaveTimer -= speed * 2;
      if (this.tidalWaveTimer <= 0) {
        this.spawnBullet(-Math.PI / 2, this.currentStats, 0.4, 0, 0.9);
        this.tidalWaveTimer = Math.max(80, 260 - speed * 10);
      }
    });
  }

  selectPlane(type: PlaneType): void {
    console.log("[selectPlane]", type);
    this.selectedPlane = type;

    document.querySelectorAll(".plane-card").forEach((card) => {
      card.classList.toggle(
        "selected",
        card.getAttribute("data-plane") === type,
      );
    });
  }

  showGalleryScreen(): void {
    console.log("[showGalleryScreen]");
    document.getElementById("startScreen")?.classList.add("hidden");
    document.getElementById("galleryScreen")?.classList.remove("hidden");
  }

  hideGalleryScreen(): void {
    console.log("[hideGalleryScreen]");
    document.getElementById("galleryScreen")?.classList.add("hidden");
    document.getElementById("startScreen")?.classList.remove("hidden");
  }

  resizeCanvas(): void {
    this.w = this.gameContainer.clientWidth;
    this.h = this.gameContainer.clientHeight;
    this.canvas.width = this.w;
    this.canvas.height = this.h;

    if (this.playerX === 0) {
      this.playerX = this.w / 2;
      this.playerY = this.h * CONFIG.PLAYER_Y_RATIO;
      this.targetX = this.w / 2;
      this.targetY = this.h * CONFIG.PLAYER_Y_RATIO;
    }

    console.log("[resizeCanvas]", this.w, "x", this.h);
  }

  // Helper to get position relative to game container
  getRelativeX(clientX: number): number {
    const rect = this.gameContainer.getBoundingClientRect();
    return clientX - rect.left;
  }

  getRelativeY(clientY: number): number {
    const rect = this.gameContainer.getBoundingClientRect();
    return clientY - rect.top;
  }

  startGame(): void {
    console.log("[startGame] Plane:", this.selectedPlane);

    this.audio.init();
    this.gameState = "PLAYING";

    // Reset state
    this.survivalTime = 0;
    this.coins = 0;
    this.score = 0;
    this.fireTimer = 0;
    this.spawnTimer = 0;
    this.destroyedCount = 0;
    this.totalUpgrades = 0;
    this.difficultyLevel = 0;
    this.healthBonus = 0;
    this.speedMultiplier = 1;
    this.itemsOwned = [];
    this.currentItemChoices = [];
    this.statModifiers = {
      damageFlat: 0,
      damageMult: 1,
      fireRateMult: 1,
      bulletSpeedMult: 1,
      moveSpeedFlat: 0,
      moveSpeedMult: 1,
      pierceFlat: 0,
      shotsAdd: 0,
      spreadAdd: 0,
      maxLivesAdd: 0,
      bulletSizeMult: 1,
      invincibilityBonus: 0,
      coinMult: 1,
    };
    this.itemEffects = {
      starOnHit: 0,
      splitOnHit: 0,
      bounceCount: 0,
      loopBullets: false,
      homingStrength: 0,
      snowball: false,
      snowballMax: 1,
      sticky: false,
      fireTrail: false,
      lightning: false,
      explosive: false,
      mirrorShots: false,
      teleportShots: false,
      waveBullets: false,
      dragBullets: false,
      accelerateBullets: false,
      gravityBullets: false,
      voodooOnHit: 0,
      creepyGunpowder: false,
      detonator: false,
      castleCrusher: false,
      tidalWave: false,
      momentum: false,
      carnageEngine: false,
      minigun: false,
      cyclotron: false,
      burstFire: 0,
      turretBuddies: 0,
      shieldBuddies: 0,
      ratBuddies: 0,
      prismBuddies: 0,
      mirrorBuddies: 0,
      shieldCharges: 0,
      bulletShape: null,
    };
    this.dynamicDamageMult = 1;
    this.dynamicFireRateMult = 1;
    this.dynamicMoveSpeedMult = 1;
    this.itemDamageBuff = 0;
    this.itemDamageBuffTimer = 0;
    this.minigunHeat = 0;
    this.cyclotronIndex = 0;
    this.castleCrusherCounter = 0;
    this.tidalWaveTimer = 0;
    this.cheeseBuffTimer = 0;
    this.cheeseDamageMult = 1;
    this.regenTimer = 0;
    this.ratDropTimer = 0;
    this.maxLives = BASE_STATS.maxLives;
    this.lives = this.maxLives;
    this.damageTimer = 0;
    this.damageFlashTimer = 0;
    this.isInvincible = false;
    this.shieldCharges = 0;
    this.maxShieldCharges = 0;
    this.boss = null;
    this.bossDefeated = false;
    this.bossAnnouncementTimer = 0;
    this.updateLivesDisplay();

    this.playerX = this.w / 2;
    this.playerY = this.h * CONFIG.PLAYER_Y_RATIO;
    this.targetX = this.w / 2;
    this.targetY = this.h * CONFIG.PLAYER_Y_RATIO;
    this.playerVelocityX = 0;
    this.playerVelocityY = 0;
    this.spinAngle = 0;
    this.spinDirection = 0;
    this.lastPlayerX = this.w / 2;
    this.mouseX = null;
    this.mouseY = null;
    this.touchX = null;
    this.touchY = null;

    // Clear entities
    for (const b of this.bullets) this.bulletPool.release(b);
    this.bullets = [];
    for (const a of this.asteroids) this.asteroidPool.release(a);
    this.asteroids = [];
    this.drones = [];
    this.orbitals = [];
    this.particles.clear();
    this.floatingText.clear();

    // Hide screens
    document.getElementById("startScreen")?.classList.add("hidden");
    document.getElementById("gameOverScreen")?.classList.add("hidden");
    document.getElementById("pauseScreen")?.classList.add("hidden");
    document.getElementById("upgradeScreen")?.classList.add("hidden");
    document.getElementById("galleryScreen")?.classList.add("hidden");

    // Show HUD
    document.getElementById("hud")?.classList.remove("hidden");
    document.getElementById("pauseBtn")?.classList.remove("hidden");
    document.getElementById("itemInventory")?.classList.remove("hidden");

    this.updateHUD();
    this.recalculateItemState();
    this.updateProgressBar();
  }

  showStartScreen(): void {
    console.log("[showStartScreen]");
    this.gameState = "START";

    document.getElementById("startScreen")?.classList.remove("hidden");
    document.getElementById("gameOverScreen")?.classList.add("hidden");
    document.getElementById("pauseScreen")?.classList.add("hidden");
    document.getElementById("upgradeScreen")?.classList.add("hidden");
    document.getElementById("galleryScreen")?.classList.add("hidden");
    document.getElementById("hud")?.classList.add("hidden");
    document.getElementById("pauseBtn")?.classList.add("hidden");
    document.getElementById("itemInventory")?.classList.add("hidden");

    // Re-init demo animation when returning to start screen
    this.initDemoAnimation();
  }

  pauseGame(): void {
    if (this.gameState !== "PLAYING") return;
    console.log("[pauseGame]");
    this.gameState = "PAUSED";
    document.getElementById("pauseScreen")?.classList.remove("hidden");
  }

  resumeGame(): void {
    if (this.gameState !== "PAUSED") return;
    console.log("[resumeGame]");
    this.gameState = "PLAYING";
    document.getElementById("pauseScreen")?.classList.add("hidden");
  }

  gameOver(): void {
    console.log(
      "[gameOver] Time:",
      (this.survivalTime / 1000).toFixed(1),
      "s, Coins:",
      this.coins,
    );
    this.gameState = "GAME_OVER";

    this.audio.playGameOver();
    this.audio.triggerHaptic("error");

    // Submit score (survival time in seconds)
    const scoreSeconds = Math.floor(this.survivalTime / 1000);
    if (
      typeof (window as unknown as { submitScore: (s: number) => void })
        .submitScore === "function"
    ) {
      (window as unknown as { submitScore: (s: number) => void }).submitScore(
        scoreSeconds,
      );
      console.log("[gameOver] Score submitted:", scoreSeconds);
    }

    // Update game over screen
    const mins = Math.floor(this.survivalTime / 60000);
    const secs = Math.floor((this.survivalTime % 60000) / 1000);
    document.getElementById("finalTime")!.textContent =
      mins + ":" + secs.toString().padStart(2, "0");
    document.getElementById("finalCoins")!.textContent = this.coins.toString();

    // Update item summary
    const cursedCount = this.itemsOwned.filter((id) => {
      const item = ITEM_MAP.get(id);
      return item?.isCursed;
    }).length;
    document.getElementById("summaryItems")!.textContent =
      this.itemsOwned.length.toString();
    document.getElementById("summaryCursed")!.textContent =
      cursedCount.toString();

    // Show screen
    document.getElementById("hud")?.classList.add("hidden");
    document.getElementById("pauseBtn")?.classList.add("hidden");
    document.getElementById("itemInventory")?.classList.add("hidden");
    document.getElementById("gameOverScreen")?.classList.remove("hidden");
  }

  showUpgradeScreen(): void {
    if (this.gameState === "UPGRADE") return;
    console.log("[showUpgradeScreen]");
    this.gameState = "UPGRADE";
    this.upgradeAutoSelectTimer = 5000; // 5 seconds

    this.rollItemChoices();
    const cards = document.querySelectorAll(".item-card");
    cards.forEach((card, index) => {
      const item = this.currentItemChoices[index];
      if (!item) {
        card.classList.add("hidden");
        return;
      }
      card.classList.remove("hidden");
      card.classList.toggle("cursed", item.isCursed);
      card.setAttribute("data-item-id", item.id);

      const nameEl = card.querySelector(".item-name");
      const descEl = card.querySelector(".item-desc");
      const categoryEl = card.querySelector(".item-category");
      const curseEl = card.querySelector(".item-curse");

      if (nameEl) nameEl.textContent = item.name;
      if (descEl) descEl.textContent = item.description;
      if (categoryEl) categoryEl.textContent = item.category.toUpperCase();
      if (curseEl) curseEl.textContent = item.isCursed ? "CURSED" : "";
    });

    document.getElementById("upgradeScreen")?.classList.remove("hidden");
    this.updateUpgradeTimer();
  }

  selectItem(itemId: string): void {
    if (this.gameState !== "UPGRADE") return;
    const index = this.currentItemChoices.findIndex((item) => item.id === itemId);
    if (index === -1) return;
    this.applyItemChoice(index);
  }

  startBossFight(): void {
    console.log("[startBossFight] Boss fight starting!");
    
    // Clear existing asteroids for a clean arena
    for (const asteroid of this.asteroids) {
      asteroid.active = false;
      this.asteroidPool.release(asteroid);
    }
    this.asteroids = [];
    
    // Show announcement
    this.bossAnnouncementTimer = 2.5; // 2.5 seconds of announcement
    const announcement = document.getElementById("bossAnnouncement");
    if (announcement) {
      announcement.classList.add("active");
    }
    
    // Create the boss
    this.boss = {
      x: this.w / 2,
      y: -CONFIG.BOSS_RADIUS, // Start above screen
      targetY: CONFIG.BOSS_Y_POSITION,
      health: CONFIG.BOSS_HEALTH,
      maxHealth: CONFIG.BOSS_HEALTH,
      rotation: 0,
      throwCount: 0,
      throwTimer: 2000, // Initial delay before first throw
      active: true,
      entering: true,
      defeated: false,
      pulsePhase: 0,
    };
    
    this.gameState = "BOSS";
    this.audio.triggerHaptic("heavy");
  }

  applyUpgrade(tree: string, tier: number): void {
    console.log("[applyUpgrade] Deprecated:", tree, tier);
  }

  updateUpgradeTimer(): void {
    const timerEl = document.getElementById("upgradeTimer");
    if (timerEl) {
      timerEl.textContent = Math.ceil(
        this.upgradeAutoSelectTimer / 1000,
      ).toString();
    }
  }

  updateHUD(): void {
    const mins = Math.floor(this.survivalTime / 60000);
    const secs = Math.floor((this.survivalTime % 60000) / 1000);
    document.getElementById("timeDisplay")!.textContent =
      mins + ":" + secs.toString().padStart(2, "0");
    document.getElementById("coinDisplay")!.textContent = this.coins.toString();
    this.updateShieldUI();
  }

  getAsteroidsForNextUpgrade(): number {
    // Progressive upgrade requirements: 6, 12, 12, 14, 16, 16, 16...
    const requirements = [6, 12, 12, 14, 16];
    if (this.totalUpgrades < requirements.length) {
      return requirements[this.totalUpgrades];
    }
    return 16; // Cap at 16 for all subsequent upgrades
  }

  updateProgressBar(): void {
    const required = this.getAsteroidsForNextUpgrade();
    const progress = Math.min(this.destroyedCount / required, 1);
    const progressFill = document.getElementById("progressFill");
    if (progressFill) {
      progressFill.style.width = (progress * 100) + "%";
    }
    const progressText = document.getElementById("progressText");
    if (progressText) {
      progressText.textContent = this.destroyedCount + "/" + required;
    }
  }

  hasItem(itemId: string): boolean {
    return this.itemsOwned.includes(itemId);
  }

  recalculateItemState(): void {
    const modifiers: StatModifiers = {
      damageFlat: 0,
      damageMult: 1,
      fireRateMult: 1,
      bulletSpeedMult: 1,
      moveSpeedFlat: 0,
      moveSpeedMult: 1,
      pierceFlat: 0,
      shotsAdd: 0,
      spreadAdd: 0,
      maxLivesAdd: 0,
      bulletSizeMult: 1,
      invincibilityBonus: 0,
      coinMult: 1,
    };

    const effects: ItemEffects = {
      starOnHit: 0,
      splitOnHit: 0,
      bounceCount: 0,
      loopBullets: false,
      homingStrength: 0,
      snowball: false,
      snowballMax: 1,
      sticky: false,
      fireTrail: false,
      lightning: false,
      explosive: false,
      mirrorShots: false,
      teleportShots: false,
      waveBullets: false,
      dragBullets: false,
      accelerateBullets: false,
      gravityBullets: false,
      voodooOnHit: 0,
      creepyGunpowder: false,
      detonator: false,
      castleCrusher: false,
      tidalWave: false,
      momentum: false,
      carnageEngine: false,
      minigun: false,
      cyclotron: false,
      burstFire: 0,
      turretBuddies: 0,
      shieldBuddies: 0,
      ratBuddies: 0,
      prismBuddies: 0,
      mirrorBuddies: 0,
      shieldCharges: 0,
      bulletShape: null,
    };

    let bulletShape: BulletShape | null = null;

    for (const itemId of this.itemsOwned) {
      const item = ITEM_MAP.get(itemId);
      if (!item) continue;

      if (item.stats) {
        if (item.stats.damageFlat) modifiers.damageFlat += item.stats.damageFlat;
        if (item.stats.damageMult) modifiers.damageMult *= item.stats.damageMult;
        if (item.stats.fireRateMult) modifiers.fireRateMult *= item.stats.fireRateMult;
        if (item.stats.bulletSpeedMult) modifiers.bulletSpeedMult *= item.stats.bulletSpeedMult;
        if (item.stats.moveSpeedFlat) modifiers.moveSpeedFlat += item.stats.moveSpeedFlat;
        if (item.stats.moveSpeedMult) modifiers.moveSpeedMult *= item.stats.moveSpeedMult;
        if (item.stats.pierceFlat) modifiers.pierceFlat += item.stats.pierceFlat;
        if (item.stats.shotsAdd) modifiers.shotsAdd += item.stats.shotsAdd;
        if (item.stats.spreadAdd) modifiers.spreadAdd += item.stats.spreadAdd;
        if (item.stats.maxLivesAdd) modifiers.maxLivesAdd += item.stats.maxLivesAdd;
        if (item.stats.bulletSizeMult) modifiers.bulletSizeMult *= item.stats.bulletSizeMult;
        if (item.stats.invincibilityBonus) modifiers.invincibilityBonus += item.stats.invincibilityBonus;
        if (item.stats.coinMult) modifiers.coinMult *= item.stats.coinMult;
      }

      if (item.effects) {
        if (item.effects.starOnHit) effects.starOnHit += item.effects.starOnHit;
        if (item.effects.splitOnHit) effects.splitOnHit += item.effects.splitOnHit;
        if (item.effects.bounceCount) effects.bounceCount += item.effects.bounceCount;
        if (item.effects.loopBullets) effects.loopBullets = true;
        if (item.effects.homingStrength) effects.homingStrength = Math.max(effects.homingStrength, item.effects.homingStrength);
        if (item.effects.snowball) effects.snowball = true;
        if (item.effects.snowballMax) effects.snowballMax = Math.max(effects.snowballMax, item.effects.snowballMax);
        if (item.effects.sticky) effects.sticky = true;
        if (item.effects.fireTrail) effects.fireTrail = true;
        if (item.effects.lightning) effects.lightning = true;
        if (item.effects.explosive) effects.explosive = true;
        if (item.effects.mirrorShots) effects.mirrorShots = true;
        if (item.effects.teleportShots) effects.teleportShots = true;
        if (item.effects.waveBullets) effects.waveBullets = true;
        if (item.effects.dragBullets) effects.dragBullets = true;
        if (item.effects.accelerateBullets) effects.accelerateBullets = true;
        if (item.effects.gravityBullets) effects.gravityBullets = true;
        if (item.effects.voodooOnHit) effects.voodooOnHit += item.effects.voodooOnHit;
        if (item.effects.creepyGunpowder) effects.creepyGunpowder = true;
        if (item.effects.detonator) effects.detonator = true;
        if (item.effects.castleCrusher) effects.castleCrusher = true;
        if (item.effects.tidalWave) effects.tidalWave = true;
        if (item.effects.momentum) effects.momentum = true;
        if (item.effects.carnageEngine) effects.carnageEngine = true;
        if (item.effects.minigun) effects.minigun = true;
        if (item.effects.cyclotron) effects.cyclotron = true;
        if (item.effects.burstFire) effects.burstFire = Math.max(effects.burstFire, item.effects.burstFire);
        if (item.effects.turretBuddies) effects.turretBuddies += item.effects.turretBuddies;
        if (item.effects.shieldBuddies) effects.shieldBuddies += item.effects.shieldBuddies;
        if (item.effects.ratBuddies) effects.ratBuddies += item.effects.ratBuddies;
        if (item.effects.prismBuddies) effects.prismBuddies += item.effects.prismBuddies;
        if (item.effects.mirrorBuddies) effects.mirrorBuddies += item.effects.mirrorBuddies;
        if (item.effects.shieldCharges) effects.shieldCharges += item.effects.shieldCharges;
        if (item.effects.bulletShape) bulletShape = item.effects.bulletShape;
      }

      if (item.bulletShape) bulletShape = item.bulletShape;
    }

    if (this.hasItem("empty_dragon_egg")) {
      modifiers.damageFlat += this.itemsOwned.length;
    }

    this.statModifiers = modifiers;
    this.itemEffects = effects;
    this.itemEffects.bulletShape = bulletShape;

    this.maxLives = Math.max(1, Math.floor(BASE_STATS.maxLives + modifiers.maxLivesAdd));
    this.lives = Math.min(this.lives, this.maxLives);

    this.maxShieldCharges = effects.shieldCharges;
    if (this.maxShieldCharges > 0) {
      this.shieldCharges = Math.max(this.shieldCharges, this.maxShieldCharges);
    }

    this.updateCurrentStats();
    this.rebuildDronesFromItems();
    this.rebuildOrbitalsFromItems();
    this.updateInventoryUI();
    this.updateShieldUI();
  }

  updateCurrentStats(): void {
    const bulletCharmMult = this.hasItem("bullet_charm")
      ? 1 + Math.min(1, this.bullets.length / 40)
      : 1;

    const baseDamage =
      (BASE_STATS.damage + this.statModifiers.damageFlat) *
      this.statModifiers.damageMult *
      this.dynamicDamageMult *
      bulletCharmMult;

    const bulletSpeed =
      BASE_STATS.bulletSpeed *
      this.statModifiers.bulletSpeedMult *
      bulletCharmMult;

    const fireRateMult =
      this.statModifiers.fireRateMult * this.dynamicFireRateMult * bulletCharmMult;

    const moveSpeed =
      (BASE_STATS.moveSpeed + this.statModifiers.moveSpeedFlat) *
      this.statModifiers.moveSpeedMult *
      this.dynamicMoveSpeedMult *
      bulletCharmMult;

    let damage = Math.max(0.2, baseDamage);
    if (this.hasItem("elastic_cables")) {
      const speedMult = clamp(bulletSpeed / BASE_STATS.bulletSpeed, 1, 2);
      damage *= speedMult;
    }

    this.currentStats = {
      damage,
      fireRateMs: BASE_STATS.fireRateMs / Math.max(0.2, fireRateMult),
      bulletSpeed,
      moveSpeed,
      pierce: BASE_STATS.pierce + this.statModifiers.pierceFlat,
      shots: Math.max(1, BASE_STATS.shots + this.statModifiers.shotsAdd),
      spread: Math.max(0, BASE_STATS.spread + this.statModifiers.spreadAdd),
      maxLives: this.maxLives,
      bulletSize: BASE_STATS.bulletSize * this.statModifiers.bulletSizeMult,
    };
  }

  updateDynamicModifiers(dt: number): void {
    this.dynamicDamageMult = 1;
    this.dynamicFireRateMult = 1;
    this.dynamicMoveSpeedMult = 1;

    if (this.itemEffects.minigun) {
      this.minigunHeat = Math.max(0, this.minigunHeat - dt * 0.2);
      this.dynamicFireRateMult *= 1 + this.minigunHeat * 2;
    }

    if (this.itemEffects.carnageEngine) {
      if (this.itemDamageBuffTimer > 0) {
        this.itemDamageBuffTimer -= dt;
      } else {
        this.itemDamageBuff = Math.max(0, this.itemDamageBuff - dt * 0.2);
      }
      this.dynamicDamageMult *= 1 + this.itemDamageBuff;
    }

    if (this.itemEffects.momentum) {
      const speed = Math.hypot(this.playerVelocityX, this.playerVelocityY);
      const bonus = clamp(speed / 200, 0, 1);
      this.dynamicDamageMult *= 1 + bonus;
      this.dynamicFireRateMult *= 1 + bonus * 0.4;
      this.dynamicMoveSpeedMult *= 1 + bonus * 0.3;
    }

    if (this.cheeseBuffTimer > 0) {
      this.cheeseBuffTimer -= dt;
      if (this.cheeseBuffTimer <= 0) {
        this.cheeseBuffTimer = 0;
        this.cheeseDamageMult = 1;
      }
      this.dynamicDamageMult *= this.cheeseDamageMult;
    }

    this.updateCurrentStats();
  }

  updateItemBehaviors(dt: number): void {
    if (this.itemEffects.ratBuddies > 0) {
      this.ratDropTimer -= dt * 1000;
      if (this.ratDropTimer <= 0) {
        this.ratDropTimer = randomRange(9000, 14000);
        this.cheeseBuffTimer = 4;
        this.cheeseDamageMult = 3.2;
        this.floatingText.add(this.playerX, this.playerY - 40, "Cheese!", "#ffd27d", 2);
      }
    }
  }

  updateShieldUI(): void {
    const shieldEl = document.getElementById("shieldDisplay");
    if (!shieldEl) return;
    if (this.maxShieldCharges <= 0) {
      shieldEl.textContent = "";
      return;
    }
    shieldEl.textContent = "Shield " + this.shieldCharges + "/" + this.maxShieldCharges;
  }

  updateInventoryUI(): void {
    const inventory = document.getElementById("itemInventory");
    if (!inventory) return;

    inventory.innerHTML = "";
    for (const itemId of this.itemsOwned) {
      const item = ITEM_MAP.get(itemId);
      if (!item) continue;
      const chip = document.createElement("div");
      chip.className = "item-chip" + (item.isCursed ? " cursed" : "");
      chip.textContent = item.name;
      inventory.appendChild(chip);
    }
  }

  rebuildDronesFromItems(): void {
    this.drones = [];
    const totalTurretBuddies = this.itemEffects.turretBuddies + this.itemEffects.mirrorBuddies;
    if (totalTurretBuddies <= 0) return;

    for (let i = 0; i < totalTurretBuddies; i++) {
      this.drones.push({
        x: this.playerX,
        y: this.playerY,
        targetX: this.playerX,
        targetY: this.playerY,
        wanderTimer: 0,
        fireTimer: randomRange(200, 800),
        facingAngle: -Math.PI / 2,
        active: true,
      });
    }
  }

  rebuildOrbitalsFromItems(): void {
    this.orbitals = [];
    const total = this.itemEffects.shieldBuddies + this.itemEffects.prismBuddies + this.itemEffects.ratBuddies;
    if (total <= 0) return;

    const baseRadius = CONFIG.DRONE_ORBIT_RADIUS * 1.4;
    let index = 0;
    const addOrbitals = (type: OrbitalType, count: number, radiusOffset: number) => {
      for (let i = 0; i < count; i++) {
        const angle = ((index + i) / Math.max(1, total)) * Math.PI * 2;
        this.orbitals.push({
          type,
          angle,
          radius: baseRadius + radiusOffset,
          x: this.playerX,
          y: this.playerY,
          timer: 0,
        });
      }
      index += count;
    };

    addOrbitals("shield", this.itemEffects.shieldBuddies, 0);
    addOrbitals("prism", this.itemEffects.prismBuddies, 20);
    addOrbitals("rat", this.itemEffects.ratBuddies, 35);
  }

  updateOrbitals(dt: number): void {
    if (this.orbitals.length === 0) return;
    for (const orbital of this.orbitals) {
      const speed =
        orbital.type === "shield"
          ? 1.2
          : orbital.type === "prism"
            ? 0.9
            : 0.6;
      orbital.angle += dt * speed;
      orbital.x = this.playerX + Math.cos(orbital.angle) * orbital.radius;
      orbital.y = this.playerY + Math.sin(orbital.angle) * orbital.radius;

      if (orbital.type === "shield") {
        for (const a of this.asteroids) {
          const config = CONFIG.ASTEROID_SIZES[a.size];
          const dist = distance(orbital.x, orbital.y, a.x, a.y);
          if (dist < config.radius + 10) {
            a.health -= 1;
            a.hitFlash = 0.2;
            if (a.health <= 0) {
              this.handleAsteroidDestroyed(a);
            }
          }
        }
      }

      if (orbital.type === "prism") {
        for (const b of this.bullets) {
          if (b.prismSplit) continue;
          const dist = distance(orbital.x, orbital.y, b.x, b.y);
          if (dist < 18) {
            b.prismSplit = true;
            this.spawnSplitBullets(b, 3);
          }
        }
      }
    }
  }

  drawOrbitals(): void {
    if (this.orbitals.length === 0) return;
    const ctx = this.ctx;
    for (const orbital of this.orbitals) {
      ctx.save();
      ctx.translate(orbital.x, orbital.y);
      if (orbital.type === "shield") {
        ctx.strokeStyle = "#66aaff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.stroke();
      } else if (orbital.type === "prism") {
        ctx.strokeStyle = "#cc88ff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(7, 6);
        ctx.lineTo(-7, 6);
        ctx.closePath();
        ctx.stroke();
      } else {
        ctx.strokeStyle = "#ffd27d";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  rollItemChoices(): void {
    const available = ITEM_DEFS.filter((item) => !this.itemsOwned.includes(item.id));
    const pool = available.length >= 3 ? available : ITEM_DEFS;
    const choices: ItemDefinition[] = [];
    const used = new Set<string>();

    while (choices.length < 3 && used.size < pool.length) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (used.has(pick.id)) continue;
      used.add(pick.id);
      choices.push(pick);
    }

    this.currentItemChoices = choices;
  }

  applyItemChoice(index: number): void {
    const item = this.currentItemChoices[index];
    if (!item) return;
    this.acquireItem(item.id);

    this.audio.playUpgrade();
    this.audio.triggerHaptic("success");

    this.destroyedCount = 0;
    this.totalUpgrades++;

    document.getElementById("upgradeScreen")?.classList.add("hidden");

    if (this.totalUpgrades === 2 && !this.bossDefeated) {
      console.log("[applyItemChoice] Triggering boss fight after 2nd upgrade");
      this.startBossFight();
    } else {
      this.gameState = "PLAYING";
      this.updateProgressBar();
    }
  }

  acquireItem(itemId: string): void {
    if (this.itemsOwned.includes(itemId)) return;
    const item = ITEM_MAP.get(itemId);
    if (!item) return;

    console.log("[acquireItem]", item.name);
    this.itemsOwned.push(itemId);

    // Immediate effects
    this.recalculateItemState();
    this.floatingText.add(this.playerX, this.playerY - 60, item.name, "#2d2d2d", 1.6);
    if (itemId === "spicy_cheezo" || itemId === "forbidden_gummi") {
      this.lives = this.maxLives;
    }
    if (itemId === "ironplate_potion") {
      this.lives = Math.min(this.lives + 2, this.maxLives);
    }
    this.updateLivesDisplay();
    this.updateHUD();
  }

  updateLivesDisplay(): void {
    const livesContainer = document.getElementById("livesDisplay");
    if (!livesContainer) return;
    
    livesContainer.innerHTML = "";
    for (let i = 0; i < this.maxLives; i++) {
      const heart = document.createElement("span");
      heart.className = "life-heart" + (i < this.lives ? " filled" : " empty");
      heart.innerHTML = "&#9829;"; // Heart symbol
      livesContainer.appendChild(heart);
    }
  }

  triggerDamageEffect(): void {
    console.log("[triggerDamageEffect] Starting damage animation");
    
    // Start invincibility period
    this.isInvincible = true;
    this.damageTimer = 1.5 + this.statModifiers.invincibilityBonus;
    this.damageFlashTimer = 0;
    
    // Show damage overlay
    const overlay = document.getElementById("damageOverlay");
    if (overlay) {
      overlay.classList.add("active");
      setTimeout(() => {
        overlay.classList.remove("active");
      }, 300);
    }
    
    // Update lives display
    this.updateLivesDisplay();
    
    // Haptic feedback
    this.audio.triggerHaptic("error");
    
    // Screen shake
    this.triggerScreenShake(8);

    this.eventBus.emit("ON_DAMAGE", { lives: this.lives });
  }

  updateDamageState(dt: number): void {
    if (!this.isInvincible) return;
    
    this.damageTimer -= dt;
    this.damageFlashTimer += dt * 12; // Controls blink speed
    
    if (this.damageTimer <= 0) {
      this.isInvincible = false;
      this.damageTimer = 0;
      this.damageFlashTimer = 0;
    }
  }

  triggerScreenShake(intensity: number): void {
    this.screenShake.intensity = Math.max(
      this.screenShake.intensity,
      intensity,
    );
  }

  // ============= GAME LOGIC =============

  updatePlayer(dt: number): void {
    const marginX = CONFIG.PLAYER_WIDTH / 2 + 10;
    const marginTopY = 100; // Keep plane away from top HUD
    const marginBottomY = 60; // Keep plane away from bottom
    const moveSpeed = this.currentStats.moveSpeed;
    const prevX = this.playerX;
    const prevY = this.playerY;

    // Desktop: plane follows mouse cursor automatically
    if (!this.isMobile && this.mouseX !== null && this.mouseY !== null) {
      // Small offset so plane appears slightly above cursor
      const offsetY = 30;
      this.targetX = this.mouseX;
      this.targetY = this.mouseY - offsetY;
    }
    // Mobile: plane follows finger when dragging
    else if (this.isMobile && this.isDragging && this.touchX !== null && this.touchY !== null) {
      // Larger offset for touch so finger doesn't cover plane
      const offsetY = 80;
      this.targetX = this.touchX;
      this.targetY = this.touchY - offsetY;
    }
    // Keyboard fallback (when mouse not available or on mobile without touch)
    else if (!this.isMobile && this.mouseX === null) {
      // Keyboard controls for X movement only
      if (
        this.keysDown.has("ArrowLeft") ||
        this.keysDown.has("a") ||
        this.keysDown.has("A")
      ) {
        this.targetX = this.playerX - moveSpeed * dt * 60;
      }
      if (
        this.keysDown.has("ArrowRight") ||
        this.keysDown.has("d") ||
        this.keysDown.has("D")
      ) {
        this.targetX = this.playerX + moveSpeed * dt * 60;
      }
      if (
        this.keysDown.has("ArrowUp") ||
        this.keysDown.has("w") ||
        this.keysDown.has("W")
      ) {
        this.targetY = this.playerY - moveSpeed * dt * 60;
      }
      if (
        this.keysDown.has("ArrowDown") ||
        this.keysDown.has("s") ||
        this.keysDown.has("S")
      ) {
        this.targetY = this.playerY + moveSpeed * dt * 60;
      }
    }

    // Clamp targets
    this.targetX = clamp(this.targetX, marginX, this.w - marginX);
    this.targetY = clamp(this.targetY, marginTopY, this.h - marginBottomY);

    // Apply plane quirks for movement
    if (this.selectedPlane === "glider") {
      // Momentum/drift - slow response in both axes
      this.playerVelocityX = lerp(
        this.playerVelocityX,
        this.targetX - this.playerX,
        0.12,
      );
      this.playerVelocityY = lerp(
        this.playerVelocityY,
        this.targetY - this.playerY,
        0.12,
      );
      this.playerX += this.playerVelocityX;
      this.playerY += this.playerVelocityY;
    } else {
      // Dart and Bomber - responsive follow
      const lerpFactor = (this.mouseX !== null || this.isDragging) ? 0.25 : 0.3;
      this.playerX = lerp(this.playerX, this.targetX, lerpFactor);
      this.playerY = lerp(this.playerY, this.targetY, lerpFactor);
    }

    // Clamp final position
    this.playerX = clamp(this.playerX, marginX, this.w - marginX);
    this.playerY = clamp(this.playerY, marginTopY, this.h - marginBottomY);

    // Update velocity based on actual movement
    this.playerVelocityX = this.playerX - prevX;
    this.playerVelocityY = this.playerY - prevY;

    const moveSpeedNow = Math.hypot(this.playerVelocityX, this.playerVelocityY);
    if (moveSpeedNow > 0.5) {
      this.eventBus.emit("ON_MOVE", { speed: moveSpeedNow });
    }

    // Detect large horizontal movement for barrel roll
    const horizontalDelta = this.playerX - this.lastPlayerX;
    const spinThreshold = 8; // Pixels per frame to trigger spin

    if (this.spinDirection === 0 && Math.abs(horizontalDelta) > spinThreshold) {
      // Trigger a spin in the direction of movement
      this.spinDirection = horizontalDelta > 0 ? 1 : -1;
      this.spinAngle = 0;
      this.audio.triggerHaptic("medium");
    }

    // Update spin animation
    if (this.spinDirection !== 0) {
      this.spinAngle += this.spinDirection * 0.35 * dt * 60; // Spin speed

      // Complete the spin (full 360 degrees = 2*PI)
      if (Math.abs(this.spinAngle) >= Math.PI * 2) {
        this.spinAngle = 0;
        this.spinDirection = 0;
      }
    }

    this.lastPlayerX = this.playerX;
  }

  fireBullets(): void {
    if (this.itemEffects.minigun) {
      this.minigunHeat = clamp(this.minigunHeat + 0.08, 0, 1);
    }

    const stats = this.currentStats;
    let bulletCount = stats.shots;
    let spread = stats.spread;
    let speedMult = 1;

    if (this.itemEffects.minigun) {
      spread += this.minigunHeat * 12;
    }

    if (this.itemEffects.cyclotron) {
      const patterns = [
        { shots: 1, spread: 0, speed: 1 },
        { shots: 3, spread: 24, speed: 0.9 },
        { shots: 5, spread: 60, speed: 0.8 },
        { shots: 2, spread: 12, speed: 1.15 },
      ];
      const pattern = patterns[this.cyclotronIndex % patterns.length];
      bulletCount = Math.max(bulletCount, pattern.shots);
      spread = Math.max(spread, pattern.spread);
      speedMult = pattern.speed;
      this.cyclotronIndex++;
    }

    const baseAngle = -Math.PI / 2;
    const startAngle = baseAngle - ((spread / 2) * Math.PI) / 180;
    const angleStep =
      bulletCount > 1 ? (spread * Math.PI) / 180 / (bulletCount - 1) : 0;

    const isCrusherVolley = this.itemEffects.castleCrusher
      ? this.castleCrusherCounter % 3 === 2
      : false;
    if (this.itemEffects.castleCrusher) {
      this.castleCrusherCounter++;
    }

    const damageMult = isCrusherVolley ? 2.5 : 1;
    const bonusPierce = isCrusherVolley ? 2 : 0;
    const burstCount = this.itemEffects.burstFire > 0 ? this.itemEffects.burstFire : 1;

    for (let i = 0; i < bulletCount; i++) {
      let angle = bulletCount === 1 ? baseAngle : startAngle + angleStep * i;

      // Bomber quirk: slight spread
      if (this.selectedPlane === "bomber") {
        angle += ((Math.random() - 0.5) * 4 * Math.PI) / 180;
      }

      for (let b = 0; b < burstCount; b++) {
        const burstAngle = angle + (b - (burstCount - 1) / 2) * 0.02;
        this.spawnBullet(burstAngle, stats, damageMult, bonusPierce, speedMult);
      }
    }

    this.audio.playShoot();
    this.eventBus.emit("ON_FIRE", { stats: this.currentStats });
  }

  getShotOrigin(): { x: number; y: number } {
    if (this.itemEffects.teleportShots) {
      const cursorX = this.isMobile ? this.touchX : this.mouseX;
      const cursorY = this.isMobile ? this.touchY : this.mouseY;
      if (cursorX !== null && cursorY !== null) {
        return { x: cursorX, y: cursorY };
      }
    }
    return { x: this.playerX, y: this.playerY - CONFIG.PLAYER_HEIGHT / 2 };
  }

  spawnBullet(
    angle: number,
    stats: PlayerStats,
    damageMult: number,
    bonusPierce: number,
    speedMult: number,
    isMirror: boolean = false,
  ): Bullet {
    const origin = this.getShotOrigin();
      const bullet = this.bulletPool.acquire();
    bullet.x = origin.x;
    bullet.y = origin.y;
    bullet.vx = Math.cos(angle) * stats.bulletSpeed * speedMult;
    bullet.vy = Math.sin(angle) * stats.bulletSpeed * speedMult;
    bullet.damage = stats.damage * damageMult;
    bullet.pierceRemaining = stats.pierce + bonusPierce;
    bullet.explosive = this.itemEffects.explosive;
    bullet.chainLightning = this.itemEffects.lightning;
      bullet.active = true;
      bullet.fromDrone = false;
    bullet.age = 0;
    bullet.maxAge = 3.2;
    bullet.size = stats.bulletSize;
    bullet.color = this.itemEffects.bulletShape === "star" ? "#ffd27d" :
      this.itemEffects.bulletShape === "bolt" ? "#55ccff" :
      this.itemEffects.bulletShape === "rocket" ? "#ff9966" :
      this.itemEffects.bulletShape === "bubble" ? "#77ccee" :
      CONFIG.PENCIL_DARK;
    bullet.shape = this.itemEffects.bulletShape ?? "line";
    bullet.wobblePhase = Math.random() * Math.PI * 2;
    bullet.bounceRemaining = this.itemEffects.bounceCount;
    bullet.loop = this.itemEffects.loopBullets;
    bullet.homingStrength = this.itemEffects.homingStrength;
    bullet.snowball = this.itemEffects.snowball;
    bullet.snowballMax = this.itemEffects.snowballMax;
    bullet.sticky = this.itemEffects.sticky;
    bullet.stuckToId = -1;
    bullet.drag = this.itemEffects.dragBullets ? 0.012 : 0;
    bullet.acceleration = this.itemEffects.accelerateBullets ? 0.02 : 0;
    bullet.gravity = this.itemEffects.gravityBullets ? 0.12 : 0;
    bullet.splitOnHit = this.itemEffects.splitOnHit;
    bullet.trailTimer = 0;
    bullet.jitterOffset = randomRange(-1.5, 1.5);
    bullet.prismSplit = false;

      this.bullets.push(bullet);

    if (this.itemEffects.mirrorShots && !isMirror) {
      const mirrorAngle = angle + Math.PI;
      const mirrorBullet = this.bulletPool.acquire();
      mirrorBullet.x = this.w - origin.x;
      mirrorBullet.y = origin.y;
      mirrorBullet.vx = Math.cos(mirrorAngle) * stats.bulletSpeed * speedMult;
      mirrorBullet.vy = Math.sin(mirrorAngle) * stats.bulletSpeed * speedMult;
      mirrorBullet.damage = stats.damage * damageMult;
      mirrorBullet.pierceRemaining = stats.pierce + bonusPierce;
      mirrorBullet.explosive = this.itemEffects.explosive;
      mirrorBullet.chainLightning = this.itemEffects.lightning;
      mirrorBullet.active = true;
      mirrorBullet.fromDrone = false;
      mirrorBullet.age = 0;
      mirrorBullet.maxAge = 3.2;
      mirrorBullet.size = stats.bulletSize;
      mirrorBullet.color = bullet.color;
      mirrorBullet.shape = bullet.shape;
      mirrorBullet.wobblePhase = bullet.wobblePhase;
      mirrorBullet.bounceRemaining = bullet.bounceRemaining;
      mirrorBullet.loop = bullet.loop;
      mirrorBullet.homingStrength = bullet.homingStrength;
      mirrorBullet.snowball = bullet.snowball;
      mirrorBullet.snowballMax = bullet.snowballMax;
      mirrorBullet.sticky = bullet.sticky;
      mirrorBullet.stuckToId = -1;
      mirrorBullet.drag = bullet.drag;
      mirrorBullet.acceleration = bullet.acceleration;
      mirrorBullet.gravity = bullet.gravity;
      mirrorBullet.splitOnHit = bullet.splitOnHit;
      mirrorBullet.trailTimer = 0;
      mirrorBullet.jitterOffset = bullet.jitterOffset;
      mirrorBullet.prismSplit = false;
      this.bullets.push(mirrorBullet);
    }
    return bullet;
  }

  updateBullets(dt: number): void {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (!b.active) {
        this.bulletPool.release(b);
        this.bullets.splice(i, 1);
        continue;
      }
      b.age += dt;

      if (b.age > b.maxAge) {
        this.bulletPool.release(b);
        this.bullets.splice(i, 1);
        continue;
      }

      // Sticky bullets latch to a target
      if (b.sticky && b.stuckToId >= 0) {
        const target = this.asteroids.find((a) => a.id === b.stuckToId);
        if (!target) {
          this.bulletPool.release(b);
          this.bullets.splice(i, 1);
          continue;
        }
        b.x = target.x + b.stuckOffsetX;
        b.y = target.y + b.stuckOffsetY;
        b.trailTimer += dt;
        if (b.trailTimer >= 0.35) {
          b.trailTimer = 0;
          target.health -= b.damage * 0.35;
          target.hitFlash = 0.2;
          if (target.health <= 0) {
            this.handleAsteroidDestroyed(target);
          }
        }
        continue;
      }

      if (b.snowball) {
        const grow = 1 + Math.min(1, b.age / 1.2) * (b.snowballMax - 1);
        b.size = this.currentStats.bulletSize * grow;
      }

      if (b.homingStrength > 0 && this.asteroids.length > 0) {
        const target = this.findNearestAsteroid(b.x, b.y, 400);
        if (target) {
          const dx = target.x - b.x;
          const dy = target.y - b.y;
          const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          const steer = b.homingStrength * dt * 60;
          b.vx = lerp(b.vx, (dx / dist) * this.currentStats.bulletSpeed, steer);
          b.vy = lerp(b.vy, (dy / dist) * this.currentStats.bulletSpeed, steer);
        }
      }

      if (b.acceleration > 0) {
        const angle = Math.atan2(b.vy, b.vx);
        const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        const newSpeed = speed * (1 + b.acceleration * dt * 60);
        b.vx = Math.cos(angle) * newSpeed;
        b.vy = Math.sin(angle) * newSpeed;
      }

      if (b.drag > 0) {
        const dragFactor = Math.max(0, 1 - b.drag * dt * 60);
        b.vx *= dragFactor;
        b.vy *= dragFactor;
      }

      if (b.gravity > 0) {
        b.vy += b.gravity * dt * 60;
      }

      if (this.itemEffects.waveBullets || b.shape === "note" || b.shape === "bolt") {
        b.wobblePhase += dt * 8;
        const wobble = Math.sin(b.wobblePhase) * 0.6;
        b.x += wobble;
      }

      b.x += b.vx * dt * 60;
      b.y += b.vy * dt * 60;

      if (b.bounceRemaining > 0 && !b.loop) {
        const bouncedX = b.x < 10 || b.x > this.w - 10;
        const bouncedY = b.y < 10 || b.y > this.h - 10;
        if (bouncedX) {
          b.vx *= -1;
          b.bounceRemaining -= 1;
        }
        if (bouncedY) {
          b.vy *= -1;
          b.bounceRemaining -= 1;
        }
      }

      if (this.itemEffects.fireTrail) {
        b.trailTimer += dt;
        if (b.trailTimer >= 0.12) {
          b.trailTimer = 0;
          this.particles.emit(b.x, b.y, "#ff6644", 2, "spark");
        }
      }

      // Wrap or remove
      if (b.loop) {
        if (b.x < -30) b.x = this.w + 30;
        if (b.x > this.w + 30) b.x = -30;
        if (b.y < -30) b.y = this.h + 30;
        if (b.y > this.h + 30) b.y = -30;
      } else if (
        b.y < -80 ||
        b.y > this.h + 80 ||
        b.x < -80 ||
        b.x > this.w + 80
      ) {
        this.bulletPool.release(b);
        this.bullets.splice(i, 1);
      }
    }
  }

  findNearestAsteroid(x: number, y: number, maxDist: number): Asteroid | null {
    let nearest: Asteroid | null = null;
    let nearestDist = maxDist;
    for (const a of this.asteroids) {
      if (!a.active) continue;
      const dist = distance(x, y, a.x, a.y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = a;
      }
    }
    return nearest;
  }

  spawnStarStrike(targetX: number, targetY: number, damage: number): void {
    if (this.itemEffects.starOnHit <= 0) return;
    const bullet = this.bulletPool.acquire();
    const spawnX = clamp(targetX + randomRange(-80, 80), 20, this.w - 20);
    const spawnY = -40;
    const angle = Math.atan2(targetY - spawnY, targetX - spawnX);
    bullet.x = spawnX;
    bullet.y = spawnY;
    bullet.vx = Math.cos(angle) * this.currentStats.bulletSpeed * 1.4;
    bullet.vy = Math.sin(angle) * this.currentStats.bulletSpeed * 1.4;
    bullet.damage = damage * this.itemEffects.starOnHit;
    bullet.pierceRemaining = 0;
    bullet.explosive = false;
    bullet.chainLightning = false;
    bullet.active = true;
    bullet.fromDrone = false;
    bullet.age = 0;
    bullet.maxAge = 2.5;
    bullet.size = this.currentStats.bulletSize * 0.8;
    bullet.color = "#ffd27d";
    bullet.shape = "star";
    bullet.wobblePhase = 0;
    bullet.bounceRemaining = 0;
    bullet.loop = false;
    bullet.homingStrength = 0;
    bullet.snowball = false;
    bullet.snowballMax = 1;
    bullet.sticky = false;
    bullet.stuckToId = -1;
    bullet.drag = 0;
    bullet.acceleration = 0;
    bullet.gravity = 0;
    bullet.splitOnHit = 0;
    bullet.trailTimer = 0;
    bullet.jitterOffset = randomRange(-1.2, 1.2);
    bullet.prismSplit = false;
    this.bullets.push(bullet);
  }

  spawnSplitBullets(source: Bullet, count: number): void {
    const baseAngle = Math.atan2(source.vy, source.vx);
    const spread = 0.5;
    for (let i = 0; i < count; i++) {
      const offset = count === 1 ? 0 : lerp(-spread, spread, i / (count - 1));
      const angle = baseAngle + offset;
      const bullet = this.spawnBullet(angle, this.currentStats, 0.6, 0, 0.9);
      bullet.splitOnHit = Math.max(0, source.splitOnHit - 1);
    }
  }

  handleAsteroidDestroyed(asteroid: Asteroid, sourceBullet?: Bullet): void {
    if (!asteroid.active) return;
    asteroid.active = false;

    const config = CONFIG.ASTEROID_SIZES[asteroid.size];
    const coins = Math.round(config.coins * this.statModifiers.coinMult);
    this.eventBus.emit("ASTEROID_DESTROYED", { asteroid, coins });
    this.eventBus.emit("ON_KILL", { asteroid, sourceBullet });

    if (!asteroid.isBossAsteroid) {
      this.splitAsteroid(asteroid);
    }

    if (sourceBullet?.explosive || this.itemEffects.creepyGunpowder) {
      this.handleExplosion(asteroid.x, asteroid.y, 2, 80);
    }

    if (sourceBullet?.chainLightning || this.itemEffects.lightning) {
      this.handleChainLightning(asteroid.x, asteroid.y, 3, 2);
    }

    if (this.itemEffects.detonator) {
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2;
        const bullet = this.spawnBullet(angle, this.currentStats, 0.4, 0, 0.7);
        bullet.age = 0.5;
      }
    }

    if (this.hasItem("reaper_pearl") && Math.random() < 0.01) {
      this.lives = Math.min(this.maxLives, this.lives + 1);
      this.updateLivesDisplay();
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (b.stuckToId === asteroid.id) {
        this.bulletPool.release(b);
        this.bullets.splice(i, 1);
      }
    }

    this.asteroidPool.release(asteroid);
    this.asteroids = this.asteroids.filter((a) => a.id !== asteroid.id);
  }

  spawnAsteroid(
    size?: AsteroidSize,
    x?: number,
    y?: number,
    vx?: number,
    vy?: number,
  ): void {
    // Determine size based on difficulty
    // Early game: mostly small (60%), some medium (30%), few large (10%)
    // Late game (after ~3 min): more large (35%), medium (35%), small (30%)
    if (!size) {
      const timeMinutes = this.survivalTime / 60000;
      // Higher base ratios for larger asteroids
      const largeRatio = Math.min(0.45, 0.2 + timeMinutes * 0.05);
      const mediumRatio = Math.min(0.40, 0.35 + timeMinutes * 0.02);
      const roll = Math.random();
      if (roll < largeRatio) size = "large";
      else if (roll < largeRatio + mediumRatio) size = "medium";
      else size = "small";
    }

    const config = CONFIG.ASTEROID_SIZES[size];
    const asteroid = this.asteroidPool.acquire();

    asteroid.id = ++this.asteroidIdCounter;
    asteroid.size = size;
    asteroid.maxHealth = config.health + this.healthBonus;
    asteroid.health = asteroid.maxHealth;
    asteroid.x =
      x ?? randomRange(config.radius * 0.5, this.w - config.radius * 0.5);
    asteroid.y = y ?? -config.radius - 10;
    asteroid.vx = vx ?? randomRange(-1.5, 1.5);
    asteroid.vy = vy ?? config.speed * this.speedMultiplier;
    asteroid.rotation = Math.random() * Math.PI * 2;
    asteroid.rotationSpeed = (Math.random() - 0.5) * 0.03;
    asteroid.active = true;
    asteroid.hitFlash = 0;
    asteroid.isBossAsteroid = false;

    this.asteroids.push(asteroid);
  }

  updateAsteroids(dt: number): void {
    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      const a = this.asteroids[i];
      a.x += a.vx * dt * 60;
      a.y += a.vy * dt * 60;
      a.rotation += a.rotationSpeed * dt * 60;

      // Apply gentle gravity to pull asteroids back down
      const minSpeed = CONFIG.ASTEROID_SIZES[a.size].speed * 0.5;
      if (a.vy < minSpeed) {
        a.vy += 0.08 * dt * 60; // Gravity pulls them down
      }

      if (a.hitFlash > 0) {
        a.hitFlash -= dt;
      }

      const config = CONFIG.ASTEROID_SIZES[a.size];

      // Bounce off left and right walls (at actual screen edge)
      if (a.x < 0) {
        a.x = 0;
        a.vx = Math.abs(a.vx) * 0.9;
      } else if (a.x > this.w) {
        a.x = this.w;
        a.vx = -Math.abs(a.vx) * 0.9;
      }

      // Remove if off bottom
      if (a.y > this.h + config.radius + 50) {
        this.asteroidPool.release(a);
        this.asteroids.splice(i, 1);
      }
    }
  }

  updateDrones(dt: number): void {
    if (this.drones.length === 0) return;

    const fireInterval = this.currentStats.fireRateMs * 1.6;
    const droneDamage = Math.max(0.3, this.currentStats.damage * 0.33);
    const smartTarget = true;
    const canIntercept = this.itemEffects.shieldBuddies > 0;
    const dronePierce = this.currentStats.pierce > 0 ? 1 : 0;

    const maxDistFromPlayer = CONFIG.DRONE_ORBIT_RADIUS * 1.5;
    const minDistFromPlayer = 25;

    for (const drone of this.drones) {
      // Autonomous wandering behavior
      drone.wanderTimer -= dt * 1000;
      if (drone.wanderTimer <= 0) {
        // Pick a new target position near the player
        const wanderRadius = CONFIG.DRONE_ORBIT_RADIUS * 0.8;
        const angle = Math.random() * Math.PI * 2;
        drone.targetX = this.playerX + Math.cos(angle) * (20 + Math.random() * wanderRadius);
        drone.targetY = this.playerY + Math.sin(angle) * (20 + Math.random() * wanderRadius);
        drone.wanderTimer = 400 + Math.random() * 600;
      }

      // Keep target anchored relative to player movement
      const distToPlayer = distance(drone.targetX, drone.targetY, this.playerX, this.playerY);
      if (distToPlayer > maxDistFromPlayer) {
        // Pull target back toward player
        const pullAngle = Math.atan2(this.playerY - drone.targetY, this.playerX - drone.targetX);
        drone.targetX += Math.cos(pullAngle) * (distToPlayer - maxDistFromPlayer);
        drone.targetY += Math.sin(pullAngle) * (distToPlayer - maxDistFromPlayer);
      }

      // Smoothly move toward target
      drone.x = lerp(drone.x, drone.targetX, 0.08);
      drone.y = lerp(drone.y, drone.targetY, 0.08);

      // Ensure drone stays close to player (hard constraint)
      const actualDistToPlayer = distance(drone.x, drone.y, this.playerX, this.playerY);
      if (actualDistToPlayer > maxDistFromPlayer) {
        const pullAngle = Math.atan2(this.playerY - drone.y, this.playerX - drone.x);
        drone.x = this.playerX - Math.cos(pullAngle) * maxDistFromPlayer;
        drone.y = this.playerY - Math.sin(pullAngle) * maxDistFromPlayer;
      } else if (actualDistToPlayer < minDistFromPlayer) {
        const pushAngle = Math.atan2(drone.y - this.playerY, drone.x - this.playerX);
        drone.x = this.playerX + Math.cos(pushAngle) * minDistFromPlayer;
        drone.y = this.playerY + Math.sin(pushAngle) * minDistFromPlayer;
      }

      // Find target to face (always, not just when firing)
        let target: Asteroid | null = null;
        let bestScore = -Infinity;

        for (const a of this.asteroids) {
        const dist = distance(drone.x, drone.y, a.x, a.y);
          // Prefer closer targets, but smart targeting prefers high health
          let score = -dist;
          if (smartTarget && a.health >= 4) score += 200;
          if (canIntercept && a.y > this.playerY - 100) score += 300; // Prioritize close threats

          if (score > bestScore) {
            bestScore = score;
            target = a;
          }
        }

      // Rotate to face target (or default to facing up)
        if (target) {
        const targetAngle = Math.atan2(target.y - drone.y, target.x - drone.x);
        // Smoothly rotate toward target
        let angleDiff = targetAngle - drone.facingAngle;
        // Normalize angle difference to -PI to PI
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        drone.facingAngle += angleDiff * 0.15; // Smooth rotation
      } else {
        // No target, face upward
        let angleDiff = -Math.PI / 2 - drone.facingAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        drone.facingAngle += angleDiff * 0.1;
      }

      // Fire at asteroids
      drone.fireTimer -= dt * 1000;
      if (drone.fireTimer <= 0 && target) {
          const bullet = this.bulletPool.acquire();
        bullet.x = drone.x;
        bullet.y = drone.y;
        bullet.vx = Math.cos(drone.facingAngle) * this.currentStats.bulletSpeed * 0.8;
        bullet.vy = Math.sin(drone.facingAngle) * this.currentStats.bulletSpeed * 0.8;
          bullet.damage = droneDamage;
          bullet.pierceRemaining = dronePierce;
          bullet.explosive = false;
        bullet.chainLightning = this.itemEffects.lightning;
          bullet.active = true;
          bullet.fromDrone = true;
        bullet.age = 0;
        bullet.maxAge = 2.2;
        bullet.size = this.currentStats.bulletSize * 0.8;
        bullet.color = CONFIG.PENCIL_DARK;
        bullet.shape = "line";
        bullet.wobblePhase = Math.random() * Math.PI * 2;
        bullet.bounceRemaining = 0;
        bullet.loop = false;
        bullet.homingStrength = this.itemEffects.homingStrength * 0.6;
        bullet.snowball = false;
        bullet.snowballMax = 1;
        bullet.sticky = false;
        bullet.stuckToId = -1;
        bullet.drag = 0;
        bullet.acceleration = 0;
        bullet.gravity = 0;
        bullet.splitOnHit = 0;
        bullet.trailTimer = 0;
        bullet.jitterOffset = randomRange(-1, 1);
        bullet.prismSplit = false;

          this.bullets.push(bullet);
        drone.fireTimer = fireInterval;
      } else if (drone.fireTimer <= 0) {
        // No target, still reset timer
        drone.fireTimer = fireInterval;
      }
    }
  }

  checkCollisions(): void {
    // Bullets vs Asteroids
    for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
      const b = this.bullets[bi];
      if (!b.active) continue;

      for (let ai = this.asteroids.length - 1; ai >= 0; ai--) {
        const a = this.asteroids[ai];
        if (!a.active) continue;

        const config = CONFIG.ASTEROID_SIZES[a.size];
        const dist = distance(b.x, b.y, a.x, a.y);

        if (dist < config.radius + 5) {
          const snowballMult = b.snowball
            ? 1 + Math.min(1, b.age / 1.2) * (b.snowballMax - 1)
            : 1;
          const damage = b.damage * snowballMult;

          a.health -= damage;
          a.hitFlash = 0.15;
          this.eventBus.emit("ASTEROID_HIT", { asteroid: a, damage });
          this.eventBus.emit("ON_HIT", { asteroid: a, bullet: b, damage });

          if (this.itemEffects.carnageEngine) {
            this.itemDamageBuff = clamp(this.itemDamageBuff + 0.05, 0, 1);
            this.itemDamageBuffTimer = 2.5;
          }

          if (this.itemEffects.voodooOnHit > 0) {
            for (const other of this.asteroids) {
              if (other.id === a.id || other.size !== a.size) continue;
              const dist2 = distance(a.x, a.y, other.x, other.y);
              if (dist2 < config.radius * 2.2) {
                other.health -= damage * this.itemEffects.voodooOnHit;
                other.hitFlash = 0.1;
                if (other.health <= 0) {
                  this.handleAsteroidDestroyed(other, b);
                }
              }
            }
          }

          if (this.itemEffects.starOnHit > 0) {
            this.spawnStarStrike(a.x, a.y, damage);
          }

          if (b.splitOnHit > 0) {
            this.spawnSplitBullets(b, Math.min(2, b.splitOnHit));
          }

          if (b.sticky && b.stuckToId === -1) {
            b.stuckToId = a.id;
            b.stuckOffsetX = b.x - a.x;
            b.stuckOffsetY = b.y - a.y;
          }

          if (a.health <= 0) {
            this.handleAsteroidDestroyed(a, b);
          }

          // Bounce behavior
          if (b.bounceRemaining > 0) {
            const nx = (b.x - a.x) / Math.max(1, dist);
            const ny = (b.y - a.y) / Math.max(1, dist);
            const dot = b.vx * nx + b.vy * ny;
            b.vx = b.vx - 2 * dot * nx;
            b.vy = b.vy - 2 * dot * ny;
            b.bounceRemaining -= 1;
            break;
          }

          // Handle pierce
          if (b.pierceRemaining > 0) {
            b.pierceRemaining--;
          } else if (!b.sticky) {
            this.bulletPool.release(b);
            this.bullets.splice(bi, 1);
            break;
          }
        }
      }
    }

    // Player vs Asteroids
    for (const a of this.asteroids) {
      const config = CONFIG.ASTEROID_SIZES[a.size];
      const dist = distance(this.playerX, this.playerY, a.x, a.y);

      if (dist < config.radius + CONFIG.PLAYER_WIDTH / 3) {
        if (this.shieldCharges > 0) {
          this.shieldCharges--;
          this.updateShieldUI();
          a.health -= 1;
          a.hitFlash = 0.2;
          if (a.health <= 0) {
            this.handleAsteroidDestroyed(a);
          }
          this.triggerScreenShake(4);
          return;
        }
        this.eventBus.emit("PLAYER_HIT", {});
        return;
      }
    }
  }

  splitAsteroid(asteroid: Asteroid): void {
    if (asteroid.size === "small") return;

    const newSize: AsteroidSize =
      asteroid.size === "large" ? "medium" : "small";
    const config = CONFIG.ASTEROID_SIZES[newSize];

    // Spawn 2 children moving upward and outward in opposite directions
    for (let i = 0; i < 2; i++) {
      const direction = i === 0 ? -1 : 1; // Left or right
      const speed = config.speed * this.speedMultiplier;
      const horizontalSpeed = (2.5 + Math.random() * 1.5) * direction;
      const upwardSpeed = -(1.5 + Math.random() * 2); // Negative = upward

      this.spawnAsteroid(
        newSize,
        asteroid.x + direction * 15,
        asteroid.y,
        horizontalSpeed,
        upwardSpeed,
      );
    }
  }

  handleExplosion(x: number, y: number, damage: number, radius: number): void {
    this.particles.emit(x, y, "#ff6600", 15, "explosion");
    this.triggerScreenShake(0.4);

    // Damage nearby asteroids
    for (const a of this.asteroids) {
      const dist = distance(x, y, a.x, a.y);
      if (dist < radius) {
        a.health -= damage;
        if (a.health <= 0) {
          this.handleAsteroidDestroyed(a);
        }
      }
    }
  }

  handleChainLightning(
    x: number,
    y: number,
    targets: number,
    damage: number,
  ): void {
    const hit: Asteroid[] = [];

    for (let t = 0; t < targets; t++) {
      let nearest: Asteroid | null = null;
      let nearestDist = Infinity;

      for (const a of this.asteroids) {
        if (hit.includes(a)) continue;
        const dist = distance(x, y, a.x, a.y);
        if (dist < 150 && dist < nearestDist) {
          nearestDist = dist;
          nearest = a;
        }
      }

      if (nearest) {
        if (!nearest.active) continue; // Skip if already destroyed by another effect
        hit.push(nearest);
        nearest.health -= damage;
        nearest.hitFlash = 0.15;

        // Draw lightning effect
        this.particles.emit(nearest.x, nearest.y, "#00ffff", 6, "spark");

        if (nearest.health <= 0) {
          this.handleAsteroidDestroyed(nearest);
        }

        x = nearest.x;
        y = nearest.y;
      }
    }
  }

  updateDifficulty(dt: number): void {
    this.survivalTime += dt * 1000;

    // Speed increases every 60 seconds
    const newSpeedMult = Math.min(
      2.0,
      1.0 +
        Math.floor(this.survivalTime / CONFIG.SPEED_INCREASE_INTERVAL) * 0.05,
    );
    if (newSpeedMult !== this.speedMultiplier) {
      this.speedMultiplier = newSpeedMult;
      console.log("[updateDifficulty] Speed multiplier:", this.speedMultiplier);
    }

    // Health bonus every 60 seconds
    const newHealthBonus = Math.floor(
      this.survivalTime / CONFIG.HEALTH_INCREASE_INTERVAL,
    );
    if (newHealthBonus !== this.healthBonus) {
      this.healthBonus = newHealthBonus;
      console.log("[updateDifficulty] Health bonus:", this.healthBonus);
    }
  }

  // ============= BOSS FIGHT =============

  updateBossAnnouncement(dt: number): void {
    if (this.bossAnnouncementTimer > 0) {
      this.bossAnnouncementTimer -= dt;
      if (this.bossAnnouncementTimer <= 0) {
        const announcement = document.getElementById("bossAnnouncement");
        if (announcement) {
          announcement.classList.remove("active");
        }
      }
    }
  }

  updateBoss(dt: number): void {
    if (!this.boss || !this.boss.active) return;

    // Entrance animation
    if (this.boss.entering) {
      this.boss.y = lerp(this.boss.y, this.boss.targetY, 0.03);
      if (Math.abs(this.boss.y - this.boss.targetY) < 2) {
        this.boss.y = this.boss.targetY;
        this.boss.entering = false;
        console.log("[updateBoss] Boss finished entering");
      }
    }

    // Rotation animation
    this.boss.rotation += dt * 0.3;
    
    // Pulse animation
    this.boss.pulsePhase += dt * 2;

    // Throw asteroids
    if (!this.boss.entering && this.boss.throwCount < CONFIG.BOSS_MAX_THROWS) {
      this.boss.throwTimer -= dt * 1000;
      if (this.boss.throwTimer <= 0) {
        this.bossThrowAsteroid();
        this.boss.throwCount++;
        this.boss.throwTimer = CONFIG.BOSS_THROW_INTERVAL;
        console.log("[updateBoss] Boss threw asteroid", this.boss.throwCount, "/", CONFIG.BOSS_MAX_THROWS);
      }
    }
  }

  bossThrowAsteroid(): void {
    if (!this.boss) return;

    // Spawn asteroid at boss position, aimed at player
    const dx = this.playerX - this.boss.x;
    const dy = this.playerY - this.boss.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const speed = 3.5;
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;

    // Get an asteroid from pool
    const asteroid = this.asteroidPool.acquire();
    if (!asteroid) return;

    asteroid.id = ++this.asteroidIdCounter;
    asteroid.size = "large"; // Use large size for visual
    asteroid.maxHealth = CONFIG.BOSS_ASTEROID_HEALTH;
    asteroid.health = CONFIG.BOSS_ASTEROID_HEALTH;
    asteroid.x = this.boss.x;
    asteroid.y = this.boss.y + CONFIG.BOSS_RADIUS * 0.8;
    asteroid.vx = vx;
    asteroid.vy = vy;
    asteroid.rotation = Math.random() * Math.PI * 2;
    asteroid.rotationSpeed = randomRange(-2, 2);
    asteroid.active = true;
    asteroid.hitFlash = 0;
    asteroid.isBossAsteroid = true;

    this.asteroids.push(asteroid);
    this.audio.triggerHaptic("medium");
  }

  checkBossCollisions(): void {
    if (!this.boss || !this.boss.active || this.boss.entering) return;

    // Check bullet collisions with boss
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      if (!bullet.active) continue;

      const dist = distance(bullet.x, bullet.y, this.boss.x, this.boss.y);
      if (dist < CONFIG.BOSS_RADIUS) {
        const snowballMult = bullet.snowball
          ? 1 + Math.min(1, bullet.age / 1.2) * (bullet.snowballMax - 1)
          : 1;
        const damage = bullet.damage * snowballMult;
        bullet.active = false;
        this.bulletPool.release(bullet);
        this.bullets.splice(i, 1);
        this.boss.health -= damage;

        // Visual feedback
        this.particles.emit(
          bullet.x,
          bullet.y,
          CONFIG.PENCIL_DARK,
          5,
          "spark"
        );

        this.audio.playHit();
        this.triggerScreenShake(2);

        console.log("[checkBossCollisions] Boss hit! Health:", this.boss.health);

        if (this.itemEffects.starOnHit > 0) {
          this.spawnStarStrike(this.boss.x, this.boss.y, damage);
        }

        if (this.boss.health <= 0) {
          this.defeatBoss();
        }
      }
    }
  }

  defeatBoss(): void {
    if (!this.boss) return;

    console.log("[defeatBoss] Boss defeated!");

    // Big explosion
    this.particles.emit(this.boss.x, this.boss.y, CONFIG.PENCIL_DARK, 30, "explosion");
    this.particles.emit(this.boss.x, this.boss.y, "#ff6644", 20, "spark");
    this.particles.emit(this.boss.x, this.boss.y, CONFIG.PAPER_BG, 25, "paper");

    // Award bonus coins
    const bonusCoins = 50;
    this.coins += bonusCoins;
    this.score += bonusCoins * 10;
    this.floatingText.add(this.boss.x, this.boss.y, "+" + bonusCoins, "#ffcc00", 2);

    // Mark as defeated
    this.boss.active = false;
    this.boss.defeated = true;
    this.bossDefeated = true;

    // Clear boss asteroids
    this.asteroids.forEach(a => {
      if (a.isBossAsteroid) a.active = false;
    });

    // Show victory and resume playing
    this.audio.playUpgrade();
    this.audio.triggerHaptic("success");
    this.triggerScreenShake(15);

    // Resume normal gameplay after a short delay
    setTimeout(() => {
      this.gameState = "PLAYING";
      this.updateProgressBar();
      console.log("[defeatBoss] Resuming normal gameplay");
    }, 1000);
  }

  // ============= RENDERING =============

  drawBackground(): void {
    const ctx = this.ctx;

    // Paper background
    ctx.fillStyle = CONFIG.PAPER_BG;
    ctx.fillRect(0, 0, this.w, this.h);

    // Scrolling grid lines
    this.bgOffset =
      (this.bgOffset + CONFIG.BACKGROUND_SCROLL_SPEED * 0.016) %
      CONFIG.GRID_SIZE;

    ctx.strokeStyle = CONFIG.GRID_LINE;
    ctx.lineWidth = 1;

    // Vertical lines
    for (let x = 0; x < this.w; x += CONFIG.GRID_SIZE) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.h);
      ctx.stroke();
    }

    // Horizontal lines (scrolling)
    for (
      let y = this.bgOffset;
      y < this.h + CONFIG.GRID_SIZE;
      y += CONFIG.GRID_SIZE
    ) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.w, y);
      ctx.stroke();
    }

    // Left margin line (notebook style)
    ctx.strokeStyle = "#ffaaaa";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(60, 0);
    ctx.lineTo(60, this.h);
    ctx.stroke();
  }

  drawPlayer(): void {
    const ctx = this.ctx;
    const x = this.playerX;
    const y = this.playerY;

    // Invincibility blink effect - skip drawing on odd frames
    if (this.isInvincible && Math.floor(this.damageFlashTimer) % 2 === 1) {
      return;
    }

    ctx.save();
    ctx.translate(x, y);

    // Slight tilt based on movement
    const tilt = (this.targetX - this.playerX) * 0.01;
    ctx.rotate(clamp(tilt, -0.3, 0.3));

    // Apply barrel roll (roll around forward axis - simulated with X scale)
    if (this.spinDirection !== 0) {
      const rollScale = Math.cos(this.spinAngle);
      ctx.scale(rollScale, 1);
    }

    // Apply damage tint during invincibility
    const damageAlpha = this.isInvincible ? 0.7 : 1;
    ctx.globalAlpha = damageAlpha;

    // Draw paper plane based on type
    ctx.strokeStyle = this.isInvincible ? "#ff6666" : CONFIG.PENCIL_DARK;
    ctx.lineWidth = 2;
    ctx.fillStyle = this.isInvincible ? "#ffcccc" : "#ffffff";

    if (this.selectedPlane === "dart") {
      // Classic pointed dart
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.lineTo(-20, 25);
      ctx.lineTo(0, 15);
      ctx.lineTo(20, 25);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Center fold line
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.lineTo(0, 15);
      ctx.stroke();
    } else if (this.selectedPlane === "glider") {
      // Wide-winged glider
      ctx.beginPath();
      ctx.moveTo(0, -25);
      ctx.lineTo(-35, 20);
      ctx.lineTo(-25, 25);
      ctx.lineTo(0, 10);
      ctx.lineTo(25, 25);
      ctx.lineTo(35, 20);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Wing folds
      ctx.beginPath();
      ctx.moveTo(-18, 22);
      ctx.lineTo(0, -20);
      ctx.lineTo(18, 22);
      ctx.stroke();
    } else {
      // Bomber - chunky
      ctx.beginPath();
      ctx.moveTo(0, -20);
      ctx.lineTo(-25, 15);
      ctx.lineTo(-20, 25);
      ctx.lineTo(0, 20);
      ctx.lineTo(20, 25);
      ctx.lineTo(25, 15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Chunky body
      ctx.fillStyle = "#f8f8f8";
      ctx.beginPath();
      ctx.moveTo(-8, -15);
      ctx.lineTo(8, -15);
      ctx.lineTo(10, 20);
      ctx.lineTo(-10, 20);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  drawDrones(): void {
    if (this.drones.length === 0) return;
    const ctx = this.ctx;

    for (const drone of this.drones) {
      ctx.save();
      ctx.translate(drone.x, drone.y);

      // Rotate to face the target direction
      // Add PI/2 because the drone shape points "up" by default
      ctx.rotate(drone.facingAngle + Math.PI / 2);

      // Small paper drone
      ctx.strokeStyle = CONFIG.PENCIL_DARK;
      ctx.lineWidth = 1.5;
      ctx.fillStyle = "#f0f0f0";

      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(-8, 8);
      ctx.lineTo(0, 4);
      ctx.lineTo(8, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }
  }

  drawBullets(): void {
    const ctx = this.ctx;

    for (const b of this.bullets) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2);

      if (b.shape === "note") {
        ctx.fillStyle = "#3b2f2f";
      ctx.strokeStyle = CONFIG.PENCIL_DARK;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 6, 5 * b.size, 4 * b.size, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(3, -14 * b.size);
        ctx.lineTo(3, 2 * b.size);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(6, -14 * b.size, 4 * b.size, Math.PI, Math.PI * 1.6);
        ctx.stroke();
      } else if (b.shape === "star") {
        ctx.fillStyle = b.color;
        ctx.strokeStyle = CONFIG.PENCIL_DARK;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
          const outer = 8 * b.size;
          const inner = 4 * b.size;
          const x1 = Math.cos(angle) * outer;
          const y1 = Math.sin(angle) * outer;
          const x2 = Math.cos(angle + Math.PI / 5) * inner;
          const y2 = Math.sin(angle + Math.PI / 5) * inner;
          if (i === 0) ctx.moveTo(x1, y1);
          else ctx.lineTo(x1, y1);
          ctx.lineTo(x2, y2);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (b.shape === "bolt") {
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-4, -10);
        ctx.lineTo(2, -2);
        ctx.lineTo(-2, 2);
        ctx.lineTo(4, 10);
        ctx.stroke();
      } else if (b.shape === "rocket") {
        ctx.fillStyle = b.color;
        ctx.strokeStyle = CONFIG.PENCIL_DARK;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -12 * b.size);
        ctx.lineTo(-5 * b.size, 8 * b.size);
        ctx.lineTo(5 * b.size, 8 * b.size);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ffcc66";
        ctx.beginPath();
        ctx.moveTo(0, 10 * b.size);
        ctx.lineTo(-3 * b.size, 15 * b.size);
        ctx.lineTo(3 * b.size, 15 * b.size);
        ctx.closePath();
        ctx.fill();
      } else if (b.shape === "bubble") {
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 8 * b.size, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(3 * b.size, -4 * b.size, 2 * b.size, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // Pencil line bullet
        ctx.strokeStyle = b.color;
      ctx.lineWidth = b.fromDrone ? 2 : 3;
      ctx.lineCap = "round";
      ctx.beginPath();
        ctx.moveTo(b.jitterOffset * 0.5, -10 * b.size);
        ctx.lineTo(-b.jitterOffset * 0.5, 10 * b.size);
      ctx.stroke();
      }

      ctx.restore();
    }
  }

  drawAsteroids(): void {
    const ctx = this.ctx;

    for (const a of this.asteroids) {
      const config = CONFIG.ASTEROID_SIZES[a.size];

      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.rotation);

      // Hit flash
      if (a.hitFlash > 0) {
        ctx.globalAlpha = 0.5 + a.hitFlash * 2;
      }

      // Crumpled paper asteroid
      ctx.fillStyle = "#e8e8e0";
      ctx.strokeStyle = CONFIG.PENCIL_DARK;
      ctx.lineWidth = 2;

      // Irregular shape
      ctx.beginPath();
      const points = 8;
      for (let i = 0; i < points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const wobble = 0.8 + Math.sin(a.id * 100 + i * 50) * 0.3;
        const r = config.radius * wobble;
        if (i === 0) {
          ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
        } else {
          ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      if (a.isBossAsteroid) {
        ctx.fillStyle = CONFIG.PENCIL_DARK;
        ctx.font = "bold 18px " + CONFIG.FONT_FAMILY;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(a.health.toString(), 0, 2);
      }

      // Crinkle lines
      ctx.strokeStyle = CONFIG.PENCIL_LIGHT;
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const angle1 = (a.id * 37 + i * 120) * (Math.PI / 180);
        const angle2 = angle1 + 0.5;
        ctx.beginPath();
        ctx.moveTo(
          Math.cos(angle1) * config.radius * 0.3,
          Math.sin(angle1) * config.radius * 0.3,
        );
        ctx.lineTo(
          Math.cos(angle2) * config.radius * 0.7,
          Math.sin(angle2) * config.radius * 0.7,
        );
        ctx.stroke();
      }

      // Health number
      ctx.rotate(-a.rotation); // Unrotate for text
      ctx.font = "bold " + config.radius * 0.6 + "px Caveat, cursive";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = CONFIG.PENCIL_DARK;
      ctx.fillText(a.health.toString(), 0, 0);

      ctx.restore();
    }
  }

  // ============= DEMO ANIMATION =============

  initDemoAnimation(): void {
    if (!this.demoCanvas) return;
    console.log("[initDemoAnimation]");

    // Set canvas size based on container
    const container = this.demoCanvas.parentElement;
    if (container) {
      this.demoCanvas.width = container.clientWidth;
      this.demoCanvas.height = container.clientHeight;
    }

    // Initialize plane position
    this.demoPlaneX = this.demoCanvas.width / 2;
    this.demoPlaneY = this.demoCanvas.height - 35;
    this.demoPlaneTargetX = this.demoPlaneX;
    this.demoPlaneDirection = 1;

    // Clear entities
    this.demoBullets = [];
    this.demoAsteroids = [];
    this.demoParticles = [];
  }

  updateDemoAnimation(dt: number): void {
    if (!this.demoCanvas || !this.demoCtx) return;

    const w = this.demoCanvas.width;
    const h = this.demoCanvas.height;

    // Update background scroll
    this.demoBgOffset = (this.demoBgOffset + 30 * dt) % 25;

    // Move plane side to side
    if (Math.random() < 0.02) {
      this.demoPlaneTargetX = 40 + Math.random() * (w - 80);
    }
    this.demoPlaneX = lerp(this.demoPlaneX, this.demoPlaneTargetX, 0.05);

    // Fire bullets
    this.demoFireTimer -= dt * 1000;
    if (this.demoFireTimer <= 0) {
      this.demoBullets.push({
        x: this.demoPlaneX,
        y: this.demoPlaneY - 15,
        vy: -6,
        active: true,
      });
      this.demoFireTimer = 200;
    }

    // Spawn asteroids
    this.demoSpawnTimer -= dt * 1000;
    if (this.demoSpawnTimer <= 0) {
      this.demoAsteroids.push({
        x: 30 + Math.random() * (w - 60),
        y: -25,
        vx: (Math.random() - 0.5) * 2,
        vy: 1.8 + Math.random() * 1.2,
        radius: 18 + Math.random() * 12,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.05,
        health: 2,
        active: true,
      });
      this.demoSpawnTimer = 800 + Math.random() * 400;
    }

    // Update bullets
    for (let i = this.demoBullets.length - 1; i >= 0; i--) {
      const b = this.demoBullets[i];
      b.y += b.vy;
      if (b.y < -10) {
        this.demoBullets.splice(i, 1);
      }
    }

    // Update asteroids
    for (let i = this.demoAsteroids.length - 1; i >= 0; i--) {
      const a = this.demoAsteroids[i];
      a.x += a.vx;
      a.y += a.vy;
      a.rotation += a.rotationSpeed;

      // Bounce off walls
      if (a.x - a.radius < 0) {
        a.x = a.radius;
        a.vx = Math.abs(a.vx);
      } else if (a.x + a.radius > w) {
        a.x = w - a.radius;
        a.vx = -Math.abs(a.vx);
      }

      if (a.y > h + 30) {
        this.demoAsteroids.splice(i, 1);
      }
    }

    // Update particles
    for (let i = this.demoParticles.length - 1; i >= 0; i--) {
      const p = this.demoParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life -= 0.04;
      if (p.life <= 0) {
        this.demoParticles.splice(i, 1);
      }
    }

    // Collision detection
    for (let bi = this.demoBullets.length - 1; bi >= 0; bi--) {
      const b = this.demoBullets[bi];
      for (let ai = this.demoAsteroids.length - 1; ai >= 0; ai--) {
        const a = this.demoAsteroids[ai];
        const dist = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
        if (dist < a.radius + 4) {
          a.health--;
          this.demoBullets.splice(bi, 1);

          if (a.health <= 0) {
            // Spawn particles
            for (let p = 0; p < 6; p++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = 1 + Math.random() * 2;
              this.demoParticles.push({
                x: a.x,
                y: a.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                size: 3 + Math.random() * 4,
              });
            }
            this.demoAsteroids.splice(ai, 1);
          }
          break;
        }
      }
    }
  }

  renderDemoAnimation(): void {
    if (!this.demoCanvas || !this.demoCtx) return;

    const ctx = this.demoCtx;
    const w = this.demoCanvas.width;
    const h = this.demoCanvas.height;

    // Clear with paper background
    ctx.fillStyle = "#f5f5dc";
    ctx.fillRect(0, 0, w, h);

    // Draw grid
    ctx.strokeStyle = "#d4d4c4";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 25) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = this.demoBgOffset; y < h + 25; y += 25) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Draw asteroids
    for (const a of this.demoAsteroids) {
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.rotation);

      ctx.fillStyle = "#e8e8e0";
      ctx.strokeStyle = "#2d2d2d";
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const wobble = 0.85 + Math.sin(i * 47) * 0.2;
        const r = a.radius * wobble;
        if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
        else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }

    // Draw bullets
    ctx.strokeStyle = "#2d2d2d";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (const b of this.demoBullets) {
      ctx.beginPath();
      ctx.moveTo(b.x, b.y - 6);
      ctx.lineTo(b.x, b.y + 6);
      ctx.stroke();
    }

    // Draw particles
    for (const p of this.demoParticles) {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = "#2d2d2d";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Draw plane
    ctx.save();
    ctx.translate(this.demoPlaneX, this.demoPlaneY);

    const tilt = (this.demoPlaneTargetX - this.demoPlaneX) * 0.015;
    ctx.rotate(clamp(tilt, -0.25, 0.25));

    ctx.strokeStyle = "#2d2d2d";
    ctx.lineWidth = 1.5;
    ctx.fillStyle = "#ffffff";

    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(-12, 14);
    ctx.lineTo(0, 8);
    ctx.lineTo(12, 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(0, 8);
    ctx.stroke();

    ctx.restore();
  }

  // ============= GAME LOOP =============

  gameLoop(timestamp: number): void {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;

    this.update(dt);
    this.render();

    // Update demo animation on start screen
    if (this.gameState === "START") {
      this.updateDemoAnimation(dt);
      this.renderDemoAnimation();
    }

    requestAnimationFrame((t) => this.gameLoop(t));
  }

  update(dt: number): void {
    // Update screen shake
    if (this.screenShake.intensity > 0) {
      this.screenShake.x =
        (Math.random() - 0.5) * this.screenShake.intensity * 15;
      this.screenShake.y =
        (Math.random() - 0.5) * this.screenShake.intensity * 15;
      this.screenShake.intensity *= 0.9;
      if (this.screenShake.intensity < 0.01) {
        this.screenShake.intensity = 0;
        this.screenShake.x = 0;
        this.screenShake.y = 0;
      }
    }

    // Always update particles and floating text
    this.particles.update(dt);
    this.floatingText.update(dt);

    if (this.gameState === "PLAYING") {
      this.updateDynamicModifiers(dt);
      this.updateItemBehaviors(dt);
      this.updatePlayer(dt);
      this.updateDamageState(dt);
      this.updateDrones(dt);
      this.updateOrbitals(dt);
      this.updateBullets(dt);
      this.updateAsteroids(dt);
      this.checkCollisions();
      this.updateDifficulty(dt);

      // Firing
      const fireInterval = this.currentStats.fireRateMs;
      this.fireTimer -= dt * 1000;
      if (this.fireTimer <= 0) {
        this.fireBullets();
        this.fireTimer = fireInterval;
      }

      // Spawning
      // Spawn interval decreases gradually: starts at 3.5s, reaches min (~600ms) around 2.5 minutes
      const spawnInterval = Math.max(
        CONFIG.SPAWN_INTERVAL_MIN,
        CONFIG.SPAWN_INTERVAL_START - this.survivalTime * 0.02,
      );
      this.spawnTimer -= dt * 1000;
      if (this.spawnTimer <= 0) {
        this.spawnAsteroid();
        this.spawnTimer = spawnInterval;
      }

      this.updateHUD();
    } else if (this.gameState === "UPGRADE") {
      this.upgradeAutoSelectTimer -= dt * 1000;
      this.updateUpgradeTimer();

      if (this.upgradeAutoSelectTimer <= 0) {
        if (this.currentItemChoices.length > 0) {
          const pick = Math.floor(Math.random() * this.currentItemChoices.length);
          this.applyItemChoice(pick);
        }
      }
    } else if (this.gameState === "BOSS") {
      // Boss fight update
      this.updateBossAnnouncement(dt);
      this.updateDynamicModifiers(dt);
      this.updateItemBehaviors(dt);
      this.updatePlayer(dt);
      this.updateDamageState(dt);
      this.updateDrones(dt);
      this.updateOrbitals(dt);
      this.updateBullets(dt);
      this.updateAsteroids(dt);
      this.updateBoss(dt);
      this.checkBossCollisions();
      this.checkCollisions();

      // Firing during boss fight
      const fireInterval = this.currentStats.fireRateMs;
      this.fireTimer -= dt * 1000;
      if (this.fireTimer <= 0) {
        this.fireBullets();
        this.fireTimer = fireInterval;
      }

      this.updateHUD();
    }
  }

  render(): void {
    const ctx = this.ctx;

    ctx.save();
    ctx.translate(this.screenShake.x, this.screenShake.y);

    this.drawBackground();

    if (
      this.gameState === "PLAYING" ||
      this.gameState === "PAUSED" ||
      this.gameState === "UPGRADE" ||
      this.gameState === "GAME_OVER" ||
      this.gameState === "BOSS"
    ) {
      this.drawAsteroids();
      this.drawBullets();
      this.drawDrones();
      this.drawOrbitals();
      this.drawPlayer();
      this.particles.draw(ctx);
      this.floatingText.draw(ctx);

      // Draw boss on top
      if (this.gameState === "BOSS" && this.boss && this.boss.active) {
        this.drawBoss();
      }
    }

    ctx.restore();
  }

  drawBoss(): void {
    if (!this.boss) return;

    const ctx = this.ctx;
    const x = this.boss.x;
    const y = this.boss.y;
    const baseRadius = CONFIG.BOSS_RADIUS;
    const pulseScale = 1 + Math.sin(this.boss.pulsePhase) * 0.03;
    const radius = baseRadius * pulseScale;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.boss.rotation);

    // Draw main body - irregular rocky shape
    ctx.beginPath();
    ctx.strokeStyle = CONFIG.PENCIL_DARK;
    ctx.lineWidth = 3;
    ctx.fillStyle = "#e8e0d5";

    // Create jagged rocky outline with deterministic variance
    const points = 16;
    // Pre-defined variance values for consistent shape
    const variances = [0.92, 0.85, 0.88, 0.95, 0.82, 0.90, 0.87, 0.93, 0.84, 0.91, 0.86, 0.94, 0.83, 0.89, 0.96, 0.88, 0.92];
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const r = radius * variances[i];
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw craters (static positions)
    const craters = [
      { x: -35, y: -25, r: 22 },
      { x: 40, y: 10, r: 18 },
      { x: -15, y: 35, r: 25 },
      { x: 25, y: -40, r: 15 },
      { x: -50, y: 15, r: 12 },
    ];

    ctx.strokeStyle = CONFIG.PENCIL_MEDIUM;
    ctx.lineWidth = 2;
    for (const crater of craters) {
      ctx.beginPath();
      ctx.ellipse(crater.x, crater.y, crater.r, crater.r * 0.8, 0.3, 0, Math.PI * 2);
      ctx.stroke();
      
      // Inner shadow
      ctx.beginPath();
      ctx.ellipse(crater.x + 3, crater.y + 3, crater.r * 0.6, crater.r * 0.5, 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw rocky texture lines (deterministic angles and lengths)
    ctx.strokeStyle = CONFIG.PENCIL_LIGHT;
    ctx.lineWidth = 1;
    const textureLines = [
      { angle: 0.4, length: 35 },
      { angle: 1.2, length: 42 },
      { angle: 2.0, length: 28 },
      { angle: 2.8, length: 38 },
      { angle: 3.6, length: 45 },
      { angle: 4.4, length: 32 },
      { angle: 5.2, length: 40 },
      { angle: 5.9, length: 30 },
    ];
    for (const line of textureLines) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(line.angle) * 30, Math.sin(line.angle) * 30);
      ctx.lineTo(
        Math.cos(line.angle) * (30 + line.length),
        Math.sin(line.angle) * (30 + line.length)
      );
      ctx.stroke();
    }

    ctx.restore();

    // Draw health bar above boss (not rotated)
    this.drawBossHealthBar(x, y - radius - 25);
  }

  drawBossHealthBar(x: number, y: number): void {
    if (!this.boss) return;

    const ctx = this.ctx;
    const barWidth = 160;
    const barHeight = 12;
    const healthPercent = this.boss.health / this.boss.maxHealth;

    // Background
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(x - barWidth / 2, y, barWidth, barHeight);

    // Health fill
    const healthColor = healthPercent > 0.5 ? "#44cc44" : healthPercent > 0.25 ? "#cccc44" : "#cc4444";
    ctx.fillStyle = healthColor;
    ctx.fillRect(x - barWidth / 2, y, barWidth * healthPercent, barHeight);

    // Border
    ctx.strokeStyle = CONFIG.PENCIL_DARK;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - barWidth / 2, y, barWidth, barHeight);

    // Health text
    ctx.fillStyle = CONFIG.PENCIL_DARK;
    ctx.font = "bold 10px " + CONFIG.FONT_FAMILY;
    ctx.textAlign = "center";
    ctx.fillText(this.boss.health + "/" + this.boss.maxHealth, x, y + barHeight + 12);
  }
}

// ============= INITIALIZE =============
window.addEventListener("DOMContentLoaded", () => {
  console.log("[main] Initializing Paper Plane Asteroid Survivor");
  new PaperPlaneGame();
});
