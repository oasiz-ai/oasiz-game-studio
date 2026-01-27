/**
 * TEMPLE RUN - 3D Endless Runner
 *
 * Built with Three.js for proper 3D rendering
 * Features:
 * - World-space path segments with 90° turns
 * - T-junction turn mechanics with visible wall dead-ends
 * - Smooth camera following and rotation
 * - Coins, obstacles, and progressive difficulty
 * - Touch swipe and keyboard controls
 */

import * as THREE from "three";

// ============= CONFIGURATION =============
const CONFIG = {
  // Path
  SEGMENT_LENGTH: 400,
  PATH_WIDTH: 250,
  WALL_HEIGHT: 120,
  VIEW_DIST: 3000,

  // Camera
  CAM_HEIGHT: 180,
  CAM_BACK: 200,
  CAM_FOV: 75,

  // Player
  PLAYER_SPEED_START: 5,
  PLAYER_SPEED_MAX: 10,
  PLAYER_SPEED_INCREMENT: 0.002,

  // Turn mechanics
  SEGMENTS_BETWEEN_TURNS_MIN: 6,
  SEGMENTS_BETWEEN_TURNS_MAX: 10,
  TURN_ACCEPT_DISTANCE: 350,
  TURN_MISS_DISTANCE: 30,

  // Coins
  COIN_RADIUS: 15,
  COINS_PER_SEGMENT: 3,

  // Obstacles
  OBSTACLE_CHANCE: 0.3,
};

// ============= TYPES =============
type GameState = "START" | "PLAYING" | "PAUSED" | "GAME_OVER";
type TurnDir = -1 | 0 | 1;
type PlayerAction = "running" | "jumping" | "sliding";
type ObstacleType = "jump" | "slide"; // jump = barrier to jump over, slide = bridge to slide under

interface PathSegment {
  id: number;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  dir: number;
  type: "straight" | "turn";
  turnDir: TurnDir;
  completed: boolean;
  mesh?: THREE.Group;
  hasObstacle?: boolean;
}

interface Coin {
  x: number;
  y: number;
  z: number;
  collected: boolean;
  mesh?: THREE.Mesh;
}

interface Obstacle {
  x: number;
  z: number;
  type: ObstacleType;
  mesh?: THREE.Group;
  hit: boolean;
}

interface Enemy {
  x: number;
  z: number;
  dir: number;
  mesh?: THREE.Group;
  active: boolean;
}

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

// ============= UTILITY =============
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff < -Math.PI) diff += Math.PI * 2;
  while (diff > Math.PI) diff -= Math.PI * 2;
  return a + diff * t;
}

function getDirVector(dir: number): { x: number; z: number } {
  return { x: Math.sin(dir), z: Math.cos(dir) };
}

// ============= GLOBALS =============
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;

// UI Elements
const startScreen = document.getElementById("startScreen")!;
const gameOverScreen = document.getElementById("gameOverScreen")!;
const pauseScreen = document.getElementById("pauseScreen")!;
const settingsModal = document.getElementById("settingsModal")!;
const settingsBtn = document.getElementById("settingsBtn")!;
const pauseBtn = document.getElementById("pauseBtn")!;
const scoreDisplay = document.getElementById("scoreDisplay")!;
const currentScoreEl = document.getElementById("currentScore")!;
const finalScoreEl = document.getElementById("finalScore")!;
const turnIndicator = document.getElementById("turnIndicator")!;

// State
let gameState: GameState = "START";
let w = window.innerWidth;
let h = window.innerHeight;
const isMobile = window.matchMedia("(pointer: coarse)").matches;

// Player state - world space
let playerX = 0;
let playerZ = 0;
let playerDir = 0;
let targetPlayerDir = 0;
let playerSpeed = CONFIG.PLAYER_SPEED_START;
let playerMesh: THREE.Group;
let playerAction: PlayerAction = "running";
let playerY = 0; // For jumping
let playerYVelocity = 0;
let slideTimer = 0;
const JUMP_FORCE = 13; // Medium jump height
const GRAVITY = 0.48; // Balanced fall speed
const SLIDE_DURATION = 1200; // ms - longer slide for more forgiving timing

// Lane system - player can be in left, center, or right lane
type Lane = -1 | 0 | 1; // -1 = left, 0 = center, 1 = right
let currentLane: Lane = 0;
let targetLaneOffset = 0;
let actualLaneOffset = 0;
const LANE_WIDTH = 70; // Distance from center to side lanes
const LANE_SWITCH_SPEED = 0.2;

// Wall hit tracking for demon catch-up
let wallHitCount = 0;
let demonDistance = 400; // How far behind the demon is
const DEMON_CATCHUP_ON_HIT = 150; // How much closer demon gets on wall hit

// Path
let segments: PathSegment[] = [];
let nextSegmentId = 0;
let pathEndX = 0;
let pathEndZ = 0;
let pathEndDir = 0;
let segmentsSinceLastTurn = 0;
let cumulativeTurnDir = 0;

// Collectibles
let coins: Coin[] = [];

// Obstacles and enemies
let obstacles: Obstacle[] = [];
let enemies: Enemy[] = [];
let obstacleAddedSinceLastTurn = false;
let totalSegmentsGenerated = 0;

// Score
let score = 0;
let distanceScore = 0;

// Settings
let settings: Settings = loadSettings();

// Animation
let animationFrameId: number;
let lastTime = 0;
let runAnimTime = 0;

// Input
let touchStartX = 0;
let touchStartY = 0;
const SWIPE_THRESHOLD = 50;

// ============= THREE.JS SETUP =============
function initThreeJS(): void {
  console.log("[initThreeJS] Initializing Three.js - Forbidden Forest Theme");

  // Scene - Dark, misty forest atmosphere
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0812); // Deep purple-black night sky
  scene.fog = new THREE.Fog(0x0a0812, 50, CONFIG.VIEW_DIST * 0.8); // Thicker fog

  // Camera
  camera = new THREE.PerspectiveCamera(CONFIG.CAM_FOV, w / h, 1, CONFIG.VIEW_DIST + 1000);
  camera.position.set(0, CONFIG.CAM_HEIGHT, -CONFIG.CAM_BACK);
  camera.lookAt(0, CONFIG.CAM_HEIGHT * 0.5, 200);

  // Renderer
  const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Lighting - brighter moonlight for visibility
  const ambientLight = new THREE.AmbientLight(0x5566bb, 0.6); // Brighter blue ambient
  scene.add(ambientLight);

  const moonLight = new THREE.DirectionalLight(0x8899dd, 1.2); // Brighter moonlight
  moonLight.position.set(-100, 400, 200);
  moonLight.castShadow = false;
  scene.add(moonLight);

  // Hemisphere light - cold sky, dark ground
  const hemiLight = new THREE.HemisphereLight(0x4466aa, 0x151515, 0.7);
  scene.add(hemiLight);

  // Add subtle point light for atmosphere
  const fogLight = new THREE.PointLight(0x6688cc, 0.4, 600);
  fogLight.position.set(0, 100, 0);
  scene.add(fogLight);

  // Ground plane - dark marsh/forest floor
  const groundGeo = new THREE.PlaneGeometry(10000, 10000);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x0f1510, // Dark forest green
    roughness: 1,
    metalness: 0,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -50;
  scene.add(ground);

  // Create player mesh
  createPlayerMesh();

  console.log("[initThreeJS] Three.js initialized");
}

