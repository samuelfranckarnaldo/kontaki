# Checklist de Release

Antes de publicar uma nova versão do Kontaki:

- [ ] Atualizar `APP_VERSION` em `src/version.js`
- [ ] Incrementar `BUILD` em `src/version.js`
- [ ] Atualizar `CACHE_NAME` em `sw.js`
- [ ] Atualizar CHANGELOG (se existir)
- [ ] Commit + push
- [ ] Verificar atualização OTA num dispositivo real

`APP_VERSION` e `CACHE_NAME` são conceitos diferentes e mudam de
forma independente:

- `APP_VERSION` é sobre o **produto** — o que mudou para quem usa a
  app (bugs corrigidos, funcionalidades novas). É o que aparece em
  "Sobre" e o que o Console usa para decidir se uma mensagem de
  atualização já está resolvida (`min_app_version`).
- `CACHE_NAME` é sobre a **cache do Service Worker** — força os
  ficheiros a serem recarregados. Pode mudar sem a versão do produto
  mudar (ex: só um ícone ou ficheiro estático foi alterado), ou a
  versão do produto pode mudar sem precisar de nova cache (ex: só
  texto/metadados).

Nunca acoplar os dois automaticamente — mantém-nos como três linhas
separadas neste checklist, de propósito.
