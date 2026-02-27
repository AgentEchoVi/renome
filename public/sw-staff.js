var CACHE_NAME = 'renome-staff-v2';
var APP_SHELL = [
  '/css/staff.css',
  '/js/staff.js',
  '/img/logo.png',
  '/manifest-staff.json'
];

// Install: cache app shell
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first for HTML, cache-first for assets
self.addEventListener('fetch', function(event) {
  // Skip non-GET and SSE
  if (event.request.method !== 'GET') return;
  if (event.request.url.indexOf('/staff/events') !== -1) return;

  var accept = event.request.headers.get('accept') || '';

  // Network-first for HTML pages
  if (accept.indexOf('text/html') !== -1) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, clone);
        });
        return response;
      }).catch(function() {
        return caches.match(event.request).then(function(cached) {
          return cached || caches.match('/staff');
        });
      })
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        if (response.ok) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    })
  );
});

// Push notification from server (Web Push API)
self.addEventListener('push', function(event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { /* ignore */ }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Renome Staff', {
      body: data.body || '',
      icon: '/img/logo.png',
      badge: '/img/logo.png',
      tag: 'order-' + (data.data && data.data.orderId || Date.now()),
      requireInteraction: true,
      data: data.data || {}
    })
  );
});

// Click on push notification — open/focus the staff page
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        if (clientList[i].url.indexOf('/staff') !== -1 && 'focus' in clientList[i]) {
          return clientList[i].focus();
        }
      }
      return clients.openWindow('/staff');
    })
  );
});
