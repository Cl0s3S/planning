/* ============================================
   PLANNING — app.js
   Life Dashboard module
   ============================================ */

'use strict';

/* ═══════════════════════════════════════════
   CONSTANTES & CONFIG
═══════════════════════════════════════════ */
const STORAGE_KEY    = 'planning_v1';
const NOTIF_KEY      = 'planning_notif';
const COLORS = {
  wake:     '#e2ff7c',
  meal:     '#60a5fa',
  course:   '#f59e0b',
  revision: '#34d399',
  leisure:  '#a78bfa',
  sleep:    '#6b6a6f',
};
const LABELS = {
  wake:     'réveil',
  meal:     'repas',
  course:   'cours',
  revision: 'révision',
  leisure:  'temps libre',
  sleep:    'coucher',
};

/* ═══════════════════════════════════════════
   UTILS
═══════════════════════════════════════════ */

/** "HH:MM" → minutes depuis minuit */
function toMin(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/** minutes → "HH:MM" */
function toTime(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

/** minutes → "Xh YYmin" lisible */
function durLabel(mins) {
  if (mins <= 0) return '0 min';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

/** date "demain" lisible */
function tomorrowLabel() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** today key "YYYY-MM-DD" for tomorrow */
function tomorrowKey() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** toast notification */
function showToast(msg, duration = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

/* ═══════════════════════════════════════════
   DATE HEADER
═══════════════════════════════════════════ */
const NOW = new Date();
document.getElementById('hdr-date').textContent =
  NOW.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
document.getElementById('form-date-label').textContent =
  'pour ' + tomorrowLabel();

/* ═══════════════════════════════════════════
   GESTION DES COURS (formulaire dynamique)
═══════════════════════════════════════════ */
let courseCount = 0;

function addCourse(name = '', start = '08:00', end = '10:00') {
  courseCount++;
  const id = courseCount;
  const list = document.getElementById('courses-list');
  document.getElementById('no-courses').style.display = 'none';

  const item = document.createElement('div');
  item.className = 'course-item';
  item.dataset.id = id;
  item.innerHTML = `
    <input type="text"  class="course-name"  placeholder="matière (ex: maths)"  value="${name}" />
    <span class="course-label-small">de</span>
    <input type="time"  class="course-start" value="${start}" />
    <span class="course-label-small">à</span>
    <input type="time"  class="course-end"   value="${end}" />
    <button class="btn-remove" data-id="${id}" title="supprimer">×</button>`;

  list.appendChild(item);

  item.querySelector('.btn-remove').addEventListener('click', () => {
    item.remove();
    if (!document.querySelectorAll('.course-item').length) {
      document.getElementById('no-courses').style.display = 'block';
    }
  });
}

document.getElementById('add-course-btn').addEventListener('click', () => addCourse());

/* ═══════════════════════════════════════════
   GÉNÉRATION DU PLANNING
═══════════════════════════════════════════ */
function generatePlanning() {
  const wakeTime  = document.getElementById('wake-time').value;
  const sleepTime = document.getElementById('sleep-time').value;

  const wakeMin  = toMin(wakeTime);
  const sleepMin = toMin(sleepTime) <= wakeMin
    ? toMin(sleepTime) + 24 * 60   // après minuit
    : toMin(sleepTime);

  /* ── Repas ── */
  const meals = [
    { type: 'meal', name: 'petit-déjeuner', start: toMin(document.getElementById('meal-breakfast').value), dur: +document.getElementById('dur-breakfast').value },
    { type: 'meal', name: 'déjeuner',       start: toMin(document.getElementById('meal-lunch').value),     dur: +document.getElementById('dur-lunch').value },
    { type: 'meal', name: 'dîner',          start: toMin(document.getElementById('meal-dinner').value),    dur: +document.getElementById('dur-dinner').value },
  ].filter(m => m.start >= wakeMin && m.start < sleepMin)
   .map(m => ({ ...m, end: m.start + m.dur }));

  /* ── Cours ── */
  const courseItems = [...document.querySelectorAll('.course-item')];
  const courses = courseItems.map(el => {
    const name  = el.querySelector('.course-name').value.trim() || 'cours';
    const start = toMin(el.querySelector('.course-start').value);
    const end   = toMin(el.querySelector('.course-end').value);
    return { type: 'course', name, start, end: end > start ? end : end + 60, dur: 0 };
  }).filter(c => c.start >= wakeMin && c.start < sleepMin)
    .map(c => ({ ...c, dur: c.end - c.start }));

  /* ── Construire la liste des blocs fixes ── */
  const fixed = [
    { type: 'wake',  name: 'réveil',   start: wakeMin,  end: wakeMin,  dur: 0 },
    ...meals,
    ...courses,
    { type: 'sleep', name: 'coucher',  start: sleepMin, end: sleepMin, dur: 0 },
  ].sort((a, b) => a.start - b.start);

  /* ── Trouver les trous et y placer révisions / loisirs ── */
  const blocks = [];
  let cursor = wakeMin;

  for (const bloc of fixed) {
    if (bloc.start > cursor) {
      const gap = bloc.start - cursor;
      distributeGap(blocks, cursor, bloc.start, gap);
    }
    if (bloc.dur > 0 || bloc.type === 'wake' || bloc.type === 'sleep') {
      blocks.push({ ...bloc });
    }
    cursor = bloc.end || bloc.start;
  }

  /* ── Calcul stats ── */
  const totalRevision = blocks.filter(b => b.type === 'revision').reduce((a, b) => a + b.dur, 0);
  const totalLeisure  = blocks.filter(b => b.type === 'leisure' ).reduce((a, b) => a + b.dur, 0);
  const totalCourse   = blocks.filter(b => b.type === 'course'  ).reduce((a, b) => a + b.dur, 0);
  const totalMeal     = blocks.filter(b => b.type === 'meal'    ).reduce((a, b) => a + b.dur, 0);

  /* ── Sauvegarder ── */
  const data = {
    date: tomorrowKey(),
    wakeTime, sleepTime,
    blocks,
    stats: { totalRevision, totalLeisure, totalCourse, totalMeal },
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

  /* ── Afficher ── */
  renderView(data);
  showToast('planning généré ✓');
}

/**
 * Répartit un trou entre révision (60%) et loisirs (40%)
 * Minimum 30 min par bloc pour éviter les micro-blocs
 */
function distributeGap(blocks, start, end, gap) {
  if (gap <= 0) return;

  if (gap <= 20) {
    // Trop petit : on met en loisirs
    blocks.push({ type: 'leisure', name: 'temps libre', start, end, dur: gap });
    return;
  }

  // Révision 60% / Loisirs 40%, arrondi à 15 min
  let revMin = Math.round((gap * 0.60) / 15) * 15;
  let leisMin = gap - revMin;

  // Garantir min 15 min chacun si assez de place
  if (revMin < 15)  { revMin = 0; leisMin = gap; }
  if (leisMin < 15) { leisMin = 0; revMin = gap; }

  if (revMin > 0) {
    blocks.push({ type: 'revision', name: 'révision', start, end: start + revMin, dur: revMin });
  }
  if (leisMin > 0) {
    blocks.push({ type: 'leisure', name: 'temps libre', start: start + revMin, end: start + revMin + leisMin, dur: leisMin });
  }
}

/* ═══════════════════════════════════════════
   RENDER — affichage planning
═══════════════════════════════════════════ */
function renderView(data) {
  // Cacher formulaire, montrer vue
  document.getElementById('form-section').style.display = 'none';
  const viewSec = document.getElementById('view-section');
  viewSec.style.display = 'block';

  // Titre
  const dateObj = new Date(data.date + 'T12:00:00');
  const isToday = data.date === new Date().toISOString().slice(0, 10);
  document.getElementById('view-title').textContent = isToday ? "aujourd'hui" : tomorrowLabel();

  // Stats bar
  const statsBar = document.getElementById('stats-bar');
  statsBar.innerHTML = '';
  const statsData = [
    { color: COLORS.course,   val: durLabel(data.stats.totalCourse),   lbl: 'cours'     },
    { color: COLORS.revision, val: durLabel(data.stats.totalRevision),  lbl: 'révision'  },
    { color: COLORS.leisure,  val: durLabel(data.stats.totalLeisure),   lbl: 'loisirs'   },
    { color: COLORS.meal,     val: durLabel(data.stats.totalMeal),      lbl: 'repas'     },
  ];
  statsData.forEach(s => {
    const chip = document.createElement('div');
    chip.className = 'stat-chip';
    chip.innerHTML = `
      <div class="stat-chip-dot" style="background:${s.color}"></div>
      <span class="stat-chip-val">${s.val}</span>
      <span class="stat-chip-lbl">${s.lbl}</span>`;
    statsBar.appendChild(chip);
  });

  // Timeline
  const timeline = document.getElementById('timeline');
  timeline.innerHTML = '';

  data.blocks.forEach((b, i) => {
    const item = document.createElement('div');
    item.className = 'tl-item';
    item.style.animationDelay = (i * 40) + 'ms';

    const color = COLORS[b.type] || '#6b6a6f';

    let timeHtml = '';
    if (b.type === 'wake' || b.type === 'sleep') {
      timeHtml = `<div class="tl-time-start">${toTime(b.start)}</div>`;
    } else {
      timeHtml = `
        <div class="tl-time-start">${toTime(b.start)}</div>
        <div class="tl-time-end">${toTime(b.end)}</div>`;
    }

    const durHtml = b.dur > 0
      ? `<span class="tl-dur">${durLabel(b.dur)}</span>`
      : '';

    const tagStyle = `background:${color}18; color:${color}; border:1px solid ${color}44;`;
    const tagHtml  = `<span class="tl-tag" style="${tagStyle}">${LABELS[b.type] || b.type}</span>`;

    item.innerHTML = `
      <div class="tl-time">${timeHtml}</div>
      <div class="tl-bar-col" style="background:${color}"></div>
      <div class="tl-content">
        <div>
          <div class="tl-name">${b.name}</div>
          ${durHtml}
        </div>
        ${tagHtml}
      </div>`;

    timeline.appendChild(item);
  });
}

/* ═══════════════════════════════════════════
   BOUTON GÉNÉRER
═══════════════════════════════════════════ */
document.getElementById('btn-generate').addEventListener('click', generatePlanning);

/* ═══════════════════════════════════════════
   BOUTON MODIFIER
═══════════════════════════════════════════ */
document.getElementById('btn-edit').addEventListener('click', () => {
  document.getElementById('view-section').style.display  = 'none';
  document.getElementById('form-section').style.display  = 'block';
});

/* ═══════════════════════════════════════════
   CHARGEMENT AU DÉMARRAGE
   — si un planning existe pour demain, l'afficher
═══════════════════════════════════════════ */
(function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    // Afficher si le planning est pour demain ou aujourd'hui
    const tomorrow = tomorrowKey();
    const today    = new Date().toISOString().slice(0, 10);
    if (data.date === tomorrow || data.date === today) {
      // Pré-remplir le formulaire avec les valeurs sauvegardées
      if (data.wakeTime)  document.getElementById('wake-time').value  = data.wakeTime;
      if (data.sleepTime) document.getElementById('sleep-time').value = data.sleepTime;
      // Afficher directement la vue
      renderView(data);
    }
  } catch(e) {}
})();

/* ═══════════════════════════════════════════
   NOTIFICATIONS WEB PUSH (Android Chrome)
   — programmée à 18h30 chaque jour
═══════════════════════════════════════════ */
const notifBtn = document.getElementById('notif-btn');

// Vérifier si les notifs sont déjà activées
function updateNotifBtn() {
  if (!('Notification' in window)) {
    notifBtn.style.display = 'none';
    return;
  }
  if (Notification.permission === 'granted') {
    notifBtn.classList.add('active');
    notifBtn.title = 'Notifications activées ✓';
  } else {
    notifBtn.classList.remove('active');
    notifBtn.title = 'Activer les rappels à 18h30';
  }
}

updateNotifBtn();

notifBtn.addEventListener('click', async () => {
  if (!('Notification' in window)) {
    showToast('Notifications non supportées sur ce navigateur');
    return;
  }

  if (Notification.permission === 'granted') {
    showToast('Notifications déjà activées ✓');
    return;
  }

  const perm = await Notification.requestPermission();
  updateNotifBtn();

  if (perm === 'granted') {
    showToast('Rappels activés — tu seras notifié à 18h30 🔔');
    scheduleNotification();
    localStorage.setItem(NOTIF_KEY, 'true');
  } else {
    showToast('Permission refusée — active-la dans les paramètres');
  }
});

/**
 * Planifie la prochaine notification à 18h30
 * Via setTimeout (fonctionne si l'onglet reste ouvert)
 * + Service Worker pour la persistance en arrière-plan
 */
function scheduleNotification() {
  if (Notification.permission !== 'granted') return;

  const now    = new Date();
  const target = new Date();
  target.setHours(18, 30, 0, 0);

  // Si 18h30 est déjà passé aujourd'hui → demain
  if (now >= target) target.setDate(target.getDate() + 1);

  const delay = target - now;

  setTimeout(() => {
    fireNotification();
    // Re-schedule pour le lendemain
    setInterval(fireNotification, 24 * 60 * 60 * 1000);
  }, delay);
}

function fireNotification() {
  if (Notification.permission !== 'granted') return;

  const notif = new Notification('planning. — life dashboard', {
    body:  '🗓 Il est 18h30 ! Remplis ton planning pour demain.',
    icon:  'https://cl0s3s.github.io/planning/icon-192.png',
    badge: 'https://cl0s3s.github.io/planning/icon-192.png',
    tag:   'planning-daily',
    requireInteraction: true,
  });

  notif.onclick = () => {
    window.focus();
    notif.close();
  };
}

// Relancer la programmation si notif activée
if (localStorage.getItem(NOTIF_KEY) === 'true' && Notification.permission === 'granted') {
  scheduleNotification();
}

/* ═══════════════════════════════════════════
   SERVICE WORKER — pour les notifs background
═══════════════════════════════════════════ */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js')
    .then(() => {})
    .catch(() => {});
}

/* ═══════════════════════════════════════════
   ENTRANCE ANIMATIONS
═══════════════════════════════════════════ */
(function initReveal() {
  const els = document.querySelectorAll('[data-anim]');
  if (!('IntersectionObserver' in window)) {
    els.forEach(el => el.classList.add('visible'));
    return;
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const delay = +entry.target.dataset.delay || 0;
        setTimeout(() => entry.target.classList.add('visible'), delay);
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });
  els.forEach(el => io.observe(el));
})();
