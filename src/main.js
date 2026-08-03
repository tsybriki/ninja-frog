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

// Open the "Catch the Flies" minigame.
// Per Oleg's request: 1 game-hour (= 2 real minutes), no reward yet.
function openFliesGame() {
  const game = createFliesGame();
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
