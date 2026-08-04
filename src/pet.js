// src/pet.js — Bob the Shrimp model
//
// Game-time vs real-time:
//   A full Bob lifetime is exactly 1 real-time hour (3600 seconds).
//   MAX_AGE is 100 game-hours = 6000 game-minutes, so we run at
//     TICK_SPEED = 10 game-minutes per real-second  (6000 / 3600)
//   Equivalently, 1 game-hour = 6 real-time minutes.
//
// Decay rates are stated per real second and tuned so each stat still
// crosses from 0 to 100 over a full run (1 hour):
//   hunger     :  0 -> 100 in 1 hour  =  100/3600 ≈  25/900  per real second
//   fatigue    :  0 -> 100 in 1 hour  =  100/3600 ≈  25/900
//   happiness  :  drops from 100 to 0 in 2 hours = 12.5/900 per real sec
//                 (still safe past the normal lifetime — no cheesing)
//   age        :  0 -> 100 game-hours in 1 hour = 100/3600 game-hours/sec
//                                                     =   10/60 game-min/sec

export const TICK_SPEED = 10; // 1 real second = 10 game-minutes (1 game-hour per 6 real seconds)
export const MAX_AGE = 100;   // game-hours

export const DECAY = {
  hunger:    100 / 3600, // per real second (== 25 / 900)
  fatigue:   100 / 3600,
  happiness: 100 / 7200, // half the hunger rate → falls over ~2 hours
  age:       100 / 3600, // game-hours per real second == TICK_SPEED / 60
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
      // Random start so every run begins with a slightly different
      // "already in progress" feel: Bob shows up hungry and a bit tired.
      //   hunger:  [60..80] (int, inclusive of both ends)
      //   fatigue: [30..70] (int, inclusive of both ends)
      hunger:    randInt(60, 81),
      fatigue:   randInt(30, 71),
      happiness: 100,
    },
    alive: true,
    causeOfDeath: null,
    // --- Economy (added in v2) ---
    coins: 0,
    // Fractional coins earned in the active minigame session, flushed to
    // `coins` on close. Math.floor here means we only credit a whole coin
    // when the threshold (default 50 flies) is actually reached.
    coinsFraction: 0,
    inventory: [],          // [{ id, type: 'toy'|'cosmetic'|'food', name, emoji, price, obtainedAt, consumed? }]
    equipped: { cosmetic: null }, // currently worn cosmetic item id (string|null)
  };
}

// Random integer in [min, max) when called as randInt(60, 80) -> 60..79.
// Use min/max where max is one-past-the-end for easy inclusive ranges:
//   randInt(60, 81)  -> 60..80
//   randInt(30, 71)  -> 30..70
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

// Critical threshold: stat is "bad" when:
//   - hunger >= CRIT (very hungry)
//   - fatigue >= CRIT (very tired)
//   - happiness <= 100 - CRIT (very sad)
//
// (Kept for status text / sprite mood in ui.js — no longer damages health,
// because the health bar is now bound to remaining life = MAX_AGE - age.)
const CRIT = 70;

// Equipped cosmetic gives a tiny passive happiness bonus: +1 happiness
// per 1 game-hour (= every 1 / TICK_SPEED real seconds = 2.4s).
// Small enough that wearing the tiara ≠ immortality, noticeable over a run.
const EQUIPPED_HAPPINESS_PER_HOUR = 1;

export function tick(pet, deltaSec) {
  if (!pet.alive) return pet;

  pet.stats.hunger    = clamp(pet.stats.hunger    + DECAY.hunger    * deltaSec, 0, 100);
  pet.stats.fatigue   = clamp(pet.stats.fatigue   + DECAY.fatigue   * deltaSec, 0, 100);
  pet.stats.happiness = clamp(pet.stats.happiness - DECAY.happiness * deltaSec, 0, 100);
  pet.age             = pet.age + DECAY.age * deltaSec;

  // Cosmetic passive bonus (decoupled from gameplay so it doesn't break
  // the existing stat balance: 1h ≈ +1 happiness, max run is 100h).
  if (pet.equipped && pet.equipped.cosmetic) {
    pet.stats.happiness = clamp(
      pet.stats.happiness + EQUIPPED_HAPPINESS_PER_HOUR * (DECAY.age * deltaSec),
      0,
      100
    );
  }

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
// Game-minutes stolen from Bob's life on overfeed. Proportional to the new
// 1-hour lifetime: was 5 GAME-HOURS in the 4-minute build, now 30
// game-minutes (3 real-time minutes), so overfeeding still bites but doesn't
// nuke more than a quarter of his life in a single bad click.
const OVERFEED_AGE_PENALTY = 0.5;

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

// Petting is a low-cost, low-reward action: calms Bob down a little and
// makes him happy. Cheaper than feeding (no hunger trade-off), so it's the
// go-to when you're desperate but don't want to age Bob out.
//
// Knobs chosen so that 4 pets ≈ +1 unit of happiness on average but the
// happy stat can grow at a sustainable pace over a run.
const PET_HAPPINESS_GAIN = 18;   // each pet
const PET_FATIGUE_GAIN   = 3;    // petting tires him out just a tiny bit

export function pet_(pet) {
  if (!pet.alive) return pet;
  pet.stats.happiness = clamp(pet.stats.happiness + PET_HAPPINESS_GAIN, 0, 100);
  pet.stats.fatigue   = clamp(pet.stats.fatigue   + PET_FATIGUE_GAIN,   0, 100);
  return pet;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
