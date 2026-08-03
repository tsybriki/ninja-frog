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

// Random sickness events: every 15s, one stat changes by +/-5,
// phone vibrates with a type-specific pattern, and a colored number
// floats above Bob so the player sees what happened.
function onSickness(updatedPet, event) {
  savePet(updatedPet);
  render(updatedPet);
  showSicknessIndicator(event.type, event.amount);
}

// Debug HUD: shows "next event in Ns" so we can verify the loop is alive.
const debugEl = document.createElement('div');
debugEl.id = 'sickness-debug';
debugEl.style.cssText = 'position:fixed;top:8px;right:8px;background:rgba(0,0,0,.6);color:#fff;padding:6px 10px;border-radius:6px;font:12px monospace;z-index:99';
document.body.appendChild(debugEl);
function onSicknessTick(remainingMs) {
  debugEl.textContent = `next event in ${Math.ceil(remainingMs / 1000)}s`;
}

let sickness = startSicknessLoop(pet, onSickness, onSicknessTick);

render(pet);
requestAnimationFrame(loop);
