# ADR-0007 — Assinatura de Respostas de Licenciamento

**Estado:** Aceite e implementado (testado localmente: assinatura,
verificação, nonce anti-replay)
**Data:** 2026-08-05
**Âmbito:** `api/routes/licenses.js` (Console); `crypto.js`, `license.js`
(Kontaki)
**Depende de:** 03-threat-model.md (Cenário 4)
**Relacionado:** ADR-0004 (mesmo padrão aplicado a convites — par de
chaves independente, raio de impacto isolado)

## Contexto

O Cenário 4 do Threat Model identifica interceção de rede
(Kontaki ↔ Console) como mitigada primariamente por HTTPS/TLS, com
"assinatura de resposta do Console" já listada como hardening
adicional pendente. Com licenciamento a decidir directamente se a
aplicação funciona ou fica bloqueada, e mensagens bloqueantes capazes
de parar operação em qualquer loja, o custo de um TLS comprometido
(ex: proxy corporativo com certificado raiz instalado no dispositivo,
ou qualquer ponto de terminação de TLS fora do controlo directo da
Introxeer) deixou de ser aceitável sem defesa em profundidade.

## Perguntas a decidir

- **Âmbito da primeira fase:** assinar tudo de uma vez, ou faseado?
  Decisão: faseado — licenciamento (`/verify`, `/activate`) primeiro,
  por ser o vector com maior impacto imediato (negar/conceder acesso
  à app inteira). Mensagens bloqueantes (`/messages`) e Kill Switch
  seguem como próximas fases, já desenhadas mas fora do âmbito deste
  ADR. `/sync` fica deliberadamente para a V2 (ver Não-decisões).
- **Comportamento em falha de verificação:** bloquear a app (fail-
  closed) ou manter a última licença válida em cache (fail-open)?
  Decisão: fail-open, coerente com o offline-first já estabelecido
  (mesmo padrão do aviso após 7 dias sem validação em
  `validateLicenseOnline`) — uma falha de verificação de assinatura é
  tratada como uma falha de rede, não como prova de ataque.

## Decisão

- **Curva e algoritmo:** ECDSA P-256, mesma escolha do ADR-0004(SHA-256,
  suporte nativo desde cedo em todos os browsers-alvo do produto).
- **Par de chaves independente** do de convites — chave privada
  própria (`LICENSE_PRIVATE_KEY`), gerada uma vez, guardada apenas
  como variável de ambiente sensível na Vercel (nunca em código, nunca
  em base de dados). Isolamento de raio de impacto: comprometer uma
  chave não compromete a outra.
- **Campos assinados:** cada resposta de `/verify` e `/activate` é
  assinada sobre uma string canónica que inclui todos os campos que
  influenciam o comportamento da app (`valid`/`success`, `plan`,
  `expiresAt`/`activatedAt`, `reason`, `revokeCategory`,
  `serverTime`) — nunca apenas um subconjunto, para que nenhum campo
  não assinado possa ser adulterado sem invalidar a assinatura.
- **Nonce anti-replay:** o cliente gera um nonce aleatório por pedido
  (`generateNonce()`, `crypto.getRandomValues`) e envia-o no corpo do
  pedido. O servidor inclui esse nonce na string assinada e devolve-o
  na resposta. O cliente rejeita qualquer resposta cujo nonce não
  corresponda ao que enviou — sem isto, uma resposta "licença válida"
  capturada poderia ser reproduzida mais tarde para simular uma
  licença já revogada/expirada.
- **Exceção deliberada:** a resposta "Licença não encontrada" (código
  inexistente) não é assinada — não há decisão de licenciamento a
  proteger nesse caso (não existe licença cujo estado possa ser
  forjado), pelo que assinar traria custo sem benefício de segurança.
  O cliente reconhece esta excepção especificamente por
  `error === "Licença não encontrada" && !signature`; qualquer outra
  resposta sem assinatura é tratada como suspeita.
