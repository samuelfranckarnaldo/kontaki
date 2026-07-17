// Versão do produto (Kontaki), independente da versão de cache do
// Service Worker (sw.js). Ver RELEASE.md para o checklist completo.
//
// APP_VERSION: usada em "Sobre", nas mensagens do Console (comparação
// com min_app_version/max_app_version), e em qualquer lugar que
// precise de comunicar a versão ao utilizador.
//
// BUILD: contador interno para diagnóstico, logs e suporte. Não é
// mostrado ao utilizador como "versão".
export const APP_VERSION = "1.0.0";
export const BUILD = 1;
