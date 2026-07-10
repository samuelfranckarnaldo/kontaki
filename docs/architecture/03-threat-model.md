# 03 — Threat Model (Kontaki + Kontaki-Console)

**Estado:** Aceite
**Data:** 2026-07-10
**Depende de:** ADR-0001 (Fonte de Verdade Temporal)

## Propósito

Este documento não lista vulnerabilidades pontuais nem o estado do
backlog — essas coisas vivem em issues/PRs e mudam todas as semanas.
Aqui definimos, por cenário, **contra quem e contra o quê o Kontaki se
propõe a proteger**, e onde traçamos a linha do que fica
deliberadamente fora do modelo de ameaça. O documento deve permanecer
válido mesmo depois de as mitigações pendentes serem implementadas —
por isso descreve a **mitigação esperada**, nunca o estado atual da
sua implementação. Decisões futuras (schema de licenças, cifra
seletiva de dados, fluxo de recovery) devem remeter para este
documento em vez de reabrir a mesma pergunta.

## Princípio orientador

> O objetivo do sistema não é impedir qualquer fraude; é tornar a
> fraude significativamente mais difícil do que usar o produto
> legitimamente. (ver ADR-0001)

Este princípio aplica-se a todos os cenários abaixo.

## Os três pilares

Este documento cobre, deliberadamente, os três pilares clássicos de
segurança — não só confidencialidade:

- **Confidencialidade** — quem pode ver os dados (Cenários 1-5, 9-11).
- **Integridade** — quem pode alterar os dados, e se essa alteração é
  detetável (Cenário 12).
- **Disponibilidade** — se os dados continuam acessíveis ao longo do
  tempo (Cenário 13).

---

## Cenário 1 — Dispositivo roubado ou perdido, desbloqueado / sessão ativa

**Descrição:** alguém obtém acesso físico a um dispositivo em que o
Kontaki já está autenticado (sessão local ativa).

**Dentro do modelo de ameaça.** Mitigação esperada: timeout de sessão
e logout automático por inatividade. Cifra em repouso **não ajuda**
neste cenário: a app já teria as chaves necessárias para decifrar o
que precisasse.

---

## Cenário 2 — Dispositivo roubado ou perdido, bloqueado, com extração de dados via ADB/root/backup do browser

**Descrição:** o atacante não consegue autenticar-se na app, mas
extrai o ficheiro do IndexedDB diretamente (root, ADB, ou backup do
perfil do browser) e analisa-o offline, sem pressão de tempo.

**Dentro do modelo de ameaça**, com fronteira clara por classificação
de dados (ver `04-data-classification.md`):
- **Dados sensíveis** (PIN, `storeKey`, tokens) — mitigação esperada:
  hash forte com salt (PIN) e cifra em repouso da `storeKey`.
- **Dados operacionais e operacional-confidenciais** (vendas, clientes,
  COGS) — mitigação esperada: definida por `04-data-classification.md`
  (cifra seletiva onde justificável, controlo de acesso onde não).

---

## Cenário 3 — Funcionário com PIN legítimo tenta aceder além do seu role

**Descrição:** um operador de caixa, autenticado legitimamente,
tenta ver/alterar dados reservados a admin (ex: COGS, margem,
gestão de utilizadores).

**Dentro do modelo de ameaça.** Isto **não é problema de cifra** — é
controlo de acesso aplicacional. Mitigação esperada: checks de `role`
em cada funcionalidade sensível, auditados sistematicamente em todos
os componentes que expõem dados operacional-confidenciais (não só
nalguns pontos isolados).

---

## Cenário 4 — Atacante de rede na comunicação Kontaki ↔ Console

**Descrição:** interceção de tráfego (Wi-Fi público, MITM) entre o
dispositivo do lojista e o Console.

**Dentro do modelo de ameaça**, mitigado primariamente por HTTPS/TLS.
Defesa em profundidade adicional (assinatura de resposta do Console,
para que o cliente não confie cegamente mesmo que TLS falhe) é
mitigação de hardening, não fundamental para o modelo de ameaça em si.

---

## Cenário 5 — Compromisso do lado do servidor (Supabase, Console)

**Descrição:** a chave de serviço do Supabase é exposta, ou o próprio
Console é comprometido (credenciais de admin roubadas, RCE, etc.).

