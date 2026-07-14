# 02 — Consistência

**Estado:** Aceite
**Depende de:** 01-identity.md
**Referenciado por:** adrs/

## Propósito

Responder à pergunta: **quando existem várias cópias do mesmo estado,
como sabemos qual é a correta?** Inevitável num sistema offline-first,
onde cada dispositivo mantém a sua própria cópia local dos dados. Este
documento define os princípios que regem como essas cópias divergem e
como voltam a convergir — não o protocolo técnico de sincronização em
si, que fica para um ADR de implementação quando for priorizado.

## Princípios

1. **Offline-first.** Um dispositivo é sempre capaz de operar
   autonomamente, sem depender de ligação a outro dispositivo ou ao
   servidor.
2. **Cada dispositivo é autoridade sobre os seus próprios dados locais**
   até haver reconciliação. Não existe "bloqueio" à espera de outro
   dispositivo confirmar algo.
3. **O servidor, quando existe e está acessível, é a autoridade final**
   sobre dados cuja fonte de verdade lhe pertence (ex: estado de
   licença — ver ADR-0001). Para dados operacionais gerados
   localmente, o servidor é destino de sincronização, não gerador.
4. **Eventos nunca são apagados.** Um facto que ocorreu (uma venda, uma
   revogação, um fecho de turno) permanece registado; correções ou
   reversões são **novos eventos**, não edições que apagam o original.
5. **Reconciliação automática só quando a regra de resolução é
   determinística** (ex: monotonicidade de timestamp, deduplicação por
   identificador). Quando a divergência envolve julgamento humano ou
   uma quantidade física real — stock, por exemplo — a reconciliação é
   manual.
6. **Toda operação sincronizável deve ser idempotente.** Reenviar a
   mesma operação (por falha de rede, retry) nunca deve duplicar o seu
   efeito.
7. **Nenhum valor que representa "o mais recente estado conhecido"
   pode andar para trás** (monotonicidade — já formalizado para tempo
   de licença em ADR-0001; aplica-se a qualquer campo equivalente,
   como marcas de sincronização).

## "Última escrita vence" — âmbito de aplicação

Esta política resolve conflitos de **substituição** (a última intenção
do utilizador é o que se quer preservar — ex: preferências,
configurações). **Não se aplica** a dados aditivos, onde múltiplas
escritas concorrentes devem coexistir, não competir por qual
"vence" — o exemplo mais claro é uma venda: duas vendas concorrentes em
dois dispositivos são dois factos válidos, nunca um substituindo o
outro.

## Cenário de referência

Dois dispositivos da mesma loja, ambos offline, ambos vendem a última
unidade do mesmo produto. Ao sincronizar: as duas vendas mantêm-se
(Princípio 4 e regra de "última escrita vence" acima); o stock
resultante pode ficar negativo, e isso não é corrigido
automaticamente — é sinalizado para reconciliação manual (Princípio
5), porque só uma contagem física resolve qual é o número real.

Qualquer mecanismo de sincronização futuro deve passar este cenário
sem fazer desaparecer uma venda nem "ajustar" o stock silenciosamente.

## Limitações conhecidas

Esta secção regista comportamento existente que ainda não satisfaz
completamente os princípios acima — distinto de "Não-decisões"
(que são escolhas deliberadas de âmbito), isto é uma lacuna entre o
que o código faz hoje e o que este documento exige.

### Deteção de conflitos entre dispositivos

A implementação atual de `ktkService.detectConflicts` compara apenas
importações `.ktk` ainda pendentes entre si. Não compara operações
recebidas contra vendas ou movimentos já confirmados no dispositivo
reconciliador.

Consequentemente, cenários onde:
- um dispositivo executa operações localmente;
- outro dispositivo executa operações offline;
- uma das operações já está confirmada antes da sincronização;

podem não ser identificados pelo mecanismo atual — o cenário de
referência descrito acima (duas vendas concorrentes do mesmo produto)
só é detetado quando ambas chegam como ficheiro `.ktk` pendente; não
quando uma delas já é o estado local confirmado do dispositivo que
reconcilia.

Esta limitação não altera o princípio definido neste documento:
conflitos entre estados divergentes devem ser identificados através
de identidade global e regras explícitas de reconciliação. A
expansão deste comportamento fica pendente de definição do modelo
completo de conflitos multi-dispositivo — a decidir quando houver
conteúdo suficiente para tratar conflito de stock, de venda, de
cliente, prioridade entre dispositivos, resolução automática vs.
manual, e estados possíveis de um conflito (ex: `pending_resolution`,
`resolved`). Até lá, permanece como questão aberta dentro deste
documento, não como documento próprio.

A implementação atual também utiliza identificadores locais
(`productId`) para agrupamento de produtos durante a deteção de
conflitos. Como definido em `01-identity.md`, referências entre
dispositivos devem usar identidade global (`catalogId`). A correção
desta inconsistência específica depende da implementação do contrato
de identidade definido em `ADR-0005` — mas expandir o âmbito da
deteção (comparar também contra estado local confirmado, não só entre
pendentes) é decisão separada, que fica para o modelo completo de
conflitos multi-dispositivo, não para o `ADR-0005`.

## Não-decisões

- Não desenha o protocolo de sincronização real (formato de payload,
  frequência, tratamento de erros de rede).
- Não resolve a lacuna de identificadores locais vs. de loja para
  `userId`/`saleId` — ver `01-identity.md`.
- Não redesenha o fluxo de reconciliação de stock já existente no
  produto — só estabelece o princípio geral que esse fluxo deve
  seguir.
