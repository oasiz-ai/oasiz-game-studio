/**
 * HELIX JUMP - A polished Helix Jump clone
 *
 * Features:
 * - 2.5D pseudo-3D rendering of a cylindrical tower
 * - Gravity-based ball physics with satisfying bounces
 * - Touch/drag and keyboard controls to rotate tower
 * - Combo system for passing through multiple gaps
 * - Beautiful gradient backgrounds that shift as you descend
 * - Particles, screen shake, and haptic feedback
 */

// ============= CONFIGURATION =============
const CONFIG = {
  // Ball physics
  BALL_RADIUS: 22,
  BALL_GRAVITY: 0.5,
  BALL_BOUNCE_VY: -13,
  BALL_MAX_VY: 18,
  BALL_X_DAMPING: 0.98,

  // Tower - 3D HELIX STYLE
  TOWER_RADIUS: 0.38, // Ratio of screen width for the tower outer edge
  PILLAR_RADIUS: 0.08, // Inner pillar radius ratio
  RING_SPACING: 70, // Vertical spacing between rings in world units
  SEGMENTS_PER_RING: 12,
  RING_HEIGHT: 25, // Visual height/thickness of each ring slab
  GAP_MIN: 2, // Minimum gap segments
  GAP_MAX: 4, // Maximum gap segments
  DANGER_CHANCE: 0.15, // Chance of danger segment appearing
  INITIAL_RINGS: 50,

  // Camera
  CAMERA_SMOOTHING: 0.08,
  CAMERA_LOOK_AHEAD: 150, // How far ahead of ball to look

  // Controls
  ROTATION_SPEED: 0.004, // Radians per pixel dragged
  KEYBOARD_ROTATION_SPEED: 0.05,

  // 3D Perspective
  PERSPECTIVE_RATIO: 0.4, // How squashed ellipses are (0 = flat line, 1 = circle)
  SCALE_PER_RING: 0.03, // How much each ring shrinks going down
  VISIBLE_RINGS_BELOW: 12, // How many rings visible below current

  // Visual - HELIX JUMP STYLE COLORS
  RING_COLOR: "#4A4A5A", // Dark gray rings
  RING_SIDE_COLOR: "#3A3A4A", // Darker side of rings
  RING_HIGHLIGHT: "#5A5A6A", // Top edge highlight
  DANGER_COLOR: "#E74C3C", // Red danger segments
  DANGER_SIDE_COLOR: "#C0392B",
  PILLAR_COLOR: "#F5F5F5", // White/light gray pillar

  // Particles
  PARTICLE_COUNT: 12,
  PARTICLE_LIFE: 500,

  // Combo
  COMBO_TIMEOUT: 1500,
};

// ============= TYPES =============
type GameState = "START" | "PLAYING" | "PAUSED" | "GAME_OVER";
type SegmentType = "solid" | "gap" | "danger";

interface Segment {
  type: SegmentType;
}

interface Ring {
  y: number;
  segments: Segment[];
  passed: boolean;
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
  type?: "bounce" | "combo" | "star" | "trail";
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  color: string;
  scale: number;
}

