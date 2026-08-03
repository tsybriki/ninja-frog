// src/pet.js — Bob the Shrimp model

export const TICK_SPEED = 25; // 1 real second = 25 game-minutes
export const MAX_AGE = 100;   // game-hours

export const DECAY = {
  hunger:    25 / 60,   // per real second
  fatigue:   25 / 60,
  happiness: 12.5 / 60,
  age:       25 / 60,   // game-hours per real second
};

export function createPet() {
  const now = Date.now();
  return {
    name: 'Bob',
    bornAt: now,
    lastTickAt: now,
    age: 0,
    stats: {
      health: 100,
      hunger: 0,
      fatigue: 0,
      happiness: 100,
    },
    alive: true,
    causeOfDeath: null,
  };
}

// Critical threshold: stat is "bad" when:
//   - hunger >= CRIT (very hungry)
//   - fatigue >= CRIT (very tired)
//   - happiness <= 100 - CRIT (very sad)
//
// (Kept for status text / sprite mood in ui.js — no longer damages health,
// because the health bar is now bound to remaining life = MAX_AGE - age.)
const CRIT = 70;

export function tick(pet, deltaSec) {
  if (!pet.alive) return pet;

  pet.stats.hunger    = clamp(pet.stats.hunger    + DECAY.hunger    * deltaSec, 0, 100);
  pet.stats.fatigue   = clamp(pet.stats.fatigue   + DECAY.fatigue   * deltaSec, 0, 100);
  pet.stats.happiness = clamp(pet.stats.happiness - DECAY.happiness * deltaSec, 0, 100);
  pet.age             = pet.age + DECAY.age * deltaSec;

  // Death checks
  if (pet.age >= MAX_AGE) {
    pet.alive = false;
    pet.causeOfDeath = 'old-age';
  }

  return pet;
}

// --- Actions ---

// Threshold: if hunger is already below this when we feed, it's overfeeding
const OVERFEED_HUNGER_THRESHOLD = 5;
// Game-hours stolen from Bob's life on overfeed
const OVERFEED_AGE_PENALTY = 5;

export function feed(pet) {
  if (!pet.alive) return pet;

  // Detect overfeeding BEFORE applying the hunger reduction:
  // if the pet is already mostly full, feeding again costs life-years.
  if (pet.stats.hunger <= OVERFEED_HUNGER_THRESHOLD) {
    pet.age = Math.min(MAX_AGE, pet.age + OVERFEED_AGE_PENALTY);
    if (pet.age >= MAX_AGE) {
      pet.alive = false;
      pet.causeOfDeath = 'overfed';
    }
    return pet;
  }

  pet.stats.hunger    = clamp(pet.stats.hunger    - 30, 0, 100);
  pet.stats.fatigue   = clamp(pet.stats.fatigue   + 10, 0, 100);
  return pet;
}

export function sleep(pet) {
  if (!pet.alive) return pet;
  pet.stats.fatigue = clamp(pet.stats.fatigue - 50, 0, 100);
  pet.age = Math.min(pet.age + 1, MAX_AGE); // sleeping costs 1 game-hour
  return pet;
}

export function play(pet) {
  if (!pet.alive) return pet;
  pet.stats.happiness = clamp(pet.stats.happiness + 25, 0, 100);
  pet.stats.fatigue   = clamp(pet.stats.fatigue   + 5, 0, 100);
  pet.stats.hunger    = clamp(pet.stats.hunger    + 10, 0, 100);
  pet.age = Math.min(pet.age + 1, MAX_AGE);
  return pet;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