function createPlayerMesh(): void {
  playerMesh = new THREE.Group();

  // Harry Potter colors
  const robeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.8 }); // Black Hogwarts robes
  const robeInnerMat = new THREE.MeshStandardMaterial({ color: 0x2a2a3e, roughness: 0.7 }); // Inner robe
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf5d0b0, roughness: 0.6 }); // Skin tone
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.95 }); // Jet black messy hair
  const scarfRedMat = new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.6 }); // Gryffindor red
  const scarfGoldMat = new THREE.MeshStandardMaterial({ color: 0xdaa520, roughness: 0.5 }); // Gryffindor gold
  const glassesMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.7 }); // Glasses frame
  const wandMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7 }); // Wand wood
  const wandTipMat = new THREE.MeshStandardMaterial({ 
    color: 0xffffff, 
    emissive: 0x88ccff, 
    emissiveIntensity: 0.8 
  }); // Wand tip glow
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 }); // Black shoes

  // Torso group (for leaning during slide)
  const torsoGroup = new THREE.Group();
  torsoGroup.name = "torso";
  
  // Main body - Hogwarts robes (black, flowing)
  const bodyGeo = new THREE.CylinderGeometry(12, 18, 45, 8);
  const body = new THREE.Mesh(bodyGeo, robeMat);
  body.position.y = 0;
  torsoGroup.add(body);
  
  // Robe collar/shoulders
  const shoulderGeo = new THREE.SphereGeometry(16, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const shoulders = new THREE.Mesh(shoulderGeo, robeMat);
  shoulders.position.y = 20;
  shoulders.rotation.x = Math.PI;
  torsoGroup.add(shoulders);
  
  // White undershirt collar
  const collarGeo = new THREE.CylinderGeometry(8, 10, 6, 8);
  const collarMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5 });
  const collar = new THREE.Mesh(collarGeo, collarMat);
  collar.position.y = 24;
  torsoGroup.add(collar);
  
  // Gryffindor tie (red with gold stripes)
  const tieGeo = new THREE.BoxGeometry(4, 18, 2);
  const tie = new THREE.Mesh(tieGeo, scarfRedMat);
  tie.position.set(0, 12, 12);
  tie.rotation.x = 0.1;
  torsoGroup.add(tie);
  
  // Gold stripe on tie
  const tieStripeGeo = new THREE.BoxGeometry(4.5, 3, 2.5);
  const tieStripe = new THREE.Mesh(tieStripeGeo, scarfGoldMat);
  tieStripe.position.set(0, 8, 12.5);
  torsoGroup.add(tieStripe);
  
  // Head
  const headGeo = new THREE.SphereGeometry(12, 12, 10);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = 40;
  head.scale.set(1, 1.05, 0.95);
  torsoGroup.add(head);
  
  // Messy black hair - multiple tufts for that Potter look
  const hairBaseGeo = new THREE.SphereGeometry(13, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const hairBase = new THREE.Mesh(hairBaseGeo, hairMat);
  hairBase.position.y = 44;
  hairBase.rotation.x = -0.2;
  torsoGroup.add(hairBase);
  
  // Messy hair tufts sticking up
  const tuftGeo = new THREE.ConeGeometry(4, 8, 5);
  const tuftPositions = [
    { x: 0, y: 52, z: -2, rx: -0.3, rz: 0 },
    { x: -6, y: 50, z: 0, rx: -0.2, rz: 0.4 },
    { x: 6, y: 50, z: 0, rx: -0.2, rz: -0.4 },
    { x: -3, y: 51, z: 4, rx: 0.3, rz: 0.2 },
    { x: 3, y: 51, z: 4, rx: 0.3, rz: -0.2 },
    { x: 0, y: 50, z: -6, rx: -0.5, rz: 0 },
  ];
  for (const pos of tuftPositions) {
    const tuft = new THREE.Mesh(tuftGeo, hairMat);
    tuft.position.set(pos.x, pos.y, pos.z);
    tuft.rotation.set(pos.rx, 0, pos.rz);
    torsoGroup.add(tuft);
  }
  
  // Round glasses
  const glassRingGeo = new THREE.TorusGeometry(4, 0.8, 8, 16);
  const leftGlass = new THREE.Mesh(glassRingGeo, glassesMat);
  leftGlass.position.set(-5, 41, 10);
  leftGlass.rotation.y = Math.PI / 2;
  torsoGroup.add(leftGlass);
  
  const rightGlass = new THREE.Mesh(glassRingGeo, glassesMat);
  rightGlass.position.set(5, 41, 10);
  rightGlass.rotation.y = Math.PI / 2;
  torsoGroup.add(rightGlass);
  
  // Glasses bridge
  const bridgeGeo = new THREE.CylinderGeometry(0.6, 0.6, 4, 6);
  const bridge = new THREE.Mesh(bridgeGeo, glassesMat);
  bridge.position.set(0, 41, 11);
  bridge.rotation.z = Math.PI / 2;
  torsoGroup.add(bridge);
  
  // Glasses temples (arms)
  const templeGeo = new THREE.CylinderGeometry(0.5, 0.5, 10, 6);
  const leftTemple = new THREE.Mesh(templeGeo, glassesMat);
  leftTemple.position.set(-10, 41, 5);
  leftTemple.rotation.x = Math.PI / 2;
  torsoGroup.add(leftTemple);
  
  const rightTemple = new THREE.Mesh(templeGeo, glassesMat);
  rightTemple.position.set(10, 41, 5);
  rightTemple.rotation.x = Math.PI / 2;
  torsoGroup.add(rightTemple);
  
  // Lightning scar (subtle)
  const scarMat = new THREE.MeshStandardMaterial({ color: 0xcc4444, roughness: 0.3 });
  const scarGeo = new THREE.BoxGeometry(1.5, 6, 0.5);
  const scar1 = new THREE.Mesh(scarGeo, scarMat);
  scar1.position.set(-2, 47, 10);
  scar1.rotation.z = 0.3;
  torsoGroup.add(scar1);
  const scar2 = new THREE.Mesh(scarGeo, scarMat);
  scar2.position.set(-1, 45, 10);
  scar2.rotation.z = -0.3;
  torsoGroup.add(scar2);
  
  // Eyes (green like his mother's)
  const eyeGeo = new THREE.SphereGeometry(1.8, 6, 6);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x228b22 }); // Green eyes
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-5, 40, 10);
  torsoGroup.add(leftEye);
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(5, 40, 10);
  torsoGroup.add(rightEye);
  
  // Pupils
  const pupilGeo = new THREE.SphereGeometry(0.8, 4, 4);
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
  const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
  leftPupil.position.set(-5, 40, 11.5);
  torsoGroup.add(leftPupil);
  const rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
  rightPupil.position.set(5, 40, 11.5);
  torsoGroup.add(rightPupil);
  
  // Nose
  const noseGeo = new THREE.ConeGeometry(1.5, 3, 6);
  const nose = new THREE.Mesh(noseGeo, skinMat);
  nose.position.set(0, 37, 11);
  nose.rotation.x = -Math.PI / 2;
  torsoGroup.add(nose);
  
  torsoGroup.position.y = 65;
  playerMesh.add(torsoGroup);

  // Arms with robe sleeves
  const upperArmGeo = new THREE.CapsuleGeometry(6, 16, 6, 8);
  const lowerArmGeo = new THREE.CapsuleGeometry(4, 14, 6, 8);
  const handGeo = new THREE.SphereGeometry(4.5, 6, 6);
  
  // Left arm
  const leftArmGroup = new THREE.Group();
  leftArmGroup.name = "leftArm";
  const leftUpperArm = new THREE.Mesh(upperArmGeo, robeMat);
  leftUpperArm.position.y = -10;
  leftArmGroup.add(leftUpperArm);
  const leftLowerArm = new THREE.Mesh(lowerArmGeo, robeMat);
  leftLowerArm.position.y = -26;
  leftArmGroup.add(leftLowerArm);
  const leftHand = new THREE.Mesh(handGeo, skinMat);
  leftHand.position.y = -38;
  leftArmGroup.add(leftHand);
  leftArmGroup.position.set(-20, 82, 0);
  playerMesh.add(leftArmGroup);

  // Right arm - holding wand!
  const rightArmGroup = new THREE.Group();
  rightArmGroup.name = "rightArm";
  const rightUpperArm = new THREE.Mesh(upperArmGeo, robeMat);
  rightUpperArm.position.y = -10;
  rightArmGroup.add(rightUpperArm);
  const rightLowerArm = new THREE.Mesh(lowerArmGeo, robeMat);
  rightLowerArm.position.y = -26;
  rightArmGroup.add(rightLowerArm);
  const rightHand = new THREE.Mesh(handGeo, skinMat);
  rightHand.position.y = -38;
  rightArmGroup.add(rightHand);
  
  // THE WAND - Holly, 11 inches, phoenix feather core
  const wandGroup = new THREE.Group();
  wandGroup.name = "wand";
  const wandHandleGeo = new THREE.CylinderGeometry(1.2, 1.8, 8, 6);
  const wandHandle = new THREE.Mesh(wandHandleGeo, wandMat);
  wandHandle.position.y = 0;
  wandGroup.add(wandHandle);
  
  const wandShaftGeo = new THREE.CylinderGeometry(0.8, 1.2, 22, 6);
  const wandShaft = new THREE.Mesh(wandShaftGeo, wandMat);
  wandShaft.position.y = 15;
  wandGroup.add(wandShaft);
  
  // Wand tip with magical glow
  const wandTipGeo = new THREE.SphereGeometry(2, 8, 8);
  const wandTip = new THREE.Mesh(wandTipGeo, wandTipMat);
  wandTip.position.y = 28;
  wandGroup.add(wandTip);
  
  // Magical particles around wand tip
  const particleMat = new THREE.MeshStandardMaterial({
    color: 0xaaddff,
    emissive: 0x6699ff,
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.7,
  });
  for (let i = 0; i < 4; i++) {
    const pGeo = new THREE.SphereGeometry(0.8, 4, 4);
    const particle = new THREE.Mesh(pGeo, particleMat);
    const angle = (i / 4) * Math.PI * 2;
    particle.position.set(Math.cos(angle) * 4, 28, Math.sin(angle) * 4);
    wandGroup.add(particle);
  }
  
  wandGroup.position.set(0, -38, 8);
  wandGroup.rotation.x = -0.4; // Pointing forward
  rightArmGroup.add(wandGroup);
  
  rightArmGroup.position.set(20, 82, 0);
  playerMesh.add(rightArmGroup);

  // Legs with robe covering
  const upperLegGeo = new THREE.CapsuleGeometry(7, 20, 6, 8);
  const lowerLegGeo = new THREE.CapsuleGeometry(5, 18, 6, 8);
  const bootGeo = new THREE.BoxGeometry(11, 10, 16);
  
  // Robe bottom (flowing)
  const robeBottomGeo = new THREE.CylinderGeometry(18, 22, 20, 8);
  const robeBottom = new THREE.Mesh(robeBottomGeo, robeMat);
  robeBottom.position.y = 35;
  playerMesh.add(robeBottom);
  
  // Left leg
  const leftLegGroup = new THREE.Group();
  leftLegGroup.name = "leftLeg";
  const leftUpperLeg = new THREE.Mesh(upperLegGeo, robeMat);
  leftUpperLeg.position.y = -12;
  leftLegGroup.add(leftUpperLeg);
  const leftLowerLeg = new THREE.Mesh(lowerLegGeo, robeMat);
  leftLowerLeg.position.y = -34;
  leftLegGroup.add(leftLowerLeg);
  const leftBoot = new THREE.Mesh(bootGeo, bootMat);
  leftBoot.position.set(0, -48, 2);
  leftLegGroup.add(leftBoot);
  leftLegGroup.position.set(-9, 45, 0);
  playerMesh.add(leftLegGroup);

  // Right leg
  const rightLegGroup = new THREE.Group();
  rightLegGroup.name = "rightLeg";
  const rightUpperLeg = new THREE.Mesh(upperLegGeo, robeMat);
  rightUpperLeg.position.y = -12;
  rightLegGroup.add(rightUpperLeg);
  const rightLowerLeg = new THREE.Mesh(lowerLegGeo, robeMat);
  rightLowerLeg.position.y = -34;
  rightLegGroup.add(rightLowerLeg);
  const rightBoot = new THREE.Mesh(bootGeo, bootMat);
  rightBoot.position.set(0, -48, 2);
  rightLegGroup.add(rightBoot);
  rightLegGroup.position.set(9, 45, 0);
  playerMesh.add(rightLegGroup);

  scene.add(playerMesh);
}

