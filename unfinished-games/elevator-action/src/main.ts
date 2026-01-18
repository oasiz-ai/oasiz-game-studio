/**
 * ELEVATOR ACTION - Classic arcade game recreation
 * 
 * A spy infiltrates a 30-story building to collect secret documents
 * from red doors while avoiding/shooting enemy agents.
 * Uses elevators to navigate floors and must escape via car at ground level.
 */

// ============= CONFIGURATION =============
const CONFIG = {
  // Building structure
  TOTAL_FLOORS: 15,
  FLOOR_HEIGHT: 80,
  TILE_SIZE: 16,
  
  // Player
  PLAYER_SPEED: 120,
  PLAYER_JUMP_FORCE: 280,
  GRAVITY: 800,
  
  // Elevator
  ELEVATOR_SPEED: 100,
  ELEVATOR_WIDTH: 48,
  ELEVATOR_HEIGHT: 64,
  
  // Enemies
  ENEMY_SPEED: 60,
  ENEMY_SPAWN_INTERVAL: 3000,
  MAX_ENEMIES: 5,
  
  // Bullets
  BULLET_SPEED: 400,
  
  // Gameplay
  DOCS_PER_LEVEL: 5,
  POINTS_PER_DOC: 500,
  POINTS_PER_ENEMY: 300,
  
  // Colors (retro arcade palette)
  COLORS: {
    bg: "#1a1a2e",
    building: "#2d2d44",
    floor: "#4a4a6a",
    wall: "#3d3d5c",
    doorRed: "#cc3333",
    doorRedDark: "#991111",
    doorNormal: "#666688",
    elevator: "#888899",
    elevatorDark: "#555566",
    player: "#4488ff",
    playerDark: "#2255cc",
    enemy: "#ff4444",
    enemyDark: "#cc2222",
    bullet: "#ffff44",
    car: "#44cc44",
  }
};

// ============= TYPES =============
interface Vec2 {
  x: number;
  y: number;
}

interface Entity {
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
}

interface Player extends Entity {
  facingRight: boolean;
  onGround: boolean;
  crouching: boolean;
  inElevator: Elevator | null;
  animFrame: number;
  animTimer: number;
  shooting: boolean;
  shootTimer: number;
  invincible: number;
}

interface Enemy extends Entity {
  facingRight: boolean;
  onGround: boolean;
  animFrame: number;
  animTimer: number;
  shootTimer: number;
  state: "patrol" | "chase" | "shooting";
  spawnDoor: Door | null;
}

interface Bullet extends Entity {
  isPlayer: boolean;
}

interface Door {
  x: number;
  y: number;
  floor: number;
  isRed: boolean;
  collected: boolean;
  open: boolean;
  openTimer: number;
}

interface Elevator {
  x: number;
  y: number;
  floor: number;
  targetY: number;
  moving: boolean;
  direction: number;
  shaftTop: number;
  shaftBottom: number;
}

interface Floor {
  y: number;
  floorNumber: number;
  platforms: { x: number; width: number }[];
}

interface GameState {
  player: Player;
  enemies: Enemy[];
  bullets: Bullet[];
  doors: Door[];
  elevators: Elevator[];
  floors: Floor[];
  score: number;
  lives: number;
  docsCollected: number;
  totalDocs: number;
  gameOver: boolean;
  victory: boolean;
  started: boolean;
  cameraY: number;
  buildingWidth: number;
  buildingHeight: number;
}

// ============= UTILITY FUNCTIONS =============
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rectCollision(a: Entity, b: Entity): boolean {
  return a.x < b.x + b.width &&
         a.x + a.width > b.x &&
         a.y < b.y + b.height &&
         a.y + a.height > b.y;
}

function rectCollisionBox(a: Entity, bx: number, by: number, bw: number, bh: number): boolean {
  return a.x < bx + bw &&
         a.x + a.width > bx &&
         a.y < by + bh &&
         a.y + a.height > by;
}

