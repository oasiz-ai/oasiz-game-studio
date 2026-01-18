/**
 * Level definitions for Slingshot Golf
 * Each level is fully configurable via JSON structure
 */

export interface Point {
  x: number;
  y: number;
}

export interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  friction?: number;
  restitution?: number;
}

export interface WaterHazard {
  type: "water";
  x: number;
  y: number;
  width: number;
  depth?: number;
}

export interface SandHazard {
  type: "sand";
  x: number;
  y: number;
  width: number;
  depth?: number;
}

export interface WindZone {
  type: "wind";
  x: number;
  y: number;
  width: number;
  height: number;
  force: Point;
}

export interface Bouncer {
  type: "bouncer";
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  restitution?: number;
}

export type Hazard = WaterHazard | SandHazard | WindZone | Bouncer;

export interface StaticObstacle {
  type: "static";
  shape: "rectangle" | "circle";
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  angle?: number;
}

export interface MovingObstacle {
  type: "moving";
  shape: "rectangle" | "circle";
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  path: Point[];
  speed: number;
}

export type Obstacle = StaticObstacle | MovingObstacle;

export interface Terrain {
  curves: Point[];
  platforms?: Platform[];
}

export interface CameraBounds {
  minX: number;
  maxX: number;
  minY?: number;
  maxY?: number;
}

export interface Level {
  id: number;
  name: string;
  par: number;
  balls: number;
  ball: Point;
  hole: Point;
  terrain: Terrain;
  hazards?: Hazard[];
  obstacles?: Obstacle[];
  wind?: Point;
  camera: {
    follow: boolean;
    bounds: CameraBounds;
  };
  background?: {
    skyColor?: string;
    hillColor?: string;
    groundColor?: string;
  };
}

// World dimensions (will be scaled to viewport)
const WORLD_WIDTH = 1200;
const WORLD_HEIGHT = 600;

