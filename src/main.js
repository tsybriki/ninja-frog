// src/main.js — bootstrap the game

import { createPet, tick, feed, sleep, play, pet_ } from './pet.js';
import { render, bindActions } from './ui.js';
import { savePet, loadPet, clearPet } from './storage.js';
import { openMinigame } from './minigames.js';
import { createFliesGame } from './minigame-flies.js';
import { createTargetsGame } from './minigame-targets.js';
import { flushCoins, pendingCoins, wouldEarnOnClose, SESSION_COIN_CAP } from './economy.js';
import { openShop, closeShop, bindShop } from './shop.js';

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
// Flies are now a coin-farming minigame: 1 coin per 25 caught, no HP drain.
function openFliesGame() {
  const game = createFliesGame(
    null, // onScoreChange (unused)
    null, // onCoin (live counter via economy.addFlies inside the game)
  );
  // Bind the live pet so internal addFlies() can mutate it.
  game.setPet(pet);

  openMinigame({
    title: '🪰 Catch the Flies',
    container: game.container,
    startGameFn: {
      start: () => game.start(),
      stop: () => game.stop(),
    },
    onFinish: (score) => {
      // Flush fractional coins → whole coins and announce the reward.
      const earned = flushCoins(pet);
      const total  = pet.coins || 0;
      savePet(pet);
      render(pet);

      const coinLine = earned > 0
        ? `🪙 +${earned} монета${earned === 1 ? '' : earned < 5 ? 'ы' : '!'}. Баланс: ${total}.`
        : `Пока 0 монет (нужно 25 мух = 1 🪙).`;
      alert(`🪰 Поймано мух: ${score}\n${coinLine}`);
    },
  });
}

// Open the "Shooting Gallery" minigame.
// Targets pop up; each one shot = 2 coins per 15 hits (cap 100 / session).
function openTargetsGame() {
  const game = createTargetsGame(null, null);
  game.setPet(pet);

  openMinigame({
    title: '🎯 Shooting Gallery',
    container: game.container,
    startGameFn: {
      start: () => game.start(),
      stop:  () => game.stop(),
    },
    onFinish: (stats) => {
      const earned = flushCoins(pet);
      const total  = pet.coins || 0;
      savePet(pet);
      render(pet);

      // `stats` may be undefined if the modal's close button was used.
      const hits = (stats && stats.shots) || 0;
      let reasonLine = '';
      if (stats && stats.reason === 'cap') reasonLine = '\n🏁 Лимит 100 монет за сессию достигнут.';
      else if (stats && stats.reason === 'time') reasonLine = '\n⏱ Время вышло.';

      const coinLine = earned > 0
        ? `🪙 +${earned} (15 попаданий = 2 монеты). Баланс: ${total}.`
        : `Пока 0 монет (нужно 15 попаданий = 2 🪙).`;
      alert(`🎯 Попаданий: ${hits}${reasonLine}\n${coinLine}`);
    },
  });
}

// Shop handlers — pull live pet on every open so re-renders reflect state.
function openShopHandler() {
  openShop(pet);
}
function closeShopHandler() {
  savePet(pet);
  render(pet);
  closeShop();
}

// Bind inventory strip slots to also open the shop on Inventory tab.
function bindInventoryStrip() {
  const toysSlot  = document.getElementById('inv-toys-slot');
  const foodSlot  = document.getElementById('inv-food-slot');
  const eqSlot    = document.getElementById('inv-equipped-slot');
  // Tapping "Toys" or "Food" opens the shop on the inventory tab.
  if (toysSlot) toysSlot.addEventListener('click', () => {
    openShop(pet);
    // Switch to inventory tab after open.
    const invTab = document.querySelector('.shop-tab[data-tab="inv"]');
    if (invTab) invTab.click();
  });
  if (foodSlot) foodSlot.addEventListener('click', () => {
    openShop(pet);
    const invTab = document.querySelector('.shop-tab[data-tab="inv"]');
    if (invTab) invTab.click();
  });
  if (eqSlot) eqSlot.addEventListener('click', () => {
    if (pet.equipped && pet.equipped.cosmetic) {
      // Unequip directly from the strip — quick toggle.
      import('./economy.js').then(({ unequipCosmetic }) => {
        unequipCosmetic(pet);
        render(pet);
        // bubble: nothing else listens to this event currently
      });
    } else {
      openShop(pet);
      const invTab = document.querySelector('.shop-tab[data-tab="inv"]');
      if (invTab) invTab.click();
    }
  });

  // When the shop mutates state, persist + re-render the main UI.
  document.addEventListener('bob:shop-changed', () => {
    savePet(pet);
    render(pet);
  });
}

// Bind buttons
bindActions({
  feed: () => { feed(pet); render(pet); },
  sleep: () => { sleep(pet); render(pet); },
  play: () => { openFliesGame(); },
  pet: () => {
    pet_(pet);
    // Show a floating "+18 ❤️" indicator over Bob so the player sees the
    // happiness bump. We import lazily to avoid a circular import (ui.js
    // doesn't depend on pet.js for the floating helpers).
    import('./ui.js').then(({ showPetIndicator }) => {
      showPetIndicator();
    });
    render(pet);
  },
  shoot: () => { openTargetsGame(); },
  newGame: () => {
    if (!confirm('Начать новую игру? Монеты и инвентарь сбросятся.')) return;
    clearPet();
    pet = createPet();
    savePet(pet);
    render(pet);
  },
});

bindShop(openShopHandler, closeShopHandler);
bindInventoryStrip();

render(pet);
requestAnimationFrame(loop);