// ============= SPRITE RENDERER =============
class SpriteRenderer {
  ctx: CanvasRenderingContext2D;
  
  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }
  
  // Draw player sprite (16x24 pixels, scaled)
  drawPlayer(x: number, y: number, facingRight: boolean, animFrame: number, crouching: boolean, scale: number = 2) {
    const ctx = this.ctx;
    const s = scale;
    
    ctx.save();
    
    if (!facingRight) {
      ctx.translate(x + 16 * s, y);
      ctx.scale(-1, 1);
      x = 0;
      y = 0;
    }
    
    const height = crouching ? 16 : 24;
    const yOffset = crouching ? 8 * s : 0;
    
    // Body (blue suit)
    ctx.fillStyle = CONFIG.COLORS.player;
    ctx.fillRect(x + 4 * s, y + yOffset + 8 * s, 8 * s, (height - 8) * s);
    
    // Darker side
    ctx.fillStyle = CONFIG.COLORS.playerDark;
    ctx.fillRect(x + 4 * s, y + yOffset + 8 * s, 2 * s, (height - 8) * s);
    
    // Head (flesh color)
    ctx.fillStyle = "#ffcc99";
    ctx.fillRect(x + 5 * s, y + yOffset + 2 * s, 6 * s, 6 * s);
    
    // Hair
    ctx.fillStyle = "#442200";
    ctx.fillRect(x + 5 * s, y + yOffset + 1 * s, 6 * s, 2 * s);
    
    // Eyes
    ctx.fillStyle = "#000";
    ctx.fillRect(x + 9 * s, y + yOffset + 4 * s, 1 * s, 1 * s);
    
    // Legs animation
    if (!crouching) {
      const legOffset = Math.sin(animFrame * 0.5) * 2 * s;
      ctx.fillStyle = "#333344";
      ctx.fillRect(x + 5 * s, y + 20 * s + Math.max(0, legOffset), 3 * s, 4 * s);
      ctx.fillRect(x + 9 * s, y + 20 * s + Math.max(0, -legOffset), 3 * s, 4 * s);
    }
    
    // Arms
    ctx.fillStyle = CONFIG.COLORS.player;
    ctx.fillRect(x + 12 * s, y + yOffset + 10 * s, 3 * s, 6 * s);
    
    // Gun
    ctx.fillStyle = "#333";
    ctx.fillRect(x + 13 * s, y + yOffset + 12 * s, 4 * s, 2 * s);
    
    ctx.restore();
  }
  
  // Draw enemy sprite (similar to player but red)
  drawEnemy(x: number, y: number, facingRight: boolean, animFrame: number, scale: number = 2) {
    const ctx = this.ctx;
    const s = scale;
    
    ctx.save();
    
    if (!facingRight) {
      ctx.translate(x + 16 * s, y);
      ctx.scale(-1, 1);
      x = 0;
      y = 0;
    }
    
    // Body (red/black suit)
    ctx.fillStyle = CONFIG.COLORS.enemy;
    ctx.fillRect(x + 4 * s, y + 8 * s, 8 * s, 12 * s);
    
    ctx.fillStyle = CONFIG.COLORS.enemyDark;
    ctx.fillRect(x + 4 * s, y + 8 * s, 2 * s, 12 * s);
    
    // Head
    ctx.fillStyle = "#ffcc99";
    ctx.fillRect(x + 5 * s, y + 2 * s, 6 * s, 6 * s);
    
    // Hat
    ctx.fillStyle = "#222";
    ctx.fillRect(x + 4 * s, y + 1 * s, 8 * s, 2 * s);
    
    // Eyes
    ctx.fillStyle = "#000";
    ctx.fillRect(x + 9 * s, y + 4 * s, 1 * s, 1 * s);
    
    // Legs animation
    const legOffset = Math.sin(animFrame * 0.5) * 2 * s;
    ctx.fillStyle = "#222";
    ctx.fillRect(x + 5 * s, y + 20 * s + Math.max(0, legOffset), 3 * s, 4 * s);
    ctx.fillRect(x + 9 * s, y + 20 * s + Math.max(0, -legOffset), 3 * s, 4 * s);
    
    // Gun arm
    ctx.fillStyle = CONFIG.COLORS.enemy;
    ctx.fillRect(x + 12 * s, y + 10 * s, 3 * s, 6 * s);
    ctx.fillStyle = "#333";
    ctx.fillRect(x + 13 * s, y + 12 * s, 4 * s, 2 * s);
    
    ctx.restore();
  }
  
  // Draw door
  drawDoor(x: number, y: number, isRed: boolean, collected: boolean, open: boolean, scale: number = 2) {
    const ctx = this.ctx;
    const s = scale;
    
    // Door frame
    ctx.fillStyle = "#333";
    ctx.fillRect(x, y, 20 * s, 28 * s);
    
    if (open) {
      // Open door - dark interior
      ctx.fillStyle = "#111";
      ctx.fillRect(x + 2 * s, y + 2 * s, 16 * s, 24 * s);
    } else {
      // Closed door
      const color = isRed && !collected ? CONFIG.COLORS.doorRed : CONFIG.COLORS.doorNormal;
      const darkColor = isRed && !collected ? CONFIG.COLORS.doorRedDark : "#444466";
      
      ctx.fillStyle = color;
      ctx.fillRect(x + 2 * s, y + 2 * s, 16 * s, 24 * s);
      
      // Door handle
      ctx.fillStyle = "#ffd700";
      ctx.fillRect(x + 13 * s, y + 14 * s, 2 * s, 2 * s);
      
      // Shading
      ctx.fillStyle = darkColor;
      ctx.fillRect(x + 2 * s, y + 2 * s, 2 * s, 24 * s);
      
      // Document symbol on red doors
      if (isRed && !collected) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(x + 7 * s, y + 8 * s, 6 * s, 8 * s);
        ctx.fillStyle = "#333";
        ctx.fillRect(x + 8 * s, y + 10 * s, 4 * s, 1 * s);
        ctx.fillRect(x + 8 * s, y + 12 * s, 4 * s, 1 * s);
        ctx.fillRect(x + 8 * s, y + 14 * s, 3 * s, 1 * s);
      }
    }
  }
  
  // Draw elevator
  drawElevator(x: number, y: number, width: number, height: number) {
    const ctx = this.ctx;
    
    // Elevator car
    ctx.fillStyle = CONFIG.COLORS.elevator;
    ctx.fillRect(x, y, width, height);
    
    // Darker edges
    ctx.fillStyle = CONFIG.COLORS.elevatorDark;
    ctx.fillRect(x, y, 4, height);
    ctx.fillRect(x + width - 4, y, 4, height);
    
    // Top rail
    ctx.fillStyle = "#666";
    ctx.fillRect(x, y, width, 4);
    
    // Floor indicator
    ctx.fillStyle = "#111";
    ctx.fillRect(x + width / 2 - 8, y + 6, 16, 12);
    ctx.fillStyle = "#ff0";
    ctx.font = "10px 'Press Start 2P'";
    ctx.textAlign = "center";
    ctx.fillText("E", x + width / 2, y + 15);
  }
  
  // Draw elevator shaft
  drawElevatorShaft(x: number, topY: number, bottomY: number, width: number) {
    const ctx = this.ctx;
    
    // Shaft background
    ctx.fillStyle = "#0a0a15";
    ctx.fillRect(x, topY, width, bottomY - topY);
    
    // Shaft rails
    ctx.fillStyle = "#333";
    ctx.fillRect(x, topY, 3, bottomY - topY);
    ctx.fillRect(x + width - 3, topY, 3, bottomY - topY);
  }
  
  // Draw escape car
  drawCar(x: number, y: number, scale: number = 2) {
    const ctx = this.ctx;
    const s = scale;
    
    // Car body
    ctx.fillStyle = CONFIG.COLORS.car;
    ctx.fillRect(x, y + 8 * s, 48 * s, 16 * s);
    
    // Car roof
    ctx.fillRect(x + 8 * s, y, 24 * s, 10 * s);
    
    // Windows
    ctx.fillStyle = "#88ccff";
    ctx.fillRect(x + 10 * s, y + 2 * s, 8 * s, 6 * s);
    ctx.fillRect(x + 22 * s, y + 2 * s, 8 * s, 6 * s);
    
    // Wheels
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(x + 10 * s, y + 24 * s, 5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 38 * s, y + 24 * s, 5 * s, 0, Math.PI * 2);
    ctx.fill();
    
    // Wheel caps
    ctx.fillStyle = "#888";
    ctx.beginPath();
    ctx.arc(x + 10 * s, y + 24 * s, 2 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 38 * s, y + 24 * s, 2 * s, 0, Math.PI * 2);
    ctx.fill();
    
    // Headlights
    ctx.fillStyle = "#ffff88";
    ctx.fillRect(x + 45 * s, y + 12 * s, 3 * s, 4 * s);
  }
  
  // Draw bullet
  drawBullet(x: number, y: number, isPlayer: boolean) {
    const ctx = this.ctx;
    ctx.fillStyle = isPlayer ? CONFIG.COLORS.bullet : CONFIG.COLORS.enemy;
    ctx.fillRect(x - 3, y - 2, 6, 4);
    
    // Glow effect
    ctx.fillStyle = isPlayer ? "rgba(255, 255, 0, 0.3)" : "rgba(255, 0, 0, 0.3)";
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ============= AUDIO MANAGER =============
class AudioManager {
  private ctx: AudioContext | null = null;
  private initialized = false;

  init(): void {
    if (this.initialized) return;
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.initialized = true;
      console.log("[AudioManager.init] Initialized");
    } catch (e) {
      console.warn("[AudioManager.init] Failed:", e);
    }
  }

  private playTone(freq: number, duration: number, type: OscillatorType = "square", volume: number = 0.2): void {
    if (!this.ctx) return;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
    
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playShoot(): void {
    this.playTone(800, 0.1, "square", 0.15);
    setTimeout(() => this.playTone(600, 0.05, "square", 0.1), 50);
  }

  playEnemyShoot(): void {
    this.playTone(400, 0.1, "sawtooth", 0.1);
  }

  playJump(): void {
    this.playTone(200, 0.1, "sine", 0.15);
    setTimeout(() => this.playTone(300, 0.1, "sine", 0.1), 50);
  }

  playCollect(): void {
    this.playTone(523, 0.1, "sine", 0.2);
    setTimeout(() => this.playTone(659, 0.1, "sine", 0.2), 100);
    setTimeout(() => this.playTone(784, 0.15, "sine", 0.2), 200);
  }

  playEnemyDeath(): void {
    this.playTone(300, 0.15, "sawtooth", 0.15);
    setTimeout(() => this.playTone(200, 0.15, "sawtooth", 0.1), 100);
    setTimeout(() => this.playTone(100, 0.2, "sawtooth", 0.08), 200);
  }

  playPlayerHit(): void {
    this.playTone(200, 0.2, "sawtooth", 0.2);
    setTimeout(() => this.playTone(150, 0.3, "sawtooth", 0.15), 150);
  }

  playElevator(): void {
    this.playTone(100, 0.3, "triangle", 0.08);
  }

  playVictory(): void {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.2, "sine", 0.2), i * 150);
    });
  }

  playGameOver(): void {
    const notes = [392, 349, 330, 262];
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.3, "sawtooth", 0.15), i * 200);
    });
  }
}