// ============= PATH GENERATION =============
function createSegmentMesh(seg: PathSegment): THREE.Group {
  const group = new THREE.Group();

  const hw = CONFIG.PATH_WIDTH / 2;
  const segDirX = seg.x2 - seg.x1;
  const segDirZ = seg.z2 - seg.z1;
  const segLen = Math.sqrt(segDirX ** 2 + segDirZ ** 2);

  // Perpendicular direction for width
  const perpX = -segDirZ / segLen;
  const perpZ = segDirX / segLen;

  // Abyss beneath the path - dark void
  const abyssGeo = new THREE.PlaneGeometry(CONFIG.PATH_WIDTH + 100, segLen + 100);
  const abyssMat = new THREE.MeshStandardMaterial({
    color: 0x0a0505,
    roughness: 1,
    metalness: 0,
  });
  const abyss = new THREE.Mesh(abyssGeo, abyssMat);
  abyss.rotation.x = -Math.PI / 2;
  abyss.rotation.z = -seg.dir;
  abyss.position.set((seg.x1 + seg.x2) / 2, -80, (seg.z1 + seg.z2) / 2);
  group.add(abyss);

  // Dark swamp water beneath with eerie glow
  const swampGeo = new THREE.PlaneGeometry(CONFIG.PATH_WIDTH + 60, segLen + 60);
  const swampMat = new THREE.MeshStandardMaterial({
    color: 0x0a1a15,
    emissive: 0x051510,
    emissiveIntensity: 0.2,
    roughness: 0.4,
    metalness: 0.3,
    transparent: true,
    opacity: 0.9,
  });
  const swamp = new THREE.Mesh(swampGeo, swampMat);
  swamp.rotation.x = -Math.PI / 2;
  swamp.rotation.z = -seg.dir;
  swamp.position.set((seg.x1 + seg.x2) / 2, -100, (seg.z1 + seg.z2) / 2);
  group.add(swamp);

  // Main floor - lighter cobblestones for better contrast
  const floorGeo = new THREE.PlaneGeometry(CONFIG.PATH_WIDTH, segLen);
  const floorColor = seg.id % 2 === 0 ? 0x4a5560 : 0x3d4850; // Lighter gray stone
  const floorMat = new THREE.MeshStandardMaterial({
    color: floorColor,
    roughness: 0.7,
    metalness: 0.1,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.rotation.z = -seg.dir;
  floor.position.set((seg.x1 + seg.x2) / 2, 0, (seg.z1 + seg.z2) / 2);
  group.add(floor);

  // Floor edge trim with bright magical blue glow
  const edgeWidth = 12;
  const edgeMat = new THREE.MeshStandardMaterial({
    color: 0x66aaee,
    emissive: 0x4488cc,
    emissiveIntensity: 0.5,
    roughness: 0.2,
    metalness: 0.6,
  });
  
  // Left edge
  const leftEdgeGeo = new THREE.BoxGeometry(edgeWidth, 8, segLen);
  const leftEdge = new THREE.Mesh(leftEdgeGeo, edgeMat);
  leftEdge.position.set(
    (seg.x1 + seg.x2) / 2 - perpX * (hw - edgeWidth/2),
    4,
    (seg.z1 + seg.z2) / 2 - perpZ * (hw - edgeWidth/2)
  );
  leftEdge.rotation.y = -seg.dir;
  group.add(leftEdge);
  
  // Right edge
  const rightEdge = new THREE.Mesh(leftEdgeGeo, edgeMat);
  rightEdge.position.set(
    (seg.x1 + seg.x2) / 2 + perpX * (hw - edgeWidth/2),
    4,
    (seg.z1 + seg.z2) / 2 + perpZ * (hw - edgeWidth/2)
  );
  rightEdge.rotation.y = -seg.dir;
  group.add(rightEdge);

  // Center line pattern - bright magical rune strip
  const centerLineGeo = new THREE.PlaneGeometry(10, segLen - 30);
  const centerLineMat = new THREE.MeshStandardMaterial({
    color: 0x77bbff,
    emissive: 0x5599dd,
    emissiveIntensity: 0.6,
    roughness: 0.1,
    metalness: 0.7,
  });
  const centerLine = new THREE.Mesh(centerLineGeo, centerLineMat);
  centerLine.rotation.x = -Math.PI / 2;
  centerLine.rotation.z = -seg.dir;
  centerLine.position.set((seg.x1 + seg.x2) / 2, 0.5, (seg.z1 + seg.z2) / 2);
  group.add(centerLine);

  // Wall materials - lighter stone for visibility
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x3a4540, // Lighter gray-green stone
    roughness: 0.85,
  });
  const rightWallMat = new THREE.MeshStandardMaterial({
    color: 0x2f3a35, // Slightly darker
    roughness: 0.85,
  });

  const wallOffset = hw + 10; // Distance from center to wall
  const wallThickness = 20;

  if (seg.type === "turn") {
    // TURN WALLS:
    // - OUTER side: Full wall
    // - INNER side: Partial wall (75% length, stops before opening)
    // - DEAD END: Full width wall at end
    
    // For LEFT turn (turnDir = 1): opening on LEFT, outer wall on RIGHT
    // For RIGHT turn (turnDir = -1): opening on RIGHT, outer wall on LEFT
    
    const isLeftTurn = seg.turnDir === 1;
    const outerSide = isLeftTurn ? 1 : -1;
    const innerSide = -outerSide;
    
    // Direction vector (normalized)
    const dirX = segDirX / segLen;
    const dirZ = segDirZ / segLen;
    
    // OUTER WALL - shortened, stops before the corner to leave room for next corridor's wall
    const outerWallLen = segLen; // Shortened so it doesn't extend to the corner
    const outerWallGeo = new THREE.BoxGeometry(wallThickness, CONFIG.WALL_HEIGHT, outerWallLen);
    const outerWall = new THREE.Mesh(outerWallGeo, isLeftTurn ? rightWallMat : wallMat);
    // Position from start, extending only partway (not all the way to x2)
    outerWall.position.set(
      seg.x1 + dirX * (outerWallLen / 2) + perpX * wallOffset * outerSide,
      CONFIG.WALL_HEIGHT / 2,
      seg.z1 + dirZ * (outerWallLen / 2) + perpZ * wallOffset * outerSide
    );
    outerWall.rotation.y = -seg.dir;
    group.add(outerWall);
    
    // Outer wall cap
    const outerCapGeo = new THREE.BoxGeometry(30, 12, outerWallLen);
    const wallCapMat = new THREE.MeshStandardMaterial({ color: 0x7a6a55, roughness: 0.8 });
    const outerCap = new THREE.Mesh(outerCapGeo, wallCapMat);
    outerCap.position.set(
      seg.x1 + dirX * (outerWallLen / 2) + perpX * wallOffset * outerSide,
      CONFIG.WALL_HEIGHT + 6,
      seg.z1 + dirZ * (outerWallLen / 2) + perpZ * wallOffset * outerSide
    );
    outerCap.rotation.y = -seg.dir;
    group.add(outerCap);
    
    // INNER WALL - shorter length (40%), stops well before the turn opening
    const innerWallLen = segLen * 0.40;
    const innerWallGeo = new THREE.BoxGeometry(wallThickness, CONFIG.WALL_HEIGHT, innerWallLen);
    const innerWall = new THREE.Mesh(innerWallGeo, isLeftTurn ? wallMat : rightWallMat);
    // Position from start, extending only partway into segment
    innerWall.position.set(
      seg.x1 + dirX * (innerWallLen / 2) + perpX * wallOffset * innerSide,
      CONFIG.WALL_HEIGHT / 2,
      seg.z1 + dirZ * (innerWallLen / 2) + perpZ * wallOffset * innerSide
    );
    innerWall.rotation.y = -seg.dir;
    group.add(innerWall);
    
    // Inner wall cap (partial)
    const innerCapGeo = new THREE.BoxGeometry(30, 12, innerWallLen);
    const innerCap = new THREE.Mesh(innerCapGeo, wallCapMat);
    innerCap.position.set(
      seg.x1 + dirX * (innerWallLen / 2) + perpX * wallOffset * innerSide,
      CONFIG.WALL_HEIGHT + 6,
      seg.z1 + dirZ * (innerWallLen / 2) + perpZ * wallOffset * innerSide
    );
    innerCap.rotation.y = -seg.dir;
    group.add(innerCap);
    
    // DEAD END - full width wall positioned at the turn point
    // Use + to push FORWARD (away from player), - to push BACKWARD (toward player)
    const deadEndOffset = hw * 1.1; // Small forward offset to sit at the turn junction
    const deadEndGeo = new THREE.BoxGeometry(CONFIG.PATH_WIDTH + wallThickness * 2, CONFIG.WALL_HEIGHT, wallThickness);
    const deadEnd = new THREE.Mesh(deadEndGeo, wallMat);
    const deadEndX = seg.x2 + dirX * deadEndOffset;
    const deadEndZ = seg.z2 + dirZ * deadEndOffset;
    deadEnd.position.set(deadEndX, CONFIG.WALL_HEIGHT / 2, deadEndZ);
    deadEnd.rotation.y = -seg.dir;
    group.add(deadEnd);
    
    // Dead end cap
    const deadEndCapGeo = new THREE.BoxGeometry(CONFIG.PATH_WIDTH + wallThickness * 2 + 10, 12, 30);
    const deadEndCap = new THREE.Mesh(deadEndCapGeo, wallCapMat);
    deadEndCap.position.set(deadEndX, CONFIG.WALL_HEIGHT + 6, deadEndZ);
    deadEndCap.rotation.y = -seg.dir;
    group.add(deadEndCap);
    
    // Torch on dead end (center)
    const torchMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.9 });
    const flameMat = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      emissive: 0xff4400,
      emissiveIntensity: 1,
    });
    const torchGeo = new THREE.CylinderGeometry(4, 6, 30, 8);
    const torch = new THREE.Mesh(torchGeo, torchMat);
    torch.position.set(deadEndX, CONFIG.WALL_HEIGHT * 0.7, deadEndZ);
    group.add(torch);
    
    const flameGeo = new THREE.ConeGeometry(8, 20, 8);
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(deadEndX, CONFIG.WALL_HEIGHT * 0.7 + 20, deadEndZ);
    group.add(flame);
    
  } else {
    // Straight segments - walls positioned from x1 toward x2 (not centered)
    // This prevents walls from extending backward past the segment start
    // IMPORTANT: Use a larger offset to avoid clipping at corners after turns
    const dirX = segDirX / segLen;
    const dirZ = segDirZ / segLen;
    const wallStartOffset = hw * 1.6; // INCREASED offset to fully clear turn junctions
    const actualWallLen = segLen - wallStartOffset - hw * 0.3; // Shorter walls, stop before end too
    const wallGeo = new THREE.BoxGeometry(wallThickness, CONFIG.WALL_HEIGHT, actualWallLen);
    
    const leftWall = new THREE.Mesh(wallGeo, wallMat);
    leftWall.position.set(
      seg.x1 + dirX * (actualWallLen / 2 + wallStartOffset) - perpX * wallOffset,
      CONFIG.WALL_HEIGHT / 2,
      seg.z1 + dirZ * (actualWallLen / 2 + wallStartOffset) - perpZ * wallOffset
    );
    leftWall.rotation.y = -seg.dir;
    group.add(leftWall);

    const rightWall = new THREE.Mesh(wallGeo, rightWallMat);
    rightWall.position.set(
      seg.x1 + dirX * (actualWallLen / 2 + wallStartOffset) + perpX * wallOffset,
      CONFIG.WALL_HEIGHT / 2,
      seg.z1 + dirZ * (actualWallLen / 2 + wallStartOffset) + perpZ * wallOffset
    );
    rightWall.rotation.y = -seg.dir;
    group.add(rightWall);
  }

  // Wall decorations only on straight segments - offset MUST match wall positioning
  if (seg.type !== "turn") {
    const dirX = segDirX / segLen;
    const dirZ = segDirZ / segLen;
    // FIX: Use the SAME offset as walls to prevent caps from clipping at corners
    const decorOffset = hw * 1.6; // MATCHES wallStartOffset above
    const actualCapLen = segLen - decorOffset - hw * 0.3; // MATCHES actualWallLen above
    
    // Wall caps for straight segments
    const wallCapMat = new THREE.MeshStandardMaterial({ color: 0x7a6a55, roughness: 0.8 });
    const capGeo = new THREE.BoxGeometry(30, 12, actualCapLen);
    
    const leftCap = new THREE.Mesh(capGeo, wallCapMat);
    leftCap.position.set(
      seg.x1 + dirX * (actualCapLen / 2 + decorOffset) - perpX * wallOffset,
      CONFIG.WALL_HEIGHT + 6,
      seg.z1 + dirZ * (actualCapLen / 2 + decorOffset) - perpZ * wallOffset
    );
    leftCap.rotation.y = -seg.dir;
    group.add(leftCap);
    
    const rightCap = new THREE.Mesh(capGeo, wallCapMat);
    rightCap.position.set(
      seg.x1 + dirX * (actualCapLen / 2 + decorOffset) + perpX * wallOffset,
      CONFIG.WALL_HEIGHT + 6,
      seg.z1 + dirZ * (actualCapLen / 2 + decorOffset) + perpZ * wallOffset
    );
    rightCap.rotation.y = -seg.dir;
    group.add(rightCap);
    
    const blockMat = new THREE.MeshStandardMaterial({
      color: 0x6b5b45,
      roughness: 0.9,
    });
    
    const numBlocks = Math.floor(segLen / 150);
    for (let i = 0; i < numBlocks; i++) {
      const t = (i + 0.5) / numBlocks;
      // Offset decorations forward like the walls
      const blockX = seg.x1 + dirX * decorOffset + (seg.x2 - seg.x1) * t;
      const blockZ = seg.z1 + dirZ * decorOffset + (seg.z2 - seg.z1) * t;
      
      // Left wall carved block
      const blockGeo = new THREE.BoxGeometry(25, 50, 40);
      const leftBlock = new THREE.Mesh(blockGeo, blockMat);
      leftBlock.position.set(
        blockX - perpX * (hw + 12),
        CONFIG.WALL_HEIGHT * 0.6,
        blockZ - perpZ * (hw + 12)
      );
      leftBlock.rotation.y = -seg.dir;
      group.add(leftBlock);
      
      // Right wall carved block
      const rightBlock = new THREE.Mesh(blockGeo, blockMat);
      rightBlock.position.set(
        blockX + perpX * (hw + 12),
        CONFIG.WALL_HEIGHT * 0.6,
        blockZ + perpZ * (hw + 12)
      );
      rightBlock.rotation.y = -seg.dir;
      group.add(rightBlock);
    }

    // Torches on walls
    const torchMat = new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.9,
    });
    const flameMat = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      emissive: 0xff4400,
      emissiveIntensity: 1,
    });
    
    const numTorches = Math.floor(segLen / 300);
    for (let i = 0; i < numTorches; i++) {
      const t = (i + 0.5) / numTorches;
      // Offset torches forward like the walls
      const tX = seg.x1 + dirX * decorOffset + (seg.x2 - seg.x1) * t;
      const tZ = seg.z1 + dirZ * decorOffset + (seg.z2 - seg.z1) * t;
      
      // Left torch
      const torchGeo = new THREE.CylinderGeometry(4, 6, 30, 8);
      const leftTorch = new THREE.Mesh(torchGeo, torchMat);
      leftTorch.position.set(
        tX - perpX * (hw + 5),
        CONFIG.WALL_HEIGHT * 0.7,
        tZ - perpZ * (hw + 5)
      );
      group.add(leftTorch);
      
      // Left flame
      const flameGeo = new THREE.ConeGeometry(8, 20, 8);
      const leftFlame = new THREE.Mesh(flameGeo, flameMat);
      leftFlame.position.set(
        tX - perpX * (hw + 5),
        CONFIG.WALL_HEIGHT * 0.7 + 20,
        tZ - perpZ * (hw + 5)
      );
      group.add(leftFlame);
      
      // Right torch
      const rightTorch = new THREE.Mesh(torchGeo, torchMat);
      rightTorch.position.set(
        tX + perpX * (hw + 5),
        CONFIG.WALL_HEIGHT * 0.7,
        tZ + perpZ * (hw + 5)
      );
      group.add(rightTorch);
      
      // Right flame
      const rightFlame = new THREE.Mesh(flameGeo, flameMat);
      rightFlame.position.set(
        tX + perpX * (hw + 5),
        CONFIG.WALL_HEIGHT * 0.7 + 20,
        tZ + perpZ * (hw + 5)
      );
      group.add(rightFlame);
    }
  }

  // NOTE: Wall caps are now added above with proper offsets to avoid corner clipping
  // The duplicate wall cap code was removed to fix the corner clipping bug

  // Corner floor piece at turns
  if (seg.type === "turn") {
    // Corner floor piece to fill the gap
    const cornerSize = hw * 2;
    const cornerGeo = new THREE.PlaneGeometry(cornerSize, cornerSize);
    const cornerMat = new THREE.MeshStandardMaterial({
      color: 0x8a7a60,
      roughness: 0.8,
    });
    const corner = new THREE.Mesh(cornerGeo, cornerMat);
    corner.rotation.x = -Math.PI / 2;
    corner.position.set(seg.x2, 0.1, seg.z2);
    group.add(corner);
  }

  // Add environment around this segment
  addEnvironmentToSegment(seg, group);

  return group;
}

