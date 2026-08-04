// src/economy.js — coins, shop, inventory.
//
// Single source of truth for the economy: every minigame that earns coins
// should call `addFlies(pet, n)` (or its sibling helpers) and let this
// module convert activity into coins, items, effects.
//
// The shape of `pet` is owned by pet.js; we mutate it in place (same
// convention as the rest of the game — see pet.js tick/play/feed).

// --- Catalog -------------------------------------------------------------

// Each item has:
//   id          - stable string, used in inventory
//   name        - human-readable, shown in UI
//   emoji       - displayed in shop grid and inventory
//   price       - whole coins in the shop
//   category    - 'cosmetic' (equippable) | 'food' (consumable on eat)
//
// Effects (only used by `eat()`):
//   hunger      - subtracted from pet.stats.hunger
//   happiness   - added    to pet.stats.happiness
//
// Effects on `equip()` (cosmetic only, passive via tick): see pet.js.
// We keep them cosmetic+visual here; the +1 happiness/hr passive is shared
// across all equipped cosmetics for simplicity.

export const CATALOG = [
  { id: 'toy_ball',   name: 'Шарик',         emoji: '🎾', price: 10, category: 'cosmetic' },
  { id: 'toy_octopus',name: 'Плюш. осьминог', emoji: '🧸', price: 30, category: 'cosmetic' },
  { id: 'crown',      name: 'Корона',        emoji: '👑', price: 60, category: 'cosmetic' },
  { id: 'bow',        name: 'Бабочка',       emoji: '🎀', price: 35, category: 'cosmetic' },

  { id: 'food_cake',  name: 'Торт',          emoji: '🍰', price: 10, category: 'food',
    effect: { hunger: -20, happiness: +10 } },
  { id: 'food_steak', name: 'Стейк',         emoji: '🥩', price:  5, category: 'food',
    effect: { hunger: -10, happiness:   0 } },
  { id: 'food_pie',   name: 'Пир',           emoji: '🍖', price:100, category: 'food',
    effect: { hunger: -40, happiness: +25 } },
];

export function findItem(id) {
  return CATALOG.find((it) => it.id === id) || null;
}

// --- Coin earning from minigames -----------------------------------------

// Each minigame activity maps to `coinActivity(pet, n)` -> a unitless integer
// (e.g. flies caught, shots landed). We then convert that into whole coins
// at the end of a session via `flushCoins()`. Balances live in one place
// so changing them in the future means editing two numbers.

// Activity -> coins.
//   flies  = flies caught
//   shots  = shots landed (hits in the targets minigame)
export const RATES = {
  flies: { perCoin: 25, coinsPerUnit: 1 / 25 }, // 1 coin per 25 flies
  shots: { perCoin: 15, coinsPerUnit: 2 / 15 }, // 2 coins per 15 shots landed
};

// Hard cap on coins earned in a single minigame session. Once pet.coinsFraction
// (or the shots tracker) would push the total above this, the minigame shuts
// itself down with a "лимит" alert. This keeps farming bounded and gives
// the next run some meaning.
export const SESSION_COIN_CAP = 100;

// Increment the fractional coin counter from a "flies caught" source.
// Returns { coinsEarned (this call), coinsTotal } — coinsEarned is 0 until flush.
export function addFlies(pet, count) {
  if (!pet || !pet.alive) return { coinsEarned: 0, coinsTotal: pet ? pet.coins : 0 };
  if (!Number.isFinite(count) || count <= 0) {
    return { coinsEarned: 0, coinsTotal: pet.coins };
  }
  pet.coinsFraction += count * RATES.flies.coinsPerUnit;
  return { coinsEarned: 0, coinsTotal: pet.coins };
}

// Increment from "shots landed" source. Identical to addFlies, just a
// different rate. Kept separate so minigame code reads as intent.
export function addShots(pet, count) {
  if (!pet || !pet.alive) return { coinsEarned: 0, coinsTotal: pet ? pet.coins : 0 };
  if (!Number.isFinite(count) || count <= 0) {
    return { coinsEarned: 0, coinsTotal: pet.coins };
  }
  pet.coinsFraction += count * RATES.shots.coinsPerUnit;
  return { coinsEarned: 0, coinsTotal: pet.coins };
}

