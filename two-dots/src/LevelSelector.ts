import type { DotColor } from "./main";

// Level button interface
interface LevelButton {
  level: number;
  x: number;
  y: number;
  width: number;
  height: number;
  hoverScale: number;
  clickScale: number;
  clickStartTime: number | null;
  locked: boolean;
  color: DotColor; // Color for the outline
  activated: boolean; // Whether the animation has reached this button
}

interface BackgroundDot {
  x: number;
  y: number;
  radius: number;
  color: DotColor;
  opacity: number;
}

interface ButtonRipple {
  x: number;
  y: number;
  color: DotColor;
  scale: number;
  alpha: number;
}

export class LevelSelector {
  private buttons: LevelButton[] = [];
  private hoveredButton: number | null = null;
  private totalLevels: number;
  private columns: number;
  private rows: number;
  private buttonSpacing: number;
  private buttonWidth: number = 0;
  private buttonHeight: number = 0;
  private onLevelSelected: (level: number) => void;
  private colors: DotColor[];
  private colorHex: Record<DotColor, string>;
  private backgroundDots: BackgroundDot[] = [];
  private maxUnlockedLevel: number = 1;
  private selectedButtonLevel: number | null = null; // Track which button is currently selected/clicked
  
  // Scrolling state
  private scrollOffset: number = 0;
  private minScrollOffset: number = 0;
  private maxScrollOffset: number = 0;
  private isDragging: boolean = false;
  private lastDragY: number = 0;
  
  // Animation state
  private lineAnimationProgress: number = 0; // 0 to 1
  private animationStartTime: number | null = null;
  private baseAnimationDurationPerLevel: number = 350; // ms per level for uniform speed
  private buttonRipples: ButtonRipple[] = [];
  
  // Exposed configuration variables
  public buttonSize: number | null = null; // null = auto-calculate, or set specific size
  public fontSize: { mobile: number; desktop: number } = { mobile: 14, desktop: 18 };
  public fontSizeLocked: { mobile: number; desktop: number } = { mobile: 10, desktop: 12 };
  public fontSizeLockedNumber: { mobile: number; desktop: number } = { mobile: 8, desktop: 10 };

  constructor(
    totalLevels: number = 25,
    onLevelSelected: (level: number) => void,
    colors: DotColor[] = ["red", "blue", "green", "yellow"],
    colorHex: Record<DotColor, string> = {
      red: "#e84e60",
      blue: "#a5547d",
      green: "#77c299",
      yellow: "#fece6c",
      purple: "#AA44FF",
    },
    buttonSize: number | null = null,
    fontSize?: { mobile: number; desktop: number },
    fontSizeLocked?: { mobile: number; desktop: number },
    fontSizeLockedNumber?: { mobile: number; desktop: number },
    maxUnlockedLevel: number = 1
  ) {
    this.totalLevels = totalLevels;
    this.onLevelSelected = onLevelSelected;
    this.columns = 1; // Single column for vertical layout
    this.rows = totalLevels;
    this.buttonSpacing = 48;
    this.colors = colors;
    this.colorHex = colorHex;
    this.buttonSize = buttonSize;
    this.maxUnlockedLevel = maxUnlockedLevel;
    this.selectedButtonLevel = maxUnlockedLevel; // Set latest unlocked level as selected by default
    if (fontSize) this.fontSize = fontSize;
    if (fontSizeLocked) this.fontSizeLocked = fontSizeLocked;
    if (fontSizeLockedNumber) this.fontSizeLockedNumber = fontSizeLockedNumber;
  }

  private spawnRipple(x: number, y: number, color: DotColor): void {
    this.buttonRipples.push({
      x: x,
      y: y,
      color: color,
      scale: 1,
      alpha: 1,
    });
  }

  private updateRipples(): void {
    for (let i = this.buttonRipples.length - 1; i >= 0; i--) {
      const ripple = this.buttonRipples[i];
      // Grow the ripple
      ripple.scale += 0.04;
      // Fade out the ripple
      ripple.alpha -= 0.025;
      
      // Remove ripple when fully faded
      if (ripple.alpha <= 0) {
        this.buttonRipples.splice(i, 1);
      }
    }
  }

