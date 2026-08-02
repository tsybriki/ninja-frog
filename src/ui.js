// src/ui.js — render Bob and handle button clicks

export function render(pet) {
  document.getElementById('age').textContent = Math.floor(pet.stats?.health !== undefined ? pet.age : pet.age);

  if (!pet.alive) {
    showGameOver(pet);
    return;
  }

  hideGameOver();

  const { health, hunger, fatigue, happiness } = pet.stats;

  document.getElementById('health-val').textContent    = Math.floor(health);
  document.getElementById('hunger-val').textContent    = Math.floor(hunger);
  document.getElementById('fatigue-val').textContent   = Math.floor(fatigue);
  document.getElementById('happiness-val').textContent = Math.floor(happiness);

  document.getElementById('health-bar').style.width    = `${health}%`;
  document.getElementById('hunger-bar').style.width    = `${hunger}%`;
  document.getElementById('fatigue-bar').style.width   = `${fatigue}%`;
  document.getElementById('happiness-bar').style.width = `${happiness}%`;

  document.getElementById('age').textContent = Math.floor(pet.age);

  // Bob mood
  const sprite = document.getElementById('bob-sprite');
  sprite.classList.remove('happy', 'sad', 'dead');
  if (hunger > 70 || fatigue > 70 || happiness < 30 || health < 50) {
    sprite.classList.add('sad');
  } else {
    sprite.classList.add('happy');
  }

  document.getElementById('status').textContent = statusText(pet);

  // Disable buttons when dead
  const dead = !pet.alive;
  document.getElementById('btn-feed').disabled = dead;
  document.getElementById('btn-sleep').disabled = dead;
  document.getElementById('btn-play').disabled = dead;
}

function statusText(pet) {
  const { hunger, fatigue, happiness, health } = pet.stats;
  if (health < 30) return 'Bob feels sick...';
  if (hunger > 80) return 'Bob is starving!';
  if (fatigue > 80) return 'Bob is exhausted!';
  if (happiness < 30) return 'Bob is sad.';
  if (hunger > 50) return 'Bob is getting hungry.';
  if (fatigue > 50) return 'Bob is getting tired.';
  if (happiness < 50) return 'Bob could use some fun.';
  return 'Bob is happy!';
}

function showGameOver(pet) {
  const panel = document.getElementById('game-over');
  const title = document.getElementById('game-over-title');
  const text  = document.getElementById('game-over-text');
  const sprite = document.getElementById('bob-sprite');

  sprite.classList.remove('happy', 'sad');
  sprite.classList.add('dead');

  if (pet.causeOfDeath === 'old-age') {
    title.textContent = '💀 Bob lived a full life';
    text.textContent  = `Bob reached ${Math.floor(pet.age)} game-hours and died of old age.`;
  } else if (pet.causeOfDeath === 'sickness') {
    title.textContent = '💀 Bob got sick';
    text.textContent  = 'Bob died because his health dropped to zero. Take better care next time.';
  } else {
    title.textContent = 'Game Over';
    text.textContent  = '';
  }

  panel.classList.remove('hidden');
}

function hideGameOver() {
  document.getElementById('game-over').classList.add('hidden');
}

export function bindActions(handlers) {
  document.getElementById('btn-feed').addEventListener('click', handlers.feed);
  document.getElementById('btn-sleep').addEventListener('click', handlers.sleep);
  document.getElementById('btn-play').addEventListener('click', handlers.play);
  document.getElementById('btn-new-game').addEventListener('click', handlers.newGame);
}
