# Architecture: Bob the Shrimp

> Single-page web app. Pure client-side. Deployed to GitHub Pages.

## Stack

- **HTML5** + **CSS3** + **vanilla JavaScript (ES modules)**
- **No build step** — files served as-is from Pages
- **No dependencies** — no React, no bundler, no package.json needed
- **localStorage** for persistence

## File Structure

```
/opt/data/ninja-frog/
├── index.html              ← entry point, mounts UI, loads modules
├── styles.css              ← all styles
├── src/
│   ├── main.js             ← bootstraps the game
│   ├── game.js             ← game loop, ticks via Date.now
│   ├── pet.js              ← Bob model (stats, decay, actions)
│   ├── ui.js               ← renders DOM, handles clicks
│   └── storage.js          ← save/load to localStorage
├── assets/
│   ├── bob.png             ← shrimp sprite (added later)
│   └── aquarium-bg.svg     ← background (added later)
├── docs/
│   ├── VISION.md
│   └── ARCHITECTURE.md
└── .github/
    └── workflows/
        └── deploy.yml      ← auto-deploy to Pages on push to main
```

## Data Model: Bob

```js
{
  name: "Bob",
  bornAt: 1234567890,        // Date.now() when Bob was created
  lastTickAt: 1234567890,    // last time we applied decay
  age: 0,                    // game-hours (0–100)
  stats: {
    health: 100,             // 0–100
    hunger: 0,               // 0–100 (0 = full, 100 = starving)
    fatigue: 0,              // 0–100
    happiness: 100           // 0–100
  },
  alive: true
}
```

## Game Loop

- `requestAnimationFrame` drives render (~60fps)
- On each frame, compute `deltaSec = (Date.now() - pet.lastTickAt) / 1000`
- Apply decay scaled by `tickSpeed = 25`:
  - `pet.stats.hunger += (deltaSec * 25 / 60)`
  - `pet.stats.fatigue += (deltaSec * 25 / 60)`
  - `pet.stats.happiness -= (deltaSec * 12.5 / 60)`
  - `pet.age += (deltaSec * 25 / 60)` (game-hours)
- If age ≥ 100 → `alive = false`, show "Game Over"
- If hunger/fatigue/happiness ≥ 100 (or ≥ 90 for health-drop) → health drops
- If health ≤ 0 → `alive = false`, show "Bob got sick"
- Clamp all stats to [0, 100]

## Player Actions

- **Feed** (`🍤 Feed`): `hunger = max(0, hunger - 30)`
- **Sleep** (`😴 Sleep`): `fatigue = max(0, fatigue - 50)`, advances 1 game-hour
- **Play** (`🎾 Play`): `happiness = min(100, happiness + 25)`, advances 1 game-hour

Sleep and Play cost 1 game-hour (Bob is busy). Feed is instant.

## Save/Load

- `localStorage.setItem('bob', JSON.stringify(pet))` every 5 seconds
- On page load: try to load `bob`; if missing or `alive=false`, create new Bob
- Critical: compute "missed time" on load → apply decay for time the page was closed (so closing the tab for 1 min = 1 min of decay)

## UI Layout

```
+------------------------------------------+
|  🦐 Bob the Shrimp        Age: 12h       |
|                                          |
|     [   🦐 Bob sprite here   ]           |
|     [   (aquarium background)  ]         |
|                                          |
|  Health    [████████░░] 80               |
|  Hunger    [██████░░░░] 60               |
|  Fatigue   [███░░░░░░░] 30               |
|  Happiness [██████████] 95               |
|                                          |
|  [🍤 Feed]  [😴 Sleep]  [🎾 Play]         |
+------------------------------------------+
```

For v1: simple text-based UI, no sprite (placeholder). Sprite added in v2.

## Deployment

- **GitHub Actions** workflow in `.github/workflows/deploy.yml`
- Triggers on push to `main`
- Uses `actions/deploy-pages@v4` to deploy repo root to Pages
- Page URL: `https://<owner>.github.io/<repo>/` = `https://tsybriki.github.io/ninja-frog/`

## Out of Scope (v1)

- Audio
- Animations beyond simple sprite swap
- Mobile touch optimization (works but not polished)
- Multiple save slots
- Settings UI
