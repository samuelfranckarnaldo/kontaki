const CACHE_NAME = 'kontaki-v363';
const BASE = self.location.pathname.replace(/\/sw\.js$/, '');

const ASSETS = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/reset.html',
  BASE + '/src/main.js',
  BASE + '/src/auth.js',
  BASE + '/src/db.js',
  BASE + '/src/services.js',
  BASE + '/src/router.js',
  BASE + '/src/utils.js',
  BASE + '/src/modal.js',
  BASE + '/src/toast.js',
  BASE + '/src/logger.js',
  BASE + '/src/backup.js',
  BASE + '/src/print.js',
  BASE + '/src/crypto.js',
  BASE + '/src/components/vender.js',
  BASE + '/src/components/produtos.js',
  BASE + '/src/components/fiados.js',
  BASE + '/src/components/historico.js',
  BASE + '/src/components/perfil.js',
  BASE + '/src/components/dashboard.js',
  BASE + '/src/components/turno.js',
  BASE + '/src/components/seguranca.js',
  BASE + '/src/components/fornecedores.js',
  BASE + '/src/components/escritorio.js',
  BASE + '/src/components/quickmode.js',
  BASE + '/src/components/configuracoes.js',
  BASE + '/src/components/camera.js',
  BASE + '/src/styles/base.css',
  BASE + '/src/styles/components.css',
  BASE + '/src/styles/layout.css',
  BASE + '/src/styles/pages.css',
  BASE + '/src/styles/print.css',
  BASE + '/assets/lucide.min.js',
  BASE + '/assets/qrcode.min.js',
  BASE + '/assets/jspdf.min.js',
  BASE + '/assets/fonts/DMSans-Regular.woff2',
  BASE + '/assets/fonts/DMSans-Medium.woff2',
  BASE + '/assets/fonts/DMSans-SemiBold.woff2',
  BASE + '/assets/fonts/DMSans-Bold.woff2',
  BASE + '/assets/icons/icon-96.png',
  BASE + '/assets/icons/icon-192.png',
  BASE + '/assets/icons/icon-512.png',
  BASE + '/assets/icons/icon-maskable-512.png',
  BASE + '/assets/icons/favicon.ico',
  BASE + '/assets/icons/favicon-32x32.png',
  BASE + '/assets/icons/favicon-16x16.png',
  BASE + '/assets/icons/apple-touch-icon.png',
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
