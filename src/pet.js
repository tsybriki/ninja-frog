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

export function tick(pet, deltaSec) {
  if (!pet.alive) return pet;

  pet.stats.hunger    = clamp(pet.stats.hunger    + DECAY.hunger    * deltaSec, 0, 100);
  pet.stats.fatigue   = clamp(pet.stats.fatigue   + DECAY.fatigue   * deltaSec, 0, 100);
  pet.stats.happiness = clamp(pet.stats.happiness - DECAY.happiness * deltaSec, 0, 100);
  pet.age             = pet.age + DECAY.age * deltaSec;

  // Health drops if hunger, fatigue or happiness are critical
  const critical = (pet.stats.hunger >= 90) || (pet.stats.fatigue >= 90) || (pet.stats.happiness <= 10);
  if (critical) {
    pet.stats.health = clamp(pet.stats.health - 5 * deltaSec, 0, 100);
  }

  // Death checks
  if (pet.age >= MAX_AGE) {
    pet.alive = false;
    pet.causeOfDeath = 'old-age';
  } else if (pet.stats.health <= 0) {
    pet.alive = false;
    pet.causeOfDeath = 'sickness';
  }

  return pet;
}

// --- Actions ---

export function feed(pet) {
  if (!pet.alive) return pet;
  pet.stats.hunger = clamp(pet.stats.hunger - 30, 0, 100);
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
  pet.age = Math.min(pet.age + 1, MAX_AGE);
  return pet;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
