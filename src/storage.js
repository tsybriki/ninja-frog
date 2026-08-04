// src/storage.js — save/load Bob to localStorage

const KEY = 'bob-the-shrimp-v1';

export function savePet(pet) {
  try {
    localStorage.setItem(KEY, JSON.stringify(pet));
  } catch (e) {
    console.warn('Failed to save Bob:', e);
  }
}

export function loadPet() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const pet = JSON.parse(raw);
    return migratePet(pet);
  } catch (e) {
    console.warn('Failed to load Bob:', e);
    return null;
  }
}

// Backwards-compatible defaults for saves created before the economy was added.
// Old saves have no `coins`, `inventory`, etc. We fill them in on load so the
// rest of the code can treat every pet as a v2 schema.
function migratePet(pet) {
  if (!pet || typeof pet !== 'object') return pet;
  if (pet.coins === undefined)           pet.coins = 0;
  if (pet.coinsFraction === undefined)  pet.coinsFraction = 0;
  if (!Array.isArray(pet.inventory))    pet.inventory = [];
  if (!pet.equipped || typeof pet.equipped !== 'object') pet.equipped = { cosmetic: null };
  if (pet.equipped.cosmetic === undefined) pet.equipped.cosmetic = null;
  return pet;
}

export function clearPet() {
  localStorage.removeItem(KEY);
}
