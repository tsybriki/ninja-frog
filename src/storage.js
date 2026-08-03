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
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Failed to load Bob:', e);
    return null;
  }
}

export function clearPet() {
  localStorage.removeItem(KEY);
}
