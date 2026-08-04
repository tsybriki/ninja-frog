// src/shop.js — Bob's shop overlay.
//
// Two tabs:
//   - "Купить": catalogue from economy.CATALOG with a "Купить" button per item.
//   - "Инвентарь": list of inventory entries with action buttons
//        cosmetic -> "Надеть" / "Снять"
//        food      -> "Съесть"
//
// All mutations go through `economy.js` — this file owns the DOM only.

import {
  CATALOG,
  buyItem,
  equipCosmetic,
  unequipCosmetic,
  eatFood,
  findItem,
} from './economy.js';

let activeTab = 'buy';
let lastPet = null;

// Render both tabs' content. Cheap — called on every UI tick that touches
// coins/inventory, no virtualization needed for ~10-item catalog.
export function renderShop(pet) {
  lastPet = pet;
  const body = document.getElementById('shop-body');
  const coinsEl = document.getElementById('shop-coins');
  if (!body) return;
  if (coinsEl) coinsEl.textContent = pet.coins || 0;

  if (activeTab === 'buy') {
    body.innerHTML = '';
    body.appendChild(renderBuyTab(pet));
  } else {
    body.innerHTML = '';
    body.appendChild(renderInvTab(pet));
  }
}

function renderBuyTab(pet) {
  const wrap = document.createElement('div');
  wrap.className = 'shop-grid';

  for (const item of CATALOG) {
    const card = document.createElement('div');
    card.className = 'shop-card-item';

    const emoji = document.createElement('div');
    emoji.className = 'item-emoji';
    emoji.textContent = item.emoji;
    card.appendChild(emoji);

    const name = document.createElement('div');
    name.className = 'item-name';
    name.textContent = item.name;
    card.appendChild(name);

    const price = document.createElement('div');
    price.className = 'item-price';
    price.textContent = `🪙 ${item.price}`;
    card.appendChild(price);

    const btn = document.createElement('button');
    btn.className = 'buy-btn';
    btn.textContent = 'Купить';
    const canBuy = pet.alive && (pet.coins || 0) >= item.price;
    btn.disabled = !canBuy;
    btn.addEventListener('click', () => {
      const bought = buyItem(lastPet, item);
      if (!bought) return;
      // Auto-switch to inventory so the player sees their new item.
      activeTab = 'inv';
      document.querySelectorAll('.shop-tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.tab === 'inv');
      });
      renderShop(lastPet);
      // Notify the rest of the UI (coins, inventory, sprite)
      document.dispatchEvent(new CustomEvent('bob:shop-changed'));
    });
    card.appendChild(btn);

    wrap.appendChild(card);
  }
  return wrap;
}

function renderInvTab(pet) {
  const entries = Array.isArray(pet.inventory)
    ? pet.inventory.filter((it) => !it.consumed)
    : [];

  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'inv-empty';
    empty.textContent = 'Инвентарь пуст. Купи что-нибудь в магазине!';
    return empty;
  }

  const wrap = document.createElement('div');
  wrap.className = 'shop-grid';

  for (const entry of entries) {
    const item = findItem(entry.id) || entry;
    const card = document.createElement('div');
    card.className = 'inv-card';

    const emoji = document.createElement('div');
    emoji.className = 'item-emoji';
    emoji.textContent = entry.emoji || item.emoji || '❓';
    card.appendChild(emoji);

    const name = document.createElement('div');
    name.className = 'item-name';
    name.textContent = entry.name || item.name || entry.id;
    card.appendChild(name);

    // Currently equipped badge
    const isEquipped =
      entry.category === 'cosmetic' &&
      pet.equipped &&
      pet.equipped.cosmetic === entry.id;

    if (entry.category === 'cosmetic') {
      if (isEquipped) {
        const badge = document.createElement('div');
        badge.className = 'equipped-badge';
        badge.textContent = '✓ НАДЕТО';
        card.appendChild(badge);
      }
      const btn = document.createElement('button');
      btn.className = isEquipped ? 'act-btn unequip' : 'act-btn equip';
      btn.textContent = isEquipped ? 'Снять' : 'Надеть';
      btn.disabled = !pet.alive;
      btn.addEventListener('click', () => {
        if (!lastPet || !lastPet.alive) return;
        if (isEquipped) {
          unequipCosmetic(lastPet);
        } else {
          equipCosmetic(lastPet, entry.id);
        }
        renderShop(lastPet);
        document.dispatchEvent(new CustomEvent('bob:shop-changed'));
      });
      card.appendChild(btn);
    } else {
      const btn = document.createElement('button');
      btn.className = 'act-btn eat';
      btn.textContent = 'Съесть';
      btn.disabled = !pet.alive;
      btn.addEventListener('click', () => {
        const eaten = eatFood(lastPet, entry.id);
        if (!eaten) return;
        renderShop(lastPet);
        document.dispatchEvent(new CustomEvent('bob:shop-changed'));
      });
      card.appendChild(btn);
    }

    wrap.appendChild(card);
  }
  return wrap;
}

export function openShop(pet) {
  activeTab = 'buy';
  document.querySelectorAll('.shop-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === 'buy');
  });
  renderShop(pet);
  const overlay = document.getElementById('shop-overlay');
  if (overlay) overlay.classList.remove('hidden');
}

export function closeShop() {
  const overlay = document.getElementById('shop-overlay');
  if (overlay) overlay.classList.add('hidden');
}

export function bindShop(openHandler, closeHandler) {
  document.getElementById('shop-close').addEventListener('click', closeHandler);
  document.querySelectorAll('.shop-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      document.querySelectorAll('.shop-tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.tab === activeTab);
      });
      // Re-render with current pet if known.
      const pet = lastPet || (window.__bobPet || null);
      if (pet) renderShop(pet);
    });
  });
  // External open button
  document.getElementById('btn-shop').addEventListener('click', openHandler);
}
