// src/main.js — bootstrap the game

import { createPet, tick, feed, sleep, play } from './pet.js';
import { render, bindActions, showSicknessIndicator } from './ui.js';
import { savePet, loadPet, clearPet } from './storage.js';
import { startSicknessLoop } from './sickness.js';

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
    // Restart sickness loop for the new pet
    sickness.stop();
    sickness = startSicknessLoop(pet, onSickness);
  },
});

// Random sickness events: every 25-75s, one stat drops by 3-10,
// phone vibrates with a type-specific pattern, and a red "-N" floats
// above Bob so the player sees what happened.
function onSickness(updatedPet, event) {
  savePet(updatedPet);
  render(updatedPet);
  showSicknessIndicator(event.type, event.amount);
}

let sickness = startSicknessLoop(pet, onSickness);

render(pet);
requestAnimationFrame(loop);
