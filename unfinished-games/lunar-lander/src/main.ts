// Lunar Lander - A classic arcade game using Matter.js physics
// Land safely on the designated pads while managing fuel and velocity

import Matter from 'matter-js';

const { Engine, World, Bodies, Body, Events, Composite, Vector } = Matter;

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface TerrainSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isLandingPad: boolean;
  multiplier: number; // Score multiplier for landing pads
}

interface LandingPad {
  x: number;
  y: number;
  width: number;
  multiplier: number;
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

interface ExplosionParticle extends Particle {
  angle: number;
  speed: number;
}

type GamePhase = 'start' | 'playing' | 'landed' | 'crashed' | 'gameOver';

// ============================================================================
// CONSTANTS
// ============================================================================

// Physics
const GRAVITY = 0.08; // Moon gravity (lower than Earth)
const THRUST_POWER = 0.012;
const ROTATION_SPEED = 0.04;
const MAX_ROTATION_VELOCITY = 0.08;

// Lander dimensions
const LANDER_WIDTH = 40;
const LANDER_HEIGHT = 50;

// Landing constraints
const MAX_LANDING_VELOCITY_Y = 2.0; // Max vertical velocity for safe landing
const MAX_LANDING_VELOCITY_X = 1.5; // Max horizontal velocity for safe landing
const MAX_LANDING_ANGLE = 0.25; // Max angle in radians (~14 degrees)

// Fuel
const INITIAL_FUEL = 100;
const FUEL_CONSUMPTION_RATE = 0.15; // Fuel used per frame while thrusting

// Scoring
const BASE_LANDING_SCORE = 100;
const FUEL_BONUS_MULTIPLIER = 10;

// Colors - Retro vector style
const COLORS = {
  background: '#0a0a12',
  terrain: '#00ffcc',
  terrainFill: 'rgba(0, 255, 204, 0.05)',
  lander: '#c0c0c0',
  landerStroke: '#00ffcc',
  landingPad: '#00ff00',
  landingPadGlow: 'rgba(0, 255, 0, 0.3)',
  thrust: '#ff6600',
  thrustGlow: '#ffcc00',
  text: '#00ffcc',
  warning: '#ff6600',
  danger: '#ff3333',
  stars: 'rgba(255, 255, 255, 0.8)',
};

// ============================================================================
// GAME STATE
// ============================================================================

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

let engine: Matter.Engine;
let world: Matter.World;

let gamePhase: GamePhase = 'start';
let score = 0;
let successfulLandings = 0;
let fuel = INITIAL_FUEL;

let landerBody: Matter.Body;
let terrainBodies: Matter.Body[] = [];
let terrainSegments: TerrainSegment[] = [];
let landingPads: LandingPad[] = [];

let thrustParticles: Particle[] = [];
let explosionParticles: ExplosionParticle[] = [];
let stars: { x: number; y: number; size: number; brightness: number }[] = [];

// Input state
let thrustActive = false;
let rotateLeft = false;
let rotateRight = false;

// Layout
let w = 0;
let h = 0;
let isMobile = false;

// Camera (for following lander)
let cameraY = 0;
let targetCameraY = 0;

// Level
let currentLevel = 1;

// ============================================================================
// INITIALIZATION
// ============================================================================

function init(): void {
  console.log('[init] Starting Lunar Lander game');
  
  canvas = document.getElementById('game') as HTMLCanvasElement;
  ctx = canvas.getContext('2d')!;
  
  isMobile = window.matchMedia('(pointer: coarse)').matches;
  
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  
  setupInputHandlers();
  setupUIHandlers();
  
  generateStars();
  
  requestAnimationFrame(gameLoop);
}

function resizeCanvas(): void {
  w = window.innerWidth;
  h = window.innerHeight;
  canvas.width = w;
  canvas.height = h;
  
  console.log('[resizeCanvas] Canvas resized to', w, 'x', h);
}

function generateStars(): void {
  console.log('[generateStars] Generating star field');
  stars = [];
  const starCount = Math.floor((w * h) / 3000);
  
  for (let i = 0; i < starCount; i++) {
    stars.push({
      x: Math.random() * w,
      y: Math.random() * h * 3, // Extended height for scrolling
      size: Math.random() * 1.5 + 0.5,
      brightness: Math.random() * 0.5 + 0.5,
    });
  }
}

function initPhysics(): void {
  console.log('[initPhysics] Creating Matter.js engine');
  
  engine = Engine.create({
    gravity: { x: 0, y: GRAVITY },
  });
  world = engine.world;
  
  generateTerrain();
  createLander();
  
  Events.on(engine, 'collisionStart', handleCollision);
}

function generateTerrain(): void {
  console.log('[generateTerrain] Generating procedural terrain');
  
  terrainSegments = [];
  terrainBodies = [];
  landingPads = [];
  
  const terrainBaseY = h * 0.85; // Base terrain level
  
  // Determine landing pad positions (2-3 pads)
  const padCount = Math.min(2 + Math.floor(currentLevel / 3), 4);
  const padPositions: number[] = [];
  
  // Distribute pads across the terrain
  for (let i = 0; i < padCount; i++) {
    const zone = w / padCount;
    const padX = zone * i + zone * 0.3 + Math.random() * zone * 0.4;
    padPositions.push(padX);
  }
  
  // Landing pad widths get smaller with level
  const basePadWidth = Math.max(70, 130 - currentLevel * 8);
  
  let x = -20; // Start slightly off-screen
  let currentY = terrainBaseY;
  
  while (x < w + 80) {
    // Check if we should place a landing pad here
    let isLandingPad = false;
    let padMultiplier = 1;
    let segmentWidth = 30 + Math.random() * 40;
    
    for (let i = 0; i < padPositions.length; i++) {
      if (Math.abs(x + segmentWidth / 2 - padPositions[i]) < basePadWidth) {
        isLandingPad = true;
        segmentWidth = basePadWidth - (i * 10); // Smaller pads = higher multiplier
        padMultiplier = 2 + i; // 2x, 3x, 4x multipliers
        
        // Remove this position so we dont make duplicate pads
        padPositions.splice(i, 1);
        
        // Set currentY to a reasonable landing height for this pad
        currentY = terrainBaseY + (Math.random() - 0.3) * 60;
        currentY = Math.max(terrainBaseY - 50, Math.min(h - 40, currentY));
        
        landingPads.push({
          x: x + segmentWidth / 2,
          y: currentY,
          width: segmentWidth,
          multiplier: padMultiplier,
        });
        break;
      }
    }
    
    // Calculate next Y position (flat for landing pads)
    let nextY: number;
    if (isLandingPad) {
      nextY = currentY; // Flat surface
    } else {
      // Jagged terrain with varying heights
      const maxHeight = 60 + currentLevel * 8;
      nextY = currentY + (Math.random() - 0.5) * maxHeight;
      nextY = Math.max(terrainBaseY - 80, Math.min(h - 30, nextY));
    }
    
    terrainSegments.push({
      x1: x,
      y1: currentY,
      x2: x + segmentWidth,
      y2: isLandingPad ? currentY : nextY,
      isLandingPad,
      multiplier: padMultiplier,
    });
    
    // Create physics body for this segment - position it correctly
    const midX = x + segmentWidth / 2;
    const y1 = currentY;
    const y2 = isLandingPad ? currentY : nextY;
    const midY = (y1 + y2) / 2;
    const dx = segmentWidth;
    const dy = y2 - y1;
    const segmentLength = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    
    const terrainBody = Bodies.rectangle(midX, midY, segmentLength + 4, 20, {
      isStatic: true,
      angle: angle,
      friction: 0.9,
      label: isLandingPad ? 'landingPad' : 'terrain',
      render: { visible: false },
    });
    
    terrainBodies.push(terrainBody);
    World.add(world, terrainBody);
    
    x += segmentWidth;
    currentY = isLandingPad ? currentY : nextY;
  }
  
  // Add floor at bottom to catch anything that falls through
  const floor = Bodies.rectangle(w / 2, h + 50, w + 200, 100, { 
    isStatic: true, 
    label: 'terrain',
  });
  World.add(world, floor);
  
  // Add walls to keep lander in bounds
  const leftWall = Bodies.rectangle(-20, h / 2, 40, h * 3, { isStatic: true, label: 'wall' });
  const rightWall = Bodies.rectangle(w + 20, h / 2, 40, h * 3, { isStatic: true, label: 'wall' });
  World.add(world, [leftWall, rightWall]);
  
  console.log('[generateTerrain] Created', terrainSegments.length, 'segments with', landingPads.length, 'landing pads');
}

function createLander(): void {
  console.log('[createLander] Creating lander');
  
  // Start position - top center with plenty of height above terrain
  const startX = w / 2 + (Math.random() - 0.5) * w * 0.4; // Random horizontal position
  const startY = 80; // Fixed position near top
  
  console.log('[createLander] Spawning at', startX.toFixed(0), startY, 'terrain base at', (h * 0.85).toFixed(0));
  
  // Create lander body as a simple rectangle (more predictable physics)
  landerBody = Bodies.rectangle(startX, startY, LANDER_WIDTH, LANDER_HEIGHT, {
    friction: 0.8,
    frictionAir: 0.005, // Less air friction for moon-like feel
    restitution: 0.05,
    density: 0.001,
    label: 'lander',
    chamfer: { radius: 3 },
  });
  
  // Start with zero velocity
  Body.setVelocity(landerBody, { x: 0, y: 0 });
  Body.setAngularVelocity(landerBody, 0);
  
  World.add(world, landerBody);
  
  console.log('[createLander] Lander body created at', landerBody.position.x.toFixed(0), landerBody.position.y.toFixed(0));
}

// Track game start time to ignore early collisions
let gameStartTime = 0;
const COLLISION_GRACE_PERIOD = 500; // ms to ignore collisions after game starts

function handleCollision(event: Matter.IEventCollision<Matter.Engine>): void {
  if (gamePhase !== 'playing') return;
  
  // Ignore collisions in the first 500ms (allow physics to settle)
  if (performance.now() - gameStartTime < COLLISION_GRACE_PERIOD) {
    console.log('[handleCollision] Ignoring early collision (grace period)');
    return;
  }
  
  for (const pair of event.pairs) {
    const labels = [pair.bodyA.label, pair.bodyB.label];
    
    if (!labels.includes('lander')) continue;
    
    const otherLabel = labels.find(l => l !== 'lander')!;
    
    // Get landing velocity
    const velocity = landerBody.velocity;
    const angle = landerBody.angle;
    
    console.log('[handleCollision] Lander hit', otherLabel, 
      'at pos:', landerBody.position.x.toFixed(0), landerBody.position.y.toFixed(0),
      'vel:', velocity.y.toFixed(2), 'angle:', angle.toFixed(2));
    
    if (otherLabel === 'landingPad') {
      // Check if landing is safe
      if (
        Math.abs(velocity.y) <= MAX_LANDING_VELOCITY_Y &&
        Math.abs(velocity.x) <= MAX_LANDING_VELOCITY_X &&
        Math.abs(angle) <= MAX_LANDING_ANGLE
      ) {
        // Safe landing!
        handleSuccessfulLanding();
      } else {
        // Crashed on landing pad - too fast or wrong angle
        console.log('[handleCollision] Crash on pad - velY:', velocity.y.toFixed(2), 
          'velX:', velocity.x.toFixed(2), 'angle:', (angle * 180 / Math.PI).toFixed(1) + 'deg');
        handleCrash();
      }
    } else if (otherLabel === 'terrain' || otherLabel === 'wall') {
      // Crashed on terrain
      handleCrash();
    }
  }
}

function handleSuccessfulLanding(): void {
  console.log('[handleSuccessfulLanding] Safe landing!');
  
  gamePhase = 'landed';
  successfulLandings++;
  
  // Find which landing pad we landed on
  const landerX = landerBody.position.x;
  let multiplier = 1;
  for (const pad of landingPads) {
    if (Math.abs(landerX - pad.x) < pad.width / 2) {
      multiplier = pad.multiplier;
      break;
    }
  }
  
  // Calculate score
  const landingScore = BASE_LANDING_SCORE * multiplier;
  const fuelBonus = Math.floor(fuel * FUEL_BONUS_MULTIPLIER);
  score += landingScore + fuelBonus;
  
  console.log('[handleSuccessfulLanding] Score:', landingScore, '+ fuel bonus:', fuelBonus);
  
  // Continue to next level after a delay
  setTimeout(() => {
    if (gamePhase === 'landed') {
      nextLevel();
    }
  }, 2000);
}

function handleCrash(): void {
  console.log('[handleCrash] Crashed!');
  
  gamePhase = 'crashed';
  
  // Create explosion
  createExplosion(landerBody.position.x, landerBody.position.y);
  
  // End game after explosion
  setTimeout(() => {
    if (gamePhase === 'crashed') {
      endGame();
    }
  }, 1500);
}

function createExplosion(x: number, y: number): void {
  console.log('[createExplosion] Creating explosion at', x, y);
  
  const particleCount = 50;
  for (let i = 0; i < particleCount; i++) {
    const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.5;
    const speed = 3 + Math.random() * 8;
    
    explosionParticles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      maxLife: 0.8 + Math.random() * 0.4,
      size: 2 + Math.random() * 4,
      color: Math.random() > 0.5 ? COLORS.thrust : COLORS.thrustGlow,
      angle,
      speed,
    });
  }
}

