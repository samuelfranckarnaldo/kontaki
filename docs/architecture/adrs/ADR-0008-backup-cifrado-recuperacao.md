# ADR-0008 — Backup Cifrado e Recuperação via Recovery Code

**Estado:** Aceite e implementado (testado ponta a ponta: cifragem, upload, restauro num dispositivo novo, com dados reais)
**Data:** 2026-08-04
**Âmbito:** `crypto.js`, `backup.js`, `recovery-codes.js`, `sync.js`, `services.js`, `setup.js`, `configuracoes.js` (Kontaki); `api/routes/backup.js`, `api/routes/recovery.js` (Console); tabelas `backups`, `recovery_code_wraps`, `recovery_tokens`, `restore_attempts` (Supabase)
**Depende de:** 03-threat-model.md (Cenário 11, Cenário 13)
**Relacionado:** ADR-0004 (mesmo padrão de mover segredo para o servidor, aplicado aqui à Master Key em vez de à assinatura de convites)

## Contexto

Cenário 13 do threat model identificava perda de dados locais
(IndexedDB corrompido, dispositivo perdido, app desinstalada sem
backup prévio) como risco de disponibilidade dentro do modelo de
ameaça, pedindo backup "suficientemente simples e frequente". Até
aqui, o único mecanismo era exportação manual de um ficheiro JSON em
claro — sem histórico, sem automação, e sem forma de restaurar um
dispositivo novo sem já ter esse ficheiro em mãos.

Cenário 11 identificava que o fluxo de recuperação (na altura, só de
PIN) não tinha as garantias mínimas — validação de posse da loja,
token gerado e comparado do lado do servidor, identificadores não
enumeráveis — e estava desacoplado do cliente. Este ADR estende esse
mesmo mecanismo (Recovery Code) para também autorizar restauro de
backup, cumprindo os requisitos que o Cenário 11 já exigia antes de
qualquer ligação real ao cliente.

## Decisão

O Console nunca conhece nem a Master Key nem o conteúdo do backup —
zero-knowledge storage. Isto é alcançado por um envelope de duas
camadas:

- **Master Key**: gerada uma única vez na vida da loja, `extractable:true`
  localmente (ver Alternativas rejeitadas), guardada como bytes em hex
  (não como objeto `CryptoKey` — suporte inconsistente confirmado
  entre browsers). Nunca sai do dispositivo em claro.
- **DEK**: nova a cada backup, cifra os dados com AES-256-GCM,
  embrulhada pela Master Key (não pelo Recovery Code diretamente).
- **Recovery Code → KEK**: cada um dos 10 códigos deriva uma KEK via
  PBKDF2-SHA256 (300k iterações, salt com `storeId`), que embrulha a
  Master Key. Regenerar os 10 códigos reembrulha a mesma Master Key —
  nunca a recria — para que backups antigos continuem sempre legíveis
  independentemente do estado atual dos códigos.

Autenticação de restauro em duas etapas, nunca devolvendo o backup na
primeira:

1. `POST /api/backup/restore` — recebe `{storeId, recoveryHash}` (o
   código em claro nunca sai do dispositivo); valida contra
   `recovery_code_wraps`; rate limit dedicado por `storeId` além do
   limiter por IP; devolve `wrappedMasterKey` + um Recovery Token
   opaco (uso único, TTL 5min, guardado no servidor só como hash
   SHA-256).
2. `GET /api/backup/download` — só aceita o token da etapa 1;
   invalida-o imediatamente ao ser consumido, mesmo que o download
   falhe depois.

Upload automático dispara por eventos com significado (abrir turno,
fechar turno, backup manual) mais um fallback de 4h — não por
intervalo curto fixo, porque a retenção de só os 10 backups mais
recentes por loja esgotaria a janela de histórico útil em minutos se
o upload fosse muito frequente.

## Fluxo
Criação/regeneração de códigos:
Master Key (persistente) → PBKDF2(code, storeId) → KEK → wrap → wrappedMasterKey[i]
→ enviado ao Console junto do hash de cada código (recovery_code_wraps)
Backup (evento: abrir/fechar turno, manual, ou fallback 4h):
dados da loja → DEK (nova) → AES-256-GCM → ciphertext
DEK → wrap com Master Key → wrappedDEK
{metadata, crypto} → POST /api/backup/upload → tabela backups (retenção: 10 mais recentes)
Restauro (dispositivo novo):
Store ID + Recovery Code → hash local → POST /restore
→ Console valida, devolve wrappedMasterKey + Recovery Token (não devolve o backup)
→ unwrapMasterKeyWithRecoveryCode() localmente
→ GET /download com o token (uso único) → backup mais recente da loja
→ decryptBackup() (AES-GCM: integridade autenticada, rejeita corrompido/adulterado)
→ restaura IndexedDB
## Alternativas rejeitadas