**Fora do modelo de ameaça na perspetiva do cliente** — por definição,
se o servidor está comprometido, o cliente não tem como se defender
sozinho, porque confia no servidor como autoridade (ver ADR-0001,
decisão 1). O que fica dentro do modelo de ameaça é **limitar o raio
de impacto**: garantir que a chave usada pelo Console tem o privilégio
mínimo necessário (não a `service_role` key completa se RLS puder
cumprir o mesmo papel), e que segredos como `JWT_SECRET` não têm
fallback inseguro.

---

## Cenário 6 — Supply chain / scripts locais de desenvolvimento

**Descrição:** o ambiente de desenvolvimento acumula scripts de
correção pontual sem controlo de versão claro do que já foi aplicado
a produção, e sem revisão do que cada script faz antes de correr.

**Dentro do modelo de ameaça do processo de desenvolvimento**, não do
runtime da app. Mitigação esperada: scripts de correção pontual
versionados com registo de quando/porquê cada um foi aplicado, em vez
de soltos e sem rasto.

---

## Cenário 7 — Dispositivo comprometido pelo próprio proprietário

**Descrição:** o dono do dispositivo instala aplicações piratas, faz
root, instala módulos de interceção (ex: Xposed/Frida), e depois
reporta perda de dados ou tenta contornar limites de licença/trial.

**Fora do modelo de ameaça**, declarado explicitamente, pelo mesmo
raciocínio do ADR-0001 (decisão 7): nenhuma aplicação client-side
sobrevive a um dispositivo totalmente comprometido pelo seu próprio
dono. Prometer proteção aqui seria falsa segurança. O Kontaki não
tenta detetar root/jailbreak nem implementa attestation de
integridade. Mitigação de abuso em volume, se necessário, é
responsabilidade do servidor (padrões de uso anómalos), não deteção
client-side.

---

## Cenário 8 — Manipulação de relógio e ciclo de vida temporal da licença

**Descrição:** recuo/avanço de relógio, trial repetido via
reinstalação, restauro de backup para "voltar no tempo".

**Tratado integralmente em ADR-0001.** Este Threat Model não repete
as decisões — apenas remete: tolerância de 30 dias (Política B),
`clockStatus` separado de `license.status`, `validatedAt` monotónico
e escrito por função única. Trial abusado offline e restauro de
backup ficam explicitamente **fora do modelo de ameaça**, por decisão
do ADR-0001.

---

## Cenário 9 — Enumeração/força bruta de códigos de licença

**Descrição:** um atacante testa sistematicamente códigos de licença
contra o endpoint de verificação para encontrar códigos válidos ainda
não ativados.

**Dentro do modelo de ameaça.** Mitigação esperada: rate limiting
dedicado (distinto do limiter genérico da API), geração de código por
CSPRNG em vez de gerador não-criptográfico, e monitorização de
padrões de abuso (tentativas sequenciais/repetidas sobre o mesmo
prefixo de código).

---

## Cenário 10 — Forja de convites de equipa

**Descrição:** um segredo de assinatura de convites presente no
código do cliente permite a qualquer pessoa assinar convites válidos,
incluindo papel de administrador, para qualquer loja.

**Dentro do modelo de ameaça.** Mitigação esperada: mover a
assinatura de convites para o servidor (Console), que é o único lugar
onde um segredo pode de facto ficar secreto; o cliente passa a
verificar com uma chave pública ou validação online, nunca a assinar
com um segredo embutido no próprio bundle.

---

## Cenário 11 — Fluxo de recuperação de PIN

**Descrição:** o fluxo de recovery entre Kontaki e Console não valida
adequadamente a posse do pedido (código da loja não confirmado,
token de reset não verificado contra nenhum valor gerado pelo
servidor), e não existe ainda um endpoint que consuma esse token para
efetivamente resetar um PIN.

**Dentro do modelo de ameaça**, mas de baixo risco enquanto o fluxo
permanecer desacoplado do cliente (hoje, "Esqueci o PIN" no Kontaki
não chama nenhuma API). Mitigação esperada, obrigatória **antes** de
qualquer trabalho que ligue este endpoint ao reset real: validação de
posse de loja, geração e comparação de token do lado do servidor
(nunca aceite do cliente sem verificação), identificadores não
enumeráveis, e o endpoint de aplicação do reset que hoje não existe.

