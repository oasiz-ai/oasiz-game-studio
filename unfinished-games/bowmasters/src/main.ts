import Matter from "matter-js";

/**
 * BOWMASTERS - Physics-based turn-based duel game
 *
 * Features:
 * - Matter.js physics engine with slingshot mechanics
 * - Two players with ragdoll-style characters
 * - Turn-based combat with drag-to-aim controls
 * - Health bars and damage system
 * - Satisfying hit reactions with particles
 * - Mobile and desktop support
 */

// ============= CONFIGURATION =============
const CONFIG = {
  // Player
  MAX_HEALTH: 100,
  BODY_WIDTH: 40,
  BODY_HEIGHT: 60,
  HEAD_RADIUS: 22,
  ARM_LENGTH: 35,
  ARM_WIDTH: 12,
  LEG_LENGTH: 40,
  LEG_WIDTH: 14,

  // Projectile
  PROJECTILE_RADIUS: 12,
  PROJECTILE_DENSITY: 0.004,
  MAX_PULL_DISTANCE: 150,
  MAX_LAUNCH_SPEED: 35,
  MIN_LAUNCH_SPEED: 5,

  // Slingshot
  SLINGSHOT_STIFFNESS: 0.05,
  SLINGSHOT_DAMPING: 0.01,

  // Damage
  HEAD_DAMAGE_MULTIPLIER: 2.0,
  BODY_DAMAGE_MULTIPLIER: 1.0,
  ARM_DAMAGE_MULTIPLIER: 0.5,
  LEG_DAMAGE_MULTIPLIER: 0.6,
  BASE_DAMAGE: 15,
  SPEED_DAMAGE_MULTIPLIER: 1.2,

  // Physics
  GRAVITY: 1.2,
  GROUND_FRICTION: 0.8,
  BODY_FRICTION: 0.4,
  RESTITUTION: 0.3,

  // Turn timing
  TURN_DELAY: 1500,
  PROJECTILE_TIMEOUT: 5000,

  // Particles
  HIT_PARTICLE_COUNT: 12,
  PARTICLE_LIFE: 600,

  // Colors
  PLAYER1_COLOR: "#4facfe",
  PLAYER1_DARK: "#00b4d8",
  PLAYER2_COLOR: "#f5576c",
  PLAYER2_DARK: "#e63946",
  GROUND_COLOR: "#2d1b4e",
  SKY_GRADIENT_TOP: "#1a0a2e",
  SKY_GRADIENT_BOTTOM: "#2d1b4e",
  PROJECTILE_COLOR: "#ffcc00",
};

// ============= TYPES =============
type GameState = "START" | "PLAYING" | "AIMING" | "PROJECTILE_FLYING" | "GAME_OVER";
type PlayerTurn = 1 | 2;

interface PlayerCharacter {
  id: 1 | 2;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  facingRight: boolean;
  bodies: {
    torso: Matter.Body;
    head: Matter.Body;
    leftArm: Matter.Body;
    rightArm: Matter.Body;
    leftLeg: Matter.Body;
    rightLeg: Matter.Body;
  };
  composite: Matter.Composite;
  color: string;
  darkColor: string;
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

// ============= GAME CLASS =============
class BowmastersGame {
  // Matter.js core
  private engine: Matter.Engine;
  private world: Matter.World;
  private runner: Matter.Runner;

  // Canvas
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number = 0;
  private height: number = 0;
  private isMobile: boolean;

  // Game state
  private gameState: GameState = "START";
  private currentTurn: PlayerTurn = 1;
  private players: [PlayerCharacter | null, PlayerCharacter | null] = [null, null];
  private ground: Matter.Body | null = null;
  private walls: Matter.Body[] = [];

  // Projectile
  private projectile: Matter.Body | null = null;
  private projectileAnchor: { x: number; y: number } | null = null;
  private elastic: Matter.Constraint | null = null;
  private projectileTimeout: number | null = null;

  // Aiming
  private isAiming: boolean = false;
  private aimStart: { x: number; y: number } | null = null;
  private aimEnd: { x: number; y: number } | null = null;
  private pullDistance: number = 0;

  // Effects
  private particles: Particle[] = [];
  private screenShake: { intensity: number; duration: number; time: number } = {
    intensity: 0,
    duration: 0,
    time: 0,
  };

  // Audio
  private audioContext: AudioContext | null = null;
  private settings: Settings = {
    music: true,
    fx: true,
    haptics: true,
  };

  // UI Elements
  private startScreen: HTMLElement;
  private hud: HTMLElement;
  private turnIndicator: HTMLElement;
  private powerMeter: HTMLElement;
  private powerFill: HTMLElement;
  private aimInfo: HTMLElement;
  private gameOverScreen: HTMLElement;
  private settingsBtn: HTMLElement;
  private settingsPanel: HTMLElement;
  private settingsOverlay: HTMLElement;