interface TrailPoint {
  x: number;
  y: number;
  alpha: number;
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

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
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
const scoreDisplay = document.getElementById("scoreDisplay")!;
const currentScoreEl = document.getElementById("currentScore")!;
const comboDisplayEl = document.getElementById("comboDisplay")!;
const startBestScore = document.getElementById("startBestScore")!;
const finalScore = document.getElementById("finalScore")!;
const newBestBadge = document.getElementById("newBestBadge")!;

// State
let gameState: GameState = "START";
let w = window.innerWidth;
let h = window.innerHeight;
const isMobile = window.matchMedia("(pointer: coarse)").matches;

// Tower
let rings: Ring[] = [];
let towerRotation = 0;
let towerRadius = w * CONFIG.TOWER_RADIUS;

// Ball
let ballX = 0; // Relative to tower center (angle offset)
let ballY = 0; // World Y position
let ballVY = 0;
let ballAngle = 0; // Ball's angle position on the tower

// Camera
let cameraY = 0;
let targetCameraY = 0;

// Score
let score = 0;
let bestScore = parseInt(localStorage.getItem("helixJump_bestScore") || "0");
let combo = 0;
let lastBounceTime = 0;

// Particles
let particles: Particle[] = [];

// Floating texts (score popups)
let floatingTexts: FloatingText[] = [];

// Ball trail
let ballTrail: TrailPoint[] = [];

// Ball squash/stretch for juicy bounce
let ballScaleX = 1;
let ballScaleY = 1;
let ballScaleTime = 0;

// Screen flash effect
let screenFlashAlpha = 0;
let screenFlashColor = "#FFE66D";

// Background stars
let backgroundStars: { x: number; y: number; size: number; twinkle: number }[] = [];

// Screen shake
let shakeIntensity = 0;
let shakeDecay = 0.9;

// Settings
let settings: Settings = {
  music: localStorage.getItem("helixJump_music") !== "false",
  fx: localStorage.getItem("helixJump_fx") !== "false",
  haptics: localStorage.getItem("helixJump_haptics") !== "false",
};

// Input state
let keysDown: Set<string> = new Set();
let isDragging = false;
let lastDragX = 0;
let dragVelocity = 0;

// Background gradient colors (shift as you descend)
const bgGradients = [
  { top: "#1a1a2e", bottom: "#16213e" },
  { top: "#16213e", bottom: "#0f3460" },
  { top: "#0f3460", bottom: "#1a1a4e" },
  { top: "#1a1a4e", bottom: "#2d1b4e" },
  { top: "#2d1b4e", bottom: "#4a1942" },
  { top: "#4a1942", bottom: "#1a4a4a" },
  { top: "#1a4a4a", bottom: "#1a2a3a" },
];

// ============= RING GENERATION =============
function generateRing(y: number): Ring {
  const segments: Segment[] = [];
  const gapCount = Math.floor(randomRange(CONFIG.GAP_MIN, CONFIG.GAP_MAX + 1));
  const gapStart = Math.floor(Math.random() * CONFIG.SEGMENTS_PER_RING);

  for (let i = 0; i < CONFIG.SEGMENTS_PER_RING; i++) {
    // Check if this segment is in the gap
    let isGap = false;
    for (let g = 0; g < gapCount; g++) {
      if ((gapStart + g) % CONFIG.SEGMENTS_PER_RING === i) {
        isGap = true;
        break;
      }
    }

    if (isGap) {
      segments.push({ type: "gap" });
    } else if (Math.random() < CONFIG.DANGER_CHANCE) {
      segments.push({ type: "danger" });
    } else {
      segments.push({ type: "solid" });
    }
  }

  return { y, segments, passed: false };
}

function generateRingWithGapAt(y: number, gapAtSegment: number): Ring {
  const segments: Segment[] = [];
  const gapCount = Math.floor(randomRange(CONFIG.GAP_MIN, CONFIG.GAP_MAX + 1));

  for (let i = 0; i < CONFIG.SEGMENTS_PER_RING; i++) {
    // Check if this segment should be a gap (centered around gapAtSegment)
    let isGap = false;
    for (let g = 0; g < gapCount; g++) {
      if ((gapAtSegment + g) % CONFIG.SEGMENTS_PER_RING === i) {
        isGap = true;
        break;
      }
    }

    if (isGap) {
      segments.push({ type: "gap" });
    } else if (Math.random() < CONFIG.DANGER_CHANCE) {
      segments.push({ type: "danger" });
    } else {
      segments.push({ type: "solid" });
    }
  }

  return { y, segments, passed: false };
}

function generateInitialRings(): void {
  rings = [];
  // First ring at 200 with gap at segment 0 (where ball starts)
  rings.push(generateRingWithGapAt(200, 0));
  
  // Rest of rings are random
  for (let i = 1; i < CONFIG.INITIAL_RINGS; i++) {
    rings.push(generateRing(i * CONFIG.RING_SPACING + 200));
  }
  console.log("[generateInitialRings] Generated", rings.length, "rings");
}

function addMoreRings(): void {
  if (rings.length === 0) return;
  
  const lastRing = rings[rings.length - 1];
  const ringsNeeded = Math.ceil((cameraY + h * 2) / CONFIG.RING_SPACING) - rings.length;

  for (let i = 0; i < ringsNeeded + 5; i++) {
    const newY = lastRing.y + CONFIG.RING_SPACING * (i + 1);
    rings.push(generateRing(newY));
  }
}

// ============= DRAWING FUNCTIONS =============
function spawnFloatingText(x: number, y: number, text: string, color: string): void {
  floatingTexts.push({
    x,
    y,
    text,
    life: 1000,
    maxLife: 1000,
    color,
    scale: 0.5,
  });
}

function updateFloatingTexts(dt: number): void {
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.y -= 1.5; // Float upward
    ft.life -= dt;
    ft.scale = Math.min(1.2, ft.scale + 0.05); // Pop in effect
    if (ft.life <= 0) {
      floatingTexts.splice(i, 1);
    }
  }
}

function drawFloatingTexts(): void {
  for (const ft of floatingTexts) {
    const alpha = ft.life / ft.maxLife;
    // ft.y is now in screen coordinates already
    
    ctx.save();
    ctx.translate(ft.x, ft.y);
    ctx.scale(ft.scale, ft.scale);
    ctx.font = "bold 28px Outfit";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    // Shadow
    ctx.fillStyle = "rgba(0, 0, 0, " + (alpha * 0.5) + ")";
    ctx.fillText(ft.text, 2, 2);
    
    // Text
    ctx.fillStyle = ft.color.replace(")", ", " + alpha + ")").replace("rgb", "rgba");
    ctx.fillText(ft.text, 0, 0);
    ctx.restore();
  }
}

function drawBackgroundStars(): void {
  const time = Date.now() / 1000;
  
  for (const star of backgroundStars) {
    // Parallax effect - stars move slower than foreground
    const parallaxY = (star.y - cameraY * 0.1) % (h * 2);
    const adjustedY = parallaxY < 0 ? parallaxY + h * 2 : parallaxY;
    
    // Twinkle effect
    const twinkleAlpha = 0.3 + 0.4 * Math.sin(time * 2 + star.twinkle);
    
    ctx.beginPath();
    ctx.arc(star.x, adjustedY, star.size, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, " + twinkleAlpha + ")";
    ctx.fill();
  }
}

