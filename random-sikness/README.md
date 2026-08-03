# 🦐 Bob the Shrimp

A virtual pet game in your browser. Take care of Bob the shrimp — feed him, play with him, let him sleep — until he lives a full life (100 game-hours = 4 real-time minutes).

**Play it:** [https://tsybriki.github.io/ninja-frog/](https://tsybriki.github.io/ninja-frog/)

## How to play

- 🍤 **Feed** — lowers Bob's hunger
- 😴 **Sleep** — lowers Bob's fatigue (costs 1 game-hour)
- 🎾 **Play** — raises Bob's happiness (costs 1 game-hour)

Keep all four stats (health, hunger, fatigue, happiness) in the green zone, and Bob will live a full life of 100 game-hours.

## Project info

- **Type:** Single-player, pure client-side web app
- **Hosting:** GitHub Pages
- **Stack:** Vanilla HTML + CSS + JavaScript (ES modules), no build step, no dependencies
- **Save state:** localStorage

See [`docs/VISION.md`](docs/VISION.md) for the full design vision and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for technical details.

## Development

```bash
# Clone
git clone https://github.com/tsybriki/ninja-frog.git
cd ninja-frog

# Serve locally (any static server works)
python3 -m http.server 8000
# then open http://localhost:8000
```

## Credits

Game by Oleg and Ilia.
