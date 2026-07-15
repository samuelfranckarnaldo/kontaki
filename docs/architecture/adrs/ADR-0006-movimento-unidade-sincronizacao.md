# ADR-0006 — Movimento como Unidade de Sincronização

**Estado:** Proposta
**Data:** 2026-07-15
**Âmbito:** `services.js` (`ktkService.generate`, `ktkService.confirmImport`,
`addStockMovement`), `db.js` (`stockMovements`)
**Depende de:** `01-identity.md`, `02-consistency.md`, `ADR-0005`

## Contexto

O `.ktk` usa a sessão como única unidade de sincronização: um turno
inteiro é reconciliado de uma só vez, via delta agregado
(`stock_esperado`), aplicado uma única vez por `confirmImport`. Isto
impede um cenário de negócio real e já observado em teste direto: um
operador (caixa) precisa de receber stock atualizado de outro
dispositivo (admin ou colega) **antes** de fechar o próprio turno, não
só depois — e hoje não há forma de um dispositivo aplicar movimentos
de outro sem que esses movimentos venham empacotados como "o turno de
alguém".

Este ADR generaliza, entre dispositivos, uma regra que o Kontaki já
aplica dentro de um único dispositivo: **o stock nunca é a fonte de
verdade — é sempre derivado do histórico de `stockMovements`**
(`addStockMovement` nunca confia em `product.stock` guardado; recalcula
sempre via `getStock()`). O que muda aqui é estender essa mesma
verdade para ser válida entre dispositivos, não só dentro de um.

## Princípio orientador

> Todo evento de stock exportável possui identidade global própria
> desde a sua criação — não para identificar "que movimento é este",
> mas para responder à pergunta que importa para sincronização:
> **"este acontecimento já foi aplicado aqui?"**

Esta é uma categoria de identidade distinta das já definidas em
`01-identity.md`: produto responde a "que coisa é esta?", cliente
responde a "quem é esta pessoa?", movimento responde a "isto já
aconteceu (aqui)?". A tabela de `01-identity.md` deve ser lida com
esta terceira categoria em mente.

## Decisão

1. **Todo `stockMovement` exportável possui `uuid` global, gerado no
   momento da criação** — mesmo padrão de geração já usado para
   `client.uuid` (ADR-0005), aplicado a esta entidade.

2. **A sessão continua a ser a unidade de:**
   - auditoria e histórico;
   - assinatura (`ktkHash`);
   - prevenção de importação duplicada ao nível do ficheiro inteiro
     (`checkDuplicate(ktk.id_sessao)` mantém-se, sem alteração).

3. **O movimento passa a ser a unidade de sincronização de estado
   físico.** `confirmImport` aplica cada movimento individualmente:
   - movimento já conhecido localmente (por `uuid`) → ignorado;
   - movimento novo → aplicado.

   A aplicação é **idempotente e comutativa** — reenviar o mesmo
   `.ktk`, ou importar vários `.ktk`s fora de ordem, nunca duplica
   efeito nem produz resultado diferente consoante a ordem de chegada.

4. **`stock_esperado` não desaparece nem é substituído — muda de
   papel.** Deixa de ser o mecanismo que aplica o delta de stock
   (função que passa para o replay de movimentos, ponto 3); passa a
   ser **referência de validação/reconciliação**: permite comparar "o
   que os movimentos recebidos dizem que aconteceu" contra "o que se
   esperava, dado o stock de referência", e identificar divergência —
   sem nunca corrigir automaticamente. `stockMovements` responde "o
   que aconteceu"; `stock_esperado` permite perguntar "porque é que a
   expectativa era diferente".

5. **Vendas (`sales`) continuam locais à sessão/dispositivo que as
   gerou — nunca replicadas por este mecanismo.** Já é assim hoje
   (`confirmImport` nunca escreve em `sales`, só em `sessions`,
   `stockMovements`, `incidents`); este ADR confirma explicitamente
   que se mantém, e que a separação é deliberada: a sessão continua
   dona da venda (efeito financeiro/auditoria), o movimento é só o
   efeito físico (produto saiu do stock). Sincronizar disponibilidade
   física entre dispositivos nunca deve implicar herdar o histórico
   financeiro de outro dispositivo.

## Cenário de referência