// ============= INPUT HANDLER =============
class InputHandler {
  keys: { [key: string]: boolean } = {};
  justPressed: { [key: string]: boolean } = {};
  
  constructor() {
    window.addEventListener("keydown", (e) => this.onKeyDown(e));
    window.addEventListener("keyup", (e) => this.onKeyUp(e));
    
    // Mobile controls
    document.querySelectorAll(".mobile-btn").forEach((btn) => {
      const key = btn.getAttribute("data-key");
      if (key) {
        btn.addEventListener("touchstart", (e) => {
          e.preventDefault();
          this.keys[key] = true;
          this.justPressed[key] = true;
        });
        btn.addEventListener("touchend", (e) => {
          e.preventDefault();
          this.keys[key] = false;
        });
      }
    });
  }
  
  onKeyDown(e: KeyboardEvent): void {
    const key = this.mapKey(e.code);
    if (!this.keys[key]) {
      this.justPressed[key] = true;
    }
    this.keys[key] = true;
    
    // Prevent scrolling
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
      e.preventDefault();
    }
  }
  
  onKeyUp(e: KeyboardEvent): void {
    const key = this.mapKey(e.code);
    this.keys[key] = false;
  }
  
  mapKey(code: string): string {
    switch (code) {
      case "ArrowUp":
      case "KeyW":
        return "up";
      case "ArrowDown":
      case "KeyS":
        return "down";
      case "ArrowLeft":
      case "KeyA":
        return "left";
      case "ArrowRight":
      case "KeyD":
        return "right";
      case "KeyZ":
      case "Space":
        return "jump";
      case "KeyX":
      case "KeyC":
        return "shoot";
      default:
        return code;
    }
  }
  
  isDown(key: string): boolean {
    return this.keys[key] || false;
  }
  
  wasPressed(key: string): boolean {
    return this.justPressed[key] || false;
  }
  
  clearJustPressed(): void {
    this.justPressed = {};
  }
}

