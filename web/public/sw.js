// Tệp JS/CSS do Vite build có hash trong tên nên không liệt kê cố định; chúng được lưu vào cache khi tải lần đầu.
const CACHE = 'so-moc-shell-v3';
const SHELL = ['/', '/index.html', '/favicon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).then((response) => {
    const clone = response.clone();
    if (response.ok && url.origin === location.origin) caches.open(CACHE).then((cache) => cache.put(event.request, clone));
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached ?? caches.match('/index.html'))));
});
