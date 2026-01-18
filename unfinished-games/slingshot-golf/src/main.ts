import { LEVELS, getLevel, getTotalLevels, Level, Point, Hazard, Obstacle } from "./levels";

// ============= CONFIGURATION =============
const CONFIG = {
  // Ball
  BALL_RADIUS: 12,
  BALL_RESTITUTION: 0.5,
  BALL_AIR_DRAG: 0.012,
  BALL_ROLL_FRICTION: 0.98,
  BALL_STOP_SPEED: 12,
  BALL_STOP_DURATION: 1000,
  MAX_BALL_SPEED: 2000,

  // Slingshot
  MAX_PULL_DISTANCE: 160,
  MIN_LAUNCH_SPEED: 200,
  MAX_LAUNCH_SPEED: 1800,

  // Physics
  GRAVITY: 650,
  TERRAIN_FRICTION: 0.45,
  TERRAIN_RESTITUTION: 0.35,
  BOUNCER_RESTITUTION: 1.1,
  WIND_FORCE_SCALE: 1800,
  SAND_DRAG: 2.0,

  // Hole
  HOLE_RADIUS: 18,
  HOLE_DEPTH: 48,
  HOLE_GAP_SCALE: 1.05,

  // Camera
  CAMERA_SMOOTHING: 0.08,
  CAMERA_PADDING: 100,

  // Visuals
  TRAJECTORY_DOTS: 24,
  TRAJECTORY_STEP: 3,
};

// ============= TYPES =============
type GameState = "START" | "PLAYING" | "AIMING" | "BALL_FLYING" | "LEVEL_COMPLETE" | "GAME_OVER";

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  onGround: boolean;
}

interface RectBody {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  restitution: number;
  friction: number;
  label: string;
}

interface CircleBody {
  x: number;
  y: number;
  radius: number;
  restitution: number;
  friction: number;
  label: string;
}

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

interface MovingObstacleState {
  shape: "rectangle" | "circle";
  rect?: RectBody;
  circle?: CircleBody;
  path: Point[];
  speed: number;
  progress: number;
  direction: number;
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

// Catmull-Rom spline interpolation for smooth curves
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

function interpolateCurve(points: Point[], segments: number): Point[] {
  if (points.length < 2) return points;

  const result: Point[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[Math.min(points.length - 1, i + 1)];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    for (let j = 0; j < segments; j++) {
      const t = j / segments;
      result.push({
        x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
        y: catmullRom(p0.y, p1.y, p2.y, p3.y, t),
      });
    }
  }

  result.push(points[points.length - 1]);
  return result;
}

// ============= PARTICLE SYSTEM =============
class ParticleSystem {
  particles: { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; color: string }[] = [];

  emit(x: number, y: number, color: string, count: number, spread: number = 3): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * spread + 1;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 1,
        maxLife: 1,
        size: 3 + Math.random() * 4,
        color,
      });
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.vy += 0.15 * dt * 60;
      p.life -= 0.025 * dt * 60;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number): void {
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x - cameraX, p.y - cameraY, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.particles = [];
  }
}

// ============= MAIN GAME CLASS =============
class SlingshotGolfGame {
  // Canvas
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number = 0;
  private height: number = 0;
  private isMobile: boolean;
  private gameContainer: HTMLElement;

  // Game state
  private gameState: GameState = "START";
  private currentLevelIndex: number = 0;
  private currentLevel: Level | null = null;
  private strokes: number = 0;
  private ballsRemaining: number = 5;
  private totalScore: number = 0;
  private unlockedLevels: number = 1;

  // Game objects
  private ball: Ball | null = null;
  private terrainPoints: Point[] = [];
  private terrainGrass: { x: number; y: number; height: number; tilt: number }[] = [];
  private platforms: RectBody[] = [];
  private bouncers: RectBody[] = [];
  private staticRects: RectBody[] = [];
  private staticCircles: CircleBody[] = [];
  private movingObstacles: MovingObstacleState[] = [];
  private waterZones: { x: number; y: number; width: number; height: number }[] = [];
  private sandZones: { x: number; y: number; width: number; height: number }[] = [];
  private windZones: { x: number; y: number; width: number; height: number; force: Point }[] = [];

  private holeSurface: { point: Point; normal: Point } | null = null;
  private slingshotAnchor: Point | null = null;
  private aimTarget: Point | null = null;
  private aimBallPos: Point | null = null;
  private pullDistance: number = 0;
  private lastBallPosition: Point = { x: 0, y: 0 };

  // Ball state tracking
  private ballStoppedTime: number = 0;
  private ballInHole: boolean = false;

  // Camera
  private cameraX: number = 0;
  private cameraY: number = 0;
  private targetCameraX: number = 0;
  private targetCameraY: number = 0;
  private worldBounds: { minX: number; maxX: number; minY: number; maxY: number } = { minX: 0, maxX: 800, minY: 0, maxY: 600 };

  // Scale factor for responsive design
  private scale: number = 1;

  // Effects
  private particles: ParticleSystem;
  private screenShake: { x: number; y: number; intensity: number; phase: number } = { x: 0, y: 0, intensity: 0, phase: 0 };

  // Audio
  private audioContext: AudioContext | null = null;
  private settings: Settings = { music: true, fx: true, haptics: true };

  // UI Elements
  private startScreen: HTMLElement;
  private hud: HTMLElement;
  private levelCompleteScreen: HTMLElement;
  private gameOverScreen: HTMLElement;
  private settingsBtn: HTMLElement;
  private settingsPanel: HTMLElement;
  private settingsOverlay: HTMLElement;
  private powerMeter: HTMLElement;
  private powerFill: HTMLElement;
  private aimInfo: HTMLElement;
  private windIndicator: HTMLElement;
  private actionButtons: HTMLElement;

  // Timing
  private lastTime: number = 0;
  private physicsAccumulator: number = 0;

  constructor() {
    console.log("[SlingshotGolfGame.constructor]", "Initializing");

    this.isMobile = window.matchMedia("(pointer: coarse)").matches;

    // Create canvas
    this.gameContainer = document.getElementById("game-container")!;
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d")!;
    this.gameContainer.appendChild(this.canvas);

    // Get UI elements
    this.startScreen = document.getElementById("start-screen")!;
    this.hud = document.getElementById("hud")!;
    this.levelCompleteScreen = document.getElementById("level-complete-screen")!;
    this.gameOverScreen = document.getElementById("game-over-screen")!;
    this.settingsBtn = document.getElementById("settings-btn")!;
    this.settingsPanel = document.getElementById("settings-panel")!;
    this.settingsOverlay = document.getElementById("settings-overlay")!;
    this.powerMeter = document.getElementById("power-meter")!;
    this.powerFill = document.getElementById("power-fill")!;
    this.aimInfo = document.getElementById("aim-info")!;
    this.windIndicator = document.getElementById("wind-indicator")!;
    this.actionButtons = document.getElementById("action-buttons")!;

    // Systems
    this.particles = new ParticleSystem();

    // Setup
    this.loadSettings();
    this.loadProgress();
    this.setupCanvas();
    this.setupEventListeners();
    this.renderLevelSelect();

    // Start render loop
    this.render();
    console.log("[SlingshotGolfGame.constructor]", "Initialization complete");
  }

  private setupCanvas(): void {
    console.log("[SlingshotGolfGame.setupCanvas]", "Init");
    this.resizeCanvas();
    window.addEventListener("resize", () => this.resizeCanvas());
  }

  private resizeCanvas(): void {
    const rect = this.gameContainer.getBoundingClientRect();
    this.width = rect.width || window.innerWidth;
    this.height = rect.height || window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.scale = Math.min(this.width / 800, this.height / 500);
  }