// ============= LEVEL GENERATOR =============
function generateLevel(screenWidth: number): GameState {
  console.log("[generateLevel] Creating level");
  
  const buildingWidth = Math.min(screenWidth - 40, 600);
  const floors: Floor[] = [];
  const doors: Door[] = [];
  const elevators: Elevator[] = [];
  
  // Generate floors
  for (let i = 0; i < CONFIG.TOTAL_FLOORS; i++) {
    const floorY = i * CONFIG.FLOOR_HEIGHT;
    
    floors.push({
      y: floorY,
      floorNumber: CONFIG.TOTAL_FLOORS - i,
      platforms: [{ x: 0, width: buildingWidth }],
    });
  }
  
  // Generate elevator shafts (2-3 per building)
  const numShafts = 2 + Math.floor(Math.random() * 2);
  const shaftSpacing = buildingWidth / (numShafts + 1);
  
  for (let i = 0; i < numShafts; i++) {
    const shaftX = shaftSpacing * (i + 1) - CONFIG.ELEVATOR_WIDTH / 2;
    
    // Each shaft spans multiple floors
    const topFloor = 0;
    const bottomFloor = CONFIG.TOTAL_FLOORS - 2;
    
    elevators.push({
      x: shaftX,
      y: topFloor * CONFIG.FLOOR_HEIGHT + CONFIG.FLOOR_HEIGHT - CONFIG.ELEVATOR_HEIGHT,
      floor: topFloor,
      targetY: topFloor * CONFIG.FLOOR_HEIGHT + CONFIG.FLOOR_HEIGHT - CONFIG.ELEVATOR_HEIGHT,
      moving: false,
      direction: 0,
      shaftTop: topFloor * CONFIG.FLOOR_HEIGHT,
      shaftBottom: bottomFloor * CONFIG.FLOOR_HEIGHT + CONFIG.FLOOR_HEIGHT,
    });
  }
  
  // Generate doors on each floor
  let redDoorCount = 0;
  const targetRedDoors = CONFIG.DOCS_PER_LEVEL;
  
  // Pre-select which floors will have red doors (spread them out)
  const floorsWithRedDoors: number[] = [];
  const availableFloors = [];
  for (let i = 2; i < CONFIG.TOTAL_FLOORS - 1; i++) {
    availableFloors.push(i);
  }
  // Shuffle and pick floors for red doors
  for (let i = availableFloors.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availableFloors[i], availableFloors[j]] = [availableFloors[j], availableFloors[i]];
  }
  for (let i = 0; i < Math.min(targetRedDoors, availableFloors.length); i++) {
    floorsWithRedDoors.push(availableFloors[i]);
  }
  
  for (let floorIdx = 1; floorIdx < CONFIG.TOTAL_FLOORS - 1; floorIdx++) {
    const floorY = floorIdx * CONFIG.FLOOR_HEIGHT + CONFIG.FLOOR_HEIGHT - 56;
    
    // Calculate safe door positions (avoiding elevator shafts)
    const doorPositions: number[] = [];
    const doorWidth = 40;
    const minSpacing = 60;
    
    // Try placing doors at intervals along the floor
    for (let x = 30; x < buildingWidth - 50; x += 80) {
      // Check not overlapping with any elevator shaft
      const overlapsElevator = elevators.some(
        (e) => x + doorWidth > e.x - 10 && x < e.x + CONFIG.ELEVATOR_WIDTH + 10
      );
      
      if (!overlapsElevator) {
        doorPositions.push(x);
      }
    }
    
    // Add at least 1-2 doors per floor from available positions
    const numDoorsThisFloor = Math.min(doorPositions.length, 1 + Math.floor(Math.random() * 2));
    
    // Shuffle door positions
    for (let i = doorPositions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [doorPositions[i], doorPositions[j]] = [doorPositions[j], doorPositions[i]];
    }
    
    for (let d = 0; d < numDoorsThisFloor; d++) {
      const doorX = doorPositions[d];
      
      // Check if this floor should have the red door
      const isRed = floorsWithRedDoors.includes(floorIdx) && redDoorCount < targetRedDoors;
      
      if (isRed) {
        redDoorCount++;
        // Remove this floor from the list so we only place one red door per floor
        const idx = floorsWithRedDoors.indexOf(floorIdx);
        if (idx > -1) floorsWithRedDoors.splice(idx, 1);
      }
      
      doors.push({
        x: doorX,
        y: floorY,
        floor: floorIdx,
        isRed,
        collected: false,
        open: false,
        openTimer: 0,
      });
    }
  }
  
  // Ensure we have enough red doors by converting some regular doors
  const regularDoors = doors.filter(d => !d.isRed && d.floor > 1);
  while (redDoorCount < targetRedDoors && regularDoors.length > 0) {
    const randomIdx = Math.floor(Math.random() * regularDoors.length);
    const door = regularDoors.splice(randomIdx, 1)[0];
    door.isRed = true;
    redDoorCount++;
  }
  
  console.log("[generateLevel] Created", doors.length, "doors,", redDoorCount, "red doors");
  
  // Create player at top of building
  const player: Player = {
    x: buildingWidth / 2 - 16,
    y: CONFIG.FLOOR_HEIGHT - 48,
    width: 32,
    height: 48,
    vx: 0,
    vy: 0,
    facingRight: true,
    onGround: true,
    crouching: false,
    inElevator: null,
    animFrame: 0,
    animTimer: 0,
    shooting: false,
    shootTimer: 0,
    invincible: 0,
  };
  
  return {
    player,
    enemies: [],
    bullets: [],
    doors,
    elevators,
    floors,
    score: 0,
    lives: 3,
    docsCollected: 0,
    totalDocs: redDoorCount,
    gameOver: false,
    victory: false,
    started: false,
    cameraY: 0,
    buildingWidth,
    buildingHeight: CONFIG.TOTAL_FLOORS * CONFIG.FLOOR_HEIGHT,
  };
}