// How many whole coins the player would earn if they closed the minigame
// right now (without flushing). Useful for UI ("🪙 37 / 100").
export function pendingCoins(pet) {
  if (!pet) return 0;
  return Math.floor(pet.coinsFraction || 0);
}

// Total coins already credited to the wallet this session + pending.
// Used by the minigame to enforce the cap.
export function wouldEarnOnClose(pet) {
  if (!pet) return 0;
  return Math.floor((pet.coins || 0) + Math.floor(pet.coinsFraction || 0));
}

// Move fractional coins → whole coins. Returns the integer just credited.
// Safe to call multiple times — only the integer part is flushed each call.
//
// Honours the per-session cap: we will NOT credit coins that would push the
// pet above SESSION_COIN_CAP *within* a session. Anything past the cap is
// silently kept in `coinsFraction` for the next session. (Players can still
// farm past the cap across sessions, which is intentional: the cap bounds
// a single minigame run, not lifetime earnings.)
//
// FP safety: 15 shots at rate 2/15 should give exactly 2 coins, but
// 15*(2/15) = 1.9999999... in IEEE 754. We add a tiny epsilon (1e-9) so
// `Math.floor` doesn't truncate a legitimate result. The epsilon is below
// any meaningful activity rate, so it can never push the floor UP by 1
// incorrectly.
const FP_EPSILON = 1e-9;
export function flushCoins(pet) {
  if (!pet) return 0;
  if (!Number.isFinite(pet.coinsFraction)) pet.coinsFraction = 0;
  let earned = Math.floor(pet.coinsFraction + FP_EPSILON);
  if (earned > 0) {
    const room = Math.max(0, SESSION_COIN_CAP - (pet.coins || 0));
    if (earned > room) earned = room;
    if (earned > 0) {
      pet.coins      = (pet.coins || 0) + earned;
      pet.coinsFraction -= earned;
      if (pet.coinsFraction < 0) pet.coinsFraction = 0;
    }
  }
  return earned;
}

// --- Shop ----------------------------------------------------------------

export function canAfford(pet, item) {
  return pet.alive && (pet.coins || 0) >= item.price;
}

// Move `item.price` coins out of the wallet and append a fresh inventory
// entry. Returns the new inventory entry, or null on failure.
export function buyItem(pet, item) {
  if (!pet || !pet.alive || !item) return null;
  if (!canAfford(pet, item)) return null;
  pet.coins -= item.price;
  const entry = {
    id: item.id,
    name: item.name,
    emoji: item.emoji,
    category: item.category,
    price: item.price,
    obtainedAt: Date.now(),
    consumed: false,
  };
  if (!Array.isArray(pet.inventory)) pet.inventory = [];
  pet.inventory.push(entry);
  return entry;
}

// --- Cosmetics: equip / unequip ------------------------------------------

// Returns the inventory entry that was equipped (or null if nothing changed).
export function equipCosmetic(pet, itemId) {
  if (!pet || !pet.alive) return null;
  if (!Array.isArray(pet.inventory)) return null;
  const entry = pet.inventory.find(
    (it) => it.id === itemId && it.category === 'cosmetic' && !it.consumed,
  );
  if (!entry) return null;
  pet.equipped = { ...(pet.equipped || {}), cosmetic: itemId };
  return entry;
}

export function unequipCosmetic(pet) {
  if (!pet) return;
  pet.equipped = { ...(pet.equipped || {}), cosmetic: null };
}

// --- Food: eat -----------------------------------------------------------

// Mutates stats, marks the entry consumed (so it can't be eaten twice).
// Returns the entry that was eaten, or null on failure.
export function eatFood(pet, itemId) {
  if (!pet || !pet.alive) return null;
  if (!Array.isArray(pet.inventory)) return null;
  const entry = pet.inventory.find(
    (it) => it.id === itemId && it.category === 'food' && !it.consumed,
  );
  if (!entry) return null;
  const item = findItem(itemId);
  if (!item || !item.effect) {
    entry.consumed = true;
    return entry;
  }
  const { hunger = 0, happiness = 0 } = item.effect;
  pet.stats.hunger    = clamp(pet.stats.hunger    + hunger,    0, 100);
  pet.stats.happiness = clamp(pet.stats.happiness + happiness, 0, 100);
  entry.consumed = true;
  return entry;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