  private setupEventListeners(): void {
    console.log("[SlingshotGolfGame.setupEventListeners]", "Init");

    // Start button
    document.getElementById("start-btn")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.playSound("click");
      this.startLevel(1);
    });

    // Next level button
    document.getElementById("next-btn")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.playSound("click");
      this.nextLevel();
    });

    // Retry button
    document.getElementById("retry-btn")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.playSound("click");
      this.restartLevel();
    });

    // Restart button (game over)
    document.getElementById("restart-btn")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.playSound("click");
      this.startLevel(1);
    });

    // Menu button
    document.getElementById("menu-btn")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.showStartScreen();
    });

    // Skip button
    document.getElementById("skip-btn")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      if (this.currentLevelIndex < getTotalLevels()) {
        this.nextLevel();
      }
    });

    // New ball button
    document.getElementById("new-ball-btn")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.resetBallToLastPosition();
    });

    // Settings
    this.settingsBtn.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.openSettings();
    });

    document.getElementById("close-settings")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.closeSettings();
    });

    this.settingsOverlay.addEventListener("click", () => {
      this.closeSettings();
    });

    // Setting toggles
    document.getElementById("toggle-music")!.addEventListener("click", (e) => {
      this.settings.music = !this.settings.music;
      (e.target as HTMLElement).classList.toggle("active", this.settings.music);
      this.saveSettings();
      this.triggerHaptic("light");
    });

    document.getElementById("toggle-fx")!.addEventListener("click", (e) => {
      this.settings.fx = !this.settings.fx;
      (e.target as HTMLElement).classList.toggle("active", this.settings.fx);
      this.saveSettings();
      this.triggerHaptic("light");
    });

    document.getElementById("toggle-haptics")!.addEventListener("click", (e) => {
      this.settings.haptics = !this.settings.haptics;
      (e.target as HTMLElement).classList.toggle("active", this.settings.haptics);
      this.saveSettings();
      this.triggerHaptic("light");
    });

    // Input handlers
    this.canvas.addEventListener("mousedown", (e) => this.handleInputStart(e.clientX, e.clientY));
    this.canvas.addEventListener("mousemove", (e) => this.handleInputMove(e.clientX, e.clientY));
    this.canvas.addEventListener("mouseup", () => this.handleInputEnd());
    this.canvas.addEventListener("mouseleave", () => this.handleInputEnd());

    this.canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.handleInputStart(touch.clientX, touch.clientY);
    });

    this.canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.handleInputMove(touch.clientX, touch.clientY);
    });

    this.canvas.addEventListener("touchend", (e) => {
      e.preventDefault();
      this.handleInputEnd();
    });
  }

  private clearWorld(): void {
    this.terrainPoints = [];
    this.terrainGrass = [];
    this.platforms = [];
    this.bouncers = [];
    this.staticRects = [];
    this.staticCircles = [];
    this.movingObstacles = [];
    this.waterZones = [];
    this.sandZones = [];
    this.windZones = [];
    this.ball = null;
    this.holeSurface = null;
    this.slingshotAnchor = null;
    this.aimTarget = null;
    this.aimBallPos = null;
    this.particles.clear();
  }

  private startLevel(levelId: number): void {
    const level = getLevel(levelId);
    if (!level) {
      console.log("[SlingshotGolfGame.startLevel]", "Level not found", levelId);
      return;
    }

    this.currentLevel = level;
    this.currentLevelIndex = level.id;
    this.strokes = 0;
    this.ballsRemaining = level.balls;
    this.ballInHole = false;
    this.ballStoppedTime = 0;
    this.physicsAccumulator = 0;

    this.clearWorld();
    this.buildTerrain();
    this.buildHazards();
    this.buildObstacles();
    this.createBall();

    this.worldBounds = {
      minX: level.camera.bounds.minX,
      maxX: level.camera.bounds.maxX,
      minY: level.camera.bounds.minY ?? 0,
      maxY: level.camera.bounds.maxY ?? 600,
    };

    const worldWidth = this.worldBounds.maxX - this.worldBounds.minX;
    const terrainCenterY = 350;
    if (this.width >= worldWidth) {
      this.cameraX = this.worldBounds.minX - (this.width - worldWidth) / 2;
    } else {
      this.cameraX = level.ball.x - this.width / 2;
    }
    this.cameraY = terrainCenterY - this.height / 2;
    this.targetCameraX = this.cameraX;
    this.targetCameraY = this.cameraY;

    this.hideAllScreens();
    this.hud.classList.remove("hidden");
    this.settingsBtn.classList.remove("hidden");
    this.actionButtons.classList.remove("hidden");
    this.updateHUD();
    this.updateWindIndicator();
    this.initAudio();
    this.gameState = "PLAYING";
  }

  private buildTerrain(): void {
    if (!this.currentLevel) return;

    const smoothPoints = interpolateCurve(this.currentLevel.terrain.curves, 10);
    this.terrainPoints = smoothPoints;
    this.holeSurface = this.getSurfaceFromPoints(smoothPoints, this.currentLevel.hole.x);
    this.buildTerrainGrass(smoothPoints);

    const holeCenterX = this.holeSurface.point.x;
    const holeGapHalf = CONFIG.HOLE_RADIUS * CONFIG.HOLE_GAP_SCALE;

    const leftEdge = this.getSurfaceFromPoints(smoothPoints, holeCenterX - holeGapHalf).point;
    const rightEdge = this.getSurfaceFromPoints(smoothPoints, holeCenterX + holeGapHalf).point;
    const leftCurve: Point[] = [];
    const rightCurve: Point[] = [];

    for (const point of smoothPoints) {
      if (point.x <= holeCenterX - holeGapHalf) {
        leftCurve.push(point);
      } else if (point.x >= holeCenterX + holeGapHalf) {
        rightCurve.push(point);
      }
    }

    if (leftCurve.length > 0) {
      leftCurve.push(leftEdge);
    }

    if (rightCurve.length > 0) {
      rightCurve.unshift(rightEdge);
    }
  }

  private buildTerrainGrass(points: Point[]): void {
    this.terrainGrass = [];

    const holeCenterX = this.holeSurface?.point.x ?? Number.POSITIVE_INFINITY;
    const holeGapHalf = CONFIG.HOLE_RADIUS * CONFIG.HOLE_GAP_SCALE;

    for (let i = 0; i < points.length; i += 2) {
      const p = points[i];
      if (Math.abs(p.x - holeCenterX) < holeGapHalf) {
        continue;
      }

      const count = 2 + (i % 3);
      for (let j = 0; j < count; j++) {
        const offset = (j - (count - 1) / 2) * 6;
        const height = 4 + (Math.sin(i * 0.7 + j) * 0.5 + 0.5) * 6;
        const tilt = Math.sin(i * 0.5 + j) * 2;
        this.terrainGrass.push({
          x: p.x + offset,
          y: p.y,
          height,
          tilt,
        });
      }
    }
  }

  private buildHazards(): void {
    if (!this.currentLevel) return;

    const hazards = this.currentLevel.hazards ?? [];
    for (const hazard of hazards) {
      if (hazard.type === "water") {
        const height = hazard.depth ?? 20;
        this.waterZones.push({
          x: hazard.x - hazard.width / 2,
          y: hazard.y,
          width: hazard.width,
          height,
        });
      } else if (hazard.type === "sand") {
        const height = hazard.depth ?? 20;
        this.sandZones.push({
          x: hazard.x - hazard.width / 2,
          y: hazard.y,
          width: hazard.width,
          height,
        });
      } else if (hazard.type === "wind") {
        this.windZones.push({
          x: hazard.x,
          y: hazard.y,
          width: hazard.width,
          height: hazard.height,
          force: hazard.force,
        });
      } else if (hazard.type === "bouncer") {
        this.bouncers.push({
          x: hazard.x,
          y: hazard.y,
          width: hazard.width,
          height: hazard.height,
          angle: ((hazard.angle ?? 0) * Math.PI) / 180,
          restitution: hazard.restitution ?? CONFIG.BOUNCER_RESTITUTION,
          friction: 0.05,
          label: "bouncer",
        });
      }
    }
  }

  private buildObstacles(): void {
    if (!this.currentLevel) return;

    const obstacles = this.currentLevel.obstacles ?? [];
    for (const obstacle of obstacles) {
      if (obstacle.type === "static") {
        if (obstacle.shape === "circle") {
          this.staticCircles.push({
            x: obstacle.x,
            y: obstacle.y,
            radius: obstacle.radius ?? 20,
            restitution: 0.3,
            friction: 0.4,
            label: "obstacle",
          });
        } else {
          this.staticRects.push({
            x: obstacle.x,
            y: obstacle.y,
            width: obstacle.width ?? 30,
            height: obstacle.height ?? 30,
            angle: ((obstacle.angle ?? 0) * Math.PI) / 180,
            restitution: 0.3,
            friction: 0.4,
            label: "obstacle",
          });
        }
      } else if (obstacle.type === "moving") {
        const state: MovingObstacleState = {
          shape: obstacle.shape,
          path: obstacle.path,
          speed: obstacle.speed,
          progress: 0,
          direction: 1,
        };

        if (obstacle.shape === "circle") {
          state.circle = {
            x: obstacle.x,
            y: obstacle.y,
            radius: obstacle.radius ?? 20,
            restitution: 0.4,
            friction: 0.35,
            label: "moving_obstacle",
          };
        } else {
          state.rect = {
            x: obstacle.x,
            y: obstacle.y,
            width: obstacle.width ?? 60,
            height: obstacle.height ?? 20,
            angle: 0,
            restitution: 0.4,
            friction: 0.35,
            label: "moving_obstacle",
          };
        }
        this.movingObstacles.push(state);
      }
    }

    if (this.currentLevel?.terrain.platforms) {
      for (const platform of this.currentLevel.terrain.platforms) {
        this.platforms.push({
          x: platform.x,
          y: platform.y,
          width: platform.width,
          height: platform.height,
          angle: ((platform.angle ?? 0) * Math.PI) / 180,
          restitution: platform.restitution ?? CONFIG.TERRAIN_RESTITUTION,
          friction: platform.friction ?? CONFIG.TERRAIN_FRICTION,
          label: "platform",
        });
      }
    }
  }

  private createBall(): void {
    if (!this.currentLevel) return;
    const surface = this.getTerrainSurfaceAt(this.currentLevel.ball.x);
    const ballX = surface.point.x + surface.normal.x * (CONFIG.BALL_RADIUS + 0.5);
    const ballY = surface.point.y + surface.normal.y * (CONFIG.BALL_RADIUS + 0.5);
    this.ball = {
      x: ballX,
      y: ballY,
      vx: 0,
      vy: 0,
      radius: CONFIG.BALL_RADIUS,
      onGround: false,
    };
    this.lastBallPosition = { x: ballX, y: ballY };
    this.slingshotAnchor = { x: ballX, y: ballY };
  }

  private handleInputStart(clientX: number, clientY: number): void {
    if (this.gameState !== "PLAYING") return;
    if (!this.ball || !this.slingshotAnchor) return;
    const speed = Math.hypot(this.ball.vx, this.ball.vy);
    if (speed > 30) return;

    const { x: worldX, y: worldY } = this.getPointerWorld(clientX, clientY);
    const dist = distance(worldX, worldY, this.ball.x, this.ball.y);

    if (dist < 60) {
      this.gameState = "AIMING";
      this.pullDistance = 0;
      this.aimTarget = { x: this.ball.x, y: this.ball.y };
      this.aimBallPos = { x: this.ball.x, y: this.ball.y };
      this.powerMeter.classList.add("visible");
      this.aimInfo.classList.remove("hidden");
      this.triggerHaptic("light");
    }
  }

  private handleInputMove(clientX: number, clientY: number): void {
    if (this.gameState !== "AIMING" || !this.ball || !this.slingshotAnchor) return;

    const { x: worldX, y: worldY } = this.getPointerWorld(clientX, clientY);
    const dx = worldX - this.slingshotAnchor.x;
    const dy = worldY - this.slingshotAnchor.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clamped = Math.min(dist, CONFIG.MAX_PULL_DISTANCE);
    const dirX = dist > 0 ? dx / dist : 0;
    const dirY = dist > 0 ? dy / dist : 0;

    this.pullDistance = clamped;
    this.aimTarget = {
      x: this.slingshotAnchor.x + dirX * clamped,
      y: this.slingshotAnchor.y + dirY * clamped,
    };

    const power = (this.pullDistance / CONFIG.MAX_PULL_DISTANCE) * 100;
    this.powerFill.style.height = power + "%";
    this.aimInfo.textContent = "Power: " + Math.round(power) + "%";
  }

  private handleInputEnd(): void {
    if (this.gameState !== "AIMING" || !this.ball) return;

    this.powerMeter.classList.remove("visible");
    this.aimInfo.classList.add("hidden");

    if (this.pullDistance > 15) {
      this.launchBall();
    } else {
      this.gameState = "PLAYING";
    }

    this.pullDistance = 0;
    this.aimTarget = null;
    this.aimBallPos = null;
  }

  private launchBall(): void {
    if (!this.ball || !this.slingshotAnchor) return;

    if (this.aimTarget) {
      this.ball.x = this.aimTarget.x;
      this.ball.y = this.aimTarget.y;
    }

    const dx = this.slingshotAnchor.x - this.ball.x;
    const dy = this.slingshotAnchor.y - this.ball.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return;

    const power = Math.min(1, dist / CONFIG.MAX_PULL_DISTANCE);
    const easedPower = Math.pow(power, 1.25);
    const launchSpeed = CONFIG.MIN_LAUNCH_SPEED + easedPower * (CONFIG.MAX_LAUNCH_SPEED - CONFIG.MIN_LAUNCH_SPEED);
    this.ball.vx = (dx / dist) * launchSpeed;
    this.ball.vy = (dy / dist) * launchSpeed;
    this.ball.onGround = false;

    this.strokes++;
    this.gameState = "BALL_FLYING";
    this.ballStoppedTime = 0;
    this.playSound("swing");
    this.triggerHaptic("medium");
    this.updateHUD();
    this.lastBallPosition = { x: this.ball.x, y: this.ball.y };
  }

  private updateMovingObstacles(dt: number): void {
    for (const obs of this.movingObstacles) {
      obs.progress += obs.speed * dt * obs.direction;
      if (obs.progress >= 1) {
        obs.progress = 1;
        obs.direction = -1;
      } else if (obs.progress <= 0) {
        obs.progress = 0;
        obs.direction = 1;
      }

      const p0 = obs.path[0];
      const p1 = obs.path[obs.path.length - 1];
      const x = lerp(p0.x, p1.x, obs.progress);
      const y = lerp(p0.y, p1.y, obs.progress);

      if (obs.rect) {
        obs.rect.x = x;
        obs.rect.y = y;
      }
      if (obs.circle) {
        obs.circle.x = x;
        obs.circle.y = y;
      }
    }
  }

  private stepPhysics(dt: number): void {
    if (!this.ball || !this.currentLevel) return;

    // Apply gravity
    this.ball.vy += CONFIG.GRAVITY * dt;

    // Apply wind
    for (const zone of this.windZones) {
      const inZone =
        this.ball.x > zone.x - zone.width / 2 &&
        this.ball.x < zone.x + zone.width / 2 &&
        this.ball.y > zone.y &&
        this.ball.y < zone.y + zone.height;
      if (inZone) {
        this.ball.vx += zone.force.x * CONFIG.WIND_FORCE_SCALE * dt;
        this.ball.vy += zone.force.y * CONFIG.WIND_FORCE_SCALE * dt;
      }
    }

    // Integrate
    this.ball.x += this.ball.vx * dt;
    this.ball.y += this.ball.vy * dt;
    
    // Store previous ground state before resetting
    const wasOnGround = this.ball.onGround;
    this.ball.onGround = false;

    // Air drag (only when airborne, not rolling)
    if (!wasOnGround) {
      const drag = Math.max(0, 1 - CONFIG.BALL_AIR_DRAG * dt);
      this.ball.vx *= drag;
      this.ball.vy *= drag;
    }

    this.resolveTerrainCollision();
    this.resolveRectCollisions(this.platforms, CONFIG.TERRAIN_RESTITUTION, CONFIG.TERRAIN_FRICTION);
    this.resolveRectCollisions(this.bouncers, CONFIG.BOUNCER_RESTITUTION, 0.05);
    this.resolveRectCollisions(this.staticRects, 0.4, 0.3);
    this.resolveCircleCollisions(this.staticCircles, 0.4, 0.3);

    for (const obs of this.movingObstacles) {
      if (obs.rect) {
        this.resolveRectCollision(obs.rect, 0.4, 0.3);
      } else if (obs.circle) {
        this.resolveCircleCollision(obs.circle, 0.4, 0.3);
      }
    }

    // Sand drag
    if (this.isBallInSand()) {
      const sandDrag = Math.max(0, 1 - CONFIG.SAND_DRAG * dt);
      this.ball.vx *= sandDrag;
      this.ball.vy *= sandDrag;
    }

    // Clamp speed
    const speed = Math.hypot(this.ball.vx, this.ball.vy);
    if (speed > CONFIG.MAX_BALL_SPEED) {
      const scale = CONFIG.MAX_BALL_SPEED / speed;
      this.ball.vx *= scale;
      this.ball.vy *= scale;
    }

    // Water hazard
    if (this.isBallInWater()) {
      this.onBallInWater();
      return;
    }

    // Out of bounds detection
    if (this.isBallOutOfBounds()) {
      this.onBallOutOfBounds();
      return;
    }

    // Hole detection
    if (this.isBallInHole()) {
      this.onBallInHole();
    }
  }

  private isBallOutOfBounds(): boolean {
    if (!this.ball) return false;

    const margin = 200;
    const bottomMargin = 400;

    // Check if ball is too far left
    if (this.ball.x < this.worldBounds.minX - margin) {
      console.log("[SlingshotGolfGame.isBallOutOfBounds]", "Ball too far left");
      return true;
    }

    // Check if ball is too far right
    if (this.ball.x > this.worldBounds.maxX + margin) {
      console.log("[SlingshotGolfGame.isBallOutOfBounds]", "Ball too far right");
      return true;
    }

    // Check if ball fell too far below the world
    if (this.ball.y > this.worldBounds.maxY + bottomMargin) {
      console.log("[SlingshotGolfGame.isBallOutOfBounds]", "Ball fell below world");
      return true;
    }

    return false;
  }

  private onBallOutOfBounds(): void {
    console.log("[SlingshotGolfGame.onBallOutOfBounds]", "Ball out of bounds, resetting");
    if (!this.ball) return;
    this.playSound("fail");
    this.triggerHaptic("error");
    this.particles.emit(this.ball.x, this.ball.y, "#FF5722", 10, 3);
    setTimeout(() => this.resetBallToLastPosition(), 400);
  }

  private resolveTerrainCollision(): void {
    if (!this.ball || !this.currentLevel || this.terrainPoints.length < 2) return;

    const holeCenterX = this.holeSurface?.point.x ?? this.currentLevel.hole.x;
    const holeGapHalf = CONFIG.HOLE_RADIUS * CONFIG.HOLE_GAP_SCALE;
    const holeY = this.holeSurface?.point.y ?? this.getSurfaceFromPoints(this.terrainPoints, holeCenterX).point.y;

    if (this.ball.x > holeCenterX - holeGapHalf && this.ball.x < holeCenterX + holeGapHalf) {
      if (this.ball.y > holeY - this.ball.radius) {
        return;
      }
    }

    const surface = this.getSurfaceFromPoints(this.terrainPoints, this.ball.x);
    const normal = surface.normal;
    const dx = this.ball.x - surface.point.x;
    const dy = this.ball.y - surface.point.y;
    const dist = dx * normal.x + dy * normal.y;

    if (dist < this.ball.radius) {
      const correction = this.ball.radius - dist;
      this.ball.x += normal.x * correction;
      this.ball.y += normal.y * correction;

      const vN = this.ball.vx * normal.x + this.ball.vy * normal.y;
      const vT = { x: this.ball.vx - vN * normal.x, y: this.ball.vy - vN * normal.y };

      if (vN < 0) {
        // Only bounce if hitting hard enough, otherwise just absorb
        if (Math.abs(vN) > 50) {
          const bounce = CONFIG.TERRAIN_RESTITUTION;
          const newVN = -vN * bounce;
          this.ball.vx = vT.x * 0.95 + newVN * normal.x;
          this.ball.vy = vT.y * 0.95 + newVN * normal.y;
        } else {
          // Soft landing - keep tangential velocity for rolling
          this.ball.vx = vT.x * 0.98;
          this.ball.vy = vT.y * 0.98;
        }
      }

      // Check if on ground (surface is mostly upward-facing)
      if (normal.y < -0.3) {
        this.ball.onGround = true;

        // Simple rolling friction - just slow down gradually
        const speed = Math.hypot(this.ball.vx, this.ball.vy);
        if (speed > 3) {
          const friction = 0.985; // Gentle friction for smooth rolling
          this.ball.vx *= friction;
        } else if (speed < 3) {
          // Come to a stop when very slow
          this.ball.vx *= 0.92;
          this.ball.vy *= 0.92;
        }
      }
    }
  }

  private resolveRectCollisions(rects: RectBody[], restitution: number, friction: number): void {
    for (const rect of rects) {
      this.resolveRectCollision(rect, restitution, friction);
    }
  }

  private resolveRectCollision(rect: RectBody, restitution: number, friction: number): void {
    if (!this.ball) return;

    const cos = Math.cos(-rect.angle);
    const sin = Math.sin(-rect.angle);
    const relX = this.ball.x - rect.x;
    const relY = this.ball.y - rect.y;
    const localX = relX * cos - relY * sin;
    const localY = relX * sin + relY * cos;

    const halfW = rect.width / 2;
    const halfH = rect.height / 2;
    const clampedX = clamp(localX, -halfW, halfW);
    const clampedY = clamp(localY, -halfH, halfH);
    const dx = localX - clampedX;
    const dy = localY - clampedY;
    const distSq = dx * dx + dy * dy;

    if (distSq <= this.ball.radius * this.ball.radius) {
      const dist = Math.sqrt(distSq) || 1;
      let nX = dx / dist;
      let nY = dy / dist;

      if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
        const penX = halfW - Math.abs(localX);
        const penY = halfH - Math.abs(localY);
        if (penX < penY) {
          nX = localX > 0 ? 1 : -1;
          nY = 0;
        } else {
          nX = 0;
          nY = localY > 0 ? 1 : -1;
        }
      }

      const worldNX = nX * cos + nY * -sin;
      const worldNY = nX * sin + nY * cos;
      const overlap = this.ball.radius - dist;
      this.ball.x += worldNX * overlap;
      this.ball.y += worldNY * overlap;

      const vN = this.ball.vx * worldNX + this.ball.vy * worldNY;
      if (vN < 0) {
        const vtX = this.ball.vx - vN * worldNX;
        const vtY = this.ball.vy - vN * worldNY;
        const newVN = -vN * restitution;
        const newVTX = vtX * (1 - friction);
        const newVTY = vtY * (1 - friction);
        this.ball.vx = newVTX + newVN * worldNX;
        this.ball.vy = newVTY + newVN * worldNY;
      }

      if (worldNY < -0.4) {
        this.ball.onGround = true;
      }
    }
  }

  private resolveCircleCollisions(circles: CircleBody[], restitution: number, friction: number): void {
    for (const circle of circles) {
      this.resolveCircleCollision(circle, restitution, friction);
    }
  }

  private resolveCircleCollision(circle: CircleBody, restitution: number, friction: number): void {
    if (!this.ball) return;

    const dx = this.ball.x - circle.x;
    const dy = this.ball.y - circle.y;
    const distSq = dx * dx + dy * dy;
    const minDist = this.ball.radius + circle.radius;

    if (distSq < minDist * minDist) {
      const dist = Math.sqrt(distSq) || 1;
      const nX = dx / dist;
      const nY = dy / dist;
      const overlap = minDist - dist;
      this.ball.x += nX * overlap;
      this.ball.y += nY * overlap;

      const vN = this.ball.vx * nX + this.ball.vy * nY;
      if (vN < 0) {
        const vtX = this.ball.vx - vN * nX;
        const vtY = this.ball.vy - vN * nY;
        const newVN = -vN * restitution;
        this.ball.vx = vtX * (1 - friction) + newVN * nX;
        this.ball.vy = vtY * (1 - friction) + newVN * nY;
      }
    }
  }

  private isBallInWater(): boolean {
    if (!this.ball) return false;
    for (const zone of this.waterZones) {
      if (
        this.ball.x > zone.x &&
        this.ball.x < zone.x + zone.width &&
        this.ball.y > zone.y &&
        this.ball.y < zone.y + zone.height
      ) {
        return true;
      }
    }
    return false;
  }

  private isBallInSand(): boolean {
    if (!this.ball) return false;
    for (const zone of this.sandZones) {
      if (
        this.ball.x > zone.x &&
        this.ball.x < zone.x + zone.width &&
        this.ball.y > zone.y &&
        this.ball.y < zone.y + zone.height
      ) {
        return true;
      }
    }
    return false;
  }

  private isBallInHole(): boolean {
    if (!this.ball || !this.holeSurface) return false;

    const holeX = this.holeSurface.point.x;
    const holeY = this.holeSurface.point.y;
    const gapHalf = CONFIG.HOLE_RADIUS * CONFIG.HOLE_GAP_SCALE;

    const inGap = Math.abs(this.ball.x - holeX) < gapHalf - this.ball.radius * 0.2;
    const deepEnough = this.ball.y > holeY + CONFIG.HOLE_DEPTH - this.ball.radius * 0.3;
    return inGap && deepEnough;
  }

  private checkBallStopped(dt: number): void {
    if (!this.ball || this.gameState !== "BALL_FLYING") return;

    const speed = Math.hypot(this.ball.vx, this.ball.vy);
    if (this.isBallInHole()) {
      this.ballStoppedTime = 0;
      return;
    }

    if (speed < CONFIG.BALL_STOP_SPEED && this.ball.onGround) {
      this.ballStoppedTime += dt * 1000;
      if (this.ballStoppedTime > CONFIG.BALL_STOP_DURATION) {
        console.log("[SlingshotGolfGame.checkBallStopped]", "Ball stopped");
        this.gameState = "PLAYING";
        this.ballStoppedTime = 0;
        this.slingshotAnchor = { x: this.ball.x, y: this.ball.y };
      }
    } else {
      this.ballStoppedTime = 0;
    }
  }

  private onBallInHole(): void {
    if (this.ballInHole || !this.currentLevel) return;
    this.ballInHole = true;
    this.gameState = "LEVEL_COMPLETE";
    this.playSound("hole");
    this.triggerHaptic("success");
    this.particles.emit(this.currentLevel.hole.x, this.currentLevel.hole.y, "#FFD700", 20, 5);
    this.shakeScreen(0.3);

    const par = this.currentLevel.par;
    const diff = this.strokes - par;
    this.totalScore += diff;

    if (this.currentLevelIndex >= this.unlockedLevels && this.currentLevelIndex < getTotalLevels()) {
      this.unlockedLevels = this.currentLevelIndex + 1;
      this.saveProgress();
    }

    const nextIndex = this.currentLevelIndex + 1;
    setTimeout(() => {
      if (nextIndex < getTotalLevels()) {
        this.startLevel(nextIndex);
      } else {
        this.showGameComplete();
      }
    }, 900);
  }

  private onBallInWater(): void {
    console.log("[SlingshotGolfGame.onBallInWater]", "Ball in water");
    if (!this.ball) return;
    this.playSound("splash");
    this.triggerHaptic("error");
    this.particles.emit(this.ball.x, this.ball.y, "#4FC3F7", 15, 4);
    this.strokes++;
    this.updateHUD();
    setTimeout(() => this.resetBallToLastPosition(), 500);
  }

  private resetBallToLastPosition(): void {
    if (!this.ball) return;

    this.ballsRemaining--;
    if (this.ballsRemaining <= 0) {
      this.gameOver();
      return;
    }

    this.ball.x = this.lastBallPosition.x;
    this.ball.y = this.lastBallPosition.y;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.ball.onGround = false;
    this.slingshotAnchor = { x: this.ball.x, y: this.ball.y };

    this.gameState = "PLAYING";
    this.updateHUD();
  }

  private getSurfaceFromPoints(points: Point[], x: number): { point: Point; normal: Point } {
    if (points.length < 2) {
      return { point: { x, y: this.currentLevel?.ball.y ?? 400 }, normal: { x: 0, y: -1 } };
    }

    let p1 = points[0];
    let p2 = points[1];

    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (x >= a.x && x <= b.x) {
        p1 = a;
        p2 = b;
        break;
      }
    }

    if (x < points[0].x) {
      p1 = points[0];
      p2 = points[1];
    } else if (x > points[points.length - 1].x) {
      p1 = points[points.length - 2];
      p2 = points[points.length - 1];
    }

    const denom = p2.x - p1.x;
    const t = denom === 0 ? 0 : (x - p1.x) / denom;
    const y = p1.y + t * (p2.y - p1.y);
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    return { point: { x, y }, normal: { x: nx, y: ny } };
  }

  private getTerrainSurfaceAt(x: number): { point: Point; normal: Point } {
    if (!this.terrainPoints.length) {
      return { point: { x, y: this.currentLevel?.ball.y ?? 400 }, normal: { x: 0, y: -1 } };
    }
    return this.getSurfaceFromPoints(this.terrainPoints, x);
  }

  private updateCamera(): void {
    if (!this.ball) return;

    const worldWidth = this.worldBounds.maxX - this.worldBounds.minX;
    const worldHeight = this.worldBounds.maxY - this.worldBounds.minY;

    if (this.width >= worldWidth) {
      this.targetCameraX = this.worldBounds.minX - (this.width - worldWidth) / 2;
    } else {
      this.targetCameraX = this.ball.x - this.width / 2;
      this.targetCameraX = clamp(
        this.targetCameraX,
        this.worldBounds.minX - CONFIG.CAMERA_PADDING,
        this.worldBounds.maxX - this.width + CONFIG.CAMERA_PADDING
      );
    }

    const terrainCenterY = 350;
    if (this.height >= worldHeight + 200) {
      this.targetCameraY = terrainCenterY - this.height / 2;
    } else {
      this.targetCameraY = this.ball.y - this.height / 2;
      this.targetCameraY = clamp(this.targetCameraY, -200, this.worldBounds.maxY - this.height / 2);
    }

    this.cameraX = lerp(this.cameraX, this.targetCameraX, CONFIG.CAMERA_SMOOTHING);
    this.cameraY = lerp(this.cameraY, this.targetCameraY, CONFIG.CAMERA_SMOOTHING);
  }

  private updateHUD(): void {
    document.getElementById("level-display")!.textContent = this.currentLevelIndex.toString();
    document.getElementById("stroke-display")!.textContent = this.strokes.toString();
    document.getElementById("par-display")!.textContent = this.currentLevel!.par.toString();

    const container = document.getElementById("ball-counter")!;
    container.innerHTML = "";
    for (let i = 0; i < this.currentLevel!.balls; i++) {
      const pip = document.createElement("div");
      pip.className = "ball-pip" + (i >= this.ballsRemaining ? " used" : "");
      container.appendChild(pip);
    }
  }

  private updateWindIndicator(): void {
    const wind = this.currentLevel?.wind ?? { x: 0, y: 0 };
    if (wind.x === 0 && wind.y === 0) {
      this.windIndicator.classList.add("hidden");
      return;
    }

    this.windIndicator.classList.remove("hidden");
    const arrow = document.getElementById("wind-arrow")!;
    const value = document.getElementById("wind-value")!;
    const strength = Math.sqrt(wind.x * wind.x + wind.y * wind.y) * 10000;
    const angle = Math.atan2(wind.y, wind.x) * (180 / Math.PI);
    arrow.style.transform = "rotate(" + angle + "deg)";
    value.textContent = strength.toFixed(1);
  }

  private showLevelComplete(): void {
    console.log("[SlingshotGolfGame.showLevelComplete]", "Showing");
    const par = this.currentLevel!.par;
    const diff = this.strokes - par;

    document.getElementById("complete-strokes")!.textContent = this.strokes.toString();
    document.getElementById("complete-par")!.textContent = par.toString();

    const resultEl = document.getElementById("complete-result")!;
    const titleEl = document.getElementById("complete-title")!;

    if (this.strokes === 1) {
      titleEl.textContent = "HOLE IN ONE!";
      resultEl.textContent = "AMAZING!";
      resultEl.className = "score-result under";
    } else if (diff < 0) {
      titleEl.textContent = "EXCELLENT!";
      resultEl.textContent = diff + " UNDER PAR";
      resultEl.className = "score-result under";
    } else if (diff === 0) {
      titleEl.textContent = "NICE SHOT!";
      resultEl.textContent = "PAR";
      resultEl.className = "score-result even";
    } else {
      titleEl.textContent = "LEVEL COMPLETE";
      resultEl.textContent = "+" + diff + " OVER PAR";
      resultEl.className = "score-result over";
    }

    const nextBtn = document.getElementById("next-btn")!;
    if (this.currentLevelIndex >= getTotalLevels()) {
      nextBtn.classList.add("hidden");
    } else {
      nextBtn.classList.remove("hidden");
    }

    this.levelCompleteScreen.classList.add("visible");
    this.hud.classList.add("hidden");
    this.settingsBtn.classList.add("hidden");
    this.actionButtons.classList.add("hidden");
  }

  private nextLevel(): void {
    this.levelCompleteScreen.classList.remove("visible");
    if (this.currentLevelIndex < getTotalLevels()) {
      this.startLevel(this.currentLevelIndex + 1);
    } else {
      this.showGameComplete();
    }
  }

  private restartLevel(): void {
    this.levelCompleteScreen.classList.remove("visible");
    this.startLevel(this.currentLevelIndex);
  }

  private gameOver(): void {
    console.log("[SlingshotGolfGame.gameOver]", "Out of balls");
    this.gameState = "GAME_OVER";
    this.playSound("fail");
    this.triggerHaptic("error");
    document.getElementById("total-score")!.textContent = (this.totalScore >= 0 ? "+" : "") + this.totalScore;
    this.gameOverScreen.classList.add("visible");
    this.hud.classList.add("hidden");
    this.settingsBtn.classList.add("hidden");
    this.actionButtons.classList.add("hidden");
  }

  private showGameComplete(): void {
    console.log("[SlingshotGolfGame.showGameComplete]", "All levels done");
    this.submitScore(Math.max(0, 100 - this.totalScore * 2));
    document.getElementById("total-score")!.textContent = (this.totalScore >= 0 ? "+" : "") + this.totalScore;
    this.gameOverScreen.querySelector(".game-over-title")!.textContent = "GAME COMPLETE!";
    this.gameOverScreen.classList.add("visible");
    this.hud.classList.add("hidden");
    this.settingsBtn.classList.add("hidden");
    this.actionButtons.classList.add("hidden");
  }

  private showStartScreen(): void {
    this.hideAllScreens();
    this.renderLevelSelect();
    this.startScreen.classList.remove("hidden");
    this.gameState = "START";
  }

  private hideAllScreens(): void {
    this.startScreen.classList.add("hidden");
    this.levelCompleteScreen.classList.remove("visible");
    this.gameOverScreen.classList.remove("visible");
    this.hud.classList.add("hidden");
    this.settingsBtn.classList.add("hidden");
    this.actionButtons.classList.add("hidden");
  }

  private shakeScreen(intensity: number): void {
    this.screenShake.intensity = Math.max(this.screenShake.intensity, intensity);
  }

  private updateScreenShake(dt: number): void {
    if (this.screenShake.intensity > 0) {
      this.screenShake.phase += dt * 20;
      this.screenShake.x = Math.sin(this.screenShake.phase) * this.screenShake.intensity * 10;
      this.screenShake.y = Math.cos(this.screenShake.phase * 1.3) * this.screenShake.intensity * 10;
      this.screenShake.intensity *= 0.92;
      if (this.screenShake.intensity < 0.01) {
        this.screenShake.intensity = 0;
        this.screenShake.x = 0;
        this.screenShake.y = 0;
      }
    }
  }

  private renderLevelSelect(): void {
    const container = document.getElementById("level-select")!;
    container.innerHTML = "";

    for (let i = 1; i <= getTotalLevels(); i++) {
      const btn = document.createElement("button");
      btn.className = "level-btn";
      btn.textContent = i.toString();

      if (i > this.unlockedLevels) {
        btn.classList.add("locked");
        btn.textContent = "🔒";
      } else {
        btn.addEventListener("click", () => {
          this.triggerHaptic("light");
          this.playSound("click");
          this.startLevel(i);
        });
      }
      container.appendChild(btn);
    }
  }

  private render = (time: number = 0): void => {
    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    if (this.gameState === "BALL_FLYING" || this.gameState === "PLAYING") {
      this.physicsAccumulator += dt;
      const step = 1 / 60;
      while (this.physicsAccumulator >= step) {
        this.updateMovingObstacles(step);
        this.stepPhysics(step);
        this.physicsAccumulator -= step;
      }
      this.checkBallStopped(dt);
    } else if (this.gameState === "AIMING") {
      this.updateAim(dt);
    }

    if (this.gameState === "BALL_FLYING" || this.gameState === "AIMING" || this.gameState === "PLAYING") {
      this.updateCamera();
    }

    this.particles.update(dt);
    this.updateScreenShake(dt);

    // Clear and draw
    this.ctx.save();
    this.ctx.translate(this.screenShake.x, this.screenShake.y);

    this.drawBackground();

    if (this.currentLevel) {
      this.ctx.save();
      this.ctx.translate(-this.cameraX, -this.cameraY);

      this.drawTerrain();
      this.drawHazards();
      this.drawObstacles();
      this.drawHole();
      this.drawBall();
      if (this.gameState === "AIMING") {
        this.drawTrajectory();
        this.drawSlingshot();
      }

      this.particles.draw(this.ctx, this.cameraX, this.cameraY);
      this.ctx.restore();
    }

    this.ctx.restore();
    requestAnimationFrame(this.render);
  };

  private drawBackground(): void {
    const bg = this.currentLevel?.background ?? {};
    const skyColor = bg.skyColor ?? "#87CEEB";
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, skyColor);
    gradient.addColorStop(1, this.adjustColor(skyColor, -20));
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);

    this.ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    const cloudPositions = [
      { x: 100, y: 80, r: 40 },
      { x: 140, y: 70, r: 50 },
      { x: 180, y: 85, r: 35 },
      { x: 400, y: 100, r: 45 },
      { x: 450, y: 90, r: 55 },
      { x: 700, y: 70, r: 40 },
      { x: 750, y: 80, r: 50 },
    ];
    for (const cloud of cloudPositions) {
      this.ctx.beginPath();
      this.ctx.arc(cloud.x - this.cameraX * 0.1, cloud.y, cloud.r, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.fillStyle = "rgba(100, 180, 100, 0.3)";
    this.ctx.beginPath();
    this.ctx.moveTo(0, this.height);
    for (let x = 0; x <= this.width; x += 50) {
      const y = this.height - 150 + Math.sin(x * 0.01 + this.cameraX * 0.0005) * 50;
      this.ctx.lineTo(x, y);
    }
    this.ctx.lineTo(this.width, this.height);
    this.ctx.fill();
  }

  private drawTerrain(): void {
    if (!this.terrainPoints.length) return;
    const bg = this.currentLevel?.background ?? {};
    const hillColor = bg.hillColor ?? "#228B22";
    const groundColor = bg.groundColor ?? "#8B4513";

    const holeCenterX = this.holeSurface?.point.x ?? this.currentLevel?.hole.x ?? 0;
    const holeGapHalf = CONFIG.HOLE_RADIUS * CONFIG.HOLE_GAP_SCALE;
    const holeGapStart = holeCenterX - holeGapHalf;
    const holeGapEnd = holeCenterX + holeGapHalf;

    const leftPoints: Point[] = [];
    const rightPoints: Point[] = [];
    for (const point of this.terrainPoints) {
      if (point.x <= holeGapStart) {
        leftPoints.push(point);
      } else if (point.x >= holeGapEnd) {
        rightPoints.push(point);
      }
    }

    const leftEdge = this.getSurfaceFromPoints(this.terrainPoints, holeGapStart).point;
    const rightEdge = this.getSurfaceFromPoints(this.terrainPoints, holeGapEnd).point;
    if (leftPoints.length) leftPoints.push(leftEdge);
    if (rightPoints.length) rightPoints.unshift(rightEdge);

    const drawSegment = (points: Point[]): void => {
      if (points.length < 2) return;
      this.ctx.fillStyle = hillColor;
      this.ctx.beginPath();
      this.ctx.moveTo(points[0].x, points[0].y);
      for (const point of points) {
        this.ctx.lineTo(point.x, point.y);
      }
      this.ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y + 500);
      this.ctx.lineTo(points[0].x, points[0].y + 500);
      this.ctx.closePath();
      this.ctx.fill();

      this.ctx.fillStyle = groundColor;
      this.ctx.beginPath();
      this.ctx.moveTo(points[0].x, points[0].y + 20);
      for (const point of points) {
        this.ctx.lineTo(point.x, point.y + 20);
      }
      this.ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y + 500);
      this.ctx.lineTo(points[0].x, points[0].y + 500);
      this.ctx.closePath();
      this.ctx.fill();
    };

    drawSegment(leftPoints);
    drawSegment(rightPoints);

    this.ctx.strokeStyle = "rgba(0, 100, 0, 0.3)";
    this.ctx.lineWidth = 2;
    for (const blade of this.terrainGrass) {
      this.ctx.beginPath();
      this.ctx.moveTo(blade.x, blade.y);
      this.ctx.lineTo(blade.x + blade.tilt, blade.y - blade.height);
      this.ctx.stroke();
    }
  }

  private drawHazards(): void {
    for (const zone of this.waterZones) {
      this.ctx.fillStyle = "#4FC3F7";
      this.ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
      this.ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(zone.x, zone.y);
      this.ctx.lineTo(zone.x + zone.width, zone.y);
      this.ctx.stroke();
    }

    for (const zone of this.sandZones) {
      this.ctx.fillStyle = "#DEB887";
      this.ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
    }

    for (const bouncer of this.bouncers) {
      this.drawRectBody(bouncer, "#FF5722", "#D84315");
    }
  }

  private drawObstacles(): void {
    for (const rect of this.staticRects) {
      this.drawRectBody(rect, "#757575", "#424242");
    }
    for (const circle of this.staticCircles) {
      this.drawCircleBody(circle, "#757575", "#424242");
    }
    for (const obs of this.movingObstacles) {
      if (obs.rect) {
        this.drawRectBody(obs.rect, "#E91E63", "#AD1457");
      } else if (obs.circle) {
        this.drawCircleBody(obs.circle, "#E91E63", "#AD1457");
      }
    }
    for (const platform of this.platforms) {
      this.drawRectBody(platform, "#4CAF50", "#2E7D32");
    }
  }

  private drawRectBody(body: RectBody, color: string, darkColor: string): void {
    this.ctx.save();
    this.ctx.translate(body.x, body.y);
    this.ctx.rotate(body.angle);

    this.ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    this.ctx.fillRect(-body.width / 2 + 3, -body.height / 2 + 3, body.width, body.height);

    this.ctx.fillStyle = color;
    this.ctx.fillRect(-body.width / 2, -body.height / 2, body.width, body.height);

    this.ctx.strokeStyle = darkColor;
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(-body.width / 2, -body.height / 2, body.width, body.height);
    this.ctx.restore();
  }

  private drawCircleBody(body: CircleBody, color: string, darkColor: string): void {
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    this.ctx.beginPath();
    this.ctx.arc(body.x + 3, body.y + 3, body.radius, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(body.x, body.y, body.radius, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.strokeStyle = darkColor;
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
  }

  private drawHole(): void {
    if (!this.currentLevel || !this.holeSurface) return;

    const holeX = this.holeSurface.point.x;
    const holeY = this.holeSurface.point.y;
    const depth = CONFIG.HOLE_DEPTH;
    const gapHalf = CONFIG.HOLE_RADIUS * CONFIG.HOLE_GAP_SCALE;

    const shaftGradient = this.ctx.createLinearGradient(holeX, holeY, holeX, holeY + depth);
    shaftGradient.addColorStop(0, "#3a2416");
    shaftGradient.addColorStop(1, "#1c110b");
    this.ctx.fillStyle = shaftGradient;
    this.ctx.beginPath();
    this.ctx.moveTo(holeX - gapHalf, holeY + 1);
    this.ctx.lineTo(holeX + gapHalf, holeY + 1);
    this.ctx.lineTo(holeX + gapHalf - 2, holeY + depth);
    this.ctx.lineTo(holeX - gapHalf + 2, holeY + depth);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.fillStyle = "#150e09";
    this.ctx.fillRect(holeX - gapHalf + 1, holeY + depth, gapHalf * 2 - 2, 600);

    this.ctx.fillStyle = "#0c0c0c";
    this.ctx.beginPath();
    this.ctx.ellipse(holeX, holeY + depth, CONFIG.HOLE_RADIUS * 0.85, 6, 0, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = "#000";
    this.ctx.beginPath();
    this.ctx.ellipse(holeX, holeY + 2, CONFIG.HOLE_RADIUS, 5.5, 0, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.strokeStyle = "#8B4513";
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(holeX, holeY + 2);
    this.ctx.lineTo(holeX, holeY - 60);
    this.ctx.stroke();

    const time = Date.now() / 200;
    const wave = Math.sin(time) * 3;
    this.ctx.fillStyle = "#FF5722";
    this.ctx.beginPath();
    this.ctx.moveTo(holeX, holeY - 60);
    this.ctx.quadraticCurveTo(holeX + 20 + wave, holeY - 50, holeX + 35 + wave * 1.5, holeY - 45);
    this.ctx.quadraticCurveTo(holeX + 20 + wave, holeY - 40, holeX, holeY - 35);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.strokeStyle = "#E64A19";
    this.ctx.lineWidth = 1;
    this.ctx.stroke();
  }

  private drawBall(): void {
    if (!this.ball) return;
    const pos = this.ball;
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    this.ctx.beginPath();
    this.ctx.ellipse(pos.x + 4, pos.y + 6, CONFIG.BALL_RADIUS - 1, 4, 0, 0, Math.PI * 2);
    this.ctx.fill();

    const gradient = this.ctx.createRadialGradient(
      pos.x - CONFIG.BALL_RADIUS * 0.4,
      pos.y - CONFIG.BALL_RADIUS * 0.4,
      2,
      pos.x,
      pos.y,
      CONFIG.BALL_RADIUS
    );
    gradient.addColorStop(0, "#fff");
    gradient.addColorStop(1, "#e0e0e0");
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(pos.x, pos.y, CONFIG.BALL_RADIUS, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = "rgba(200, 200, 200, 0.5)";
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const dx = Math.cos(angle) * CONFIG.BALL_RADIUS * 0.5;
      const dy = Math.sin(angle) * CONFIG.BALL_RADIUS * 0.5;
      this.ctx.beginPath();
      this.ctx.arc(pos.x + dx, pos.y + dy, 2, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    this.ctx.beginPath();
    this.ctx.arc(pos.x - 3, pos.y - 3, 4, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private updateAim(dt: number): void {
    if (!this.ball || !this.aimTarget) return;
    if (!this.aimBallPos) {
      this.aimBallPos = { x: this.ball.x, y: this.ball.y };
    }
    const smoothing = 1 - Math.pow(1 - 0.22, dt * 60);
    this.aimBallPos.x = lerp(this.aimBallPos.x, this.aimTarget.x, smoothing);
    this.aimBallPos.y = lerp(this.aimBallPos.y, this.aimTarget.y, smoothing);
    this.ball.x = this.aimBallPos.x;
    this.ball.y = this.aimBallPos.y;
    this.ball.vx = 0;
    this.ball.vy = 0;
  }

  private drawSlingshot(): void {
    if (!this.ball || !this.slingshotAnchor) return;
    const ballPos = this.ball;
    const anchor = this.slingshotAnchor;

    this.ctx.strokeStyle = "#8B4513";
    this.ctx.lineWidth = 4;
    this.ctx.lineCap = "round";

    this.ctx.beginPath();
    this.ctx.moveTo(anchor.x - 10, anchor.y);
    this.ctx.lineTo(ballPos.x, ballPos.y);
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(anchor.x + 10, anchor.y);
    this.ctx.lineTo(ballPos.x, ballPos.y);
    this.ctx.stroke();

    this.ctx.fillStyle = "#5D4037";
    this.ctx.beginPath();
    this.ctx.arc(anchor.x - 10, anchor.y, 6, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.beginPath();
    this.ctx.arc(anchor.x + 10, anchor.y, 6, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private drawTrajectory(): void {
    if (!this.ball || !this.slingshotAnchor || this.pullDistance < 10) return;

    const dx = this.slingshotAnchor.x - this.ball.x;
    const dy = this.slingshotAnchor.y - this.ball.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return;

    const power = Math.min(1, dist / CONFIG.MAX_PULL_DISTANCE);
    const easedPower = Math.pow(power, 1.25);
    const launchSpeed = CONFIG.MIN_LAUNCH_SPEED + easedPower * (CONFIG.MAX_LAUNCH_SPEED - CONFIG.MIN_LAUNCH_SPEED);
    let vx = (dx / dist) * launchSpeed;
    let vy = (dy / dist) * launchSpeed;
    let x = this.ball.x;
    let y = this.ball.y;

    this.ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    for (let i = 0; i < CONFIG.TRAJECTORY_DOTS; i++) {
      for (let j = 0; j < CONFIG.TRAJECTORY_STEP; j++) {
        vy += CONFIG.GRAVITY * (1 / 60);
        x += vx * (1 / 60);
        y += vy * (1 / 60);
      }

      const alpha = 1 - i / CONFIG.TRAJECTORY_DOTS;
      this.ctx.globalAlpha = alpha * 0.6;
      this.ctx.beginPath();
      this.ctx.arc(x, y, 4 * alpha + 2, 0, Math.PI * 2);
      this.ctx.fill();

      if (y > this.worldBounds.maxY + 300) break;
    }

    this.ctx.globalAlpha = 1;
  }

  private getPointerWorld(clientX: number, clientY: number): Point {
    const rect = this.canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    return { x: localX + this.cameraX, y: localY + this.cameraY };
  }

  private adjustColor(color: string, amount: number): string {
    const hex = color.replace("#", "");
    const r = Math.max(0, Math.min(255, parseInt(hex.substring(0, 2), 16) + amount));
    const g = Math.max(0, Math.min(255, parseInt(hex.substring(2, 4), 16) + amount));
    const b = Math.max(0, Math.min(255, parseInt(hex.substring(4, 6), 16) + amount));
    return "#" + [r, g, b].map(c => c.toString(16).padStart(2, "0")).join("");
  }

  // ============= AUDIO =============
  private initAudio(): void {
    if (this.audioContext) return;
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      console.log("[SlingshotGolfGame.initAudio]", "Audio context initialized");
    } catch (e) {
      console.log("[SlingshotGolfGame.initAudio]", "Failed to init", e);
    }
  }

  private playSound(type: "click" | "swing" | "splash" | "hole" | "fail"): void {
    if (!this.settings.fx || !this.audioContext) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    if (type === "click") {
      oscillator.frequency.value = 700;
      oscillator.type = "sine";
      gainNode.gain.setValueAtTime(0.1, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      oscillator.start(now);
      oscillator.stop(now + 0.05);
    } else if (type === "swing") {
      oscillator.frequency.setValueAtTime(200, now);
      oscillator.frequency.exponentialRampToValueAtTime(800, now + 0.2);
      oscillator.type = "sawtooth";
      gainNode.gain.setValueAtTime(0.15, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      oscillator.start(now);
      oscillator.stop(now + 0.25);
    } else if (type === "splash") {
      oscillator.frequency.setValueAtTime(120, now);
      oscillator.frequency.exponentialRampToValueAtTime(60, now + 0.3);
      oscillator.type = "triangle";
      gainNode.gain.setValueAtTime(0.2, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      oscillator.start(now);
      oscillator.stop(now + 0.3);
    } else if (type === "hole") {
      const freqs = [440, 554, 659];
      freqs.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.1, now + index * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.01, now + index * 0.08 + 0.15);
        osc.start(now + index * 0.08);
        osc.stop(now + index * 0.08 + 0.2);
      });
    } else if (type === "fail") {
      const freqs = [660, 520, 440];
      freqs.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = "triangle";
        gain.gain.setValueAtTime(0.1, now + index * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.01, now + index * 0.08 + 0.15);
        osc.start(now + index * 0.08);
        osc.stop(now + index * 0.08 + 0.2);
      });
    }
  }

  private triggerHaptic(type: "light" | "medium" | "heavy" | "success" | "error"): void {
    if (!this.settings.haptics) return;
    if (typeof (window as any).triggerHaptic === "function") {
      (window as any).triggerHaptic(type);
    }
  }

  private submitScore(score: number): void {
    console.log("[SlingshotGolfGame.submitScore]", score);
    if (typeof (window as any).submitScore === "function") {
      (window as any).submitScore(score);
    }
  }

  // ============= SETTINGS =============
  private loadSettings(): void {
    try {
      const saved = localStorage.getItem("slingshot-golf-settings");
      if (saved) {
        this.settings = { ...this.settings, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.log("[SlingshotGolfGame.loadSettings]", "Failed to load", e);
    }

    document.getElementById("toggle-music")!.classList.toggle("active", this.settings.music);
    document.getElementById("toggle-fx")!.classList.toggle("active", this.settings.fx);
    document.getElementById("toggle-haptics")!.classList.toggle("active", this.settings.haptics);
  }

  private saveSettings(): void {
    try {
      localStorage.setItem("slingshot-golf-settings", JSON.stringify(this.settings));
    } catch (e) {
      console.log("[SlingshotGolfGame.saveSettings]", "Failed to save", e);
    }
  }

  private loadProgress(): void {
    const saved = localStorage.getItem("slingshot-golf-unlocked");
    if (saved) {
      const value = parseInt(saved, 10);
      if (!Number.isNaN(value)) {
        this.unlockedLevels = value;
      }
    }
  }

  private saveProgress(): void {
    localStorage.setItem("slingshot-golf-unlocked", this.unlockedLevels.toString());
  }

  private openSettings(): void {
    this.settingsPanel.classList.add("visible");
    this.settingsOverlay.classList.add("visible");
  }

  private closeSettings(): void {
    this.settingsPanel.classList.remove("visible");
    this.settingsOverlay.classList.remove("visible");
  }
}

// ============= INITIALIZE =============
window.addEventListener("DOMContentLoaded", () => {
  console.log("[main]", "Initializing Slingshot Golf");
  new SlingshotGolfGame();
});
