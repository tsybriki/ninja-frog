// src/minigame-flies.js — Catch the Flies!
// Flies appear around Bob, tap/click to catch them.
// No reward yet (per Oleg's request).

import { makeContainer } from './minigames.js';

const FLY_EMOJI = '🪰';
const FLY_LIFETIME_MS = 2500;   // how long a fly stays before it escapes
const SPAWN_MIN_MS = 400;
const SPAWN_MAX_MS = 900;
const CATCH_RADIUS_PX = 60;     // generous tap area

export function createFliesGame(onScoreChange) {
  const container = makeContainer();
  let score = 0;
  let running = false;
  let spawnTimer = null;
  let lastFrame = 0;
  let flies = []; // {el, x, y, born, dx, dy}
  let raf = null;
  let bobEl = null;

  const scoreEl = document.createElement('div');
  scoreEl.className = 'minigame-score';
  scoreEl.textContent = '🪰 0';
  container.appendChild(scoreEl);

  const flyLayer = document.createElement('div');
  flyLayer.className = 'minigame-fly-layer';
  container.appendChild(flyLayer);

  const hint = document.createElement('div');
  hint.className = 'minigame-hint';
  hint.textContent = 'Tap the flies!';
  container.appendChild(hint);

  // Reference to Bob's sprite so flies spawn around it
  // We grab it lazily because the page might not be ready
  const getBobRect = () => {
    if (!bobEl) bobEl = document.getElementById('bob-sprite');
    if (!bobEl) return null;
    const layerRect = flyLayer.getBoundingClientRect();
    const bobRect = bobEl.getBoundingClientRect();
    return {
      cx: bobRect.left + bobRect.width / 2 - layerRect.left,
      cy: bobRect.top  + bobRect.height / 2 - layerRect.top,
      w: bobRect.width,
      h: bobRect.height,
    };
  };

  const spawnFly = () => {
    const bob = getBobRect();
    if (!bob) return;
    const fly = document.createElement('div');
    fly.className = 'minigame-fly';
    fly.textContent = FLY_EMOJI;

    // Spawn in a ring around Bob, 80–180 px away
    const angle = Math.random() * Math.PI * 2;
    const dist  = 80 + Math.random() * 100;
    const x = bob.cx + Math.cos(angle) * dist;
    const y = bob.cy + Math.sin(angle) * dist;

    fly.style.left = `${x}px`;
    fly.style.top  = `${y}px`;

    const obj = {
      el: fly,
      x, y,
      dx: (Math.random() - 0.5) * 60,  // px/sec
      dy: (Math.random() - 0.5) * 60,
      born: performance.now(),
    };
    flies.push(obj);
    flyLayer.appendChild(fly);

    fly.addEventListener('pointerdown', (e) => {
      if (!running) return;
      e.stopPropagation();
      catchFly(obj);
    });
  };

  const catchFly = (fly) => {
    if (fly.el.classList.contains('caught')) return;
    fly.el.classList.add('caught');
    score += 1;
    scoreEl.textContent = `🪰 ${score}`;
    onScoreChange && onScoreChange(score);
    // Pop animation
    setTimeout(() => {
      fly.el.remove();
      flies = flies.filter(f => f !== fly);
    }, 250);
  };

  const animate = (now) => {
    if (!running) return;
    const dt = lastFrame ? (now - lastFrame) / 1000 : 0;
    lastFrame = now;
    const layerRect = flyLayer.getBoundingClientRect();

    for (let i = flies.length - 1; i >= 0; i--) {
      const f = flies[i];
      f.x += f.dx * dt;
      f.y += f.dy * dt;
      // bounce off walls
      if (f.x < 20 || f.x > layerRect.width  - 20) f.dx *= -1;
      if (f.y < 20 || f.y > layerRect.height - 20) f.dy *= -1;
      f.x = Math.max(20, Math.min(layerRect.width  - 20, f.x));
      f.y = Math.max(20, Math.min(layerRect.height - 20, f.y));
      f.el.style.left = `${f.x}px`;
      f.el.style.top  = `${f.y}px`;

      // escape after lifetime
      if (now - f.born > FLY_LIFETIME_MS) {
        f.el.classList.add('escaped');
        setTimeout(() => { f.el.remove(); }, 400);
        flies.splice(i, 1);
      }
    }

    raf = requestAnimationFrame(animate);
  };

  const scheduleNextSpawn = () => {
    if (!running) return;
    spawnFly();
    const wait = SPAWN_MIN_MS + Math.random() * (SPAWN_MAX_MS - SPAWN_MIN_MS);
    spawnTimer = setTimeout(scheduleNextSpawn, wait);
  };

  return {
    container,
    start: () => {
      running = true;
      score = 0;
      scoreEl.textContent = '🪰 0';
      lastFrame = 0;
      scheduleNextSpawn();
      raf = requestAnimationFrame(animate);
      return 0;
    },
    stop: () => {
      running = false;
      if (spawnTimer) { clearTimeout(spawnTimer); spawnTimer = null; }
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      flies.forEach(f => f.el.remove());
      flies = [];
    },
  };
}
