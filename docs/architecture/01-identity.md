# 01 — Identidade

**Estado:** Aceite
**Depende de:** nenhum (documento base)
**Referenciado por:** 02-consistency.md, adrs/

## Propósito

Responder a uma pergunta que antecede qualquer decisão de segurança
ou sincronização: **o que é uma identidade no ecossistema Kontaki?**
Para cada identificador em uso, este documento define o seu âmbito de
unicidade, se é persistente, e se pode mudar ao longo do ciclo de vida
da entidade que representa.

Este documento descreve **princípios**, não a implementação atual de
cada identificador (formato exato, algoritmo de geração). Detalhes de
implementação vivem no código e, quando relevantes para uma decisão
específica, num ADR — não aqui, para que este documento sobreviva a
refactors sem ficar desatualizado.

## Princípio orientador

> Um identificador só é verdadeiramente único se o seu âmbito de
> unicidade estiver definido e for respeitado por todo o código que o
> usa.

O Kontaki é offline-first e multi-dispositivo por natureza. Um
identificador único **dentro de um dispositivo** não é
necessariamente único **entre dispositivos** da mesma loja. Esta
distinção de âmbito é a razão de existir deste documento.

## Categorias de âmbito

| Âmbito | Definição |
|---|---|
| **Local ao dispositivo** | Único dentro de um único dispositivo; pode colidir com o mesmo valor noutro dispositivo. |
| **Global à loja** | Único entre todos os dispositivos de uma mesma loja. |
| **Global ao sistema** | Único entre todas as lojas, gerido pelo servidor. |

## Tabela de identificadores

| Identificador | Âmbito | Persistente | Pode mudar | Gerado por |
|---|---|---|---|---|
| `storeId` | Loja | Sim | Não | Cliente, uma única vez |
| `deviceId` | Dispositivo | Sim | Sim (reinstalação) | Cliente |
| `userId` | **Local** | Sim | Não | Cliente |
| `sessionId` (local) | Local | Sim | Não | Cliente |
| `sessionUuid` | Loja | Sim | Não | Cliente |
| `licenseId` / código de licença | Sistema | Sim | Código muda em renovação; `licenseId` não | Servidor, exclusivamente |
| `saleId` | **Local** (hoje) | Sim | Não | Cliente |
| `catalogId` | Loja | Sim | Não | Cliente — parte do catálogo exportável (`.ktkcat`) |
| `client.uuid` | Loja | Sim | Não | Cliente, na criação da entidade (ver ADR-0005) |

**Leitura da tabela:** as duas linhas marcadas "Local" (`userId`,
`saleId`) são o ponto de atenção mais importante desta tabela — não
existe hoje, ao nível de princípio, garantia de que sejam distinguíveis
entre dispositivos da mesma loja. Isto é uma lacuna reconhecida, não
um erro de implementação a corrigir de ânimo leve — resolvê-la implica
introduzir um identificador de âmbito de loja para cada um, à
semelhança do que já existe para sessões (`sessionUuid` ao lado de um
identificador local).

## Regras gerais

1. **Um identificador local nunca é, por si só, um identificador entre
   dispositivos.** Dados que precisem de ser reconhecidos de forma
   estável fora do dispositivo onde nasceram precisam de um
   identificador de âmbito de loja (ou sistema) próprio, distinto do
   identificador local.
2. **Identificadores gerados pelo servidor nunca são também gerados
   pelo cliente, e vice-versa.** Cada identificador tem exatamente uma
   entidade responsável pela sua geração e unicidade — nunca ambas.
3. **Identificadores estáveis não são segredos, e segredos não devem
   ser usados como identificadores.** Um identificador de loja ou
   dispositivo é, por natureza, informação que circula (em convites,
   em pedidos de rede); nenhum identificador deveria, por si só,
   autorizar uma ação sensível sem verificação adicional do servidor.
4. **A estabilidade de um identificador é uma garantia arquitetural,
   não um acidente de implementação.** Se um identificador está
   marcado como "não muda" na tabela acima, qualquer mudança futura na
   forma como é gerado deve preservar essa garantia — a tabela é o
   contrato, a implementação é o detalhe.

## Pendências

- **Lacuna de âmbito em `userId`/`saleId`** — reconhecida, não
  resolvida aqui. Resolução fica para um ADR próprio, motivado quando
  sincronização multi-dispositivo for desenhada com mais detalhe.
  Nota: `sessions` já resolve este problema para sessões
  (`uuid` + `prevSessionUuid`) — esse padrão é o candidato natural a
  reutilizar para `sales`, caso a lacuna venha a ser fechada.

- **`.ktk` viola a Regra 1 de forma concreta e já corrigível** —
  `stock_esperado`/`stock_movements`, dentro do `.ktk`, ainda
  referenciam `productId` local em vez de `catalogId`, apesar de este
  já existir e já ser usado corretamente no `.ktkcat`. Ver
  `ADR-0005` para a decisão de correção.

## Não-decisões

- Não define formatos exatos de geração (algoritmos, comprimento) —
  isso é implementação, sujeita a mudar sem alterar os princípios
  aqui descritos.
- Não decide o esquema de hash encadeado de integridade — só assinala
  que esse esquema depende de identificadores de âmbito de loja
  estáveis, hoje só garantidos para sessões.