---

## Cenário 12 — Integridade: alteração deliberada de dados locais

**Descrição:** alguém com acesso ao dispositivo (incluindo o próprio
proprietário) altera diretamente registos no IndexedDB — stock,
vendas, movimentos, saldos de fiado — fora do fluxo normal da
aplicação, para mascarar uma discrepância, inflacionar ou esconder
resultados.

**Parcialmente dentro do modelo de ameaça, com fronteira explícita:**
o Kontaki protege contra alterações **acidentais** e inconsistências
internas (ex: validações de fluxo, cálculo consistente de totais —
ver auditoria de módulo de vendas), mas **não garante integridade
contra um proprietário que modifique deliberadamente a base de dados
local** com acesso direto ao IndexedDB — isso está tecnicamente ao
alcance de qualquer um com DevTools ou acesso root, e nenhuma
validação client-side impede escrita direta à base.

Mitigação esperada, dentro do que é razoável para uma app
client-side: hash encadeado de movimentos sensíveis (vendas, ajustes
de stock), à semelhança do que já existe como conceito para o
`storeKey`/HMAC, permitindo **detetar** adulteração a posteriori
(idealmente quando sincronizado com o Console) mesmo que não a
**impida** no momento. Isto é deteção, não prevenção — consistente
com o princípio orientador: o custo de adulterar de forma
indetetável deve ser maior do que operar honestamente.

---

## Cenário 13 — Disponibilidade: perda de dados locais

**Descrição:** o IndexedDB corrompe, o browser limpa armazenamento
(intencional ou automaticamente, por pressão de espaço), ou o
utilizador apaga a aplicação/dados sem backup prévio.

**Dentro do modelo de ameaça, com fronteira explícita:** o Kontaki
tenta preservar disponibilidade através de backups/exportações
(sincronização opcional com o Console, exportação manual), mas **não
garante recuperação de dados após eliminação deliberada ou acidental
do armazenamento local sem backup prévio**. Isto não é uma falha do
sistema — é uma consequência inerente de um modelo offline-first onde
o dispositivo é a fonte primária de dados.

Mitigação esperada: tornar a sincronização/backup suficientemente
simples e frequente para que a janela de exposição a perda de dados
seja pequena na prática, e comunicar claramente ao utilizador (na
própria app, não só nos termos de uso) quando o último backup foi
feito — para que a decisão de "correr risco sem backup" seja
informada, não acidental.

---

## Resumo — dentro vs. fora do modelo de ameaça

**Dentro do modelo de ameaça** (cada um com mitigação esperada
definida acima, independentemente do estado atual de implementação):
1. Dispositivo roubado, sessão ativa
2. Extração offline de dados (por classificação — ver doc. 04)
3. Elevação de privilégio por role
4. MITM de rede
5. Raio de impacto de compromisso do servidor
6. Rasto de scripts de desenvolvimento
8. Ciclo de vida temporal da licença (ADR-0001)
9. Força bruta de licenças
10. Forja de convites
11. Fluxo de recovery
12. Integridade de dados locais (deteção, não prevenção)
13. Disponibilidade de dados locais (via backup, não garantia absoluta)

**Fora do modelo de ameaça** (decisão explícita, não omissão):
- Cenário 7 — dispositivo comprometido pelo próprio proprietário.
- Dentro do Cenário 8/ADR-0001 — trial abusado offline, restauro de
  backup usado para manipular tempo.
- Dentro do Cenário 12 — impedir (não só detetar) adulteração direta
  da base de dados por quem tem acesso root/DevTools ao próprio
  dispositivo.
- Dentro do Cenário 13 — garantir recuperação de dados eliminados sem
  backup prévio.

## Relação com outros documentos

- **ADR-0001** — resolve o Cenário 8 integralmente; pré-requisito de
  leitura para este documento.
- **04-data-classification.md** — resolve o grau de cobertura do
  Cenário 2, e informa a fronteira do Cenário 12 (que dados merecem
  hash/deteção de integridade, não só os "sensíveis").
- **05-adrs.md** — regista decisões de implementação que este
  documento aponta como necessárias mas não desenha em detalhe
  (schema de licenças, arquitetura de convites, mecanismo de hash
  encadeado de movimentos, política de backup/aviso de disponibilidade).
