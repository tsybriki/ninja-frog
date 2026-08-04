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

// 1 whole coin per this many flies caught. Keep in sync with the shop
// prices in CATALOG so a single minigame run can plausibly buy something.
export const FLIES_PER_COIN = 50;

// Increments the fractional coin counter. Coins are NOT credited to pet.coins
// until `flushCoins()` is called (typically when the minigame closes) — that
// way a player can close mid-run without losing partial progress and we get
// one clean "you earned X" message at the end.
export function addFlies(pet, count) {
  if (!pet || !pet.alive) return { coinsEarned: 0, coinsTotal: pet ? pet.coins : 0 };
  if (!Number.isFinite(count) || count <= 0) {
    return { coinsEarned: 0, coinsTotal: pet.coins };
  }
  pet.coinsFraction += count / FLIES_PER_COIN;
  return { coinsEarned: 0, coinsTotal: pet.coins };
}

// Move fractional coins → whole coins. Returns the integer just credited.
// Safe to call multiple times — only the integer part is flushed each call.
export function flushCoins(pet) {
  if (!pet) return 0;
  if (!Number.isFinite(pet.coinsFraction)) pet.coinsFraction = 0;
  const earned = Math.floor(pet.coinsFraction);
  if (earned > 0) {
    pet.coins      = (pet.coins || 0) + earned;
    pet.coinsFraction -= earned;
    if (pet.coinsFraction < 0) pet.coinsFraction = 0;
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
