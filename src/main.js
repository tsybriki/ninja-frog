// src/main.js — bootstrap the game

import { createPet, tick, feed, sleep, play } from './pet.js';
import { render, bindActions } from './ui.js';
import { savePet, loadPet, clearPet } from './storage.js';

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

// Bind buttons
bindActions({
  feed: () => { feed(pet); render(pet); },
  sleep: () => { sleep(pet); render(pet); },
  play: () => { play(pet); render(pet); },
  newGame: () => {
    clearPet();
    pet = createPet();
    savePet(pet);
    render(pet);
  },
});

render(pet);
requestAnimationFrame(loop);