// Add dark forest/marsh environment around path segments
function addEnvironmentToSegment(seg: PathSegment, group: THREE.Group): void {
  const hw = CONFIG.PATH_WIDTH / 2;
  const segLen = Math.sqrt((seg.x2 - seg.x1) ** 2 + (seg.z2 - seg.z1) ** 2);
  const perpX = Math.cos(-seg.dir);
  const perpZ = -Math.sin(-seg.dir);
  const midX = (seg.x1 + seg.x2) / 2;
  const midZ = (seg.z1 + seg.z2) / 2;
  
  // For turn segments, DON'T add trees on the inner side (where the opening is)
  const isTurn = seg.type === "turn";
  const turnDir = seg.turnDir; // 1 = left turn, -1 = right turn
  
  // Tree materials - BRIGHTER colors for better contrast against dark floor
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x4a3020, // Lighter brown trunk
    roughness: 0.9,
  });
  const leavesMat = new THREE.MeshStandardMaterial({
    color: 0x2a5535, // Brighter forest green - much more visible
    emissive: 0x0a1510,
    emissiveIntensity: 0.15,
    roughness: 0.75,
  });
  const deadLeavesMat = new THREE.MeshStandardMaterial({
    color: 0x4a3025, // Brighter reddish brown
    emissive: 0x150805,
    emissiveIntensity: 0.1,
    roughness: 0.85,
  });
  
  // Water/marsh material - brighter for visibility
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x153535,
    emissive: 0x0a2020,
    emissiveIntensity: 0.15,
    roughness: 0.3,
    metalness: 0.4,
    transparent: true,
    opacity: 0.75,
  });
  
  // Mist material
  const mistMat = new THREE.MeshStandardMaterial({
    color: 0x556677,
    transparent: true,
    opacity: 0.12,
  });
  
  // NO trees on turn segments - they cause visual issues at corners
  if (isTurn) {
    return; // Skip all environment decoration for turns
  }
  
  // Add trees on both sides of straight segments only
  const numTrees = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < numTrees; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    
    // Position trees away from start/end of segment to avoid corner overlap
    // Use range 0.2 to 0.8 instead of full segment
    const alongPathT = 0.2 + (i / Math.max(numTrees, 1)) * 0.6;
    const alongPath = (alongPathT - 0.5) * segLen;
    
    // Much larger minimum distance from path - especially for turns
    const minDist = isTurn ? 180 : 120;
    const awayFromPath = hw + minDist + Math.random() * 150;
    
    const treeX = midX + perpX * side * awayFromPath + Math.sin(seg.dir) * alongPath;
    const treeZ = midZ + perpZ * side * awayFromPath + Math.cos(seg.dir) * alongPath;
    
    const treeGroup = new THREE.Group();
    
    // Gnarled trunk - slightly thicker for visibility
    const trunkHeight = 90 + Math.random() * 100;
    const trunkGeo = new THREE.CylinderGeometry(6, 14, trunkHeight, 6);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = trunkHeight / 2;
    trunk.rotation.z = (Math.random() - 0.5) * 0.2;
    treeGroup.add(trunk);
    
    // Foliage/branches - bigger and brighter
    const isDead = Math.random() > 0.7;
    const foliageMat = isDead ? deadLeavesMat : leavesMat;
    
    for (let j = 0; j < 3; j++) {
      const branchGeo = new THREE.ConeGeometry(30 + Math.random() * 25, 45 + Math.random() * 35, 5);
      const branch = new THREE.Mesh(branchGeo, foliageMat);
      branch.position.y = trunkHeight - 10 + j * 18;
      branch.position.x = (Math.random() - 0.5) * 20;
      branch.position.z = (Math.random() - 0.5) * 20;
      branch.rotation.x = (Math.random() - 0.5) * 0.3;
      treeGroup.add(branch);
    }
    
    treeGroup.position.set(treeX, 0, treeZ);
    group.add(treeGroup);
  }
  
  // Add water/marsh patches - not on turn segments
  if (!isTurn && Math.random() > 0.5) {
    const waterSide = Math.random() > 0.5 ? -1 : 1;
    const waterDist = hw + 60 + Math.random() * 80;
    const waterX = midX + perpX * waterSide * waterDist;
    const waterZ = midZ + perpZ * waterSide * waterDist;
    
    const waterGeo = new THREE.PlaneGeometry(60 + Math.random() * 80, 40 + Math.random() * 60);
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(waterX, -5, waterZ);
    group.add(water);
  }
  
  // Add ground mist/fog patches - not near turns
  if (!isTurn && Math.random() > 0.6) {
    const mistGeo = new THREE.PlaneGeometry(100, 100);
    const mist = new THREE.Mesh(mistGeo, mistMat);
    mist.rotation.x = -Math.PI / 2;
    mist.position.set(
      midX + (Math.random() - 0.5) * 100,
      5 + Math.random() * 10,
      midZ + (Math.random() - 0.5) * 100
    );
    group.add(mist);
  }
}

// Check if a point is too close to any existing segment (checks multiple points on each segment)
function wouldOverlap(x: number, z: number, minDist: number, skipLastN: number = 3): boolean {
  // Skip the most recent segments (they're connected to current path)
  const checkSegments = segments.slice(0, Math.max(0, segments.length - skipLastN));
  
  for (const seg of checkSegments) {
    // Check distance to segment start, middle, and end
    const points = [
      { x: seg.x1, z: seg.z1 },
      { x: (seg.x1 + seg.x2) / 2, z: (seg.z1 + seg.z2) / 2 },
      { x: seg.x2, z: seg.z2 },
    ];
    
    for (const p of points) {
      const dist = Math.sqrt((x - p.x) ** 2 + (z - p.z) ** 2);
      if (dist < minDist) {
        return true;
      }
    }
  }
  return false;
}

// Check if a potential path direction is safe for multiple segments ahead
function isDirectionSafe(startX: number, startZ: number, direction: number, numSegments: number, minDist: number): boolean {
  const dirVec = getDirVector(direction);
  
  // Check multiple points along the potential path
  for (let i = 1; i <= numSegments; i++) {
    const checkX = startX + dirVec.x * CONFIG.SEGMENT_LENGTH * i;
    const checkZ = startZ + dirVec.z * CONFIG.SEGMENT_LENGTH * i;
    
    if (wouldOverlap(checkX, checkZ, minDist)) {
      return false;
    }
  }
  return true;
}

