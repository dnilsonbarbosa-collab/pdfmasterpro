const CACHE_NAME = 'pdf-master-v9';
const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json'
];

// CDN resources to cache
const CDN_RESOURCES = [
    'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/downloadjs/1.4.8/download.min.js'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                // Cache CDN resources separately
                return caches.open(CACHE_NAME + '-cdn')
                    .then((cdnCache) => {
                        console.log('[SW] Caching CDN resources');
                        return Promise.all(
                            CDN_RESOURCES.map((url) =>
                                fetch(url, { mode: 'no-cors' })
                                    .then((response) => cdnCache.put(url, response))
                                    .catch((err) => console.log('[SW] Failed to cache:', url, err))
                            )
                        );
                    });
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME && name !== CACHE_NAME + '-cdn')
                    .map((name) => caches.delete(name))
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') return;

    // Strategy: Cache First for static assets
    if (STATIC_ASSETS.includes(url.pathname) || url.pathname === '/') {
        event.respondWith(
            caches.match(request).then((response) => {
                return response || fetch(request).then((fetchResponse) => {
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, fetchResponse.clone());
                        return fetchResponse;
                    });
                });
            })
        );
        return;
    }

    // Strategy: Stale While Revalidate for CDN resources
    if (CDN_RESOURCES.includes(request.url)) {
        event.respondWith(
            caches.open(CACHE_NAME + '-cdn').then((cache) => {
                return cache.match(request).then((response) => {
                    const fetchPromise = fetch(request).then((networkResponse) => {
                        if (networkResponse.ok) {
                            cache.put(request, networkResponse.clone());
                        }
                        return networkResponse;
                    }).catch(() => response); // Fallback to cache if network fails

                    return response || fetchPromise;
                });
            })
        );
        return;
    }

    // Default: Network First with cache fallback
    event.respondWith(
        fetch(request).then((response) => {
            if (response.ok) {
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(request, clone);
                });
            }
            return response;
        }).catch(() => {
            return caches.match(request);
        })
    );
});

// Message handling from main thread
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});

// Background sync for offline operations
self.addEventListener('sync', (event) => {
    if (event.tag === 'pdf-processing') {
        event.waitUntil(
            // Handle any queued PDF operations
            console.log('[SW] Processing pending PDF operations')
        );
    });
});