function nextLevel(): void {
  console.log('[nextLevel] Advancing to level', currentLevel + 1);
  
  currentLevel++;
  
  // Clear old physics
  World.clear(world, false);
  Engine.clear(engine);
  
  // Reinitialize with new terrain
  engine = Engine.create({
    gravity: { x: 0, y: GRAVITY },
  });
  world = engine.world;
  
  generateTerrain();
  createLander();
  
  Events.on(engine, 'collisionStart', handleCollision);
  
  gamePhase = 'playing';
}

// ============================================================================
// INPUT HANDLING
// ============================================================================

function setupInputHandlers(): void {
  // Keyboard
  window.addEventListener('keydown', (e) => {
    if (gamePhase !== 'playing') return;
    
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      thrustActive = true;
    }
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      rotateLeft = true;
    }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      rotateRight = true;
    }
  });
  
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      thrustActive = false;
    }
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      rotateLeft = false;
    }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      rotateRight = false;
    }
  });
  
  // Mobile controls
  const btnThrust = document.getElementById('btn-thrust')!;
  const btnLeft = document.getElementById('btn-left')!;
  const btnRight = document.getElementById('btn-right')!;
  
  // Thrust button
  btnThrust.addEventListener('touchstart', (e) => { e.preventDefault(); thrustActive = true; btnThrust.classList.add('active'); }, { passive: false });
  btnThrust.addEventListener('touchend', () => { thrustActive = false; btnThrust.classList.remove('active'); });
  btnThrust.addEventListener('touchcancel', () => { thrustActive = false; btnThrust.classList.remove('active'); });
  btnThrust.addEventListener('mousedown', () => { thrustActive = true; btnThrust.classList.add('active'); });
  btnThrust.addEventListener('mouseup', () => { thrustActive = false; btnThrust.classList.remove('active'); });
  btnThrust.addEventListener('mouseleave', () => { thrustActive = false; btnThrust.classList.remove('active'); });
  
  // Left rotation
  btnLeft.addEventListener('touchstart', (e) => { e.preventDefault(); rotateLeft = true; btnLeft.classList.add('active'); }, { passive: false });
  btnLeft.addEventListener('touchend', () => { rotateLeft = false; btnLeft.classList.remove('active'); });
  btnLeft.addEventListener('touchcancel', () => { rotateLeft = false; btnLeft.classList.remove('active'); });
  btnLeft.addEventListener('mousedown', () => { rotateLeft = true; btnLeft.classList.add('active'); });
  btnLeft.addEventListener('mouseup', () => { rotateLeft = false; btnLeft.classList.remove('active'); });
  btnLeft.addEventListener('mouseleave', () => { rotateLeft = false; btnLeft.classList.remove('active'); });
  
  // Right rotation
  btnRight.addEventListener('touchstart', (e) => { e.preventDefault(); rotateRight = true; btnRight.classList.add('active'); }, { passive: false });
  btnRight.addEventListener('touchend', () => { rotateRight = false; btnRight.classList.remove('active'); });
  btnRight.addEventListener('touchcancel', () => { rotateRight = false; btnRight.classList.remove('active'); });
  btnRight.addEventListener('mousedown', () => { rotateRight = true; btnRight.classList.add('active'); });
  btnRight.addEventListener('mouseup', () => { rotateRight = false; btnRight.classList.remove('active'); });
  btnRight.addEventListener('mouseleave', () => { rotateRight = false; btnRight.classList.remove('active'); });
}

