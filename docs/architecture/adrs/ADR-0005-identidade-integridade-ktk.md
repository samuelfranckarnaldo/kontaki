# ADR-0005 — Identidade e Integridade do Payload `.ktk`

**Estado:** Proposta
**Data:** 2026-07-14
**Âmbito:** `services.js` (`closeSession`, `ktkService.generate`,
`ktkService.confirmImport`, `generateKtkHash`), `db.js` (`clients`)
**Depende de:** `01-identity.md`, `ADR-0002`
**Distinto de:** `ADR-0003` — esse cobre deteção de adulteração local
em repouso (cadeia de hash por registo dentro de um dispositivo);
este ADR cobre a identidade e integridade do payload `.ktk` **em
trânsito** entre dispositivos, usando o `ktkHash` já existente
(`generateKtkHash`/`validateKtkHash`, referenciado em `ADR-0002`).

## Contexto

Inspeção direta do código de sincronização de turnos revelou três
instâncias concretas da Regra 1 de `01-identity.md` ("um identificador
local nunca é, por si só, um identificador entre dispositivos") já
violadas em produção:

1. **`stock_esperado` e `stock_movements`, dentro do `.ktk`, referenciam
   `productId`** — o identificador autoincrement local do dispositivo
   que fecha a sessão (`closeSession`) — **não `catalogId`**, que já
   existe, já é gerado corretamente em `catalogService.generate()`, e
   já é usado como identidade global de produto no `.ktkcat`. Quando
   `ktkService.confirmImport` reconcilia stock no dispositivo de
   destino, resolve o produto via `db.get("products",
   Number(productId))` — uma consulta pelo ID local do dispositivo de
   **origem**, que só coincide com o produto certo no destino por
   acidente de ordem de criação, não por garantia.

2. **`client` não possui atualmente uma identidade global persistente**;
   no formato `.ktk` atual, fiados dependem de `clientName`, uma
   referência não determinística que pode colidir entre dispositivos
   — não há garantia de que "João Silva" no dispositivo A e "João
   Silva" no dispositivo B sejam a mesma pessoa, nem forma de os
   distinguir quando não são.

3. **`generateKtkHash` filtra explicitamente os campos assinados em
   `stock_movements`** (`type, productId, qty, createdAt` — ver
   código-fonte) — um `catalogId` acrescentado a esses objetos não
   ficaria coberto pela assinatura sem alteração manual deste filtro.
   Mais grave: **`ktk.fiados` não está incluído em lado nenhum do
   payload assinado**. Hoje, o valor ou o cliente de um fiado pode ser
   alterado em trânsito sem invalidar o hash — a mesma classe de falha
   que motiva a Regra 1, ainda não coberta para esta entidade.

`stock_esperado`, ao contrário de `stock_movements`, entra por inteiro
no payload assinado (sem filtro) — uma mudança na origem desse campo
propaga automaticamente para a assinatura, sem tocar em
`generateKtkHash`. Esta assimetria entre os dois campos é relevante
para a decisão abaixo.

## Perguntas a decidir

1. Quando é gerado o identificador global de `client`? — **Fechada
   nesta ronda:** na criação do cliente, não na primeira exportação.
   Motivo: ao contrário de produto (que pode nascer localmente e só
   entrar no ecossistema `.ktkcat` mais tarde), cliente é entidade
   operacional desde o primeiro momento — pode gerar fiado, aparecer
   em venda, ser auditado, antes de qualquer sincronização acontecer.
   Atribuir a identidade global só na exportação criaria uma janela em
   que a mesma entidade muda de identidade a meio da sua vida.

2. Incidente precisa de identificador global próprio? — **Fechada
   nesta ronda, como recomendação, não bloqueio:** sim, seria correto
   a prazo (um incidente sincronizado pode vir a precisar de ser
   referenciado de volta — resolução por outro dispositivo, auditoria
   externa), mas hoje um incidente importado só é referenciado via
   `importedFrom: ktk.id_sessao`, que já é estável (`session.uuid`).
   Não bloqueia esta ronda de correção.

3. **Deliberadamente fora do âmbito deste ADR:** o que fazer quando
   `confirmImport` recebe um `catalogId` sem correspondência local
   (produto ainda não existe no dispositivo que importa). Isto é uma
   decisão de **política de reconciliação/sincronização** — envolve
   escolher entre bloquear a linha, importar como pendente de
   resolução, ou outra alternativa — e pertence ao futuro documento de
   Modelo de Consistência entre Dispositivos, não a um contrato de
   identidade. Decidir isto aqui misturaria duas camadas
   arquiteturais diferentes.

## Decisão

1. **`clients` ganha um campo `uuid`**, gerado no momento da criação
   do cliente (mesmo padrão de geração usado para `catalogId` em
   produtos, aplicado num momento diferente do ciclo de vida —
   ver Pergunta 1). `client.id` continua a existir, como identidade
   local ao dispositivo.

2. **`stock_esperado` e `stock_movements`, dentro do `.ktk`, passam a
   referenciar `catalogId`** em vez de `productId` local. O
   dispositivo de destino resolve `catalogId → product.id` local antes
   de qualquer reconciliação de stock.

3. **Fiados no `.ktk` passam a referenciar `client.uuid`**, mantendo
   `clientName` apenas como informação de apresentação — nunca como
   chave de correspondência entre dispositivos.

4. **`generateKtkHash` estende o payload assinado** para cobrir
   `catalogId` nos campos filtrados de `stock_movements`, e para
   incluir `fiados` (hoje ausente) — fechando a lacuna de integridade
   identificada no Contexto.

5. **Referências externas usam sempre identidade global, nunca
   identidade local** — este ADR não introduz uma regra nova; aplica,
   de forma concreta e específica ao `.ktk`, a Regra 1 já formalizada
   em `01-identity.md`.

## Alternativas rejeitadas

- **Gerar `client.uuid` só na primeira exportação** (espelhando
  literalmente o padrão de `catalogId`) — rejeitada por criar uma
  janela de mudança de identidade a meio da vida da entidade (ver
  Pergunta 1); cliente não tem o mesmo perfil de "pode nascer só
  local" que produto tem.
- **Resolver já, neste ADR, o comportamento de `confirmImport` perante
  `catalogId` desconhecido** — rejeitada por ser decisão de
  reconciliação/sincronização, não de identidade; adiada
  deliberadamente para o Modelo de Consistência entre Dispositivos
  (ver Pergunta 3).
- **Tornar `incident.uuid` obrigatório já nesta ronda** — rejeitada
  por não ser bloqueante: hoje a referência via `session.uuid` já
  é estável o suficiente para o uso atual do incidente importado.

## Consequências

- `closeSession` e `ktkService.generate` precisam de resolver e incluir
  `catalogId` (não só `productId`) ao montar `stock_esperado`/
  `stock_movements`.
- `ktkService.confirmImport` precisa de resolver produtos por
  `catalogId` no dispositivo de destino, não por `productId` bruto.
- `clients` ganha `uuid` na criação — sem migração de `DB_VERSION`
  necessária se implementado como propriedade opcional (clientes já
  existentes sem `uuid` precisam de estratégia de backfill, a
  decidir na implementação — não são cobertos automaticamente como
  aconteceu com `pendingInitialCount`, porque aqui a ausência do
  campo bloqueia sincronização, não é só metadado acessório).
- `generateKtkHash` muda de payload assinado — **quebra
  compatibilidade com `.ktk` gerados por dispositivos ainda não
  atualizados a este ADR.** Precisa de estratégia de versão; o
  precedente já existe (`ktk.versao === "1.0"` é tratado como legado
  em `validateKtkHash`) — o mesmo padrão de fallback é o candidato
  natural, mas a implementação exata fica por decidir fora deste ADR.
- Bug 1 (fiados nunca aplicados na importação, encontrado
  separadamente) só deve ser corrigido depois deste ADR, para não
  implementar o processamento de fiados apontando para `clientName`
  solto e ter de o corrigir outra vez pouco depois.

## Não-decisões

- Não decide a política de reconciliação quando um `catalogId`
  referenciado no `.ktk` não corresponde a nenhum produto local no
  destino (Pergunta 3) — fica para o Modelo de Consistência entre
  Dispositivos.
- Não implementa `incident.uuid` — fica recomendado, não bloqueante.
- Não desenha a estratégia exata de versão/compatibilidade do formato
  `.ktk` — só regista que é necessária.
- Não resolve o backfill de `uuid` para clientes já existentes em
  instalações atuais — fica para a implementação.
