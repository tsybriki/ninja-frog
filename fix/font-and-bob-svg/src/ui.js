// src/ui.js — render Bob and handle button clicks

import { MAX_AGE } from './pet.js';
import { findItem } from './economy.js';

/**
 * Show a floating "-N" over the pet sprite.
 * @param {string} stat 'hunger' | 'happiness' | 'health'
 * @param {number} amount positive number (we render the minus sign ourselves)
 */
export function showSicknessIndicator(stat, amount) {
  const sprite = document.getElementById('bob-sprite');
  if (!sprite) return;

  const indicator = document.createElement('div');
  indicator.className = `sickness-indicator sickness-${stat}`;
  indicator.textContent = `-${amount}`;

  // Position relative to the sprite container. Use absolute coords.
  indicator.style.position = 'absolute';
  indicator.style.left = '50%';
  indicator.style.top = '0';
  indicator.style.transform = 'translate(-50%, -10px)';

  // Ensure the parent is positioned so absolute children anchor to it.
  const parent = sprite.parentElement;
  if (parent && getComputedStyle(parent).position === 'static') {
    parent.style.position = 'relative';
  }
  parent.appendChild(indicator);

  // Remove after the animation finishes (1.2s in CSS).
  setTimeout(() => indicator.remove(), 1300);
}

/**
 * Show a floating "❤️ +N" indicator after petting Bob. Same DOM recipe as
 * showSicknessIndicator but positive and rendered in green.
 */
export function showPetIndicator() {
  const sprite = document.getElementById('bob-sprite');
  if (!sprite) return;
  const indicator = document.createElement('div');
  indicator.className = 'pet-indicator';
  indicator.textContent = '❤️ +18';
  indicator.style.position = 'absolute';
  indicator.style.left = '50%';
  indicator.style.top = '0';
  indicator.style.transform = 'translate(-50%, -10px)';
  const parent = sprite.parentElement;
  if (parent && getComputedStyle(parent).position === 'static') {
    parent.style.position = 'relative';
  }
  parent.appendChild(indicator);
  setTimeout(() => indicator.remove(), 1300);
}

export function render(pet) {
  if (!pet.alive) {
    showGameOver(pet);
    return;
  }

  hideGameOver();

  const { hunger, fatigue, happiness } = pet.stats;
  // Health bar = remaining life in game-hours (0..MAX_AGE).
  const lifeHours = Math.max(0, MAX_AGE - pet.age);
  const lifePercent = (lifeHours / MAX_AGE) * 100;

  document.getElementById('health-val').textContent    = `${lifeHours.toFixed(1)}h`;
  document.getElementById('hunger-val').textContent    = Math.floor(hunger);
  document.getElementById('fatigue-val').textContent   = Math.floor(fatigue);
  document.getElementById('happiness-val').textContent = Math.floor(happiness);

  document.getElementById('health-bar').style.width    = `${lifePercent}%`;
  document.getElementById('hunger-bar').style.width    = `${hunger}%`;
  document.getElementById('fatigue-bar').style.width   = `${fatigue}%`;
  document.getElementById('happiness-bar').style.width = `${happiness}%`;

  document.getElementById('age').textContent = Math.floor(pet.age);

  // Coins + inventory
  renderEconomy(pet);

  // Bob mood
  renderSprite(pet);

  document.getElementById('status').textContent = statusText(pet, lifePercent);

  // Disable buttons when dead
  const dead = !pet.alive;
  document.getElementById('btn-feed').disabled  = dead;
  document.getElementById('btn-sleep').disabled = dead;
  document.getElementById('btn-pet').disabled   = dead;
  document.getElementById('btn-games').disabled = dead;
  document.getElementById('btn-shop').disabled  = dead;
}

/**
 * Update the coins pill + inventory strip from `pet`. Idempotent: safe to
 * call on every render tick.
 */
function renderEconomy(pet) {
  const coinsEl = document.getElementById('coins-val');
  if (coinsEl) coinsEl.textContent = Math.floor(pet.coins || 0);

  // Inventory counts (live entries only)
  const inv = Array.isArray(pet.inventory) ? pet.inventory : [];
  const live = inv.filter((it) => !it.consumed);
  const toys   = live.filter((it) => it.category === 'cosmetic');
  const food   = live.filter((it) => it.category === 'food');

  const toysEl = document.getElementById('inv-toys-content');
  if (toysEl) toysEl.textContent = toys.length ? `${toys.length} 🎁` : '0';

  const foodEl = document.getElementById('inv-food-content');
  if (foodEl) foodEl.textContent = food.length ? `${food.length} 🍱` : '0';

  // Equipped cosmetic slot
  const eqContent = document.getElementById('inv-equipped-content');
  const eqSlot    = document.getElementById('inv-equipped-slot');
  if (eqContent && eqSlot) {
    const eqId = pet.equipped && pet.equipped.cosmetic;
    if (eqId) {
      const item = findItem(eqId);
      eqContent.textContent = item ? `${item.emoji} ${item.name}` : eqId;
      eqSlot.classList.add('equipped-active');
    } else {
      eqContent.textContent = '—';
      eqSlot.classList.remove('equipped-active');
    }
  }
}

