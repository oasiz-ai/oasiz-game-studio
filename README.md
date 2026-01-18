# 🎮 Game Development Guide

Welcome to the Oasiz Game Studio! This guide will help you create high-quality games for the Oasiz platform.

## Quality Bar

**The bar for quality is a game you'd see on the App Store.** If you wouldn't download it, it shouldn't be on our platform.

- Games must be **fun** and **polished**
- Some games should be **challenging**
- All games need professional-grade visuals, animations, and game feel
- Every interaction should feel satisfying (we call this "juice")

### Game Categories

| Category | Description |
|----------|-------------|
| **Action** | Fast-paced games requiring quick reflexes |
| **Casual** | Easy to pick up, relaxing gameplay |
| **Puzzle** | Brain teasers and logic challenges |
| **Arcade** | Classic arcade-style mechanics |
| **Party** | Social, multiplayer-friendly games |

> 💡 **Pro tip**: Download the Oasiz app via testflight to see the quality bar and get inspiration from existing games. Ask abel@oasiz.ai if you do not yet have access.

---

## Getting Started

### Choose a Game from the Backlog

Check out the **[Game Backlog](./BACKLOG.md)** for a list of games you can build. Pick one that interests you and confirm with the Oasiz team before starting to avoid overlap with other developers.

### Two Paths to Create a Game

You have two paths to create a game:

### Option 1: Start from Scratch

Use this approach when building something entirely new.

```bash
# 1. Copy the template folder
cp -r template/ your-game-name/

# 2. Navigate to your game folder
cd your-game-name/

# 3. Install dependencies
bun install

# 4. Start building!
# - Game logic goes in src/main.ts
# - HTML/CSS goes in index.html
bun run dev

# 5. Build when ready
bun run build
```

### Option 2: Fork an Existing Game

Use this approach when you want to iterate on a proven design or learn from existing code.

```bash
# 1. Copy an existing game (e.g., car-balance, paddle-bounce, threes)
cp -r car-balance/ your-game-name/

# 2. Navigate to your game folder  
cd your-game-name/

# 3. Install dependencies
bun install

# 4. Iterate and customize!
bun run dev

# 5. Build when ready
bun run build
```

**Recommended games to fork:**
- `car-balance` - Good for physics-based games
- `paddle-bounce` - Classic arcade mechanics
- `threes` - Puzzle game patterns
- `police-chase` - Endless runner style

---

## Project Structure

```
your-game-name/
├── src/
│   └── main.ts      # All game logic (TypeScript)
├── index.html       # Entry point + CSS styles
├── package.json     # Dependencies
├── tsconfig.json    # TypeScript config
└── vite.config.js   # Build config
```

**Key rules:**
- All logic in `src/main.ts` (TypeScript only)
- All CSS in `<style>` tags in `index.html`
- No JavaScript in `index.html`

---

## Working with AI (Cursor)

Reference `@AGENTS.md` in your prompts—it contains all the rules for:
- Haptic feedback patterns
- Score submission
- Mobile/desktop responsiveness
- Settings modal requirements
- UI safe areas
- Performance best practices

Example prompt:
```
@AGENTS.md Create a simple endless runner game with a jumping character
```

---

## Platform Requirements

### Responsive Design
Games run in an iframe modal at various sizes. Your game MUST:
- Fill 100% of viewport (`window.innerWidth` × `window.innerHeight`)
- Work on both mobile (touch) and desktop (keyboard/mouse)
- Handle resize events
- Hide mobile-only controls on desktop

```typescript
const isMobile = window.matchMedia('(pointer: coarse)').matches;
```

### Safe Areas
Games are embedded with platform overlays. Interactive buttons must respect:
- **Desktop**: Minimum `45px` from top
- **Mobile**: Minimum `120px` from top

### Required Settings Modal
Every game MUST have a settings button (gear icon) with toggles for:
1. **Music** 🎵 - Background music on/off
2. **FX** 🔊 - Sound effects on/off  
3. **Haptics** 📳 - Vibration on/off

Settings persist via `localStorage`.

### Score Submission
Call `window.submitScore(score)` on game over:

```typescript
private submitFinalScore(): void {
  if (typeof (window as any).submitScore === "function") {
    (window as any).submitScore(this.score);
  }
}
```

**Never** track high scores locally—the platform handles leaderboards.

### Haptic Feedback
Trigger haptics for satisfying game feel:

```typescript
// Available types: "light", "medium", "heavy", "success", "error"
if (typeof (window as any).triggerHaptic === "function") {
  (window as any).triggerHaptic("medium");
}
```

| Type | Use Case |
|------|----------|
| `light` | UI taps, button presses |
| `medium` | Collecting items, standard hits |
| `heavy` | Explosions, major collisions |
| `success` | Level complete, achievements |
| `error` | Damage, game over |

---

## Assets


Asset files will be hosted at `https://assets.oasiz.ai/ when importing your game to the platform. For development, include assets locally.

---

## Build & Test

```bash
# Build your game (run from game folder, not root)
cd games/your-game-name
bun run build

# Output goes to dist/index.html
```

### Testing Checklist
- [ ] Works on mobile (touch controls)
- [ ] Works on desktop (keyboard/mouse)
- [ ] Settings modal with Music/FX/Haptics toggles
- [ ] Score submits on game over
- [ ] No visual glitches or flickering
- [ ] Responsive at all viewport sizes
- [ ] Start screen is polished and engaging
- [ ] Game is actually fun!

---

## Common Pitfalls

❌ **Don't** use `Math.random()` in render loops (causes flickering)  
❌ **Don't** use emojis (inconsistent across platforms)  
❌ **Don't** track high scores locally  
❌ **Don't** put JavaScript in `index.html`  
❌ **Don't** forget to handle window resize  

✅ **Do** pre-calculate random values during object creation  
✅ **Do** use icon libraries instead of emojis  
✅ **Do** call `window.submitScore()` on game over  
✅ **Do** use TypeScript for all game logic  
✅ **Do** test on both mobile and desktop  

---

## Need Help?

1. Check `AGENTS.md` for detailed technical requirements
2. Look at existing games for implementation patterns
3. Download the Oasiz app to understand the quality bar

**Remember: If it wouldn't be on the App Store, it shouldn't be on Oasiz.**

Happy game making! 🚀

