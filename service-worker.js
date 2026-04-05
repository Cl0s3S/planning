/* ============================================
   PLANNING — service-worker.js
   Gère les notifications push en arrière-plan
   ============================================ */

const CACHE_NAME = 'planning-v1';
const URLS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
];

/* ── Install ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(URLS_TO_CACHE))
  );
  self.skipWaiting();
});

/* ── Activate ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ── Fetch (cache-first) ── */
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(r => r || fetch(event.request))
  );
});

/* ── Push notification reçue ── */
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'planning. — life dashboard', {
      body:  data.body  || '🗓 Il est 18h30 ! Remplis ton planning pour demain.',
      icon:  data.icon  || './icon-192.png',
      badge: data.badge || './icon-192.png',
      tag:   'planning-daily',
      requireInteraction: true,
      actions: [
        { action: 'open',    title: 'Ouvrir le planning' },
        { action: 'dismiss', title: 'Plus tard' },
      ],
    })
  );
});

/* ── Clic sur la notification ── */
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('planning') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('https://cl0s3s.github.io/planning/');
      }
    })
  );
});

/* ── Alarm interne : déclenche la notif à 18h30 ── */
self.addEventListener('message', event => {
  if (event.data?.type === 'SCHEDULE_NOTIF') {
    scheduleDaily();
  }
});

function scheduleDaily() {
  const now    = new Date();
  const target = new Date();
  target.setHours(18, 30, 0, 0);
  if (now >= target) target.setDate(target.getDate() + 1);

  const delay = target - now;

  setTimeout(() => {
    self.registration.showNotification('planning. — life dashboard', {
      body:  '🗓 Il est 18h30 ! Remplis ton planning pour demain.',
      icon:  './icon-192.png',
      tag:   'planning-daily',
      requireInteraction: true,
    });
    // Re-schedule le lendemain
    setInterval(() => {
      self.registration.showNotification('planning. — life dashboard', {
        body:  '🗓 Il est 18h30 ! Remplis ton planning pour demain.',
        icon:  './icon-192.png',
        tag:   'planning-daily',
        requireInteraction: true,
      });
    }, 24 * 60 * 60 * 1000);
  }, delay);
}