  constructor() {
    console.log("[BowmastersGame] Initializing game");

    this.isMobile = window.matchMedia("(pointer: coarse)").matches;

    // Create canvas
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d")!;
    document.getElementById("game-container")!.appendChild(this.canvas);

    // Get UI elements
    this.startScreen = document.getElementById("start-screen")!;
    this.hud = document.getElementById("hud")!;
    this.turnIndicator = document.getElementById("turn-indicator")!;
    this.powerMeter = document.getElementById("power-meter")!;
    this.powerFill = document.getElementById("power-fill")!;
    this.aimInfo = document.getElementById("aim-info")!;
    this.gameOverScreen = document.getElementById("game-over-screen")!;
    this.settingsBtn = document.getElementById("settings-btn")!;
    this.settingsPanel = document.getElementById("settings-panel")!;
    this.settingsOverlay = document.getElementById("settings-overlay")!;

    // Create Matter.js engine
    this.engine = Matter.Engine.create({
      gravity: { x: 0, y: CONFIG.GRAVITY },
    });
    this.world = this.engine.world;

    // Create runner
    this.runner = Matter.Runner.create();

    // Setup
    this.loadSettings();
    this.setupCanvas();
    this.setupEventListeners();
    this.setupCollisionHandling();

    // Start render loop
    this.render();

    console.log("[BowmastersGame] Initialization complete");
  }

  private setupCanvas(): void {
    console.log("[BowmastersGame] Setting up canvas");
    this.resizeCanvas();
    window.addEventListener("resize", () => this.resizeCanvas());
  }

  private resizeCanvas(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    // Recreate world bounds if game is active
    if (this.gameState !== "START") {
      this.createWorldBounds();
      this.repositionPlayers();
    }
  }

  private setupEventListeners(): void {
    console.log("[BowmastersGame] Setting up event listeners");

    // Start button
    document.getElementById("start-btn")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.playSound("click");
      this.startGame();
    });

    // Restart button
    document.getElementById("restart-btn")!.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.playSound("click");
      this.restartGame();
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

    // Toggle buttons
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

  private setupCollisionHandling(): void {
    Matter.Events.on(this.engine, "collisionStart", (event) => {
      for (const pair of event.pairs) {
        this.handleCollision(pair);
      }
    });
  }

  private handleCollision(pair: Matter.Pair): void {
    const { bodyA, bodyB } = pair;

    // Check if projectile hit something
    if (!this.projectile) return;

    const isProjectileA = bodyA === this.projectile;
    const isProjectileB = bodyB === this.projectile;

    if (!isProjectileA && !isProjectileB) return;

    const otherBody = isProjectileA ? bodyB : bodyA;

    // Check if hit a player body part
    const hitPlayer = this.getPlayerFromBody(otherBody);

    if (hitPlayer && hitPlayer.id !== this.currentTurn) {
      const impactSpeed = Matter.Body.getSpeed(this.projectile);
      const damage = this.calculateDamage(otherBody, impactSpeed, hitPlayer);

      this.applyDamage(hitPlayer, damage, this.projectile.position);
      this.createHitEffect(this.projectile.position.x, this.projectile.position.y, hitPlayer.color);

      // Apply impact force to hit body part
      const impactVector = Matter.Vector.mult(
        Matter.Vector.normalise(this.projectile.velocity),
        impactSpeed * 0.3
      );
      Matter.Body.applyForce(otherBody, otherBody.position, impactVector);

      this.triggerHaptic("heavy");
      this.playSound("hit");
      this.shakeScreen(8, 200);

      // End projectile flight
      this.endProjectileFlight();
    } else if (otherBody === this.ground || this.walls.includes(otherBody)) {
      // Hit ground or wall
      this.playSound("thud");
      this.triggerHaptic("medium");

      // Add a small delay before ending turn
      setTimeout(() => {
        if (this.gameState === "PROJECTILE_FLYING") {
          this.endProjectileFlight();
        }
      }, 500);
    }
  }

  private getPlayerFromBody(body: Matter.Body): PlayerCharacter | null {
    for (const player of this.players) {
      if (!player) continue;
      const bodies = player.bodies;
      if (
        body === bodies.torso ||
        body === bodies.head ||
        body === bodies.leftArm ||
        body === bodies.rightArm ||
        body === bodies.leftLeg ||
        body === bodies.rightLeg
      ) {
        return player;
      }
    }
    return null;
  }

  private calculateDamage(hitBody: Matter.Body, impactSpeed: number, player: PlayerCharacter): number {
    let multiplier = CONFIG.BODY_DAMAGE_MULTIPLIER;

    if (hitBody === player.bodies.head) {
      multiplier = CONFIG.HEAD_DAMAGE_MULTIPLIER;
    } else if (hitBody === player.bodies.leftArm || hitBody === player.bodies.rightArm) {
      multiplier = CONFIG.ARM_DAMAGE_MULTIPLIER;
    } else if (hitBody === player.bodies.leftLeg || hitBody === player.bodies.rightLeg) {
      multiplier = CONFIG.LEG_DAMAGE_MULTIPLIER;
    }

    const speedBonus = Math.min(impactSpeed * CONFIG.SPEED_DAMAGE_MULTIPLIER, 20);
    const damage = Math.round((CONFIG.BASE_DAMAGE + speedBonus) * multiplier);

    console.log(
      "[BowmastersGame] Damage calculated:",
      damage,
      "multiplier:",
      multiplier,
      "speed:",
      impactSpeed
    );

    return damage;
  }