function setupUIHandlers(): void {
  const startBtn = document.getElementById('start-btn')!;
  const restartBtn = document.getElementById('restart-btn')!;
  
  startBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', restartGame);
}

// ============================================================================
// GAME CONTROL
// ============================================================================

function startGame(): void {
  console.log('[startGame] Starting game');
  
  gamePhase = 'playing';
  score = 0;
  successfulLandings = 0;
  fuel = INITIAL_FUEL;
  currentLevel = 1;
  cameraY = 0;
  targetCameraY = 0;
  
  thrustParticles = [];
  explosionParticles = [];
  
  initPhysics();
  
  // Reset input state
  thrustActive = false;
  rotateLeft = false;
  rotateRight = false;
  
  // Show HUD and controls
  document.getElementById('start-screen')!.classList.add('hidden');
  document.getElementById('hud')!.classList.remove('hidden');
  if (isMobile) {
    document.getElementById('controls')!.classList.remove('hidden');
  }
}

function restartGame(): void {
  console.log('[restartGame] Restarting game');
  
  document.getElementById('game-over')!.classList.add('hidden');
  startGame();
}

function endGame(): void {
  console.log('[endGame] Game over, score:', score);
  
  gamePhase = 'gameOver';
  
  // Submit score
  if (typeof (window as any).submitScore === 'function') {
    (window as any).submitScore(score);
  }
  
  // Update UI
  document.getElementById('hud')!.classList.add('hidden');
  document.getElementById('controls')!.classList.add('hidden');
  
  const resultTitle = document.getElementById('result-title')!;
  if (successfulLandings > 0) {
    resultTitle.textContent = 'MISSION COMPLETE';
    resultTitle.className = 'success';
  } else {
    resultTitle.textContent = 'MISSION FAILED';
    resultTitle.className = 'crash';
  }
  
  document.getElementById('final-score')!.textContent = score.toString();
  document.getElementById('landings-count')!.textContent = successfulLandings.toString();
  document.getElementById('fuel-remaining')!.textContent = Math.floor(fuel) + '%';
  
  document.getElementById('game-over')!.classList.remove('hidden');
}