Três dispositivos vendem o mesmo produto a partir do mesmo stock
inicial de referência (10 unidades), sem coordenação em tempo real:
Caixa A vende 7, Caixa B vende 5, Caixa C vende 4 — total 16, contra
10 disponíveis. A ordem de importação destes três `.ktk` **nunca**
decide qual venda "vence" ou é descartada — as três são aplicadas,
cada uma com o seu movimento próprio, e o resultado final (stock
negativo, -6) é idêntico independentemente da ordem de chegada. A
divergência entre `stock_esperado` (10) e o total vendido agregado
(16) é o que fica sinalizado para o admin resolver — nunca é o
sistema a decidir que uma das três vendas "não aconteceu" (consistente
com o Princípio 5 de `02-consistency.md`: reconciliação automática só
quando a regra é determinística; julgamento sobre uma quantidade
física real é sempre manual).

## Perguntas deliberadamente não fechadas aqui

- **Regra exata de quando sinalizar divergência** (limiar? sempre que
  o total agregado ultrapassa o stock de referência? janela de
  tempo, como o `detectConflicts` atual já usa parcialmente?) — fica
  para decisão de produto/UX, não para este ADR.
- **"X de Y dispositivos/turnos recebidos"** — exigiria um conceito
  novo (lista formal de dispositivos/caixas esperados por loja) que
  não existe hoje. Deliberadamente fora do âmbito deste ADR: o
  mecanismo aqui decidido é correto e funcional **sem** o sistema
  saber quantos dispositivos existem — saber "quantos faltam" é uma
  camada de gestão operacional, não uma condição para a sincronização
  em si funcionar corretamente. Ver pendência equivalente em
  `01-identity.md`.
- **Reexportação de um `.ktk` a partir de uma sessão já fechada
  anteriormente** — não é uma lacuna de arquitetura (a sessão fechada
  já persiste todos os dados que `ktkService.generate` precisa); é uma
  melhoria de produto (expor a mesma chamada já existente a partir da
  lista "Turnos anteriores"), tratada fora deste ADR.

## Alternativas rejeitadas

- **Substituir por completo `stock_esperado`/reconciliação por delta
  agregado por replay puro de eventos** — rejeitada: eliminaria a
  distinção útil entre "o que aconteceu" (movimentos) e "o que se
  esperava" (referência de validação), que já serve para detetar
  incidentes e conflitos. As duas responsabilidades coexistem, com
  papéis diferentes (ponto 4).
- **Desenhar já um sistema de gestão de dispositivos/equipa
  (identidade de dispositivo, ativo/desativado, "N de M recebidos")
  como parte deste ADR** — rejeitada por antecipar necessidade não
  comprovada; o mecanismo de sincronização aqui decidido não depende
  disso para ser correto.

## Consequências

- `stockMovements` ganha campo `uuid`, gerado na criação — propriedade
  opcional no objeto, sem exigir bump de `DB_VERSION` (mesmo
  raciocínio já aplicado a `pendingInitialCount`).
- `ktkService.generate` passa a incluir `uuid` em cada movimento
  exportado.
- `ktkService.confirmImport` precisa de verificar, por `uuid`, se cada
  movimento recebido já existe localmente antes de aplicar — nova
  lógica de deduplicação ao nível do movimento, complementar (não
  substituta) à deduplicação existente ao nível da sessão.
- `detectConflicts`, já sinalizado como usando identidade local
  (`productId`) em `02-consistency.md` (secção "Limitações
  conhecidas"), deve também passar a considerar `uuid` de movimento
  ao comparar — mas o âmbito exato dessa correção (só a chave, ou
  também estender a comparação para além de pendente-vs-pendente)
  permanece a decisão em aberto já registada nesse documento.
- A UI de revisão em Escritório (`escritorio.js`) já foi adaptada em
  `ADR-0005` para trabalhar com `catalogId`; precisa de revisão
  adicional para refletir que a confirmação passa a ser por
  movimento, não só por linha de produto agregada.

## Não-decisões

- Não decide a regra exata de sinalização de divergência (fica para
  decisão de produto).
- Não introduz gestão de dispositivos/equipa (fica como pendência
  registada em `01-identity.md`, sem compromisso de implementação).
- Não implementa o botão de reexportação de turno antigo (melhoria de
  produto separada, sem relação de dependência com este ADR).
