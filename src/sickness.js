// src/sickness.js — random misfortune events

// Fixed-amount event: every 15s one of three things happens to Bob:
//   - health  -5
//   - hunger  +5
//   - fatigue +5
//
// Phone vibrates with a type-specific pattern (short / double / triple)
// and a floating "-5" / "+5" indicator pops above Bob so the player
// sees what just happened.

// Tunables
export const SICKNESS_INTERVAL_MS = 15_000;
export const SICKNESS_AMOUNT = 5;
export const SICKNESS_IMMUNITY_MS = 4_000;

// Vibration patterns per event type
const VIBRATION_PATTERNS = {
  health:  100,                    // short blip
  hunger:  [80, 60, 80],           // double tap
  fatigue: [60, 40, 60, 40, 60],   // urgent triple
};

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function pickEventType() {
  return ['health', 'hunger', 'fatigue'][Math.floor(Math.random() * 3)];
}

function vibrate(pattern) {
  // Only vibrate when tab is active AND API is supported.
  if (document.hidden) return;
  if (typeof navigator === 'undefined') return;
  if (typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch (_) {
    // some browsers throw if not user-gesture-initiated; swallow
  }
}

/**
 * Start the sickness loop.
 * @param {object} pet - mutable pet object
 * @param {(pet: object, event: {type:string, amount:number}) => void} onEvent
 *        called when an event fires (after stats are mutated, before render)
 * @returns {{ stop: () => void }} handle to cancel the loop
 */
export function startSicknessLoop(pet, onEvent) {
  let timerId = null;
  let immuneUntil = 0;

  function fire() {
    // Respect immunity window
    if (Date.now() < immuneUntil) {
      scheduleNext();
      return;
    }

    const type = pickEventType();
    const amount = SICKNESS_AMOUNT;

    if (type === 'hunger') {
      pet.stats.hunger = Math.min(100, pet.stats.hunger + amount);
    } else if (type === 'fatigue') {
      pet.stats.fatigue = Math.min(100, pet.stats.fatigue + amount);
    } else if (type === 'health') {
      pet.stats.health = Math.max(0, pet.stats.health - amount);
    }

    vibrate(VIBRATION_PATTERNS[type]);

    if (typeof onEvent === 'function') {
      onEvent(pet, { type, amount });
    }

    immuneUntil = Date.now() + SICKNESS_IMMUNITY_MS;
    scheduleNext();
  }

  function scheduleNext() {
    // Fixed interval for now; keep rand() so we can re-randomize later.
    const delay = SICKNESS_INTERVAL_MS;
    timerId = setTimeout(fire, delay);
  }

  scheduleNext();

  return {
    stop() {
      if (timerId !== null) clearTimeout(timerId);
      timerId = null;
    },
  };
}