  private applyDamage(player: PlayerCharacter, damage: number, position: Matter.Vector): void {
    player.health = Math.max(0, player.health - damage);

    console.log("[BowmastersGame] Player", player.id, "took", damage, "damage. Health:", player.health);

    // Update health bar
    this.updateHealthBar(player);

    // Show damage popup
    this.showDamagePopup(damage, position.x, position.y);

    // Check for game over
    if (player.health <= 0) {
      this.triggerGameOver(this.currentTurn);
    }
  }

  private updateHealthBar(player: PlayerCharacter): void {
    const healthPercent = (player.health / player.maxHealth) * 100;
    const healthBar = document.getElementById(`p${player.id}-health`)!;
    const healthText = document.getElementById(`p${player.id}-health-text`)!;

    healthBar.style.width = healthPercent + "%";
    healthText.textContent = player.health.toString();
  }

  private showDamagePopup(damage: number, x: number, y: number): void {
    const popup = document.createElement("div");
    popup.className = "damage-popup";
    popup.textContent = "-" + damage;
    popup.style.left = x + "px";
    popup.style.top = y + "px";
    document.getElementById("game-container")!.appendChild(popup);

    setTimeout(() => popup.remove(), 1000);
  }

  private startGame(): void {
    console.log("[BowmastersGame] Starting game");

    this.startScreen.classList.add("hidden");
    this.hud.style.display = "flex";
    this.settingsBtn.style.display = "flex";

    // Initialize audio
    this.initAudio();

    // Create world
    this.createWorldBounds();
    this.createPlayers();

    // Start physics
    Matter.Runner.run(this.runner, this.engine);

    // Set initial turn
    this.currentTurn = 1;
    this.gameState = "PLAYING";

    // Start first turn
    setTimeout(() => this.startTurn(), 500);
  }

  private restartGame(): void {
    console.log("[BowmastersGame] Restarting game");

    // Hide game over
    this.gameOverScreen.classList.remove("visible");

    // Clear world
    Matter.Composite.clear(this.world, false);

    // Reset state
    this.players = [null, null];
    this.projectile = null;
    this.elastic = null;
    this.particles = [];

    // Recreate world
    this.createWorldBounds();
    this.createPlayers();

    // Reset health bars
    this.resetHealthBars();

    // Start
    this.currentTurn = 1;
    this.gameState = "PLAYING";
    setTimeout(() => this.startTurn(), 500);
  }

  private resetHealthBars(): void {
    for (let i = 1; i <= 2; i++) {
      const healthBar = document.getElementById(`p${i}-health`)!;
      const healthText = document.getElementById(`p${i}-health-text`)!;
      healthBar.style.width = "100%";
      healthText.textContent = CONFIG.MAX_HEALTH.toString();
    }
  }

  private createWorldBounds(): void {
    console.log("[BowmastersGame] Creating world bounds");

    // Remove existing ground and walls
    if (this.ground) {
      Matter.Composite.remove(this.world, this.ground);
    }
    for (const wall of this.walls) {
      Matter.Composite.remove(this.world, wall);
    }

    const groundHeight = 60;
    const wallThickness = 50;

    // Ground
    this.ground = Matter.Bodies.rectangle(
      this.width / 2,
      this.height - groundHeight / 2,
      this.width + 100,
      groundHeight,
      {
        isStatic: true,
        friction: CONFIG.GROUND_FRICTION,
        label: "ground",
        render: { fillStyle: CONFIG.GROUND_COLOR },
      }
    );

    // Walls
    const leftWall = Matter.Bodies.rectangle(
      -wallThickness / 2,
      this.height / 2,
      wallThickness,
      this.height * 2,
      { isStatic: true, label: "wall" }
    );

    const rightWall = Matter.Bodies.rectangle(
      this.width + wallThickness / 2,
      this.height / 2,
      wallThickness,
      this.height * 2,
      { isStatic: true, label: "wall" }
    );

    const ceiling = Matter.Bodies.rectangle(this.width / 2, -wallThickness / 2, this.width + 100, wallThickness, {
      isStatic: true,
      label: "wall",
    });

    this.walls = [leftWall, rightWall, ceiling];

    Matter.Composite.add(this.world, [this.ground, ...this.walls]);
  }

