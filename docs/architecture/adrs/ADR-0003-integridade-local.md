# ADR-0003 — Modelo de Integridade Local

**Estado:** Aguarda revisão — ADR-0002 revisto confirma cadeia existente a nível de sessão (sessions.uuid + ktkHash); ADR-0003 deve reconciliar-se com ela, não propor mecanismo paralelo
**Data:** 2026-07-11
**Âmbito:** `sales`, `saleItems`, `stockMovements`, `stockCorrections` (ver 04-data-classification.md)
**Depende de:** 01-identity.md, 02-consistency.md, 03-threat-model.md (Cenário 12)

## Contexto

`03-threat-model.md` (Cenário 12) reconhece que o Kontaki não pode
impedir que alguém com acesso direto ao IndexedDB altere registos
operacionais (vendas, stock) fora do fluxo normal da aplicação — mas
pode tornar essa alteração **detetável**. `04-data-classification.md`
identificou os dados de nível Operacional como candidatos a esse
mecanismo, precisamente porque para eles a prioridade é integridade,
não confidencialidade.

Este ADR desenha esse mecanismo.

## Decisões de produto já tomadas

Estas foram decididas antes de o mecanismo ser desenhado, e moldam
diretamente o desenho abaixo:

1. **Deteção, não bloqueio.** Uma quebra de integridade não impede o
   funcionamento normal do POS. Regista-se o incidente, avisa-se o
   administrador, marca-se o registo afetado como "integridade
   comprometida" — e bloqueiam-se apenas operações que dependam
   explicitamente dessa garantia (ex: uma exportação certificada), não
   a operação diária de vendas.
2. **Dois momentos de cálculo/verificação.** O hash é calculado na
   escrita (prova local imediata); é verificado na sincronização com
   o Console, quando esta existir. Não há verificação contínua a cada
   leitura — custo desnecessário face ao valor.

Ambas consistentes com o princípio orientador do Threat Model: tornar
a adulteração indetetável mais difícil do que operar honestamente, sem
prometer prevenção que a arquitetura client-side não pode garantir.

## Mecanismo: cadeia de hash por store, por dispositivo

Cada store protegida (`sales`, `stockMovements`, etc.) mantém uma
cadeia de hash **local ao dispositivo**: cada novo registo inclui o
hash do registo anterior na mesma cadeia, formando uma sequência onde
alterar ou remover um registo intermédio quebra a verificação de tudo
o que vem depois.hash[n] = HMAC(storeKey, conteúdo[n] + hash[n-1])
hash[0] = HMAC(storeKey, conteúdo[0] + "genesis")- **Chave:** a `storeKey` já gerada em `db.seed()` — reutiliza-se o
  mecanismo existente em vez de introduzir um segredo novo. A robustez
  desta cadeia herda diretamente o resultado de ADR-0002 (gestão de
  chaves) — se a `storeKey` continuar acessível no mesmo IndexedDB que
  protege, um atacante com acesso de escrita direto ao IndexedDB pode,
  em teoria, recalcular a cadeia inteira após adulterar um registo.
  **Este mecanismo não resolve isso** — é uma dependência explícita de
  ADR-0002, não uma limitação nova introduzida aqui.
- **Escopo da cadeia:** por dispositivo, não por loja. Isto é
  consequência direta da lacuna já registada em `01-identity.md`:
  `sales.id` é local ao dispositivo, não existe hoje um identificador
  de âmbito de loja para vendas. Uma cadeia por dispositivo deteta
  adulteração *dentro desse dispositivo*, mas não tem hoje forma de se
  combinar com a cadeia de outro dispositivo da mesma loja num sentido
  único e verificável — essa extensão fica para quando a lacuna de
  identidade for resolvida (ver Não-decisões).

## O que este mecanismo deteta

- Alteração do conteúdo de um registo existente (o hash seguinte deixa
  de bater certo).
- Remoção de um registo intermédio (quebra a sequência).
- Reordenação de registos.

