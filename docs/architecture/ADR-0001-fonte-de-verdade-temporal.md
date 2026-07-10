# ADR-0001 — Fonte de Verdade Temporal

**Estado:** Aceite
**Data:** 2026-07-10
**Âmbito:** Licenciamento, trial, convites (referência futura), sessões

## Contexto

O Kontaki é offline-first. Licenças, trials e (potencialmente) outras
funcionalidades dependem de noções de "quanto tempo passou" ou "quando
expira algo". O dispositivo não é uma fonte de tempo confiável: o
utilizador controla o relógio, e restauro de backup ou reinstalação
pode repor qualquer timestamp guardado localmente.

Este documento define, para a V1, quem decide o que é "agora" e o que
acontece quando o cliente não consegue confirmar isso com o servidor.

## Filosofia

> O cliente nunca prolonga autonomamente a validade de uma licença.
> Apenas conserva temporariamente a última decisão do servidor dentro
> da janela de tolerância.

Esta frase resume o documento: explica por que existe tolerância
offline, por que o servidor é a autoridade, por que manipular o
relógio não deve conceder tempo adicional, e por que `validatedAt`
existe como conceito próprio.

## Princípio orientador

> O objetivo do sistema não é impedir qualquer fraude; é tornar a
> fraude significativamente mais difícil do que usar o produto
> legitimamente.

Este princípio é o critério de aceitação para qualquer mitigação
proposta neste documento e em decisões futuras que dele derivem. Uma
mitigação só se justifica se o esforço de a contornar for maior do que
o esforço de simplesmente pagar/usar o produto como pretendido.

## Contrato de campos

Dois conceitos distintos, que hoje podem coincidir em valor mas nunca
devem ser confundidos em significado:

- **`response.serverTime`** — instante atual do servidor, devolvido
  por qualquer endpoint, usado só para deteção de inconsistência de
  relógio local. Não implica validação de licença.
- **`license.validatedAt`** — instante em que o servidor confirmou
  especificamente a validade *desta* licença. Só é atualizado pelos
  endpoints de licenciamento (`/activate`, `/verify`), nunca por um
  endpoint genérico que devolva `serverTime` por outro motivo.
- **`license.expiresAt`** — data de expiração decidida pelo servidor.
  Nunca calculada ou estendida pelo cliente.

## Decisões

### 1. Fonte de verdade

O **servidor (Console) é a autoridade final** sobre se uma licença é
válida. O cliente nunca decide sozinho, de forma permanente, que uma
licença está ativa — só pode confiar num estado obtido do servidor
durante uma janela de tolerância limitada (ver decisão 2).

### 2. Período de tolerância offline — Política B

**30 dias de tolerância**, medidos a partir de `license.validatedAt`:

- Licença validada → funciona normalmente.
- 0–24 dias sem contacto → funciona normalmente, sem aviso.
- 25–30 dias sem contacto → avisos progressivamente mais visíveis.
- \>30 dias sem contacto → funcionalidades bloqueadas até nova
  validação online.

Motivo: o público do Kontaki inclui lojas que ficam legitimamente dias
ou semanas sem internet. Um limite de 7 dias penaliza uso legítimo
mais do que impede abuso. 30 dias equilibra os dois lados sem tornar a
internet um requisito diário.

### 3. Estado do relógio é independente do estado da licença

O sistema mantém dois estados ortogonais, nunca fundidos num só:

- `license.status` — `trial | active | suspended | revoked` (mais
  `expired`, derivado — ver ADR seguinte sobre schema de licenças).
- `clockStatus` — `ok | inconsistent`.

Combinações válidas e esperadas incluem, por exemplo, licença `active`
com relógio `inconsistent`, ou licença `expired` com relógio `ok`. A
lógica de bloqueio de funcionalidades consulta os dois estados
separadamente; nenhum dos dois é inferido a partir do outro.

### 4. Deteção de recuo de relógio

Mantém-se o aviso visual já existente (`showDateWarning`) para
diferenças pequenas (ex: >5min, possível erro de fuso horário) — isto
afeta `clockStatus`, não `license.status`.

Quando `Date.now() < license.validatedAt` (o relógio local está *antes*
do último instante em que o servidor confirmou a licença):

1. `clockStatus` passa a `inconsistent`. Mostra-se um modal explicando
   que a data/hora do dispositivo parece incorreta e pedindo ao
   utilizador para a corrigir — não para se ligar à internet.
2. Depois de corrigida a data, se `now >= license.validatedAt`,
   `clockStatus` volta a `ok` e o fluxo normal retoma — se ainda
   dentro dos 30 dias de tolerância (decisão 2), não é necessário
   contactar o servidor.