function addSegmentAhead(): void {
  const dir = getDirVector(pathEndDir);
  const nextX = pathEndX + dir.x * CONFIG.SEGMENT_LENGTH;
  const nextZ = pathEndZ + dir.z * CONFIG.SEGMENT_LENGTH;

  segmentsSinceLastTurn++;

  // Decide if this should be a turn
  const shouldTurn =
    segmentsSinceLastTurn >=
    CONFIG.SEGMENTS_BETWEEN_TURNS_MIN +
      Math.floor(Math.random() * (CONFIG.SEGMENTS_BETWEEN_TURNS_MAX - CONFIG.SEGMENTS_BETWEEN_TURNS_MIN));

  let turnDir: TurnDir = 0;
  if (shouldTurn) {
    // Much larger safe distance to prevent any overlap
    const minSafeDist = CONFIG.PATH_WIDTH * 4; // 1000 units minimum separation
    const lookAheadSegments = 6; // Check 6 segments ahead
    
    // Calculate where each turn direction would lead
    const leftDir = pathEndDir + (-1 * Math.PI) / 2;
    const rightDir = pathEndDir + (1 * Math.PI) / 2;
    
    // Check if each direction is safe
    const leftSafe = isDirectionSafe(nextX, nextZ, leftDir, lookAheadSegments, minSafeDist);
    const rightSafe = isDirectionSafe(nextX, nextZ, rightDir, lookAheadSegments, minSafeDist);
    
    // Pick direction based on safety and cumulative turn tracking
    if (leftSafe && !rightSafe) {
      turnDir = -1;
    } else if (rightSafe && !leftSafe) {
      turnDir = 1;
    } else if (!leftSafe && !rightSafe) {
      // Both directions would overlap - don't turn, continue straight
      turnDir = 0;
      segmentsSinceLastTurn = 0; // Reset counter to try again later
    } else {
      // Both safe - use cumulative tracking to vary the path
      // Tighter limits to prevent looping back
      if (cumulativeTurnDir >= 1) {
        turnDir = -1; // Force opposite direction sooner
      } else if (cumulativeTurnDir <= -1) {
        turnDir = 1;
      } else {
        turnDir = Math.random() < 0.5 ? -1 : 1;
      }
    }
  }

  // If turnDir is 0, this is a straight segment even if shouldTurn was true
  const isTurn = shouldTurn && turnDir !== 0;
  
  const segment: PathSegment = {
    id: nextSegmentId++,
    x1: pathEndX,
    z1: pathEndZ,
    x2: nextX,
    z2: nextZ,
    dir: pathEndDir,
    type: isTurn ? "turn" : "straight",
    turnDir: turnDir,
    completed: false,
  };

  // Create mesh for segment
  segment.mesh = createSegmentMesh(segment);
  scene.add(segment.mesh);

  segments.push(segment);
  totalSegmentsGenerated++;

  // Add coins to segment
  addCoinsToSegment(segment);
  
  // Add obstacles and enemies to segment
  addObstacleToSegment(segment);
  addEnemyToSegment(segment);

  // Update path end tracking
  pathEndX = nextX;
  pathEndZ = nextZ;

  if (isTurn) {
    pathEndDir += (turnDir * Math.PI) / 2;
    cumulativeTurnDir += turnDir;
    segmentsSinceLastTurn = 0;
  }
}

function addCoinsToSegment(seg: PathSegment): void {
  const dirVec = getDirVector(seg.dir);
  
  // Always add coins on every segment (simple and reliable)
  const numCoins = 5;
  const startT = 0.1;
  const coinSpacing = 0.8 / numCoins;
  
  
  for (let i = 0; i < numCoins; i++) {
    const t = startT + i * coinSpacing;
    const coinX = seg.x1 + dirVec.x * CONFIG.SEGMENT_LENGTH * t;
    const coinZ = seg.z1 + dirVec.z * CONFIG.SEGMENT_LENGTH * t;

    const coin: Coin = {
      x: coinX,
      y: 50,
      z: coinZ,
      collected: false,
    };

    // Create Golden Snitch mesh
    const coinGroup = new THREE.Group();
    
    // Golden ball body
    const ballGeo = new THREE.SphereGeometry(12, 16, 16);
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.95,
      roughness: 0.1,
      emissive: 0xffaa00,
      emissiveIntensity: 0.4,
    });
    const ball = new THREE.Mesh(ballGeo, goldMat);
    coinGroup.add(ball);
    
    // Wing material - silvery white
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      metalness: 0.6,
      roughness: 0.2,
      transparent: true,
      opacity: 0.8,
      emissive: 0xaaaacc,
      emissiveIntensity: 0.2,
    });
    
    // Left wing (feather-like)
    const wingGeo = new THREE.PlaneGeometry(25, 10);
    const leftWing = new THREE.Mesh(wingGeo, wingMat);
    leftWing.position.set(-18, 3, 0);
    leftWing.rotation.y = 0.4;
    leftWing.rotation.z = 0.3;
    coinGroup.add(leftWing);
    
    // Right wing
    const rightWing = new THREE.Mesh(wingGeo, wingMat);
    rightWing.position.set(18, 3, 0);
    rightWing.rotation.y = -0.4;
    rightWing.rotation.z = -0.3;
    coinGroup.add(rightWing);
    
    // Glow effect
    const glowGeo = new THREE.SphereGeometry(18, 8, 8);
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xffdd44,
      emissive: 0xffcc00,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.2,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    coinGroup.add(glow);
    
    coinGroup.position.set(coin.x, coin.y, coin.z);
    scene.add(coinGroup);
    
    coin.mesh = coinGroup as unknown as THREE.Mesh;
    coins.push(coin);
  }
}

function addObstacleToSegment(seg: PathSegment): void {
  // Don't add obstacles to turn segments - reset spacing counter
  if (seg.type === "turn") {
    obstacleAddedSinceLastTurn = false;
    return;
  }
  
  // Don't add obstacles in the first 5 segments (give player time to start)
  if (seg.id < 5) return;
  
  // Only one obstacle per segment
  if (seg.hasObstacle) return;
  
  // Only ONE obstacle between turns (spread them out)
  if (obstacleAddedSinceLastTurn) return;
  
  // Skip first 4 segments after a turn (give player time to see obstacles)
  const segIndex = segments.findIndex(s => s.id === seg.id);
  for (let i = 1; i <= 4; i++) {
    if (segIndex >= i) {
      const prevSeg = segments[segIndex - i];
      if (prevSeg && prevSeg.type === "turn") return;
    }
  }
  
  // 50% chance to add an obstacle in this section
  if (Math.random() > 0.50) return;
  
  seg.hasObstacle = true;
  obstacleAddedSinceLastTurn = true;
  
  const dirVec = getDirVector(seg.dir);
  
  // Position obstacle in middle of segment
  const t = 0.5;
  const obsX = seg.x1 + dirVec.x * CONFIG.SEGMENT_LENGTH * t;
  const obsZ = seg.z1 + dirVec.z * CONFIG.SEGMENT_LENGTH * t;
  
  // Randomly choose obstacle type
  const obstacleType: ObstacleType = Math.random() < 0.5 ? "jump" : "slide";
  
  const obstacle: Obstacle = {
    x: obsX,
    z: obsZ,
    type: obstacleType,
    hit: false,
  };
  
  const group = new THREE.Group();
  
  if (obstacleType === "jump") {
    // Barrier to jump over - low wall/log
    const barrierMat = new THREE.MeshStandardMaterial({
      color: 0x5a4030,
      roughness: 0.9,
    });
    const barrierGeo = new THREE.BoxGeometry(CONFIG.PATH_WIDTH * 0.8, 40, 30);
    const barrier = new THREE.Mesh(barrierGeo, barrierMat);
    barrier.position.y = 20;
    group.add(barrier);
    
    // Add some detail
    const detailMat = new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.8,
    });
    const detailGeo = new THREE.BoxGeometry(CONFIG.PATH_WIDTH * 0.85, 10, 35);
    const detail = new THREE.Mesh(detailGeo, detailMat);
    detail.position.y = 35;
    group.add(detail);
  } else {
    // TALL magical archway to slide under - very visible
    const archMat = new THREE.MeshStandardMaterial({
      color: 0x3a2a20,
      roughness: 0.8,
    });
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0x44ff66,
      emissive: 0x22aa44,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.9,
    });
    const vineMat = new THREE.MeshStandardMaterial({
      color: 0x2a5530,
      roughness: 0.9,
    });
    
    // TALL left pillar - very visible
    const pillarGeo = new THREE.CylinderGeometry(20, 25, 180, 8);
    const leftPillar = new THREE.Mesh(pillarGeo, archMat);
    leftPillar.position.set(-CONFIG.PATH_WIDTH * 0.38, 90, 0);
    group.add(leftPillar);
    
    // TALL right pillar
    const rightPillar = new THREE.Mesh(pillarGeo, archMat);
    rightPillar.position.set(CONFIG.PATH_WIDTH * 0.38, 90, 0);
    group.add(rightPillar);
    
    // Main horizontal beam at duck height - the part you slide under
    const beamGeo = new THREE.BoxGeometry(CONFIG.PATH_WIDTH * 0.9, 30, 40);
    const beam = new THREE.Mesh(beamGeo, archMat);
    beam.position.y = 70; // Low enough that you need to slide under
    group.add(beam);
    
    // Glowing magical barrier across the top of the beam
    const barrierGeo = new THREE.BoxGeometry(CONFIG.PATH_WIDTH * 0.95, 15, 50);
    const barrier = new THREE.Mesh(barrierGeo, glowMat);
    barrier.position.y = 90;
    group.add(barrier);
    
    // Top decorative piece - makes it VERY tall and visible
    const topGeo = new THREE.ConeGeometry(30, 60, 8);
    const leftTop = new THREE.Mesh(topGeo, vineMat);
    leftTop.position.set(-CONFIG.PATH_WIDTH * 0.38, 200, 0);
    group.add(leftTop);
    
    const rightTop = new THREE.Mesh(topGeo, vineMat);
    rightTop.position.set(CONFIG.PATH_WIDTH * 0.38, 200, 0);
    group.add(rightTop);
    
    // Connecting arch at top
    const archTopGeo = new THREE.BoxGeometry(CONFIG.PATH_WIDTH * 0.5, 25, 30);
    const archTop = new THREE.Mesh(archTopGeo, vineMat);
    archTop.position.y = 175;
    group.add(archTop);
    
    // Hanging vines for visual effect
    for (let i = -2; i <= 2; i++) {
      const vineGeo = new THREE.CylinderGeometry(3, 4, 50, 6);
      const vine = new THREE.Mesh(vineGeo, vineMat);
      vine.position.set(i * 30, 45, 10);
      group.add(vine);
    }
    
    // Glowing orbs to draw attention
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0xffaa44,
      emissive: 0xff6600,
      emissiveIntensity: 0.8,
    });
    const orbGeo = new THREE.SphereGeometry(8, 8, 8);
    const leftOrb = new THREE.Mesh(orbGeo, orbMat);
    leftOrb.position.set(-CONFIG.PATH_WIDTH * 0.38, 185, 0);
    group.add(leftOrb);
    
    const rightOrb = new THREE.Mesh(orbGeo, orbMat);
    rightOrb.position.set(CONFIG.PATH_WIDTH * 0.38, 185, 0);
    group.add(rightOrb);
  }
  
  group.position.set(obsX, 0, obsZ);
  group.rotation.y = -seg.dir;
  scene.add(group);
  
  obstacle.mesh = group;
  obstacles.push(obstacle);
}

function addEnemyToSegment(seg: PathSegment): void {
  // Don't add enemies - they spawn behind player instead
  // This function is now a no-op, enemies are spawned differently
  return;
}

