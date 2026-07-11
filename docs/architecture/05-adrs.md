# 05 — Registo de Decisões de Arquitetura (ADRs)

**Estado:** Vivo (atualizado a cada novo ADR)
**Depende de:** 01-identity.md, 02-consistency.md, 03-threat-model.md, 04-data-classification.md

## Propósito

Índice das decisões de arquitetura do Kontaki. Cada decisão vive no
seu próprio ficheiro em `adrs/ADR-XXXX-titulo-curto.md`. Um ADR não é
só para segurança — decisões de desempenho, sincronização, ou domínio
seguem o mesmo formato.

## Quando escrever um ADR

Sempre que uma decisão for difícil de reverter, não óbvia a partir do
código sozinho, ou uma escolha genuína entre alternativas onde a
rejeitada também fazia sentido nalgum critério.

## Template

    # ADR-XXXX — Título curto

    **Estado:** Proposta | Aceite | Substituída por ADR-YYYY
    **Data:** AAAA-MM-DD
    **Âmbito:** (que módulos/ficheiros afeta)

    ## Contexto
    ## Perguntas a decidir (negócio, separado de técnicas)
    ## Decisão
    ## Alternativas rejeitadas
    ## Consequências
    ## Não-decisões

## Índice

| ADR | Título | Estado | Ficheiro |
|---|---|---|---|
| 0001 | Fonte de Verdade Temporal | Aceite | `adrs/ADR-0001-fonte-de-verdade-temporal.md` |
| 0002 | Modelo de Gestão da StoreKey Compartilhada | Aceite (V1) | `adrs/ADR-0002-storekey.md` |
| 0003 | Modelo de Integridade Local | Aguarda revisão pós-P0 | `adrs/ADR-0003-integridade-local.md` |
| 0004 | Assinatura Assimétrica de Convites | Aceite | `adrs/ADR-0004-assinatura-convites.md` |