- **Verificação no cliente:** `verifyLicenseSignature()` em
  `crypto.js`, reaproveitando `pemToArrayBuffer`/`derToRawSignature`
  já existentes do ADR-0004 (conversão DER→raw, formato exigido pela
  Web Crypto API para ECDSA). A chave pública fica embutida no bundle
  — não é segredo.
- **Falha de verificação (assinatura inválida ou nonce inesperado):**
  tratada como falha de rede — a função devolve `null` (mesmo
  contrato já usado para falha de `fetch`), sem alterar o estado local
  da licença. A última licença válida em cache continua a funcionar
  (fail-open), com o erro registado em consola para investigação.

## Alternativas rejeitadas

- **mTLS / certificate pinning** — rejeitado: não existe API estável
  para pinning de certificado em `fetch()` dentro de uma PWA/browser
  padrão; a cadeia de confiança TLS é gerida inteiramente pelo
  sistema/browser, fora do alcance do código da aplicação. mTLS
  exigiria distribuir e proteger um certificado de cliente por
  dispositivo, com complexidade operacional desproporcional ao ganho
  face à assinatura de resposta (que já cobre o vector relevante:
  confiar cegamente numa resposta adulterada).
- **Reaproveitar o par de chaves de convites (ADR-0004)** — rejeitado:
  um segredo comprometido não deve arrastar dois sistemas distintos
  (convites de equipa + licenciamento) para o mesmo raio de impacto.
- **Fail-closed em falha de verificação** — rejeitado nesta fase:
  transformaria uma falha de rede genuína, ou um eventual bug de
  verificação, num bloqueio total da app para todos os lojistas.
  Fail-open mantém-se coerente com a filosofia offline-first já
  estabelecida (ex: aviso, não bloqueio, após 7 dias sem validação).

## Consequências

- Nova variável de ambiente obrigatória no Console:
  `LICENSE_PRIVATE_KEY` (Vercel, marcada Sensitive).
- `/verify` e `/activate` passam a exigir `nonce` no corpo do pedido —
  pedidos sem ele recebem `400`. Quebra de compatibilidade deliberada
  com qualquer cliente anterior a este ADR (aceitável: sem
  utilizadores em produção dependentes do contrato antigo nestes dois
  endpoints ainda).
- Bundle do Kontaki cresce ligeiramente com a chave pública embutida
  (`LICENSE_PUBLIC_KEY_PEM` em `crypto.js`) — não é segredo, sem
  impacto de segurança em ficar em claro no código-fonte.
- `activateLicense()` e `validateLicenseOnline()` em `license.js`
  passam a depender de `crypto.js` (import novo).

## Não-decisões

- **Mensagens bloqueantes (`/messages`)** — mesmo padrão de assinatura
  planeado como próxima fase, incluindo campos adicionais (`id`,
  `created_at`, `expires_at`, `version`) para impedir replay de
  mensagens antigas. Não implementado neste ADR.
- **Kill Switch** (manual e alertas automáticos) — desenho já
  acordado em duas camadas (interruptor manual no Console; deteção
  automática gera alerta, nunca bloqueia sozinha), mas é uma decisão
  de arquitetura distinta desta, com o seu próprio ADR quando
  implementado.
- **Assinatura de `/sync`** — adiada deliberadamente para a V2, altura
  em que a sincronização em tempo real for revista como um todo. Hoje
  `/sync` já está atrás de HTTPS e validação de licença; o Cenário 12
  do Threat Model já assume que integridade de dados locais não é
  garantida contra um proprietário com acesso root ao próprio
  dispositivo, o que reduz a urgência relativa deste vector face ao
  licenciamento e às mensagens bloqueantes.
- **Detecção automática de padrões anómalos** (força bruta avançada,
  fingerprinting de comportamento) — fora de âmbito; o rate limiting
  dedicado já existente (Cenário 9) permanece a mitigação principal
  para enumeração de códigos.
