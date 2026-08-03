// src/sickness.js — random misfortune events

// Fixed-amount event: every 15s one of three things happens to Bob:
//   - health  -5
//   - hunger  +5
//   - fatigue +5

// Tunables
export const SICKNESS_INTERVAL_MS = 15_000;
export const SICKNESS_AMOUNT = 5;
export const SICKNESS_IMMUNITY_MS = 4_000;

// Vibration patterns per event type
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
 * @param {(remainingMs: number) => void} [onTick] optional: fires every second
 *        with the ms remaining until the next event (useful for debug HUD)
 */
export function startSicknessLoop(pet, onEvent, onTick) {
  let timerId = null;
  let immuneUntil = 0;
  let nextFireAt = Date.now() + SICKNESS_INTERVAL_MS;
  let countdownTimerId = null;

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
    nextFireAt = Date.now() + SICKNESS_INTERVAL_MS;
    timerId = setTimeout(fire, SICKNESS_INTERVAL_MS);
  }

  scheduleNext();

  // 1Hz countdown so the UI can show "next event in Ns"
  if (typeof onTick === 'function') {
    countdownTimerId = setInterval(() => {
      const remaining = Math.max(0, nextFireAt - Date.now());
      onTick(remaining);
    }, 1000);
  }

  return {
    stop() {
      if (timerId !== null) clearTimeout(timerId);
      if (countdownTimerId !== null) clearInterval(countdownTimerId);
      timerId = null;
      countdownTimerId = null;
    },
  };
}