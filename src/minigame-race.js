// src/minigame-race.js — Racing! (first-person, manual gearbox).
//
// We sit behind the wheel of a car looking down a long road. The world
// scrolls past us; we have to dodge obstacles in the other two lanes by
// steering left/right, and manage the gearbox to keep the engine in its
// power band.
//
// Controls
//   ←/→  or A/D   — steer between lanes (left / centre / right)
//   W / Space     — gas (hold for full throttle)
//   S             — brake (or reverse, when stopped)
//   Q / E or Z/X  — shift up / down
//   R             — restart after Game Over
//
// Why a manual gearbox?  Three reasons:
//   1. It gives the player something to actively do during long stretches.
//   2. It makes acceleration feel physical — low gears launch you, high
//      gears are useless off the line.
//   3. The tachometer bouncing into the redline creates natural "almost
//      game over" moments without needing a separate failure state.
//
// The simulation is intentionally simple:
//   - speed is in arbitrary units (0..maxGearTopSpeed). We display km/h
//     for flavour but don't tie it to real physics.
//   - each gear has min/max effective speed. Below min the engine bogs
//     (accel drops to ~10%). Above max it rev-limits (no accel).
//   - the rpm bar is a function of (speed within gear). When the rpm
//     sits in the "red zone" (top 20%) for too long without shifting,
//     the engine starts to overheat → game over.
//   - colliding with a barrel ends the run. We DON'T allow steering
//     through — the whole point is choosing the right lane.
//
// Coin economy: distance travelled (meters, scaled from our unit/s) maps
// to coins via `addMeters`. Rate is 1 coin per 500 m (see economy.js).

import { makeContainer } from './minigames.js';
import { addMeters, wouldEarnOnClose, SESSION_COIN_CAP } from './economy.js';

// --- Tunables -----------------------------------------------------------

// 6-speed manual. Each entry: min/max speed (in our internal units, where
// 1 unit ≈ 1 km/h on the dash), max accel at this gear, and a label.
// Min speed isn't 0 — first gear bogs below 5 km/h, you have to slip
// the clutch (gas + shift up early) to get moving.
const GEARS = [
  { name: '1', min:   0, max:  45, accel: 22, decel: 30 }, // launch gear
  { name: '2', min:  20, max:  85, accel: 18, decel: 26 },
  { name: '3', min:  45, max: 130, accel: 15, decel: 22 },
  { name: '4', min:  80, max: 175, accel: 12, decel: 18 },
  { name: '5', min: 120, max: 220, accel:  9, decel: 14 },
  { name: '6', min: 160, max: 260, accel:  6, decel: 10 }, // cruise
];

const MAX_SPEED = GEARS[GEARS.length - 1].max;     // 260 km/h flavour
const FRICTION  = 4;                               // natural deceleration (km/h per second) when no gas

// Time the player can sit in the red zone before the engine blows.
// 3.5 s feels "you should have shifted already" without being unfair.
const RED_ZONE_LIMIT_MS = 3500;

// How fast steering moves the car between lanes (fraction of half-width
// per second). Smooth, never instant — feels like a heavy steering rack.
const STEER_RATE = 1.6;

// Obstacle spawning: every SPAWN_MIN..SPAWN_MAX ms, place a barrel in a
// random lane. Tighter interval as speed rises.
const SPAWN_MIN_MS = 700;
const SPAWN_MAX_MS = 1400;

// World scale: how many "metres" correspond to one internal speed-unit
// per second. We want ~10 km/h to feel like ~10 m/s, so 1 km/h = 1 m.
// (Since 1 km/h ≈ 0.278 m/s, this is actually 3.6× faster than real
// life, but it keeps the odometer rolling at a satisfying clip.)
const METRES_PER_UNIT = 1;

// --- Factory ------------------------------------------------------------