// ============= MAIN GAME CLASS =============
class ElevatorActionGame {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  sprites: SpriteRenderer;
  audio: AudioManager;
  input: InputHandler;
  state: GameState;
  
  lastTime: number = 0;
  enemySpawnTimer: number = 0;
  
  isMobile: boolean;
  buildingOffsetX: number = 0;
  
  constructor() {
    console.log("[ElevatorActionGame] Initializing");
    
    this.canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.sprites = new SpriteRenderer(this.ctx);
    this.audio = new AudioManager();
    this.input = new InputHandler();
    
    this.isMobile = window.matchMedia("(pointer: coarse)").matches;
    
    this.state = generateLevel(window.innerWidth);
    
    this.setupEventListeners();
    this.resizeCanvas();
    
    window.addEventListener("resize", () => this.resizeCanvas());
    
    requestAnimationFrame((t) => this.gameLoop(t));
  }
  
  setupEventListeners(): void {
    document.getElementById("startButton")?.addEventListener("click", () => this.startGame());
    document.getElementById("restartButton")?.addEventListener("click", () => this.startGame());
  }
  
  resizeCanvas(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.buildingOffsetX = (this.canvas.width - this.state.buildingWidth) / 2;
    console.log("[resizeCanvas] canvas:", this.canvas.width, "x", this.canvas.height);
  }
  
  startGame(): void {
    console.log("[startGame]");
    this.audio.init();
    
    this.state = generateLevel(this.canvas.width);
    this.state.started = true;
    this.enemySpawnTimer = 0;
    
    document.getElementById("startScreen")?.classList.add("hidden");
    document.getElementById("gameOverScreen")?.classList.add("hidden");
    document.getElementById("hud")!.style.display = "flex";
    document.getElementById("floorIndicator")!.style.display = "block";
    
    this.updateHUD();
  }
  
  gameLoop(timestamp: number): void {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;
    
    if (this.state.started && !this.state.gameOver && !this.state.victory) {
      this.update(dt);
    }
    
    this.render();
    this.input.clearJustPressed();
    
    requestAnimationFrame((t) => this.gameLoop(t));
  }
  
  update(dt: number): void {
    this.updatePlayer(dt);
    this.updateElevators(dt);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updateCamera(dt);
    this.spawnEnemies(dt);
    this.checkCollisions();
    this.checkVictory();
    this.updateDoors(dt);
  }
  
