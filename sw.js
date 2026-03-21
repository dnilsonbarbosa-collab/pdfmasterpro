const CACHE_NAME = 'pdf-master-pro-v3';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icons/icon-72x72.png',
    '/icons/icon-96x96.png',
    '/icons/icon-128x128.png',
    '/icons/icon-144x144.png',
    '/icons/icon-152x152.png',
    '/icons/icon-192x192.png',
    '/icons/icon-384x384.png',
    '/icons/icon-512x512.png',
    '/icons/icon-maskable-192x192.png',
    '/icons/icon-maskable-512x512.png'
];

// CDN resources
const CDN_RESOURCES = [
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js'
];

// Install event
self.addEventListener('install', (event) => {
    console.log('[SW] Instalando...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Cache aberto, adicionando assets...');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('[SW] Assets estáticos cacheados');
                return caches.open(CACHE_NAME + '-cdn');
            })
            .then((cdnCache) => {
                console.log('[SW] Cache CDN aberto');
                return Promise.all(
                    CDN_RESOURCES.map((url) =>
                        fetch(url, { mode: 'no-cors' })
                            .then((response) => cdnCache.put(url, response))
                            .catch((err) => console.log('[SW] Falha ao cachear CDN:', url))
                    )
                );
            })
            .then(() => {
                console.log('[SW] Instalação completa!');
                return self.skipWaiting();
            })
            .catch((err) => {
                console.error('[SW] Erro na instalação:', err);
            })
    );
});

// Activate event
self.addEventListener('activate', (event) => {
    console.log('[SW] Ativando...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME && name !== CACHE_NAME + '-cdn')
                    .map((name) => {
                        console.log('[SW] Deletando cache antigo:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => {
            console.log('[SW] Ativado e controlando clientes');
            return self.clients.claim();
        })
    );
});

// FETCH HANDLER - CRÍTICO PARA PWA INSTALÁVEL
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Só processar GET
    if (request.method !== 'GET') return;

    // Estratégia: Cache First para assets estáticos
    if (STATIC_ASSETS.includes(url.pathname) || url.pathname.startsWith('/icons/')) {
        event.respondWith(
            caches.match(request).then((response) => {
                if (response) {
                    console.log('[SW] Servindo do cache:', url.pathname);
                    return response;
                }
                return fetch(request).then((fetchResponse) => {
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, fetchResponse.clone());
                        return fetchResponse;
                    });
                });
            })
        );
        return;
    }

    // Estratégia: Stale While Revalidate para CDN
    if (CDN_RESOURCES.includes(request.url)) {
        event.respondWith(
            caches.open(CACHE_NAME + '-cdn').then((cache) => {
                return cache.match(request).then((response) => {
                    const fetchPromise = fetch(request).then((networkResponse) => {
                        if (networkResponse.ok) {
                            cache.put(request, networkResponse.clone());
                        }
                        return networkResponse;
                    }).catch(() => response);

                    return response || fetchPromise;
                });
            })
        );
        return;
    }

    // Estratégia: Network First para outros recursos
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
            console.log('[SW] Network falhou, tentando cache:', url.pathname);
            return caches.match(request);
        })
    );
});

// Mensagens do cliente
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});
