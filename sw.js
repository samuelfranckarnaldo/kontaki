const CACHE_NAME = 'kontaki-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/reset.html',
  '/src/main.js',
  '/src/auth.js',
  '/src/db.js',
  '/src/services.js',
  '/src/router.js',
  '/src/utils.js',
  '/src/modal.js',
  '/src/toast.js',
  '/src/logger.js',
  '/src/backup.js',
  '/src/print.js',
  '/src/crypto.js',
  '/src/components/vender.js',
  '/src/components/produtos.js',
  '/src/components/fiados.js',
  '/src/components/historico.js',
  '/src/components/perfil.js',
  '/src/components/dashboard.js',
  '/src/components/turno.js',
  '/src/components/seguranca.js',
  '/src/components/incidentes.js',
  '/src/components/fornecedores.js',
  '/src/components/quickmode.js',
  '/src/components/configuracoes.js',
  '/src/components/camera.js',
  '/src/styles/base.css',
  '/src/styles/components.css',
  '/src/styles/layout.css',
  '/src/styles/pages.css',
  '/src/styles/print.css',
  '/assets/lucide.min.js',
  '/assets/qrcode.min.js',
  '/assets/fonts/DMSans-Regular.woff2',
  '/assets/fonts/DMSans-Medium.woff2',
  '/assets/fonts/DMSans-SemiBold.woff2',
  '/assets/fonts/DMSans-Bold.woff2',
];

// Instala e faz cache de todos os assets
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activa e limpa caches antigos
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Serve do cache — offline first
self.addEventListener('fetch', function(e) {
  // Ignora requests não GET
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;

      return fetch(e.request).then(function(response) {
        // Guarda no cache apenas respostas válidas
        if (response && response.status === 200 && response.type === 'basic') {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, clone);
          });
        }
        return response;
      }).catch(function() {
        // Sem rede e sem cache — devolve index.html para SPA
        if (e.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
