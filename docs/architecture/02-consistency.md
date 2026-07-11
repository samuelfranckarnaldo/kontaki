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

## Não-decisões

- Não desenha o protocolo de sincronização real (formato de payload,
  frequência, tratamento de erros de rede).
- Não resolve a lacuna de identificadores locais vs. de loja para
  `userId`/`saleId` — ver `01-identity.md`.
- Não redesenha o fluxo de reconciliação de stock já existente no
  produto — só estabelece o princípio geral que esse fluxo deve
  seguir.
