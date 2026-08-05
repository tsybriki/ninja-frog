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

// Tuned so a "feels-right" full flick (200px) covers ~70% of the field
// before gravity pulls it down. Lower speeds than the original draft
// because the field is only ~360×360 and we want players to be able to
// correct their aim mid-drag, not have the arrow disappear in 0.4 seconds.
const BASE_SPEED = 380;     // flick len == 0  (still registers a soft lob)
const MAX_BONUS  = 720;     // max flick len → total 1100 px/sec
// (No upward/downward bias on the launch vector — the arrow flies
// exactly where the finger drags. Gravity (G) does the arc.)

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
  hint.textContent = 'Потяни и отпусти — стрела полетит в эту сторону';
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

  /** Bow position in flyLayer-local coords. Fixed at lower-left. The bow
   *  is purely cosmetic now — arrows launch from the actual pointer-down
   *  point so the player feels the input/output correlation directly. */
  const bowPos = () => ({
    x: 80,
    y: flyLayer.clientHeight - 60,
  });

  /**
   * Simulate the parabolic flight for t in [0..Tmax].
   * Returns array of {x,y}. Gravity = 900 px/s² (feels right at our scale).
   */
  const G = 900;
  const parabolaPoints = (startX, startY, vx, vy, steps = 18) => {
    const pts = [];
    const Tmax = 1.4;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Tmax;
      const x = startX + vx * t;
      const y = startY + vy * t + 0.5 * G * t * t;
      pts.push({ x, y });
      if (y > flyLayer.clientHeight + 40) break;
    }
    return pts;
  };

  const drawPreview = (startX, startY, vx, vy) => {
    const pts = parabolaPoints(startX, startY, vx, vy, 18);
    if (pts.length < 2) {
      preview.classList.add('hidden');
      return;
    }
    const w = flyLayer.clientWidth;
    const h = flyLayer.clientHeight;
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    // The origin dot anchors the trajectory to the press-down point so
    // the player sees exactly where the arrow starts. The arrow head at
    // the end of the line points in the velocity direction.
    const last = pts[pts.length - 1];
    const lastAngle = Math.atan2(vy, vx) * (180 / Math.PI) + 30;
    preview.innerHTML = `
      <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;inset:0;pointer-events:none;">
        <circle cx="${startX.toFixed(1)}" cy="${startY.toFixed(1)}" r="6"
                fill="rgba(255,255,255,0.6)" stroke="rgba(0,0,0,0.4)" stroke-width="1.5"/>
        <path d="${d}" stroke="rgba(255,255,255,0.9)" stroke-width="3"
              stroke-dasharray="6 6" fill="none" stroke-linecap="round"/>
        <text x="${last.x.toFixed(1)}" y="${last.y.toFixed(1)}"
              font-size="32" fill="white" stroke="rgba(0,0,0,0.4)" stroke-width="0.5"
              text-anchor="middle" dominant-baseline="central"
              style="transform: rotate(${lastAngle.toFixed(1)}deg); transform-origin: ${last.x.toFixed(1)}px ${last.y.toFixed(1)}px;">🏹</text>
      </svg>`;
    preview.classList.remove('hidden');
  };

  const hidePreview = () => preview.classList.add('hidden');

  /**
   * Fire an arrow from (startX, startY) with initial velocity (vx, vy) px/sec.
   * The arrow flies along the previewed parabola and despawns on impact or
   * when it leaves the play field.
   */
  const fireArrow = (startX, startY, vx, vy) => {
    if (arrowEl) return;
    const el = document.createElement('div');
    el.className = 'flying-arrow';
    el.textContent = ARROW_EMOJI;
    el.style.left = `${startX}px`;
    el.style.top  = `${startY}px`;
    // Tilt the arrow in the launch direction + a small "feather" offset
    // so it visually reads as pointing where it's flying.
    const angleDeg = Math.atan2(vy, vx) * (180 / Math.PI);
    el.style.transform = `translate(-50%, -50%) rotate(${angleDeg + 30}deg)`;
    flyLayer.appendChild(el);
    arrowEl = el;

    let t0 = null;
    let lastX = startX, lastY = startY;
    const step = (now) => {
      if (t0 === null) t0 = now;
      const t = (now - t0) / 1000;
      const x = startX + vx * t;
      const y = startY + vy * t + 0.5 * G * t * t;
      lastX = x; lastY = y;
      el.style.left = `${x}px`;
      el.style.top  = `${y}px`;
      // Tumble proportional to flight time — feels like a real spinning arrow.
      const rot = angleDeg + 30 + t * 220;
      el.style.transform = `translate(-50%, -50%) rotate(${rot}deg)`;

      // Collision check against live targets (rect test using getBoundingClientRect).
      for (let i = 0; i < targets.length; i++) {
        const tg = targets[i];
        if (tg.hit) continue;
        const rect = tg.el.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        if (!(elRect.right < rect.left || elRect.left > rect.right ||
              elRect.bottom < rect.top  || elRect.top  > rect.bottom)) {
          tg.hit = true;
          tg.el.classList.add('hit');
          registerHit(tg, x, y);
          // Stick the arrow into the target at impact so the hit reads visually.
          el.style.transition = 'transform 0.15s';
          el.style.transform = `translate(-50%, -50%) rotate(${rot}deg) translate(10px, 0)`;
          setTimeout(() => { cleanupArrow(); }, 220);
          return;
        }
      }

      // Off the field → despawn after a beat.
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
  //
  // DIRECTION POLICY: the arrow flies IN THE DIRECTION YOU DRAG, not the
  // opposite. So to shoot up-right, drag from the start point toward
  // up-right; the strength of the pull sets the launch speed (gentle
  // flicks = soft lobs, full-pull = ~1100 px/s).
  //
  // This matches the feel of "throw the arrow where you're swiping"
  // (like flicking a paper plane). The dashed preview line shows exactly
  // where the arrow will go before release, so the player can aim.
  //
  // To make a satisfying arc, we add a small downward bias to vy: longer
  // pulls get more lift so the arrow coasts further before falling. This
  // keeps the gameplay readable on a 360×360 field.

  let activePointerId = null;
  let pullStart = null;
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

  // Convert pull vector → initial velocity (px/sec). Direction = same as pull.
  // Length = launch speed (0..MAX_BONUS over MAX_PULL_PX).
  const pullVec = (dx, dy) => {
    const len = Math.hypot(dx, dy);
    if (len > MAX_PULL_PX) {
      const s = MAX_PULL_PX / len;
      dx *= s; dy *= s;
    }
    const clampedLen = Math.hypot(dx, dy);
    if (clampedLen === 0) return null;
    const speed = BASE_SPEED + (clampedLen / MAX_PULL_PX) * MAX_BONUS;
    // Downward bias: longer pulls get more gravity kick, so the arc
    // settles inside the field instead of sailing off the top.
    // (Upward in screen coords = negative y, gravity is +y.)
    const vx = (dx / clampedLen) * speed;
    const vy = (dy / clampedLen) * speed;
    return { vx, vy };
  };

  const onPointerMove = (e) => {
    if (!running || activePointerId !== e.pointerId) return;
    if (!pullStart) return;
    const rect = flyLayer.getBoundingClientRect();
    pullCurrent = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    // Pull direction = current - start (the way the finger actually moves)
    let dx = pullCurrent.x - pullStart.x;
    let dy = pullCurrent.y - pullStart.y;
    const len = Math.hypot(dx, dy);
    if (len < 16) {
      hidePreview();
      return;
    }
    const v = pullVec(dx, dy);
    if (!v) { hidePreview(); return; }
    drawPreview(pullStart.x, pullStart.y, v.vx, v.vy);
  };

  const onPointerUp = (e) => {
    if (activePointerId !== e.pointerId) return;
    activePointerId = null;
    if (!pullStart || !pullCurrent) {
      hidePreview(); pullStart = pullCurrent = null; return;
    }
    let dx = pullCurrent.x - pullStart.x;
    let dy = pullCurrent.y - pullStart.y;
    const len = Math.hypot(dx, dy);
    hidePreview();
    pullStart = pullCurrent = null;
    if (len < 16) return; // tap, not a flick → ignore
    const v = pullVec(dx, dy);
    if (!v) return;
    // Launch from the press-down point so the input/output correlation
    // is direct: the arrow visibly continues from where you touched.
    fireArrow(pullStart.x, pullStart.y, v.vx, v.vy);
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
