// Self-destructing service worker — clears all caches and unregisters itself.
// No client.navigate() — that was causing iOS Safari "Can't open this page" errors
// by creating reload loops when combined with the inline SW cleanup in index.html.

self.addEventListener('install', function () {
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) { return caches.delete(k); }));
        }).then(function () {
            return self.registration.unregister();
        })
    );
});
