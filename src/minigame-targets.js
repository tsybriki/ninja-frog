// src/minigame-targets.js — Shooting Gallery minigame.
//
// Targets pop up at random positions inside the play field. Tap/click to
// shoot them. Each landed shot earns coins via economy.addShots.
//
// Scoring: 2 coins per 15 landed shots (rate lives in economy.RATES.shots).
// Cap: SESSION_COIN_CAP total coins — the game ends itself once that
// threshold is reached, so the player can't farm past the cap in one run.

import { makeContainer } from './minigames.js';
import { addShots, pendingCoins, wouldEarnOnClose, SESSION_COIN_CAP } from './economy.js';

const TARGET_EMOJI  = '🎯';
const TARGET_LIFETIME_MS = 1500;  // how long a target stays before vanishing
const SPAWN_MIN_MS  = 350;
const SPAWN_MAX_MS  = 800;
const TIME_LIMIT_MS = 2 * 60 * 1000; // 2 game-minutes real-time, mirrors flies minigame

export function createTargetsGame(onScoreChange, onHit) {
  const container = makeContainer();
  let shots = 0;
  let totalSpawned = 0;
  let running = false;
  let startTs  = 0;

  let spawnTimer = null;
  let tickTimer  = null;
  let petRef = null;
  const targets = []; // {el, born, hit}

  // HUD: score + coins (will be updated reactively)
  const scoreEl = document.createElement('div');
  scoreEl.className = 'minigame-score';
  scoreEl.textContent = '🎯 0';
  container.appendChild(scoreEl);

  const coinsEl = document.createElement('div');
  coinsEl.className = 'minigame-score';
  coinsEl.style.top     = '40px';
  coinsEl.style.left    = '8px';
  coinsEl.style.background = 'rgba(255, 193, 7, 0.85)';
  coinsEl.textContent = `🪙 0 / ${SESSION_COIN_CAP}`;
  container.appendChild(coinsEl);

  const timerEl = document.createElement('div');
  timerEl.className = 'minigame-score';
  timerEl.style.top     = '72px';
  timerEl.style.left    = '8px';
  timerEl.style.background = 'rgba(0, 0, 0, 0.4)';
  timerEl.textContent = '⏱ 2:00';
  container.appendChild(timerEl);

  const hint = document.createElement('div');
  hint.className = 'minigame-hint';
  hint.textContent = 'Кликай по мишеням — попадай!';
  container.appendChild(hint);

  const flyLayer = document.createElement('div');
  flyLayer.className = 'minigame-fly-layer';
  container.appendChild(flyLayer);

  // --- helpers -----------------------------------------------------------

  const updateHud = () => {
    scoreEl.textContent = `🎯 ${shots}`;
    const current = petRef ? wouldEarnOnClose(petRef) : 0;
    coinsEl.textContent = `🪙 ${current} / ${SESSION_COIN_CAP}`;

    if (running && startTs) {
      const elapsed = Date.now() - startTs;
      const remain = Math.max(0, TIME_LIMIT_MS - elapsed);
      const mm = Math.floor(remain / 60000);
      const ss = Math.floor((remain % 60000) / 1000);
      timerEl.textContent = `⏱ ${mm}:${String(ss).padStart(2, '0')}`;
    }
  };

  const spawnTarget = () => {
    if (!running) return;
    const rect = flyLayer.getBoundingClientRect();
    // Keep the target inside [40, w-40] × [40, h-40] so it's always tappable.
    const sz = 48;
    const x = sz + Math.random() * Math.max(1, rect.width  - 2 * sz);
    const y = sz + Math.random() * Math.max(1, rect.height - 2 * sz);
    const el = document.createElement('div');
    el.className = 'minigame-target';
    el.style.left = `${x}px`;
    el.style.top  = `${y}px`;
    el.textContent = TARGET_EMOJI;
    const obj = { el, born: Date.now(), hit: false };
    targets.push(obj);
    flyLayer.appendChild(el);
    totalSpawned += 1;

    el.addEventListener('pointerdown', (e) => {
      if (!running) return;
      e.stopPropagation();
      if (obj.hit) return;
      obj.hit = true;
      el.classList.add('hit');
      shots += 1;
      // Economy
      if (petRef && petRef.alive) {
        addShots(petRef, 1);
        onHit && onHit({ shots, totalSpawned });
      }
      onScoreChange && onScoreChange(shots);
      updateHud();
      // Remove after the hit animation
      setTimeout(() => {
        el.remove();
        const idx = targets.indexOf(obj);
        if (idx >= 0) targets.splice(idx, 1);
      }, 220);

      // Cap check: if we've earned the maximum, end the game.
      if (petRef && petRef.alive && wouldEarnOnClose(petRef) >= SESSION_COIN_CAP) {
        // 100ms delay so the hit animation is visible
        setTimeout(() => stop({ reason: 'cap' }), 120);
      }
    });

    // Lifetime expiry: target despawns (player missed)
    setTimeout(() => {
      if (!running) return;
      if (obj.hit) return;
      el.classList.add('escaped');
      setTimeout(() => {
        el.remove();
        const idx = targets.indexOf(obj);
        if (idx >= 0) targets.splice(idx, 1);
      }, 250);
    }, TARGET_LIFETIME_MS);
  };

  const scheduleNextSpawn = () => {
    if (!running) return;
    spawnTarget();
    const wait = SPAWN_MIN_MS + Math.random() * (SPAWN_MAX_MS - SPAWN_MIN_MS);
    spawnTimer = setTimeout(scheduleNextSpawn, wait);
  };

  const stop = ({ reason = 'time' } = {}) => {
    if (!running) return;
    running = false;
    if (spawnTimer) { clearTimeout(spawnTimer); spawnTimer = null; }
    if (tickTimer)  { clearInterval(tickTimer); tickTimer = null; }
    targets.forEach((t) => t.el.remove());
    targets.length = 0;

    // Bubble a "game over" event so main.js can flush coins + show the alert.
    container.dispatchEvent(new CustomEvent('minigame-end', {
      detail: { reason, shots, totalSpawned },
    }));
  };

  return {
    container,
    setPet: (p) => { petRef = p; },
    start: () => {
      running = true;
      shots = 0;
      totalSpawned = 0;
      startTs = Date.now();
      updateHud();
      scheduleNextSpawn();
      // 1Hz timer HUD update + 2-minute hard timeout
      tickTimer = setInterval(() => {
        updateHud();
        if (running && Date.now() - startTs >= TIME_LIMIT_MS) {
          stop({ reason: 'time' });
        }
      }, 250);
      return 0;
    },
    stop: () => stop({ reason: 'manual' }),
  };
}