3. Só se exige validação online quando, adicionalmente: (a) já
   passaram mais de 30 dias desde `license.validatedAt`, ou (b) o
   utilizador insiste em manter `clockStatus: inconsistent` sem
   corrigir.

Justificação: nem todo recuo de relógio é fraude — troca de bateria,
fuso horário mal configurado, atualização automática de data
desligada, ou erro do próprio sistema são causas legítimas comuns.
Pedir correção do relógio resolve o caso legítimo em segundos e,
simultaneamente, remove a vantagem de quem recua o relógio
deliberadamente.

Não se tenta detetar recuos parciais, graduais, ou disfarçados — isso
teria custo desproporcional ao risco (ver decisão 7).

### 5. Avanço de relógio

Não é tratado como ameaça nesta versão. Avançar o relógio local só
pode *antecipar* o fim da janela de tolerância, nunca estendê-la —
não há incentivo a abusar disto, e nenhuma mitigação é necessária.

### 6. Trial

Aceita-se que um utilizador determinado (reinstalação + manipulação de
relógio + restauro de backup) consiga obter trials repetidos offline.
Não se investe engenharia adicional em bloquear isto no cliente.

Mitigação prevista fica do lado do servidor, quando existir ligação:
o Console pode identificar padrões de abuso (múltiplos trials para o
mesmo `deviceId`, `storeId`, ou fingerprint equivalente) e agir sobre
isso de forma assíncrona.

### 7. Restauro de backups / clonagem de dispositivo

**Fora do perímetro de segurança da V1**, declarado explicitamente:

> O Kontaki não garante proteção contra restauração deliberada de
> backups locais ou clonagem integral da base de dados em ambiente
> controlado pelo utilizador. A mitigação para este cenário depende de
> validação periódica com o Console e de mecanismos de licenciamento
> do lado do servidor.

Isto não é uma omissão — é um limite técnico reconhecido. A Web/PWA
não oferece um relógio monotónico persistente entre reinstalações;
tentar simular essa garantia do lado do cliente teria custo de
engenharia desproporcional ao benefício, e ainda assim seria
contornável por quem tivesse acesso root ao dispositivo (ver também a
decisão relacionada no Threat Model sobre "dispositivo comprometido
pelo próprio proprietário").

### 8. Invariante: `validatedAt` é monotónico, e só é escrito num único sítio

`license.validatedAt` **nunca pode diminuir**. Isto não é uma regra
para o programador lembrar — é uma invariante arquitetural: **nenhum
código escreve `license.validatedAt` diretamente**. Existe uma única
função responsável, por exemplo:

    // license.js — único ponto de escrita de validatedAt
    function updateValidationState(response) {
      const novoValidatedAt = new Date(response.serverTime);
      const atual = lic.validatedAt ? new Date(lic.validatedAt) : new Date(0);
      if (novoValidatedAt > atual) {
        lic.validatedAt = novoValidatedAt.toISOString();
      }
      // clockStatus é avaliado à parte (decisão 4), não aqui.
    }

Qualquer outro ponto do código que precise de registar uma validação
bem-sucedida chama `updateValidationState()` — nunca atribui o campo
diretamente. Isto elimina, por construção, a classe de bugs em que um
código futuro substitui um `validatedAt` mais recente por um mais
antigo.

### 9. Fora do perímetro (resumo)

Aceites explicitamente como não mitigados nesta versão:
- Abuso de trial via reinstalação + manipulação de relógio (decisão 6).
- Restauro de backup / clonagem de dispositivo (decisão 7).
- Dispositivo com root/jailbreak sob controlo do próprio proprietário
  (a detalhar no Threat Model, consistente com o espírito desta
  decisão).

## Não-decisões (fora do âmbito deste documento)

- UI/UX exata dos avisos progressivos (25–30 dias) e do modal de
  relógio inconsistente — decisão de produto separada.
- Schema de estados da licença — ADR seguinte, depois do Threat Model.
- Deteção de padrões de abuso do lado do servidor (Console).

## Consequências

- `license.js`: `daysSince > 7` passa a `> 30`; introduz-se
  `clockStatus` como estado próprio, separado de `license.status`;
  toda escrita de validação passa a ir através de
  `updateValidationState()`.
- Contrato de API: os endpoints de licenciamento devem devolver
  `serverTime` (sincronização de relógio) de forma explicitamente
  distinta de qualquer campo que represente confirmação de validade —
  já é o caso hoje (`/activate` e `/verify` devolvem `serverTime`
  junto com `plan`/`expiresAt`), mas este contrato fica agora
  documentado como intencional, não incidental.
- O Threat Model (`03-threat-model.md`) referencia estas decisões por
  remissão, sem as reabrir.
