# ADR-0004 — Assinatura Assimétrica de Convites

**Estado:** Aceite e implementado (testado ponta a ponta: assinatura, verificação, rejeição de adulteração)
**Data:** 2026-07-11
**Âmbito:** `crypto.js`, `invite.js`, `components/perfil.js` (Kontaki); novo endpoint no Console
**Depende de:** 03-threat-model.md (Cenário 10)
**Relacionado:** ADR-0002 (a `storeKey` e a distribuição de dados de loja não são alteradas por este ADR — ver Não-decisões)

## Contexto

`INVITE_SECRET` está hardcoded e visível no bundle público do Kontaki.
Como a assinatura de convites usa esse segredo simetricamente
(HMAC), qualquer pessoa com acesso ao código-fonte consegue calcular
assinaturas válidas offline, incluindo para `role: "admin"`, para
qualquer `storeId` — bastando conhecê-lo ou adivinhá-lo (parcialmente
previsível, por conter um timestamp — ver `01-identity.md`).

Com lançamento público, convites de equipa ativos desde o dia um, e
licenças pagas reais, isto deixou de ser um risco arquitetural a
corrigir com calma — é um vetor de comprometimento total de qualquer
loja paga, bloqueante para lançamento.

## Restrição confirmada antes do desenho

O fluxo de **aceitação** de convite (`role-select.js`,
`handleInvitePayload`) é hoje inteiramente offline — QR code ou
ficheiro `.ktkinvite`, sem chamada de rede. Isto é deliberado,
coerente com o offline-first do produto, e **não é alterado por este
ADR**. A correção precisa de preservar essa propriedade.

## Decisão

Assinatura assimétrica (ECDSA, curva P-256):

- **Escolha de curva:** P-256 em vez de Ed25519, apesar de Ed25519 ser
  mais simples — Ed25519 no Web Crypto API só tem suporte em versões
  de browser mais recentes do que o mínimo já declarado pelo produto
  (Chrome/Edge 88+, Firefox 87+, Safari iOS 15+). P-256 tem suporte
  desde muito mais cedo em todos os browsers-alvo. Ambos nativos —
  sem dependências novas em nenhum dos dois lados.
- **Geração de chaves:** uma vez, no Console, via `crypto.generateKeyPairSync`
  nativo do Node. A chave privada nunca fica em código nem em base de
  dados — vive em variável de ambiente do servidor, mesmo padrão que
  `JWT_SECRET`. A chave pública é embutida no bundle do Kontaki (não é
  segredo — pode estar em claro).
- **Momento de assinatura, não de verificação:** só o momento de
  **gerar** um convite passa a exigir internet (ação do
  dono/gerente). O momento de **verificar/aceitar** um convite
  continua 100% offline, tal como hoje — a chave pública embutida no
  cliente é suficiente para isso, sem qualquer chamada de rede.
- **Credencial do pedido de assinatura:** o Console só assina um
  convite para um pedido acompanhado de um `code` de licença ativa e
  não revogada da loja (reutiliza a validação já existente em
  `licenses.js`/`/verify`) — impede que qualquer pessoa peça
  assinaturas ao Console à vontade.

## Fluxo revistoGerar (requer internet):
Kontaki (admin) → monta payload do convite
→ POST /api/invites/sign { payload, code }
Console          → valida code (licença ativa, não revogada)
→ assina payload com chave privada ECDSA
→ devolve payload + assinatura
Kontaki (admin) → mostra QR code / gera .ktkinvite, como hoje
Aceitar (offline, inalterado):
Kontaki (novo dispositivo) → lê QR / importa ficheiro
→ verifica assinatura com chave pública
embutida (crypto.subtle.verify)
→ resto do fluxo inalterado
(saveStoreLink, criação de utilizador)## Alternativas rejeitadas

- **Ed25519** — rejeitada por incompatibilidade de suporte de browser
  face ao mínimo já declarado pelo produto.
- **Validação online também na aceitação** (Console confirma o
  convite no momento em que o novo dispositivo o lê) — rejeitada
  nesta versão: quebraria o offline-first já confirmado como
  deliberado nesse ponto do fluxo. Fica como parte da direção da V2
  do ADR-0002 (resgate via Console), não decidida aqui.
- **Manter HMAC, só trocar o valor do segredo** — rejeitada: não
  resolve o problema de fundo (qualquer segredo simétrico embutido no
  cliente é, por definição, extraível).

## Consequências

- `crypto.js`: remove `INVITE_SECRET`; adiciona chave pública embutida
  e `verifyInviteSignature()` reescrita para ECDSA via
  `crypto.subtle.verify`. `signInvite()` é removida do cliente — a
  assinatura deixa de acontecer localmente.
- `invite.js`: `generateInvite()` passa a fazer `fetch` ao Console;
  torna-se assíncrona de forma mais visível (já era `async`, mas agora
  depende de rede, não só de I/O local) e pode falhar por falta de
  internet — precisa de tratamento de erro explícito na UI
  (`perfil.js`).
- Console: novo endpoint `POST /api/invites/sign`; nova variável de
  ambiente para a chave privada; geração do par de chaves é
  operação única, fora do código (não parte do deploy automático).
- `perfil.js`: `_generateInviteQR()` precisa de lidar com falha de
  rede (mensagem clara ao dono: "liga-te à internet para convidar um
  novo dispositivo").
- Convites já emitidos com a assinatura HMAC antiga deixam de
  verificar — aceitável, não há utilizadores em produção ainda.

## Não-decisões

- Não altera `storeKeyService`, `seguranca.js`, nem qualquer parte do
  ADR-0002 V1 — a `storeKey` continua a ser transportada por
  export/import manual, inalterado.
- Não implementa a distribuição centralizada de `storeKey` via
  Console — essa é a direção já registada como V2 do ADR-0002,
  tratada como projeto próprio.
- Não resolve a previsibilidade parcial do `storeId` (contém
  timestamp) — mitigada indiretamente por este ADR (já não é possível
  forjar uma assinatura válida mesmo conhecendo o `storeId`), mas a
  previsibilidade em si não é corrigida aqui.
