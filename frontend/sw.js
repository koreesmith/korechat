// KoreChat Service Worker - PWA support
// Network-first for all app files — never serve stale JS
const CACHE = "korechat-v2";

self.addEventListener("install", e => {
  e.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/ws")) return;

  // Network-first: always try network, fall back to cache only for icons/manifest
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Only cache icons and manifest, not app code
        if (res.ok && (url.pathname.startsWith("/icons/") ||
            url.pathname === "/manifest.json")) {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// Handle notification clicks
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && "focus" in client)
          return client.focus();
      }
      if (clients.openWindow) return clients.openWindow("/");
    })
  );
});
