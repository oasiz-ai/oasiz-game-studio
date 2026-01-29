# 🎮 Game Development Guide

Welcome to the Oasiz Game Studio! This guide will help you create high-quality games for the Oasiz platform.

## Quality Bar

**The bar for quality is a game you'd see on the App Store.** If you wouldn't download it, it shouldn't be on our platform.

- Games must be **fun** and **polished**
- If games are **challenging**, they should increase in difficulty
- All games need professional-grade visuals, animations, and game feel. This can mean assets (jpg, png, etc), animated sprites, glb, but assets are not required.
It is very feasible to reach this quality level using vanilla JS, CSS, and HTML Canvas, use what you're comfortable with.
- Games should either have:
      - depth (many levels with delightful nuance) 
      - or high replay value (slowly increases in difficulty making you want to play again and again)
      - The best games have both but there are exceptions (flappy bird, etc)
- Every interaction should feel satisfying (we call this "juice"), this includes start screen, pause menus, heads-up displays (HUD), game over screen, etc
- Highly reccomend generating music using Suno and sound effects using models like Google Lyria
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

### Step 1: Fork the Repository

Start by forking this repository to your own GitHub account:

1. Click the **Fork** button at the top right of this repository
2. Clone your forked repository locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/oasiz-game-studio.git
   cd oasiz-game-studio
   ```

### Step 2: Choose a Game from the Backlog

Check out the **[Game Backlog](./BACKLOG.md)** for a list of popular mobile games you can build. Pick one that interests you and **confirm with the Oasiz team before starting** to avoid overlap with other developers.

### Step 3: Create Your Game

You have two paths to create a game:

#### Option A: Start from Scratch

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

#### Option B: Fork an Existing Game

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

### Step 4: Submit a Pull Request

When your game is complete and tested:

1. **Commit your changes** to your forked repository:
   ```bash
   git add .
   git commit -m "Add [your-game-name] game"
   git push origin main
   ```

2. **Create a Pull Request** back to the main Oasiz repository:
   - Go to your forked repository on GitHub
   - Click **"Contribute"** → **"Open pull request"**
   - Add a description of your game and any notes for reviewers
   - Submit the PR for review

3. **Wait for review** — the Oasiz team will review your game and provide feedback or merge it into the main repository

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

### Multiplayer Games

If you're building a **multiplayer game**, use [Playroom Kit](https://docs.joinplayroom.com/) for real-time networking. See `draw-the-thing/` as a complete working example.

```bash
# Install Playroom Kit
bun add playroomkit
```

**Key requirements for multiplayer games:**

1. **Broadcast Room Code** — Call `window.shareRoomCode(roomCode)` after connecting so friends can join:
   ```typescript
   import { insertCoin, getRoomCode } from "playroomkit";
   
   await insertCoin({ skipLobby: true, roomCode: "ABCD" });
   
   // Broadcast to platform
   if (typeof (window as any).shareRoomCode === "function") {
     (window as any).shareRoomCode(getRoomCode());
   }
   ```

2. **Handle Injected Room Codes** — The platform may auto-inject a room code:
   ```typescript
   if (window.__ROOM_CODE__) {
     await connectToRoom(window.__ROOM_CODE__);
   }
   ```

3. **Clear Room Code on Leave** — When players leave, clear the shared code:
   ```typescript
   (window as any).shareRoomCode(null);
   ```

For detailed patterns (player state, host logic, RPC calls), see `Agents.md` and the `draw-the-thing/` source code.

> 📚 **For more in-depth Playroom Kit knowledge**, see [`playroom_js.md`](./playroom_js.md).

---

## Assets


Asset files will be hosted at `https://assets.oasiz.ai/ when importing your game to the platform. For development, include assets locally.

---

## Build & Test

```bash
# Build your game (run from game folder, not root)
cd your-game-name
bun run build

# Output goes to dist/index.html
```

### Upload to Test on the Oasiz App

You can upload your game directly to test it on the Oasiz platform before submitting a PR.

PLEASE TEST ON THE OASIZ APP FOR PERFORMANCE, TESTING ON WEBBROWSER OR SIMULATOR IS NOT ENOUGH.

#### 1. Set Up Environment Variables

Create a `.env` file in the root directory (or set these in your shell):

Easiest way is to just copy env.example directly and change the email to your account email (the email that is used to create your account)

```bash
# Required - get these from the Oasiz team
OASIZ_UPLOAD_TOKEN=your_upload_token
OASIZ_EMAIL=your-registered-email@example.com

# Optional - defaults to production API
# OASIZ_API_URL=http://localhost:3001/api/upload/game


```

#### 2. (Optional) Create a publish.json

Add a `publish.json` file in your game folder for metadata:

```json
{
  "title": "Your Game Title",
  "description": "A brief description of your game",
  "category": "arcade"
}
```

Categories: `arcade`, `puzzle`, `party`, `action`, `strategy`, `casual`

If you skip this file, defaults will be used (folder name as title, "test" for description/category).

#### 3. Upload Your Game

```bash
# From the repo root directory
bun run upload your-game-name

# Or with options:
bun run upload your-game-name --skip-build  # Use existing dist/
bun run upload your-game-name --dry-run     # Test without uploading

# List all available games
bun run upload --list
```

The upload script will:
1. Build your game (install deps + vite build)
2. Read the bundled HTML from `dist/index.html`
3. Include thumbnail if `thumbnail/` folder exists
4. Upload to the Oasiz platform

#### 4. Test on the App

Once uploaded, your game will be available in the Oasiz app for testing. Check that:
- The game loads correctly
- Touch controls work on mobile
- Score submission works
- The overall experience matches your local testing

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

