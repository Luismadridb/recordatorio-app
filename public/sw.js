const CACHE_NAME = 'predicadores-v2';
const ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/admin.js?v=3',
    '/manifest.json'
];

// Instalación: Limpia el caché viejo inmediatamente
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

// Activación: Borra cachés antiguos
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.filter((name) => name !== CACHE_NAME)
                          .map((name) => caches.delete(name))
            );
        })
    );
});

// Estrategia: Network First (Priorizar red para ver cambios de inmediato)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});
