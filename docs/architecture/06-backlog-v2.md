# 06 — Backlog V2

**Estado:** Vivo (actualizado sempre que um item é decidido, adiado, ou
concluído)
**Data de início:** 2026-08-05

## Propósito

Itens identificados mas deliberadamente adiados — não são bugs
esquecidos, são decisões de sequenciamento. Cada item regista o
porquê de não ter sido feito agora e o que precisa de existir antes
de o retomar.

---

## Segurança

### Assinatura de `/sync`
Adiado para quando a sincronização em tempo real for revista como um
todo (ver ADR-0007, secção Não-decisões). Hoje `/sync` já está atrás
de HTTPS e validação de licença; o Cenário 12 do Threat Model já
assume que integridade de dados locais não é garantida contra um
proprietário com acesso root ao próprio dispositivo.

### Alertas automáticos por WhatsApp (Kill Switch, passo 4)
Adiado por custo — precisa de conta Twilio ou WhatsApp Cloud API.
Versão interina implementada: página "Logs" no painel Console, que
regista manualmente rate limits excedidos (`security_events`). A
infraestrutura de logging já está pronta; falta só acrescentar o
envio quando fizer sentido financeiramente.
**Pré-requisito:** decidir provedor (Twilio vs Meta Cloud API — ver
histórico da conversa de 2026-08-05 para a comparação).

### Kill Switch — bloqueio opcional de `/sync`
O desenho original previa bloquear `/sync` opcionalmente quando o
modo de emergência está activo. Implementado apenas para `/activate`,
`/invites/sync`, e `GET /messages`. Falta decidir se `/sync` deve ter
um toggle próprio ou seguir o mesmo botão.

### Higiene de segredos no histórico do Git
Confirmado em 2026-08-05: as chaves privadas adicionadas nesta sessão
(`LICENSE_PRIVATE_KEY`, `MESSAGE_PRIVATE_KEY`) NUNCA estiveram num
commit — só existiram no `.env` local e na Vercel. Mas o `.env` esteve
rastreado pelo Git desde o commit `f74a675` (histórico antigo, antes
desta sessão) até ser removido do controlo de versão em `d65d8107`
(2026-08-05). Segredos mais antigos que possam ter estado nesse
ficheiro durante esse período (ex: `JWT_SECRET`, chave privada de
convites do ADR-0004) podem estar no histórico do repositório, mesmo
sendo privado. Não é urgente enquanto o repositório permanecer
privado e a conta do GitHub não for comprometida, mas fica registado.
**Se algum dia for necessário:** rotacionar esses segredos mais
antigos, ou reescrever o histórico do Git (`git filter-repo`) para os
remover definitivamente.

### Documentação — ADRs em falta
Só a assinatura de `/verify`/`/activate` tem ADR próprio (ADR-0007).
A assinatura de mensagens, o Kill Switch manual, e os Logs de
segurança foram implementados com comentários inline, mas sem ADR
formal. Considerar consolidar num ADR-0008 (ou três separados) para
manter o padrão de documentação já estabelecido no projecto.

---

## Higiene de código

### `perfil.js.tmp`
Ficheiro solto em `src/components/`, identificado como provável lixo
(cópia de trabalho ou backup esquecido) durante o trabalho de
licenciamento. Nunca confirmado nem removido. Verificar se ainda é
necessário antes de apagar (`diff` contra `perfil.js` para confirmar
que não tem nada não migrado).

### Retenção de `security_events`
Tabela sem política de limpeza — cresce indefinidamente. Considerar
um job periódico (cron da Vercel, ou trigger do Supabase) que apague
eventos com mais de N meses, ou um índice/partição por data se o
volume justificar.

---

## Licenciamento (concluído nesta sessão, para referência)

Os itens abaixo foram implementados e testados em produção em
2026-08-05 — mantidos aqui só como registo de contexto, não são
trabalho pendente:
- Gates de licença por módulo (BI, Workspace/Multilojas, Contabilidade,
  Fornecedores, Equipa, PDF de Contabilidade)
- Correcção de `pdf_contabilidade` (feature "fantasma", bloqueava
  todos os planos incluindo Pro)
- Ciclo de vida de trial (`status: "trial"` correctamente derivado e
  reflectido na UI)
- Revogação com três categorias (`manual`, `fraud`, `replaced`) e
  ecrã de reactivação self-service para `replaced`
- Assinatura ECDSA de `/verify`, `/activate`, e `/messages` (ADR-0007)
- Kill Switch manual com auditoria
- Logs de segurança (versão manual)

---

## Multi-loja / Workspace

### Catálogo Global (identidade de produto entre lojas)
Hoje o `catalogId` é a identidade **local** de um produto — resolve
sincronização, `.ktkcat`, Workspace, e incidentes, mas nunca liga o
mesmo produto físico entre lojas diferentes. Decisão de arquitectura
tomada em 2026-08-05, em fases:

1. **Fase 1 (feito, sem mudanças):** `catalogId` continua identidade
   só local. Não mexer.
2. **Fase 2 (implementado em 2026-08-05):** o BI multi-loja
   (`GET /reports/multi-store/bi`) passou a agregar produtos por
   `masterBarcode` → `barcode` → `catalogId` → nome, em vez de só por
   nome. Sem UI nova — só mudança na lógica de agregação.
   Confirmado no código que `masterBarcode`/`barcode` são campos
   manuais (input do lojista), **não** um GTIN oficial validado por
   nenhuma base de dados externa (GS1, Open Food Facts, etc.).
3. **Fase 3 (adiado, é este item):** um verdadeiro Catálogo Global no
   Workspace — um "produto global" (chave: GTIN/barcode quando
   existir) mapeia `catalogId`s de várias lojas ao mesmo produto.
   Permitiria acrescentar depois imagem oficial, marca, categoria, IVA
   recomendado, unidade, fornecedor — evoluindo o Workspace para uma
   pequena base de conhecimento de produto, não só um espelho de
   sincronização.

**Decisão explícita:** não introduzir um campo GTIN validado agora.
Motivos: (a) exigiria lookup contra uma API externa no momento de
criar o produto, contradizendo a arquitectura offline-first; (b)
cobertura esperada baixa no mercado angolano (muitos produtos a
granel, reembalados, ou de fornecedores informais sem código de
barras oficial); (c) a Fase 3 resolve o problema de identidade entre
lojas de forma melhor de qualquer forma, com ou sem GTIN validado.

**Regra desenhada para a Fase 3 (ainda não implementada):** produtos
sem barcode **nunca** são fundidos automaticamente por semelhança de
nome — o sistema só sugere ("Encontrámos dois produtos parecidos. São
o mesmo?") e o dono confirma manualmente. Fusão automática por nome é
sabidamente frágil (nomes iguais podem ser produtos diferentes; o
mesmo produto pode ter nomes ligeiramente diferentes entre lojas).

**Pré-requisito para retomar:** nenhum bloqueante técnico — é decisão
de prioridade. Quando retomado, começar pelo schema do "produto
global" e pela UI de reconciliação manual no Workspace.

---

## Multi-loja / Workspace

### Catálogo Global (identidade de produto entre lojas)
Hoje o `catalogId` é a identidade **local** de um produto — resolve
sincronização, `.ktkcat`, Workspace, e incidentes, mas nunca liga o
mesmo produto físico entre lojas diferentes. Decisão de arquitectura
tomada em 2026-08-05, em fases:

1. **Fase 1 (feito, sem mudanças):** `catalogId` continua identidade
   só local. Não mexer.
2. **Fase 2 (implementado em 2026-08-05):** o BI multi-loja
   (`GET /reports/multi-store/bi`) passou a agregar produtos por
   `masterBarcode` → `barcode` → `catalogId` → nome, em vez de só por
   nome. Sem UI nova — só mudança na lógica de agregação.
   Confirmado no código que `masterBarcode`/`barcode` são campos
   manuais (input do lojista), **não** um GTIN oficial validado por
   nenhuma base de dados externa (GS1, Open Food Facts, etc.).
3. **Fase 3 (adiado, é este item):** um verdadeiro Catálogo Global no
   Workspace — um "produto global" (chave: GTIN/barcode quando
   existir) mapeia `catalogId`s de várias lojas ao mesmo produto.
   Permitiria acrescentar depois imagem oficial, marca, categoria, IVA
   recomendado, unidade, fornecedor — evoluindo o Workspace para uma
   pequena base de conhecimento de produto, não só um espelho de
   sincronização.

**Decisão explícita:** não introduzir um campo GTIN validado agora.
Motivos: (a) exigiria lookup contra uma API externa no momento de
criar o produto, contradizendo a arquitectura offline-first; (b)
cobertura esperada baixa no mercado angolano (muitos produtos a
granel, reembalados, ou de fornecedores informais sem código de
barras oficial); (c) a Fase 3 resolve o problema de identidade entre
lojas de forma melhor de qualquer forma, com ou sem GTIN validado.

**Regra desenhada para a Fase 3 (ainda não implementada):** produtos
sem barcode **nunca** são fundidos automaticamente por semelhança de
nome — o sistema só sugere ("Encontrámos dois produtos parecidos. São
o mesmo?") e o dono confirma manualmente. Fusão automática por nome é
sabidamente frágil (nomes iguais podem ser produtos diferentes; o
mesmo produto pode ter nomes ligeiramente diferentes entre lojas).

**Pré-requisito para retomar:** nenhum bloqueante técnico — é decisão
de prioridade. Quando retomado, começar pelo schema do "produto
global" e pela UI de reconciliação manual no Workspace.
