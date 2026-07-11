# ADR-0002 — Modelo de Gestão da StoreKey Compartilhada

**Estado:** Aceite (V1); V2 registada como evolução futura
**Data:** 2026-07-11
**Âmbito:** `db.js`, `services.js` (`storeKeyService`), `components/seguranca.js`, futura camada de integridade (ADR-0003)

## Contexto

Uma primeira versão deste ADR propunha eliminar a persistência da
`storeKey`, derivando-a sob pedido a partir do PIN do administrador.
Essa proposta foi feita **sem ver o código de `services.js` e
`seguranca.js`**, e revelou-se incompatível com uma funcionalidade já
implementada: a `storeKey` assina, via HMAC, os ficheiros `.ktk`
(fecho de sessão) e `.ktkcat` (catálogo), que são **exportados de um
dispositivo e importados/validados noutro**. Isto só funciona se todos
os dispositivos da loja partilharem exatamente o mesmo valor de chave
— algo que uma derivação local a partir de um PIN (potencialmente
diferente por dispositivo) não garante.

Existe já um mecanismo funcional e deliberado para isto —
`storeKeyService.export()`/`.import()`, com UI dedicada em
`seguranca.js` — que cifra a chave com password (AES-GCM,
PBKDF2) para transporte manual (WhatsApp, Bluetooth, cabo) entre
dispositivos. Este ADR corrige o rumo: em vez de substituir este
mecanismo, documenta-o como decisão consciente e define como evoluir
a sua proteção em repouso sem quebrar a compatibilidade.

## Princípio: a `storeKey` pertence ao domínio Loja, não ao domínio Utilizador

Os operadores autorizados podem *utilizá-la*; não são *donos* dela.
Isto significa, deliberadamente, que a proteção da `storeKey` **não**
depende do PIN individual de cada operador — evita a complexidade de
gerir wraps por utilizador (criação, remoção, rotação, recuperação de
PIN), que protegeria uma chave da loja com uma granularidade que não
lhe corresponde.

## Decisões de produto (herdadas, reconfirmadas)

1. **Zero fricção adicional.** Mantém-se — nenhuma segunda passphrase
   dedicada só à `storeKey`.
2. **Não é P0.** Mantém-se — exige acesso físico/extração local.

## Decisão — V1: preservar o desenho funcional existente

A V1 **não** altera o comportamento atual:

- Existe exatamente uma `storeKey` por loja.
- Continua persistida em `settings.storeKey`.
- Continua exportável/importável com password
  (`storeKeyService`), sem alterações a essa API.
- Continua a assinar `.ktk` e `.ktkcat` via `hmacSha256`.

Este ADR **não** motiva nenhuma alteração de código na V1 — a
fraqueza identificada em `04-data-classification.md` (chave sensível
persistida em claro na mesma base que protege) fica formalmente aceite
como risco conhecido, não urgente (decisão de produto 2), com uma
rota de evolução definida abaixo, não implementada agora.

## Decisão — V2 (evolução futura, não V1): distribuição centralizada via Console

A evolução escolhida para V2 vai além de cifra em repouso — substitui
o modelo de transporte manual por distribuição centralizada:

V1: storeKey → persistida em claro → export/import manual (password,
ficheiro via WhatsApp/Bluetooth/cabo) → HMAC
V2: storeKey → gerada/custodiada com apoio do Console
→ convite passa a ser um token de uso único (não um
contentor de dados)
→ novo dispositivo resgata o token junto do Console,
que valida licença/permissões e entrega storeKey +
dados iniciais da loja através de HTTPS
→ dispositivo guarda a storeKey localmente e volta a
operar offline normalmente
→ export/import manual mantém-se apenas como mecanismo
de recuperação (ou é descontinuado — decisão final
a tomar no desenho da V2), não como via principalVantagens identificadas para esta direção: elimina erro humano na
distribuição manual, permite revogação centralizada de convites,
reduz superfície de ficheiros `.ktkinvite`/chave a circular fora de
canais controlados.

Troca a decidir explicitamente no desenho da V2, não aqui: o fluxo
atual de aceitação de convite é **hoje 100% offline** (QR code ou
ficheiro, sem rede necessária — ver `role-select.js`), desenhado
deliberadamente para lojas sem internet no momento em que um novo
funcionário se junta. Um modelo de resgate via Console exige internet
nesse mesmo momento para o **novo dispositivo**, não só para quem gera
o convite. A V2 precisa de decidir conscientemente se aceita esta
perda de capacidade offline nesse ponto específico, ou se mantém o
fluxo atual como alternativa/fallback.

Esta evolução é tratada como projeto próprio no seu desenho (toca
onboarding, gestão de dispositivos, convites, sincronização,
recuperação — não é um patch incremental), não implementada nesta
versão do ADR.

## Alternativas rejeitadas

- **Derivação sob pedido a partir do PIN do admin (proposta original
  desta ADR)** — rejeitada: incompatível com a partilha entre
  dispositivos, que é requisito de produto já implementado.
- **Wrap por utilizador (uma cópia cifrada da `storeKey` por
  operador)** — rejeitada: complexidade desproporcional para proteger
  uma chave cujo domínio é a Loja, não o Utilizador; gera problemas
  colaterais (rotação em criação/remoção de operador, recuperação de
  PIN) sem benefício de segurança adicional real.
- **Implementar já a V2** — rejeitada para esta versão: não é P0
  (decisão de produto 2), e implementar sem urgência aumentaria o
  risco de regressão num mecanismo (`.ktk`/`.ktkcat`) que já funciona
  e é usado em produção-equivalente.

## Consequências

- Nenhuma mudança de código nesta versão. `db.js`, `services.js`,
  `seguranca.js` mantêm-se exatamente como estão.
- `ADR-0003` (Modelo de Integridade Local) pode agora prosseguir com
  informação correta: **já existe** uma cadeia de confiança a nível de
  sessão (`sessions.uuid` + `prevSessionUuid` + `ktkHash`) — o desenho
  de ADR-0003 deve reconciliar-se com este mecanismo existente
  (estendê-lo/reforçá-lo), não propor uma cadeia paralela por registo
  a partir do zero.
- `01-identity.md` deve ser atualizado: `catalogId` está confirmado
  no código (`generateKtkcatHash`), deixa de ser pendência.

## Não-decisões

- Não implementa a V2 — fica registada como direção futura, sem data.
- Não resolve a rotação da `storeKey` (ex: se um dispositivo for
  comprometido, como invalidar e redistribuir uma nova chave a todos
  os dispositivos legítimos) — fica como pendência a levantar quando
  a V2 for priorizada.