export function createRaceGame(onScoreChange, onMeter) {
  const container = makeContainer();

  let running      = false;
  let crashed      = false;
  let raf          = null;
  let lastFrame    = 0;
  let petRef       = null;

  // Driving state
  let speed        = 0;       // current km/h (== our internal speed units)
  let gear         = 1;       // 1..GEARS.length (index into GEARS + 1)
  let steerPos     = 0;       // -1 (left lane) .. 0 (centre) .. +1 (right lane)
  let steerTarget  = 0;       // what the player is pressing toward
  let throttle     = 0;       // 0..1, ramps while W/Space is held
  let braking      = false;   // true while S held
  let redZoneMs    = 0;       // accumulated ms in red zone

  // HUD state
  let distanceM    = 0;       // total metres travelled
  let topSpeed     = 0;       // highest speed reached this run

  // Obstacles: barrels in lanes, scrolling toward camera.
  // Each is { el, lane (-1/0/+1), z (0=horizon .. 1=camera), alive }
  let barrels      = [];
  let spawnTimer   = null;

  // Pre-compute a road-stripe pattern as a CSS gradient — no extra DOM.
  // The container becomes the world.

  // --- DOM construction ------------------------------------------------

  const road = document.createElement('div');
  road.className = 'race-road';
  container.appendChild(road);

  // Sky / horizon is painted via CSS background on the road itself.

  const obstacleLayer = document.createElement('div');
  obstacleLayer.className = 'race-obstacles';
  road.appendChild(obstacleLayer);

  const dash = document.createElement('div');
  dash.className = 'race-dash';
  road.appendChild(dash);

  // Steering wheel (decorative, turns with input)
  const wheel = document.createElement('div');
  wheel.className = 'race-wheel';
  wheel.textContent = '🎮'; // steering-wheel-like emoji stand-in
  dash.appendChild(wheel);

  // Speedometer
  const speedo = document.createElement('div');
  speedo.className = 'race-speedo';
  speedo.innerHTML = `
    <div class="race-speedo-num">0</div>
    <div class="race-speedo-unit">км/ч</div>
  `;
  dash.appendChild(speedo);

  // Tachometer (RPM bar)
  const tacho = document.createElement('div');
  tacho.className = 'race-tacho';
  tacho.innerHTML = `
    <div class="race-tacho-label">RPM</div>
    <div class="race-tacho-track">
      <div class="race-tacho-fill"></div>
      <div class="race-tacho-red"></div>
    </div>
    <div class="race-tacho-gear">N</div>
  `;
  dash.appendChild(tacho);

  // Gear indicator (separate big one near the steering wheel too)
  const gearIndicator = document.createElement('div');
  gearIndicator.className = 'race-gear-indicator';
  gearIndicator.textContent = '1';
  dash.appendChild(gearIndicator);

  // Distance / coins row (top of screen, separate from dash)
  const hud = document.createElement('div');
  hud.className = 'race-hud';
  hud.innerHTML = `
    <div class="race-hud-distance">📏 0 м</div>
    <div class="race-hud-coins">🪙 0 / ${SESSION_COIN_CAP}</div>
  `;
  container.appendChild(hud);

  // Hint
  const hint = document.createElement('div');
  hint.className = 'minigame-hint race-hint';
  hint.textContent = '←/→ руль · W газ · S тормоз · Q/E передачи';
  container.appendChild(hint);

  // Game-over overlay
  const gameOver = document.createElement('div');
  gameOver.className = 'race-gameover hidden';
  gameOver.innerHTML = `
    <div class="race-gameover-title">💥 Авария!</div>
    <div class="race-gameover-stats"></div>
    <button class="minigame-btn race-restart">Заново (R)</button>
  `;
  container.appendChild(gameOver);

  // --- Helpers ----------------------------------------------------------

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Convert current speed + gear into an rpm fraction in [0..1].
  // Each gear has a working window [min..max]; below min = 0.4 (bog),
  // above max = 1.0 (rev-limiter), linearly between.
  const rpmFraction = () => {
    const g = GEARS[gear - 1];
    const span = g.max - g.min;
    if (span <= 0) return 0;
    if (speed < g.min) {
      // Below min: rpm tapers down toward idle (0.3) the further below min we are.
      const below = (g.min - speed) / Math.max(1, g.min);
      return clamp(0.4 - below * 0.15, 0.15, 0.4);
    }
    if (speed >= g.max) return 1.0;
    return 0.4 + ((speed - g.min) / span) * 0.6;
  };

  const inRedZone = () => rpmFraction() >= 0.85;

  const updateDash = () => {
    const g = GEARS[gear - 1];
    speedo.querySelector('.race-speedo-num').textContent = Math.round(speed);
    gearIndicator.textContent = String(gear);
    tacho.querySelector('.race-tacho-gear').textContent = String(gear);
    const fill = tacho.querySelector('.race-tacho-fill');
    fill.style.width = `${(rpmFraction() * 100).toFixed(1)}%`;
    if (inRedZone()) fill.classList.add('red'); else fill.classList.remove('red');
    // Steering wheel rotation: -45deg (left) .. +45deg (right)
    wheel.style.transform = `translate(-50%, -50%) rotate(${(steerPos * 45).toFixed(1)}deg)`;
    hud.querySelector('.race-hud-distance').textContent = `📏 ${Math.floor(distanceM)} м`;
    const coins = petRef ? wouldEarnOnClose(petRef) : 0;
    hud.querySelector('.race-hud-coins').textContent = `🪙 ${coins} / ${SESSION_COIN_CAP}`;
  };

  // Lane x position as a fraction of half road-width.
  // -1 = left, 0 = centre, +1 = right.
  const laneX = (lane) => lane * 0.6;

  // World coordinate of a barrel given its lane + z (0=horizon .. 1=car).
  // We project z with a simple perspective: x_screen = laneX * (0.2 + z*0.8),
  // y_screen = horizon_y + (1 - z) * (cam_y - horizon_y).
  const horizonY = 0.30;  // fraction of container height
  const project = (lane, z) => {
    const w = road.clientWidth;
    const h = road.clientHeight;
    const cx = w / 2;
    const perspX = 0.18 + z * 0.82;        // barrels widen as they approach
    const x = cx + laneX(lane) * (w * 0.42 * perspX);
    const y = h * horizonY + (1 - z) * (h * (1 - horizonY - 0.18));
    return { x, y, scale: 0.35 + z * 0.85 };
  };

  const spawnBarrel = () => {
    // Pick a lane that's not the player's current lane (with a bias
    // toward "ahead" of the player so it has time to come into view).
    // We just pick random lane -1/0/+1 and let the player dodge.
    const lanes = [-1, 0, 1];
    const lane = lanes[Math.floor(Math.random() * 3)];
    const el = document.createElement('div');
    el.className = 'race-barrel';
    el.textContent = '🛢️';
    obstacleLayer.appendChild(el);
    barrels.push({ el, lane, z: 0, alive: true });
  };

  const scheduleNextSpawn = () => {
    if (!running) return;
    spawnBarrel();
    // Spawn faster at high speed so it doesn't feel like a freeway.
    const speedFactor = clamp(1 - speed / MAX_SPEED, 0.4, 1);
    const wait = (SPAWN_MIN_MS + Math.random() * (SPAWN_MAX_MS - SPAWN_MIN_MS)) * speedFactor;
    spawnTimer = setTimeout(scheduleNextSpawn, wait);
  };

  // --- Main loop --------------------------------------------------------

  const step = (now) => {
    if (!running) return;
    const dt = lastFrame ? (now - lastFrame) / 1000 : 0;
    lastFrame = now;
    const g = GEARS[gear - 1];

    // --- Throttle ramps up while W/Space is held.
    if (keys.has('gas')) {
      throttle = clamp(throttle + dt * 2.0, 0, 1);
    } else {
      throttle = clamp(throttle - dt * 4.0, 0, 1);
    }

    // --- Acceleration model
    let accel = 0;
    if (throttle > 0) {
      // Gas: only effective inside the gear's working window.
      // Below min: bog (10% accel). Above max: 0 (rev limiter).
      let factor;
      if (speed < g.min) factor = 0.1;
      else if (speed >= g.max) factor = 0;
      else {
        // Peak torque mid-range (40% of the window). Falls off toward both ends
        // so shifting is rewarded — you don't want to sit at the bottom OR the top.
        const t = (speed - g.min) / Math.max(1, g.max - g.min); // 0..1
        factor = 1 - Math.abs(t - 0.4) * 1.2;
        factor = clamp(factor, 0.15, 1);
      }
      accel += g.accel * factor * throttle;
    }

    // --- Brakes
    if (braking) {
      // Brake force scales with gear (higher gear = stronger brakes).
      accel -= g.decel * (speed > 0 ? 1 : 0.6);
    }

    // --- Friction (always there, even at idle throttle)
    if (speed > 0) accel -= FRICTION;
    if (speed < 0) accel += FRICTION; // rolling back from a stop

    // Apply acceleration (dt-scaled). Cap at gear max.
    speed += accel * dt;
    if (speed > g.max) speed = g.max;
    if (speed < -10)  speed = -10; // tiny reverse, not a real feature

    // --- Distance / coins
    if (speed > 0) {
      const metres = speed * METRES_PER_UNIT * dt;
      distanceM += metres;
      if (petRef && petRef.alive) {
        addMeters(petRef, metres);
        onMeter && onMeter({ distanceM });
      }
    }
    if (speed > topSpeed) topSpeed = speed;

    // --- Steering: smooth toward target. Clamp to [-1, +1].
    if (steerTarget < steerPos) {
      steerPos = Math.max(steerTarget, steerPos - STEER_RATE * dt);
    } else if (steerTarget > steerPos) {
      steerPos = Math.min(steerTarget, steerPos + STEER_RATE * dt);
    }

    // --- Engine heat: count ms in red zone
    if (inRedZone()) {
      redZoneMs += dt * 1000;
      if (redZoneMs >= RED_ZONE_LIMIT_MS) {
        endGame({ reason: 'overheat' });
        return;
      }
    } else {
      redZoneMs = Math.max(0, redZoneMs - dt * 500); // cool down faster than heat up
    }

    // --- Update barrels
    // Barrel z increases at a rate tied to player speed so they always
    // appear to approach at a pace that matches the odometer.
    const zRate = clamp(0.45 + (speed / MAX_SPEED) * 0.55, 0.45, 1.0); // z per second
    const playerLane = steerPos < -0.33 ? -1 : steerPos > 0.33 ? 1 : 0;
    for (let i = barrels.length - 1; i >= 0; i--) {
      const b = barrels[i];
      b.z += zRate * dt;
      if (b.z >= 1.05) {
        // Passed the camera — recycle.
        b.el.remove();
        barrels.splice(i, 1);
        continue;
      }
      const { x, y, scale } = project(b.lane, b.z);
      b.el.style.left = `${x.toFixed(1)}px`;
      b.el.style.top  = `${y.toFixed(1)}px`;
      b.el.style.fontSize = `${(scale * 56).toFixed(1)}px`;
      b.el.style.opacity = String(clamp(b.z * 1.1, 0, 1));
      // Collision: z > 0.7 (close to camera) AND same lane as player.
      // AABB on x is forgiving enough to feel fair.
      if (!crashed && b.z > 0.7 && b.lane === playerLane) {
        const halfW = (road.clientWidth * 0.42) * (0.18 + b.z * 0.82) * 0.35;
        const playerX = (road.clientWidth / 2) + steerPos * (road.clientWidth * 0.42 * 0.5);
        if (Math.abs(playerX - x) < halfW * 1.4) {
          crash();
          return;
        }
      }
    }

    // --- Road scroll: shift the dashed centre line via background-position.
    // We do this with a CSS animation toggle based on speed.
    road.style.setProperty('--scroll-px-per-sec', `${(120 + speed * 1.8).toFixed(0)}`);

    // --- Score / cap
    if (petRef && petRef.alive && wouldEarnOnClose(petRef) >= SESSION_COIN_CAP) {
      endGame({ reason: 'cap' });
      return;
    }

    onScoreChange && onScoreChange({ distanceM, topSpeed, gear, speed });
    updateDash();

    raf = requestAnimationFrame(step);
  };

  // --- Game state transitions ------------------------------------------

  const crash = () => {
    crashed = true;
    endGame({ reason: 'crash' });
  };

  const endGame = ({ reason }) => {
    if (!running) return;
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    if (spawnTimer) { clearTimeout(spawnTimer); spawnTimer = null; }
    barrels.forEach((b) => b.el.remove());
    barrels = [];

    // Show game-over panel with stats
    const stats = gameOver.querySelector('.race-gameover-stats');
    const reasonText = reason === 'crash'    ? '🛢️ Врезался в бочку'
                     : reason === 'overheat' ? '🔥 Двигатель перегрелся (слишком долго в красной зоне)'
                     : reason === 'cap'      ? '🏁 Лимит монет за сессию'
                     : '⏱ Время вышло';
    stats.innerHTML = `
      <div>${reasonText}</div>
      <div>📏 Дистанция: <strong>${Math.floor(distanceM)} м</strong></div>
      <div>🚀 Макс. скорость: <strong>${Math.round(topSpeed)} км/ч</strong></div>
    `;
    gameOver.classList.remove('hidden');
    container.dispatchEvent(new CustomEvent('minigame-end', {
      detail: { reason, distanceM, topSpeed },
    }));
  };

  const restart = () => {
    // Reset state
    speed = 0; gear = 1; steerPos = 0; steerTarget = 0;
    throttle = 0; braking = false; redZoneMs = 0;
    distanceM = 0; topSpeed = 0; crashed = false; lastFrame = 0;
    barrels.forEach((b) => b.el.remove());
    barrels = [];
    gameOver.classList.add('hidden');
    updateDash();
    running = true;
    scheduleNextSpawn();
    raf = requestAnimationFrame(step);
  };

  // --- Keyboard input ---------------------------------------------------

  const keys = new Set();
  const onKeyDown = (e) => {
    if (!running && !crashed) return;
    // Restart key works even after crash.
    if (e.code === 'KeyR') {
      if (crashed || !running) {
        e.preventDefault();
        restart();
        return;
      }
    }
    if (!running) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowleft'  || k === 'a') { steerTarget = -1; e.preventDefault(); }
    if (k === 'arrowright' || k === 'd') { steerTarget = +1; e.preventDefault(); }
    if (k === 'w' || k === ' ' || k === 'arrowup') { keys.add('gas'); e.preventDefault(); }
    if (k === 's' || k === 'arrowdown') { braking = true; e.preventDefault(); }
    if (k === 'q' || k === 'z' || k === 'e' || k === 'x') {
      // We treat both pairs as the same two actions: q/z = up, e/x = down.
      // (Common WASD layouts: Q is over A for shift-up, E over D for shift-down.)
      const up = (k === 'q' || k === 'z');
      const next = clamp(gear + (up ? 1 : -1), 1, GEARS.length);
      if (next !== gear) {
        // Don't allow upshift if current speed is below current gear's min
        // — you can't skip from 1st at 80 km/h straight into 3rd.
        // Actually that's a feature: skipping a gear is OK in most cars.
        // We just enforce: you can't downshift if it would over-rev.
        // (rpmFraction already shows red if you're over the next gear's max.)
        const ng = GEARS[next - 1];
        if (!up && speed > ng.max * 1.05) {
          // Downshifting into a gear whose max is way below current speed
          // would blow the engine. Reject.
          return;
        }
        gear = next;
        updateDash();
      }
      e.preventDefault();
    }
  };
  const onKeyUp = (e) => {
    const k = e.key.toLowerCase();
    if (k === 'w' || k === ' ' || k === 'arrowup') keys.delete('gas');
    if (k === 's' || k === 'arrowdown') braking = false;
    if (k === 'arrowleft'  || k === 'a') {
      if (steerTarget === -1) steerTarget = 0;
    }
    if (k === 'arrowright' || k === 'd') {
      if (steerTarget === +1) steerTarget = 0;
    }
  };

  const restartBtn = gameOver.querySelector('.race-restart');
  restartBtn.addEventListener('click', () => restart());

  // --- Public API ------------------------------------------------------

  return {
    container,
    setPet: (p) => { petRef = p; },
    start: () => {
      crashed = false;
      speed = 0; gear = 1; steerPos = 0; steerTarget = 0;
      throttle = 0; braking = false; redZoneMs = 0;
      distanceM = 0; topSpeed = 0; lastFrame = 0;
      barrels.forEach((b) => b.el.remove());
      barrels = [];
      gameOver.classList.add('hidden');
      updateDash();

      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup',   onKeyUp);

      running = true;
      scheduleNextSpawn();
      raf = requestAnimationFrame(step);
      return 0;
    },
    stop: () => {
      running = false;
      if (raf) cancelAnimationFrame(raf); raf = null;
      if (spawnTimer) { clearTimeout(spawnTimer); spawnTimer = null; }
      barrels.forEach((b) => b.el.remove());
      barrels = [];
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup',   onKeyUp);
    },
  };
}