  updatePlayer(dt: number): void {
    const player = this.state.player;
    
    // Update invincibility
    if (player.invincible > 0) {
      player.invincible -= dt;
    }
    
    // Shooting cooldown
    if (player.shootTimer > 0) {
      player.shootTimer -= dt;
    }
    
    // In elevator - special controls
    if (player.inElevator) {
      const elev = player.inElevator;
      
      // Elevator controls
      if (this.input.isDown("up")) {
        elev.direction = -1;
        elev.moving = true;
      } else if (this.input.isDown("down")) {
        elev.direction = 1;
        elev.moving = true;
      } else {
        elev.moving = false;
      }
      
      // Exit elevator with left/right
      if (this.input.isDown("left") || this.input.isDown("right")) {
        player.inElevator = null;
        player.vx = this.input.isDown("left") ? -CONFIG.PLAYER_SPEED : CONFIG.PLAYER_SPEED;
        player.facingRight = this.input.isDown("right");
      }
      
      // Sync position with elevator
      player.x = elev.x + (CONFIG.ELEVATOR_WIDTH - player.width) / 2;
      player.y = elev.y + CONFIG.ELEVATOR_HEIGHT - player.height;
      player.vy = 0;
      player.onGround = true;
      
    } else {
      // Normal movement
      player.vx = 0;
      
      if (this.input.isDown("left")) {
        player.vx = -CONFIG.PLAYER_SPEED;
        player.facingRight = false;
      }
      if (this.input.isDown("right")) {
        player.vx = CONFIG.PLAYER_SPEED;
        player.facingRight = true;
      }
      
      // Crouching
      player.crouching = this.input.isDown("down") && player.onGround;
      if (player.crouching) {
        player.vx = 0;
        player.height = 32;
      } else {
        player.height = 48;
      }
      
      // Jumping
      if (this.input.wasPressed("jump") && player.onGround) {
        player.vy = -CONFIG.PLAYER_JUMP_FORCE;
        player.onGround = false;
        this.audio.playJump();
      }
      
      // Apply gravity
      player.vy += CONFIG.GRAVITY * dt;
      
      // Apply movement
      player.x += player.vx * dt;
      player.y += player.vy * dt;
      
      // Floor collision
      player.onGround = false;
      for (const floor of this.state.floors) {
        const floorTop = floor.y + CONFIG.FLOOR_HEIGHT - 8;
        
        if (player.vy >= 0 &&
            player.y + player.height > floorTop &&
            player.y + player.height < floorTop + 20 &&
            player.x + player.width > 0 &&
            player.x < this.state.buildingWidth) {
          
          player.y = floorTop - player.height;
          player.vy = 0;
          player.onGround = true;
        }
      }
      
      // Wall collision
      player.x = clamp(player.x, 0, this.state.buildingWidth - player.width);
      
      // Check if entering elevator
      for (const elev of this.state.elevators) {
        if (rectCollisionBox(player, elev.x, elev.y, CONFIG.ELEVATOR_WIDTH, CONFIG.ELEVATOR_HEIGHT)) {
          if (this.input.wasPressed("up") || this.input.wasPressed("down")) {
            player.inElevator = elev;
            this.audio.playElevator();
          }
        }
      }
    }
    
    // Shooting
    if (this.input.wasPressed("shoot") && player.shootTimer <= 0) {
      this.shoot(player, true);
      player.shootTimer = 0.3;
    }
    
    // Animation
    if (Math.abs(player.vx) > 0) {
      player.animTimer += dt;
      if (player.animTimer > 0.1) {
        player.animFrame = (player.animFrame + 1) % 4;
        player.animTimer = 0;
      }
    } else {
      player.animFrame = 0;
    }
    
    // Check door interactions
    for (const door of this.state.doors) {
      if (door.isRed && !door.collected &&
          rectCollisionBox(player, door.x, door.y, 40, 56)) {
        door.collected = true;
        door.open = true;
        door.openTimer = 1;
        this.state.docsCollected++;
        this.state.score += CONFIG.POINTS_PER_DOC;
        this.audio.playCollect();
        this.updateHUD();
      }
    }
  }
  
  updateElevators(dt: number): void {
    for (const elev of this.state.elevators) {
      if (elev.moving) {
        const speed = CONFIG.ELEVATOR_SPEED * elev.direction;
        elev.y += speed * dt;
        
        // Clamp to shaft bounds
        const minY = elev.shaftTop + 10;
        const maxY = elev.shaftBottom - CONFIG.ELEVATOR_HEIGHT;
        elev.y = clamp(elev.y, minY, maxY);
      }
    }
  }
  
  updateEnemies(dt: number): void {
    for (const enemy of this.state.enemies) {
      // Shooting cooldown
      if (enemy.shootTimer > 0) {
        enemy.shootTimer -= dt;
      }
      
      const player = this.state.player;
      const distX = Math.abs(player.x - enemy.x);
      const distY = Math.abs(player.y - enemy.y);
      const sameFloor = distY < 20;
      
      // AI state machine
      if (sameFloor && distX < 300) {
        enemy.state = "chase";
        enemy.facingRight = player.x > enemy.x;
        
        if (distX < 200 && enemy.shootTimer <= 0 && Math.random() < 0.02) {
          this.shoot(enemy, false);
          enemy.shootTimer = 1.5 + Math.random();
        }
      } else {
        enemy.state = "patrol";
      }
      
      // Movement
      if (enemy.state === "patrol") {
        enemy.vx = (enemy.facingRight ? 1 : -1) * CONFIG.ENEMY_SPEED;
      } else if (enemy.state === "chase") {
        enemy.vx = (enemy.facingRight ? 1 : -1) * CONFIG.ENEMY_SPEED * 1.5;
      }
      
      // Apply gravity
      enemy.vy += CONFIG.GRAVITY * dt;
      
      // Apply movement
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      
      // Floor collision
      enemy.onGround = false;
      for (const floor of this.state.floors) {
        const floorTop = floor.y + CONFIG.FLOOR_HEIGHT - 8;
        
        if (enemy.vy >= 0 &&
            enemy.y + enemy.height > floorTop &&
            enemy.y + enemy.height < floorTop + 20) {
          
          enemy.y = floorTop - enemy.height;
          enemy.vy = 0;
          enemy.onGround = true;
        }
      }
      
      // Wall collision - reverse direction
      if (enemy.x <= 0 || enemy.x >= this.state.buildingWidth - enemy.width) {
        enemy.facingRight = !enemy.facingRight;
        enemy.x = clamp(enemy.x, 0, this.state.buildingWidth - enemy.width);
      }
      
      // Animation
      if (Math.abs(enemy.vx) > 0) {
        enemy.animTimer += dt;
        if (enemy.animTimer > 0.12) {
          enemy.animFrame = (enemy.animFrame + 1) % 4;
          enemy.animTimer = 0;
        }
      }
    }
  }
  
  updateBullets(dt: number): void {
    for (let i = this.state.bullets.length - 1; i >= 0; i--) {
      const bullet = this.state.bullets[i];
      
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      
      // Remove if out of bounds
      if (bullet.x < -50 || bullet.x > this.state.buildingWidth + 50 ||
          bullet.y < -50 || bullet.y > this.state.buildingHeight + 50) {
        this.state.bullets.splice(i, 1);
      }
    }
  }
  