  private drawRipples(renderCtx: CanvasRenderingContext2D): void {
    for (const ripple of this.buttonRipples) {
      const radius = this.buttonWidth / 2 * ripple.scale;
      
      renderCtx.save();
      renderCtx.globalAlpha = ripple.alpha;
      renderCtx.fillStyle = this.colorHex[ripple.color];
      renderCtx.beginPath();
      renderCtx.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2);
      renderCtx.fill();
      renderCtx.restore();
    }
  }

  private calculateLayout(width: number, height: number, isMobile: boolean): void {
    const titleHeight = isMobile ? 40 : 50; // Space for title
    const bottomPadding = isMobile ? 140 : 140; // Space for level button and bottom margin
    const sidePadding = isMobile ? 20 : 30; // Reduced padding for larger circles
    
    const availableHeight = height - titleHeight - bottomPadding;
    const availableWidth = width - sidePadding * 2;
    
    // Calculate button size - make it reasonable for vertical layout
    // Use configured size if set, otherwise auto-calculate
    let buttonSize: number;
    if (this.buttonSize !== null) {
      buttonSize = this.buttonSize;
    } else {
      // Allow circles to be much larger, constrained by available width
      const desiredSize = isMobile ? 40 : 60;
      buttonSize = Math.min(availableWidth * 0.9, desiredSize);
    }
    
    this.buttonWidth = buttonSize;
    this.buttonHeight = buttonSize;
    
    // Center horizontally
    const startX = (width - this.buttonWidth) / 2;
    
    // Calculate total height of all buttons
    const totalButtonsHeight = this.totalLevels * this.buttonHeight + (this.totalLevels - 1) * this.buttonSpacing;
    
    // Start Y position for buttons (level 1 at bottom of scrollable area)
    const scrollableAreaBottom = height - bottomPadding;
    const baseY = scrollableAreaBottom - this.buttonHeight;
    
    // Calculate scroll limits
    // minScrollOffset = 0: Level 1 stays at bottom (initial state)
    // maxScrollOffset: Enough scroll to bring level 25 into view at top
    this.minScrollOffset = 0;
    this.maxScrollOffset = Math.max(0, totalButtonsHeight - availableHeight);
    
    // Clamp scroll offset
    this.scrollOffset = Math.max(this.minScrollOffset, Math.min(this.maxScrollOffset, this.scrollOffset));
    
    // Preserve states before recreating buttons
    const activatedStates = new Map<number, boolean>();
    const clickScales = new Map<number, number>();
    const clickStartTimes = new Map<number, number | null>();
    for (const button of this.buttons) {
      activatedStates.set(button.level, button.activated);
      clickScales.set(button.level, button.clickScale);
      clickStartTimes.set(button.level, button.clickStartTime);
    }
    
    // Create buttons - level 1 at bottom, others going upward
    this.buttons = [];
    for (let i = 0; i < this.totalLevels; i++) {
      const level = i + 1;
      
      // Assign color by cycling through available colors
      const colorIndex = (level - 1) % this.colors.length;
      const color = this.colors[colorIndex];
      
      // Calculate Y position: level 1 at bottom, level 2 above it, etc.
      // i=0 → level 1 at bottom, i=1 → level 2 above level 1, etc.
      const y = baseY - i * (this.buttonHeight + this.buttonSpacing) + this.scrollOffset;
      
      // Set clickScale to 1.2 if this is the selected button
      const isSelected = level === this.selectedButtonLevel;
      
      this.buttons.push({
        level: level,
        x: startX,
        y: y,
        width: this.buttonWidth,
        height: this.buttonHeight,
        hoverScale: 1,
        clickScale: isSelected ? 1.2 : (clickScales.get(level) ?? 1),
        clickStartTime: null, // No animation needed
        locked: level > this.maxUnlockedLevel, // Lock levels beyond maxUnlockedLevel
        color: color,
        activated: activatedStates.get(level) || false, // Preserve activated state
      });
    }
  }

  handleInput(x: number, y: number): boolean {
    // Start drag for scrolling
    this.isDragging = true;
    this.lastDragY = y;
    return false;
  }

  handleInputMove(x: number, y: number): void {
    if (this.isDragging) {
      const deltaY = y - this.lastDragY;
      this.scrollOffset += deltaY; // Swipe down = see higher levels above
      this.lastDragY = y;
    }
  }

  handleInputEnd(): void {
    this.isDragging = false;
  }

  handleWheel(deltaY: number): void {
    // Scroll on wheel (wheel down = see higher levels above)
    this.scrollOffset += deltaY * 0.5; // Adjust scroll speed
  }

  handleButtonClick(x: number, y: number): boolean {
    // Check if any button was clicked (circular hit detection)
    for (const button of this.buttons) {
      const centerX = button.x + button.width / 2;
      const centerY = button.y + button.height / 2;
      const radius = button.width / 2;
      const distance = Math.sqrt(
        Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)
      );
      
      if (distance <= radius && !button.locked) {
        // Reset previous selected button
        if (this.selectedButtonLevel !== null) {
          for (const btn of this.buttons) {
            if (btn.level === this.selectedButtonLevel) {
              btn.clickScale = 1;
              btn.clickStartTime = null;
            }
          }
        }
        
        // Set new selected button
        this.selectedButtonLevel = button.level;
        button.clickScale = 1.2;
        button.clickStartTime = null; // No animation needed
        
        this.onLevelSelected(button.level);
        return true;
      }
    }
    return false;
  }

  updateHover(x: number, y: number): void {
    this.hoveredButton = null;
    
    for (let i = 0; i < this.buttons.length; i++) {
      const button = this.buttons[i];
      const centerX = button.x + button.width / 2;
      const centerY = button.y + button.height / 2;
      const radius = button.width / 2;
      const distance = Math.sqrt(
        Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)
      );
      const isHovered = distance <= radius && !button.locked;
      
      if (isHovered) {
        this.hoveredButton = i;
        button.hoverScale = Math.min(button.hoverScale + 0.1, 1.15);
      } else {
        button.hoverScale = Math.max(button.hoverScale - 0.1, 1);
      }
    }
  }

  render(
    renderCtx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void {
    const isMobile = window.matchMedia("(pointer: coarse)").matches;
    
    // Ensure the latest unlocked level is selected (enlarged) if no button is currently selected
    if (this.selectedButtonLevel === null) {
      this.selectedButtonLevel = this.maxUnlockedLevel;
    }
    
    // Calculate layout
    this.calculateLayout(width, height, isMobile);
    
    // Start animation on first render
    if (this.animationStartTime === null) {
      this.animationStartTime = Date.now();
    }
    
    // Calculate animation duration based on maxUnlockedLevel for uniform speed
    const animationDuration = this.maxUnlockedLevel * this.baseAnimationDurationPerLevel;
    
    // Update animation progress
    const elapsed = Date.now() - this.animationStartTime;
    this.lineAnimationProgress = Math.min(elapsed / animationDuration, 1);
    
    // Update ripples
    this.updateRipples();
    
    // Initialize background dots if needed
    if (this.backgroundDots.length === 0) {
      const numDots = 12;
      for (let i = 0; i < numDots; i++) {
        this.backgroundDots.push({
          x: Math.random() * width,
          y: Math.random() * height,
          radius: 60 + Math.random() * 80, // 60-140px radius
          color: this.colors[Math.floor(Math.random() * this.colors.length)],
          opacity: 0.05 + Math.random() * 0.3, // 5-35% opacity
        });
      }
    }
    
    // Draw background dots (before clipping)
    for (const bgDot of this.backgroundDots) {
      renderCtx.save();
      renderCtx.globalAlpha = bgDot.opacity;
      renderCtx.fillStyle = this.colorHex[bgDot.color];
      renderCtx.beginPath();
      renderCtx.arc(bgDot.x, bgDot.y, bgDot.radius, 0, Math.PI * 2);
      renderCtx.fill();
      renderCtx.restore();
    }
    
    // Draw title "Levels" with same style as start screen
    const fontSize = isMobile ? 32 : 48;
    const titleY = isMobile ? 50 : 60;
    const shadowOffset = fontSize * 0.08;
    
    renderCtx.font = `${fontSize}px 'Press Start 2P', monospace`;
    renderCtx.textAlign = "center";
    
    // Draw shadow
    renderCtx.fillStyle = "rgba(0, 0, 0, 0.3)";
    renderCtx.fillText("Levels", width / 2 + shadowOffset, titleY + shadowOffset);
    
    // Draw main text
    renderCtx.fillStyle = "#333333";
    renderCtx.fillText("Levels", width / 2, titleY);
    
    // Define scrollable area (below title, above hint text)
    const titleHeight = isMobile ? 80 : 100;
    const bottomPadding = isMobile ? 80 : 100;
    const scrollableTop = titleHeight;
    const scrollableBottom = height - bottomPadding;
    const scrollableHeight = scrollableBottom - scrollableTop;
    
    // Save context and clip to scrollable area
    renderCtx.save();
    renderCtx.beginPath();
    renderCtx.rect(0, scrollableTop, width, scrollableHeight);
    renderCtx.clip();
    
    // Draw connecting line between all circles with animation
    if (this.buttons.length > 1) {
      const firstButton = this.buttons[0];
      const firstCenterX = firstButton.x + firstButton.width / 2;
      const firstCenterY = firstButton.y + firstButton.height / 2;
      const extendedBottomY = height - (isMobile ? 20 : 30);
      
      // Calculate total line length from bottom to maxUnlockedLevel (not all the way to top)
      const maxUnlockedButton = this.buttons[Math.min(this.maxUnlockedLevel - 1, this.buttons.length - 1)];
      const maxUnlockedCenterY = maxUnlockedButton.y + maxUnlockedButton.height / 2;
      const totalLineLength = extendedBottomY - maxUnlockedCenterY;
      
      // Calculate current animated length
      const animatedLength = totalLineLength * this.lineAnimationProgress;
      const currentY = extendedBottomY - animatedLength;
      
      renderCtx.lineWidth = 3;
      renderCtx.lineCap = "round";
      renderCtx.lineJoin = "round";
      
      // Draw grey line (full line from bottom to top)
      renderCtx.strokeStyle = "#CCCCCC"; // Grey color
      renderCtx.beginPath();
      renderCtx.moveTo(firstCenterX, extendedBottomY);
      renderCtx.lineTo(firstCenterX, firstCenterY);
      
      for (let i = 1; i < this.buttons.length; i++) {
        const button = this.buttons[i];
        const centerX = button.x + button.width / 2;
        const centerY = button.y + button.height / 2;
        renderCtx.lineTo(centerX, centerY);
      }
      renderCtx.stroke();
      
      // Draw red line (animated portion from bottom to current progress, up to maxUnlockedLevel)
      if (this.lineAnimationProgress > 0) {
        renderCtx.strokeStyle = "#e84e60"; // Red color
        renderCtx.lineWidth = 7;
        renderCtx.beginPath();
        renderCtx.moveTo(firstCenterX, extendedBottomY);
        
        // Draw line segments until we reach the current animation point or maxUnlockedLevel
        let reachedEnd = false;
        
        // First segment from bottom to level 1
        if (currentY <= firstCenterY) {
          renderCtx.lineTo(firstCenterX, firstCenterY);
          
          // Continue through buttons up to maxUnlockedLevel
          for (let i = 1; i < Math.min(this.maxUnlockedLevel, this.buttons.length); i++) {
            const button = this.buttons[i];
            const centerX = button.x + button.width / 2;
            const centerY = button.y + button.height / 2;
            
            if (currentY <= centerY) {
              renderCtx.lineTo(centerX, centerY);
            } else {
              // Interpolate to the exact current position
              const prevButton = this.buttons[i - 1];
              const prevCenterX = prevButton.x + prevButton.width / 2;
              const prevCenterY = prevButton.y + prevButton.height / 2;
              
              const segmentLength = prevCenterY - centerY;
              const remainingLength = prevCenterY - currentY;
              const t = remainingLength / segmentLength;
              
              const interpolatedX = prevCenterX + (centerX - prevCenterX) * t;
              const interpolatedY = currentY;
              
              renderCtx.lineTo(interpolatedX, interpolatedY);
              reachedEnd = true;
              break;
            }
          }
        } else {
          // We're still in the first segment (bottom to level 1)
          renderCtx.lineTo(firstCenterX, currentY);
        }
        
        renderCtx.stroke();
      }
    }
    
    // Calculate which buttons have been reached by the animation and spawn ripples
    const firstButton = this.buttons[0];
    const firstCenterY = firstButton.y + firstButton.height / 2;
    const extendedBottomY = height - (isMobile ? 20 : 30);
    const maxUnlockedButton = this.buttons[Math.min(this.maxUnlockedLevel - 1, this.buttons.length - 1)];
    const maxUnlockedCenterY = maxUnlockedButton.y + maxUnlockedButton.height / 2;
    const totalLineLength = extendedBottomY - maxUnlockedCenterY;
    const animatedLength = totalLineLength * this.lineAnimationProgress;
    const currentY = extendedBottomY - animatedLength;
    
    // Check each button and spawn ripple when reached (only up to maxUnlockedLevel)
    for (let i = 0; i < Math.min(this.maxUnlockedLevel, this.buttons.length); i++) {
      const button = this.buttons[i];
      const centerX = button.x + button.width / 2;
      const centerY = button.y + button.height / 2;
      
      // Check if animation has reached this button
      const isReached = currentY <= centerY;
      
      // If button is newly reached, spawn ripple and mark as activated
      if (isReached && !button.activated) {
        button.activated = true;
        this.spawnRipple(centerX, centerY, button.color);
      }
    }
    
    // Draw ripples (behind buttons)
    this.drawRipples(renderCtx);
    
    // Draw buttons (only visible buttons within clip area will show)
    for (let i = 0; i < this.buttons.length; i++) {
      const button = this.buttons[i];
      
      // Skip buttons that are completely outside the visible area
      if (button.y + button.height < scrollableTop || button.y > scrollableBottom) {
        continue;
      }
      
      const isHovered = this.hoveredButton === i;
      const centerX = button.x + button.width / 2;
      const centerY = button.y + button.height / 2;
      const radius = button.width / 2;
      
      // Keep selected button at 1.2x scale (no animation needed)
      if (button.level === this.selectedButtonLevel) {
        button.clickScale = 1.2;
      } else if (button.clickScale !== 1) {
        // Reset any non-selected buttons
        button.clickScale = 1;
      }
      
      renderCtx.save();
      
      // Apply combined hover and click scale transform
      const scale = button.hoverScale * button.clickScale;
      renderCtx.translate(centerX, centerY);
      renderCtx.scale(scale, scale);
      renderCtx.translate(-centerX, -centerY);
      
      // Draw button background (white circle) - greyed out until activated
      renderCtx.fillStyle = button.locked || !button.activated ? "#E0E0E0" : "#FFFFFF";
      renderCtx.shadowColor = "rgba(0, 0, 0, 0.15)";
      renderCtx.shadowBlur = isHovered ? 12 : 8;
      renderCtx.shadowOffsetY = isHovered ? 4 : 2;
      
      renderCtx.beginPath();
      renderCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      renderCtx.fill();
      
      // Draw colored outline border (greyed out until activated)
      const outlineColor = button.locked || !button.activated ? "#CCCCCC" : this.colorHex[button.color];
      renderCtx.strokeStyle = outlineColor;
      renderCtx.lineWidth = isHovered ? 6 : 5;
      renderCtx.beginPath();
      renderCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      renderCtx.stroke();
      
      // // Draw three stars on top of the button, following the curvature
      // if (!button.locked) {
      //   const starRadius = radius * 0.5; // Star size relative to button (increased from 0.12)
      //   const starOffsetY = radius * 1.5; // Position stars further above the button (increased from 1.15)
      
      //   // Calculate the angle for curved positioning along the top arc
      //   const leftAngle = -Math.PI / 2 - 0.5; // Left star angle (slightly wider spread)
      //   const rightAngle = -Math.PI / 2 + 0.5; // Right star angle (slightly wider spread)
        
      //   // Star positions in A-shape: center star highest, side stars lower
      //   const centerStarX = centerX;
      //   const centerStarY = centerY - starOffsetY; // Center star at highest point
        
      //   // Side stars positioned lower (higher Y value) to form A-shape
      //   const sideStarOffsetY = radius * 0.25; // How much lower the side stars are
      //   const leftStarX = centerX + Math.cos(leftAngle) * radius * 1.1;
      //   const leftStarY = centerStarY + sideStarOffsetY; // Lower than center
        
      //   const rightStarX = centerX + Math.cos(rightAngle) * radius * 1.1;
      //   const rightStarY = centerStarY + sideStarOffsetY; // Lower than center
        
      //   // Draw stars (greyed out until activated)
      //   renderCtx.save();
      //   renderCtx.fillStyle = !button.activated ? "#CCCCCC" : "#FFF34D"; // Gold color when activated
      //   renderCtx.strokeStyle = !button.activated ? "#999999" : "#FFF34D"; // Orange outline when activated
      //   renderCtx.lineWidth = 1;
        
      //   // Left star
      //   this.drawStar(renderCtx, leftStarX, leftStarY, starRadius, false);
        
      //   // Center star
      //   this.drawStar(renderCtx, centerStarX, centerStarY, starRadius, false);
        
      //   // Right star
      //   this.drawStar(renderCtx, rightStarX, rightStarY, starRadius, false);
        
      //   renderCtx.restore();
      // }
      
      // Draw level number or lock icon
      if (button.locked) {
        // Draw lock icon for locked levels
        this.drawLockIcon(renderCtx, centerX, centerY, radius * 1.2);
      } else {
        // Draw level number (greyed out until activated)
        renderCtx.fillStyle = !button.activated ? "#999999" : "#333333";
        renderCtx.font = `bold ${isMobile ? this.fontSize.mobile : this.fontSize.desktop}px Arial, sans-serif`;
        renderCtx.textAlign = "center";
        renderCtx.textBaseline = "middle";
        renderCtx.fillText(button.level.toString(), centerX, centerY);
      }
      
      renderCtx.restore();
    }
    
    // Restore context (remove clip)
    renderCtx.restore();
  }

  reset(): void {
    this.hoveredButton = null;
    this.selectedButtonLevel = null;
    this.scrollOffset = 0;
    this.isDragging = false;
    this.lineAnimationProgress = 0;
    this.animationStartTime = null;
    this.buttonRipples = [];
    for (const button of this.buttons) {
      button.hoverScale = 1;
      button.clickScale = 1;
      button.clickStartTime = null;
      button.activated = false;
    }
  }

  setLevel(level: number): void {
    // Ensure level is within valid range
    if (level >= 1 && level <= this.totalLevels) {
      this.onLevelSelected(level);
    }
  }

  updateMaxUnlockedLevel(maxLevel: number): void {
    this.maxUnlockedLevel = maxLevel;
    // Set the latest unlocked level as selected (enlarged)
    this.selectedButtonLevel = maxLevel;
    // Buttons will be updated on next render via calculateLayout
  }

  private drawStar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    filled: boolean
  ): void {
    const points = 5;
    const innerRadius = radius * 0.4;
    
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const r = i % 2 === 0 ? radius : innerRadius;
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;
      
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    
    if (filled) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }

  private drawLockIcon(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    size: number
  ): void {
    const lockWidth = size * 0.5;
    const lockHeight = size * 0.6;
    const shackleRadius = lockWidth * 0.35;
    const shackleThickness = size * 0.08;
    const bodyHeight = lockHeight * 0.55;
    
    ctx.save();
    ctx.strokeStyle = "#999999";
    ctx.fillStyle = "#999999";
    ctx.lineWidth = shackleThickness;
    ctx.lineCap = "round";
    
    // Draw shackle (top arc)
    const shackleY = centerY - lockHeight * 0.15;
    ctx.beginPath();
    ctx.arc(
      centerX,
      shackleY,
      shackleRadius,
      Math.PI,
      0,
      false
    );
    ctx.stroke();
    
    // Draw lock body (rounded rectangle)
    const bodyY = shackleY + shackleRadius * 0.3;
    const bodyWidth = lockWidth;
    const cornerRadius = size * 0.08;
    
    ctx.beginPath();
    ctx.moveTo(centerX - bodyWidth / 2 + cornerRadius, bodyY);
    ctx.lineTo(centerX + bodyWidth / 2 - cornerRadius, bodyY);
    ctx.quadraticCurveTo(centerX + bodyWidth / 2, bodyY, centerX + bodyWidth / 2, bodyY + cornerRadius);
    ctx.lineTo(centerX + bodyWidth / 2, bodyY + bodyHeight - cornerRadius);
    ctx.quadraticCurveTo(centerX + bodyWidth / 2, bodyY + bodyHeight, centerX + bodyWidth / 2 - cornerRadius, bodyY + bodyHeight);
    ctx.lineTo(centerX - bodyWidth / 2 + cornerRadius, bodyY + bodyHeight);
    ctx.quadraticCurveTo(centerX - bodyWidth / 2, bodyY + bodyHeight, centerX - bodyWidth / 2, bodyY + bodyHeight - cornerRadius);
    ctx.lineTo(centerX - bodyWidth / 2, bodyY + cornerRadius);
    ctx.quadraticCurveTo(centerX - bodyWidth / 2, bodyY, centerX - bodyWidth / 2 + cornerRadius, bodyY);
    ctx.closePath();
    ctx.fill();
    
    // Draw keyhole
    const keyholeY = bodyY + bodyHeight * 0.4;
    const keyholeRadius = size * 0.08;
    
    ctx.fillStyle = "#E0E0E0";
    ctx.beginPath();
    ctx.arc(centerX, keyholeY, keyholeRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw keyhole slot
    ctx.fillRect(
      centerX - keyholeRadius * 0.3,
      keyholeY,
      keyholeRadius * 0.6,
      bodyHeight * 0.35
    );
    
    ctx.restore();
  }
}