  private createPlayers(): void {
    console.log("[BowmastersGame] Creating players");

    const groundY = this.height - 60;
    const playerY = groundY - 80;

    // Player 1 (left side)
    const p1X = this.width * 0.15;
    this.players[0] = this.createPlayer(1, p1X, playerY, true);

    // Player 2 (right side)
    const p2X = this.width * 0.85;
    this.players[1] = this.createPlayer(2, p2X, playerY, false);
  }

  private createPlayer(id: 1 | 2, x: number, y: number, facingRight: boolean): PlayerCharacter {
    const color = id === 1 ? CONFIG.PLAYER1_COLOR : CONFIG.PLAYER2_COLOR;
    const darkColor = id === 1 ? CONFIG.PLAYER1_DARK : CONFIG.PLAYER2_DARK;

    const bodyOptions = {
      friction: CONFIG.BODY_FRICTION,
      restitution: CONFIG.RESTITUTION,
      collisionFilter: {
        category: id === 1 ? 0x0002 : 0x0004,
        mask: 0x0001 | 0x0008, // Collide with ground/walls and projectiles
      },
    };

    // Create body parts
    const torso = Matter.Bodies.rectangle(x, y, CONFIG.BODY_WIDTH, CONFIG.BODY_HEIGHT, {
      ...bodyOptions,
      label: "torso",
      render: { fillStyle: color },
    });

    const head = Matter.Bodies.circle(x, y - CONFIG.BODY_HEIGHT / 2 - CONFIG.HEAD_RADIUS, CONFIG.HEAD_RADIUS, {
      ...bodyOptions,
      label: "head",
      render: { fillStyle: color },
    });

    const armOffsetX = facingRight ? CONFIG.BODY_WIDTH / 2 + CONFIG.ARM_LENGTH / 2 : -(CONFIG.BODY_WIDTH / 2 + CONFIG.ARM_LENGTH / 2);
    const leftArm = Matter.Bodies.rectangle(
      x - CONFIG.BODY_WIDTH / 2 - CONFIG.ARM_LENGTH / 2,
      y - CONFIG.BODY_HEIGHT / 4,
      CONFIG.ARM_LENGTH,
      CONFIG.ARM_WIDTH,
      {
        ...bodyOptions,
        label: "leftArm",
        render: { fillStyle: darkColor },
      }
    );

    const rightArm = Matter.Bodies.rectangle(
      x + CONFIG.BODY_WIDTH / 2 + CONFIG.ARM_LENGTH / 2,
      y - CONFIG.BODY_HEIGHT / 4,
      CONFIG.ARM_LENGTH,
      CONFIG.ARM_WIDTH,
      {
        ...bodyOptions,
        label: "rightArm",
        render: { fillStyle: darkColor },
      }
    );

    const leftLeg = Matter.Bodies.rectangle(
      x - CONFIG.BODY_WIDTH / 4,
      y + CONFIG.BODY_HEIGHT / 2 + CONFIG.LEG_LENGTH / 2,
      CONFIG.LEG_WIDTH,
      CONFIG.LEG_LENGTH,
      {
        ...bodyOptions,
        label: "leftLeg",
        render: { fillStyle: darkColor },
      }
    );

    const rightLeg = Matter.Bodies.rectangle(
      x + CONFIG.BODY_WIDTH / 4,
      y + CONFIG.BODY_HEIGHT / 2 + CONFIG.LEG_LENGTH / 2,
      CONFIG.LEG_WIDTH,
      CONFIG.LEG_LENGTH,
      {
        ...bodyOptions,
        label: "rightLeg",
        render: { fillStyle: darkColor },
      }
    );

    // Create constraints to hold body together
    const constraints = [
      // Head to torso
      Matter.Constraint.create({
        bodyA: torso,
        bodyB: head,
        pointA: { x: 0, y: -CONFIG.BODY_HEIGHT / 2 },
        pointB: { x: 0, y: CONFIG.HEAD_RADIUS },
        stiffness: 0.9,
        length: 0,
      }),
      // Left arm to torso
      Matter.Constraint.create({
        bodyA: torso,
        bodyB: leftArm,
        pointA: { x: -CONFIG.BODY_WIDTH / 2, y: -CONFIG.BODY_HEIGHT / 4 },
        pointB: { x: CONFIG.ARM_LENGTH / 2, y: 0 },
        stiffness: 0.8,
        length: 0,
      }),
      // Right arm to torso
      Matter.Constraint.create({
        bodyA: torso,
        bodyB: rightArm,
        pointA: { x: CONFIG.BODY_WIDTH / 2, y: -CONFIG.BODY_HEIGHT / 4 },
        pointB: { x: -CONFIG.ARM_LENGTH / 2, y: 0 },
        stiffness: 0.8,
        length: 0,
      }),
      // Left leg to torso
      Matter.Constraint.create({
        bodyA: torso,
        bodyB: leftLeg,
        pointA: { x: -CONFIG.BODY_WIDTH / 4, y: CONFIG.BODY_HEIGHT / 2 },
        pointB: { x: 0, y: -CONFIG.LEG_LENGTH / 2 },
        stiffness: 0.8,
        length: 0,
      }),
      // Right leg to torso
      Matter.Constraint.create({
        bodyA: torso,
        bodyB: rightLeg,
        pointA: { x: CONFIG.BODY_WIDTH / 4, y: CONFIG.BODY_HEIGHT / 2 },
        pointB: { x: 0, y: -CONFIG.LEG_LENGTH / 2 },
        stiffness: 0.8,
        length: 0,
      }),
    ];

    // Make player static (they don't move from position)
    Matter.Body.setStatic(torso, true);
    Matter.Body.setStatic(head, true);
    Matter.Body.setStatic(leftArm, true);
    Matter.Body.setStatic(rightArm, true);
    Matter.Body.setStatic(leftLeg, true);
    Matter.Body.setStatic(rightLeg, true);

    // Create composite
    const composite = Matter.Composite.create();
    Matter.Composite.add(composite, [torso, head, leftArm, rightArm, leftLeg, rightLeg, ...constraints]);
    Matter.Composite.add(this.world, composite);

    return {
      id,
      x,
      y,
      health: CONFIG.MAX_HEALTH,
      maxHealth: CONFIG.MAX_HEALTH,
      facingRight,
      bodies: { torso, head, leftArm, rightArm, leftLeg, rightLeg },
      composite,
      color,
      darkColor,
    };
  }

