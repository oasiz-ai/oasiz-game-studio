console.log("[TwoDots] Game initialized");

import { StartScreen } from "./StartScreen";
import { LevelSelector } from "./LevelSelector";

// Types
export type DotColor = "red" | "blue" | "green" | "yellow" | "purple";
type CellType = "dot" | "empty";
type GameState = "start" | "levelSelect" | "playing" | "paused" | "won" | "lost";

interface Cell {
  type: CellType;
  color?: DotColor;
  // Animation state
  animOffsetY?: number;  // Current Y offset from target position (pixels)
  animVelocity?: number; // Current fall velocity
  animScaleY?: number;   // Vertical scale for squash/stretch (1 = normal)
  animScaleX?: number;   // Horizontal scale for squash/stretch (1 = normal)
}

interface Position {
  x: number;
  y: number;
}

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

// Constants
const COLORS: DotColor[] = ["red", "blue", "green", "yellow"];
const GRID_ROWS = 5;
const GRID_COLS = 5;
const MIN_CHAIN_LENGTH = 2;
const INITIAL_MOVES = 30;

// Seeded Random Number Generator (Mulberry32)
// Each level uses its own seed for deterministic grid generation
class SeededRandom {
  private state: number;

  constructor(seed: number) {
    // Use a hash of the seed to ensure good distribution
    this.state = this.hashSeed(seed);
  }

  // Simple hash function to convert level number to a well-distributed seed
  private hashSeed(seed: number): number {
    let h = seed * 2654435761;
    h = ((h >>> 16) ^ h) * 2246822519;
    h = ((h >>> 13) ^ h) * 3266489917;
    h = (h >>> 16) ^ h;
    return h >>> 0;
  }

  // Mulberry32 PRNG - fast and produces good quality random numbers
  next(): number {
    let t = this.state += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  // Get random integer in range [0, max)
  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }

  // Shuffle array in place using Fisher-Yates
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}

// Level-specific seeded random - reset when starting a new level
let levelRandom: SeededRandom = new SeededRandom(1);

// Spawn weights for objective-favoring logic
const OBJECTIVE_COLOR_WEIGHT = 0.65; // 65% chance to spawn objective colors
const CHAIN_ADJACENT_WEIGHT = 0.30;  // 30% chance to match adjacent cells

// UI Configuration
const GRID_SIZE_MULTIPLIER = 0.9; // Multiplier for grid cell size (0.7 = 70% of available space)
const DOT_SIZE_MULTIPLIER = 0.2; // Multiplier for dot radius relative to cell size (0.3 = 30% of cell size)
const LINE_SIZE_MULTIPLIER = 0.15; // Multiplier for chain line width relative to cell size (0.15 = 15% of cell size)
const OBJECTIVE_DOT_SIZE_MULTIPLIER = 0.6; // Multiplier for objective dot size (0.7 = 70% of base size)
const LEVEL_FONT_SIZE_MOBILE = 20; // Font size for "Level 1" text on mobile
const LEVEL_FONT_SIZE_DESKTOP = 14; // Font size for "Level 1" text on desktop

// Common panel dimensions (shared by moves, star, level, settings)
const PANEL_WIDTH_MOBILE = 55;
const PANEL_WIDTH_DESKTOP = 60;
const PANEL_HEIGHT_MOBILE = 55;
const PANEL_HEIGHT_DESKTOP = 60;
const PANEL_BORDER_RADIUS = 12;

// Color definitions
const COLOR_HEX: Record<DotColor, string> = {
  red: "#e84e60",
  blue: "#a5547d",
  green: "#77c299",
  yellow: "#fece6c",
  purple: "#AA44FF",
};

// Ripple effect interface
interface Ripple {
  x: number;
  y: number;
  color: DotColor;
  scale: number;
  alpha: number;
}

// Floating text interface (for chain pop feedback)
interface FloatingText {
  x: number;
  y: number;
  text: string;
  alpha: number;
  velocityY: number;
}

// Game state
let gameState: GameState = "start";
let grid: Cell[][] = [];
let selectedChain: Position[] = [];
let movesRemaining = INITIAL_MOVES;
let score = 0;
let isDragging = false;
let lastSelectedPos: Position | null = null;
let currentPointerX = 0;
let currentPointerY = 0;
let animationFrame = 0;
let isAnimating = false;
let dotsAnimating = false; // Track if dots are currently falling
let ripples: Ripple[] = []; // Active ripple animations
let floatingTexts: FloatingText[] = []; // Active floating text animations

// Settings and level progression functions (defined early)
function loadSettings(): Settings {
  const saved = localStorage.getItem("twoDotsSettings");
  return saved ? JSON.parse(saved) : { music: true, fx: true, haptics: true };
}

function saveSettings(): void {
  localStorage.setItem("twoDotsSettings", JSON.stringify(settings));
}

function loadLevelProgress(): number {
  const saved = localStorage.getItem("twoDotsMaxLevel");
  return saved ? parseInt(saved, 10) : 1;
}

function saveLevelProgress(): void {
  localStorage.setItem("twoDotsMaxLevel", maxUnlockedLevel.toString());
}

// Settings
let settings: Settings = loadSettings();

// Background music (plays across all screens)
const bgMusic = new Audio(new URL("../assets/Bg.mp3", import.meta.url).toString());
bgMusic.loop = true;
bgMusic.preload = "auto";
bgMusic.volume = 0.35;

// FX: dot selection pop (use a small pool for rapid retriggers)
const popFxUrl = new URL("../assets/pop.mp3", import.meta.url).toString();
const popFxPool: HTMLAudioElement[] = Array.from({ length: 6 }, () => {
  const a = new Audio(popFxUrl);
  a.preload = "auto";
  a.volume = 0.65;
  return a;
});
let popFxIdx = 0;

function playPopFx(): void {
  if (!settings.fx) return;
  const a = popFxPool[popFxIdx];
  popFxIdx = (popFxIdx + 1) % popFxPool.length;

  try {
    a.currentTime = 0;
    const p = a.play();
    if (p) {
      p.catch((err) => {
        console.log("[TwoDots] Pop FX play blocked:", err);
      });
    }
  } catch (err) {
    console.log("[TwoDots] Pop FX play failed:", err);
  }
}

// FX: win crown animation sound
const winFx = new Audio(new URL("../assets/Win.mp3", import.meta.url).toString());
winFx.preload = "auto";
winFx.volume = 0.7;

function playWinFx(): void {
  if (!settings.fx) return;
  try {
    winFx.currentTime = 0;
    const p = winFx.play();
    if (p) {
      p.catch((err) => {
        console.log("[TwoDots] Win FX play blocked:", err);
      });
    }
  } catch (err) {
    console.log("[TwoDots] Win FX play failed:", err);
  }
}

// FX: button tap sound
const tapFx = new Audio(new URL("../assets/tap.mp3", import.meta.url).toString());
tapFx.preload = "auto";
tapFx.volume = 0.6;

function playTapFx(): void {
  if (!settings.fx) return;
  try {
    tapFx.currentTime = 0;
    const p = tapFx.play();
    if (p) {
      p.catch((err) => {
        console.log("[TwoDots] Tap FX play blocked:", err);
      });
    }
  } catch (err) {
    console.log("[TwoDots] Tap FX play failed:", err);
  }
}

async function applyMusicSetting(): Promise<void> {
  try {
    if (!settings.music) {
      if (!bgMusic.paused) bgMusic.pause();
      return;
    }

    // Attempt to start/resume (may be blocked until a user gesture)
    const playPromise = bgMusic.play();
    await playPromise;
  } catch (err) {
    // Autoplay policies may block until a user gesture; we'll retry on the next gesture.
    console.log("[TwoDots] Background music play blocked:", err);
  }
}

