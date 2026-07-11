# Arquitetura do Kontaki

Esta pasta documenta os princípios e decisões que orientam a
arquitetura do Kontaki e do Kontaki-Console.

## Estrutura

- **Documentos base** (`01`–`04`) — princípios que raramente mudam;
  descrevem o *quê* e o *porquê*, não o *como* atual do código.
- **`05-adrs.md`** — índice de todas as decisões de arquitetura
  registadas.
- **`adrs/`** — cada decisão individual (ADR), incluindo o contexto,
  alternativas consideradas, e consequências.

## Índice de documentos base

| Documento | Responde a |
|---|---|
| `01-identity.md` | O que é uma identidade no sistema, e qual o seu âmbito de unicidade. |
| `02-consistency.md` | Quando há várias cópias do mesmo estado, qual é a correta. |
| `03-threat-model.md` | Contra quem e o quê o sistema se propõe a proteger — e o que fica deliberadamente fora desse perímetro. |
| `04-data-classification.md` | Que proteção cada categoria de dado exige — e qual não exige. |

## Como ler

Os documentos base não descrevem a implementação atual em detalhe
(formatos exatos, algoritmos) — essa informação vive no código e nos
ADRs específicos que a motivaram. Isto é deliberado: os princípios
aqui descritos devem continuar corretos mesmo depois de a
implementação mudar. Se encontrares uma afirmação sobre "como o
código faz X hoje" nestes documentos, é provavelmente algo a mover
para um ADR ou a generalizar como princípio.

## Como propor uma nova decisão

Ver template e critérios em `05-adrs.md`.
