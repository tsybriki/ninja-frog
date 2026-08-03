// src/main.js — bootstrap the game

import { createPet, tick, feed, sleep, play } from './pet.js';
import { render, bindActions } from './ui.js';
import { savePet, loadPet, clearPet } from './storage.js';
import { openMinigame } from './minigames.js';
import { createFliesGame } from './minigame-flies.js';

let pet = loadPet();

// If no save, or Bob is dead, start a new game
if (!pet || !pet.alive) {
  pet = createPet();
  savePet(pet);
}

function loop() {
  const now = Date.now();
  const deltaSec = (now - pet.lastTickAt) / 1000;
  pet.lastTickAt = now;
  tick(pet, deltaSec);
  render(pet);
  requestAnimationFrame(loop);
}

// Auto-save every 5 seconds
setInterval(() => savePet(pet), 5000);

// Save on tab close
window.addEventListener('beforeunload', () => savePet(pet));

// Slow passive HP drain: 1 HP every 0.6 real minutes (= 36 seconds) while Bob is alive.
setInterval(() => {
  if (!pet.alive) return;
  pet.stats.health = Math.max(0, pet.stats.health - 1);
  if (pet.stats.health <= 0) {
    pet.alive = false;
    pet.causeOfDeath = 'time';
  }
  savePet(pet);
  render(pet);
}, 36 * 1000);

// Open the "Catch the Flies" minigame.
// Per Oleg's request: 1 game-hour (= 2 real minutes), no reward yet,
// but Bob loses 1 HP every 1.6s while the minigame is running.
function openFliesGame() {
  const game = createFliesGame(
    null, // onScoreChange
    (amount) => {
      // Drain HP from the pet. -1 every 1.6s, clamp to 0, check death.
      if (!pet.alive) return;
      pet.stats.health = Math.max(0, pet.stats.health - amount);
      if (pet.stats.health <= 0) {
        pet.alive = false;
        pet.causeOfDeath = 'minigame';
      }
      savePet(pet);
      render(pet);
    }
  );
  openMinigame({
    title: '🪰 Catch the Flies',
    container: game.container,
    startGameFn: {
      start: () => game.start(),
      stop: () => game.stop(),
    },
    onFinish: (score) => {
      // No reward per Oleg — just show the result, then close.
      alert(`🪰 You caught ${score} flies!`);
    },
  });
}

// Bind buttons
bindActions({
  feed: () => { feed(pet); render(pet); },
  sleep: () => { sleep(pet); render(pet); },
  play: () => { openFliesGame(); },
  newGame: () => {
    clearPet();
    pet = createPet();
    savePet(pet);
    render(pet);
  },
});

render(pet);
requestAnimationFrame(loop);
