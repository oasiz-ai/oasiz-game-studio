import type { DotColor } from "./main";

// Start screen animation state
export interface StartScreenDot {
  x: number;
  y: number;
  color: DotColor;
  offsetY: number; // For falling animation
  alpha: number;   // For fade out
  connected: boolean; // Whether ripple has been spawned for this dot
}

export interface StartScreenRipple {
  x: number;
  y: number;
  color: DotColor;
  scale: number;
  alpha: number;
}

export interface StartScreenAnim {
  phase: "idle" | "connecting" | "connected" | "clearing" | "spawning";
  dots: StartScreenDot[];
  ripples: StartScreenRipple[];
  lineProgress: number; // 0 to 1, how much of the line is drawn
  currentColorIndex: number;
  phaseTimer: number;
}

// Constants
const START_ANIM_COLORS: DotColor[] = ["red", "blue", "green", "yellow"];
const START_ANIM_DOT_COUNT = 4;
const START_ANIM_SIZE_MULTIPLIER = 0.8; // Multiplier for animation dot size (1.0 = 100%)
const START_ANIM_SPEED_MULTIPLIER = 1.0; // Overall speed multiplier (1.0 = normal, 2.0 = 2x faster)
const START_ANIM_CONNECT_SPEED = 0.015; // How fast line connects (per frame)
const START_ANIM_CLEAR_SPEED = 5; // Fall speed when clearing
const START_ANIM_SPAWN_SPEED = 4; // Fall speed when spawning
const START_ANIM_IDLE_FRAMES = 30; // Pause before connecting
const START_ANIM_CONNECTED_PAUSE_FRAMES = 20; // Pause after all dots connected before falling
const START_ANIM_SPAWN_HEIGHT = 40; // How far above dots spawn from
const START_ANIM_CLEAR_DISTANCE = 50; // How far dots fall before fully fading

interface BackgroundDot {
  x: number;
  y: number;
  radius: number;
  color: DotColor;
  opacity: number;
}

export class StartScreen {
  private anim: StartScreenAnim;
  private backgroundDots: BackgroundDot[] = [];

  constructor() {
    this.anim = {
      phase: "idle",
      dots: [],
      ripples: [],
      lineProgress: 0,
      currentColorIndex: 0,
      phaseTimer: 0,
    };
  }

  init(centerX: number, centerY: number, dotSpacing: number, dotRadius: number): void {
    const color = START_ANIM_COLORS[this.anim.currentColorIndex];
    this.anim.dots = [];
    this.anim.ripples = [];
    
    for (let i = 0; i < START_ANIM_DOT_COUNT; i++) {
      const x = centerX + (i - (START_ANIM_DOT_COUNT - 1) / 2) * dotSpacing;
      this.anim.dots.push({
        x,
        y: centerY,
        color,
        offsetY: 0,
        alpha: 1,
        connected: false,
      });
    }
    
    this.anim.lineProgress = 0;
    this.anim.phase = "idle";
    this.anim.phaseTimer = START_ANIM_IDLE_FRAMES;
  }