function drawBackground(): void {
  // Determine which gradient to use based on camera position
  // Use Math.abs to handle negative cameraY at game start
  const absCamera = Math.max(0, cameraY);
  const gradientIndex = Math.floor(absCamera / 1000) % bgGradients.length;
  const nextIndex = (gradientIndex + 1) % bgGradients.length;
  const t = (absCamera % 1000) / 1000;

  const currentGrad = bgGradients[gradientIndex];
  const nextGrad = bgGradients[nextIndex];

  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, currentGrad.top);
  gradient.addColorStop(1, lerpColor(currentGrad.bottom, nextGrad.bottom, t));

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  
  // Draw background stars
  if (backgroundStars.length > 0) {
    drawBackgroundStars();
  }
  
  // Screen flash effect (for combos)
  if (screenFlashAlpha > 0) {
    ctx.fillStyle = screenFlashColor.replace(")", ", " + screenFlashAlpha + ")").replace("#", "rgba(").replace(/^rgba\(/, function() {
      // Convert hex to rgba
      const hex = screenFlashColor;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return "rgba(" + r + ", " + g + ", " + b + ", " + screenFlashAlpha + ")";
    });
    ctx.fillStyle = "rgba(255, 230, 109, " + screenFlashAlpha + ")";
    ctx.fillRect(0, 0, w, h);
    screenFlashAlpha *= 0.92; // Decay
    if (screenFlashAlpha < 0.01) screenFlashAlpha = 0;
  }
}