function hookFirstUserGestureForMusic(): void {
  const startOnGesture = () => {
    // Only attempt if enabled; if enabled later, the toggle handler will call applyMusicSetting().
    void applyMusicSetting();
  };

  // Pointerdown covers mouse + touch; keep it once to avoid noisy retries.
  document.addEventListener("pointerdown", startOnGesture, { once: true, passive: true });
}

// Start screen component
const startScreen = new StartScreen();

// Level selector component
let currentLevel = 1;
let maxUnlockedLevel = loadLevelProgress(); // Load saved progress
const levelSelector = new LevelSelector(20, (level: number) => {
  currentLevel = level;
  updateLevelIndicator(level);
}, COLORS, COLOR_HEX, null, undefined, undefined, undefined, maxUnlockedLevel); // Pass maxUnlockedLevel

// Objectives
interface Objective {
  type: "clearColor";
  color: DotColor;
  target: number;
  current: number;
  // Shake animation state
  shakeTime: number;
  pendingCount: number; // Count to add after shake completes
}

let objectives: Objective[] = [];

// Shake animation constants
const SHAKE_DURATION = 200; // ms
const SHAKE_INTENSITY = 2; // pixels

// DOM elements
const gameContainer = document.getElementById("game-container") as HTMLDivElement;
const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
if (!canvas || !gameContainer) {
  throw new Error("Canvas or container element not found");
}

const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("Could not get 2D context");
}

// Layout calculations
let cellSize = 0;
let gridOffsetX = 0;
let gridOffsetY = 0;
let hudHeight = 0;

function calculateLayout(): void {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  const isMobile = window.matchMedia("(pointer: coarse)").matches;
  
  hudHeight = isMobile ? h * 0.12 : h * 0.1;
  
  // Reserve space for top HUD and bottom HUD
  const topHudHeight = isMobile ? 120 + PANEL_HEIGHT_MOBILE : 45 + PANEL_HEIGHT_DESKTOP;
  const bottomHudHeight = isMobile ? 40 + PANEL_HEIGHT_MOBILE : 30 + PANEL_HEIGHT_DESKTOP;
  
  const availableHeight = h - topHudHeight - bottomHudHeight;
  const availableWidth = w * 0.95;
  
  const cellSizeByHeight = availableHeight / GRID_ROWS;
  const cellSizeByWidth = availableWidth / GRID_COLS;
  // Apply grid size multiplier
  cellSize = Math.min(cellSizeByHeight, cellSizeByWidth, 60) * GRID_SIZE_MULTIPLIER;
  
  const gridWidth = cellSize * GRID_COLS;
  const gridHeight = cellSize * GRID_ROWS;
  
  // Center grid horizontally and vertically in the available space
  gridOffsetX = (w - gridWidth) / 2;
  gridOffsetY = topHudHeight + (availableHeight - gridHeight) / 2;
}

function resizeCanvas(): void {
  const isMobile = window.matchMedia("(pointer: coarse)").matches;
  const dpr = window.devicePixelRatio || 1;
  
  if (isMobile) {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
  } else {
    canvas.width = gameContainer.clientWidth * dpr;
    canvas.height = gameContainer.clientHeight * dpr;
  }
  
  // Scale context to match device pixel ratio
  if (ctx) {
    ctx.scale(dpr, dpr);
  }
  
  calculateLayout();
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// Try applying music setting early; may be blocked until gesture.
hookFirstUserGestureForMusic();
void applyMusicSetting();

// Grid initialization - uses seeded random for deterministic level generation
function initGrid(): void {
  // Reset the seeded random for this level to ensure same initial grid
  levelRandom = new SeededRandom(currentLevel);
  
  grid = [];
  for (let y = 0; y < GRID_ROWS; y++) {
    grid[y] = [];
    for (let x = 0; x < GRID_COLS; x++) {
      grid[y][x] = {
        type: "dot",
        color: COLORS[levelRandom.nextInt(COLORS.length)],
      };
    }
  }
  
  // Ensure no initial matches (also uses seeded random)
  while (hasMatches()) {
    shuffleGrid();
  }
}

function shuffleGrid(): void {
  const allDots: DotColor[] = [];
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      if (grid[y][x].type === "dot" && grid[y][x].color) {
        allDots.push(grid[y][x].color!);
      }
    }
  }
  
  // Shuffle using seeded random for deterministic results
  levelRandom.shuffle(allDots);
  
  let idx = 0;
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      if (grid[y][x].type === "dot") {
        grid[y][x].color = allDots[idx++];
      }
    }
  }
}

function hasMatches(): boolean {
  // Check for 2x2 squares or horizontal/vertical matches
  for (let y = 0; y < GRID_ROWS - 1; y++) {
    for (let x = 0; x < GRID_COLS - 1; x++) {
      const c = grid[y][x].color;
      if (c && 
          grid[y][x + 1].color === c &&
          grid[y + 1][x].color === c &&
          grid[y + 1][x + 1].color === c) {
        return true;
      }
    }
  }
  return false;
}

// Initialize objectives
function initObjectives(): void {
  objectives = [];
  const colorCounts: Record<DotColor, number> = {
    red: 0,
    blue: 0,
    green: 0,
    yellow: 0,
    purple: 0,
  };
  
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      const color = grid[y][x].color;
      if (color) {
        colorCounts[color]++;
      }
    }
  }
  
  // Create objectives for top 2 colors
  const sorted = Object.entries(colorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);
  
  for (const [color, count] of sorted) {
    objectives.push({
      type: "clearColor",
      color: color as DotColor,
      target: Math.floor(count * 4.0),
      current: 0,
      shakeTime: 0,
      pendingCount: 0,
    });
  }
}

// Chain validation
function isValidAdjacent(pos1: Position, pos2: Position): boolean {
  const dx = Math.abs(pos1.x - pos2.x);
  const dy = Math.abs(pos1.y - pos2.y);
  return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
}