  updateCamera(dt: number): void {
    const player = this.state.player;
    const targetY = player.y - this.canvas.height / 3;
    
    this.state.cameraY = lerp(this.state.cameraY, targetY, 5 * dt);
    this.state.cameraY = clamp(
      this.state.cameraY,
      0,
      this.state.buildingHeight - this.canvas.height
    );
    
    // Update floor indicator
    const currentFloor = CONFIG.TOTAL_FLOORS - Math.floor(player.y / CONFIG.FLOOR_HEIGHT);
    const floorIndicator = document.getElementById("floorIndicator");
    if (floorIndicator) {
      floorIndicator.textContent = "FLOOR " + currentFloor;
    }
  }
  
  updateDoors(dt: number): void {
    for (const door of this.state.doors) {
      if (door.open && door.openTimer > 0) {
        door.openTimer -= dt;
        if (door.openTimer <= 0) {
          door.open = false;
        }
      }
    }
  }
  
  spawnEnemies(dt: number): void {
    this.enemySpawnTimer += dt * 1000;
    
    if (this.enemySpawnTimer >= CONFIG.ENEMY_SPAWN_INTERVAL &&
        this.state.enemies.length < CONFIG.MAX_ENEMIES) {
      this.enemySpawnTimer = 0;
      
      // Find a door to spawn from (not on player's floor)
      const playerFloor = Math.floor(this.state.player.y / CONFIG.FLOOR_HEIGHT);
      const availableDoors = this.state.doors.filter(
        (d) => Math.abs(d.floor - playerFloor) >= 2 && !d.isRed
      );
      
      if (availableDoors.length > 0) {
        const door = availableDoors[Math.floor(Math.random() * availableDoors.length)];
        
        const enemy: Enemy = {
          x: door.x,
          y: door.y - 4,
          width: 32,
          height: 48,
          vx: 0,
          vy: 0,
          facingRight: Math.random() > 0.5,
          onGround: true,
          animFrame: 0,
          animTimer: 0,
          shootTimer: 1 + Math.random(),
          state: "patrol",
          spawnDoor: door,
        };
        
        this.state.enemies.push(enemy);
        door.open = true;
        door.openTimer = 0.5;
        
        console.log("[spawnEnemies] Spawned enemy at floor", door.floor);
      }
    }
  }
  
  shoot(entity: Player | Enemy, isPlayer: boolean): void {
    const bullet: Bullet = {
      x: entity.x + entity.width / 2 + (entity.facingRight ? 20 : -20),
      y: entity.y + entity.height / 2 - 5,
      width: 8,
      height: 4,
      vx: (entity.facingRight ? 1 : -1) * CONFIG.BULLET_SPEED,
      vy: 0,
      isPlayer,
    };
    
    this.state.bullets.push(bullet);
    
    if (isPlayer) {
      this.audio.playShoot();
    } else {
      this.audio.playEnemyShoot();
    }
  }
  
  checkCollisions(): void {
    const player = this.state.player;
    
    // Player bullets vs enemies
    for (let bi = this.state.bullets.length - 1; bi >= 0; bi--) {
      const bullet = this.state.bullets[bi];
      
      if (bullet.isPlayer) {
        for (let ei = this.state.enemies.length - 1; ei >= 0; ei--) {
          const enemy = this.state.enemies[ei];
          
          if (rectCollision(bullet, enemy)) {
            this.state.bullets.splice(bi, 1);
            this.state.enemies.splice(ei, 1);
            this.state.score += CONFIG.POINTS_PER_ENEMY;
            this.audio.playEnemyDeath();
            this.updateHUD();
            break;
          }
        }
      } else {
        // Enemy bullets vs player
        if (player.invincible <= 0 && rectCollision(bullet, player)) {
          this.state.bullets.splice(bi, 1);
          this.playerHit();
        }
      }
    }
    
    // Player vs enemies (contact damage)
    if (player.invincible <= 0) {
      for (const enemy of this.state.enemies) {
        if (rectCollision(player, enemy)) {
          this.playerHit();
          break;
        }
      }
    }
  }
  
  playerHit(): void {
    console.log("[playerHit] Lives remaining:", this.state.lives - 1);
    
    this.state.lives--;
    this.state.player.invincible = 2;
    this.audio.playPlayerHit();
    this.updateHUD();
    
    if (this.state.lives <= 0) {
      this.endGame(false);
    }
  }
  
  checkVictory(): void {
    const player = this.state.player;
    
    // Check if all documents collected and player at ground floor
    if (this.state.docsCollected >= this.state.totalDocs) {
      const bottomFloor = (CONFIG.TOTAL_FLOORS - 1) * CONFIG.FLOOR_HEIGHT;
      
      if (player.y > bottomFloor - 50) {
        this.endGame(true);
      }
    }
  }
  
  endGame(victory: boolean): void {
    console.log("[endGame] Victory:", victory, "Score:", this.state.score);
    
    this.state.gameOver = true;
    this.state.victory = victory;
    
    // Submit score
    if (typeof (window as any).submitScore === "function") {
      (window as any).submitScore(this.state.score);
    }
    
    // Update UI
    const titleEl = document.getElementById("gameOverTitle")!;
    const resultEl = document.getElementById("missionResult")!;
    
    if (victory) {
      titleEl.textContent = "MISSION COMPLETE";
      titleEl.style.color = "#44ff44";
      resultEl.textContent = "All documents recovered! Agent extracted.";
      resultEl.className = "mission-result success";
      this.audio.playVictory();
    } else {
      titleEl.textContent = "MISSION FAILED";
      titleEl.style.color = "#ff4444";
      resultEl.textContent = "Agent eliminated. Mission aborted.";
      resultEl.className = "mission-result failed";
      this.audio.playGameOver();
    }
    
    document.getElementById("finalScore")!.textContent = this.state.score.toString();
    
    setTimeout(() => {
      document.getElementById("gameOverScreen")?.classList.remove("hidden");
    }, 500);
  }
  