function lerpColor(c1: string, c2: string, t: number): string {
  const r1 = parseInt(c1.slice(1, 3), 16);
  const g1 = parseInt(c1.slice(3, 5), 16);
  const b1 = parseInt(c1.slice(5, 7), 16);
  const r2 = parseInt(c2.slice(1, 3), 16);
  const g2 = parseInt(c2.slice(3, 5), 16);
  const b2 = parseInt(c2.slice(5, 7), 16);

  const r = Math.round(lerp(r1, r2, t));
  const g = Math.round(lerp(g1, g2, t));
  const b = Math.round(lerp(b1, b2, t));

  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function drawCentralPillar(): void {
  const centerX = w / 2;
  const pillarRadius = towerRadius * CONFIG.PILLAR_RADIUS / CONFIG.TOWER_RADIUS;
  
  // Ball screen position
  const ballScreenY = h * 0.25;
  
  // Draw pillar from top of screen to bottom
  // Pillar tapers slightly going down for perspective
  const topY = 0;
  const bottomY = h;
  const topRadius = pillarRadius * 1.1;
  const bottomRadius = pillarRadius * 0.7;
  
  // Create gradient for white/light gray 3D cylinder
  const gradient = ctx.createLinearGradient(
    centerX - pillarRadius,
    0,
    centerX + pillarRadius,
    0
  );
  gradient.addColorStop(0, "#D0D0D5");
  gradient.addColorStop(0.3, "#E8E8EC");
  gradient.addColorStop(0.5, CONFIG.PILLAR_COLOR);
  gradient.addColorStop(0.7, "#E8E8EC");
  gradient.addColorStop(1, "#D0D0D5");

  // Draw cylinder body
  ctx.beginPath();
  ctx.moveTo(centerX - topRadius, topY);
  ctx.lineTo(centerX + topRadius, topY);
  ctx.lineTo(centerX + bottomRadius, bottomY);
  ctx.lineTo(centerX - bottomRadius, bottomY);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Subtle edge lines
  ctx.strokeStyle = "rgba(180, 180, 190, 0.6)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(centerX - topRadius, topY);
  ctx.lineTo(centerX - bottomRadius, bottomY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(centerX + topRadius, topY);
  ctx.lineTo(centerX + bottomRadius, bottomY);
  ctx.stroke();
}

// Calculate ring index relative to ball for rendering
function getRingScreenPosition(ringY: number, ballY: number): { screenY: number; scale: number; visible: boolean } {
  const ringsBelowBall = (ringY - ballY) / CONFIG.RING_SPACING;
  
  // Only show rings near the ball
  if (ringsBelowBall < -2 || ringsBelowBall > CONFIG.VISIBLE_RINGS_BELOW) {
    return { screenY: 0, scale: 0, visible: false };
  }
  
  // Ball position on screen (near top)
  const ballScreenY = h * 0.25;
  
  // Each ring below appears lower on screen
  const screenY = ballScreenY + ringsBelowBall * 55; // 55px spacing on screen between rings
  
  // Rings further down are smaller (perspective)
  const scale = Math.max(0.5, 1 - ringsBelowBall * CONFIG.SCALE_PER_RING);
  
  return { screenY, scale, visible: screenY < h + 100 };
}

function drawRing(ring: Ring, ballY: number): void {
  const centerX = w / 2;
  const { screenY, scale, visible } = getRingScreenPosition(ring.y, ballY);

  if (!visible) return;

  // Ring dimensions
  const outerRadius = towerRadius * scale;
  const innerRadius = towerRadius * (CONFIG.PILLAR_RADIUS / CONFIG.TOWER_RADIUS) * scale * 1.1;
  const ringHeight = CONFIG.RING_HEIGHT * scale;
  const ellipseRatio = CONFIG.PERSPECTIVE_RATIO;

  const segmentAngle = (Math.PI * 2) / CONFIG.SEGMENTS_PER_RING;

  // Draw segments - we need to draw the SIDE face first, then the TOP face
  for (let i = 0; i < CONFIG.SEGMENTS_PER_RING; i++) {
    const segment = ring.segments[i];
    if (segment.type === "gap") continue;

    const startAngle = i * segmentAngle + towerRotation;
    const endAngle = startAngle + segmentAngle;
    const midAngle = (startAngle + endAngle) / 2;
    
    // Only draw side face for segments on the "front" (visible from above)
    const isFrontFacing = Math.sin(midAngle) > -0.3;

    // Colors based on segment type
    let topColor: string;
    let sideColor: string;
    let highlightColor: string;

    if (segment.type === "danger") {
      topColor = CONFIG.DANGER_COLOR;
      sideColor = CONFIG.DANGER_SIDE_COLOR;
      highlightColor = "#FF6B6B";
    } else {
      topColor = CONFIG.RING_COLOR;
      sideColor = CONFIG.RING_SIDE_COLOR;
      highlightColor = CONFIG.RING_HIGHLIGHT;
    }

    // Draw SIDE face (the thickness visible from above)
    if (isFrontFacing) {
      ctx.save();
      ctx.translate(centerX, screenY + ringHeight * ellipseRatio);
      ctx.scale(1, ellipseRatio);
      
      // Side is a band between top ellipse and bottom ellipse
      ctx.beginPath();
      ctx.arc(0, 0, outerRadius, startAngle, endAngle);
      ctx.restore();
      
      // Connect to the ring height above
      ctx.save();
      ctx.translate(centerX, screenY);
      ctx.scale(1, ellipseRatio);
      ctx.arc(0, 0, outerRadius, endAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = sideColor;
      ctx.fill();
      ctx.restore();
    }

    // Draw TOP face (the platform surface)
    ctx.save();
    ctx.translate(centerX, screenY);
    ctx.scale(1, ellipseRatio);

    ctx.beginPath();
    ctx.arc(0, 0, outerRadius, startAngle, endAngle);
    ctx.arc(0, 0, innerRadius, endAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = topColor;
    ctx.fill();

    // Top edge highlight
    ctx.strokeStyle = highlightColor;
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.arc(0, 0, outerRadius - 1, startAngle + 0.02, endAngle - 0.02);
    ctx.stroke();

    ctx.restore();
  }
}

function updateBallTrail(): void {
  const centerX = w / 2;
  const ballScreenY = h * 0.25;
  const orbitRadius = towerRadius * 0.75;
  const ballScreenX = centerX + Math.cos(ballAngle + towerRotation) * orbitRadius;
  const yOffset = Math.sin(ballAngle + towerRotation) * orbitRadius * CONFIG.PERSPECTIVE_RATIO * 0.5;
  
  // Add new trail point with screen position
  ballTrail.unshift({ x: ballScreenX, y: ballScreenY + yOffset, alpha: 1 });
  
  // Update and remove old trail points
  for (let i = ballTrail.length - 1; i >= 0; i--) {
    ballTrail[i].alpha *= 0.85;
    if (ballTrail[i].alpha < 0.05) {
      ballTrail.splice(i, 1);
    }
  }
  
  // Limit trail length
  if (ballTrail.length > 15) {
    ballTrail.pop();
  }
}

function drawBallTrail(): void {
  for (let i = ballTrail.length - 1; i >= 0; i--) {
    const t = ballTrail[i];
    // Trail points are already in screen coordinates
    const size = CONFIG.BALL_RADIUS * (0.3 + 0.5 * t.alpha);
    
    ctx.beginPath();
    ctx.arc(t.x, t.y, size, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 142, 83, " + (t.alpha * 0.4) + ")";
    ctx.fill();
  }
}

function drawSpeedLines(): void {
  const speedRatio = ballVY / CONFIG.BALL_MAX_VY;
  const lineCount = Math.floor(speedRatio * 8);
  const centerX = w / 2;
  const ballScreenY = ballY - cameraY;
  
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, " + (speedRatio * 0.3) + ")";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  
  for (let i = 0; i < lineCount; i++) {
    // Random positions around the screen edges
    const side = Math.floor(Math.random() * 2); // 0 = left, 1 = right
    const x = side === 0 
      ? centerX - towerRadius * 1.5 - Math.random() * 50 
      : centerX + towerRadius * 1.5 + Math.random() * 50;
    const y = ballScreenY - 100 + Math.random() * 200;
    const lineLength = 30 + Math.random() * 50;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 10, y - lineLength);
    ctx.stroke();
  }
  
  ctx.restore();
}

function drawBall(): void {
  const centerX = w / 2;
  
  // Ball is always at a fixed screen Y position (near top)
  const ballScreenY = h * 0.25;
  
  // Ball position on the ring edge
  const orbitRadius = towerRadius * 0.75; // Ball sits on platform edge
  const ballScreenX = centerX + Math.cos(ballAngle + towerRotation) * orbitRadius;
  // Slight Y offset based on angle for 3D effect
  const yOffset = Math.sin(ballAngle + towerRotation) * orbitRadius * CONFIG.PERSPECTIVE_RATIO * 0.5;
  const finalBallY = ballScreenY + yOffset;
  
  const ballSize = CONFIG.BALL_RADIUS;

  // Draw trail first (behind ball)
  drawBallTrail();

  // Apply squash/stretch transform
  ctx.save();
  ctx.translate(ballScreenX, finalBallY);
  ctx.scale(ballScaleX, ballScaleY);
  ctx.translate(-ballScreenX, -finalBallY);

  // Ball shadow (cast onto the ring below)
  ctx.beginPath();
  ctx.ellipse(
    ballScreenX + 4,
    finalBallY + ballSize * 1.5,
    ballSize * 0.8,
    ballSize * 0.3,
    0,
    0,
    Math.PI * 2
  );
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.fill();

  // Ball gradient - orange/yellow like real Helix Jump
  const gradient = ctx.createRadialGradient(
    ballScreenX - ballSize * 0.3,
    finalBallY - ballSize * 0.3,
    0,
    ballScreenX,
    finalBallY,
    ballSize
  );
  gradient.addColorStop(0, "#FFD93D");
  gradient.addColorStop(0.5, "#FF9F1C");
  gradient.addColorStop(1, "#E8890C");

  ctx.beginPath();
  ctx.arc(ballScreenX, finalBallY, ballSize, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  // Highlight for 3D effect
  ctx.beginPath();
  ctx.arc(
    ballScreenX - ballSize * 0.3,
    finalBallY - ballSize * 0.35,
    ballSize * 0.25,
    0,
    Math.PI * 2
  );
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.fill();

  ctx.restore();

  // Glow effect (outside transform)
  const glowSize = combo > 1 ? 2.5 + combo * 0.2 : 1.8;
  const glowAlpha = combo > 1 ? 0.5 + combo * 0.05 : 0.4;
  
  ctx.beginPath();
  ctx.arc(ballScreenX, finalBallY, ballSize * glowSize, 0, Math.PI * 2);
  const glowGradient = ctx.createRadialGradient(
    ballScreenX,
    finalBallY,
    ballSize,
    ballScreenX,
    finalBallY,
    ballSize * glowSize
  );
  
  if (combo > 1) {
    const hue = (Date.now() / 10) % 360;
    glowGradient.addColorStop(0, "hsla(" + hue + ", 80%, 60%, " + glowAlpha + ")");
    glowGradient.addColorStop(0.5, "hsla(" + ((hue + 60) % 360) + ", 80%, 60%, " + (glowAlpha * 0.5) + ")");
    glowGradient.addColorStop(1, "hsla(" + ((hue + 120) % 360) + ", 80%, 60%, 0)");
  } else {
    glowGradient.addColorStop(0, "rgba(255, 107, 107, " + glowAlpha + ")");
    glowGradient.addColorStop(1, "rgba(255, 107, 107, 0)");
  }
  
  ctx.fillStyle = glowGradient;
  ctx.fill();
}

function drawStar(cx: number, cy: number, size: number, alpha: number): void {
  const spikes = 4;
  const outerRadius = size;
  const innerRadius = size * 0.4;
  
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#FFE66D";
  ctx.beginPath();
  
  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (i * Math.PI) / spikes - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawParticles(): void {
  for (const p of particles) {
    const alpha = p.life / p.maxLife;
    // p.y is now in screen coordinates
    
    if (p.type === "star") {
      // Draw as sparkle star
      const twinkle = 0.7 + 0.3 * Math.sin(Date.now() / 50 + p.x);
      drawStar(p.x, p.y, p.size * alpha * 1.5, alpha * twinkle);
    } else {
      // Regular circle particle
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fillStyle =
        p.color.replace(")", ", " + alpha + ")").replace("rgb", "rgba");
      ctx.fill();
    }
  }
}

// ============= PARTICLE SYSTEM =============
function spawnBounceParticles(x: number, y: number, color: string): void {
  // Circular burst particles
  for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
    const angle = (Math.PI * 2 * i) / CONFIG.PARTICLE_COUNT + Math.random() * 0.5;
    const speed = 2 + Math.random() * 4;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 3,
      life: CONFIG.PARTICLE_LIFE,
      maxLife: CONFIG.PARTICLE_LIFE,
      size: 4 + Math.random() * 4,
      color,
      type: "bounce",
    });
  }
  
  // Add a few sparkle stars going upward
  for (let i = 0; i < 5; i++) {
    particles.push({
      x: x + (Math.random() - 0.5) * 40,
      y,
      vx: (Math.random() - 0.5) * 2,
      vy: -4 - Math.random() * 3,
      life: 800,
      maxLife: 800,
      size: 3 + Math.random() * 3,
      color: "#FFE66D",
      type: "star",
    });
  }
}

function updateParticles(dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15; // Gravity
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

// ============= GAME LOGIC =============
function resetGame(): void {
  console.log("[resetGame] Starting new game");
  score = 0;
  combo = 0;
  lastBounceTime = 0;
  ballY = 100; // Start ball slightly lower
  ballVY = 2; // Start with some downward velocity
  ballAngle = 0;
  towerRotation = 0;
  cameraY = 0;
  targetCameraY = 0;
  particles = [];
  floatingTexts = [];
  ballTrail = [];
  ballScaleX = 1;
  ballScaleY = 1;
  screenFlashAlpha = 0;
  shakeIntensity = 0;

  // Generate background stars
  backgroundStars = [];
  for (let i = 0; i < 100; i++) {
    backgroundStars.push({
      x: Math.random() * w,
      y: Math.random() * h * 3, // Spread across multiple screens
      size: 1 + Math.random() * 2,
      twinkle: Math.random() * Math.PI * 2,
    });
  }

  generateInitialRings();
  updateScoreDisplay();
}

function updateScoreDisplay(): void {
  currentScoreEl.textContent = score.toString();
  
  // Trigger score bump animation
  currentScoreEl.classList.remove("bump");
  void currentScoreEl.offsetWidth; // Force reflow to restart animation
  currentScoreEl.classList.add("bump");
  
  if (combo > 1) {
    comboDisplayEl.textContent = "COMBO x" + combo;
    comboDisplayEl.classList.remove("active");
    void comboDisplayEl.offsetWidth; // Force reflow
    comboDisplayEl.classList.add("active");
  } else {
    comboDisplayEl.classList.remove("active");
  }
}

function checkCollisions(): void {
  const ballBottom = ballY + CONFIG.BALL_RADIUS;

  for (const ring of rings) {
    // Skip already passed rings or rings too far away
    if (ring.passed) continue;
    if (ring.y < ballY - 50) continue;
    if (ring.y > ballY + CONFIG.RING_SPACING * 2) continue;

    // Check if ball is at ring level
    const ringTop = ring.y;
    const ringBottom = ring.y + CONFIG.RING_THICKNESS;

    if (ballBottom >= ringTop && ballY <= ringBottom && ballVY > 0) {
      // Determine which segment the ball is over
      const normalizedAngle =
        ((ballAngle + towerRotation) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const segmentAngle = (Math.PI * 2) / CONFIG.SEGMENTS_PER_RING;
      const segmentIndex = Math.floor(normalizedAngle / segmentAngle);
      const segment = ring.segments[segmentIndex];

      if (segment.type === "gap") {
        // Pass through gap
        if (!ring.passed) {
          ring.passed = true;
          const now = Date.now();

          // Calculate screen position for visual feedback using new perspective
          const centerX = w / 2;
          const { y: screenY, scale } = depthToScreen(ring.y);
          const ringRadius = towerRadius * scale * 0.85;
          const effectX = centerX + Math.cos(ballAngle + towerRotation) * ringRadius;
          const effectY = screenY + Math.sin(ballAngle + towerRotation) * ringRadius * CONFIG.PERSPECTIVE_TILT;

          // Check for combo
          if (now - lastBounceTime < CONFIG.COMBO_TIMEOUT && combo > 0) {
            combo++;
            score += combo;
            console.log("[checkCollisions] Combo!", combo, "Score:", score);

            // Visual feedback for combo
            screenFlashAlpha = 0.15 + combo * 0.05;
            spawnFloatingText(effectX, effectY - 30, "+" + combo + " COMBO!", "rgb(255, 230, 109)");
            spawnBounceParticles(effectX, effectY, "rgb(255, 230, 109)");

            if (settings.haptics) {
              triggerHaptic("medium");
            }
            
            if (settings.fx) {
              playComboSound(combo);
            }
          } else {
            score++;
            combo = 1;
            spawnFloatingText(effectX, effectY - 30, "+1", "rgb(78, 205, 196)");
          }

          updateScoreDisplay();
        }
      } else if (segment.type === "danger") {
        // Hit danger segment - game over
        console.log("[checkCollisions] Hit danger segment! Game over.");
        shakeIntensity = 20;
        gameOver();
        return;
      } else {
        // Bounce on solid segment
        ballY = ringTop - CONFIG.BALL_RADIUS;
        ballVY = CONFIG.BALL_BOUNCE_VY;
        lastBounceTime = Date.now();
        combo = 0;

        // Apply squash effect on bounce
        ballScaleX = 1.3;
        ballScaleY = 0.7;
        ballScaleTime = 150;

        // Calculate screen position for effects
        const centerX = w / 2;
        const { y: screenY, scale } = depthToScreen(ring.y);
        const ringRadius = towerRadius * scale * 0.85;
        const effectX = centerX + Math.cos(ballAngle + towerRotation) * ringRadius;
        const effectY = screenY + Math.sin(ballAngle + towerRotation) * ringRadius * CONFIG.PERSPECTIVE_TILT;

        // Mark as passed
        if (!ring.passed) {
          ring.passed = true;
          score++;
          updateScoreDisplay();
          spawnFloatingText(effectX, effectY - 30, "+1", "rgb(255, 255, 255)");
        }

        spawnBounceParticles(effectX, effectY, "rgb(255, 255, 255)");

        if (settings.haptics) {
          triggerHaptic("light");
        }

        if (settings.fx) {
          playBounceSound();
        }

        console.log("[checkCollisions] Bounce! Score:", score);
        break;
      }
    }
  }
}

function updateBall(dt: number): void {
  // Apply gravity
  ballVY += CONFIG.BALL_GRAVITY;
  ballVY = Math.min(ballVY, CONFIG.BALL_MAX_VY);

  // Update position
  ballY += ballVY;

  // Update camera target
  targetCameraY = ballY - h * CONFIG.CAMERA_OFFSET;
  cameraY = lerp(cameraY, targetCameraY, CONFIG.CAMERA_SMOOTHING);

  // Check collisions
  checkCollisions();

  // Add more rings as needed
  if (rings.length > 0 && ballY > rings[rings.length - 1].y - h) {
    addMoreRings();
  }

  // Check if ball fell too far (game over)
  const lastVisibleRing = rings.find((r) => !r.passed && r.y > ballY);
  if (lastVisibleRing && ballY > lastVisibleRing.y + h) {
    console.log("[updateBall] Ball fell too far. Game over.");
    gameOver();
  }
}

function updateTower(dt: number): void {
  // Apply drag velocity with decay
  if (!isDragging) {
    towerRotation += dragVelocity;
    dragVelocity *= 0.92;
  }

  // Keyboard rotation
  if (keysDown.has("ArrowLeft") || keysDown.has("a") || keysDown.has("A")) {
    towerRotation -= CONFIG.KEYBOARD_ROTATION_SPEED;
  }
  if (keysDown.has("ArrowRight") || keysDown.has("d") || keysDown.has("D")) {
    towerRotation += CONFIG.KEYBOARD_ROTATION_SPEED;
  }
}

function updateScreenShake(): void {
  if (shakeIntensity > 0.1) {
    const shakeX = (Math.random() - 0.5) * shakeIntensity;
    const shakeY = (Math.random() - 0.5) * shakeIntensity;
    ctx.translate(shakeX, shakeY);
    shakeIntensity *= shakeDecay;
  } else {
    shakeIntensity = 0;
  }
}

// ============= AUDIO =============
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

function playBounceSound(): void {
  if (!settings.fx) return;

  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(600, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.1);
  } catch (e) {
    console.log("[playBounceSound] Audio error:", e);
  }
}

function playComboSound(comboLevel: number): void {
  if (!settings.fx) return;

  try {
    const ctx = getAudioContext();
    
    // Play ascending notes based on combo level
    const baseFreq = 400 + comboLevel * 100; // Higher pitch for bigger combos
    
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(baseFreq, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, ctx.currentTime + 0.15);

    gainNode.gain.setValueAtTime(0.25, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.2);
  } catch (e) {
    console.log("[playComboSound] Audio error:", e);
  }
}

function playGameOverSound(): void {
  if (!settings.fx) return;

  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(400, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
  } catch (e) {
    console.log("[playGameOverSound] Audio error:", e);
  }
}

// ============= HAPTICS =============
function triggerHaptic(type: "light" | "medium" | "heavy" | "success" | "error"): void {
  if (!settings.haptics) return;
  if (typeof (window as any).triggerHaptic === "function") {
    (window as any).triggerHaptic(type);
  }
}

// ============= GAME STATE =============
function gameOver(): void {
  if (gameState !== "PLAYING") return;

  gameState = "GAME_OVER";
  console.log("[gameOver] Final score:", score);

  // Submit score
  if (typeof (window as any).submitScore === "function") {
    (window as any).submitScore(score);
  }

  // Haptic and sound
  triggerHaptic("error");
  playGameOverSound();

  // Update best score
  const isNewBest = score > bestScore;
  if (isNewBest) {
    bestScore = score;
    localStorage.setItem("helixJump_bestScore", bestScore.toString());
    console.log("[gameOver] New best score:", bestScore);
  }

  // Update UI
  finalScore.textContent = score.toString();
  if (isNewBest) {
    newBestBadge.classList.remove("hidden");
  } else {
    newBestBadge.classList.add("hidden");
  }

  // Show game over screen
  scoreDisplay.classList.add("hidden");
  pauseBtn.classList.add("hidden");
  gameOverScreen.classList.remove("hidden");
}

function startGame(): void {
  console.log("[startGame] Starting game");
  gameState = "PLAYING";

  resetGame();

  // Hide overlays
  startScreen.classList.add("hidden");
  gameOverScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");

  // Show game UI
  scoreDisplay.classList.remove("hidden");
  pauseBtn.classList.remove("hidden");

  // Light haptic on start
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

  // Update best score display
  startBestScore.textContent = bestScore.toString();

  // Show start screen
  startScreen.classList.remove("hidden");
  gameOverScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  scoreDisplay.classList.add("hidden");
  pauseBtn.classList.add("hidden");
}

// ============= INPUT HANDLERS =============
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
  });

  // Touch controls
  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (gameState !== "PLAYING") return;

    const touch = e.touches[0];
    isDragging = true;
    lastDragX = touch.clientX;
    dragVelocity = 0;
  });

  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (!isDragging || gameState !== "PLAYING") return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - lastDragX;
    towerRotation += deltaX * CONFIG.ROTATION_SPEED;
    dragVelocity = deltaX * CONFIG.ROTATION_SPEED * 0.5;
    lastDragX = touch.clientX;
  });

  canvas.addEventListener("touchend", (e) => {
    e.preventDefault();
    isDragging = false;
  });

  // Mouse controls (desktop)
  canvas.addEventListener("mousedown", (e) => {
    if (gameState !== "PLAYING") return;
    isDragging = true;
    lastDragX = e.clientX;
    dragVelocity = 0;
  });

  canvas.addEventListener("mousemove", (e) => {
    if (!isDragging || gameState !== "PLAYING") return;

    const deltaX = e.clientX - lastDragX;
    towerRotation += deltaX * CONFIG.ROTATION_SPEED;
    dragVelocity = deltaX * CONFIG.ROTATION_SPEED * 0.5;
    lastDragX = e.clientX;
  });

  canvas.addEventListener("mouseup", () => {
    isDragging = false;
  });

  canvas.addEventListener("mouseleave", () => {
    isDragging = false;
  });

  // UI Buttons
  document.getElementById("startButton")!.addEventListener("click", () => {
    triggerHaptic("light");
    startGame();
  });

  settingsBtn.addEventListener("click", () => {
    triggerHaptic("light");
    settingsModal.classList.remove("hidden");
  });

  document.getElementById("settingsClose")!.addEventListener("click", () => {
    triggerHaptic("light");
    settingsModal.classList.add("hidden");
  });

  pauseBtn.addEventListener("click", pauseGame);

  document.getElementById("resumeButton")!.addEventListener("click", () => {
    triggerHaptic("light");
    resumeGame();
  });

  document.getElementById("pauseRestartButton")!.addEventListener("click", () => {
    triggerHaptic("light");
    pauseScreen.classList.add("hidden");
    startGame();
  });

  document.getElementById("pauseMenuButton")!.addEventListener("click", () => {
    triggerHaptic("light");
    showStartScreen();
  });

  document.getElementById("restartButton")!.addEventListener("click", () => {
    triggerHaptic("light");
    startGame();
  });

  document.getElementById("backToStartButton")!.addEventListener("click", () => {
    triggerHaptic("light");
    showStartScreen();
  });

  // Settings toggles
  setupSettingsToggles();
}