// ============================================================================
// GAME LOOP
// ============================================================================

let lastTime = 0;

function gameLoop(currentTime: number): void {
  if (lastTime === 0) {
    lastTime = currentTime;
  }
  
  const deltaTime = Math.min(currentTime - lastTime, 32); // Cap delta
  lastTime = currentTime;
  
  update(deltaTime);
  render();
  
  requestAnimationFrame(gameLoop);
}

function update(dt: number): void {
  if (gamePhase === 'playing') {
    // Apply rotation
    if (rotateLeft) {
      const newAngVel = Math.max(-MAX_ROTATION_VELOCITY, landerBody.angularVelocity - ROTATION_SPEED);
      Body.setAngularVelocity(landerBody, newAngVel);
    }
    if (rotateRight) {
      const newAngVel = Math.min(MAX_ROTATION_VELOCITY, landerBody.angularVelocity + ROTATION_SPEED);
      Body.setAngularVelocity(landerBody, newAngVel);
    }
    
    // Apply thrust
    if (thrustActive && fuel > 0) {
      const angle = landerBody.angle - Math.PI / 2; // Account for lander pointing up
      const thrustForce = {
        x: Math.cos(angle) * THRUST_POWER,
        y: Math.sin(angle) * THRUST_POWER,
      };
      
      Body.applyForce(landerBody, landerBody.position, thrustForce);
      
      // Consume fuel
      fuel = Math.max(0, fuel - FUEL_CONSUMPTION_RATE);
      
      // Create thrust particles
      createThrustParticles();
    }
    
    // Update physics
    Engine.update(engine, Math.min(dt, 16.667));
    
    // Update camera to follow lander
    targetCameraY = Math.max(0, landerBody.position.y - h * 0.4);
    cameraY += (targetCameraY - cameraY) * 0.1;
    
    // Check if lander went off screen
    if (landerBody.position.y > h + 200) {
      handleCrash();
    }
    
    // Update HUD
    updateHUD();
  }
  
  // Update particles
  updateParticles(dt);
}

