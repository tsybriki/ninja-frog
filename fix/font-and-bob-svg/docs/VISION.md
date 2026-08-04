# Game Vision: Bob the Shrimp

> A virtual pet game where you take care of a shrimp named Bob. Single-player, browser-based, hosted on GitHub Pages.

## Concept

A tamagotchi-style virtual pet: the player keeps a shrimp named **Bob** alive by managing his needs until he dies of old age at 100 in-game hours.

## Character

- **Name:** Bob
- **Type:** Shrimp
- **Visual style:** TBD (pixel art / hand-drawn / generated)
- **Background:** Aquarium (blue gradient + bubbles)

## Stats (4, each 0–100)

| Stat      | Meaning                                |
|-----------|----------------------------------------|
| Health    | Drops if hunger/fatigue/happiness is critical |
| Hunger    | Rises over time; feed to lower         |
| Fatigue   | Rises over time; sleep to lower        |
| Happiness | Drops over time; play to raise         |

## Player Actions (3 buttons)

- 🍤 **Feed** — lowers hunger
- 😴 **Sleep** — lowers fatigue
- 🎾 **Play** — raises happiness

## Lifecycle

- **Start:** Bob is young, age = 0
- **Aging:** 1 game-hour = 6 real-time seconds (1 game-hour = 6 real seconds)
- **Death:** at age = 100 game-hours, Bob dies of old age → **lifetime = 1 real hour (3600 s)**
- **Game Over:** "Bob lived a full life" + "New Game" button (fresh start)

## Decay Rates (in real time)

Implemented via `Date.now()` deltas, not `setInterval` ticks — so it works correctly when the tab is backgrounded.

**Single mode (1-hour lifetime):** full lifecycle = 60 real-time minutes.

- `tickSpeed = 10` (1 real second = 10 game-minutes = 1/6 game-hour per second)
- **Hunger:** +100/3600 ≈ 0.0278 per real second (0 → 100 in 60 min)
- **Fatigue:** +100/3600 ≈ 0.0278 per real second (0 → 100 in 60 min)
- **Happiness:** −100/7200 ≈ 0.0139 per real second (100 → 0 in 120 min, safe past the lifetime)
- **Age:** +100/3600 game-hours per real second (= 10 game-min/sec; 0 → 100 in 60 min)
- **Health:** drops 1 HP every 6 real minutes while alive

## Visual Direction

- Bob sprite: shrimp character, friendly
- Background: aquarium (gradient blue, animated bubbles)
- UI: progress bars for each stat
- Age counter (in game-hours)

## Tech Constraints

- **Pure client-side JavaScript** — no backend, no serverless functions
- **GitHub Pages** hosting (static)
- **localStorage** for save/load
- **No build step** initially (vanilla JS in `<script>` tags, ES modules)

## Out of Scope (for v1)

- Multiplayer
- Account system / cloud save
- Sound / music
- Multiple pet types
- Mobile-optimized (desktop-first; should still work on mobile)

## Economy (added in v2, ~2026)

- **Coins** earned by playing minigames:
  - 🪰 Catch the Flies: **1 🪙 per 25** caught
  - 🎯 Shooting Gallery: **2 🪙 per 15** landed
- **Per-minigame session cap: 100 coins** — the game ends itself and flushes when the cap is hit so you can't farm past it in one run.
- **Shop** with 7 items across two categories:
  - **Cosmetics** (equip, +1 happiness/hr passive while worn): 🎾 Шарик (10), 🧸 Осьминог (30), 👑 Корона (60), 🎀 Бабочка (35)
  - **Food** (eat for one-shot stat effects): 🍰 Торт (10, -20 hunger / +10 happiness), 🥩 Стейк (5, -10 hunger), 🍖 Пир (100, -40 hunger / +25 happiness)
- **Inventory strip** under the action buttons: equipped slot + count of cosmetics + count of food.
- **Bob is now a hand-drawn SVG** (`assets/bob.svg`) instead of the 🦐 emoji.
- New **🤚 Pet** action: low-cost happiness boost (+18, +3 fatigue, no aging).
- Save migrated automatically from v1 (no `coins` field → `0`, no `inventory` → `[]`).