function setupSettingsToggles(): void {
  const musicToggle = document.getElementById("musicToggle")!;
  const fxToggle = document.getElementById("fxToggle")!;
  const hapticToggle = document.getElementById("hapticToggle")!;

  // Initialize toggle states
  musicToggle.classList.toggle("active", settings.music);
  fxToggle.classList.toggle("active", settings.fx);
  hapticToggle.classList.toggle("active", settings.haptics);

  musicToggle.addEventListener("click", () => {
    settings.music = !settings.music;
    musicToggle.classList.toggle("active", settings.music);
    localStorage.setItem("helixJump_music", settings.music.toString());
    triggerHaptic("light");
  });

  fxToggle.addEventListener("click", () => {
    settings.fx = !settings.fx;
    fxToggle.classList.toggle("active", settings.fx);
    localStorage.setItem("helixJump_fx", settings.fx.toString());
    triggerHaptic("light");
  });

  hapticToggle.addEventListener("click", () => {
    settings.haptics = !settings.haptics;
    hapticToggle.classList.toggle("active", settings.haptics);
    localStorage.setItem("helixJump_haptics", settings.haptics.toString());
    if (settings.haptics) {
      triggerHaptic("light");
    }
  });
}

// ============= RESIZE HANDLER =============
function resizeCanvas(): void {
  w = window.innerWidth;
  h = window.innerHeight;
  canvas.width = w;
  canvas.height = h;
  towerRadius = Math.min(w, h * 0.6) * CONFIG.TOWER_RADIUS;

  console.log("[resizeCanvas] Canvas resized to:", w, "x", h);
}