function createThrustParticles(): void {
  const angle = landerBody.angle + Math.PI / 2; // Opposite of thrust direction
  const exhaustX = landerBody.position.x + Math.cos(angle) * (LANDER_HEIGHT / 2);
  const exhaustY = landerBody.position.y + Math.sin(angle) * (LANDER_HEIGHT / 2);
  
  for (let i = 0; i < 3; i++) {
    const spread = (Math.random() - 0.5) * 0.5;
    const particleAngle = angle + spread;
    const speed = 3 + Math.random() * 4;
    
    thrustParticles.push({
      x: exhaustX + (Math.random() - 0.5) * 10,
      y: exhaustY + (Math.random() - 0.5) * 10,
      vx: Math.cos(particleAngle) * speed + landerBody.velocity.x * 0.5,
      vy: Math.sin(particleAngle) * speed + landerBody.velocity.y * 0.5,
      life: 1,
      maxLife: 0.3 + Math.random() * 0.2,
      size: 2 + Math.random() * 4,
      color: Math.random() > 0.3 ? COLORS.thrust : COLORS.thrustGlow,
    });
  }
}

function updateParticles(dt: number): void {
  const dtSeconds = dt / 1000;
  
  // Update thrust particles
  for (const p of thrustParticles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += GRAVITY * 2; // Particles affected by gravity
    p.life -= dtSeconds / p.maxLife;
  }
  thrustParticles = thrustParticles.filter(p => p.life > 0);
  
  // Update explosion particles
  for (const p of explosionParticles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += GRAVITY;
    p.vx *= 0.98;
    p.vy *= 0.98;
    p.life -= dtSeconds / p.maxLife;
  }
  explosionParticles = explosionParticles.filter(p => p.life > 0);
}

