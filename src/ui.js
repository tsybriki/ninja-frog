// src/ui.js — render Bob and handle button clicks

import { MAX_AGE } from './pet.js';

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

  // Bob mood
  const sprite = document.getElementById('bob-sprite');
  sprite.classList.remove('happy', 'sad', 'dead');
  if (hunger > 70 || fatigue > 70 || happiness < 30 || lifePercent < 50) {
    sprite.classList.add('sad');
  } else {
    sprite.classList.add('happy');
  }

  document.getElementById('status').textContent = statusText(pet, lifePercent);

  // Disable buttons when dead
  const dead = !pet.alive;
  document.getElementById('btn-feed').disabled = dead;
  document.getElementById('btn-sleep').disabled = dead;
  document.getElementById('btn-play').disabled = dead;
}

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
  document.getElementById('btn-feed').addEventListener('click', handlers.feed);
  document.getElementById('btn-sleep').addEventListener('click', handlers.sleep);
  document.getElementById('btn-play').addEventListener('click', handlers.play);
  document.getElementById('btn-new-game').addEventListener('click', handlers.newGame);
}