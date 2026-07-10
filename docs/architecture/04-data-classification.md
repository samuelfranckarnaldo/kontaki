# 04 — Classificação de Dados

**Estado:** Aceite
**Data:** 2026-07-10
**Depende de:** 03-threat-model.md (Cenários 2, 3, 12)

## Propósito

Definir, para cada categoria de dado armazenado pelo Kontaki, qual é
a proteção principal exigida — e, tão importante quanto isso, qual
**não** é exigida. Nem todo dado confidencial precisa de cifra; nem
todo dado não-sensível pode ficar sem controlo nenhum. Este documento
existe para que essa distinção deixe de ser intuição caso a caso e
passe a ser regra consultável.

## Princípio orientador

Herdado de 03-threat-model.md: a proteção deve ser proporcional ao
cenário de ameaça real, não a uma sensação geral de "isto parece
importante". Cifrar tudo tem custo (índices, desempenho,
sincronização, depuração) que só se justifica onde a classificação o
exige.

## Princípio de portabilidade

> A classificação acompanha o dado, não o local onde ele é
> armazenado.

Um mesmo registo pode conter campos de classificações diferentes (ver
caso `products.costPrice` abaixo). Mover um campo para outra store,
renomear uma tabela, ou reestruturar o schema não altera
automaticamente a classificação de um campo — a classificação é uma
propriedade do dado em si, decidida aqui, e qualquer refactor de
schema deve preservá-la explicitamente, não assumi-la por herança de
localização.

## Os quatro níveis

| Nível | Definição | Proteção principal |
|---|---|---|
| **Público** | Não confere vantagem nem causa dano se lido por qualquer pessoa com acesso ao dispositivo. | Nenhuma proteção dedicada. |
| **Operacional** | Dados do dia-a-dia do negócio; a preocupação principal não é quem os vê, mas se estão corretos. | Integridade + auditoria (não confidencialidade). |
| **Operacional-confidencial** | Informação que o lojista não quer visível a qualquer operador ou a um concorrente, mas que não é, por si, uma credencial. | Controlo de acesso por `role`; cifra seletiva só se o cenário de ameaça justificar (ver nota abaixo). |
| **Sensível** | Compromete diretamente autenticação, uma conta, ou a integridade de todo o sistema se exposto. | Cifra forte / hash com salt; nunca em claro em repouso. |

**Nota sobre "cifra seletiva" em Operacional-confidencial:** a
diferença entre este nível e Sensível não é a gravidade do dano — é a
**natureza** da proteção. Um COGS exposto magoa o negócio (perde
vantagem competitiva); um PIN exposto compromete a conta inteira e
tudo o resto que ela protege. Por isso o nível 3 usa primariamente
controlo de acesso aplicacional (barato, já parcialmente implementado
via checks de `role`), reservando cifra para casos onde o controlo de
acesso não é suficiente porque o próprio dispositivo pode ser
extraído fora do contexto da aplicação (ver Cenário 2 do Threat
Model) — nesse caso, controlo de acesso da app não protege nada,
porque quem lê o IndexedDB diretamente ignora a app por completo.

## Regra de propriedade (ownership) para dados Operacionais

> Todo dado classificado como Operacional deve ter um módulo
> proprietário, responsável exclusivo pela sua integridade.

Exemplos: `sales`/`saleItems` pertencem ao módulo Vendas;
`stockMovements`/`stockCorrections` pertencem ao módulo Stock;
`fiado` pertence ao módulo Fiados. Nenhum outro módulo escreve
diretamente nestas stores — se precisar de alterar esses dados, fá-lo
através de uma função exposta pelo módulo proprietário, nunca via
`db.put`/`db.add` direto a partir de código de outro componente.

Esta regra existe para o mesmo motivo que motivou a invariante de
`validatedAt` monotónico em ADR-0001: sem um único ponto de escrita
responsável, é questão de tempo até dois módulos escreverem na mesma
store com pressupostos diferentes, produzindo inconsistências
difíceis de reproduzir. Aplica-se também como pré-requisito prático
para o mecanismo de hash encadeado (Cenário 12 do Threat Model) — só
é possível encadear hashes de forma confiável se houver um único
escritor a manter a cadeia.

---

## Classificação por store (IndexedDB, `db.js`)