function spawnEnemyBehindPlayer(distanceOverride?: number): void {
  // Spawn dementor FAR behind so it flies INTO view (not just pop in)
  // It will animate from far away to close behind
  const dirVec = getDirVector(-playerDir);
  
  // Spawn FAR behind (offscreen) - it will fly closer over time
  // Camera is ~200 behind player, so 400+ is definitely offscreen
  const spawnDist = distanceOverride ?? (400 + Math.random() * 100);
  const enemyX = playerX - dirVec.x * spawnDist;
  const enemyZ = playerZ - dirVec.z * spawnDist;
  
  const enemy: Enemy = {
    x: enemyX,
    z: enemyZ,
    dir: playerDir,
    active: true,
  };
  
  // Create DEMENTOR mesh - tall, hooded, spectral figure
  const group = new THREE.Group();
  
  // Dementor cloak material - dark, slightly translucent
  const cloakMat = new THREE.MeshStandardMaterial({
    color: 0x111115,
    roughness: 0.9,
    transparent: true,
    opacity: 0.85,
  });
  
  // Inner darkness material
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x000005,
    emissive: 0x000011,
    emissiveIntensity: 0.1,
  });
  
  // Spectral glow
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x334455,
    emissive: 0x223344,
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0.6,
  });
  
  // Body/cloak - tall flowing robe (FIXED: was using undefined bodyGeo)
  const bodyGeo = new THREE.CylinderGeometry(15, 35, 100, 8);
  const body = new THREE.Mesh(bodyGeo, cloakMat);
  body.position.y = 60;
  body.rotation.x = 0.05;
  group.add(body);
  
  // Hood - larger cone at top
  const hoodGeo = new THREE.ConeGeometry(25, 45, 8);
  const hood = new THREE.Mesh(hoodGeo, cloakMat);
  hood.position.y = 120;
  group.add(hood);
  
  // Inner hood void - the darkness where face should be
  const voidGeo = new THREE.SphereGeometry(18, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.6);
  const voidMesh = new THREE.Mesh(voidGeo, darkMat);
  voidMesh.position.set(0, 110, 8);
  voidMesh.rotation.x = -0.3;
  group.add(voidMesh);
  
  // Spectral wisp effects around dementor - pre-calculated positions
  const wispPositions = [
    { x: -25, y: 50, z: 15, scale: 2.0 },
    { x: 25, y: 70, z: -10, scale: 1.7 },
    { x: -10, y: 90, z: 20, scale: 1.5 },
    { x: 15, y: 40, z: -15, scale: 2.2 },
  ];
  for (const pos of wispPositions) {
    const wispGeo = new THREE.SphereGeometry(10, 6, 6);
    const wisp = new THREE.Mesh(wispGeo, glowMat);
    wisp.position.set(pos.x, pos.y, pos.z);
    wisp.scale.y = pos.scale;
    group.add(wisp);
  }
  
  // Skeletal hands reaching out
  const handMat = new THREE.MeshStandardMaterial({
    color: 0x445566,
    roughness: 0.8,
    emissive: 0x223344,
    emissiveIntensity: 0.2,
  });
  
  // Left arm/hand
  const armGeo = new THREE.CapsuleGeometry(5, 50, 4, 8);
  const leftArm = new THREE.Mesh(armGeo, handMat);
  leftArm.position.set(-30, 80, 15);
  leftArm.rotation.z = 0.8;
  leftArm.rotation.x = -0.5;
  group.add(leftArm);
  
  // Right arm/hand  
  const rightArm = new THREE.Mesh(armGeo, handMat);
  rightArm.position.set(30, 80, 15);
  rightArm.rotation.z = -0.8;
  rightArm.rotation.x = -0.5;
  group.add(rightArm);
  
  // Finger-like protrusions
  const fingerGeo = new THREE.ConeGeometry(2, 15, 4);
  for (let i = 0; i < 3; i++) {
    const leftFinger = new THREE.Mesh(fingerGeo, handMat);
    leftFinger.position.set(-45 + i * 5, 65, 30);
    leftFinger.rotation.x = -0.8;
    group.add(leftFinger);
    
    const rightFinger = new THREE.Mesh(fingerGeo, handMat);
    rightFinger.position.set(40 - i * 5, 65, 30);
    rightFinger.rotation.x = -0.8;
    group.add(rightFinger);
  }
  
  // Cold aura/mist at bottom
  const auraMat = new THREE.MeshStandardMaterial({
    color: 0x445566,
    emissive: 0x223344,
    emissiveIntensity: 0.4,
    transparent: true,
    opacity: 0.4,
  });
  const auraGeo = new THREE.SphereGeometry(40, 8, 8);
  const aura = new THREE.Mesh(auraGeo, auraMat);
  aura.scale.y = 0.3;
  aura.position.y = 10;
  group.add(aura);
  
  group.position.set(enemyX, 0, enemyZ);
  group.rotation.y = -enemy.dir;
  scene.add(group);
  
  enemy.mesh = group;
  enemies.push(enemy);
  
  console.log("[spawnEnemyBehindPlayer] Dementor spawned at distance:", spawnDist);
}

function checkObstacleCollision(): void {
  // Obstacles span full path width, so check distance along path direction only
  // Use player's CENTER position (not lane offset) since obstacles are full-width
  
  for (const obs of obstacles) {
    if (obs.hit) continue;
    
    // Distance from player center to obstacle center
    const dx = playerX - obs.x;
    const dz = playerZ - obs.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    
    // Check if player is close enough to obstacle (within ~50 units)
    if (dist < 50) {
      // Check if player avoided obstacle correctly
      if (obs.type === "jump") {
        // Need to be jumping (high enough) to avoid - barrier is ~40 units tall
        if (playerY < 40) {
          console.log("[checkObstacleCollision] Hit barrier! playerY:", playerY);
          obs.hit = true;
          gameOver();
          return;
        }
      } else {
        // Need to be sliding to avoid - bridge beam is at y=75
        // Sliding animation lowers player, so check action
        if (playerAction !== "sliding") {
          console.log("[checkObstacleCollision] Hit bridge! action:", playerAction);
          obs.hit = true;
          gameOver();
          return;
        }
      }
      // Successfully avoided
      obs.hit = true;
      score += 50;
      updateScoreDisplay();
      triggerHaptic("success");
    }
  }
}

let lastEnemySpawnTime = 0;
const ENEMY_SPAWN_INTERVAL = 8000; // Spawn dementor every 8 seconds for more atmosphere

function updateEnemies(dt: number): void {
  // Periodically spawn dementors behind player for atmosphere
  const now = Date.now();
  if (now - lastEnemySpawnTime > ENEMY_SPAWN_INTERVAL && enemies.filter(e => e.active).length < 3) {
    spawnEnemyBehindPlayer();
    lastEnemySpawnTime = now;
  }
  
  for (const enemy of enemies) {
    if (!enemy.active) continue;
    
    // Update enemy direction to always chase player
    enemy.dir = playerDir;
    
    const dx = playerX - enemy.x;
    const dz = playerZ - enemy.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    
    // DYNAMIC SPEED: Fast when far (flying in), slow when close (hovering)
    let enemySpeed: number;
    if (dist > 300) {
      // Far away - fly FAST to catch up (1.5x player speed)
      enemySpeed = playerSpeed * 1.5;
    } else if (dist > 150) {
      // Medium distance - match player speed
      enemySpeed = playerSpeed * 1.0;
    } else {
      // Close - slow down and hover (0.9x player speed, stays behind)
      enemySpeed = playerSpeed * 0.9;
    }
    
    // Move enemy toward player (from behind)
    const dirVec = getDirVector(-enemy.dir);
    enemy.x += dirVec.x * enemySpeed;
    enemy.z += dirVec.z * enemySpeed;
    
    if (enemy.mesh) {
      enemy.mesh.position.x = enemy.x;
      enemy.mesh.position.z = enemy.z;
      enemy.mesh.rotation.y = -enemy.dir; // Face forward
      
      // Bob animation - more dramatic floating
      enemy.mesh.position.y = Math.sin(Date.now() * 0.003) * 15 + 10;
      
      // Slight side-to-side sway
      enemy.mesh.position.x += Math.sin(Date.now() * 0.002) * 5;
    }
    
    // NO collision/death - dementors are just atmospheric!
    // If dementor gets too close, push it back (it can't actually catch you)
    if (dist < 100) {
      // Dementor backs off slightly when too close
      enemy.x -= dirVec.x * 3;
      enemy.z -= dirVec.z * 3;
    }
    
    // Deactivate if too far behind (gave up the chase)
    if (dist > CONFIG.SEGMENT_LENGTH * 8) {
      enemy.active = false;
      if (enemy.mesh) scene.remove(enemy.mesh);
    }
  }
}

function generateInitialPath(): void {
  console.log("[generateInitialPath] Generating initial path");

  // Clear existing
  for (const seg of segments) {
    if (seg.mesh) scene.remove(seg.mesh);
  }
  for (const coin of coins) {
    if (coin.mesh) scene.remove(coin.mesh);
  }
  for (const obs of obstacles) {
    if (obs.mesh) scene.remove(obs.mesh);
  }
  for (const enemy of enemies) {
    if (enemy.mesh) scene.remove(enemy.mesh);
  }

  segments = [];
  coins = [];
  obstacles = [];
  enemies = [];
  nextSegmentId = 0;
  pathEndX = 0;
  pathEndZ = 0;
  pathEndDir = 0;
  segmentsSinceLastTurn = 0;
  cumulativeTurnDir = 0;
  obstacleAddedSinceLastTurn = false;
  totalSegmentsGenerated = 0;

  // Generate 20 segments ahead
  for (let i = 0; i < 20; i++) {
    addSegmentAhead();
  }
}

// ============= GAME LOGIC =============
function resetGame(): void {
  console.log("[resetGame] Resetting game");

  playerX = 0;
  playerZ = 0;
  playerDir = 0;
  targetPlayerDir = 0;
  playerSpeed = CONFIG.PLAYER_SPEED_START;
  playerAction = "running";
  playerY = 0;
  playerYVelocity = 0;
  slideTimer = 0;
  lastEnemySpawnTime = Date.now() + 10000; // Delay first enemy by 10 seconds
  
  // Reset lane system
  currentLane = 0;
  targetLaneOffset = 0;
  actualLaneOffset = 0;
  
  // Reset demon tracking
  wallHitCount = 0;
  demonDistance = 400;

  score = 0;
  distanceScore = 0;
  runAnimTime = 0;

  generateInitialPath();
  updateScoreDisplay();
}

function updateScoreDisplay(): void {
  currentScoreEl.textContent = score.toString();
}

function tryTurn(dir: TurnDir): void {
  if (gameState !== "PLAYING" || dir === 0) return;

  // Find the nearest incomplete turn segment
  let foundTurnNearby = false;
  
  for (const seg of segments) {
    if (seg.type !== "turn" || seg.completed) continue;

    const midX = (seg.x1 + seg.x2) / 2;
    const midZ = (seg.z1 + seg.z2) / 2;
    const distToTurn = Math.sqrt((playerX - midX) ** 2 + (playerZ - midZ) ** 2);

    if (distToTurn < CONFIG.TURN_ACCEPT_DISTANCE) {
      foundTurnNearby = true;
      
      if (dir === seg.turnDir) {
        // Correct turn!
        console.log("[tryTurn] Correct turn!", dir);
        executeTurn(dir, seg);
        seg.completed = true;

        playSound("turn");
        triggerHaptic("medium");
        hideTurnIndicator();
        return;
      } else {
        // Wrong direction - game over
        console.log("[tryTurn] Wrong turn direction!");
        gameOver();
        return;
      }
    }
  }
  
  // If no turn nearby and player tried to turn, game over (crashed into wall)
  if (!foundTurnNearby) {
    console.log("[tryTurn] Turned when no turn available - hit wall!");
    gameOver();
  }
}

