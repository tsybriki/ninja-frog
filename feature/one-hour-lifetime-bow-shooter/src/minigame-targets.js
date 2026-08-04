// src/minigame-targets.js — Shooting Gallery (Bow / Slingshot style).
//
// You play as a bowman at the bottom of the play field. Targets pop up
// at random spots in the upper half. To shoot:
//   1. pointerdown anywhere on the field → start aiming (readies an arrow)
//   2. drag — pull AWAY from the targets (backwards/down). The trajectory
//      preview line shows where the arrow will fly.
//   3. pointerup → release. The arrow flies along the previewed parabola.
//
// Hits earn coins via economy.addShots. Cap (SESSION_COIN_CAP) auto-ends
// the game, same as before.
//
// Why pointerdown anywhere (not just on a bow)? Touch users would miss a
// tiny hit target. Treating the whole field as the drag surface (with the
// launch point pinned to the bow) is the standard Bowmasters pattern.

import { makeContainer } from './minigames.js';
import { addShots, wouldEarnOnClose, SESSION_COIN_CAP } from './economy.js';

const TARGET_EMOJI   = '🎯';
const ARROW_EMOJI    = '🏹';
const BOW_EMOJI      = '🏹';

const TARGET_LIFETIME_MS = 1800;     // a target stays this long if missed
const SPAWN_MIN_MS       = 600;
const SPAWN_MAX_MS       = 1300;
const TIME_LIMIT_MS      = 2 * 60 * 1000; // 2 real minutes per session

// Pull distance (px) that maps to MAX_PULL — anything past this is clamped.
const MAX_PULL_PX = 200;

// Tuned so a "feels-right" max-pull (200px) covers ~70% of the field
// height/width before arc-descending. Lower speeds than the original draft
// because the field is only ~360×360 and we want players to be able to
// correct their aim mid-drag, not have the arrow disappear in 0.4 seconds.
const BASE_SPEED = 380;     // pull == 0 px  (gentle tap = soft lob)
const MAX_BONUS = 720;      // pull == MAX_PULL_PX → total 1100 px/sec
const VY_LIFT    = 80;      // upward bias so even pure-horizontal pulls arc up

