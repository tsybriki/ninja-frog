// src/minigame-racing.js — Гонки от первого лица (FPV / cockpit view).
//
// Игрок сидит за рулём: внизу экрана — капот и приборная панель, впереди
// уходит в перспективу дорога с разметкой. Навстречу едут машины в трёх
// полосах. Уворачиваемся, едем как можно дальше, получаем монеты за метры.
//
// Контролы
//   ←/→ или A/D — рулёжка влево/вправо
//   W или Space — газ (чем дольше держишь, тем быстрее разгон)
//   S           — тормоз
//   R           — рестарт после Game Over
//
// Почему FPV, а не top-down: запрос «мы сидим в машине от первого лица» —
// намеренно отличаемся от старой top-down race, чтобы в меню было два
// разных ощущения. Здесь главное — дорога и руль, а не тактика-полосы.
//
// Экономика: 1 🪙 за 500 м (тот же RATES.meters, что и в top-down гонке).

import { makeContainer } from './minigames.js';
import { addMeters, wouldEarnOnClose, SESSION_COIN_CAP } from './economy.js';

// --- Тюнинг ---------------------------------------------------------------

const MAX_SPEED = 240;       // км/ч, "потолок" спидометра
const ACCEL = 70;            // км/ч/с — педаль в пол
const BRAKE = 110;           // км/ч/с — торможение
const FRICTION = 6;          // естественное замедление без газа

// Сколько метров виртуальной дороги в одной секунде на 1 км/ч скорости.
// Хотим, чтобы на 60 км/ч пробег рос ~60 м/с, на 200 км/ч — ~200 м/с.
const METRES_PER_KMH = 1;

// Управление: рулёжка — плавная интерполяция к целевому положению.
// steeringSmooth — единиц/с при полном отклонении (быстрее на скорости).
const STEER_BASE = 1.4;
const STEER_MAX  = 2.4;

// Препятствия (встречные машины). Чем выше скорость, тем чаще спавн.
const SPAWN_BASE_MS = 900;
const SPAWN_VAR_MS  = 700;
const SPAWN_FASTER_AT = 120; // km/h, после этого спавним чаще

// --- Фабрика --------------------------------------------------------------