  update(centerX: number, centerY: number, dotSpacing: number, dotRadius: number): void {
    // Apply speed multiplier to ripple updates
    const speedMult = START_ANIM_SPEED_MULTIPLIER;
    
    // Update ripples
    for (let i = this.anim.ripples.length - 1; i >= 0; i--) {
      const ripple = this.anim.ripples[i];
      ripple.scale += 0.04 * speedMult;
      ripple.alpha -= 0.025 * speedMult;
      if (ripple.alpha <= 0) {
        this.anim.ripples.splice(i, 1);
      }
    }
    
    switch (this.anim.phase) {
      case "idle":
        this.anim.phaseTimer -= speedMult;
        if (this.anim.phaseTimer <= 0) {
          this.anim.phase = "connecting";
          // Mark first dot as connected and spawn ripple
          if (this.anim.dots.length > 0) {
            const firstDot = this.anim.dots[0];
            firstDot.connected = true;
            this.anim.ripples.push({
              x: firstDot.x,
              y: firstDot.y + firstDot.offsetY,
              color: firstDot.color,
              scale: 1,
              alpha: 1,
            });
          }
        }
        break;
        
      case "connecting":
        this.anim.lineProgress += START_ANIM_CONNECT_SPEED * speedMult;
        
        // Check which dots the line has reached and spawn ripples
        const currentDotIndex = Math.floor(this.anim.lineProgress * (this.anim.dots.length - 1));
        for (let i = 0; i <= currentDotIndex && i < this.anim.dots.length; i++) {
          const dot = this.anim.dots[i];
          if (!dot.connected) {
            dot.connected = true;
            this.anim.ripples.push({
              x: dot.x,
              y: dot.y + dot.offsetY,
              color: dot.color,
              scale: 1,
              alpha: 1,
            });
          }
        }
        
        if (this.anim.lineProgress >= 1) {
          this.anim.lineProgress = 1;
          this.anim.phase = "connected";
          this.anim.phaseTimer = START_ANIM_CONNECTED_PAUSE_FRAMES;
        }
        break;
        
      case "connected":
        // Pause after all dots connected before falling
        this.anim.phaseTimer -= speedMult;
        if (this.anim.phaseTimer <= 0) {
          this.anim.phase = "clearing";
        }
        break;
        
      case "clearing":
        let allCleared = true;
        for (const dot of this.anim.dots) {
          dot.offsetY += START_ANIM_CLEAR_SPEED * speedMult;
          dot.alpha = Math.max(0, 1 - dot.offsetY / START_ANIM_CLEAR_DISTANCE);
          if (dot.alpha > 0) {
            allCleared = false;
          }
        }
        if (allCleared) {
          // Move to next color and spawn new dots
          this.anim.currentColorIndex = (this.anim.currentColorIndex + 1) % START_ANIM_COLORS.length;
          const newColor = START_ANIM_COLORS[this.anim.currentColorIndex];
          
          this.anim.dots = [];
          for (let i = 0; i < START_ANIM_DOT_COUNT; i++) {
            const x = centerX + (i - (START_ANIM_DOT_COUNT - 1) / 2) * dotSpacing;
            this.anim.dots.push({
              x,
              y: centerY,
              color: newColor,
              offsetY: -START_ANIM_SPAWN_HEIGHT,
              alpha: 1,
              connected: false,
            });
          }
          this.anim.lineProgress = 0;
          this.anim.phase = "spawning";
        }
        break;
        
      case "spawning":
        let allLanded = true;
        for (const dot of this.anim.dots) {
          if (dot.offsetY < 0) {
            dot.offsetY += START_ANIM_SPAWN_SPEED * speedMult;
            if (dot.offsetY > 0) {
              dot.offsetY = 0;
            }
            allLanded = false;
          }
        }
        if (allLanded) {
          this.anim.phase = "idle";
          this.anim.phaseTimer = START_ANIM_IDLE_FRAMES;
        }
        break;
    }
  }

  draw(renderCtx: CanvasRenderingContext2D, dotRadius: number, colorHex: Record<DotColor, string>): void {
    if (this.anim.dots.length === 0) return;
    
    // Apply size multiplier
    const scaledRadius = dotRadius * START_ANIM_SIZE_MULTIPLIER;
    
    // Draw ripples (behind everything)
    for (const ripple of this.anim.ripples) {
      const rippleRadius = scaledRadius * ripple.scale;
      renderCtx.save();
      renderCtx.globalAlpha = ripple.alpha;
      renderCtx.fillStyle = colorHex[ripple.color];
      renderCtx.beginPath();
      renderCtx.arc(ripple.x, ripple.y, rippleRadius, 0, Math.PI * 2);
      renderCtx.fill();
      renderCtx.restore();
    }
    
    // Draw connecting line (behind dots) - show during connecting, connected, and clearing phases
    if (this.anim.lineProgress > 0 && this.anim.phase !== "spawning" && this.anim.phase !== "idle") {
      const firstDot = this.anim.dots[0];
      const lastDotIndex = Math.floor(this.anim.lineProgress * (this.anim.dots.length - 1));
      const progressInSegment = (this.anim.lineProgress * (this.anim.dots.length - 1)) - lastDotIndex;
      
      renderCtx.strokeStyle = colorHex[firstDot.color];
      renderCtx.lineWidth = scaledRadius * 0.5;
      renderCtx.lineCap = "round";
      renderCtx.lineJoin = "round";
      renderCtx.globalAlpha = firstDot.alpha;
      
      renderCtx.beginPath();
      renderCtx.moveTo(firstDot.x, firstDot.y + firstDot.offsetY);
      
      for (let i = 1; i <= lastDotIndex; i++) {
        const dot = this.anim.dots[i];
        renderCtx.lineTo(dot.x, dot.y + dot.offsetY);
      }
      
      // Draw partial line to next dot
      if (lastDotIndex < this.anim.dots.length - 1 && progressInSegment > 0) {
        const currentDot = this.anim.dots[lastDotIndex];
        const nextDot = this.anim.dots[lastDotIndex + 1];
        const partialX = currentDot.x + (nextDot.x - currentDot.x) * progressInSegment;
        const partialY = (currentDot.y + currentDot.offsetY) + ((nextDot.y + nextDot.offsetY) - (currentDot.y + currentDot.offsetY)) * progressInSegment;
        renderCtx.lineTo(partialX, partialY);
      }
      
      renderCtx.stroke();
      renderCtx.globalAlpha = 1;
    }
    
    // Draw dots
    for (const dot of this.anim.dots) {
      renderCtx.save();
      renderCtx.globalAlpha = dot.alpha;
      renderCtx.fillStyle = colorHex[dot.color];
      renderCtx.beginPath();
      renderCtx.arc(dot.x, dot.y + dot.offsetY, scaledRadius, 0, Math.PI * 2);
      renderCtx.fill();
      renderCtx.restore();
    }
  }