function updateHUD(): void {
  const altitude = Math.max(0, Math.floor(h - landerBody.position.y - 50));
  const velY = landerBody.velocity.y;
  const velX = landerBody.velocity.x;
  
  document.getElementById('altitude')!.textContent = 'ALT: ' + altitude + 'm';
  
  // Velocity Y with color coding
  const velYEl = document.getElementById('velocity-y')!;
  velYEl.textContent = 'VEL-Y: ' + velY.toFixed(1);
  if (Math.abs(velY) > MAX_LANDING_VELOCITY_Y * 1.5) {
    velYEl.className = 'hud-item danger';
  } else if (Math.abs(velY) > MAX_LANDING_VELOCITY_Y) {
    velYEl.className = 'hud-item warning';
  } else {
    velYEl.className = 'hud-item';
  }
  
  // Velocity X with color coding
  const velXEl = document.getElementById('velocity-x')!;
  velXEl.textContent = 'VEL-X: ' + velX.toFixed(1);
  if (Math.abs(velX) > MAX_LANDING_VELOCITY_X * 1.5) {
    velXEl.className = 'hud-item danger';
  } else if (Math.abs(velX) > MAX_LANDING_VELOCITY_X) {
    velXEl.className = 'hud-item warning';
  } else {
    velXEl.className = 'hud-item';
  }
  
  // Fuel
  const fuelEl = document.getElementById('fuel')!;
  fuelEl.textContent = 'FUEL: ' + Math.floor(fuel) + '%';
  if (fuel < 20) {
    fuelEl.className = 'hud-item danger';
  } else if (fuel < 40) {
    fuelEl.className = 'hud-item warning';
  } else {
    fuelEl.className = 'hud-item';
  }
  
  document.getElementById('fuel-bar')!.style.width = fuel + '%';
  document.getElementById('score-display')!.textContent = 'SCORE: ' + score;
}

// ============================================================================
// RENDERING
// ============================================================================

