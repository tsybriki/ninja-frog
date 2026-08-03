// src/sickness.js — random misfortune events

// Tunables
export const SICKNESS_MIN_INTERVAL_MS = 15_000;
export const SICKNESS_MAX_INTERVAL_MS = 15_000;
export const SICKNESS_DAMAGE_MIN = 3;
export const SICKNESS_DAMAGE_MAX = 10;
export const SICKNESS_IMMUNITY_MS = 4_000;

// Vibration patterns per event type
const VIBRATION_PATTERNS = {
  hunger:    100,               // short blip
  happiness: [80, 60, 80],      // double tap
  health:    [60, 40, 60, 40, 60], // urgent triple
};

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function pickEventType() {
  // 3-way equal chance; switch this array to reweight later
  return ['hunger', 'happiness', 'health'][Math.floor(Math.random() * 3)];
}

function pickDamage() {
  return Math.floor(rand(SICKNESS_DAMAGE_MIN, SICKNESS_DAMAGE_MAX + 1));
}

function vibrate(pattern) {
  // Only vibrate when tab is active AND API is supported.
  // Vibration in background tabs is silently ignored anyway, but checking
  // explicitly avoids unnecessary work and keeps things deterministic.
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
    const amount = pickDamage();

    if (type === 'hunger') {
      pet.stats.hunger = Math.min(100, pet.stats.hunger + amount);
    } else if (type === 'happiness') {
      pet.stats.happiness = Math.max(0, pet.stats.happiness - amount);
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
    const delay = rand(SICKNESS_MIN_INTERVAL_MS, SICKNESS_MAX_INTERVAL_MS);
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