- **Master Key `extractable:false`** — rejeitada: a Web Crypto API não
  permite `wrapKey`/`exportKey` de uma chave não-extraível sob nenhuma
  circunstância, mesmo internamente. Como regenerar códigos exige
  reembrulhar a mesma Master Key (para não invalidar backups antigos),
  isto tornaria a regeneração impossível. `extractable:true` é a única
  opção funcionalmente viável; o risco residual (exfiltração via XSS
  same-origin) já existe de forma equivalente mesmo com chave
  não-extraível, que só impede a *exportação*, não o *uso indevido*
  por um atacante já em execução na origem.
- **Derivar a KEK do mesmo hash usado para autenticação
  (`hashRecoveryCode`)** — rejeitada: separação de domínios. Um valor
  que sai do dispositivo (o hash, enviado ao servidor) nunca deve ser
  o mesmo usado para uma operação que tem de ficar secreta.
- **Guardar `CryptoKey` diretamente no IndexedDB via structured
  clone** — rejeitada após confirmação em teste real: suporte
  inconsistente entre browsers (`SubtleCrypto.encrypt` falhava com
  "parameter 2 is not of type CryptoKey" após reidratação). Substituída
  por armazenamento em hex, sempre suportado.
- **Retenção de backups por tempo (ex. 30 dias) em vez de contagem** —
  rejeitada: uma loja pode ficar longos períodos offline (cenário
  normal, não excecional, para o produto); retenção por tempo
  arriscaria a loja ficar sem nenhum backup dentro da janela ao voltar
  a sincronizar. Retenção por contagem (10 mais recentes) dá cobertura
  previsível independente da regularidade de conectividade.
- **Upload automático por intervalo curto fixo (minutos)** — rejeitada:
  com retenção de 10 backups, um intervalo de minutos esgotaria o
  histórico útil (dias/semanas) em questão de minutos de uso ativo,
  indo contra o propósito de recuperação de desastre.

## Consequências

- `crypto.js` ganha módulo de backup cifrado: `generateMasterKey`,
  `wrapMasterKeyWithRecoveryCode`, `unwrapMasterKeyWithRecoveryCode`,
  `encryptBackup`, `decryptBackup`, `exportMasterKeyHex`,
  `importMasterKeyHex`. `makeMasterKeyNonExtractable` existe mas não é
  usada (ver Alternativas rejeitadas).
- `recovery-codes.js`: `getOrCreateMasterKey()`/`hasMasterKey()`;
  `generateCodesForUser()` agora também reembrulha a Master Key e
  envia os wraps; `triggerPendingSync()` reforçado no ciclo periódico
  de sync, não só no evento `online` (WebViews Android podem não
  disparar esse evento de forma fiável).
- `backup.js`: `downloadEncrypted()` (ficheiro `.ktkbackup` local),
  `uploadToConsole()` (manual), `autoBackupIfNeeded()` (automático,
  nunca bloqueia o fluxo principal em caso de falha),
  `restoreFromConsole()` (cliente do restauro).
- Console: tabelas novas `backups`, `recovery_code_wraps`,
  `recovery_tokens`, `restore_attempts`; endpoints
  `POST /api/backup/upload`, `POST /api/backup/restore`,
  `GET /api/backup/download`; `POST /api/recovery/backup` passa também
  a persistir wraps (mecanismo distinto do cofre de códigos em claro
  pré-existente, usado para suporte humano — não alterado).
- `PATCH /api/admin/licenses/:id/plan` criado como efeito colateral:
  `POST /admin/generate` criava sempre uma loja nova, mesmo para
  "mudar de plano" — causava lojas órfãs/duplicadas. Não fazia parte
  do escopo original deste ADR, mas foi bloqueante para o testar.

## Não-decisões

- Não implementa histórico de múltiplos backups navegável pelo
  utilizador — o restauro usa sempre o mais recente da loja.
- Não implementa migração automática de Master Keys já corrompidas no
  formato antigo (`CryptoKey` direto) para utilizadores reais — hoje
  gera-se silenciosamente uma nova, invalidando backups antigos dessa
  loja especificamente. Aceitável em fase de testes, pendente antes de
  produção com utilizadores existentes.
- Não decide o intervalo de upload automático em produção — 4h de
  fallback foi escolhido para desenvolvimento/testes; pode precisar de
  ajuste com uso real.