function executeTurn(dir: TurnDir, turnSeg: PathSegment): void {
  // Calculate the new direction based on CURRENT player direction
  // dir: -1 = turn left, 1 = turn right (from player's perspective)
  const newDir = playerDir - (dir * Math.PI) / 2;
  const newDirVec = getDirVector(newDir);
  
  // SNAP both position AND direction to the new corridor
  playerDir = newDir;
  targetPlayerDir = newDir;
  
  // ============ OFFSET VALUES - CHANGE THESE TO FIX CENTERING ============
  const forwardOffset = 125;   // How far forward into the new corridor
  const sideOffset = 0;        // Side adjustment: negative = left, positive = right
  // =======================================================================
  
  // Calculate perpendicular for side offset
  const perpX = -Math.cos(newDir);
  const perpZ = -Math.sin(newDir);
  
  // Snap player position
  playerX = turnSeg.x2 + newDirVec.x * forwardOffset + perpX * sideOffset;
  playerZ = turnSeg.z2 + newDirVec.z * forwardOffset + perpZ * sideOffset;
  
  // Reset to center lane after turning - FORCE immediate reset
  currentLane = 0;
  targetLaneOffset = 0;
  actualLaneOffset = 0;
}

function tryJump(): void {
  if (playerAction === "running" && playerY === 0) {
    playerAction = "jumping";
    playerYVelocity = JUMP_FORCE;
    playSound("jump");
    triggerHaptic("light");
  }
}

function trySlide(): void {
  // Can slide from running or even start sliding while in air (will slide on landing)
  if (playerAction !== "sliding") {
    playerAction = "sliding";
    slideTimer = SLIDE_DURATION;
    // If jumping, fast-fall to start sliding
    if (playerY > 0) {
      playerYVelocity = -GRAVITY * 3;
    }
    playSound("slide");
    triggerHaptic("light");
    console.log("[trySlide] Started sliding, timer:", slideTimer);
  }
}

function switchLane(direction: -1 | 1): void {
  // direction: -1 = left input, 1 = right input
  // With new perpendicular (sin, cos): positive offset = one direction
  // Just directly use the direction to change lane
  const newLane = Math.max(-1, Math.min(1, currentLane + direction)) as Lane;
  
  if (newLane !== currentLane) {
    currentLane = newLane;
    targetLaneOffset = currentLane * LANE_WIDTH;
    triggerHaptic("light");
    console.log("[switchLane] Switched to lane:", currentLane, "offset:", targetLaneOffset);
  } else {
    // Tried to go further but already at edge - hit wall!
    hitSideWall(direction);
  }
}

function hitSideWall(direction: -1 | 1): void {
  console.log("[hitSideWall] Player hit side wall!");
  wallHitCount++;
  demonDistance -= DEMON_CATCHUP_ON_HIT;
  triggerHaptic("heavy");
  playSound("gameover"); // Use gameover sound for wall hit impact
  
  // Visual feedback - briefly push player toward the wall they hit
  const wallBounce = direction * LANE_WIDTH * 0.3;
  actualLaneOffset += wallBounce;
  
  // Screen shake effect
  if (camera) {
    const shakeAmount = 10;
    camera.position.x += (Math.random() - 0.5) * shakeAmount;
    camera.position.y += (Math.random() - 0.5) * shakeAmount;
  }
  
  // Spawn a dementor on EVERY wall hit - it will fly in from behind!
  console.log("[hitSideWall] Wall hit #" + wallHitCount + " - spawning dementor!");
  spawnEnemyBehindPlayer(350); // Spawn far so it flies in dramatically
  
  if (wallHitCount >= 3 || demonDistance <= 0) {
    console.log("[hitSideWall] Too many wall hits - game over!");
    gameOver();
  }
}

function update(dt: number): void {
  if (gameState !== "PLAYING") return;

  // Move player forward
  const moveDir = getDirVector(-playerDir);
  playerX += moveDir.x * playerSpeed;
  playerZ += moveDir.z * playerSpeed;

  // Handle Y-axis physics (jumping/falling) - runs whenever player is in the air
  if (playerY > 0 || playerYVelocity !== 0) {
    playerYVelocity -= GRAVITY;
    playerY += playerYVelocity;
    if (playerY <= 0) {
      playerY = 0;
      playerYVelocity = 0;
      // Only reset to running if we were jumping (not sliding)
      if (playerAction === "jumping") {
        playerAction = "running";
      }
    }
  }

  // Handle sliding timer
  if (playerAction === "sliding") {
    slideTimer -= dt; // dt is already in milliseconds, don't multiply by 1000!
    if (slideTimer <= 0) {
      playerAction = "running";
      slideTimer = 0;
      console.log("[update] Slide ended");
    }
  }

  // Smooth lane offset transition
  actualLaneOffset = lerp(actualLaneOffset, targetLaneOffset, LANE_SWITCH_SPEED);

  // Update distance score
  distanceScore = Math.floor(Math.sqrt(playerX ** 2 + playerZ ** 2) / 10);

  // Speed up gradually
  playerSpeed = Math.min(playerSpeed + CONFIG.PLAYER_SPEED_INCREMENT, CONFIG.PLAYER_SPEED_MAX);

  // Smooth direction rotation
  const dirDiff = targetPlayerDir - playerDir;
  if (Math.abs(dirDiff) > 0.01) {
    playerDir = lerpAngle(playerDir, targetPlayerDir, 0.15);
  } else {
    playerDir = targetPlayerDir;
  }

  // Check for missed turns
  checkMissedTurns();

  // Check coin collection
  checkCoinCollision();

  // Check obstacle collision
  checkObstacleCollision();

  // Update enemies
  updateEnemies(dt);

  // Show turn indicator if approaching a turn
  checkTurnIndicator();

  // Clean up old segments and generate new ones
  cleanupAndGenerate();

  // Update player mesh
  updatePlayerMesh(dt);

  // Update camera
  updateCamera();

  // Animate coins
  animateCoins();
}

function checkMissedTurns(): void {
  for (const seg of segments) {
    if (seg.type !== "turn" || seg.completed) continue;

    // Only check turns that the player is actually approaching
    // Skip if player is too far from the segment
    const midX = (seg.x1 + seg.x2) / 2;
    const midZ = (seg.z1 + seg.z2) / 2;
    const distToMid = Math.sqrt((playerX - midX) ** 2 + (playerZ - midZ) ** 2);
    
    // Only check miss if player is within reasonable distance of this turn
    if (distToMid > CONFIG.SEGMENT_LENGTH * 2) continue;

    const toPlayerX = playerX - seg.x2;
    const toPlayerZ = playerZ - seg.z2;
    const segDir = getDirVector(seg.dir);
    const dot = toPlayerX * segDir.x + toPlayerZ * segDir.z;

    // Strict miss detection - you hit the wall if you go past the turn point
    if (dot > CONFIG.TURN_MISS_DISTANCE) {
      console.log("[checkMissedTurns] Hit the wall! Missed turn at distance:", dot);
      gameOver();
      return;
    }
  }
}

function checkTurnIndicator(): void {
  for (const seg of segments) {
    if (seg.type !== "turn" || seg.completed) continue;

    const midX = (seg.x1 + seg.x2) / 2;
    const midZ = (seg.z1 + seg.z2) / 2;
    const distToTurn = Math.sqrt((playerX - midX) ** 2 + (playerZ - midZ) ** 2);

    if (distToTurn < CONFIG.TURN_ACCEPT_DISTANCE * 1.5) {
      showTurnIndicator(seg.turnDir);
      return;
    }
  }
  hideTurnIndicator();
}

function showTurnIndicator(dir: TurnDir): void {
  turnIndicator.classList.remove("hidden");
  // dir=-1 means the corridor is on the right visually (due to coordinate system)
  // dir=1 means the corridor is on the left visually
  turnIndicator.textContent = dir === -1 ? "➡️ SWIPE RIGHT" : "⬅️ SWIPE LEFT";
  turnIndicator.className = "turn-indicator " + (dir === -1 ? "right" : "left");
}

function hideTurnIndicator(): void {
  turnIndicator.classList.add("hidden");
}

function checkCoinCollision(): void {
  const collectRadius = 50;
  
  // Calculate actual player position with lane offset (same formula as updatePlayerMesh)
  const perpX = -Math.cos(playerDir);
  const perpZ = -Math.sin(playerDir);
  const actualX = playerX + perpX * actualLaneOffset;
  const actualZ = playerZ + perpZ * actualLaneOffset;

  for (const coin of coins) {
    if (coin.collected) continue;

    const dx = actualX - coin.x;
    const dz = actualZ - coin.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < collectRadius) {
      coin.collected = true;
      score += 10;
      updateScoreDisplay();

      // Remove mesh
      if (coin.mesh) {
        scene.remove(coin.mesh);
      }

      playSound("coin");
      triggerHaptic("light");
    }
  }
}

function cleanupAndGenerate(): void {
  // Check distance from player to path end - if too far, we need more segments
  const distToPathEnd = Math.sqrt(
    (pathEndX - playerX) ** 2 + (pathEndZ - playerZ) ** 2
  );
  
  // Only remove segments that are VERY far behind (use segment's own direction)
  segments = segments.filter((seg) => {
    // Check if segment end is behind the segment's start relative to segment direction
    const segDir = getDirVector(seg.dir);
    const toPlayerX = playerX - seg.x1;
    const toPlayerZ = playerZ - seg.z1;
    
    // Dot product: positive if player is ahead of segment start, negative if behind
    const dotFromStart = toPlayerX * segDir.x + toPlayerZ * segDir.z;
    
    // Only remove if player has passed this segment by a large margin AND it's completed
    if (dotFromStart > CONFIG.SEGMENT_LENGTH * 6 && seg.completed) {
      if (seg.mesh) scene.remove(seg.mesh);
      return false;
    }
    return true;
  });

  // Remove collected coins only - keep all uncollected coins
  coins = coins.filter((coin) => {
    if (coin.collected) {
      if (coin.mesh) scene.remove(coin.mesh);
      return false;
    }
    return true;
  });
  
  // Remove hit obstacles only - keep all others
  obstacles = obstacles.filter((obs) => {
    if (obs.hit) {
      if (obs.mesh) scene.remove(obs.mesh);
      return false;
    }
    return true;
  });
  
  // Remove inactive enemies
  enemies = enemies.filter((enemy) => {
    if (!enemy.active) {
      if (enemy.mesh) scene.remove(enemy.mesh);
      return false;
    }
    return true;
  });

  // Generate more segments - ensure path extends far enough ahead
  const minPathAhead = CONFIG.SEGMENT_LENGTH * 15;
  let currentDistToEnd = distToPathEnd;
  let iterations = 0;
  
  while ((currentDistToEnd < minPathAhead || segments.length < 25) && iterations < 30) {
    addSegmentAhead();
    iterations++;
    // Recalculate distance after adding
    currentDistToEnd = Math.sqrt(
      (pathEndX - playerX) ** 2 + (pathEndZ - playerZ) ** 2
    );
  }
}