| Store | Nível | Justificação |
|---|---|---|
| `products` (nome, categoria, barcode, preço de venda) | Público | Sem valor para um atacante; sem dano para o lojista se visível. |
| `products` (preço de custo) | Operacional-confidencial | Ver secção própria abaixo — campo dentro de uma store maioritariamente pública. |
| `sales`, `saleItems` | Operacional | Integridade importa mais que confidencialidade — ver Cenário 12 do Threat Model (hash encadeado). Owner: módulo Vendas. |
| `stockMovements`, `stockDecisions`, `stockCorrections` | Operacional | Idem — candidatos diretos a hash de integridade. Owner: módulo Stock. |
| `fiado` (montante, datas) | Operacional | Numérico/datas — integridade é o que importa. Owner: módulo Fiados. |
| `fiado` (nome do cliente), `clients` | Operacional-confidencial | Ver nota jurídica abaixo. |
| `expenses` | Operacional-confidencial | Revela estrutura de custos do negócio. |
| `suppliers`, `purchases` (custos, condições) | Operacional-confidencial | Informação comercialmente sensível perante concorrência. |
| `incidents` | Operacional | Registo de eventos — integridade > confidencialidade. |
| `sessions`, `sessionTransfers` | Operacional | Metadados de turno — baixo risco em qualquer dos dois eixos. |
| `logs` | Operacional | Existe precisamente para auditoria — deve ser resistente a alteração, não a leitura. |
| `accountingArchive` | Operacional-confidencial | Agregados de lucro/margem — mesma razão que `expenses`. |
| `users` (nome, avatar, role) | Público/Operacional | Sem risco relevante isolado. |
| `users.passwordHash` | **Sensível** | Já protegido — PBKDF2 com salt (ver segurança já implementada). |
| `settings.storeKey` | **Sensível** | Ver secção própria abaixo. |
| `settings.license.code` | **Sensível** | Ver secção própria abaixo. |
| `settings.license.deviceId` | Operacional-confidencial | Identificador do dispositivo — não confere, por si, acesso a nada se isolado do código de licença. |
| `loginAttempts` | Operacional | Metadado de segurança, não segredo em si. |
| `ktkImports` | Operacional | Dados de reconciliação — integridade é o que importa. |

## Nota jurídica: `clients`, `fiado.clientName`

Estes campos ficam classificados como Operacional-confidencial pela
mesma razão de sempre (não são credenciais, não comprometem o
sistema) — mas **dados pessoais podem gerar obrigações legais
independentes desta classificação técnica**: direitos de acesso,
retificação, eliminação e portabilidade (Lei n.º 7/17, já referida na
documentação do produto) aplicam-se a estes campos
independentemente do nível de segurança atribuído aqui. Este
documento não substitui uma análise de conformidade — apenas garante
que a classificação de segurança e as obrigações legais são tratadas
como duas questões distintas, para não se assumir que "nível baixo de
proteção técnica" implica "sem obrigações", nem o inverso.

## Caso especial: `products.costPrice` dentro de uma store maioritariamente pública

Este é o exemplo mais claro de por que a classificação é por **campo**,
não só por **store** (ver Princípio de portabilidade, acima).
`products` é, no seu todo, Público — mas o campo de preço de custo
dentro do mesmo registo é Operacional-confidencial. A separação
recomendada não é duplicar a store (over-engineering para o volume de
dados de uma pequena loja), mas garantir que **qualquer componente de
UI que lista produtos filtra este campo antes de o expor a um role
sem permissão** — a proteção vive na camada de leitura/apresentação,
não na estrutura da base de dados.

## Caso especial: `settings.license` dividido em dois campos

- **`code`** (`Sensível`) — o código de licença permite ativação,
  renovação, e potencialmente ações de suporte associadas à loja. É,
  na prática, um segredo comercial equivalente a uma credencial, ainda
  que não autentique diretamente uma sessão de utilizador. Deve ser
  tratado com o mesmo cuidado que outros dados Sensíveis (nunca
  exposto em logs, nunca em claro em canais não confiáveis).
- **`deviceId`** (`Operacional-confidencial`) — identifica o
  dispositivo perante o Console, mas isoladamente não confere acesso
  a nada; só tem significado combinado com um `code` válido do lado
  do servidor.

## Caso especial: `storeKey`

A `storeKey` está classificada como Sensível, mas há um problema
estrutural que a classificação sozinha não resolve: **a chave que
protege a integridade dos dados vive na mesma base de dados que
protege**. Isto reduz significativamente a sua eficácia contra
extração offline (Cenário 2 do Threat Model) — quem extrai o
IndexedDB extrai a chave e os dados juntos, na mesma operação. Isto
motiva um ADR específico de gestão de chaves (esquema de derivação,
possível separação de armazenamento), não resolvido por este
documento — fica registado como pendência.

## O que este documento não decide

- O desenho exato do hash encadeado de integridade (algoritmo, quando
  é verificado, o que acontece se uma quebra for detetada) — fica
  para um ADR próprio em `05-adrs.md`.
- O esquema de gestão de chaves para `storeKey` — idem.
- Controlo de acesso por `role` já parcialmente implementado; auditoria
  sistemática de que campos Operacional-confidenciais estão
  devidamente protegidos em cada componente de UI fica como tarefa de
  implementação, não decisão de arquitetura.
- Conformidade legal detalhada sobre dados pessoais — este documento
  só sinaliza que a questão existe, não a resolve.

## Pendências identificadas por este documento

1. **`storeKey` sensível guardada sem separação estrutural da base que
   protege** — motiva ADR de gestão de chaves.
2. **Auditoria de componentes de UI** que exibem `products.costPrice`,
   `accountingArchive`, e `expenses` — confirmar que o check de `role`
   está presente em todos os pontos de leitura, não só nalguns (ecoa
   o Cenário 3 do Threat Model).
3. **Ownership de stores Operacionais** — confirmar, por auditoria de
   código, que cada store listada acima tem de facto um único módulo
   a escrever nela; corrigir os casos em que isso não se verificar.