function render(): void {
  // Clear with space background
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, w, h);
  
  // Draw stars (parallax)
  drawStars();
  
  ctx.save();
  ctx.translate(0, -cameraY);
  
  // Draw terrain
  drawTerrain();
  
  // Draw landing pads
  drawLandingPads();
  
  // Draw particles
  drawParticles();
  
  // Draw lander
  if (gamePhase === 'playing' || gamePhase === 'landed') {
    drawLander();
  }
  
  ctx.restore();
  
  // Draw level indicator during play
  if (gamePhase === 'playing' || gamePhase === 'landed') {
    ctx.fillStyle = COLORS.text;
    ctx.font = '14px "Orbitron", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LEVEL ' + currentLevel, w / 2, 30);
  }
  
  // Draw success message
  if (gamePhase === 'landed') {
    drawSuccessMessage();
  }
}

function drawStars(): void {
  for (const star of stars) {
    const parallaxY = star.y - cameraY * 0.3;
    const screenY = ((parallaxY % (h * 2)) + h * 2) % (h * 2);
    
    ctx.fillStyle = 'rgba(255, 255, 255, ' + (star.brightness * 0.8) + ')';
    ctx.beginPath();
    ctx.arc(star.x, screenY, star.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTerrain(): void {
  // Draw terrain fill
  ctx.fillStyle = COLORS.terrainFill;
  ctx.beginPath();
  ctx.moveTo(0, h + 100);
  
  for (const seg of terrainSegments) {
    ctx.lineTo(seg.x1, seg.y1);
  }
  if (terrainSegments.length > 0) {
    const lastSeg = terrainSegments[terrainSegments.length - 1];
    ctx.lineTo(lastSeg.x2, lastSeg.y2);
  }
  ctx.lineTo(w + 50, h + 100);
  ctx.closePath();
  ctx.fill();
  
  // Draw terrain outline
  ctx.strokeStyle = COLORS.terrain;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  
  for (let i = 0; i < terrainSegments.length; i++) {
    const seg = terrainSegments[i];
    if (i === 0) {
      ctx.moveTo(seg.x1, seg.y1);
    }
    ctx.lineTo(seg.x2, seg.y2);
  }
  ctx.stroke();
}

function drawLandingPads(): void {
  for (const pad of landingPads) {
    // Glow effect
    const gradient = ctx.createRadialGradient(pad.x, pad.y, 0, pad.x, pad.y, pad.width);
    gradient.addColorStop(0, COLORS.landingPadGlow);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(pad.x - pad.width, pad.y - 30, pad.width * 2, 60);
    
    // Landing pad line
    ctx.strokeStyle = COLORS.landingPad;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(pad.x - pad.width / 2, pad.y);
    ctx.lineTo(pad.x + pad.width / 2, pad.y);
    ctx.stroke();
    
    // Multiplier text
    ctx.fillStyle = COLORS.landingPad;
    ctx.font = 'bold 14px "Orbitron", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pad.multiplier + 'X', pad.x, pad.y + 25);
  }
}

function drawParticles(): void {
  // Thrust particles
  for (const p of thrustParticles) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.life;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  
  // Explosion particles
  for (const p of explosionParticles) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.life;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawLander(): void {
  ctx.save();
  ctx.translate(landerBody.position.x, landerBody.position.y);
  ctx.rotate(landerBody.angle);
  
  const halfW = LANDER_WIDTH / 2;
  const halfH = LANDER_HEIGHT / 2;
  
  // Draw thrust flame when active
  if (thrustActive && fuel > 0) {
    const flameLength = 25 + Math.random() * 20;
    const flameWidth = 12 + Math.random() * 6;
    
    // Main flame
    const gradient = ctx.createLinearGradient(0, halfH, 0, halfH + flameLength);
    gradient.addColorStop(0, COLORS.thrustGlow);
    gradient.addColorStop(0.4, COLORS.thrust);
    gradient.addColorStop(1, 'transparent');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(-flameWidth, halfH);
    ctx.lineTo(flameWidth, halfH);
    ctx.lineTo(0, halfH + flameLength);
    ctx.closePath();
    ctx.fill();
    
    // Inner bright core
    const innerLength = flameLength * 0.6;
    ctx.fillStyle = 'rgba(255, 255, 200, 0.8)';
    ctx.beginPath();
    ctx.moveTo(-flameWidth * 0.4, halfH);
    ctx.lineTo(flameWidth * 0.4, halfH);
    ctx.lineTo(0, halfH + innerLength);
    ctx.closePath();
    ctx.fill();
  }
  
  // Draw lander body (classic lunar module style)
  ctx.strokeStyle = COLORS.landerStroke;
  ctx.lineWidth = 2;
  
  // === ASCENT STAGE (top triangular section) ===
  ctx.fillStyle = '#b8b8b8';
  ctx.beginPath();
  ctx.moveTo(0, -halfH - 8); // Apex
  ctx.lineTo(halfW * 0.7, -halfH * 0.2);
  ctx.lineTo(-halfW * 0.7, -halfH * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // === DESCENT STAGE (bottom octagonal section) ===
  ctx.fillStyle = '#909090';
  const dsTop = -halfH * 0.2;
  const dsBottom = halfH * 0.5;
  const dsWidth = halfW * 0.8;
  
  ctx.beginPath();
  ctx.moveTo(-dsWidth, dsTop);
  ctx.lineTo(dsWidth, dsTop);
  ctx.lineTo(dsWidth * 1.1, dsBottom);
  ctx.lineTo(-dsWidth * 1.1, dsBottom);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // === LANDING LEGS ===
  ctx.strokeStyle = COLORS.landerStroke;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  
  // Left leg
  ctx.beginPath();
  ctx.moveTo(-dsWidth * 0.8, dsBottom);
  ctx.lineTo(-halfW - 8, halfH);
  ctx.stroke();
  
  // Left strut
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-dsWidth * 0.3, dsBottom);
  ctx.lineTo(-halfW - 5, halfH - 5);
  ctx.stroke();
  
  // Right leg
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(dsWidth * 0.8, dsBottom);
  ctx.lineTo(halfW + 8, halfH);
  ctx.stroke();
  
  // Right strut
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(dsWidth * 0.3, dsBottom);
  ctx.lineTo(halfW + 5, halfH - 5);
  ctx.stroke();
  
  // === FOOT PADS ===
  ctx.fillStyle = COLORS.landerStroke;
  ctx.beginPath();
  ctx.ellipse(-halfW - 8, halfH + 2, 6, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(halfW + 8, halfH + 2, 6, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // === WINDOW ===
  ctx.fillStyle = '#1a2a3a';
  ctx.strokeStyle = COLORS.landerStroke;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, -halfH * 0.5, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  
  // Window reflection
  ctx.fillStyle = 'rgba(100, 200, 255, 0.3)';
  ctx.beginPath();
  ctx.arc(-2, -halfH * 0.5 - 2, 3, 0, Math.PI * 2);
  ctx.fill();
  
  // === ANTENNA ===
  ctx.strokeStyle = COLORS.landerStroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -halfH - 8);
  ctx.lineTo(0, -halfH - 20);
  ctx.stroke();
  
  // Antenna dish
  ctx.fillStyle = COLORS.landerStroke;
  ctx.beginPath();
  ctx.arc(0, -halfH - 22, 4, 0, Math.PI * 2);
  ctx.fill();
  
  // === RCS THRUSTERS (decorative) ===
  ctx.fillStyle = '#666';
  ctx.fillRect(-halfW * 0.7 - 4, -halfH * 0.4, 4, 6);
  ctx.fillRect(halfW * 0.7, -halfH * 0.4, 4, 6);
  
  ctx.restore();
}

function drawSuccessMessage(): void {
  ctx.fillStyle = 'rgba(0, 255, 204, 0.9)';
  ctx.font = 'bold 32px "Orbitron", sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0, 255, 204, 0.5)';
  ctx.shadowBlur = 20;
  ctx.fillText('SAFE LANDING!', w / 2, h / 2 - 50);
  ctx.shadowBlur = 0;
  
  ctx.font = '18px "Space Mono", monospace';
  ctx.fillText('Preparing for next level...', w / 2, h / 2);
}

// ============================================================================
// START GAME
// ============================================================================

init();
