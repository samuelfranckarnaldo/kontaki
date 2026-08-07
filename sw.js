/*
 * Kontaki — Service Worker
 * Cache offline + runtime cache
 */

const CACHE_NAME = 'kontaki-v470';

const BASE = new URL('.', self.location.href).pathname.replace(/\/$/, '');

const ASSETS = [
  // HTML / PWA
  BASE + '/',
  BASE + '/index.html',
  BASE + '/reset.html',
  BASE + '/manifest.json',

  // Core
  BASE + '/src/main.js',
  BASE + '/src/auth.js',
  BASE + '/src/db.js',
  BASE + '/src/services.js',
  BASE + '/src/router.js',
  BASE + '/src/utils.js',
  BASE + '/src/modal.js',
  BASE + '/src/toast.js',
  BASE + '/src/logger.js',
  BASE + '/src/crypto.js',
  BASE + '/src/backup.js',
  BASE + '/src/print.js',

  // Autenticação / licença / sincronização
  BASE + '/src/license.js',
  BASE + '/src/permissions.js',
  BASE + '/src/invite.js',
  BASE + '/src/messages.js',
  BASE + '/src/message-ui.js',
  BASE + '/src/notifications.js',
  BASE + '/src/notification-ui.js',
  BASE + '/src/recovery-codes.js',
  BASE + '/src/sync.js',
  BASE + '/src/setup.js',
  BASE + '/src/role-select.js',

  // Estado / utilitários
  BASE + '/src/version.js',
  BASE + '/src/view-state.js',
  BASE + '/src/calendar.js',
  BASE + '/src/date-picker.js',
  BASE + '/src/pgc.js',
  BASE + '/src/picker.js',
  BASE + '/src/onboarding.js',

  // Componentes
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
  BASE + '/src/components/escpos-print.js',

  // Componentes adicionais
  BASE + '/src/components/bi.js',
  BASE + '/src/components/clientes.js',
  BASE + '/src/components/despesas.js',
  BASE + '/src/components/estoque.js',
  BASE + '/src/components/extras.js',
  BASE + '/src/components/multilojas.js',
  BASE + '/src/components/recibo-pdf.js',
  BASE + '/src/components/tesouraria.js',

  // Help
  BASE + '/src/help/despesas.js',
  BASE + '/src/help/incidentes.js',
  BASE + '/src/help/index.js',
  BASE + '/src/help/turno.js',
  BASE + '/src/help/vendas.js',

  // CSS
  BASE + '/src/styles/base.css',
  BASE + '/src/styles/components.css',
  BASE + '/src/styles/layout.css',
  BASE + '/src/styles/pages.css',
  BASE + '/src/styles/print.css',
  BASE + '/src/styles/dark.css',

  // Bibliotecas
  BASE + '/assets/lucide.min.js',
  BASE + '/assets/qrcode.min.js',
  BASE + '/assets/jspdf.min.js',
  BASE + '/assets/vendor/chart.umd.min.js',

  // Ícones / PWA
  BASE + '/assets/icons/icon-48.png',
  BASE + '/assets/icons/icon-96.png',
  BASE + '/assets/icons/icon-192.png',
  BASE + '/assets/icons/icon-512.png',
  BASE + '/assets/icons/icon-maskable-512.png',
  BASE + '/assets/icons/icon-master-transparent.png',
  BASE + '/assets/icons/kontaki-k.svg',
  BASE + '/assets/icons/favicon.ico',
  BASE + '/assets/icons/favicon-32x32.png',
  BASE + '/assets/icons/favicon-16x16.png',
  BASE + '/assets/icons/apple-touch-icon.png'
];


/*
 * INSTALL
 *
 * O novo SW só é instalado se todos os assets essenciais
 * puderem ser encontrados.
 */
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return cache.addAll(ASSETS);
      })
      .then(function() {
        return self.skipWaiting();
      })
  );
});


/*
 * ACTIVATE
 *
 * Remove caches de versões antigas.
 */
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys()
      .then(function(keys) {
        return Promise.all(
          keys
            .filter(function(key) {
              return key !== CACHE_NAME;
            })
            .map(function(key) {
              return caches.delete(key);
            })
        );
      })
      .then(function() {
        return self.clients.claim();
      })
  );
});


/*
 * FETCH
 */
self.addEventListener('fetch', function(event) {

  const request = event.request;

  // Apenas GET.
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  /*
   * Não intercepta APIs ou recursos de outros domínios.
   *
   * Exemplo:
   * https://kontaki-console.vercel.app/api/...
   */
  if (url.origin !== self.location.origin) {
    return;
  }

  // O próprio Service Worker não entra no cache.
  if (url.pathname.endsWith('/sw.js')) {
    return;
  }


  /*
   * DOCUMENTOS
   *
   * Cache first.
   *
   * Se não houver cache:
   *   rede -> guarda no cache
   *   offline -> index.html
   */
  if (request.destination === 'document') {

    event.respondWith(
      caches.match(request)
        .then(function(cached) {

          if (cached) {
            return cached;
          }

          return fetch(request)
            .then(function(response) {

              if (
                response &&
                response.status === 200 &&
                response.type === 'basic'
              ) {
                const clone = response.clone();

                caches.open(CACHE_NAME)
                  .then(function(cache) {
                    cache.put(request, clone);
                  });
              }

              return response;
            })
            .catch(function() {

              return caches.match(
                BASE + '/index.html'
              );
            });
        })
    );

    return;
  }


  /*
   * JS / CSS / imagens / outros recursos locais
   *
   * Cache first + runtime caching.
   *
   * Se um novo módulo for criado futuramente e for carregado
   * com import(), ele poderá entrar automaticamente no cache
   * na primeira utilização online.
   */
  event.respondWith(

    caches.match(request)
      .then(function(cached) {

        if (cached) {
          return cached;
        }

        /*
         * Não há cache.
         * Tenta obter da rede.
         */
        return fetch(request)
          .then(function(response) {

            /*
             * Só guarda respostas normais do próprio servidor.
             */
            if (
              response &&
              response.status === 200 &&
              response.type === 'basic'
            ) {
              const clone = response.clone();

              caches.open(CACHE_NAME)
                .then(function(cache) {
                  cache.put(request, clone);
                });
            }

            return response;
          });
      })
  );
});


/*
 * MESSAGE
 *
 * Permite pedir atualização ou limpeza do cache
 * a partir da aplicação.
 */
self.addEventListener('message', function(event) {

  if (!event.data) {
    return;
  }

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.delete(CACHE_NAME)
    );
  }
});