  updateHUD(): void {
    document.getElementById("score")!.textContent = this.state.score.toString();
    document.getElementById("docs")!.textContent = 
      this.state.docsCollected + "/" + this.state.totalDocs;
    document.getElementById("lives")!.textContent = this.state.lives.toString();
  }
  
  render(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    
    // Clear with background
    ctx.fillStyle = CONFIG.COLORS.bg;
    ctx.fillRect(0, 0, w, h);
    
    ctx.save();
    
    // Camera transform
    ctx.translate(this.buildingOffsetX, -this.state.cameraY);
    
    // Draw building background
    this.renderBuilding();
    
    // Draw elevator shafts (behind everything)
    for (const elev of this.state.elevators) {
      this.sprites.drawElevatorShaft(elev.x, elev.shaftTop, elev.shaftBottom, CONFIG.ELEVATOR_WIDTH);
    }
    
    // Draw doors
    for (const door of this.state.doors) {
      this.sprites.drawDoor(door.x, door.y, door.isRed, door.collected, door.open);
    }
    
    // Draw elevators
    for (const elev of this.state.elevators) {
      this.sprites.drawElevator(elev.x, elev.y, CONFIG.ELEVATOR_WIDTH, CONFIG.ELEVATOR_HEIGHT);
    }
    
    // Draw escape car at bottom
    if (this.state.docsCollected >= this.state.totalDocs) {
      const carY = (CONFIG.TOTAL_FLOORS - 1) * CONFIG.FLOOR_HEIGHT + CONFIG.FLOOR_HEIGHT - 60;
      this.sprites.drawCar(this.state.buildingWidth - 120, carY);
    }
    
    // Draw enemies
    for (const enemy of this.state.enemies) {
      this.sprites.drawEnemy(enemy.x, enemy.y, enemy.facingRight, enemy.animFrame);
    }
    
    // Draw player
    const player = this.state.player;
    if (player.invincible <= 0 || Math.floor(player.invincible * 10) % 2 === 0) {
      this.sprites.drawPlayer(
        player.x,
        player.y,
        player.facingRight,
        player.animFrame,
        player.crouching
      );
    }
    
    // Draw bullets
    for (const bullet of this.state.bullets) {
      this.sprites.drawBullet(bullet.x, bullet.y, bullet.isPlayer);
    }
    
    ctx.restore();
    
    // Draw "GET TO CAR" indicator when all docs collected
    if (this.state.started && !this.state.gameOver && 
        this.state.docsCollected >= this.state.totalDocs) {
      ctx.fillStyle = "#44ff44";
      ctx.font = "16px 'Press Start 2P'";
      ctx.textAlign = "center";
      ctx.fillText("GET TO ESCAPE CAR!", w / 2, 80);
    }
  }
  
  renderBuilding(): void {
    const ctx = this.ctx;
    
    // Building exterior
    ctx.fillStyle = CONFIG.COLORS.building;
    ctx.fillRect(-20, -50, this.state.buildingWidth + 40, this.state.buildingHeight + 100);
    
    // Draw each floor
    for (const floor of this.state.floors) {
      const y = floor.y + CONFIG.FLOOR_HEIGHT;
      
      // Floor platform
      ctx.fillStyle = CONFIG.COLORS.floor;
      ctx.fillRect(0, y - 8, this.state.buildingWidth, 8);
      
      // Floor top line
      ctx.fillStyle = "#5a5a7a";
      ctx.fillRect(0, y - 8, this.state.buildingWidth, 2);
      
      // Floor number
      ctx.fillStyle = "#666";
      ctx.font = "10px 'Press Start 2P'";
      ctx.textAlign = "right";
      ctx.fillText(floor.floorNumber.toString(), this.state.buildingWidth - 5, y - 20);
    }
    
    // Building walls
    ctx.fillStyle = CONFIG.COLORS.wall;
    ctx.fillRect(-20, -50, 20, this.state.buildingHeight + 100);
    ctx.fillRect(this.state.buildingWidth, -50, 20, this.state.buildingHeight + 100);
    
    // Roof
    ctx.fillStyle = "#333344";
    ctx.fillRect(-30, -60, this.state.buildingWidth + 60, 15);
    
    // Ground floor entrance
    const groundY = (CONFIG.TOTAL_FLOORS - 1) * CONFIG.FLOOR_HEIGHT + CONFIG.FLOOR_HEIGHT;
    ctx.fillStyle = "#222233";
    ctx.fillRect(this.state.buildingWidth - 80, groundY - 70, 60, 70);
    ctx.fillStyle = "#111";
    ctx.fillRect(this.state.buildingWidth - 75, groundY - 65, 50, 60);
    
    // "EXIT" text
    ctx.fillStyle = "#44ff44";
    ctx.font = "8px 'Press Start 2P'";
    ctx.textAlign = "center";
    ctx.fillText("EXIT", this.state.buildingWidth - 50, groundY - 72);
  }
}

// ============= INITIALIZE =============
window.addEventListener("DOMContentLoaded", () => {
  console.log("[main] Initializing Elevator Action");
  new ElevatorActionGame();
});