/**
 * Update Bob's sprite — handles mood (happy/sad/dead) and the cosmetic
 * overlay (hat / side accessory). The overlay is a separate child element so
 * we don't fight Bob's `wiggle` animation transforms.
 */
function renderSprite(pet) {
  const sprite = document.getElementById('bob-sprite');
  if (!sprite) return;

  sprite.classList.remove('happy', 'sad', 'dead');

  const { hunger, fatigue, happiness } = pet.stats;
  const lifeHours = Math.max(0, MAX_AGE - pet.age);
  const lifePercent = (lifeHours / MAX_AGE) * 100;

  if (hunger > 70 || fatigue > 70 || happiness < 30 || lifePercent < 50) {
    sprite.classList.add('sad');
  } else {
    sprite.classList.add('happy');
  }

  // Cosmetic overlay (absolute-positioned emoji on top of Bob)
  // Lazy-create the wrapper so we don't edit index.html or the markup gets
  // nuked by innerHTML elsewhere.
  let overlay = sprite.querySelector('.bob-cosmetics');
  const eqId = pet.equipped && pet.equipped.cosmetic;
  if (eqId) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'bob-cosmetics';
      sprite.appendChild(overlay);
    }
    const item = findItem(eqId);
    if (item) {
      // Each cosmetic has a fixed slot declared in CATALOG_COMPAT (below).
      // For now: head items go to .slot-hat, side items go to .slot-side.
      const slot = COSMETIC_SLOTS[item.id] || 'slot-hat';
      overlay.innerHTML = `<span class="${slot}">${item.emoji}</span>`;
    }
  } else if (overlay) {
    overlay.innerHTML = '';
  }
}

// Map cosmetic item id -> which CSS slot to render in.
// Hat-top: crown. Side: bow, ball, octopus (decoration hanging off Bob).
const COSMETIC_SLOTS = {
  crown:        'slot-hat',
  bow:          'slot-side',
  toy_ball:     'slot-side',
  toy_octopus:  'slot-side',
};



function statusText(pet, lifePercent) {
  const { hunger, fatigue, happiness } = pet.stats;
  if (lifePercent < 10) return 'Bob is near the end of his life...';
  if (hunger > 80) return 'Bob is starving!';
  if (fatigue > 80) return 'Bob is exhausted!';
  if (happiness < 30) return 'Bob is sad.';
  if (hunger > 50) return 'Bob is getting hungry.';
  if (fatigue > 50) return 'Bob is getting tired.';
  if (happiness < 50) return 'Bob could use some fun.';
  return 'Bob is happy!';
}

function showGameOver(pet) {
  const panel = document.getElementById('game-over');
  const title = document.getElementById('game-over-title');
  const text  = document.getElementById('game-over-text');
  const sprite = document.getElementById('bob-sprite');

  sprite.classList.remove('happy', 'sad');
  sprite.classList.add('dead');

  if (pet.causeOfDeath === 'old-age') {
    title.textContent = '💀 Bob lived a full life';
    text.textContent  = `Bob reached ${Math.floor(pet.age)} game-hours and died of old age.`;
  } else if (pet.causeOfDeath === 'sickness') {
    title.textContent = '💀 Bob got sick';
    text.textContent  = 'Bob died because his health dropped to zero. Take better care next time.';
  } else {
    title.textContent = 'Game Over';
    text.textContent  = '';
  }

  panel.classList.remove('hidden');
}

function hideGameOver() {
  document.getElementById('game-over').classList.add('hidden');
}

export function bindActions(handlers) {
  document.getElementById('btn-feed').addEventListener('click',  handlers.feed);
  document.getElementById('btn-sleep').addEventListener('click', handlers.sleep);
  document.getElementById('btn-pet').addEventListener('click',   handlers.pet);
  document.getElementById('btn-games').addEventListener('click', handlers.games);
  document.getElementById('btn-shop').addEventListener('click',  handlers.shop);
  document.getElementById('btn-new-game').addEventListener('click', handlers.newGame);
}