function updatePlayerMesh(dt: number): void {
  runAnimTime += dt * playerSpeed * 0.01;

  // Calculate lane offset perpendicular to player direction
  // Consistent signs to avoid 180° inversion bug
  const perpX = -Math.cos(playerDir);
  const perpZ = -Math.sin(playerDir);
  
  // Update position with lane offset
  // Left input → negative actualLaneOffset → should move left visually
  const visualX = playerX + perpX * actualLaneOffset;
  const visualZ = playerZ + perpZ * actualLaneOffset;
  playerMesh.position.set(visualX, playerY, visualZ);
  // FIX: Use -playerDir so mesh faces the movement direction (movement uses -playerDir)
  playerMesh.rotation.y = -playerDir;

  // Get limb groups
  const leftLeg = playerMesh.getObjectByName("leftLeg") as THREE.Group;
  const rightLeg = playerMesh.getObjectByName("rightLeg") as THREE.Group;
  const leftArm = playerMesh.getObjectByName("leftArm") as THREE.Group;
  const rightArm = playerMesh.getObjectByName("rightArm") as THREE.Group;
  const torso = playerMesh.getObjectByName("torso") as THREE.Group;

  if (playerAction === "jumping") {
    // Jumping pose - legs tucked, arms up
    if (leftLeg) leftLeg.rotation.x = -0.8;
    if (rightLeg) rightLeg.rotation.x = -0.8;
    if (leftArm) leftArm.rotation.x = -1.2;
    if (rightArm) rightArm.rotation.x = -1.2;
  } else if (playerAction === "sliding") {
    // Sliding pose - crouch down
    playerMesh.position.y = playerY - 30; // Lower the whole mesh
    if (torso) torso.rotation.x = 0.8; // Lean forward
    if (leftLeg) leftLeg.rotation.x = 1.2;
    if (rightLeg) rightLeg.rotation.x = 1.2;
    if (leftArm) leftArm.rotation.x = 0.5;
    if (rightArm) rightArm.rotation.x = 0.5;
  } else {
    // Running animation
    if (torso) torso.rotation.x = 0;
    const legSwing = Math.sin(runAnimTime * 10) * 0.6;
    if (leftLeg) leftLeg.rotation.x = legSwing;
    if (rightLeg) rightLeg.rotation.x = -legSwing;

    const armSwing = Math.sin(runAnimTime * 10) * 0.5;
    if (leftArm) leftArm.rotation.x = -armSwing;
    if (rightArm) rightArm.rotation.x = armSwing;
  }
}

function updateCamera(): void {
  // Camera follows behind player
  const behindDist = CONFIG.CAM_BACK;
  const lookAhead = 200;

  const moveDir = getDirVector(-playerDir);

  const camTargetX = playerX - moveDir.x * behindDist;
  const camTargetZ = playerZ - moveDir.z * behindDist;

  camera.position.x = lerp(camera.position.x, camTargetX, 0.1);
  camera.position.z = lerp(camera.position.z, camTargetZ, 0.1);
  camera.position.y = CONFIG.CAM_HEIGHT;

  // Look ahead of player
  const lookX = playerX + moveDir.x * lookAhead;
  const lookZ = playerZ + moveDir.z * lookAhead;
  camera.lookAt(lookX, CONFIG.CAM_HEIGHT * 0.3, lookZ);
}

function animateCoins(): void {
  const time = Date.now() / 1000;
  for (const coin of coins) {
    if (coin.mesh && !coin.collected) {
      // Spin the coin
      coin.mesh.rotation.y = time * 3;
      // Bob up and down
      coin.mesh.position.y = coin.y + Math.sin(time * 3 + coin.x * 0.1) * 8;
    }
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

function playSound(type: "coin" | "turn" | "gameover" | "jump" | "slide"): void {
  if (!settings.fx) return;

  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "coin") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } else if (type === "turn") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } else if (type === "gameover") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } else if (type === "jump") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } else if (type === "slide") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    }
  } catch (e) {
    console.log("[playSound] Audio error:", e);
  }
}

// ============= HAPTICS =============
function triggerHaptic(type: "light" | "medium" | "heavy" | "success" | "error"): void {
  if (!settings.haptics) return;
  if (typeof (window as any).triggerHaptic === "function") {
    (window as any).triggerHaptic(type);
  }
}

// ============= SETTINGS =============
function loadSettings(): Settings {
  const saved = localStorage.getItem("templeRun_settings");
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // ignore
    }
  }
  return { music: true, fx: true, haptics: true };
}

function saveSettings(): void {
  localStorage.setItem("templeRun_settings", JSON.stringify(settings));
}

// ============= GAME STATE =============
function gameOver(): void {
  if (gameState !== "PLAYING") return;

  gameState = "GAME_OVER";
  console.log("[gameOver] Final score:", score);

  // Add distance score
  score += distanceScore;

  // Submit score
  if (typeof (window as any).submitScore === "function") {
    (window as any).submitScore(score);
  }

  triggerHaptic("error");
  playSound("gameover");

  // Update UI
  finalScoreEl.textContent = score.toString();
  scoreDisplay.classList.add("hidden");
  pauseBtn.classList.add("hidden");
  settingsBtn.classList.add("hidden");
  turnIndicator.classList.add("hidden");
  gameOverScreen.classList.remove("hidden");
}

function startGame(): void {
  console.log("[startGame] Starting game");
  gameState = "PLAYING";

  resetGame();
  
  // Spawn a dementor behind player at start - it will fly in from far away!
  spawnEnemyBehindPlayer(500);

  // Hide overlays
  startScreen.classList.add("hidden");
  gameOverScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");

  // Show game UI
  scoreDisplay.classList.remove("hidden");
  pauseBtn.classList.remove("hidden");
  settingsBtn.classList.remove("hidden");

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

  startScreen.classList.remove("hidden");
  gameOverScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  scoreDisplay.classList.add("hidden");
  pauseBtn.classList.add("hidden");
  settingsBtn.classList.add("hidden");
  turnIndicator.classList.add("hidden");
}

// ============= INPUT HANDLERS =============
function handleLeftRight(dir: -1 | 1): void {
  // Check if there's a turn nearby - if so, try to turn; otherwise, switch lanes
  const turnNearby = isTurnNearby();
  
  if (turnNearby) {
    // Try to turn (dir: 1 = left turn, -1 = right turn)
    tryTurn(dir === -1 ? 1 : -1);
  } else {
    // Switch lanes
    switchLane(dir);
  }
}

function isTurnNearby(): boolean {
  for (const seg of segments) {
    if (seg.type !== "turn" || seg.completed) continue;
    
    const midX = (seg.x1 + seg.x2) / 2;
    const midZ = (seg.z1 + seg.z2) / 2;
    const distToTurn = Math.sqrt((playerX - midX) ** 2 + (playerZ - midZ) ** 2);
    
    if (distToTurn < CONFIG.TURN_ACCEPT_DISTANCE) {
      return true;
    }
  }
  return false;
}

function setupInputHandlers(): void {
  // Keyboard
  window.addEventListener("keydown", (e) => {
    if (gameState === "PLAYING") {
      // Left/Right - either turn or lane switch
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        handleLeftRight(-1);
      }
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        handleLeftRight(1);
      }
      // Jump
      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W" || e.key === " ") {
        tryJump();
      }
      // Slide
      if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
        trySlide();
      }
      if (e.key === "Escape") {
        pauseGame();
      }
    } else if (gameState === "PAUSED" && e.key === "Escape") {
      resumeGame();
    } else if (gameState === "START" && (e.key === " " || e.key === "Enter")) {
      startGame();
    }
  });

  // Touch
  const canvas = document.getElementById("gameCanvas")!;

  canvas.addEventListener(
    "touchstart",
    (e) => {
      if (gameState !== "PLAYING") return;
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
    },
    { passive: true }
  );

  canvas.addEventListener(
    "touchend",
    (e) => {
      if (gameState !== "PLAYING") return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;

      // Check if vertical swipe is stronger than horizontal
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > SWIPE_THRESHOLD) {
        if (dy < 0) {
          tryJump(); // Swipe up = jump
        } else {
          trySlide(); // Swipe down = slide
        }
      } else if (Math.abs(dx) > SWIPE_THRESHOLD) {
        // Horizontal swipe - turn or lane switch
        handleLeftRight(dx > 0 ? 1 : -1);
      }
    },
    { passive: true }
  );

  // Mouse click (for desktop) - lane switch or turn
  canvas.addEventListener("click", (e) => {
    if (gameState !== "PLAYING") return;
    if (e.clientX < w / 2) {
      handleLeftRight(-1); // Click left side
    } else {
      handleLeftRight(1); // Click right side
    }
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
  
  // Settings button on start screen
  document.getElementById("startSettingsBtn")?.addEventListener("click", () => {
    triggerHaptic("light");
    settingsModal.classList.remove("hidden");
  });

  document.getElementById("settingsClose")!.addEventListener("click", () => {
    triggerHaptic("light");
    settingsModal.classList.add("hidden");
  });

  pauseBtn.addEventListener("click", () => {
    triggerHaptic("light");
    pauseGame();
  });

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

  musicToggle.classList.toggle("active", settings.music);
  fxToggle.classList.toggle("active", settings.fx);
  hapticToggle.classList.toggle("active", settings.haptics);

  musicToggle.addEventListener("click", () => {
    settings.music = !settings.music;
    musicToggle.classList.toggle("active", settings.music);
    saveSettings();
    triggerHaptic("light");
  });

  fxToggle.addEventListener("click", () => {
    settings.fx = !settings.fx;
    fxToggle.classList.toggle("active", settings.fx);
    saveSettings();
    triggerHaptic("light");
  });

  hapticToggle.addEventListener("click", () => {
    settings.haptics = !settings.haptics;
    hapticToggle.classList.toggle("active", settings.haptics);
    saveSettings();
    if (settings.haptics) {
      triggerHaptic("light");
    }
  });
}

// ============= RESIZE =============
function resizeCanvas(): void {
  w = window.innerWidth;
  h = window.innerHeight;

  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);

  console.log("[resizeCanvas] Canvas resized to:", w, "x", h);
}

// ============= GAME LOOP =============
function gameLoop(timestamp: number): void {
  const dt = Math.min(timestamp - lastTime, 50);
  lastTime = timestamp;

  update(dt);
  renderer.render(scene, camera);

  animationFrameId = requestAnimationFrame(gameLoop);
}

// ============= INIT =============
function init(): void {
  console.log("[init] Initializing Temple Run");

  initThreeJS();
  window.addEventListener("resize", resizeCanvas);

  setupInputHandlers();

  // Generate initial path for visual on start screen
  generateInitialPath();

  // Start game loop
  requestAnimationFrame(gameLoop);

  // Show start screen
  showStartScreen();

  console.log("[init] Game initialized");
}

init();
