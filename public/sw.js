// Self-destructing service worker — clears all caches and unregisters itself.
// This exists solely to break the stale-cache cycle on mobile devices
// that still have an old service worker registered.

self.addEventListener('install', function () {
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) { return caches.delete(k); }));
        }).then(function () {
            return self.registration.unregister();
        }).then(function () {
            return self.clients.matchAll();
        }).then(function (clients) {
            clients.forEach(function (client) { client.navigate(client.url); });
        })
    );
});
