# ADR-0003 — Modelo de Integridade Local

**Estado:** Planeado
**Data:** 2026-07-10
**Âmbito:** Base de dados local, exportação `.ktk`, auditoria, sincronização futura

## Contexto

O Threat Model classificou vários conjuntos de dados como
**Operacionais**, onde o principal requisito não é impedir leitura,
mas detetar alterações.

Exemplos:

- vendas
- movimentos de stock
- inventários
- ajustes
- registos contabilísticos

O documento de Classificação de Dados também identifica estes dados
como candidatos naturais a um mecanismo de integridade baseado em
hash.

Contudo, ainda não existe uma decisão arquitetural que defina como
esse mecanismo deve funcionar.

Este ADR existirá para evitar que diferentes partes do sistema
implementem soluções incompatíveis entre si.

---

## Objetivo

Definir um único modelo de integridade para todo o Kontaki.

Todos os módulos deverão seguir exatamente o mesmo modelo.

---

## Perguntas de Produto

Antes da decisão técnica existem perguntas de negócio.

### 1. O que acontece quando uma adulteração é detetada?

Possibilidades:

- apenas aviso;
- bloquear operações;
- impedir exportação;
- obrigar intervenção de administrador;
- outro comportamento.

---

### 2. Qual o impacto aceitável no desempenho?

Um hash pode ser calculado:

- em cada escrita;
- no fecho da venda;
- no encerramento do turno;
- apenas na exportação;
- em background.

Cada opção tem custos diferentes.

---

## Perguntas Técnicas

Entre outras, este ADR deverá responder:

- Existe uma única cadeia de hashes ou várias?
- A cadeia é por loja?
- Por sessão?
- Por dia?
- Por documento?
- Como lidar com correções legítimas?
- Como lidar com importações?
- Como verificar integridade parcialmente?
- Como exportar prova de integridade?

---

## Relação com outros ADRs

Este ADR depende de:

- ADR-0001 (Fonte de Verdade Temporal)
- ADR-0002 (Gestão da `storeKey`)

E servirá de base para:

- exportação `.ktk`;
- auditoria;
- sincronização futura;
- validação de backups;
- ferramentas de diagnóstico.

---

## Critérios para fechar este ADR

O ADR será considerado concluído quando definir:

- algoritmo utilizado;
- estrutura da cadeia;
- eventos que recalculam hashes;
- eventos que verificam hashes;
- comportamento perante falhas;
- utilização da `storeKey`;
- impacto esperado em desempenho.

---

## Não-Decisões

Este ADR não decide:

- licenciamento;
- autenticação;
- controlo de acesso;
- sincronização com o Console;
- formato do ficheiro `.ktk` (exceto a parte relacionada com integridade).

