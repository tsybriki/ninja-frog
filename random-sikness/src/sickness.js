// src/sickness.js — random misfortune events

// Every 15s one of three things happens to Bob:
//   - health  -5   (old-age accelerated)
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

// How many game-hours one health-event steals from Bob's remaining life
export const SICKNESS_HEALTH_AGE_PENALTY_HOURS = 5;

const VIBRATION_PATTERNS = {
  health:  100,
  hunger:  [80, 60, 80],
  fatigue: [60, 40, 60, 40, 60],
};

function pickEventType() {
  return ['health', 'hunger', 'fatigue'][Math.floor(Math.random() * 3)];
}

function vibrate(pattern) {
  if (document.hidden) return;
  if (typeof navigator === 'undefined') return;
  if (typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch (_) {}
}

/**
 * Start the sickness loop.
 * @param {object} pet
 * @param {(pet: object, event: {type:string, amount:number}) => void} onEvent
 * @returns {{ stop: () => void }}
 */
export function startSicknessLoop(pet, onEvent) {
  let timerId = null;
  let immuneUntil = 0;

  function fire() {
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
      // "health" now means remaining-life — accelerate aging so the
      // health bar (bound to age) drops by a small slice.
      pet.age = Math.min(100, pet.age + SICKNESS_HEALTH_AGE_PENALTY_HOURS);
    }

    vibrate(VIBRATION_PATTERNS[type]);

    if (typeof onEvent === 'function') {
      onEvent(pet, { type, amount });
    }

    immuneUntil = Date.now() + SICKNESS_IMMUNITY_MS;
    scheduleNext();
  }

  function scheduleNext() {
    timerId = setTimeout(fire, SICKNESS_INTERVAL_MS);
  }

  scheduleNext();

  return {
    stop() {
      if (timerId !== null) clearTimeout(timerId);
      timerId = null;
    },
  };
}