  private repositionPlayers(): void {
    // This would reposition players on resize, but since they're static, we just update coordinates
    if (!this.players[0] || !this.players[1]) return;

    const groundY = this.height - 60;
    const playerY = groundY - 80;

    this.players[0].x = this.width * 0.15;
    this.players[0].y = playerY;

    this.players[1].x = this.width * 0.85;
    this.players[1].y = playerY;
  }

  private startTurn(): void {
    console.log("[BowmastersGame] Starting turn for player", this.currentTurn);

    this.gameState = "AIMING";

    // Show turn indicator
    this.showTurnIndicator();

    // Create projectile for current player
    this.createProjectile();
  }

  private showTurnIndicator(): void {
    const indicator = this.turnIndicator;
    indicator.textContent = "PLAYER " + this.currentTurn + "'S TURN";
    indicator.classList.add("visible");

    setTimeout(() => {
      indicator.classList.remove("visible");
    }, 1500);
  }

  private createProjectile(): void {
    const player = this.players[this.currentTurn - 1]!;

    // Position projectile in front of player
    const offsetX = player.facingRight ? 50 : -50;
    const projectileX = player.x + offsetX;
    const projectileY = player.y - 20;

    this.projectile = Matter.Bodies.circle(projectileX, projectileY, CONFIG.PROJECTILE_RADIUS, {
      density: CONFIG.PROJECTILE_DENSITY,
      friction: 0.3,
      restitution: 0.6,
      label: "projectile",
      collisionFilter: {
        category: 0x0008,
        mask: 0x0001 | 0x0002 | 0x0004, // Collide with ground, player1, player2
      },
      render: { fillStyle: CONFIG.PROJECTILE_COLOR },
    });

    this.projectileAnchor = { x: projectileX, y: projectileY };

    this.elastic = Matter.Constraint.create({
      pointA: this.projectileAnchor,
      bodyB: this.projectile,
      stiffness: CONFIG.SLINGSHOT_STIFFNESS,
      damping: CONFIG.SLINGSHOT_DAMPING,
      length: 0.01,
    });

    Matter.Composite.add(this.world, [this.projectile, this.elastic]);

    // Show aim info
    this.aimInfo.textContent = this.isMobile ? "Drag back to aim, release to fire!" : "Click and drag to aim, release to fire!";
  }

  private handleInputStart(x: number, y: number): void {
    if (this.gameState !== "AIMING" || !this.projectile) return;

    // Check if clicking near the projectile
    const dist = Math.hypot(x - this.projectile.position.x, y - this.projectile.position.y);
    if (dist < 80) {
      this.isAiming = true;
      this.aimStart = { x, y };
      this.aimEnd = { x, y };
      this.powerMeter.classList.add("visible");
      this.triggerHaptic("light");
    }
  }

  private handleInputMove(x: number, y: number): void {
    if (!this.isAiming || !this.projectile || !this.projectileAnchor) return;

    this.aimEnd = { x, y };

    // Calculate pull distance (opposite direction of aim)
    const dx = this.projectileAnchor.x - x;
    const dy = this.projectileAnchor.y - y;
    this.pullDistance = Math.min(Math.hypot(dx, dy), CONFIG.MAX_PULL_DISTANCE);

    // Move projectile (pulled back)
    const angle = Math.atan2(dy, dx);
    const pullX = this.projectileAnchor.x - Math.cos(angle) * this.pullDistance;
    const pullY = this.projectileAnchor.y - Math.sin(angle) * this.pullDistance;

    Matter.Body.setPosition(this.projectile, { x: pullX, y: pullY });

    // Update power meter
    const power = (this.pullDistance / CONFIG.MAX_PULL_DISTANCE) * 100;
    this.powerFill.style.height = power + "%";

    // Update aim info
    const launchSpeed = (this.pullDistance / CONFIG.MAX_PULL_DISTANCE) * CONFIG.MAX_LAUNCH_SPEED;
    this.aimInfo.textContent = "Power: " + Math.round(power) + "%";
  }