export function createRacingGame() {
  const container = makeContainer();

  // Состояние
  let running      = false;
  let crashed      = false;
  let raf          = null;
  let lastFrame    = 0;
  let petRef       = null;

  let speed        = 0;          // км/ч
  let steer        = 0;          // -1 (левая полоса) .. 0 (центр) .. +1 (правая)
  let steerTarget  = 0;
  let throttle     = 0;          // 0..1, нарастает при удержании газа
  let braking      = false;

  let distanceM    = 0;
  let topSpeed     = 0;

  // Встречные машины: { el, lane (-1/0/+1), z (0=горизонт..1=камера), speed }
  const oncoming = [];
  let spawnTimer = null;

  // Мигание при столкновении
  let flashTimer  = 0;

  // --- DOM -----------------------------------------------------------------

  const world = document.createElement('div');
  world.className = 'racing-world';
  container.appendChild(world);

  // Небо
  const sky = document.createElement('div');
  sky.className = 'racing-sky';
  world.appendChild(sky);

  // Горы / силуэты на горизонте — простые CSS-фигуры, чтобы было ощущение мира
  const hills = document.createElement('div');
  hills.className = 'racing-hills';
  world.appendChild(hills);

  // Дорога: перспективная сетка с разметкой
  const road = document.createElement('div');
  road.className = 'racing-road';
  world.appendChild(road);

  // Слой для встречных машин (поверх дороги, под капотом)
  const trafficLayer = document.createElement('div');
  trafficLayer.className = 'racing-traffic';
  road.appendChild(trafficLayer);

  // Капот и торпедо (вид из кабины)
  const dash = document.createElement('div');
  dash.className = 'racing-dash';
  world.appendChild(dash);

  // HUD сверху (дистанция, монеты)
  const hud = document.createElement('div');
  hud.className = 'racing-hud';
  hud.innerHTML = `
    <div class="racing-hud-distance">📏 0 м</div>
    <div class="racing-hud-coins">🪙 0 / ${SESSION_COIN_CAP}</div>
  `;
  container.appendChild(hud);

  // Подсказка управления
  const hint = document.createElement('div');
  hint.className = 'minigame-hint racing-hint';
  hint.textContent = '←/→ руль · W газ · S тормоз · R рестарт';
  container.appendChild(hint);

  // Game over
  const gameOver = document.createElement('div');
  gameOver.className = 'racing-gameover hidden';
  gameOver.innerHTML = `
    <div class="racing-gameover-title">💥 Авария!</div>
    <div class="racing-gameover-stats"></div>
    <button class="minigame-btn racing-restart">Заново (R)</button>
  `;
  container.appendChild(gameOver);

  // --- Хелперы -------------------------------------------------------------

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Полосы в проекции: -1, 0, +1 -> x-координата в долях половины ширины дороги.
  // 0.55 — чтобы машины были ближе к центру своих полос, чем вплотную к разметке.
  const laneX = (lane) => lane * 0.55;

  // Проекция: горизонт на ~30% высоты мира, z=1 — у капота.
  const horizonY = 0.30;
  const project = (lane, z) => {
    const w = road.clientWidth;
    const h = road.clientHeight;
    const cx = w / 2;
    const perspX = 0.18 + z * 0.82;       // расширение по мере приближения
    const x = cx + laneX(lane) * (w * 0.42 * perspX);
    const y = h * horizonY + (1 - z) * (h * (1 - horizonY - 0.18));
    // Размер: маленькая вдали, большая вблизи
    const scale = 0.32 + z * 0.95;
    return { x, y, scale };
  };

  const updateDash = () => {
    speedo.textContent = String(Math.round(speed));
    hud.querySelector('.racing-hud-distance').textContent = `📏 ${Math.floor(distanceM)} м`;
    const coins = petRef ? wouldEarnOnClose(petRef) : 0;
    hud.querySelector('.racing-hud-coins').textContent = `🪙 ${coins} / ${SESSION_COIN_CAP}`;
    // Руление виляет капотом чуть-чуть — ощущение руля
    dash.style.setProperty('--steer', steer.toFixed(2));
  };

  // Спидометр — крупный шар прямо на торпедо.
  // ВАЖНО: объявляем ДО updateDash, потому что updateDash вызывается из
  // step() в первом же кадре после start(). Иначе TDZ ReferenceError.
  const speedo = document.createElement('div');
  speedo.className = 'racing-speedo';
  speedo.textContent = '0';
  dash.appendChild(speedo);

  const speedoLabel = document.createElement('div');
  speedoLabel.className = 'racing-speedo-label';
  speedoLabel.textContent = 'км/ч';
  dash.appendChild(speedoLabel);

  // Спавн встречной машины
  const spawnOncoming = () => {
    const lanes = [-1, 0, 1];
    const lane = lanes[Math.floor(Math.random() * 3)];
    // Эмодзи встречных машин разные — визуальное разнообразие
    const palette = ['🚗', '🚙', '🚕', '🛻', '🚓'];
    const emoji = palette[Math.floor(Math.random() * palette.length)];
    const el = document.createElement('div');
    el.className = 'racing-car-oncoming';
    el.textContent = emoji;
    trafficLayer.appendChild(el);
    // Их скорость (в наших единицах) — тоже случайная, чтобы выглядело живо
    const trafficSpeed = 40 + Math.random() * 60;
    oncoming.push({ el, lane, z: 0, speed: trafficSpeed });
  };

  const scheduleNextSpawn = () => {
    if (!running) return;
    spawnOncoming();
    const factor = clamp(1 - speed / 240, 0.45, 1);
    const wait = (SPAWN_BASE_MS + Math.random() * SPAWN_VAR_MS) * factor;
    spawnTimer = setTimeout(scheduleNextSpawn, wait);
  };

  // --- Главный цикл --------------------------------------------------------

  const step = (now) => {
    if (!running) return;
    const dt = lastFrame ? (now - lastFrame) / 1000 : 0;
    lastFrame = now;

    // Газ: плавно нарастает, быстро спадает
    if (keys.has('gas')) {
      throttle = clamp(throttle + dt * 2.5, 0, 1);
    } else {
      throttle = clamp(throttle - dt * 5.0, 0, 1);
    }

    // Разгон / тормоз / трение
    let accel = 0;
    if (throttle > 0) accel += ACCEL * throttle;
    if (braking)      accel -= BRAKE;
    if (speed > 0)    accel -= FRICTION;
    if (speed < 0)    accel += FRICTION;
    speed += accel * dt;
    if (speed > MAX_SPEED) speed = MAX_SPEED;
    if (speed < -20) speed = -20;

    // Пробег -> монеты
    if (speed > 0) {
      const metres = speed * METRES_PER_KMH * dt;
      distanceM += metres;
      if (petRef && petRef.alive) {
        addMeters(petRef, metres);
      }
    }
    if (speed > topSpeed) topSpeed = speed;

    // Руление: плавно к цели. Скорость руля растёт с увеличением скорости
    // машины (на 240 км/ч руль «острее», как у настоящего болида).
    const steerRate = clamp(STEER_BASE + (speed / MAX_SPEED) * (STEER_MAX - STEER_BASE), STEER_BASE, STEER_MAX);
    if (steerTarget < steer) steer = Math.max(steerTarget, steer - steerRate * dt);
    else if (steerTarget > steer) steer = Math.min(steerTarget, steer + steerRate * dt);

    // Обновляем встречные машины
    const playerLane = steer < -0.33 ? -1 : steer > 0.33 ? 1 : 0;
    const zRate = clamp(0.5 + (speed / MAX_SPEED) * 0.7, 0.5, 1.2);
    for (let i = oncoming.length - 1; i >= 0; i--) {
      const c = oncoming[i];
      // Они едут НА нас со своей скоростью; мы на них — со своей. Итог: оба.
      c.z += (zRate + c.speed / MAX_SPEED * 0.4) * dt;
      if (c.z >= 1.05) {
        c.el.remove();
        oncoming.splice(i, 1);
        continue;
      }
      const { x, y, scale } = project(c.lane, c.z);
      c.el.style.left = `${x.toFixed(1)}px`;
      c.el.style.top  = `${y.toFixed(1)}px`;
      c.el.style.fontSize = `${(scale * 64).toFixed(1)}px`;
      c.el.style.opacity = String(clamp(c.z * 1.1, 0, 1));

      // Столкновение: близко к камере И та же полоса
      if (!crashed && c.z > 0.7 && c.lane === playerLane) {
        const halfW = (road.clientWidth * 0.42) * (0.18 + c.z * 0.82) * 0.40;
        const playerX = (road.clientWidth / 2) + steer * (road.clientWidth * 0.42 * 0.5);
        if (Math.abs(playerX - x) < halfW * 1.5) {
          crash();
          return;
        }
      }
    }

    // Анимация дороги: разметка и обочина едут тем быстрее, чем выше скорость.
    road.style.setProperty('--road-speed', String(80 + speed * 1.6));

    // Мигание при ударе
    if (flashTimer > 0) {
      flashTimer -= dt;
      world.classList.add('racing-flash');
      if (flashTimer <= 0) world.classList.remove('racing-flash');
    }

    // Кап по монетам
    if (petRef && petRef.alive && wouldEarnOnClose(petRef) >= SESSION_COIN_CAP) {
      endGame({ reason: 'cap' });
      return;
    }

    updateDash();
    raf = requestAnimationFrame(step);
  };

  // --- Переходы состояния --------------------------------------------------

  const crash = () => {
    crashed = true;
    flashTimer = 0.35;
    endGame({ reason: 'crash' });
  };

  const endGame = ({ reason }) => {
    if (!running) return;
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    if (spawnTimer) { clearTimeout(spawnTimer); spawnTimer = null; }
    oncoming.forEach((c) => c.el.remove());
    oncoming.length = 0;

    const stats = gameOver.querySelector('.racing-gameover-stats');
    const reasonText = reason === 'crash' ? '💥 Врезался во встречную машину'
                     : reason === 'cap'   ? '🏁 Лимит монет за сессию'
                     :                       '⏱ Время вышло';
    stats.innerHTML = `
      <div>${reasonText}</div>
      <div>📏 Дистанция: <strong>${Math.floor(distanceM)} м</strong></div>
      <div>🚀 Макс. скорость: <strong>${Math.round(topSpeed)} км/ч</strong></div>
    `;
    gameOver.classList.remove('hidden');
    container.dispatchEvent(new CustomEvent('minigame-end', {
      detail: { reason, distanceM, topSpeed },
    }));
  };

  const resetState = () => {
    speed = 0; steer = 0; steerTarget = 0;
    throttle = 0; braking = false;
    distanceM = 0; topSpeed = 0; crashed = false; lastFrame = 0;
    flashTimer = 0;
    oncoming.forEach((c) => c.el.remove());
    oncoming.length = 0;
  };

  const restart = () => {
    resetState();
    gameOver.classList.add('hidden');
    running = true;
    scheduleNextSpawn();
    raf = requestAnimationFrame(step);
  };

  // --- Клавиатура ----------------------------------------------------------

  const keys = new Set();
  const onKeyDown = (e) => {
    // R — рестарт даже после game over
    if (e.code === 'KeyR') {
      if (crashed || !running) {
        e.preventDefault();
        restart();
        return;
      }
    }
    if (!running) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowleft'  || k === 'a') { steerTarget = -1; e.preventDefault(); }
    if (k === 'arrowright' || k === 'd') { steerTarget = +1; e.preventDefault(); }
    if (k === 'w' || k === ' ' || k === 'arrowup')   { keys.add('gas'); e.preventDefault(); }
    if (k === 's' || k === 'arrowdown') { braking = true; e.preventDefault(); }
  };
  const onKeyUp = (e) => {
    const k = e.key.toLowerCase();
    if (k === 'w' || k === ' ' || k === 'arrowup') keys.delete('gas');
    if (k === 's' || k === 'arrowdown') braking = false;
    if ((k === 'arrowleft' || k === 'a') && steerTarget === -1) steerTarget = 0;
    if ((k === 'arrowright' || k === 'd') && steerTarget === +1) steerTarget = 0;
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // Кнопка «Заново» в оверлее game over
  gameOver.querySelector('.racing-restart').addEventListener('click', () => restart());

  // --- Публичный API -------------------------------------------------------

  return {
    container,
    setPet: (p) => { petRef = p; },
    start: () => {
      resetState();
      gameOver.classList.add('hidden');
      running = true;
      scheduleNextSpawn();
      raf = requestAnimationFrame(step);
    },
    stop: () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      if (spawnTimer) { clearTimeout(spawnTimer); spawnTimer = null; }
      oncoming.forEach((c) => c.el.remove());
      oncoming.length = 0;
    },
    // Очистка клавиатурных слушателей, если когда-нибудь понадобится выгрузить
    destroy: () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    },
  };
}
