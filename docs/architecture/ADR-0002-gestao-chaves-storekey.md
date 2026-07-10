# ADR-0002 — Gestão de Chaves: `storeKey`

**Estado:** Proposta
**Data:** 2026-07-10
**Âmbito:** `db.js`, exportação `.ktk`, futura camada de integridade

## Contexto

A auditoria identificou que a `storeKey` é gerada corretamente através
de um CSPRNG durante o `seed()` da base de dados, mas permanece
persistida no IndexedDB juntamente com os dados que potencialmente
deverá proteger.

No cenário de extração offline da base de dados (Threat Model,
Cenário 2), um atacante obtém simultaneamente os dados e a chave,
reduzindo significativamente o benefício de utilizar HMAC como
mecanismo de integridade.

Contudo, antes de decidir **como** proteger a `storeKey`, é necessário
confirmar exatamente **para que ela existe**.

Hoje a documentação refere utilização em ficheiros `.ktk` e em
verificação de integridade, mas a auditoria ainda não confirmou todos
os consumidores reais da chave.

Este ADR permanece deliberadamente em estado de proposta até existir
essa confirmação.

---

## Pergunta 0 — Inventário da `storeKey`

Antes de qualquer decisão, deve existir um inventário completo dos
locais onde a `storeKey`:

- já é utilizada;
- será utilizada por decisões já aprovadas;
- poderá vir a ser utilizada no futuro previsível.

Este ADR **não deve ser fechado** enquanto esse inventário não existir.

O inventário deverá responder, pelo menos:

- assina exportações `.ktk`?
- participa no hash encadeado de integridade?
- protege licenciamento?
- protege sincronização?
- protege backups?
- existe algum consumidor ainda não auditado?

Sem esta resposta existe risco de decidir a gestão da chave antes de
conhecer todas as suas responsabilidades.

---

## Perguntas de Produto

### 1. Fricção aceitável

Qual o nível de fricção aceitável para proteger esta chave?

Possibilidades:

- nenhuma interação adicional além do PIN;
- confirmação ocasional do PIN;
- segunda passphrase apenas para operações críticas;
- outra abordagem.

Esta decisão pertence ao produto, não à criptografia.

---

### 2. Prioridade

A correção deste problema deve acontecer antes ou depois das pendências
remotas já identificadas?

Neste momento continuam pendentes:

- força bruta de licenças;
- geração criptográfica de códigos;
- convites assinados;
- fluxo de recovery.

Como estes cenários são exploráveis remotamente e em larga escala,
podem justificar prioridade superior relativamente ao Cenário 2
(extração física do dispositivo).

---

## Perguntas Técnicas

Depois de respondidas as perguntas anteriores, existem várias
alternativas possíveis.

### Opção A — Derivação a partir do PIN

A chave deixa de ser persistida.

É derivada quando necessária através do PIN do administrador.

Vantagens:

- não existe segredo persistido;
- reduz impacto do Cenário 2.

Desvantagens:

- alteração do PIN implica alteração da chave;
- exportações antigas podem deixar de validar;
- pode exigir migração ou re-assinatura.

---

### Opção B — Persistência protegida

A chave continua persistida.

Aceita-se a limitação da plataforma Web, documentando claramente os
limites dessa proteção.

---

### Opção C — Adiar para V2

Reconhece-se que o benefício atual não justifica a complexidade.

Mantém-se a implementação existente e documenta-se explicitamente esta
limitação como decisão consciente.

---

## Critérios para fechar este ADR

Este ADR só pode passar para **Aceite** depois de:

- existir inventário completo da utilização da `storeKey`;
- existir decisão de produto sobre fricção;
- existir decisão de prioridade;
- existir escolha explícita entre as alternativas.

---

## Consequências

A definir depois da decisão.

Dependendo da alternativa escolhida poderá ser necessário alterar:

- `db.js`
- exportação `.ktk`
- mecanismo de hash encadeado
- migração de dados
- documentação de segurança

---

## Não-Decisões

Este ADR **não** decide:

- o algoritmo do hash encadeado;
- quando a integridade é verificada;
- o formato do ficheiro `.ktk`;
- o fluxo de licenciamento.

Esses temas pertencem a ADRs próprios.

---

## ADR relacionado (planeado)

Após este documento deverá existir:

**ADR-0003 — Modelo de Integridade Local**

Esse ADR definirá:

- como funciona o hash encadeado;
- quando é calculado;
- quando é validado;
- como uma quebra de integridade é tratada;
- como a `storeKey` participa nesse processo.

A decisão definitiva sobre a gestão da `storeKey` deve permanecer
consistente com esse ADR.