## O que este mecanismo não deteta nem impede

- Um atacante com acesso de escrita ao IndexedDB e conhecimento da
  `storeKey` pode recalcular a cadeia inteira de forma consistente,
  tornando a adulteração indistinguível de dados legítimos — **isto é
  aceite como limitação conhecida**, não uma falha do desenho: nenhuma
  prova de integridade puramente local sobrevive a um atacante que
  controla tanto os dados como a chave que os verifica (consistente
  com Cenário 7 do Threat Model — dispositivo comprometido pelo
  próprio proprietário).
- Não impede a operação de continuar (decisão de produto 1, acima) —
  só torna a quebra visível quando verificada.
- Não estende a garantia entre dispositivos da mesma loja enquanto a
  lacuna de identidade (01-identity.md) não for resolvida.

## Estado "integridade comprometida"

Quando a verificação de uma cadeia falha (seja localmente ao reabrir a
app, seja na sincronização com o Console):

- O(s) registo(s) a partir do ponto de quebra são marcados com um
  campo próprio (ex: `integrityStatus: "compromised"`), nunca apagados
  (Princípio 4 de `02-consistency.md` — eventos nunca são apagados,
  mesmo quando suspeitos).
- Um evento de auditoria é criado em `logs`, visível ao administrador.
- Operações normais do POS continuam. Funcionalidades que dependam
  explicitamente de a cadeia estar íntegra (ex: uma futura exportação
  "certificada" para efeitos de auditoria externa) devem verificar
  este estado antes de prosseguir, e recusar-se nesse caso específico.

## Verificação na sincronização (quando existir)

Quando o Console receber dados de um dispositivo, deve recalcular a
cadeia recebida e comparar com o hash mais recente já conhecido para
aquele dispositivo. Uma quebra detetada nesse ponto é tratada da mesma
forma que uma quebra local — marcada, registada, não bloqueante para
o resto do sistema — mas com uma diferença importante: o Console **é**
a autoridade (02-consistency.md, Princípio 3), por isso uma
discrepância entre o que o dispositivo alega e o que o Console
recalcula é motivo para sinalização de maior prioridade do que uma
quebra encontrada só localmente, já que sugere adulteração pós-
-facto, não só corrupção acidental.

## Alternativas rejeitadas

- **Verificação contínua a cada leitura** — rejeitada pela decisão de
  produto 2 (custo sem valor proporcional).
- **Bloqueio imediato de operações ao detetar quebra** — rejeitada
  pela decisão de produto 1 (prioriza continuidade do negócio).
- **Cadeia única global desde já** (assumindo um identificador de loja
  para vendas que ainda não existe) — rejeitada por depender de uma
  premissa não verificada; preferível reconhecer o âmbito real
  (por dispositivo) do que fingir uma garantia mais forte do que a que
  o sistema hoje pode oferecer.

## Consequências

- Nova função central de escrita para cada store protegida (paralelo à
  regra de ownership já estabelecida em `04-data-classification.md`):
  o módulo proprietário de cada store é também o único responsável por
  calcular e anexar o hash da cadeia — nunca um `db.add`/`db.put`
  direto sem passar por essa função.
- Novo campo `integrityStatus` nos registos das stores protegidas.
- Depende de ADR-0002 ser resolvido para que a proteção da `storeKey`
  não seja o elo mais fraco desta cadeia.
- Verificação na sincronização é trabalho do lado do Console, a
  desenhar quando a sincronização real for implementada.

## Não-decisões

- Não resolve a lacuna de identidade entre dispositivos (`01-identity.md`)
  — a cadeia fica, por agora, com âmbito de dispositivo, não de loja.
  Estender para um âmbito de loja é trabalho futuro, dependente dessa
  resolução.
- Não resolve ADR-0002 (gestão de chaves) — este ADR depende dele mas
  não o decide.
- Não desenha o protocolo de sincronização em si, só o que acontece à
  verificação de integridade quando esse protocolo existir.