  private handleInputEnd(): void {
    if (!this.isAiming || !this.projectile || !this.projectileAnchor) return;

    this.isAiming = false;
    this.powerMeter.classList.remove("visible");

    // Launch if pulled back enough
    if (this.pullDistance > 20) {
      this.launchProjectile();
    } else {
      // Reset projectile position
      Matter.Body.setPosition(this.projectile, this.projectileAnchor);
    }

    this.pullDistance = 0;
    this.aimInfo.textContent = "";
  }

  private launchProjectile(): void {
    if (!this.projectile || !this.projectileAnchor || !this.elastic) return;

    console.log("[BowmastersGame] Launching projectile");

    this.gameState = "PROJECTILE_FLYING";

    // Remove elastic constraint
    Matter.Composite.remove(this.world, this.elastic);
    this.elastic = null;

    // The projectile will naturally fly due to the elastic constraint being released
    // Limit max speed
    const speed = Matter.Body.getSpeed(this.projectile);
    if (speed > CONFIG.MAX_LAUNCH_SPEED) {
      Matter.Body.setSpeed(this.projectile, CONFIG.MAX_LAUNCH_SPEED);
    }

    this.playSound("launch");
    this.triggerHaptic("medium");

    // Set timeout for projectile
    this.projectileTimeout = window.setTimeout(() => {
      if (this.gameState === "PROJECTILE_FLYING") {
        this.endProjectileFlight();
      }
    }, CONFIG.PROJECTILE_TIMEOUT);
  }

  private endProjectileFlight(): void {
    console.log("[BowmastersGame] Ending projectile flight");

    if (this.projectileTimeout) {
      clearTimeout(this.projectileTimeout);
      this.projectileTimeout = null;
    }

    // Remove projectile
    if (this.projectile) {
      Matter.Composite.remove(this.world, this.projectile);
      this.projectile = null;
    }

    if (this.elastic) {
      Matter.Composite.remove(this.world, this.elastic);
      this.elastic = null;
    }

    // Check if game over
    if (this.gameState === "GAME_OVER") return;

    // Switch turns
    this.currentTurn = this.currentTurn === 1 ? 2 : 1;

    // Delay before next turn
    setTimeout(() => {
      if (this.gameState !== "GAME_OVER") {
        this.startTurn();
      }
    }, CONFIG.TURN_DELAY);
  }

  private triggerGameOver(winner: PlayerTurn): void {
    console.log("[BowmastersGame] Game over! Winner: Player", winner);

    this.gameState = "GAME_OVER";

    // Submit score (winner gets points based on remaining health)
    const winnerPlayer = this.players[winner - 1]!;
    const score = winnerPlayer.health * 10;
    this.submitScore(score);

    // Show game over screen
    setTimeout(() => {
      const winnerText = document.getElementById("winner-text")!;
      winnerText.textContent = "PLAYER " + winner;
      winnerText.style.color = winner === 1 ? CONFIG.PLAYER1_COLOR : CONFIG.PLAYER2_COLOR;
      this.gameOverScreen.classList.add("visible");
      this.triggerHaptic("success");
    }, 1000);
  }

  private createHitEffect(x: number, y: number, color: string): void {
    for (let i = 0; i < CONFIG.HIT_PARTICLE_COUNT; i++) {
      const angle = (Math.PI * 2 * i) / CONFIG.HIT_PARTICLE_COUNT + Math.random() * 0.5;
      const speed = 3 + Math.random() * 5;

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: CONFIG.PARTICLE_LIFE,
        maxLife: CONFIG.PARTICLE_LIFE,
        size: 4 + Math.random() * 6,
        color,
      });
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.3; // Gravity
      p.life -= dt;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  private shakeScreen(intensity: number, duration: number): void {
    this.screenShake = { intensity, duration, time: 0 };
  }

  private updateScreenShake(dt: number): void {
    if (this.screenShake.duration > 0) {
      this.screenShake.time += dt;
      if (this.screenShake.time >= this.screenShake.duration) {
        this.screenShake = { intensity: 0, duration: 0, time: 0 };
      }
    }
  }

  private getScreenShakeOffset(): { x: number; y: number } {
    if (this.screenShake.duration <= 0) return { x: 0, y: 0 };

    const progress = this.screenShake.time / this.screenShake.duration;
    const intensity = this.screenShake.intensity * (1 - progress);

    return {
      x: (Math.random() - 0.5) * intensity * 2,
      y: (Math.random() - 0.5) * intensity * 2,
    };
  }