// ============= GAME LOOP =============
let lastTime = 0;

function gameLoop(timestamp: number): void {
  const dt = timestamp - lastTime;
  lastTime = timestamp;

  // Clear canvas
  ctx.save();

  // Apply screen shake
  updateScreenShake();

  // Draw background
  drawBackground();

  if (gameState === "PLAYING") {
    updateTower(dt);
    updateBall(dt);
    updateBallTrail();
    updateParticles(dt);
    updateFloatingTexts(dt);
    
    // Update ball squash/stretch
    if (ballScaleTime > 0) {
      ballScaleTime -= dt;
      const t = ballScaleTime / 150;
      ballScaleX = lerp(1, 1.3, t);
      ballScaleY = lerp(1, 0.7, t);
    } else {
      // Stretch when falling fast
      const stretchAmount = Math.abs(ballVY) / CONFIG.BALL_MAX_VY;
      ballScaleX = lerp(1, 0.85, stretchAmount);
      ballScaleY = lerp(1, 1.15, stretchAmount);
    }
  } else if (gameState === "PAUSED" || gameState === "GAME_OVER") {
    // Keep particles and texts updating for visual effect
    updateParticles(dt);
    updateFloatingTexts(dt);
  }

  // Draw central pillar FIRST (behind everything)
  drawCentralPillar();

  // Draw rings from deepest (furthest down) to closest (near ball)
  // This ensures closer rings overlap further ones
  const visibleRings = rings.filter((r) => {
    const { visible } = getRingScreenPosition(r.y, ballY);
    return visible;
  });

  // Sort by Y position - highest Y (deepest) drawn first
  visibleRings.sort((a, b) => b.y - a.y);

  for (const ring of visibleRings) {
    drawRing(ring, ballY);
  }

  // Draw speed lines when falling fast
  if (gameState === "PLAYING" && ballVY > CONFIG.BALL_MAX_VY * 0.5) {
    drawSpeedLines();
  }

  // Draw ball
  if (gameState !== "START") {
    drawBall();
  }

  // Draw particles
  drawParticles();
  
  // Draw floating texts
  drawFloatingTexts();

  ctx.restore();

  requestAnimationFrame(gameLoop);
}

// ============= INIT =============
function init(): void {
  console.log("[init] Initializing Helix Jump");

  // Setup canvas
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // Setup input
  setupInputHandlers();

  // Initialize display
  startBestScore.textContent = bestScore.toString();

  // Generate initial rings for visual on start screen
  generateInitialRings();

  // Start game loop
  requestAnimationFrame(gameLoop);

  // Show start screen
  showStartScreen();

  console.log("[init] Game initialized. Best score:", bestScore);
}

init();
