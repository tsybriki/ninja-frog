// src/main.js — bootstrap the game

import { createPet, tick, feed, sleep, play, pet_ } from './pet.js';
import { render, bindActions } from './ui.js';
import { savePet, loadPet, clearPet } from './storage.js';
import { openMinigame } from './minigames.js';
import { createFliesGame } from './minigame-flies.js';
import { createTargetsGame } from './minigame-targets.js';
import { createRacingGame } from './minigame-racing.js';
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

// Slow passive HP drain: 1 HP every 6 real minutes while Bob is alive.
// (Was 1 / 36s in the 4-minute lifetime build, tuned for ~10 hits per run.
// 6 minutes keeps the same ~10 hits across a 1-hour lifetime.)
setInterval(() => {
  if (!pet.alive) return;
  pet.stats.health = Math.max(0, pet.stats.health - 1);
  if (pet.stats.health <= 0) {
    pet.alive = false;
    pet.causeOfDeath = 'time';
  }
  savePet(pet);
  render(pet);
}, 6 * 60 * 1000);

// --- Games menu ---
//
// A small picker that appears when the player taps "🎮 Игры". Each tile
// launches the corresponding minigame. We use a registry-style lookup so
// adding a third game later is a one-liner.
//
// Why a registry instead of calling each game's open fn directly?
// Centralises the "what is a game" question in one place (openGame below),
// so the modal is just data — and the cap alert text stays in one spot.

const GAME_REGISTRY = {
  // key -> { title, factory, onFinish }
  flies: {
    title: '🪰 Catch the Flies',
    factory: () => createFliesGame(null, null),
    onFinish: (pet, score) => {
      const earned = flushCoins(pet);
      savePet(pet);
      render(pet);
      const total = pet.coins || 0;
      const coinLine = earned > 0
        ? `🪙 +${earned} монета${earned === 1 ? '' : earned < 5 ? 'ы' : '!'}. Баланс: ${total}.`
        : `Пока 0 монет (нужно 25 мух = 1 🪙).`;
      alert(`🪰 Поймано мух: ${score}\n${coinLine}`);
    },
  },
  targets: {
    title: '🎯 Shooting Gallery',
    factory: () => createTargetsGame(null, null),
    onFinish: (pet, stats) => {
      const earned = flushCoins(pet);
      savePet(pet);
      render(pet);
      const total  = pet.coins || 0;
      const hits = (stats && stats.shots) || 0;
      let reasonLine = '';
      if (stats && stats.reason === 'cap')  reasonLine = '\n🏁 Лимит 100 монет за сессию достигнут.';
      else if (stats && stats.reason === 'time') reasonLine = '\n⏱ Время вышло.';
      const coinLine = earned > 0
        ? `🪙 +${earned} (15 попаданий = 2 монеты). Баланс: ${total}.`
        : `Пока 0 монет (нужно 15 попаданий = 2 🪙).`;
      alert(`🎯 Попаданий: ${hits}${reasonLine}\n${coinLine}`);
    },
  },
  // Гонка от первого лица — отдельная игра, чтобы в меню было разнообразие.
  // Та же ставка (1 🪙 / 500 м), но вид из кабины и встречный трафик.
  racing: {
    title: '🚗 Гонка от 1-го лица',
    factory: () => createRacingGame(),
    onFinish: (pet, stats) => {
      const earned = flushCoins(pet);
      savePet(pet);
      render(pet);
      const total  = pet.coins || 0;
      const meters = (stats && stats.distanceM) || 0;
      const top    = (stats && stats.topSpeed)  || 0;
      let reasonLine = '';
      if (stats && stats.reason === 'crash') reasonLine = '\n💥 Врезался во встречную машину.';
      else if (stats && stats.reason === 'cap') reasonLine = '\n🏁 Лимит 100 монет за сессию достигнут.';
      const coinLine = earned > 0
        ? `🪙 +${earned} (500 м = 1 монета). Баланс: ${total}.`
        : `Пока 0 монет (нужно проехать 500 м = 1 🪙).`;
      alert(`🚗 Гонка от 1-го лица\n📏 ${Math.floor(meters)} м · 🚀 макс. ${Math.round(top)} км/ч${reasonLine}\n${coinLine}`);
    },
  },
};

function openGame(key) {
  const spec = GAME_REGISTRY[key];
  if (!spec) return;
  const game = spec.factory();
  if (game.setPet) game.setPet(pet);
  openMinigame({
    title: spec.title,
    container: game.container,
    startGameFn: {
      start: () => game.start(),
      stop:  () => game.stop(),
    },
    onFinish: (scoreOrStats) => spec.onFinish(pet, scoreOrStats),
  });
}

function openGamesMenu() {
  const overlay = document.getElementById('games-menu');
  const coins   = document.getElementById('games-menu-coins');
  const cap     = document.getElementById('games-menu-cap');
  if (coins) coins.textContent = Math.floor(pet.coins || 0);
  if (cap)   cap.textContent   = SESSION_COIN_CAP;
  if (overlay) overlay.classList.remove('hidden');
}

function closeGamesMenu() {
  const overlay = document.getElementById('games-menu');
  if (overlay) overlay.classList.add('hidden');
}

function bindGamesMenu() {
  document.getElementById('btn-games').addEventListener('click', openGamesMenu);
  document.getElementById('games-menu-close').addEventListener('click', closeGamesMenu);
  // Each tile in the picker launches the corresponding game, then closes
  // the menu so the minigame overlay is the only thing on screen.
  document.querySelectorAll('.game-tile').forEach((tile) => {
    tile.addEventListener('click', () => {
      const key = tile.dataset.game;
      if (!key) return;
      closeGamesMenu();
      // Slight defer so the menu close animation isn't visible behind the
      // newly opened minigame modal.
      setTimeout(() => openGame(key), 50);
    });
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
  games: () => { openGamesMenu(); },
  shop:  () => { openShop(pet); },
  newGame: () => {
    if (!confirm('Начать новую игру? Монеты и инвентарь сбросятся.')) return;
    clearPet();
    pet = createPet();
    savePet(pet);
    render(pet);
  },
});

bindGamesMenu();
bindShop(openShopHandler, closeShopHandler);
bindInventoryStrip();

render(pet);
requestAnimationFrame(loop);
