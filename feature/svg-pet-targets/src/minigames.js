// src/minigames.js — minigame framework
// Handles the overlay, the 2-minute (= 1 game-hour) timer,
// and a simple start/finish API for individual games.

// Open the minigame overlay and start the game
//   - startGameFn(): called when the user taps "Start"
//   - onFinish(score): called when the 2-minute timer ends
//   - container: HTMLElement where the game renders (inside the overlay)
//   - title: string, e.g. "🪰 Catch the Flies"
export function openMinigame({ title, container, startGameFn, onFinish }) {
  const overlay = document.getElementById('minigame-overlay');
  const titleEl = document.getElementById('minigame-title');
  const bodyEl  = document.getElementById('minigame-body');
  const timerEl = document.getElementById('minigame-timer');
  const startBtn = document.getElementById('minigame-start');
  const closeBtn = document.getElementById('minigame-close');

  titleEl.textContent = title;
  bodyEl.innerHTML = '';
  bodyEl.appendChild(container);
  timerEl.textContent = '2:00';
  startBtn.classList.remove('hidden');
  startBtn.disabled = false;
  closeBtn.classList.remove('hidden');

  overlay.classList.remove('hidden');

  let raf = null;
  let started = false;
  let startTime = 0;
  const TOTAL_MS = 2 * 60 * 1000; // 2 real minutes = 1 game-hour
  let score = 0;

  const tick = () => {
    if (!started) return;
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, TOTAL_MS - elapsed);
    const sec = Math.ceil(remaining / 1000);
    const mm = Math.floor(sec / 60);
    const ss = sec % 60;
    timerEl.textContent = `${mm}:${ss.toString().padStart(2, '0')}`;
    if (remaining <= 0) {
      finish();
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  const finish = () => {
    started = false;
    if (raf) cancelAnimationFrame(raf);
    startGameFn.stop && startGameFn.stop();
    onFinish(score);
  };

  const close = () => {
    if (started) finish();
    overlay.classList.add('hidden');
    if (raf) cancelAnimationFrame(raf);
  };

  startBtn.onclick = () => {
    startBtn.classList.add('hidden');
    started = true;
    startTime = Date.now();
    score = startGameFn.start((delta) => {
      // game can update score via callback
      score = delta;
    });
    raf = requestAnimationFrame(tick);
  };

  closeBtn.onclick = close;
}

// Helper: build a minigame container element
export function makeContainer() {
  const el = document.createElement('div');
  el.className = 'minigame-canvas';
  return el;
}