export function createTargetsGame(onScoreChange, onHit) {
  const container = makeContainer();
  let shots        = 0;
  let totalSpawned = 0;
  let running      = false;
  let startTs      = 0;

  let spawnTimer = null;
  let tickTimer  = null;
  let petRef = null;
  let arrowEl  = null;     // currently flying arrow
  let arrowAnim = null;    // rAF handle for the arrow flight
  const targets = [];      // {el, born, hit, x, y}

  // --- HUD ---
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
  hint.textContent = 'Зажми и потяни назад ↓ — отпусти, чтобы выстрелить';
  container.appendChild(hint);

  // --- Layers ---
  const flyLayer = document.createElement('div');
  flyLayer.className = 'minigame-fly-layer targets-field';
  container.appendChild(flyLayer);

  // Bow (lower-left fixed position). Using emoji 🏹 keeps us zero-asset.
  const bow = document.createElement('div');
  bow.className = 'bowman';
  bow.textContent = BOW_EMOJI;
  flyLayer.appendChild(bow);

  // Trajectory preview (dashed line + ghost arrow at the predicted end).
  // Created lazily when the user starts aiming.
  const preview = document.createElement('div');
  preview.className = 'bow-preview hidden';
  flyLayer.appendChild(preview);

  // --- Helpers ---

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

  /** Bow position in flyLayer-local coords. Fixed at bottom-left. */
  const bowPos = () => ({
    x: 80,
    y: flyLayer.clientHeight - 60,
  });

  /**
   * Simulate the parabolic flight for t in [0..1] (t=1 is "max range")
   * given the bow position and the launch vector (vx, vy) (px/sec).
   * Returns array of {x,y}. Gravity = 900 px/s² (feels right at our scale).
   */
  const G = 900;
  const parabolaPoints = (bx, by, vx, vy, steps = 16) => {
    const pts = [];
    // Estimate flight time so we land roughly at "the aim direction".
    // Use time proportional to a fixed feel-good range.
    const Tmax = 1.4;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Tmax;
      const x = bx + vx * t;
      const y = by + vy * t + 0.5 * G * t * t;
      pts.push({ x, y });
      // Stop when the arrow goes way off-screen or below the bow.
      if (y > flyLayer.clientHeight + 40) break;
    }
    return pts;
  };

  const drawPreview = (vx, vy) => {
    const { x: bx, y: by } = bowPos();
    const pts = parabolaPoints(bx, by, vx, vy, 18);
    if (pts.length < 2) {
      preview.classList.add('hidden');
      return;
    }
    // Render as SVG polyline so we get crisp dashed line + endpoints.
    const w = flyLayer.clientWidth;
    const h = flyLayer.clientHeight;
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    preview.innerHTML = `
      <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;inset:0;pointer-events:none;">
        <path d="${d}" stroke="rgba(255,255,255,0.85)" stroke-width="3"
              stroke-dasharray="6 6" fill="none" stroke-linecap="round"/>
      </svg>`;
    preview.classList.remove('hidden');
  };

  const hidePreview = () => preview.classList.add('hidden');

  /**
   * Fire an arrow with initial velocity (vx, vy) px/sec from the bow.
   * `onHit(targetIndex)` is called if it lands inside any live target.
   */
  const fireArrow = (vx, vy) => {
    if (arrowEl) return; // one arrow at a time
    const { x: bx, y: by } = bowPos();
    const el = document.createElement('div');
    el.className = 'flying-arrow';
    el.textContent = ARROW_EMOJI;
    el.style.left = `${bx}px`;
    el.style.top  = `${by}px`;
    // Tilt the arrow a bit in the launch direction
    const angleDeg = Math.atan2(vy, vx) * (180 / Math.PI);
    el.style.transform = `translate(-50%, -50%) rotate(${angleDeg + 30}deg)`;
    flyLayer.appendChild(el);
    arrowEl = el;

    let t0 = null;
    const step = (now) => {
      if (t0 === null) t0 = now;
      const t = (now - t0) / 1000;
      const x = bx + vx * t;
      const y = by + vy * t + 0.5 * G * t * t;
      el.style.left = `${x}px`;
      el.style.top  = `${y}px`;
      // Slight tumble for personality
      const rot = angleDeg + 30 + t * 180;
      el.style.transform = `translate(-50%, -50%) rotate(${rot}deg)`;

      // Collision check against live targets (cheap rect test).
      for (let i = 0; i < targets.length; i++) {
        const tg = targets[i];
        if (tg.hit) continue;
        const rect = tg.el.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        if (!(elRect.right < rect.left || elRect.left > rect.right ||
              elRect.bottom < rect.top  || elRect.top  > rect.bottom)) {
          // Hit!
          tg.hit = true;
          tg.el.classList.add('hit');
          registerHit(tg, x, y);
          // Stick the arrow into the target by nailing it at the impact point.
          el.style.transition = 'transform 0.15s';
          el.style.transform = `translate(-50%, -50%) rotate(${rot}deg) translate(8px, 0)`;
          setTimeout(() => { cleanupArrow(); }, 220);
          return;
        }
      }

      // Off the bottom of the field → miss, despawn after a beat.
      if (y > flyLayer.clientHeight + 40 || x > flyLayer.clientWidth + 40 || x < -40) {
        setTimeout(() => cleanupArrow(), 200);
        return;
      }
      arrowAnim = requestAnimationFrame(step);
    };
    arrowAnim = requestAnimationFrame(step);
  };

  const cleanupArrow = () => {
    if (arrowAnim) cancelAnimationFrame(arrowAnim);
    arrowAnim = null;
    if (arrowEl) { arrowEl.remove(); arrowEl = null; }
  };

  const registerHit = (target) => {
    shots += 1;
    totalSpawned += 1;
    onScoreChange && onScoreChange(shots);
    if (petRef && petRef.alive) {
      addShots(petRef, 1);
      onHit && onHit({ shots, totalSpawned });
    }
    updateHud();
    // Cap check: end the game as soon as we hit the per-session ceiling.
    if (petRef && petRef.alive && wouldEarnOnClose(petRef) >= SESSION_COIN_CAP) {
      setTimeout(() => stop({ reason: 'cap' }), 120);
    }
  };

  // --- Input handling (pointerdown anywhere → drag → release → fire) ---

  let activePointerId = null;
  let pullStart = null; // {x,y} where the user pressed down
  let pullCurrent = null;

  const onPointerDown = (e) => {
    if (!running) return;
    if (e.target && e.target.closest('.minigame-btn')) return; // don't fire from buttons
    if (arrowEl) return; // ignore second finger while an arrow is in flight
    flyLayer.setPointerCapture(e.pointerId);
    activePointerId = e.pointerId;
    const rect = flyLayer.getBoundingClientRect();
    pullStart = pullCurrent = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    hidePreview();
    e.preventDefault();
  };

  const onPointerMove = (e) => {
    if (!running || activePointerId !== e.pointerId) return;
    if (!pullStart) return;
    const rect = flyLayer.getBoundingClientRect();
    pullCurrent = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    // Pull vector = start - current (user pulls BACK, fires FORWARD)
    let dx = pullStart.x - pullCurrent.x;
    let dy = pullStart.y - pullCurrent.y;
    // Clamp pull length.
    const len = Math.hypot(dx, dy);
    if (len > MAX_PULL_PX) {
      const s = MAX_PULL_PX / len;
      dx *= s; dy *= s;
    }
    // Map pull magnitude → initial speed (px/sec). 0..MAX_PULL → BASE..BASE+MAX_BONUS.
    const pull = Math.hypot(dx, dy);
    const speed = BASE_SPEED + (pull / MAX_PULL_PX) * MAX_BONUS;
    // Launch direction = opposite of pull (so pulling back-down fires fwd-up)
    // but only if the pull is meaningful.
    if (pull < 16) {
      hidePreview();
      return;
    }
    const ux = -dx / pull;
    const uy = -dy / pull;
    const vx = ux * speed;
    // Slight upward bias so even a horizontal pull arcs nicely.
    const vy = uy * speed - VY_LIFT;
    drawPreview(vx, vy);
  };

  const onPointerUp = (e) => {
    if (activePointerId !== e.pointerId) return;
    activePointerId = null;
    if (!pullStart || !pullCurrent) {
      hidePreview(); pullStart = pullCurrent = null; return;
    }
    let dx = pullStart.x - pullCurrent.x;
    let dy = pullStart.y - pullCurrent.y;
    const len = Math.hypot(dx, dy);
    hidePreview();
    pullStart = pullCurrent = null;
    if (len < 16) return; // tap, not a pull → ignore
    if (len > MAX_PULL_PX) {
      const s = MAX_PULL_PX / len;
      dx *= s; dy *= s;
    }
    const pull = Math.hypot(dx, dy);
    const speed = BASE_SPEED + (pull / MAX_PULL_PX) * MAX_BONUS;
    const ux = -dx / pull;
    const uy = -dy / pull;
    const vx = ux * speed;
    const vy = uy * speed - VY_LIFT;
    fireArrow(vx, vy);
  };

  // --- Target spawning ---
  const spawnTarget = () => {
    if (!running) return;
    const rect = flyLayer.getBoundingClientRect();
    // Keep the target in the upper 70% of the field.
    const x = 80 + Math.random() * Math.max(1, rect.width - 160);
    const y = 60 + Math.random() * Math.max(1, rect.height * 0.55);
    const el = document.createElement('div');
    el.className = 'minigame-target';
    el.style.left = `${x}px`;
    el.style.top  = `${y}px`;
    el.textContent = TARGET_EMOJI;
    const obj = { el, x, y, born: Date.now(), hit: false };
    targets.push(obj);
    flyLayer.appendChild(el);

    // Auto-despawn after lifetime — counts as a "missed" target.
    setTimeout(() => {
      if (!running) return;
      if (obj.hit) return;
      obj.el.classList.add('escaped');
      totalSpawned += 1;
      setTimeout(() => {
        obj.el.remove();
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
    cleanupArrow();
    if (spawnTimer) { clearTimeout(spawnTimer); spawnTimer = null; }
    if (tickTimer)  { clearInterval(tickTimer); tickTimer = null; }
    targets.forEach((t) => t.el.remove());
    targets.length = 0;
    hidePreview();
    // Detach listeners so a stale modal doesn't keep them around.
    flyLayer.removeEventListener('pointerdown',   onPointerDown);
    flyLayer.removeEventListener('pointermove',   onPointerMove);
    flyLayer.removeEventListener('pointerup',     onPointerUp);
    flyLayer.removeEventListener('pointercancel', onPointerUp);

    container.dispatchEvent(new CustomEvent('minigame-end', {
      detail: { reason, shots, totalSpawned },
    }));
  };

  return {
    container,
    setPet: (p) => { petRef = p; },
    start: () => {
      running = true;
      shots   = 0;
      totalSpawned = 0;
      startTs = Date.now();
      updateHud();
      scheduleNextSpawn();
      // Attach input listeners
      flyLayer.addEventListener('pointerdown',   onPointerDown);
      flyLayer.addEventListener('pointermove',   onPointerMove);
      flyLayer.addEventListener('pointerup',     onPointerUp);
      flyLayer.addEventListener('pointercancel', onPointerUp);
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