  render(
    renderCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    colorHex: Record<DotColor, string>
  ): void {
    // Initialize background dots if needed
    if (this.backgroundDots.length === 0) {
      const numDots = 12;
      for (let i = 0; i < numDots; i++) {
        this.backgroundDots.push({
          x: Math.random() * width,
          y: Math.random() * height,
          radius: 60 + Math.random() * 80, // 60-140px radius
          color: START_ANIM_COLORS[Math.floor(Math.random() * START_ANIM_COLORS.length)],
          opacity: 0.05 + Math.random() * 0.3, // 5-10% opacity
        });
      }
    }
    
    // Draw background dots
    for (const bgDot of this.backgroundDots) {
      renderCtx.save();
      renderCtx.globalAlpha = bgDot.opacity;
      renderCtx.fillStyle = colorHex[bgDot.color];
      renderCtx.beginPath();
      renderCtx.arc(bgDot.x, bgDot.y, bgDot.radius, 0, Math.PI * 2);
      renderCtx.fill();
      renderCtx.restore();
    }
    
    // Draw title with dot replacing the "O"
    const isMobile = window.matchMedia("(pointer: coarse)").matches;
    const fontSize = isMobile ? 32 : 48;
    renderCtx.font = `${fontSize}px 'Press Start 2P', monospace`;
    
    // Measure text parts to position them correctly
    const part1 = "[2D";
    const part2 = "ts]";
    const part1Width = renderCtx.measureText(part1).width;
    const part2Width = renderCtx.measureText(part2).width;
    const dotRadius = fontSize * 0.45; // Size of the dot replacing "O"
    const dotPadding = fontSize * 0.15; // Small padding around the dot
    const totalWidth = part1Width + dotPadding + dotRadius * 2 + dotPadding + part2Width;
    
    const titleY = height / 2 - 60;
    const startX = width / 2 - totalWidth / 2;
    const shadowOffset = fontSize * 0.08; // Hard shadow offset
    
    // Draw shadow for "2D"
    renderCtx.textAlign = "left";
    renderCtx.fillStyle = "rgba(0, 0, 0, 0.3)";
    renderCtx.fillText(part1, startX + shadowOffset, titleY + shadowOffset);
    
    // Draw main "2D"
    renderCtx.fillStyle = "#333333";
    renderCtx.fillText(part1, startX, titleY);
    
    // Draw the dot (circle) in place of "O"
    const dotCenterX = startX + part1Width + dotPadding + dotRadius;
    const dotCenterY = titleY - fontSize * 0.5; // Align with text baseline
    const currentColor = START_ANIM_COLORS[this.anim.currentColorIndex];
    
    // Draw shadow for dot
    renderCtx.fillStyle = "rgba(0, 0, 0, 0.3)";
    renderCtx.beginPath();
    renderCtx.arc(dotCenterX + shadowOffset, dotCenterY + shadowOffset, dotRadius, 0, Math.PI * 2);
    renderCtx.fill();
    
    // Draw main dot
    renderCtx.fillStyle = colorHex[currentColor];
    renderCtx.beginPath();
    renderCtx.arc(dotCenterX, dotCenterY, dotRadius, 0, Math.PI * 2);
    renderCtx.fill();
    
    // Draw shadow for "ts"
    renderCtx.fillStyle = "rgba(0, 0, 0, 0.3)";
    renderCtx.fillText(part2, dotCenterX + dotRadius + dotPadding + shadowOffset, titleY + shadowOffset);
    
    // Draw main "ts"
    renderCtx.fillStyle = "#333333";
    renderCtx.fillText(part2, dotCenterX + dotRadius + dotPadding, titleY);
    
    // Animation parameters
    const animDotRadius = isMobile ? 12 : 16;
    const animDotSpacing = isMobile ? 40 : 50;
    const animCenterY = height / 2 + 20;
    
    // Initialize animation if needed
    if (this.anim.dots.length === 0) {
      this.init(width / 2, animCenterY, animDotSpacing, animDotRadius);
    }
    
    // Update and draw animation
    this.update(width / 2, animCenterY, animDotSpacing, animDotRadius);
    this.draw(renderCtx, animDotRadius, colorHex);
  }

  reset(): void {
    this.anim.dots = [];
    this.anim.ripples = [];
    this.anim.lineProgress = 0;
    this.anim.phase = "idle";
    this.backgroundDots = [];
  }

  getCurrentColor(): DotColor {
    return START_ANIM_COLORS[this.anim.currentColorIndex];
  }
}
