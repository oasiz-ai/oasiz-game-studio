// Finger Flow - Don't Lift Your Finger!
// A beautiful infinite scroller with incredible game feel

interface PathSegment {
  y: number;
  centerX: number;
  width: number;
  targetCenterX: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
  type: "explosion" | "trail" | "wall" | "star" | "speedline" | "spark" | "ring";
  rotation?: number;
  rotationSpeed?: number;
}

interface TrailPoint {
  x: number;
  y: number;
  age: number;
  size: number;
}

interface Star {
  x: number;
  y: number;
  collected: boolean;
  pulse: number;
  type: "star" | "shield" | "slowmo";
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  scale: number;
}

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

type GameState = "START" | "PLAYING" | "GAME_OVER" | "DYING";

class FingerFlowGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number = 0;
  private height: number = 0;

  // Game state
  private gameState: GameState = "START";
  private score: number = 0;
  private distance: number = 0;
  private combo: number = 0;
  private maxCombo: number = 0;
  private comboTimer: number = 0;
  private perfectCenterBonus: number = 0;
  private shieldActive: boolean = false;
  private shieldTimer: number = 0;
  private slowMoActive: boolean = false;
  private slowMoTimer: number = 0;

  // Path generation
  private pathSegments: PathSegment[] = [];
  private segmentHeight: number = 15;
  private basePathWidth: number = 220;
  private minPathWidth: number = 70;
  private scrollSpeed: number = 0;
  private targetScrollSpeed: number = 4;
  private maxScrollSpeed: number = 14;

  // Player state
  private isPressed: boolean = false;
  private playerX: number = 0;
  private playerY: number = 0;
  private wasEverPressed: boolean = false;
  private graceTime: number = 0;
  private graceDuration: number = 800;
  private lastPlayerX: number = 0;
  private lastPlayerY: number = 0;

  // Visual effects
  private trail: TrailPoint[] = [];
  private particles: Particle[] = [];
  private stars: Star[] = [];
  private floatingTexts: FloatingText[] = [];
  private hue: number = 200;
  private targetHue: number = 200;
  private lastMilestone: number = 0;
  private milestoneText: string = "";
  private milestoneTimer: number = 0;

  // Camera & Screen effects
  private cameraShakeX: number = 0;
  private cameraShakeY: number = 0;
  private cameraShakeIntensity: number = 0;
  private cameraOffsetX: number = 0;
  private cameraOffsetY: number = 0;
  private cameraZoom: number = 1;
  private targetCameraZoom: number = 1;
  private screenFlash: number = 0;
  private screenFlashColor: string = "#fff";
  private slowMoFactor: number = 1;
  private pulseEffect: number = 0;
  private dangerLevel: number = 0;
  private chromaticAberration: number = 0;

  // Audio
  private audioContext: AudioContext | null = null;
  private musicOscillator: OscillatorNode | null = null;
  private musicGain: GainNode | null = null;

  // Settings
  private settings: Settings = {
    music: true,
    fx: true,
    haptics: true,
  };

  // UI
  private isMobile: boolean = false;
  private settingsOpen: boolean = false;

  // Animation
  private lastTime: number = 0;
  private time: number = 0;

  // Death
  private deathTimer: number = 0;
  private deathReason: string = "";

  // Wall sparks
  private lastSparkTime: number = 0;

  constructor() {
    console.log("[FingerFlowGame] Initializing game");

    this.canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;

    this.isMobile = window.matchMedia("(pointer: coarse)").matches;
    this.loadSettings();
    this.setupCanvas();
    this.setupEventListeners();
    this.setupUI();
    this.initPath();
    this.initAudio();

    this.lastTime = performance.now();
    this.gameLoop();
  }

  private initAudio(): void {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.log("[initAudio] Web Audio not supported");
    }
  }

  private startBackgroundMusic(): void {
    if (!this.settings.music || !this.audioContext) return;
    this.stopBackgroundMusic();

    try {
      // Create a subtle ambient drone
      this.musicGain = this.audioContext.createGain();
      this.musicGain.gain.setValueAtTime(0, this.audioContext.currentTime);
      this.musicGain.gain.linearRampToValueAtTime(0.03, this.audioContext.currentTime + 2);
      this.musicGain.connect(this.audioContext.destination);

      this.musicOscillator = this.audioContext.createOscillator();
      this.musicOscillator.type = "sine";
      this.musicOscillator.frequency.setValueAtTime(80, this.audioContext.currentTime);
      this.musicOscillator.connect(this.musicGain);
      this.musicOscillator.start();

      // Add a second oscillator for texture
      const osc2 = this.audioContext.createOscillator();
      const gain2 = this.audioContext.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(120, this.audioContext.currentTime);
      gain2.gain.setValueAtTime(0.015, this.audioContext.currentTime);
      osc2.connect(gain2);
      gain2.connect(this.audioContext.destination);
      osc2.start();
    } catch (e) {
      // Ignore
    }
  }

  private stopBackgroundMusic(): void {
    try {
      if (this.musicOscillator) {
        this.musicOscillator.stop();
        this.musicOscillator = null;
      }
      if (this.musicGain) {
        this.musicGain = null;
      }
    } catch (e) {
      // Ignore
    }
  }

  private playSound(type: "collect" | "powerup" | "milestone" | "death" | "start" | "perfect" | "warning"): void {
    if (!this.settings.fx || !this.audioContext) return;

    const ctx = this.audioContext;
    const now = ctx.currentTime;

    try {
      if (type === "collect") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(600 + this.combo * 40, now);
        osc.frequency.exponentialRampToValueAtTime(1000 + this.combo * 60, now + 0.08);
        osc.type = "sine";
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === "powerup") {
        // Magical powerup sound
        [0, 0.05, 0.1, 0.15].forEach((delay, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.setValueAtTime([400, 500, 600, 800][i], now + delay);
          osc.type = "sine";
          gain.gain.setValueAtTime(0.1, now + delay);
          gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.2);
          osc.start(now + delay);
          osc.stop(now + delay + 0.2);
        });
      } else if (type === "milestone") {
        [0, 0.08, 0.16].forEach((delay, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.setValueAtTime([523, 659, 784][i], now + delay);
          osc.type = "sine";
          gain.gain.setValueAtTime(0.12, now + delay);
          gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.25);
          osc.start(now + delay);
          osc.stop(now + delay + 0.25);
        });
      } else if (type === "death") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.6);
        osc.type = "sawtooth";
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.6);
      } else if (type === "start") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.12);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === "perfect") {
        // Sparkly perfect sound
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(1800, now + 0.05);
        osc.type = "sine";
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === "warning") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(200, now);
        osc.type = "square";
        gain.gain.setValueAtTime(0.03, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      }
    } catch (e) {
      // Ignore
    }
  }

  private loadSettings(): void {
    const saved = localStorage.getItem("fingerflow-settings");
    if (saved) {
      try {
        this.settings = { ...this.settings, ...JSON.parse(saved) };
      } catch (e) {
        console.log("[loadSettings] Failed to parse settings");
      }
    }
  }

  private saveSettings(): void {
    localStorage.setItem("fingerflow-settings", JSON.stringify(this.settings));
  }

  private setupCanvas(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.basePathWidth = Math.min(this.width * 0.55, 280);
    this.minPathWidth = Math.max(this.width * 0.12, 50);
  }

  private setupEventListeners(): void {
    window.addEventListener("resize", () => this.handleResize());

    this.canvas.addEventListener("mousedown", (e) => this.handlePointerDown(e.clientX, e.clientY));
    this.canvas.addEventListener("mousemove", (e) => this.handlePointerMove(e.clientX, e.clientY));
    this.canvas.addEventListener("mouseup", () => this.handlePointerUp());
    this.canvas.addEventListener("mouseleave", () => this.handlePointerUp());

    this.canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.handlePointerDown(touch.clientX, touch.clientY);
    });
    this.canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.handlePointerMove(touch.clientX, touch.clientY);
    });
    this.canvas.addEventListener("touchend", (e) => {
      e.preventDefault();
      this.handlePointerUp();
    });
    this.canvas.addEventListener("touchcancel", (e) => {
      e.preventDefault();
      this.handlePointerUp();
    });
  }

  private setupUI(): void {
    const settingsBtn = document.getElementById("settingsBtn");
    const settingsPanel = document.getElementById("settingsPanel");
    const closeSettings = document.getElementById("closeSettings");
    const musicToggle = document.getElementById("musicToggle") as HTMLInputElement;
    const fxToggle = document.getElementById("fxToggle") as HTMLInputElement;
    const hapticsToggle = document.getElementById("hapticsToggle") as HTMLInputElement;

    if (musicToggle) musicToggle.checked = this.settings.music;
    if (fxToggle) fxToggle.checked = this.settings.fx;
    if (hapticsToggle) hapticsToggle.checked = this.settings.haptics;

    settingsBtn?.addEventListener("click", () => {
      this.settingsOpen = true;
      settingsPanel?.classList.add("open");
      this.triggerHaptic("light");
    });

    closeSettings?.addEventListener("click", () => {
      this.settingsOpen = false;
      settingsPanel?.classList.remove("open");
      this.triggerHaptic("light");
    });

    musicToggle?.addEventListener("change", () => {
      this.settings.music = musicToggle.checked;
      this.saveSettings();
      this.triggerHaptic("light");
      if (!this.settings.music) this.stopBackgroundMusic();
    });

    fxToggle?.addEventListener("change", () => {
      this.settings.fx = fxToggle.checked;
      this.saveSettings();
      this.triggerHaptic("light");
    });

    hapticsToggle?.addEventListener("change", () => {
      this.settings.haptics = hapticsToggle.checked;
      this.saveSettings();
      this.triggerHaptic("light");
    });
  }

  private handleResize(): void {
    this.setupCanvas();
    if (this.gameState === "START") {
      this.initPath();
    }
  }

  private handlePointerDown(x: number, y: number): void {
    if (this.settingsOpen) return;

    if (this.audioContext?.state === "suspended") {
      this.audioContext.resume();
    }

    this.playerX = x;
    this.playerY = y;
    this.lastPlayerX = x;
    this.lastPlayerY = y;
    this.isPressed = true;

    if (this.gameState === "START") {
      this.startGame();
    } else if (this.gameState === "GAME_OVER") {
      this.resetGame();
    }

    this.wasEverPressed = true;
    this.triggerHaptic("light");
  }

  private handlePointerMove(x: number, y: number): void {
    if (this.settingsOpen) return;

    this.lastPlayerX = this.playerX;
    this.lastPlayerY = this.playerY;
    this.playerX = x;
    this.playerY = y;

    if (this.isPressed && (this.gameState === "PLAYING" || this.gameState === "DYING")) {
      const speed = Math.sqrt(
        Math.pow(x - this.lastPlayerX, 2) + Math.pow(y - this.lastPlayerY, 2)
      );
      this.trail.push({
        x,
        y,
        age: 0,
        size: Math.min(14, 4 + speed * 0.35),
      });
      if (this.trail.length > 100) {
        this.trail.shift();
      }

      // Spawn trail sparkles when moving fast
      if (speed > 8 && Math.random() < 0.4) {
        this.particles.push({
          x: x + (Math.random() - 0.5) * 10,
          y: y + (Math.random() - 0.5) * 10,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          life: 1,
          maxLife: 1,
          size: 2 + Math.random() * 2,
          hue: this.hue,
          type: "spark",
        });
      }
    }
  }

  private handlePointerUp(): void {
    if (this.settingsOpen) return;

    if (this.isPressed && this.gameState === "PLAYING" && this.wasEverPressed && this.graceTime <= 0) {
      if (!this.shieldActive) {
        console.log("[handlePointerUp] Finger lifted - game over!");
        this.startDeath("You lifted your finger!");
      }
    }
    this.isPressed = false;
  }

  private initPath(): void {
    this.pathSegments = [];
    const numSegments = Math.ceil(this.height / this.segmentHeight) + 40;
    let centerX = this.width / 2;

    for (let i = 0; i < numSegments; i++) {
      const y = this.height - i * this.segmentHeight;
      this.pathSegments.push({
        y,
        centerX,
        width: this.basePathWidth,
        targetCenterX: centerX,
      });
    }
  }

  private spawnCollectibles(): void {
    if (this.gameState !== "PLAYING") return;

    // Regular stars
    if (Math.random() < 0.025) {
      const topSegment = this.pathSegments[this.pathSegments.length - 1];
      if (topSegment) {
        this.stars.push({
          x: topSegment.centerX + (Math.random() - 0.5) * topSegment.width * 0.5,
          y: topSegment.y,
          collected: false,
          pulse: Math.random() * Math.PI * 2,
          type: "star",
        });
      }
    }

    // Power-ups (rarer)
    if (Math.random() < 0.003 && this.distance > 500) {
      const topSegment = this.pathSegments[this.pathSegments.length - 1];
      if (topSegment) {
        const powerupType = Math.random() < 0.5 ? "shield" : "slowmo";
        this.stars.push({
          x: topSegment.centerX + (Math.random() - 0.5) * topSegment.width * 0.3,
          y: topSegment.y,
          collected: false,
          pulse: Math.random() * Math.PI * 2,
          type: powerupType,
        });
      }
    }
  }

  private startGame(): void {
    console.log("[startGame] Starting new game");
    this.gameState = "PLAYING";
    this.score = 0;
    this.distance = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.comboTimer = 0;
    this.perfectCenterBonus = 0;
    this.scrollSpeed = 0;
    this.targetScrollSpeed = 4;
    this.trail = [];
    this.particles = [];
    this.stars = [];
    this.floatingTexts = [];
    this.hue = 200;
    this.targetHue = 200;
    this.wasEverPressed = false;
    this.graceTime = this.graceDuration;
    this.lastMilestone = 0;
    this.milestoneText = "";
    this.milestoneTimer = 0;
    this.dangerLevel = 0;
    this.slowMoFactor = 1;
    this.deathTimer = 0;
    this.shieldActive = false;
    this.shieldTimer = 0;
    this.slowMoActive = false;
    this.slowMoTimer = 0;
    this.chromaticAberration = 0;
    this.cameraZoom = 1;
    this.targetCameraZoom = 1;

    this.initPath();

    // Center path on player
    if (this.pathSegments.length > 0) {
      for (let i = 0; i < this.pathSegments.length; i++) {
        const t = Math.min(1, i / 30);
        const targetX = this.playerX + (this.width / 2 - this.playerX) * t;
        this.pathSegments[i].centerX = targetX;
        this.pathSegments[i].targetCenterX = targetX;
      }
    }

    this.screenFlash = 0.3;
    this.screenFlashColor = "#4ade80";
    this.playSound("start");
    this.triggerHaptic("medium");
    this.startBackgroundMusic();

    const startScreen = document.getElementById("startScreen");
    if (startScreen) startScreen.style.display = "none";

    const gameOverScreen = document.getElementById("gameOverScreen");
    if (gameOverScreen) gameOverScreen.style.display = "none";
  }

  private resetGame(): void {
    this.initPath();
    this.startGame();
  }

  private startDeath(reason: string): void {
    if (this.gameState === "DYING") return;

    console.log("[startDeath] Starting death sequence:", reason);
    this.gameState = "DYING";
    this.deathReason = reason;
    this.deathTimer = 0;
    this.slowMoFactor = 0.08;
    this.chromaticAberration = 15;
    this.stopBackgroundMusic();

    // Massive explosion
    for (let i = 0; i < 100; i++) {
      const angle = (Math.PI * 2 * i) / 100 + Math.random() * 0.3;
      const speed = 2 + Math.random() * 10;
      this.particles.push({
        x: this.playerX,
        y: this.playerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: 1,
        size: 2 + Math.random() * 8,
        hue: this.hue + Math.random() * 60 - 30,
        type: "explosion",
      });
    }

    // Expanding ring
    this.particles.push({
      x: this.playerX,
      y: this.playerY,
      vx: 0,
      vy: 0,
      life: 1,
      maxLife: 1,
      size: 10,
      hue: this.hue,
      type: "ring",
    });

    this.cameraShakeIntensity = 35;
    this.screenFlash = 1;
    this.screenFlashColor = "#ff4466";

    this.playSound("death");
    this.triggerHaptic("error");
  }

  private finishDeath(): void {
    console.log("[finishDeath] Game over");
    this.gameState = "GAME_OVER";
    this.submitScore();

    setTimeout(() => {
      const gameOverScreen = document.getElementById("gameOverScreen");
      const finalScore = document.getElementById("finalScore");
      const deathReason = document.getElementById("deathReason");
      const comboDisplay = document.getElementById("maxCombo");

      if (gameOverScreen) gameOverScreen.style.display = "flex";
      if (finalScore) finalScore.textContent = Math.floor(this.score).toString();
      if (deathReason) deathReason.textContent = this.deathReason;
      if (comboDisplay) comboDisplay.textContent = "Max Combo: " + this.maxCombo + "x";
    }, 200);
  }

  private submitScore(): void {
    console.log("[submitScore] Submitting score:", Math.floor(this.score));
    if (typeof (window as any).submitScore === "function") {
      (window as any).submitScore(Math.floor(this.score));
    }
  }

  private triggerHaptic(type: string): void {
    if (this.settings.haptics && typeof (window as any).triggerHaptic === "function") {
      (window as any).triggerHaptic(type);
    }
  }

  private addCameraShake(intensity: number): void {
    this.cameraShakeIntensity = Math.max(this.cameraShakeIntensity, intensity);
  }

  private addFloatingText(x: number, y: number, text: string, color: string): void {
    this.floatingTexts.push({
      x,
      y,
      text,
      color,
      life: 1,
      scale: 1.5,
    });
  }

  private roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    if (w < 0 || h < 0) return;
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  private update(dt: number): void {
    // Apply slow-mo or power-up slowmo
    let effectiveSlowMo = this.slowMoFactor;
    if (this.slowMoActive && this.gameState === "PLAYING") {
      effectiveSlowMo *= 0.5;
    }
    const effectiveDt = dt * effectiveSlowMo;
    this.time += effectiveDt;

    // Update camera effects
    this.updateCamera(dt);

    // Update visual effects
    this.updateParticles(effectiveDt);
    this.updateTrail(effectiveDt);
    this.updateFloatingTexts(effectiveDt);

    // Fade screen flash
    this.screenFlash *= 0.88;
    if (this.screenFlash < 0.01) this.screenFlash = 0;

    // Fade chromatic aberration
    this.chromaticAberration *= 0.92;
    if (this.chromaticAberration < 0.1) this.chromaticAberration = 0;

    // Ease slow-mo back to normal
    if (this.gameState === "PLAYING") {
      this.slowMoFactor += (1 - this.slowMoFactor) * 0.08;
    }

    // Update power-up timers
    if (this.shieldActive) {
      this.shieldTimer -= effectiveDt;
      if (this.shieldTimer <= 0) {
        this.shieldActive = false;
        this.addFloatingText(this.playerX, this.playerY - 40, "Shield Off", "#888");
      }
    }

    if (this.slowMoActive) {
      this.slowMoTimer -= dt; // Use real dt, not slowed
      if (this.slowMoTimer <= 0) {
        this.slowMoActive = false;
        this.addFloatingText(this.playerX, this.playerY - 40, "Time Normal", "#888");
      }
    }

    // Milestone timer
    if (this.milestoneTimer > 0) {
      this.milestoneTimer -= effectiveDt;
    }

    // Handle death sequence
    if (this.gameState === "DYING") {
      this.deathTimer += dt;
      this.slowMoFactor += (0.25 - this.slowMoFactor) * 0.03;

      if (this.deathTimer > 1000) {
        this.finishDeath();
      }
      return;
    }

    if (this.gameState !== "PLAYING") return;
    if (!this.isPressed) return;

    // Decrease grace time
    if (this.graceTime > 0) {
      this.graceTime -= effectiveDt;
    }

    // Smooth scroll speed ramp-up
    const speedMult = effectiveDt / 16.67;
    this.scrollSpeed += (this.targetScrollSpeed - this.scrollSpeed) * 0.05;

    // Update distance and score
    this.distance += this.scrollSpeed * speedMult;
    const comboMultiplier = 1 + this.combo * 0.15;
    this.score += this.scrollSpeed * speedMult * 0.5 * comboMultiplier;

    // Check perfect center bonus
    this.checkPerfectCenter();

    // Camera zoom based on speed
    this.targetCameraZoom = 1 - (this.scrollSpeed - 4) / 40;
    this.cameraZoom += (this.targetCameraZoom - this.cameraZoom) * 0.02;

    // Gradually increase speed
    this.targetScrollSpeed = Math.min(this.maxScrollSpeed, 4 + this.distance * 0.0008);

    // Update combo timer
    if (this.comboTimer > 0) {
      this.comboTimer -= effectiveDt;
      if (this.comboTimer <= 0) {
        if (this.combo > 0) {
          this.addFloatingText(this.playerX, this.playerY - 50, "Combo Lost!", "#ff6b6b");
        }
        this.combo = 0;
      }
    }

    // Update hue
    this.targetHue = (200 + this.distance * 0.06) % 360;
    this.hue += (this.targetHue - this.hue) * 0.015;

    // Scroll path
    for (const segment of this.pathSegments) {
      segment.y += this.scrollSpeed * speedMult;
    }

    // Scroll stars
    for (const star of this.stars) {
      star.y += this.scrollSpeed * speedMult;
      star.pulse += effectiveDt * 0.005;
    }

    // Path management
    while (this.pathSegments.length > 0 && this.pathSegments[0].y > this.height + this.segmentHeight) {
      this.pathSegments.shift();
    }

    while (this.pathSegments.length > 0) {
      const topSegment = this.pathSegments[this.pathSegments.length - 1];
      if (topSegment.y > -this.segmentHeight * 2) {
        this.addNewPathSegment();
      } else {
        break;
      }
    }

    // Remove off-screen stars
    this.stars = this.stars.filter((s) => s.y < this.height + 50);

    // Spawn collectibles
    this.spawnCollectibles();

    // Check star collection
    this.checkStarCollection();

    // Check collision
    this.checkCollision();

    // Check milestones
    this.checkMilestones();

    // Spawn speed lines
    if (this.scrollSpeed > 7 && Math.random() < 0.35) {
      this.particles.push({
        x: Math.random() * this.width,
        y: -20,
        vx: 0,
        vy: this.scrollSpeed * 4,
        life: 1,
        maxLife: 1,
        size: 1 + Math.random(),
        hue: this.hue,
        type: "speedline",
      });
    }

    // Spawn wall sparks periodically
    if (this.time - this.lastSparkTime > 100 && Math.random() < 0.15) {
      this.spawnWallSparks();
      this.lastSparkTime = this.time;
    }

    // Update danger pulse
    this.pulseEffect *= 0.94;
  }

  private checkPerfectCenter(): void {
    const playerSegmentIndex = this.pathSegments.findIndex((s) => {
      return this.playerY >= s.y && this.playerY < s.y + this.segmentHeight;
    });

    if (playerSegmentIndex === -1) return;

    const segment = this.pathSegments[playerSegmentIndex];
    const distFromCenter = Math.abs(this.playerX - segment.centerX);
    const perfectZone = segment.width * 0.1;

    if (distFromCenter < perfectZone) {
      this.perfectCenterBonus += 0.1;
      if (this.perfectCenterBonus >= 10) {
        this.perfectCenterBonus = 0;
        this.score += 25;
        this.addFloatingText(this.playerX, this.playerY - 30, "+25 PERFECT!", "#ffd700");
        this.playSound("perfect");
        this.pulseEffect = 0.5;

        // Small sparkle burst
        for (let i = 0; i < 8; i++) {
          const angle = (Math.PI * 2 * i) / 8;
          this.particles.push({
            x: this.playerX,
            y: this.playerY,
            vx: Math.cos(angle) * 2,
            vy: Math.sin(angle) * 2,
            life: 1,
            maxLife: 1,
            size: 2,
            hue: 50,
            type: "spark",
          });
        }
      }
    } else {
      this.perfectCenterBonus = Math.max(0, this.perfectCenterBonus - 0.05);
    }
  }

  private spawnWallSparks(): void {
    // Find visible segments near middle of screen
    const midY = this.height / 2;
    const segment = this.pathSegments.find((s) => Math.abs(s.y - midY) < 50);
    if (!segment) return;

    const side = Math.random() < 0.5 ? -1 : 1;
    const wallX = segment.centerX + (segment.width / 2) * side;

    this.particles.push({
      x: wallX,
      y: segment.y + Math.random() * 30,
      vx: -side * (1 + Math.random() * 2),
      vy: -1 - Math.random() * 2,
      life: 1,
      maxLife: 1,
      size: 2 + Math.random() * 2,
      hue: side > 0 ? (this.hue + 50) % 360 : this.hue,
      type: "spark",
    });
  }

  private updateCamera(dt: number): void {
    this.cameraShakeIntensity *= 0.88;
    if (this.cameraShakeIntensity < 0.1) this.cameraShakeIntensity = 0;

    this.cameraShakeX = (Math.random() - 0.5) * this.cameraShakeIntensity;
    this.cameraShakeY = (Math.random() - 0.5) * this.cameraShakeIntensity;

    if (this.gameState === "PLAYING" || this.gameState === "DYING") {
      const targetOffsetX = (this.playerX - this.width / 2) * 0.04;
      const targetOffsetY = (this.playerY - this.height / 2) * 0.015;
      this.cameraOffsetX += (targetOffsetX - this.cameraOffsetX) * 0.06;
      this.cameraOffsetY += (targetOffsetY - this.cameraOffsetY) * 0.06;
    }
  }

  private updateTrail(dt: number): void {
    for (const point of this.trail) {
      point.age += dt * 0.0018;
    }
    this.trail = this.trail.filter((p) => p.age < 1);
  }

  private updateFloatingTexts(dt: number): void {
    for (const ft of this.floatingTexts) {
      ft.y -= dt * 0.05;
      ft.life -= dt * 0.001;
      ft.scale *= 0.98;
    }
    this.floatingTexts = this.floatingTexts.filter((ft) => ft.life > 0);
  }

  private updateParticles(dt: number): void {
    const speedMult = dt / 16.67;
    for (const p of this.particles) {
      p.x += p.vx * speedMult;
      p.y += p.vy * speedMult;

      if (p.type === "explosion") {
        p.vy += 0.12 * speedMult;
        p.vx *= 0.98;
        p.vy *= 0.98;
      } else if (p.type === "star") {
        p.vy -= 0.04 * speedMult;
      } else if (p.type === "spark") {
        p.vy += 0.05 * speedMult;
        p.vx *= 0.97;
      } else if (p.type === "ring") {
        p.size += 8 * speedMult;
      }

      if (p.rotation !== undefined && p.rotationSpeed !== undefined) {
        p.rotation += p.rotationSpeed * speedMult;
      }

      p.life -= dt * 0.002;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private addNewPathSegment(): void {
    const lastSegment = this.pathSegments[this.pathSegments.length - 1];
    const difficulty = Math.min(1, this.distance / 6000);

    // Interesting path with waves and variation
    const waveInfluence = Math.sin(this.distance * 0.004) * 100 * difficulty;
    const randomWobble = (Math.random() - 0.5) * (70 + difficulty * 140) * 0.025;

    let newTargetX = lastSegment.targetCenterX + randomWobble + waveInfluence * 0.015;

    const padding = this.basePathWidth / 2 + 50;
    newTargetX = Math.max(padding, Math.min(this.width - padding, newTargetX));

    const newCenterX = lastSegment.centerX + (newTargetX - lastSegment.centerX) * 0.1;
    const minWidth = this.minPathWidth;
    const widthRange = this.basePathWidth - minWidth;
    const newWidth = this.basePathWidth - widthRange * difficulty * 0.6;

    this.pathSegments.push({
      y: lastSegment.y - this.segmentHeight,
      centerX: newCenterX,
      width: newWidth,
      targetCenterX: newTargetX,
    });
  }

  private checkStarCollection(): void {
    const collectRadius = 40;
    for (const star of this.stars) {
      if (star.collected) continue;

      const dx = this.playerX - star.x;
      const dy = this.playerY - star.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < collectRadius) {
        star.collected = true;

        if (star.type === "star") {
          this.combo++;
          this.maxCombo = Math.max(this.maxCombo, this.combo);
          this.comboTimer = 3500;
          const points = 50 * this.combo;
          this.score += points;

          this.addFloatingText(star.x, star.y - 20, "+" + points, "#ffd700");

          // Celebration particles
          for (let i = 0; i < 15; i++) {
            const angle = (Math.PI * 2 * i) / 15;
            this.particles.push({
              x: star.x,
              y: star.y,
              vx: Math.cos(angle) * (2 + Math.random() * 2),
              vy: Math.sin(angle) * (2 + Math.random() * 2) - 1,
              life: 1,
              maxLife: 1,
              size: 2 + Math.random() * 3,
              hue: 50,
              type: "star",
            });
          }

          this.playSound("collect");
          this.triggerHaptic("light");
          this.pulseEffect = 0.8;
        } else if (star.type === "shield") {
          this.shieldActive = true;
          this.shieldTimer = 5000;
          this.addFloatingText(star.x, star.y - 20, "SHIELD!", "#4ade80");
          this.screenFlash = 0.3;
          this.screenFlashColor = "#4ade80";
          this.playSound("powerup");
          this.triggerHaptic("success");

          // Green burst
          for (let i = 0; i < 20; i++) {
            const angle = (Math.PI * 2 * i) / 20;
            this.particles.push({
              x: star.x,
              y: star.y,
              vx: Math.cos(angle) * 4,
              vy: Math.sin(angle) * 4,
              life: 1,
              maxLife: 1,
              size: 4,
              hue: 140,
              type: "explosion",
            });
          }
        } else if (star.type === "slowmo") {
          this.slowMoActive = true;
          this.slowMoTimer = 4000;
          this.addFloatingText(star.x, star.y - 20, "SLOW-MO!", "#a78bfa");
          this.screenFlash = 0.3;
          this.screenFlashColor = "#a78bfa";
          this.playSound("powerup");
          this.triggerHaptic("success");

          // Purple burst
          for (let i = 0; i < 20; i++) {
            const angle = (Math.PI * 2 * i) / 20;
            this.particles.push({
              x: star.x,
              y: star.y,
              vx: Math.cos(angle) * 4,
              vy: Math.sin(angle) * 4,
              life: 1,
              maxLife: 1,
              size: 4,
              hue: 280,
              type: "explosion",
            });
          }
        }
      }
    }
  }

  private checkCollision(): void {
    const playerSegmentIndex = this.pathSegments.findIndex((s) => {
      return this.playerY >= s.y && this.playerY < s.y + this.segmentHeight;
    });

    if (playerSegmentIndex === -1) return;

    const segment = this.pathSegments[playerSegmentIndex];
    const halfWidth = segment.width / 2;
    const leftWall = segment.centerX - halfWidth;
    const rightWall = segment.centerX + halfWidth;

    // Check death
    if (this.playerX < leftWall || this.playerX > rightWall) {
      if (this.graceTime <= 0 && !this.shieldActive) {
        console.log("[checkCollision] Hit wall!");
        this.startDeath("You touched the wall!");
        return;
      } else if (this.shieldActive) {
        // Shield absorbs hit
        this.shieldActive = false;
        this.shieldTimer = 0;
        this.addFloatingText(this.playerX, this.playerY - 40, "Shield Used!", "#ff6b6b");
        this.addCameraShake(15);
        this.screenFlash = 0.4;
        this.screenFlashColor = "#ff6b6b";
        this.playSound("warning");
        this.triggerHaptic("heavy");

        // Push back into path
        if (this.playerX < leftWall) {
          this.playerX = leftWall + 20;
        } else {
          this.playerX = rightWall - 20;
        }
      }
    }

    // Calculate danger level
    const distToLeft = this.playerX - leftWall;
    const distToRight = rightWall - this.playerX;
    const minDist = Math.min(distToLeft, distToRight);
    const dangerZone = segment.width * 0.25;

    this.dangerLevel = Math.max(0, 1 - minDist / dangerZone);

    // Near-miss effects
    if (this.dangerLevel > 0.5) {
      this.chromaticAberration = Math.max(this.chromaticAberration, this.dangerLevel * 4);

      if (Math.random() < 0.5) {
        const wallX = distToLeft < distToRight ? leftWall : rightWall;
        this.particles.push({
          x: wallX + (Math.random() - 0.5) * 8,
          y: this.playerY + (Math.random() - 0.5) * 25,
          vx: (this.playerX - wallX) * 0.1,
          vy: -2 - Math.random() * 3,
          life: 1,
          maxLife: 1,
          size: 2 + Math.random() * 3,
          hue: 0,
          type: "wall",
        });
      }

      if (this.dangerLevel > 0.8) {
        this.addCameraShake(3);
        if (Math.random() < 0.1) {
          this.playSound("warning");
        }
        this.triggerHaptic("light");
      }
    }
  }

  private checkMilestones(): void {
    const milestone = Math.floor(this.distance / 500) * 500;
    if (milestone > this.lastMilestone && milestone > 0) {
      this.lastMilestone = milestone;
      this.milestoneText = milestone + "m";
      this.milestoneTimer = 2000;

      this.triggerHaptic("success");
      this.playSound("milestone");

      this.screenFlash = 0.5;
      this.screenFlashColor = "#4ade80";
      this.addCameraShake(10);

      // Big celebration burst
      for (let i = 0; i < 50; i++) {
        const angle = (Math.PI * 2 * i) / 50;
        const speed = 3 + Math.random() * 5;
        this.particles.push({
          x: this.width / 2,
          y: 100,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed + 2,
          life: 1,
          maxLife: 1,
          size: 3 + Math.random() * 4,
          hue: (this.hue + i * 7) % 360,
          type: "explosion",
        });
      }

      // Bonus points
      const bonus = Math.floor(milestone / 10);
      this.score += bonus;
      this.addFloatingText(this.width / 2, 150, "+" + bonus + " BONUS!", "#4ade80");
    }
  }

  private render(): void {
    const ctx = this.ctx;

    ctx.save();

    // Apply camera transforms
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    ctx.translate(centerX, centerY);
    ctx.scale(this.cameraZoom, this.cameraZoom);
    ctx.translate(-centerX, -centerY);
    ctx.translate(
      this.cameraShakeX + this.cameraOffsetX,
      this.cameraShakeY + this.cameraOffsetY
    );

    // Draw background
    this.drawBackground();

    // Draw path
    this.drawPath();

    // Draw stars
    this.drawStars();

    // Draw trail
    this.drawTrail();

    // Draw player
    if (this.isPressed || this.gameState !== "PLAYING") {
      this.drawPlayer();
    }

    // Draw particles
    this.drawParticles();

    // Draw floating texts
    this.drawFloatingTexts();

    ctx.restore();

    // Post-processing effects (no camera transform)
    this.drawPostProcessing();

    // Draw HUD
    if (this.gameState === "PLAYING" || this.gameState === "DYING") {
      this.drawHUD();
    }

    // Draw start screen
    if (this.gameState === "START") {
      this.drawStartOverlay();
    }
  }

  private drawBackground(): void {
    const ctx = this.ctx;

    // Deep space gradient
    const bgGradient = ctx.createRadialGradient(
      this.width / 2,
      this.height / 2,
      0,
      this.width / 2,
      this.height / 2,
      this.width
    );
    const bgHue = (this.hue + 180) % 360;
    bgGradient.addColorStop(0, "hsl(" + bgHue + ", 40%, 8%)");
    bgGradient.addColorStop(0.5, "hsl(" + ((bgHue + 20) % 360) + ", 30%, 4%)");
    bgGradient.addColorStop(1, "hsl(" + ((bgHue + 40) % 360) + ", 20%, 2%)");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(-100, -100, this.width + 200, this.height + 200);

    // Animated nebula clouds
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 5; i++) {
      const x = ((i * 300 + this.time * 0.01) % (this.width + 400)) - 200;
      const y = ((i * 200 + this.time * 0.008 + this.distance * 0.2) % (this.height + 400)) - 200;
      const size = 150 + i * 50;

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
      gradient.addColorStop(0, "hsl(" + ((this.hue + i * 40) % 360) + ", 60%, 40%)");
      gradient.addColorStop(1, "transparent");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Grid
    const gridSize = 50;
    const gridOffset = (this.distance * 0.4) % gridSize;
    const gridAlpha = 0.06 + this.scrollSpeed * 0.006;

    ctx.strokeStyle = "hsla(" + this.hue + ", 50%, 40%, " + gridAlpha + ")";
    ctx.lineWidth = 1;

    for (let x = -gridSize; x < this.width + gridSize; x += gridSize) {
      const wobble = Math.sin((x + this.time * 0.0008) * 0.025) * 6;
      ctx.beginPath();
      ctx.moveTo(x + wobble, 0);
      ctx.lineTo(x - wobble, this.height);
      ctx.stroke();
    }

    for (let y = gridOffset; y < this.height + gridSize; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }

    // Twinkling stars
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < 40; i++) {
      const x = ((i * 137.5 + this.time * 0.015) % (this.width + 40)) - 20;
      const y = ((i * 89.3 + this.distance * 0.25) % (this.height + 40)) - 20;
      const twinkle = Math.sin(this.time * 0.004 + i * 2.3) * 0.5 + 0.5;
      const size = (0.8 + twinkle * 0.8) * (1 + (i % 3) * 0.3);

      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fillStyle = "hsl(" + ((this.hue + i * 15) % 360) + ", 70%, " + (50 + twinkle * 30) + "%)";
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawPath(): void {
    const ctx = this.ctx;

    // Path glow
    ctx.beginPath();
    for (let i = 0; i < this.pathSegments.length; i++) {
      const segment = this.pathSegments[i];
      const x = segment.centerX - segment.width / 2;
      if (i === 0) ctx.moveTo(x, segment.y + this.segmentHeight);
      else ctx.lineTo(x, segment.y);
    }
    for (let i = this.pathSegments.length - 1; i >= 0; i--) {
      const segment = this.pathSegments[i];
      ctx.lineTo(segment.centerX + segment.width / 2, segment.y);
    }
    ctx.closePath();

    // Path fill with animated gradient
    const pathGradient = ctx.createLinearGradient(0, 0, 0, this.height);
    pathGradient.addColorStop(0, "hsla(" + this.hue + ", 50%, 10%, 0.95)");
    pathGradient.addColorStop(0.5, "hsla(" + ((this.hue + 25) % 360) + ", 45%, 7%, 0.95)");
    pathGradient.addColorStop(1, "hsla(" + ((this.hue + 50) % 360) + ", 40%, 5%, 0.95)");
    ctx.fillStyle = pathGradient;
    ctx.fill();

    // Inner glow effect
    ctx.shadowColor = "hsla(" + this.hue + ", 100%, 50%, 0.3)";
    ctx.shadowBlur = 30;
    ctx.fill();
    ctx.shadowBlur = 0;

    this.drawWalls();
  }

  private drawWalls(): void {
    const ctx = this.ctx;
    const dangerPulse = this.dangerLevel > 0.5 ? (Math.sin(this.time * 0.025) + 1) * 0.5 : 0;
    const wallBrightness = 55 + dangerPulse * 25;

    // Draw wall glow layers
    for (let glowLayer = 3; glowLayer >= 0; glowLayer--) {
      const glowWidth = 4 + glowLayer * 8;
      const glowAlpha = (0.4 - glowLayer * 0.1) * (1 + dangerPulse * 0.5);

      // Left wall
      ctx.beginPath();
      for (let i = 0; i < this.pathSegments.length; i++) {
        const segment = this.pathSegments[i];
        const x = segment.centerX - segment.width / 2;
        if (i === 0) ctx.moveTo(x, segment.y + this.segmentHeight);
        else ctx.lineTo(x, segment.y);
      }
      ctx.strokeStyle = "hsla(" + this.hue + ", 100%, " + wallBrightness + "%, " + glowAlpha + ")";
      ctx.lineWidth = glowWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();

      // Right wall
      const rightHue = (this.hue + 50) % 360;
      ctx.beginPath();
      for (let i = 0; i < this.pathSegments.length; i++) {
        const segment = this.pathSegments[i];
        const x = segment.centerX + segment.width / 2;
        if (i === 0) ctx.moveTo(x, segment.y + this.segmentHeight);
        else ctx.lineTo(x, segment.y);
      }
      ctx.strokeStyle = "hsla(" + rightHue + ", 100%, " + wallBrightness + "%, " + glowAlpha + ")";
      ctx.stroke();
    }

    // Animated energy lines on walls
    if (this.scrollSpeed > 5) {
      const energyAlpha = Math.min(0.6, (this.scrollSpeed - 5) / 10);
      const energyOffset = (this.time * 0.02) % 50;

      ctx.setLineDash([5, 45]);
      ctx.lineDashOffset = -energyOffset;

      // Left energy
      ctx.beginPath();
      for (let i = 0; i < this.pathSegments.length; i++) {
        const segment = this.pathSegments[i];
        const x = segment.centerX - segment.width / 2;
        if (i === 0) ctx.moveTo(x, segment.y + this.segmentHeight);
        else ctx.lineTo(x, segment.y);
      }
      ctx.strokeStyle = "hsla(" + this.hue + ", 100%, 80%, " + energyAlpha + ")";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Right energy
      ctx.beginPath();
      for (let i = 0; i < this.pathSegments.length; i++) {
        const segment = this.pathSegments[i];
        const x = segment.centerX + segment.width / 2;
        if (i === 0) ctx.moveTo(x, segment.y + this.segmentHeight);
        else ctx.lineTo(x, segment.y);
      }
      ctx.strokeStyle = "hsla(" + ((this.hue + 50) % 360) + ", 100%, 80%, " + energyAlpha + ")";
      ctx.stroke();

      ctx.setLineDash([]);
    }
  }

  private drawStars(): void {
    const ctx = this.ctx;

    for (const star of this.stars) {
      if (star.collected) continue;

      const pulse = Math.sin(star.pulse) * 0.3 + 1;
      const size = (star.type === "star" ? 14 : 18) * pulse;

      // Outer glow
      const glowHue = star.type === "star" ? 50 : star.type === "shield" ? 140 : 280;
      const gradient = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, size * 2.5);
      gradient.addColorStop(0, "hsla(" + glowHue + ", 100%, 70%, 0.8)");
      gradient.addColorStop(0.4, "hsla(" + glowHue + ", 100%, 60%, 0.3)");
      gradient.addColorStop(1, "transparent");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(star.x, star.y, size * 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(star.x, star.y);
      ctx.rotate(this.time * 0.002);

      if (star.type === "star") {
        // Star shape
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const angle = (i * Math.PI * 2) / 5 - Math.PI / 2;
          const outerX = Math.cos(angle) * size;
          const outerY = Math.sin(angle) * size;
          const innerAngle = angle + Math.PI / 5;
          const innerX = Math.cos(innerAngle) * size * 0.4;
          const innerY = Math.sin(innerAngle) * size * 0.4;

          if (i === 0) ctx.moveTo(outerX, outerY);
          else ctx.lineTo(outerX, outerY);
          ctx.lineTo(innerX, innerY);
        }
        ctx.closePath();
        ctx.fillStyle = "#ffd700";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        // Power-up shapes
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = star.type === "shield" ? "#4ade80" : "#a78bfa";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Icon
        ctx.fillStyle = "#fff";
        ctx.font = "bold " + (size * 0.8) + "px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(star.type === "shield" ? "S" : "T", 0, 1);
      }

      ctx.restore();
    }
  }

  private drawTrail(): void {
    const ctx = this.ctx;

    if (this.trail.length < 2) return;

    // Shield effect around trail
    if (this.shieldActive) {
      ctx.globalAlpha = 0.3 + Math.sin(this.time * 0.01) * 0.1;
      for (let i = 1; i < this.trail.length; i++) {
        const curr = this.trail[i];
        const alpha = (1 - curr.age) * 0.5;
        ctx.beginPath();
        ctx.arc(curr.x, curr.y, 25, 0, Math.PI * 2);
        ctx.fillStyle = "hsla(140, 100%, 50%, " + alpha + ")";
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Main trail
    for (let i = 1; i < this.trail.length; i++) {
      const prev = this.trail[i - 1];
      const curr = this.trail[i];
      const alpha = (1 - curr.age) * 0.9;
      const width = curr.size * (1 - curr.age * 0.4);

      // Outer glow
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(curr.x, curr.y);
      ctx.strokeStyle = "hsla(" + this.hue + ", 100%, 60%, " + (alpha * 0.35) + ")";
      ctx.lineWidth = width * 2.5;
      ctx.lineCap = "round";
      ctx.stroke();

      // Main
      ctx.strokeStyle = "hsla(" + this.hue + ", 100%, 70%, " + alpha + ")";
      ctx.lineWidth = width;
      ctx.stroke();

      // Core
      ctx.strokeStyle = "hsla(" + this.hue + ", 100%, 90%, " + (alpha * 0.8) + ")";
      ctx.lineWidth = width * 0.35;
      ctx.stroke();
    }
  }

  private drawPlayer(): void {
    const ctx = this.ctx;
    const x = this.playerX;
    const y = this.playerY;
    const speedFactor = Math.min(1, this.scrollSpeed / 10);

    // Shield ring
    if (this.shieldActive) {
      const shieldPulse = Math.sin(this.time * 0.008) * 0.3 + 0.7;
      ctx.beginPath();
      ctx.arc(x, y, 35 + shieldPulse * 10, 0, Math.PI * 2);
      ctx.strokeStyle = "hsla(140, 100%, 60%, " + (0.5 * shieldPulse) + ")";
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, 30 + shieldPulse * 8, 0, Math.PI * 2);
      ctx.strokeStyle = "hsla(140, 100%, 70%, 0.3)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Danger warning
    if (this.dangerLevel > 0.3 && !this.shieldActive) {
      const warningPulse = Math.sin(this.time * 0.025) * 0.5 + 0.5;
      ctx.beginPath();
      ctx.arc(x, y, 40 + warningPulse * 15, 0, Math.PI * 2);
      ctx.strokeStyle = "hsla(0, 100%, 50%, " + (this.dangerLevel * 0.6 * warningPulse) + ")";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Outer glow
    const glowSize = 50 + speedFactor * 25;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, glowSize);
    gradient.addColorStop(0, "hsla(" + this.hue + ", 100%, 70%, 0.7)");
    gradient.addColorStop(0.3, "hsla(" + this.hue + ", 100%, 60%, 0.3)");
    gradient.addColorStop(1, "transparent");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, glowSize, 0, Math.PI * 2);
    ctx.fill();

    // Core
    const coreGradient = ctx.createRadialGradient(x - 4, y - 4, 0, x, y, 16);
    coreGradient.addColorStop(0, "#fff");
    coreGradient.addColorStop(0.4, "hsl(" + this.hue + ", 100%, 80%)");
    coreGradient.addColorStop(1, "hsl(" + this.hue + ", 100%, 50%)");
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.fillStyle = coreGradient;
    ctx.fill();

    // Pulsing ring
    if (this.isPressed && this.gameState === "PLAYING") {
      const pulse = (Math.sin(this.time * 0.007) + 1) * 0.5;
      ctx.beginPath();
      ctx.arc(x, y, 24 + pulse * 14, 0, Math.PI * 2);
      ctx.strokeStyle = "hsla(" + this.hue + ", 100%, 70%, " + (0.6 - pulse * 0.4) + ")";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Combo display
    if (this.combo > 0) {
      const comboScale = 1 + Math.sin(this.time * 0.01) * 0.1;
      ctx.save();
      ctx.translate(x, y - 40);
      ctx.scale(comboScale, comboScale);
      ctx.font = "bold 16px 'Orbitron', sans-serif";
      ctx.fillStyle = "#ffd700";
      ctx.textAlign = "center";
      ctx.shadowColor = "#ffd700";
      ctx.shadowBlur = 10;
      ctx.fillText(this.combo + "x", 0, 0);
      ctx.restore();
    }

    // Perfect center indicator
    if (this.perfectCenterBonus > 3) {
      const perfectAlpha = Math.min(1, (this.perfectCenterBonus - 3) / 7);
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = "hsla(50, 100%, 70%, " + perfectAlpha + ")";
      ctx.fill();
    }
  }

  private drawParticles(): void {
    const ctx = this.ctx;

    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;

      if (p.type === "speedline") {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x, p.y + 35 * alpha);
        ctx.strokeStyle = "hsla(" + p.hue + ", 80%, 60%, " + (alpha * 0.4) + ")";
        ctx.lineWidth = p.size;
        ctx.stroke();
      } else if (p.type === "ring") {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.strokeStyle = "hsla(" + p.hue + ", 100%, 70%, " + (alpha * 0.5) + ")";
        ctx.lineWidth = 3;
        ctx.stroke();
      } else {
        const size = p.size * alpha;

        // Glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, size * 2, 0, Math.PI * 2);
        ctx.fillStyle = "hsla(" + p.hue + ", 100%, 60%, " + (alpha * 0.25) + ")";
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fillStyle = "hsla(" + p.hue + ", 100%, 70%, " + alpha + ")";
        ctx.fill();
      }
    }
  }

  private drawFloatingTexts(): void {
    const ctx = this.ctx;

    for (const ft of this.floatingTexts) {
      ctx.save();
      ctx.translate(ft.x, ft.y);
      ctx.scale(ft.scale, ft.scale);
      ctx.globalAlpha = ft.life;
      ctx.font = "bold 18px 'Orbitron', sans-serif";
      ctx.fillStyle = ft.color;
      ctx.textAlign = "center";
      ctx.shadowColor = ft.color;
      ctx.shadowBlur = 10;
      ctx.fillText(ft.text, 0, 0);
      ctx.restore();
    }
  }

  private drawPostProcessing(): void {
    const ctx = this.ctx;

    // Screen flash
    if (this.screenFlash > 0) {
      ctx.fillStyle = this.screenFlashColor;
      ctx.globalAlpha = this.screenFlash * 0.45;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.globalAlpha = 1;
    }

    // Chromatic aberration (simulated with colored overlays)
    if (this.chromaticAberration > 0.5) {
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = this.chromaticAberration * 0.015;

      // Red shift
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(-this.chromaticAberration, 0, this.width, this.height);

      // Blue shift
      ctx.fillStyle = "#0000ff";
      ctx.fillRect(this.chromaticAberration, 0, this.width, this.height);

      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }

    // Slow-mo effect
    if (this.slowMoActive) {
      ctx.fillStyle = "hsla(280, 50%, 20%, 0.15)";
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // Vignette
    const vignetteGradient = ctx.createRadialGradient(
      this.width / 2,
      this.height / 2,
      this.width * 0.25,
      this.width / 2,
      this.height / 2,
      this.width * 0.85
    );
    vignetteGradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignetteGradient.addColorStop(0.6, "rgba(0, 0, 0, 0.15)");
    vignetteGradient.addColorStop(1, "rgba(0, 0, 0, 0.6)");
    ctx.fillStyle = vignetteGradient;
    ctx.fillRect(0, 0, this.width, this.height);

    // Danger vignette
    if (this.dangerLevel > 0.3 && !this.shieldActive) {
      const dangerVignette = ctx.createRadialGradient(
        this.width / 2,
        this.height / 2,
        this.width * 0.15,
        this.width / 2,
        this.height / 2,
        this.width * 0.55
      );
      dangerVignette.addColorStop(0, "transparent");
      dangerVignette.addColorStop(1, "rgba(255, 0, 0, " + (this.dangerLevel * 0.35) + ")");
      ctx.fillStyle = dangerVignette;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // Combo pulse
    if (this.pulseEffect > 0) {
      ctx.fillStyle = "hsla(50, 100%, 70%, " + (this.pulseEffect * 0.12) + ")";
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  private drawHUD(): void {
    const ctx = this.ctx;
    const topOffset = this.isMobile ? 80 : 25;

    // Score with glow
    ctx.save();
    ctx.font = "bold 36px 'Orbitron', sans-serif";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(255, 255, 255, 0.5)";
    ctx.shadowBlur = 15;
    ctx.fillStyle = "#fff";
    ctx.fillText(Math.floor(this.score).toString(), this.width / 2, topOffset + 35);
    ctx.restore();

    // Distance
    ctx.font = "14px 'Space Mono', monospace";
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.textAlign = "center";
    ctx.fillText(Math.floor(this.distance) + "m", this.width / 2, topOffset + 55);

    // Grace period
    if (this.graceTime > 0) {
      const progress = this.graceTime / this.graceDuration;
      const barWidth = 160;
      const barHeight = 8;
      const barX = (this.width - barWidth) / 2;
      const barY = topOffset + 72;

      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      this.roundedRect(ctx, barX - 2, barY - 2, barWidth + 4, barHeight + 4, 6);
      ctx.fill();

      const progressGradient = ctx.createLinearGradient(barX, 0, barX + barWidth * progress, 0);
      progressGradient.addColorStop(0, "#4ade80");
      progressGradient.addColorStop(1, "#22c55e");
      ctx.fillStyle = progressGradient;
      this.roundedRect(ctx, barX, barY, barWidth * progress, barHeight, 4);
      ctx.fill();

      ctx.font = "bold 10px 'Space Mono', monospace";
      ctx.fillStyle = "#4ade80";
      ctx.fillText("SAFE ZONE", this.width / 2, barY + 22);
    }

    // Milestone popup
    if (this.milestoneTimer > 0) {
      const milestoneAlpha = Math.min(1, this.milestoneTimer / 500);
      const milestoneScale = 1 + (1 - Math.min(1, this.milestoneTimer / 300)) * 0.3;

      ctx.save();
      ctx.translate(this.width / 2, this.height * 0.25);
      ctx.scale(milestoneScale, milestoneScale);
      ctx.globalAlpha = milestoneAlpha;
      ctx.font = "bold 48px 'Orbitron', sans-serif";
      ctx.fillStyle = "#4ade80";
      ctx.shadowColor = "#4ade80";
      ctx.shadowBlur = 20;
      ctx.textAlign = "center";
      ctx.fillText(this.milestoneText, 0, 0);
      ctx.restore();
    }

    // Power-up indicators
    const indicatorY = this.height - 60;
    let indicatorX = 30;

    if (this.shieldActive) {
      const shieldProgress = this.shieldTimer / 5000;
      ctx.fillStyle = "rgba(74, 222, 128, 0.3)";
      ctx.beginPath();
      ctx.arc(indicatorX, indicatorY, 22, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#4ade80";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(indicatorX, indicatorY, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * shieldProgress);
      ctx.stroke();

      ctx.font = "bold 14px sans-serif";
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText("S", indicatorX, indicatorY + 5);
      indicatorX += 55;
    }

    if (this.slowMoActive) {
      const slowProgress = this.slowMoTimer / 4000;
      ctx.fillStyle = "rgba(167, 139, 250, 0.3)";
      ctx.beginPath();
      ctx.arc(indicatorX, indicatorY, 22, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#a78bfa";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(indicatorX, indicatorY, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * slowProgress);
      ctx.stroke();

      ctx.font = "bold 14px sans-serif";
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText("T", indicatorX, indicatorY + 5);
    }

    // Speed bar
    const speedPercent = (this.scrollSpeed - 4) / (this.maxScrollSpeed - 4);
    if (speedPercent > 0) {
      const speedBarHeight = 120;
      const speedBarWidth = 6;
      const speedBarX = 20;
      const speedBarY = this.height / 2 - speedBarHeight / 2;

      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      this.roundedRect(ctx, speedBarX, speedBarY, speedBarWidth, speedBarHeight, 3);
      ctx.fill();

      const speedGradient = ctx.createLinearGradient(0, speedBarY + speedBarHeight, 0, speedBarY);
      speedGradient.addColorStop(0, "hsl(" + this.hue + ", 100%, 50%)");
      speedGradient.addColorStop(1, "hsl(" + ((this.hue + 60) % 360) + ", 100%, 70%)");
      ctx.fillStyle = speedGradient;
      const filledHeight = speedBarHeight * Math.min(1, speedPercent);
      this.roundedRect(ctx, speedBarX, speedBarY + speedBarHeight - filledHeight, speedBarWidth, filledHeight, 3);
      ctx.fill();
    }

    // Combo timer bar
    if (this.combo > 0 && this.comboTimer > 0) {
      const comboProgress = this.comboTimer / 3500;
      const comboBarWidth = 80;
      const comboBarX = this.width / 2 - comboBarWidth / 2;
      const comboBarY = topOffset + 92;

      ctx.fillStyle = "rgba(255, 215, 0, 0.2)";
      this.roundedRect(ctx, comboBarX, comboBarY, comboBarWidth, 4, 2);
      ctx.fill();

      ctx.fillStyle = "#ffd700";
      this.roundedRect(ctx, comboBarX, comboBarY, comboBarWidth * comboProgress, 4, 2);
      ctx.fill();
    }
  }

  private drawStartOverlay(): void {
    const ctx = this.ctx;

    ctx.fillStyle = "rgba(5, 5, 15, 0.9)";
    ctx.fillRect(0, 0, this.width, this.height);

    // Animated background
    for (let i = 0; i < 60; i++) {
      const x = ((i * 137.5 + this.time * 0.025) % (this.width + 40)) - 20;
      const y = ((i * 89.3 + this.time * 0.018) % (this.height + 40)) - 20;
      const size = 1.5 + Math.sin(this.time * 0.003 + i) * 0.6;
      const alpha = 0.25 + Math.sin(this.time * 0.002 + i * 0.5) * 0.15;

      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fillStyle = "hsla(" + ((this.hue + i * 6) % 360) + ", 80%, 60%, " + alpha + ")";
      ctx.fill();
    }

    const centerY = this.height * 0.36;

    // Title
    ctx.save();
    const glowPulse = Math.sin(this.time * 0.003) * 0.3 + 0.7;
    ctx.font = "bold 56px 'Orbitron', sans-serif";
    ctx.textAlign = "center";
    ctx.shadowColor = "hsl(" + this.hue + ", 100%, 60%)";
    ctx.shadowBlur = 35 * glowPulse;
    ctx.fillStyle = "hsl(" + this.hue + ", 100%, 70%)";
    ctx.fillText("FINGER FLOW", this.width / 2, centerY);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    ctx.fillText("FINGER FLOW", this.width / 2, centerY);
    ctx.restore();

    // Subtitle
    ctx.font = "18px 'Space Mono', monospace";
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.fillText("Don't lift your finger!", this.width / 2, centerY + 40);

    // Features
    const featureY = this.height * 0.52;
    const features = [
      ["Hold to play", "Navigate the path"],
      ["Collect stars", "Never let go"],
    ];

    ctx.font = "14px 'Space Mono', monospace";
    features.forEach((row, rowIdx) => {
      row.forEach((text, colIdx) => {
        const x = this.width / 2 + (colIdx - 0.5) * 140;
        const y = featureY + rowIdx * 35;
        const alpha = 0.5 + Math.sin(this.time * 0.003 + rowIdx + colIdx) * 0.2;
        ctx.fillStyle = "rgba(255, 255, 255, " + alpha + ")";
        ctx.fillText(text, x, y);
      });
    });

    // Start prompt
    const pulse = (Math.sin(this.time * 0.004) + 1) * 0.5;
    ctx.save();
    ctx.font = "bold 26px 'Orbitron', sans-serif";
    ctx.shadowColor = "hsl(" + this.hue + ", 100%, 60%)";
    ctx.shadowBlur = 25 * pulse;
    ctx.fillStyle = "hsla(" + this.hue + ", 100%, 70%, " + (0.6 + pulse * 0.4) + ")";
    ctx.fillText("TOUCH TO START", this.width / 2, this.height * 0.76);
    ctx.restore();

    // Animated finger
    this.drawAnimatedFinger(this.width / 2, this.height * 0.87);
  }

  private drawAnimatedFinger(x: number, y: number): void {
    const ctx = this.ctx;
    const bounce = Math.sin(this.time * 0.005) * 10;
    const scale = 1 + Math.sin(this.time * 0.003) * 0.08;

    ctx.save();
    ctx.translate(x, y + bounce);
    ctx.scale(scale, scale);

    // Finger
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 30, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Touch point
    ctx.beginPath();
    ctx.arc(0, 18, 8, 0, Math.PI * 2);
    ctx.fillStyle = "hsl(" + this.hue + ", 100%, 70%)";
    ctx.fill();

    // Ripples
    for (let i = 0; i < 3; i++) {
      const ripplePhase = ((this.time * 0.003 + i * 0.33) % 1);
      const rippleSize = 18 + ripplePhase * 45;
      const rippleAlpha = (1 - ripplePhase) * 0.4;

      ctx.beginPath();
      ctx.arc(0, 18, rippleSize, 0, Math.PI * 2);
      ctx.strokeStyle = "hsla(" + this.hue + ", 100%, 70%, " + rippleAlpha + ")";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  }

  private gameLoop(): void {
    const currentTime = performance.now();
    const dt = Math.min(currentTime - this.lastTime, 50);
    this.lastTime = currentTime;

    this.update(dt);
    this.render();

    requestAnimationFrame(() => this.gameLoop());
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new FingerFlowGame();
});