  // ============= RENDERING =============
  private lastTime: number = 0;

  private render = (time: number = 0): void => {
    const dt = Math.min(time - this.lastTime, 32);
    this.lastTime = time;

    // Update particles
    this.updateParticles(dt);
    this.updateScreenShake(dt);

    // Clear canvas
    this.ctx.save();

    // Apply screen shake
    const shake = this.getScreenShakeOffset();
    this.ctx.translate(shake.x, shake.y);

    // Draw background gradient
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, CONFIG.SKY_GRADIENT_TOP);
    gradient.addColorStop(1, CONFIG.SKY_GRADIENT_BOTTOM);
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(-10, -10, this.width + 20, this.height + 20);

    // Draw stars/background elements
    this.drawBackground();

    // Draw ground
    this.drawGround();

    // Draw players
    this.drawPlayers();

    // Draw projectile and elastic
    this.drawProjectile();

    // Draw trajectory preview when aiming
    if (this.isAiming && this.projectile) {
      this.drawTrajectoryPreview();
    }

    // Draw particles
    this.drawParticles();

    this.ctx.restore();

    requestAnimationFrame(this.render);
  };

  private drawBackground(): void {
    // Draw decorative circles/stars
    this.ctx.fillStyle = "rgba(168, 139, 235, 0.1)";
    for (let i = 0; i < 5; i++) {
      const x = (this.width * (i + 1)) / 6;
      const y = this.height * 0.2 + Math.sin(i * 1.5) * 50;
      const r = 20 + i * 10;
      this.ctx.beginPath();
      this.ctx.arc(x, y, r, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  private drawGround(): void {
    const groundY = this.height - 60;

    // Ground
    this.ctx.fillStyle = CONFIG.GROUND_COLOR;
    this.ctx.fillRect(0, groundY, this.width, 60);

    // Ground top line
    this.ctx.strokeStyle = "#a88beb";
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(0, groundY);
    this.ctx.lineTo(this.width, groundY);
    this.ctx.stroke();

    // Ground texture lines
    this.ctx.strokeStyle = "rgba(168, 139, 235, 0.3)";
    this.ctx.lineWidth = 1;
    for (let i = 0; i < this.width; i += 30) {
      this.ctx.beginPath();
      this.ctx.moveTo(i, groundY + 10);
      this.ctx.lineTo(i + 15, groundY + 50);
      this.ctx.stroke();
    }
  }

  private drawPlayers(): void {
    for (const player of this.players) {
      if (!player) continue;
      this.drawPlayer(player);
    }
  }

  private drawPlayer(player: PlayerCharacter): void {
    const ctx = this.ctx;
    const bodies = player.bodies;

    // Draw legs
    this.drawBodyPart(bodies.leftLeg, player.darkColor);
    this.drawBodyPart(bodies.rightLeg, player.darkColor);

    // Draw arms
    this.drawBodyPart(bodies.leftArm, player.darkColor);
    this.drawBodyPart(bodies.rightArm, player.darkColor);

    // Draw torso
    this.drawBodyPart(bodies.torso, player.color);

    // Draw head
    ctx.save();
    ctx.translate(bodies.head.position.x, bodies.head.position.y);
    ctx.rotate(bodies.head.angle);

    // Head circle
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(0, 0, CONFIG.HEAD_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Head outline
    ctx.strokeStyle = player.darkColor;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Face (simple)
    ctx.fillStyle = "#fff";

    // Eyes
    const eyeOffsetX = player.facingRight ? 5 : -5;
    ctx.beginPath();
    ctx.arc(eyeOffsetX - 6, -3, 4, 0, Math.PI * 2);
    ctx.arc(eyeOffsetX + 6, -3, 4, 0, Math.PI * 2);
    ctx.fill();

    // Pupils
    ctx.fillStyle = "#1a0a2e";
    ctx.beginPath();
    ctx.arc(eyeOffsetX - 5, -2, 2, 0, Math.PI * 2);
    ctx.arc(eyeOffsetX + 7, -2, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawBodyPart(body: Matter.Body, color: string): void {
    const ctx = this.ctx;
    const vertices = body.vertices;

    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color === CONFIG.PLAYER1_COLOR || color === CONFIG.PLAYER2_COLOR ? CONFIG.PLAYER1_DARK : "#1a0a2e";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) {
      ctx.lineTo(vertices[i].x, vertices[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  private drawProjectile(): void {
    if (!this.projectile) return;

    const ctx = this.ctx;
    const pos = this.projectile.position;

    // Draw elastic band when aiming
    if (this.isAiming && this.projectileAnchor) {
      ctx.strokeStyle = "#8B4513";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(this.projectileAnchor.x - 10, this.projectileAnchor.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.moveTo(this.projectileAnchor.x + 10, this.projectileAnchor.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }

    // Draw projectile
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(this.projectile.angle);

    // Projectile glow
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, CONFIG.PROJECTILE_RADIUS * 2);
    glow.addColorStop(0, "rgba(255, 204, 0, 0.4)");
    glow.addColorStop(1, "rgba(255, 204, 0, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, CONFIG.PROJECTILE_RADIUS * 2, 0, Math.PI * 2);
    ctx.fill();

    // Projectile body
    ctx.fillStyle = CONFIG.PROJECTILE_COLOR;
    ctx.beginPath();
    ctx.arc(0, 0, CONFIG.PROJECTILE_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Highlight
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.beginPath();
    ctx.arc(-3, -3, CONFIG.PROJECTILE_RADIUS * 0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawTrajectoryPreview(): void {
    if (!this.projectile || !this.projectileAnchor) return;

    const ctx = this.ctx;
    const pos = this.projectile.position;

    // Calculate launch velocity
    const dx = this.projectileAnchor.x - pos.x;
    const dy = this.projectileAnchor.y - pos.y;
    const dist = Math.hypot(dx, dy);
    const launchSpeed = (dist / CONFIG.MAX_PULL_DISTANCE) * CONFIG.MAX_LAUNCH_SPEED;
    const angle = Math.atan2(dy, dx);

    const vx = Math.cos(angle) * launchSpeed;
    const vy = Math.sin(angle) * launchSpeed;

    // Draw trajectory dots
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    let px = pos.x;
    let py = pos.y;
    let pvx = vx * 2; // Scale for visibility
    let pvy = vy * 2;

    for (let i = 0; i < 20; i++) {
      px += pvx;
      py += pvy;
      pvy += CONFIG.GRAVITY * 1.5; // Apply gravity

      const alpha = 1 - i / 20;
      ctx.globalAlpha = alpha * 0.5;
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();

      // Stop if below ground
      if (py > this.height - 60) break;
    }

    ctx.globalAlpha = 1;
  }

  private drawParticles(): void {
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      this.ctx.globalAlpha = alpha;
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.globalAlpha = 1;
  }

  // ============= AUDIO =============
  private initAudio(): void {
    if (this.audioContext) return;

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      console.log("[BowmastersGame] Audio context initialized");
    } catch (e) {
      console.log("[BowmastersGame] Audio context failed to initialize");
    }
  }

  private playSound(type: "click" | "launch" | "hit" | "thud"): void {
    if (!this.settings.fx || !this.audioContext) return;

    const ctx = this.audioContext;
    const now = ctx.currentTime;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    switch (type) {
      case "click":
        oscillator.frequency.value = 800;
        oscillator.type = "sine";
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialDecayTo?.(0.01, now + 0.05) ||
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        oscillator.start(now);
        oscillator.stop(now + 0.05);
        break;

      case "launch":
        oscillator.frequency.setValueAtTime(200, now);
        oscillator.frequency.exponentialRampToValueAtTime(600, now + 0.15);
        oscillator.type = "sawtooth";
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        oscillator.start(now);
        oscillator.stop(now + 0.2);
        break;

      case "hit":
        oscillator.frequency.value = 150;
        oscillator.type = "square";
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        oscillator.start(now);
        oscillator.stop(now + 0.15);

        // Add noise burst
        const noise = ctx.createOscillator();
        const noiseGain = ctx.createGain();
        noise.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noise.frequency.value = 100;
        noise.type = "sawtooth";
        noiseGain.gain.setValueAtTime(0.2, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        noise.start(now);
        noise.stop(now + 0.1);
        break;

      case "thud":
        oscillator.frequency.value = 80;
        oscillator.type = "sine";
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        oscillator.start(now);
        oscillator.stop(now + 0.2);
        break;
    }
  }

  private triggerHaptic(type: "light" | "medium" | "heavy" | "success" | "error"): void {
    if (!this.settings.haptics) return;

    if (typeof (window as any).triggerHaptic === "function") {
      (window as any).triggerHaptic(type);
    }
  }

  private submitScore(score: number): void {
    console.log("[BowmastersGame] Submitting score:", score);
    if (typeof (window as any).submitScore === "function") {
      (window as any).submitScore(score);
    }
  }

  // ============= SETTINGS =============
  private loadSettings(): void {
    try {
      const saved = localStorage.getItem("bowmasters-settings");
      if (saved) {
        this.settings = { ...this.settings, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.log("[BowmastersGame] Failed to load settings");
    }

    // Update toggle states
    document.getElementById("toggle-music")!.classList.toggle("active", this.settings.music);
    document.getElementById("toggle-fx")!.classList.toggle("active", this.settings.fx);
    document.getElementById("toggle-haptics")!.classList.toggle("active", this.settings.haptics);
  }

  private saveSettings(): void {
    try {
      localStorage.setItem("bowmasters-settings", JSON.stringify(this.settings));
    } catch (e) {
      console.log("[BowmastersGame] Failed to save settings");
    }
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
document.addEventListener("DOMContentLoaded", () => {
  new BowmastersGame();
});