export const LEVELS: Level[] = [
  // Level 1: Tutorial - Simple flat course
  {
    id: 1,
    name: "First Swing",
    par: 2,
    balls: 5,
    ball: { x: 100, y: 380 },
    hole: { x: 500, y: 380 },
    terrain: {
      curves: [
        { x: 0, y: 400 },
        { x: 200, y: 400 },
        { x: 400, y: 400 },
        { x: 600, y: 400 },
      ],
    },
    hazards: [],
    obstacles: [],
    wind: { x: 0, y: 0 },
    camera: { follow: true, bounds: { minX: 0, maxX: 600 } },
    background: { skyColor: "#87CEEB", hillColor: "#228B22", groundColor: "#8B4513" },
  },

  // Level 2: Gentle hill
  {
    id: 2,
    name: "Rolling Hill",
    par: 3,
    balls: 5,
    ball: { x: 80, y: 320 },
    hole: { x: 700, y: 380 },
    terrain: {
      curves: [
        { x: 0, y: 350 },
        { x: 150, y: 340 },
        { x: 300, y: 280 },
        { x: 450, y: 320 },
        { x: 600, y: 400 },
        { x: 800, y: 400 },
      ],
    },
    hazards: [],
    obstacles: [],
    wind: { x: 0, y: 0 },
    camera: { follow: true, bounds: { minX: 0, maxX: 800 } },
  },

  // Level 3: Introducing water hazard
  {
    id: 3,
    name: "Water Crossing",
    par: 3,
    balls: 5,
    ball: { x: 80, y: 350 },
    hole: { x: 750, y: 360 },
    terrain: {
      curves: [
        { x: 0, y: 380 },
        { x: 200, y: 370 },
        { x: 300, y: 420 },
        { x: 400, y: 450 },
        { x: 500, y: 420 },
        { x: 600, y: 380 },
        { x: 800, y: 380 },
      ],
    },
    hazards: [
      { type: "water", x: 350, y: 430, width: 100, depth: 40 },
    ],
    obstacles: [],
    wind: { x: 0, y: 0 },
    camera: { follow: true, bounds: { minX: 0, maxX: 850 } },
  },

  // Level 4: Platform jump
  {
    id: 4,
    name: "Sky Bridge",
    par: 3,
    balls: 5,
    ball: { x: 80, y: 350 },
    hole: { x: 700, y: 220 },
    terrain: {
      curves: [
        { x: 0, y: 380 },
        { x: 200, y: 380 },
        { x: 300, y: 400 },
        { x: 500, y: 450 },
        { x: 700, y: 500 },
        { x: 900, y: 500 },
      ],
      platforms: [
        { x: 400, y: 300, width: 120, height: 20, angle: 0 },
        { x: 600, y: 240, width: 150, height: 20, angle: 0 },
      ],
    },
    hazards: [],
    obstacles: [],
    wind: { x: 0, y: 0 },
    camera: { follow: true, bounds: { minX: 0, maxX: 900 } },
  },

  // Level 5: Sand bunker and wind
  {
    id: 5,
    name: "Desert Wind",
    par: 4,
    balls: 5,
    ball: { x: 80, y: 340 },
    hole: { x: 850, y: 360 },
    terrain: {
      curves: [
        { x: 0, y: 370 },
        { x: 200, y: 360 },
        { x: 400, y: 320 },
        { x: 550, y: 380 },
        { x: 700, y: 400 },
        { x: 900, y: 380 },
        { x: 1000, y: 380 },
      ],
    },
    hazards: [
      { type: "sand", x: 520, y: 365, width: 80, depth: 20 },
      { type: "wind", x: 300, y: 150, width: 200, height: 200, force: { x: 0.0003, y: 0 } },
    ],
    obstacles: [],
    wind: { x: 0.0001, y: 0 },
    camera: { follow: true, bounds: { minX: 0, maxX: 1000 } },
    background: { skyColor: "#F4A460", hillColor: "#DEB887", groundColor: "#8B4513" },
  },

  // Level 6: Bounce walls
  {
    id: 6,
    name: "Pinball Valley",
    par: 4,
    balls: 5,
    ball: { x: 80, y: 300 },
    hole: { x: 800, y: 380 },
    terrain: {
      curves: [
        { x: 0, y: 340 },
        { x: 150, y: 350 },
        { x: 350, y: 450 },
        { x: 500, y: 480 },
        { x: 650, y: 450 },
        { x: 850, y: 400 },
        { x: 950, y: 400 },
      ],
    },
    hazards: [
      { type: "bouncer", x: 300, y: 320, width: 15, height: 80, angle: -20, restitution: 1.3 },
      { type: "bouncer", x: 550, y: 350, width: 15, height: 80, angle: 20, restitution: 1.3 },
      { type: "water", x: 420, y: 465, width: 80, depth: 30 },
    ],
    obstacles: [],
    wind: { x: 0, y: 0 },
    camera: { follow: true, bounds: { minX: 0, maxX: 950 } },
  },

  // Level 7: Static obstacles
  {
    id: 7,
    name: "Rock Garden",
    par: 4,
    balls: 5,
    ball: { x: 80, y: 350 },
    hole: { x: 900, y: 360 },
    terrain: {
      curves: [
        { x: 0, y: 380 },
        { x: 250, y: 370 },
        { x: 500, y: 350 },
        { x: 750, y: 380 },
        { x: 1000, y: 380 },
      ],
    },
    hazards: [
      { type: "sand", x: 600, y: 360, width: 100, depth: 25 },
    ],
    obstacles: [
      { type: "static", shape: "circle", x: 300, y: 340, radius: 25 },
      { type: "static", shape: "circle", x: 450, y: 320, radius: 30 },
      { type: "static", shape: "rectangle", x: 700, y: 350, width: 40, height: 40, angle: 45 },
    ],
    wind: { x: 0, y: 0 },
    camera: { follow: true, bounds: { minX: 0, maxX: 1000 } },
  },

  // Level 8: Complex terrain with multiple hazards
  {
    id: 8,
    name: "The Gauntlet",
    par: 5,
    balls: 5,
    ball: { x: 80, y: 280 },
    hole: { x: 1050, y: 350 },
    terrain: {
      curves: [
        { x: 0, y: 320 },
        { x: 150, y: 300 },
        { x: 300, y: 380 },
        { x: 450, y: 450 },
        { x: 600, y: 400 },
        { x: 750, y: 320 },
        { x: 900, y: 380 },
        { x: 1100, y: 370 },
        { x: 1200, y: 370 },
      ],
      platforms: [
        { x: 500, y: 280, width: 100, height: 15, angle: -10 },
      ],
    },
    hazards: [
      { type: "water", x: 400, y: 435, width: 100, depth: 30 },
      { type: "sand", x: 700, y: 300, width: 80, depth: 25 },
      { type: "wind", x: 800, y: 150, width: 150, height: 200, force: { x: -0.0003, y: 0 } },
      { type: "bouncer", x: 250, y: 340, width: 12, height: 60, angle: 15, restitution: 1.2 },
    ],
    obstacles: [
      { type: "static", shape: "circle", x: 600, y: 360, radius: 20 },
    ],
    wind: { x: 0, y: 0 },
    camera: { follow: true, bounds: { minX: 0, maxX: 1200 } },
  },

  // Level 9: Moving obstacles
  {
    id: 9,
    name: "Pendulum Peril",
    par: 5,
    balls: 5,
    ball: { x: 80, y: 320 },
    hole: { x: 950, y: 360 },
    terrain: {
      curves: [
        { x: 0, y: 360 },
        { x: 200, y: 350 },
        { x: 400, y: 380 },
        { x: 600, y: 400 },
        { x: 800, y: 380 },
        { x: 1000, y: 380 },
        { x: 1100, y: 380 },
      ],
    },
    hazards: [
      { type: "water", x: 500, y: 390, width: 80, depth: 25 },
    ],
    obstacles: [
      { type: "moving", shape: "circle", x: 300, y: 280, radius: 25, path: [{ x: 300, y: 280 }, { x: 300, y: 350 }], speed: 1.5 },
      { type: "moving", shape: "rectangle", x: 650, y: 300, width: 80, height: 20, path: [{ x: 650, y: 300 }, { x: 650, y: 370 }], speed: 1.2 },
      { type: "moving", shape: "circle", x: 850, y: 250, radius: 20, path: [{ x: 800, y: 250 }, { x: 900, y: 250 }], speed: 2.0 },
    ],
    wind: { x: 0.00015, y: 0 },
    camera: { follow: true, bounds: { minX: 0, maxX: 1100 } },
  },

  // Level 10: Ultimate challenge
  {
    id: 10,
    name: "The Final Hole",
    par: 6,
    balls: 5,
    ball: { x: 80, y: 250 },
    hole: { x: 1100, y: 300 },
    terrain: {
      curves: [
        { x: 0, y: 300 },
        { x: 150, y: 280 },
        { x: 300, y: 350 },
        { x: 450, y: 450 },
        { x: 600, y: 480 },
        { x: 750, y: 420 },
        { x: 900, y: 350 },
        { x: 1050, y: 320 },
        { x: 1200, y: 320 },
      ],
      platforms: [
        { x: 350, y: 220, width: 100, height: 15, angle: 0 },
        { x: 700, y: 280, width: 120, height: 15, angle: 5 },
        { x: 950, y: 240, width: 100, height: 15, angle: -5 },
      ],
    },
    hazards: [
      { type: "water", x: 500, y: 465, width: 120, depth: 35 },
      { type: "sand", x: 850, y: 335, width: 80, depth: 20 },
      { type: "wind", x: 200, y: 100, width: 150, height: 150, force: { x: 0.0004, y: 0 } },
      { type: "wind", x: 700, y: 100, width: 150, height: 180, force: { x: -0.0003, y: 0.0001 } },
      { type: "bouncer", x: 400, y: 380, width: 15, height: 70, angle: -25, restitution: 1.4 },
      { type: "bouncer", x: 650, y: 400, width: 15, height: 70, angle: 25, restitution: 1.4 },
    ],
    obstacles: [
      { type: "static", shape: "circle", x: 250, y: 320, radius: 22 },
      { type: "static", shape: "circle", x: 550, y: 420, radius: 28 },
      { type: "moving", shape: "circle", x: 450, y: 180, radius: 20, path: [{ x: 400, y: 180 }, { x: 500, y: 180 }], speed: 1.8 },
      { type: "moving", shape: "rectangle", x: 800, y: 200, width: 60, height: 15, path: [{ x: 800, y: 200 }, { x: 800, y: 280 }], speed: 1.3 },
    ],
    wind: { x: 0.0002, y: 0 },
    camera: { follow: true, bounds: { minX: 0, maxX: 1200 } },
    background: { skyColor: "#FF7F50", hillColor: "#228B22", groundColor: "#654321" },
  },
];

export function getLevel(id: number): Level | undefined {
  return LEVELS.find((level) => level.id === id);
}

export function getTotalLevels(): number {
  return LEVELS.length;
}