function isValidChain(chain: Position[]): boolean {
  if (chain.length < MIN_CHAIN_LENGTH) return false;
  
  // Check all same color
  const firstColor = grid[chain[0].y][chain[0].x].color;
  if (!firstColor) return false;
  
  for (const pos of chain) {
    if (grid[pos.y][pos.x].color !== firstColor) return false;
  }
  
  // Check adjacency
  for (let i = 1; i < chain.length; i++) {
    if (!isValidAdjacent(chain[i - 1], chain[i])) {
      return false;
    }
  }
  
  // Check uniqueness
  const seen = new Set<string>();
  for (const pos of chain) {
    const key = `${pos.x},${pos.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  
  return true;
}

function isClosedLoop(chain: Position[]): boolean {
  if (chain.length < 4) return false;
  
  const first = chain[0];
  const last = chain[chain.length - 1];
  
  // Check if first and last are adjacent
  return isValidAdjacent(first, last);
}

// Position helpers
function getCellAtPixel(x: number, y: number): Position | null {
  const cellX = Math.floor((x - gridOffsetX) / cellSize);
  const cellY = Math.floor((y - gridOffsetY) / cellSize);
  
  if (cellX >= 0 && cellX < GRID_COLS && cellY >= 0 && cellY < GRID_ROWS) {
    return { x: cellX, y: cellY };
  }
  return null;
}

function isPositionInChain(pos: Position, chain: Position[]): boolean {
  return chain.some(p => p.x === pos.x && p.y === pos.y);
}

// Ripple effect functions
function spawnRipple(pos: Position, color: DotColor): void {
  const pixelX = gridOffsetX + pos.x * cellSize + cellSize / 2;
  const pixelY = gridOffsetY + pos.y * cellSize + cellSize / 2;
  
  ripples.push({
    x: pixelX,
    y: pixelY,
    color: color,
    scale: 1,
    alpha: 1,
  });
}

function updateRipples(): void {
  for (let i = ripples.length - 1; i >= 0; i--) {
    const ripple = ripples[i];
    // Grow the ripple (halved for 2x duration)
    ripple.scale += 0.04;
    // Fade out the ripple (halved for 2x duration)
    ripple.alpha -= 0.025;
    
    // Remove ripple when fully faded
    if (ripple.alpha <= 0) {
      ripples.splice(i, 1);
    }
  }
}

function drawRipples(renderCtx: CanvasRenderingContext2D): void {
  for (const ripple of ripples) {
    const radius = cellSize * DOT_SIZE_MULTIPLIER * ripple.scale;
    
    renderCtx.save();
    renderCtx.globalAlpha = ripple.alpha;
    renderCtx.fillStyle = COLOR_HEX[ripple.color];
    renderCtx.beginPath();
    renderCtx.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2);
    renderCtx.fill();
    renderCtx.restore();
  }
}

// Floating text functions (chain pop feedback)
function spawnFloatingText(chain: Position[], count: number): void {
  // Calculate center of the chain
  let centerX = 0;
  let centerY = 0;
  for (const pos of chain) {
    centerX += gridOffsetX + pos.x * cellSize + cellSize / 2;
    centerY += gridOffsetY + pos.y * cellSize + cellSize / 2;
  }
  centerX /= chain.length;
  centerY /= chain.length;
  
  floatingTexts.push({
    x: centerX,
    y: centerY,
    text: `+${count}`,
    alpha: 1,
    velocityY: -2, // Initial upward velocity
  });
}

function updateFloatingTexts(): void {
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    // Move upward
    ft.y += ft.velocityY;
    // Fade out
    ft.alpha -= 0.02;
    
    // Remove when fully faded
    if (ft.alpha <= 0) {
      floatingTexts.splice(i, 1);
    }
  }
}

function drawFloatingTexts(renderCtx: CanvasRenderingContext2D, isMobile: boolean): void {
  for (const ft of floatingTexts) {
    renderCtx.save();
    renderCtx.globalAlpha = ft.alpha;
    renderCtx.fillStyle = "#666666";
    renderCtx.font = `600 ${isMobile ? 18 : 20}px 'Nunito', sans-serif`;
    renderCtx.textAlign = "center";
    renderCtx.fillText(ft.text, ft.x, ft.y);
    renderCtx.restore();
  }
}

// Chain selection
function startChain(pos: Position): void {
  if (gameState !== "playing" || isAnimating) return;
  if (grid[pos.y][pos.x].type !== "dot" || !grid[pos.y][pos.x].color) return;
  
  selectedChain = [pos];
  lastSelectedPos = pos;
  isDragging = true;
  
  // Initialize pointer position to the dot center
  currentPointerX = gridOffsetX + pos.x * cellSize + cellSize / 2;
  currentPointerY = gridOffsetY + pos.y * cellSize + cellSize / 2;
  
  // Spawn ripple effect
  spawnRipple(pos, grid[pos.y][pos.x].color!);
  playPopFx();
  
  triggerHaptic("light");
}

function addToChain(pos: Position): void {
  if (!isDragging || !lastSelectedPos) return;
  if (grid[pos.y][pos.x].type !== "dot" || !grid[pos.y][pos.x].color) return;
  
  // Check if already in chain
  if (isPositionInChain(pos, selectedChain)) {
    // Allow backtracking - remove everything after this position
    const idx = selectedChain.findIndex(p => p.x === pos.x && p.y === pos.y);
    if (idx >= 0) {
      selectedChain = selectedChain.slice(0, idx + 1);
      lastSelectedPos = pos;
      return;
    }
  }
  
  // Check if adjacent to last position
  if (!isValidAdjacent(lastSelectedPos, pos)) return;
  
  // Check if same color
  const firstColor = grid[selectedChain[0].y][selectedChain[0].x].color;
  if (grid[pos.y][pos.x].color !== firstColor) return;
  
  selectedChain.push(pos);
  lastSelectedPos = pos;
  
  // Spawn ripple effect
  spawnRipple(pos, grid[pos.y][pos.x].color!);
  playPopFx();
  
  triggerHaptic("light");
}

function endChain(): void {
  if (!isDragging) return;
  isDragging = false;
  
  if (isValidChain(selectedChain)) {
    processChain(selectedChain);
  }
  
  selectedChain = [];
  lastSelectedPos = null;
  currentPointerX = 0;
  currentPointerY = 0;
}

// Process chain clearing
async function processChain(chain: Position[]): Promise<void> {
  if (isAnimating) return;
  isAnimating = true;
  
  const isLoop = isClosedLoop(chain);
  const chainColor = grid[chain[0].y][chain[0].x].color!;
  
  // Clear dots
  const dotsToClear = isLoop 
    ? getAllDotsOfColor(chainColor)
    : chain;
  
  // Calculate score gained
  let scoreGained = dotsToClear.length * 10;
  if (isLoop) {
    scoreGained += 100; // Bonus for loop
  }
  score += scoreGained;
  
  // Update objectives with shake animation
  const colorCounts: Partial<Record<DotColor, number>> = {};
  for (const pos of dotsToClear) {
    const color = grid[pos.y][pos.x].color;
    if (color) {
      colorCounts[color] = (colorCounts[color] || 0) + 1;
    }
  }
  
  // Trigger shake and queue pending count updates
  for (const [color, count] of Object.entries(colorCounts)) {
    const obj = objectives.find(o => o.type === "clearColor" && o.color === color);
    if (obj && count > 0) {
      obj.shakeTime = SHAKE_DURATION;
      obj.pendingCount += count;
    }
  }
  
  // Spawn floating text showing score gained
  spawnFloatingText(dotsToClear, scoreGained);
  
  // Clear dots
  for (const pos of dotsToClear) {
    grid[pos.y][pos.x] = { type: "empty" };
  }
  
  triggerHaptic(isLoop ? "success" : "medium");
  
  // Wait for clear animation
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Apply gravity (starts bouncy fall animation)
  applyGravity();
  
  // Spawn new dots (starts bouncy fall animation)
  spawnNewDots();
  
  // Wait for all dot animations to complete
  await waitForAnimations();
  
  // Decrease moves
  movesRemaining--;
  
  // Check win/lose
  checkGameState();
  
  isAnimating = false;
}

function getAllDotsOfColor(color: DotColor): Position[] {
  const positions: Position[] = [];
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      if (grid[y][x].type === "dot" && grid[y][x].color === color) {
        positions.push({ x, y });
      }
    }
  }
  return positions;
}

function applyGravity(): void {
  for (let x = 0; x < GRID_COLS; x++) {
    let writeY = GRID_ROWS - 1;
    for (let y = GRID_ROWS - 1; y >= 0; y--) {
      if (grid[y][x].type === "dot") {
        if (writeY !== y) {
          // Calculate how many rows the dot needs to fall
          const fallDistance = writeY - y;
          // Move the dot to its new position with animation offset
          grid[writeY][x] = {
            ...grid[y][x],
            animOffsetY: -fallDistance * cellSize, // Start above target
            animVelocity: 0,
          };
          grid[y][x] = { type: "empty" };
          dotsAnimating = true;
        }
        writeY--;
      }
    }
  }
}

// Get a weighted random color that favors objective colors
function getWeightedRandomColor(): DotColor {
  // If no objectives, return random color
  if (objectives.length === 0) {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
  }
  
  // Get incomplete objective colors (still need to clear more)
  const incompleteObjectiveColors = objectives
    .filter(obj => obj.current + obj.pendingCount < obj.target)
    .map(obj => obj.color);
  
  // If all objectives complete, return random color
  if (incompleteObjectiveColors.length === 0) {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
  }
  
  if (Math.random() < OBJECTIVE_COLOR_WEIGHT) {
    // Pick a random incomplete objective color
    return incompleteObjectiveColors[Math.floor(Math.random() * incompleteObjectiveColors.length)];
  }
  
  // Otherwise return any random color
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

// Get a weighted color that also considers adjacency for chain building
function getChainFavoringColor(x: number, y: number): DotColor {
  if (Math.random() < CHAIN_ADJACENT_WEIGHT) {
    const adjacentColors: DotColor[] = [];
    
    // Check cell below (most important for vertical chains)
    if (y < GRID_ROWS - 1 && grid[y + 1][x].type === "dot" && grid[y + 1][x].color) {
      adjacentColors.push(grid[y + 1][x].color!);
      adjacentColors.push(grid[y + 1][x].color!); // Double weight for vertical
    }
    
    // Check left neighbor
    if (x > 0 && grid[y][x - 1].type === "dot" && grid[y][x - 1].color) {
      adjacentColors.push(grid[y][x - 1].color!);
    }
    
    // Check right neighbor
    if (x < GRID_COLS - 1 && grid[y][x + 1].type === "dot" && grid[y][x + 1].color) {
      adjacentColors.push(grid[y][x + 1].color!);
    }
    
    // If we found adjacent colors, prioritize objective colors among them
    if (adjacentColors.length > 0) {
      // Filter to objective colors if any exist
      const objectiveColors = objectives
        .filter(obj => obj.current + obj.pendingCount < obj.target)
        .map(obj => obj.color);
      
      const adjacentObjectiveColors = adjacentColors.filter(c => objectiveColors.includes(c));
      
      if (adjacentObjectiveColors.length > 0) {
        return adjacentObjectiveColors[Math.floor(Math.random() * adjacentObjectiveColors.length)];
      }
      
      return adjacentColors[Math.floor(Math.random() * adjacentColors.length)];
    }
  }
  
  // Fall back to weighted random
  return getWeightedRandomColor();
}

function spawnNewDots(): void {
  for (let x = 0; x < GRID_COLS; x++) {
    // First pass: collect empty cell positions
    const emptyCells: number[] = [];
    for (let y = 0; y < GRID_ROWS; y++) {
      if (grid[y][x].type === "empty") {
        emptyCells.push(y);
      }
    }
    
    // Second pass: spawn dots with reversed stagger (bottom dots arrive first)
    // Process from bottom to top so we can check adjacency properly
    const totalEmpty = emptyCells.length;
    for (let i = emptyCells.length - 1; i >= 0; i--) {
      const y = emptyCells[i];
      // Reverse stagger: top empty gets largest offset, bottom empty gets smallest
      const staggerIndex = totalEmpty - (emptyCells.length - 1 - i);
      const spawnOffset = -staggerIndex * cellSize;
      
      // Use chain-favoring color selection
      const color = getChainFavoringColor(x, y);
      
      grid[y][x] = {
        type: "dot",
        color: color,
        animOffsetY: spawnOffset,
        animVelocity: 0,
      };
      dotsAnimating = true;
    }
  }
}

// Wait for all dot animations to complete
function waitForAnimations(): Promise<void> {
  return new Promise(resolve => {
    const checkAnimations = () => {
      if (dotsAnimating) {
        requestAnimationFrame(checkAnimations);
      } else {
        resolve();
      }
    };
    // Start checking after a short delay to ensure animations have started
    setTimeout(checkAnimations, 50);
  });
}

// Game state checks
function checkGameState(): void {
  if (movesRemaining <= 0) {
    const allComplete = objectives.every(obj => obj.current >= obj.target);
    if (allComplete) {
      gameState = "won";
      triggerHaptic("success");
      submitScore();
      updateUI();
      
      // Unlock next level if current level is the max unlocked
      if (currentLevel === maxUnlockedLevel && currentLevel < 20) {
        maxUnlockedLevel = currentLevel + 1;
        saveLevelProgress();
        levelSelector.updateMaxUnlockedLevel(maxUnlockedLevel);
      }
      
      openWinModal();
    } else {
      gameState = "lost";
      triggerHaptic("error");
      submitScore();
      updateUI();
    }
  } else {
    const allComplete = objectives.every(obj => obj.current >= obj.target);
    if (allComplete) {
      gameState = "won";
      triggerHaptic("success");
      submitScore();
      updateUI();
      
      // Unlock next level if current level is the max unlocked
      if (currentLevel === maxUnlockedLevel && currentLevel < 20) {
        maxUnlockedLevel = currentLevel + 1;
        saveLevelProgress();
        levelSelector.updateMaxUnlockedLevel(maxUnlockedLevel);
      }
      
      openWinModal();
    }
  }
}

// Input handling
function handlePointerDown(e: PointerEvent | TouchEvent): void {
  e.preventDefault();
  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  
  // Start screen now uses the Start button instead of canvas click
  if (gameState === "start") {
    return;
  }
  
  if (gameState === "levelSelect") {
    // Check for button click first
    if (levelSelector.handleButtonClick(x, y)) {
      playTapFx();
      triggerHaptic("light");
      return;
    }
    // Start drag for scrolling
    levelSelector.handleInput(x, y);
    return;
  }
  
  if (gameState === "lost") {
    restartGame();
    return;
  }
  
  // Won state is handled by the modal, so ignore canvas clicks
  if (gameState === "won") {
    return;
  }
  
  if (gameState !== "playing") return;
  
  const pos = getCellAtPixel(x, y);
  if (pos) {
    startChain(pos);
  }
}

function handlePointerMove(e: PointerEvent | TouchEvent): void {
  e.preventDefault();
  
  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  
  if (gameState === "levelSelect") {
    // Handle scrolling drag
    levelSelector.handleInputMove(x, y);
    levelSelector.updateHover(x, y);
    return;
  }
  
  if (!isDragging || gameState !== "playing") return;
  
  // Always update pointer position for free-form drawing
  currentPointerX = x;
  currentPointerY = y;
  
  // Check if pointer is over a valid dot
  const pos = getCellAtPixel(x, y);
  if (pos && lastSelectedPos && (pos.x !== lastSelectedPos.x || pos.y !== lastSelectedPos.y)) {
    addToChain(pos);
  }
}

function handlePointerUp(e: PointerEvent | TouchEvent): void {
  e.preventDefault();
  
  if (gameState === "levelSelect") {
    levelSelector.handleInputEnd();
    return;
  }
  
  endChain();
}

canvas.addEventListener("pointerdown", handlePointerDown);
canvas.addEventListener("pointermove", handlePointerMove);
canvas.addEventListener("pointerup", handlePointerUp);
canvas.addEventListener("pointerleave", handlePointerUp);

canvas.addEventListener("touchstart", handlePointerDown);
canvas.addEventListener("touchmove", handlePointerMove);
canvas.addEventListener("touchend", handlePointerUp);
canvas.addEventListener("touchcancel", handlePointerUp);

// Wheel event for scrolling level selector
canvas.addEventListener("wheel", (e: WheelEvent) => {
  if (gameState === "levelSelect") {
    e.preventDefault();
    levelSelector.handleWheel(e.deltaY);
  }
}, { passive: false });

// Haptics and score submission
function triggerHaptic(type: "light" | "medium" | "heavy" | "success" | "error"): void {
  if (!settings.haptics) return;
  
  // Use platform haptic function if available
  if (typeof (window as any).triggerHaptic === "function") {
    (window as any).triggerHaptic(type);
    return;
  }
  
  // Fallback to Web Vibration API for local testing
  if (navigator.vibrate) {
    const vibrationPatterns: Record<string, number | number[]> = {
      light: 10,
      medium: 20,
      heavy: 30,
      success: [10, 50, 10, 50, 10],
      error: [20, 100, 20],
    };
    navigator.vibrate(vibrationPatterns[type] || 10);
  }
}

function submitScore(): void {
  console.log("[TwoDots] Submitting final score:", score);
  if (typeof (window as any).submitScore === "function") {
    (window as any).submitScore(score);
  }
}

// Game flow
function startGame(): void {
  console.log("[TwoDots] Starting game");
  gameState = "playing";
  movesRemaining = INITIAL_MOVES;
  score = 0;
  selectedChain = [];
  // Reset start screen animation for next time
  startScreen.reset();
  initGrid();
  initObjectives();
  updateUI();
  triggerHaptic("light");
}

function restartGame(): void {
  startGame();
}

// Rendering
function drawDot(renderCtx: CanvasRenderingContext2D, x: number, y: number, color: DotColor, size: number, alpha = 1, scaleX = 1, scaleY = 1): void {
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  const radius = size * DOT_SIZE_MULTIPLIER;
  
  renderCtx.save();
  renderCtx.globalAlpha = alpha;
  
  // Apply squash/stretch transform from center bottom of dot
  renderCtx.translate(centerX, centerY + radius);
  renderCtx.scale(scaleX, scaleY);
  renderCtx.translate(-centerX, -(centerY + radius));
  
  // Flat colored dot (no gradient, no shadow, no highlight)
  renderCtx.fillStyle = COLOR_HEX[color];
  renderCtx.beginPath();
  renderCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  renderCtx.fill();
  
  renderCtx.restore();
}

function drawChainLine(renderCtx: CanvasRenderingContext2D, chain: Position[]): void {
  if (chain.length === 0) return;
  
  // Get the color of the first dot in the chain
  const firstDotColor = grid[chain[0].y][chain[0].x].color;
  renderCtx.strokeStyle = firstDotColor ? COLOR_HEX[firstDotColor] : "#FFFFFF";
  renderCtx.lineWidth = cellSize * LINE_SIZE_MULTIPLIER;
  renderCtx.lineCap = "round";
  renderCtx.lineJoin = "round";
  
  renderCtx.beginPath();
  
  // Draw line through all chain positions
  for (let i = 0; i < chain.length; i++) {
    const pos = chain[i];
    const x = gridOffsetX + pos.x * cellSize + cellSize / 2;
    const y = gridOffsetY + pos.y * cellSize + cellSize / 2;
    
    if (i === 0) {
      renderCtx.moveTo(x, y);
    } else {
      renderCtx.lineTo(x, y);
    }
  }
  
  // If dragging, extend line to current pointer position for free-form drawing
  if (isDragging && chain.length > 0) {
    renderCtx.lineTo(currentPointerX, currentPointerY);
  }
  
  renderCtx.stroke();
}

function render(): void {
  if (!ctx) return;
  
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  
  ctx.clearRect(0, 0, w, h);
  
  const isMobile = window.matchMedia("(pointer: coarse)").matches;
  
  // Background (same for start screen and gameplay)
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, w, h);
  
  if (gameState === "start") {
    // Sync Start button width to match "2Dots" text
    const titleFontSize = isMobile ? 32 : 48;
    ctx.font = `${titleFontSize}px 'Press Start 2P', monospace`;
    const titleWidth = ctx.measureText("2Dots").width;
    const startBtn = document.getElementById("start-btn");
    if (startBtn) {
      startBtn.style.width = `${Math.ceil(titleWidth)}px`;
    }
    startScreen.render(ctx, w, h, COLOR_HEX);
    return;
  }
  
  if (gameState === "levelSelect") {
    // Level selector screen
    levelSelector.render(ctx, w, h);
    return;
  }
  
  // Draw top HUD (moves, objectives)
  drawTopHUD(ctx, isMobile);
  
  // Draw bottom HUD (star, score/level)
  drawBottomHUD(ctx, isMobile);
  
  // Grid background
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(
    gridOffsetX - 10,
    gridOffsetY - 10,
    cellSize * GRID_COLS + 20,
    cellSize * GRID_ROWS + 20
  );
  
  // Draw chain line (behind dots but on top of background) - even if only one dot, to show free-form extension
  if (selectedChain.length > 0 && isDragging) {
    drawChainLine(ctx, selectedChain);
  } else if (selectedChain.length > 1) {
    drawChainLine(ctx, selectedChain);
  }
  
  // Draw ripple effects (behind dots)
  drawRipples(ctx);
  
  // Draw grid (dots on top of chain line and ripples)
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      const cell = grid[y][x];
      const pixelX = gridOffsetX + x * cellSize;
      // Apply animation offset to Y position
      const animOffset = cell.animOffsetY || 0;
      const pixelY = gridOffsetY + y * cellSize + animOffset;
      
      // Get scale values for squash/stretch effect
      const scaleX = cell.animScaleX ?? 1;
      const scaleY = cell.animScaleY ?? 1;
      
      if (cell.type === "dot" && cell.color) {
        drawDot(ctx, pixelX, pixelY, cell.color, cellSize, 1, scaleX, scaleY);
      }
    }
  }
  
  // Draw floating texts (chain pop feedback)
  drawFloatingTexts(ctx, isMobile);
  
  // Game over screen (only for lost - win uses HTML modal)
  if (gameState === "lost") {
    drawGameOverScreen("Game Over", "#FF4444");
  }
}

function drawGameOverScreen(message: string, color: string): void {
  if (!ctx) return;
  
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(0, 0, w, h);
  
  const isMobile = window.matchMedia("(pointer: coarse)").matches;
  ctx.fillStyle = color;
  ctx.font = `700 ${isMobile ? 28 : 36}px 'Nunito', sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(message, w / 2, h / 2 - 40);
  
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `600 ${isMobile ? 16 : 20}px 'Nunito', sans-serif`;
  ctx.fillText(`Score: ${score}`, w / 2, h / 2 + 40);
  ctx.fillText("Tap to Restart", w / 2, h / 2 + 80);
}

// Common panel background drawing function
function drawPanelBackground(
  renderCtx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  // Draw card background with shadow
  renderCtx.save();
  renderCtx.fillStyle = "#f0f0f1";
  renderCtx.shadowColor = "rgba(0, 0, 0, 0.08)";
  renderCtx.shadowBlur = 6;
  renderCtx.shadowOffsetY = 2;
  
  renderCtx.beginPath();
  renderCtx.roundRect(x, y, width, height, PANEL_BORDER_RADIUS);
  renderCtx.fill();
  renderCtx.restore();
  
  // Draw bottom highlight (same as start button style)
  renderCtx.save();
  renderCtx.beginPath();
  renderCtx.roundRect(x, y, width, height, PANEL_BORDER_RADIUS);
  renderCtx.clip();
  
  renderCtx.fillStyle = "rgba(0, 0, 0, 0.15)";
  renderCtx.fillRect(x, y + height - 4, width, 4);
  renderCtx.restore();
}

function drawTopHUD(renderCtx: CanvasRenderingContext2D, isMobile: boolean): void {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  
  const topMargin = isMobile ? 120 : 45;
  
  // Panel dimensions - using common sizes
  const sidePanelWidth = isMobile ? PANEL_WIDTH_MOBILE : PANEL_WIDTH_DESKTOP;
  const sidePanelHeight = isMobile ? PANEL_HEIGHT_MOBILE : PANEL_HEIGHT_DESKTOP;
  const objectivesPanelWidth = isMobile ? 180 : 200;
  const objectivesPanelHeight = isMobile ? PANEL_HEIGHT_MOBILE : PANEL_HEIGHT_DESKTOP;
  
  const padding = isMobile ? 15 : 20;
  
  // Draw Moves panel (left)
  const movesX = padding;
  const panelY = topMargin;
  drawMovesPanel(renderCtx, movesX, panelY, sidePanelWidth, sidePanelHeight, isMobile);
  
  // Draw Objectives panel (center)
  const objectivesX = (w - objectivesPanelWidth) / 2;
  drawObjectivesPanel(renderCtx, objectivesX, panelY, objectivesPanelWidth, objectivesPanelHeight, isMobile);
}

function drawBottomHUD(renderCtx: CanvasRenderingContext2D, isMobile: boolean): void {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  
  const bottomMargin = isMobile ? 40 : 30;
  const padding = isMobile ? 15 : 20;
  
  // Panel dimensions - using common sizes
  const panelWidth = isMobile ? PANEL_WIDTH_MOBILE : PANEL_WIDTH_DESKTOP;
  const panelHeight = isMobile ? PANEL_HEIGHT_MOBILE : PANEL_HEIGHT_DESKTOP;
  const panelY = h - panelHeight - bottomMargin;
  
  // Draw Star button (left)
  drawStarButton(renderCtx, padding, panelY, panelWidth, panelHeight, isMobile);
  
  // Draw Score/Level panel (right)
  const scoreX = w - panelWidth - padding;
  drawScoreLevelPanel(renderCtx, scoreX, panelY, panelWidth, panelHeight, isMobile);
}

function drawMovesPanel(
  renderCtx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  isMobile: boolean
): void {
  // Draw common panel background
  drawPanelBackground(renderCtx, x, y, width, height);
  
  // Draw sharp ribbon label with inward pointing arrow ends
  const ribbonHeight = isMobile ? 16 : 18;
  const ribbonY = y - ribbonHeight / 2 + 2;
  const arrowSize = isMobile ? 5 : 6;
  const ribbonBodyWidth = width + 8;
  const ribbonX = x - 4;
  
  // Draw ribbon as a single path with inward arrow notches
  renderCtx.fillStyle = "#9AA8B8";
  renderCtx.beginPath();
  // Start from top-left corner
  renderCtx.moveTo(ribbonX, ribbonY);
  // Across top
  renderCtx.lineTo(ribbonX + ribbonBodyWidth, ribbonY);
  // Down to right notch point (inward)
  renderCtx.lineTo(ribbonX + ribbonBodyWidth - arrowSize, ribbonY + ribbonHeight / 2);
  // Down to bottom-right corner
  renderCtx.lineTo(ribbonX + ribbonBodyWidth, ribbonY + ribbonHeight);
  // Across bottom
  renderCtx.lineTo(ribbonX, ribbonY + ribbonHeight);
  // Up to left notch point (inward)
  renderCtx.lineTo(ribbonX + arrowSize, ribbonY + ribbonHeight / 2);
  // Back to start
  renderCtx.closePath();
  renderCtx.fill();
  
  // Ribbon text (round to integer pixels to avoid blur)
  renderCtx.fillStyle = "#FFFFFF";
  renderCtx.font = `700 ${isMobile ? 8 : 9}px 'Nunito', sans-serif`;
  renderCtx.textAlign = "center";
  renderCtx.textBaseline = "middle";
  renderCtx.fillText("MOVES", Math.round(x + width / 2), Math.round(ribbonY + ribbonHeight / 2));
  renderCtx.textBaseline = "alphabetic";
  
  // Draw value
  renderCtx.fillStyle = "#555555";
  renderCtx.font = `500 ${isMobile ? 20 : 28}px 'Nunito', sans-serif`;
  renderCtx.textAlign = "center";
  renderCtx.fillText(movesRemaining.toString(), x + width / 2, y + height / 2 + 16);
}

function drawStarButton(
  renderCtx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  isMobile: boolean
): void {
  // Draw common panel background
  drawPanelBackground(renderCtx, x, y, width, height);
  
  // Draw star icon (outline)
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const starRadius = isMobile ? 16 : 18;
  
  // Draw circle border
  renderCtx.strokeStyle = "#D0D0D0";
  renderCtx.lineWidth = 2;
  renderCtx.beginPath();
  renderCtx.arc(centerX, centerY, starRadius, 0, Math.PI * 2);
  renderCtx.stroke();
  
  // Draw star shape
  renderCtx.strokeStyle = "#C0C0C0";
  renderCtx.lineWidth = 2;
  renderCtx.beginPath();
  const innerRadius = starRadius * 0.4;
  const outerRadius = starRadius * 0.7;
  for (let i = 0; i < 5; i++) {
    const outerAngle = (i * 72 - 90) * Math.PI / 180;
    const innerAngle = ((i * 72) + 36 - 90) * Math.PI / 180;
    
    const outerX = centerX + Math.cos(outerAngle) * outerRadius;
    const outerY = centerY + Math.sin(outerAngle) * outerRadius;
    const innerX = centerX + Math.cos(innerAngle) * innerRadius;
    const innerY = centerY + Math.sin(innerAngle) * innerRadius;
    
    if (i === 0) {
      renderCtx.moveTo(outerX, outerY);
    } else {
      renderCtx.lineTo(outerX, outerY);
    }
    renderCtx.lineTo(innerX, innerY);
  }
  renderCtx.closePath();
  renderCtx.stroke();
}

function drawScoreLevelPanel(
  renderCtx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  isMobile: boolean
): void {
  // Draw common panel background
  drawPanelBackground(renderCtx, x, y, width, height);
  
  // Draw score value
  renderCtx.fillStyle = "#555555";
  renderCtx.font = `600 ${isMobile ? 22 : 26}px 'Nunito', sans-serif`;
  renderCtx.textAlign = "center";
  renderCtx.fillText(score.toString(), x + width / 2, y + height / 2 + 4);
  
  // Draw level indicator
  renderCtx.fillStyle = "#999999";
  renderCtx.font = `600 ${isMobile ? 10 : 11}px 'Nunito', sans-serif`;
  renderCtx.textAlign = "center";
  renderCtx.fillText(`LV ${currentLevel}`, x + width / 2, y + height / 2 + 20);
}


function drawObjectivesPanel(
  renderCtx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  isMobile: boolean
): void {
  if (objectives.length === 0) return;
  
  // Draw common panel background
  drawPanelBackground(renderCtx, x, y, width, height);
  
  // Draw sharp ribbon label with inward pointing arrow ends
  const ribbonHeight = isMobile ? 16 : 18;
  const ribbonY = y - ribbonHeight / 2 + 2;
  const arrowSize = isMobile ? 5 : 6;
  const ribbonBodyWidth = width * 0.7;
  const ribbonX = x + (width - ribbonBodyWidth) / 2;
  
  // Draw ribbon as a single path with inward arrow notches
  renderCtx.fillStyle = "#9AA8B8";
  renderCtx.beginPath();
  // Start from top-left corner
  renderCtx.moveTo(ribbonX, ribbonY);
  // Across top
  renderCtx.lineTo(ribbonX + ribbonBodyWidth, ribbonY);
  // Down to right notch point (inward)
  renderCtx.lineTo(ribbonX + ribbonBodyWidth - arrowSize, ribbonY + ribbonHeight / 2);
  // Down to bottom-right corner
  renderCtx.lineTo(ribbonX + ribbonBodyWidth, ribbonY + ribbonHeight);
  // Across bottom
  renderCtx.lineTo(ribbonX, ribbonY + ribbonHeight);
  // Up to left notch point (inward)
  renderCtx.lineTo(ribbonX + arrowSize, ribbonY + ribbonHeight / 2);
  // Back to start
  renderCtx.closePath();
  renderCtx.fill();
  
  // Ribbon text (round to integer pixels to avoid blur)
  renderCtx.fillStyle = "#FFFFFF";
  renderCtx.font = `700 ${isMobile ? 8 : 9}px 'Nunito', sans-serif`;
  renderCtx.textAlign = "center";
  renderCtx.textBaseline = "middle";
  renderCtx.fillText("OBJECTIVES", Math.round(x + width / 2), Math.round(ribbonY + ribbonHeight / 2));
  renderCtx.textBaseline = "alphabetic";
  
  // Draw objective dots
  const baseDotRadius = isMobile ? 14 : 16;
  const dotRadius = baseDotRadius * OBJECTIVE_DOT_SIZE_MULTIPLIER;
  const spacing = width / (objectives.length + 1);
  const dotY = y + height / 2 + 2;
  
  for (let i = 0; i < objectives.length; i++) {
    const obj = objectives[i];
    // Show remaining including pending count (will be applied after shake)
    const remaining = Math.max(0, obj.target - obj.current - obj.pendingCount);
    let dotX = x + spacing * (i + 1);
    let currentDotY = dotY;
    
    // Apply shake offset if shaking (both X and Y axes)
    if (obj.shakeTime > 0) {
      const shakeProgress = obj.shakeTime / SHAKE_DURATION;
      const shakeFrequency = 30; // Higher = faster shake
      const shakeOffsetX = Math.sin(obj.shakeTime * shakeFrequency * 0.01) * SHAKE_INTENSITY * shakeProgress;
      const shakeOffsetY = Math.cos(obj.shakeTime * shakeFrequency * 0.012) * SHAKE_INTENSITY * shakeProgress;
      dotX += shakeOffsetX;
      currentDotY += shakeOffsetY;
    }
    
    // Draw colored dot
    renderCtx.fillStyle = COLOR_HEX[obj.color];
    renderCtx.beginPath();
    renderCtx.arc(dotX, currentDotY, dotRadius, 0, Math.PI * 2);
    renderCtx.fill();
    
    // Draw remaining count below dot (use original X for stable text)
    const textX = x + spacing * (i + 1);
    renderCtx.fillStyle = "#555555";
    renderCtx.font = `600 ${isMobile ? 10 : 12}px 'DM Sans', sans-serif`;
    renderCtx.textAlign = "center";
    renderCtx.fillText(remaining.toString(), textX, dotY + dotRadius + 10);
  }
}

function updateUI(): void {
  // Show/hide settings button
  const settingsBtn = document.getElementById("settings-btn");
  if (settingsBtn) {
    if (gameState === "start" || gameState === "levelSelect" || gameState === "won" || gameState === "lost") {
      settingsBtn.classList.add("hidden");
    } else {
      settingsBtn.classList.remove("hidden");
    }
  }
  
  // Show/hide start button
  const startBtn = document.getElementById("start-btn");
  if (startBtn) {
    if (gameState === "start") {
      startBtn.classList.remove("hidden");
    } else {
      startBtn.classList.add("hidden");
    }
  }
  
  // Show/hide back button
  const backBtn = document.getElementById("back-btn");
  if (backBtn) {
    if (gameState === "levelSelect") {
      backBtn.classList.remove("hidden");
      updateLevelIndicator(currentLevel);
    } else {
      backBtn.classList.add("hidden");
    }
  }
}

function updateLevelIndicator(level: number): void {
  const backBtn = document.getElementById("back-btn");
  if (backBtn) {
    backBtn.textContent = `Level ${level}`;
  }
}

// Animation constants
const FALL_SPEED = 12;         // Constant fall speed (pixels per frame)
const BOUNCE_DAMPING = 0.4;    // Retain velocity for visible bounce
const MIN_VELOCITY = 1.5;      // Stop bouncing sooner to feel crisp
const MAX_BOUNCE_HEIGHT = 10;  // Max pixels to bounce up
const SQUASH_AMOUNT = 0.18;    // How much to squash on impact (0-1)
const SCALE_RECOVERY = 0.15;   // How fast scale returns to normal
const BOUNCE_GRAVITY = 0.8;    // Gravity only used during bounce phase

// Update dot animations (bouncy fall with squash/stretch)
function updateDotAnimations(): void {
  // Don't run if grid isn't initialized yet
  if (grid.length === 0) return;
  
  let stillAnimating = false;
  
  for (let y = 0; y < GRID_ROWS; y++) {
    if (!grid[y]) continue;
    for (let x = 0; x < GRID_COLS; x++) {
      const cell = grid[y][x];
      if (!cell) continue;
      
      // Check if dot needs animation
      const hasOffset = cell.animOffsetY !== undefined && cell.animOffsetY !== 0;
      const isBouncing = cell.animVelocity !== undefined && cell.animVelocity !== 0;
      const hasScaleAnim = (cell.animScaleY !== undefined && cell.animScaleY !== 1) ||
                           (cell.animScaleX !== undefined && cell.animScaleX !== 1);
      
      if (cell.type === "dot" && (hasOffset || isBouncing || hasScaleAnim)) {
        // Handle position animation
        if (hasOffset || isBouncing) {
          const currentOffset = cell.animOffsetY || 0;
          const currentVelocity = cell.animVelocity || 0;
          
          // Determine if we're in initial falling phase (velocity is 0, hasn't bounced yet)
          // Once velocity becomes non-zero from bouncing, use gravity physics
          const isInitialFall = currentOffset < 0 && currentVelocity === 0;
          
          if (isInitialFall) {
            // Constant fall speed for uniform dropping (initial fall only)
            cell.animOffsetY = currentOffset + FALL_SPEED;
          } else {
            // Gravity-based physics for bounce and subsequent falls
            cell.animVelocity = currentVelocity + BOUNCE_GRAVITY;
            cell.animOffsetY = currentOffset + cell.animVelocity;
          }
          
          // Check if dot has reached or passed target position
          if (cell.animOffsetY >= 0) {
            // Hit the target - bounce!
            cell.animOffsetY = 0;
            
            // Calculate impact velocity for squash effect
            const impactVel = isInitialFall ? FALL_SPEED : Math.abs(cell.animVelocity || 0);
            const impactStrength = Math.min(impactVel / 15, 1);
            cell.animScaleY = 1 - (SQUASH_AMOUNT * impactStrength);
            cell.animScaleX = 1 + (SQUASH_AMOUNT * impactStrength * 0.5);
            
            // Reverse velocity and apply damping for bounce
            const bounceVelocity = -impactVel * BOUNCE_DAMPING;
            
            // Cap the bounce velocity to limit bounce height
            cell.animVelocity = Math.max(bounceVelocity, -MAX_BOUNCE_HEIGHT);
            
            // If velocity is too small, stop position bouncing
            if (Math.abs(cell.animVelocity) < MIN_VELOCITY) {
              cell.animOffsetY = 0;
              cell.animVelocity = 0;
            } else {
              stillAnimating = true;
            }
          } else {
            stillAnimating = true;
          }
        }
        
        // Recover scale toward normal (visual only, doesn't block interaction)
        if (cell.animScaleY !== undefined && cell.animScaleY !== 1) {
          cell.animScaleY += (1 - cell.animScaleY) * SCALE_RECOVERY;
          cell.animScaleX = 2 - cell.animScaleY; // Inverse for volume preservation
          if (Math.abs(cell.animScaleY - 1) < 0.01) {
            cell.animScaleY = 1;
            cell.animScaleX = 1;
          }
        }
      }
    }
  }
  
  dotsAnimating = stillAnimating;
}

// Track time for shake animation
let lastFrameTime = performance.now();

// Update objective shake animations
function updateObjectiveShake(deltaTime: number): void {
  for (const obj of objectives) {
    if (obj.shakeTime > 0) {
      obj.shakeTime -= deltaTime;
      
      // When shake completes, apply pending count
      if (obj.shakeTime <= 0) {
        obj.shakeTime = 0;
        obj.current += obj.pendingCount;
        obj.pendingCount = 0;
      }
    }
  }
}

// Animation loop
function gameLoop(): void {
  const now = performance.now();
  const deltaTime = now - lastFrameTime;
  lastFrameTime = now;
  
  updateDotAnimations();
  updateRipples();
  updateFloatingTexts();
  updateObjectiveShake(deltaTime);
  render();
  requestAnimationFrame(gameLoop);
}

gameLoop();

// Settings button
function createSettingsButton(): void {
  const btn = document.createElement("button");
  btn.id = "settings-btn";
  btn.className = "settings-btn hidden";
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24">
    <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" fill="currentColor"/>
  </svg>`;
  btn.setAttribute("aria-label", "Settings");
  
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    openSettings();
    triggerHaptic("light");
  });
  
  gameContainer.appendChild(btn);
}

function spawnConfetti(container: HTMLElement): void {
  const colors = ["#e84e60", "#a5547d", "#77c299", "#fece6c", "#FFD700", "#FF6B6B", "#4ECDC4"];
  const shapes = ["square", "circle", "strip"];
  const confettiCount = 50;
  
  for (let i = 0; i < confettiCount; i++) {
    const confetti = document.createElement("div");
    confetti.className = `confetti ${shapes[Math.floor(Math.random() * shapes.length)]}`;
    confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.left = `${Math.random() * 100}%`;
    confetti.style.top = `${-10 - Math.random() * 20}%`;
    confetti.style.animation = `confetti-fall ${2 + Math.random() * 2}s linear ${Math.random() * 0.5}s forwards`;
    confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
    container.appendChild(confetti);
    
    // Remove confetti after animation
    setTimeout(() => {
      if (confetti.parentNode) {
        confetti.remove();
      }
    }, 4500);
  }
}

function openWinModal(): void {
  const modal = document.createElement("div");
  modal.className = "win-modal";
  modal.id = "win-modal";
  modal.innerHTML = `
    <div class="win-content">
      <div class="win-crown">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/>
        </svg>
      </div>
      <h2>You Win!</h2>
      <p class="score-text">Score: ${score}</p>
      <div class="win-buttons">
        <button class="win-btn secondary" id="retry-btn">Retry</button>
        <button class="win-btn" id="next-level-btn">Next Level</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Play win sound when crown animates
  playWinFx();
  
  // Spawn confetti
  spawnConfetti(modal);
  
  const retryBtn = modal.querySelector("#retry-btn") as HTMLButtonElement;
  const nextLevelBtn = modal.querySelector("#next-level-btn") as HTMLButtonElement;
  
  const closeModal = (callback?: () => void) => {
    modal.classList.add("closing");
    triggerHaptic("light");
    setTimeout(() => {
      if (modal.parentNode) {
        document.body.removeChild(modal);
      }
      if (callback) callback();
    }, 300);
  };

  retryBtn.addEventListener("click", () => {
    triggerHaptic("light");
    closeModal(() => {
      restartGame();
    });
  });
  
  nextLevelBtn.addEventListener("click", () => {
    triggerHaptic("light");
    closeModal(() => {
      currentLevel++;
      levelSelector.setLevel(currentLevel);
      startGame();
    });
  });
}

function openSettings(): void {
  const modal = document.createElement("div");
  modal.className = "settings-modal";
  modal.innerHTML = `
    <div class="settings-content">
      <h2>Settings</h2>
      <div class="settings-toggle">
        <label>
          <span>Music</span>
          <input type="checkbox" id="music-toggle" ${settings.music ? "checked" : ""}>
        </label>
      </div>
      <div class="settings-toggle">
        <label>
          <span>Sound Effects</span>
          <input type="checkbox" id="fx-toggle" ${settings.fx ? "checked" : ""}>
        </label>
      </div>
      <div class="settings-toggle">
        <label>
          <span>Haptics</span>
          <input type="checkbox" id="haptics-toggle" ${settings.haptics ? "checked" : ""}>
        </label>
      </div>
      <button class="back-btn-settings">Home</button>
      <button class="close-btn">Close</button>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const musicToggle = modal.querySelector("#music-toggle") as HTMLInputElement;
  const fxToggle = modal.querySelector("#fx-toggle") as HTMLInputElement;
  const hapticsToggle = modal.querySelector("#haptics-toggle") as HTMLInputElement;
  const backBtn = modal.querySelector(".back-btn-settings") as HTMLButtonElement;
  const closeBtn = modal.querySelector(".close-btn") as HTMLButtonElement;
  
  musicToggle.addEventListener("change", () => {
    settings.music = musicToggle.checked;
    saveSettings();
    void applyMusicSetting();
    triggerHaptic("light");
  });
  
  fxToggle.addEventListener("change", () => {
    settings.fx = fxToggle.checked;
    saveSettings();
    triggerHaptic("light");
  });
  
  hapticsToggle.addEventListener("change", () => {
    settings.haptics = hapticsToggle.checked;
    saveSettings();
    triggerHaptic("light");
  });
  
  const closeModal = () => {
    modal.classList.add("closing");
    triggerHaptic("light");
    setTimeout(() => {
      if (modal.parentNode) {
        document.body.removeChild(modal);
      }
    }, 300);
  };

  backBtn.addEventListener("click", () => {
    closeModal();
    // Navigate to start screen
    gameState = "start";
    startScreen.reset();
    updateUI();
    triggerHaptic("light");
  });
  
  closeBtn.addEventListener("click", closeModal);
  
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });
}

createSettingsButton();

// Start button with ripple effect
const startBtn = document.getElementById("start-btn");
if (startBtn) {
  startBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (gameState === "start") {
      // Create ripple effect
      const rect = startBtn.getBoundingClientRect();
      const ripple = document.createElement("span");
      ripple.className = "ripple";
      
      // Calculate ripple size (should be large enough to cover the button)
      const size = Math.max(rect.width, rect.height);
      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;
      
      // Position ripple at center of button
      ripple.style.left = `${(rect.width - size) / 2}px`;
      ripple.style.top = `${(rect.height - size) / 2}px`;
      
      startBtn.appendChild(ripple);
      
      // Remove ripple element after animation completes
      ripple.addEventListener("animationend", () => {
        ripple.remove();
      });
      
      playTapFx();
      triggerHaptic("light");
      void applyMusicSetting();
      
      // Delay state transition to let ripple animation play
      setTimeout(() => {
        gameState = "levelSelect";
        levelSelector.reset();
        updateUI();
      }, 500);
    }
  });
}

const backBtn = document.getElementById("back-btn");
if (backBtn) {
  backBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (gameState === "levelSelect") {
      playTapFx();
      triggerHaptic("light");
      void applyMusicSetting();
      startGame();
    }
  });
}

updateUI();
