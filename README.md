# 🏪 Kontaki — Sistema de Gestão de Negócios Offline-First

> **Solução completa para pequenas lojas, mercearias e negócios de varejo em Angola e PALOP**

---

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Filosofia do Produto](#filosofia-do-produto)
3. [Stack Tecnológico](#stack-tecnológico)
4. [Funcionalidades Principais](#funcionalidades-principais)
5. [Módulos da Aplicação](#módulos-da-aplicação)
6. [Segurança](#segurança)
7. [Offline-First](#offline-first)
8. [Requisitos e Compatibilidade](#requisitos-e-compatibilidade)
9. [Planos e Preços](#planos-e-preços)
10. [Instalação e Configuração](#instalação-e-configuração)
11. [Arquitetura Técnica](#arquitetura-técnica)
12. [Design System](#design-system)
13. [Roadmap](#roadmap)
14. [Contato e Suporte](#contato-e-suporte)

---

## 🎯 Visão Geral

O **Kontaki** é uma aplicação web progressiva (PWA) de gestão de negócios desenvolvida especificamente para pequenas lojas, mercearias e supermercados em contextos onde a conectividade à Internet é intermitente ou cara.

### Público-Alvo
- ✅ Proprietários de pequenas lojas
- ✅ Mercearias e vendedores de varejo
- ✅ Negócios com múltiplos funcionários
- ✅ Usuários com conexão de Internet instável

**Desenvolvido por:** Introxeer Technology, Lda.  
**Versão:** 2.0  
**Data:** Junho de 2026  
**Linguagem:** Português Europeu / Português Angolano

---

## 💡 Filosofia do Produto

### Offline-First
O Kontaki foi construído com a premissa de que **os dados devem ser armazenados primeiramente no dispositivo**:

- 📱 Dados armazenados localmente em IndexedDB
- 🔗 Sincronização com servidor é **opcional** e não obrigatória
- ⚡ A aplicação funciona completamente offline sem perda de funcionalidades essenciais
- 🔐 Sincronização é apenas para backup e segurança

### Princípios de Design
- **Privacidade em Primeiro Lugar:** Seus dados permanecem no seu dispositivo
- **Performance Máxima:** Sem dependência de internet para operações diárias
- **Segurança:** Encriptação SHA-256 e HMAC-SHA256
- **Simplicidade:** Interface intuitiva sem curva de aprendizado acentuada

---

## 🛠️ Stack Tecnológico

### Frontend
```
├── HTML5 / CSS3 / JavaScript Vanilla (ES6+)
├── IndexedDB (persistência local)
├── Service Worker (offline-first caching)
├── Lucide Icons (ícones escaláveis)
├── Chart.js (gráficos e dashboards)
├── QRCode.js (códigos QR offline)
└── jsPDF (relatórios em PDF)
```

### Arquitetura
```
PWA (Progressive Web App)
│
├── Frontend SPA (Single Page Application)
│   └── HTML + CSS3 + Vanilla JavaScript
│
├── Storage Local
│   ├── IndexedDB (dados principais)
│   └── LocalStorage (preferências)
│
├── Service Worker (sw.js)
│   ├── Cache-first strategy
│   ├── Funcionamento offline completo
│   └── Sincronização automática
│
├── Backend Opcional
│   ├── Sincronização encriptada
│   ├── Backup remoto
│   └── Relatórios consolidados
│
└── Mobile-First Design
    ├── Responsivo
    ├── Touch-friendly
    └── Modo claro/escuro
```

### Dependências
- `package.json` configurado para Node.js
- Scripts NPM para build e sincronização com Capacitor
- Capacitor para empacotamento Android/iOS
- Sem frameworks pesados (Vanilla JS otimizado)

---

## 🎨 Funcionalidades Principais

### 1. **Módulo de Vendas (Vender)**
Processamento rápido e eficiente de vendas.

**Características:**
- ✅ Pesquisa em tempo real de produtos
- ✅ Scanner de códigos de barras (barcode)
- ✅ Carrinho de compras com visualização em tempo real
- ✅ Cálculo automático de totais
- ✅ Múltiplos métodos de pagamento:
  - Dinheiro
  - Transferência bancária
  - Multicaixa
  - Fiados (crédito para clientes)
- ✅ Descontos (percentual ou fixo)
- ✅ Cálculo de troco automático
- ✅ Recibos digitais com QR code
- ✅ Histórico de produtos recentes
- ✅ Modo turno (rastreamento por vendedor)

---

### 2. **Módulo de Produtos**
Gestão completa de inventário.

**Características:**
- ✅ Cadastro com:
  - Nome e descrição
  - Código de barras único
  - Categoria
  - Preço de venda
  - Preço de custo
  - Stock atual
  - Stock mínimo (alerta)
- ✅ Busca avançada
- ✅ Filtro por categorias
- ✅ Estatísticas de stock
- ✅ Ativação/desativação
- ✅ Histórico de movimentações
- ✅ Edição em lote
- ✅ Sincronização em tempo real

---

### 3. **Módulo de Fiados (Crédito)**
Gestão de vendas a crédito e clientes.

**Características:**
- ✅ Registro de clientes com limite de crédito
- ✅ Controle de dívidas
- ✅ Status de pagamento (aberto/pago)
- ✅ Histórico de transações
- ✅ Relatórios de vencidos
- ✅ Cálculo de juros (configurável)
- ✅ Filtros de visualização

---

### 4. **Módulo de Histórico**
Análise detalhada de vendas e desempenho.

**Características:**
- ✅ Visualização por período (Hoje/Semana/Mês/Customizado)
- ✅ Estatísticas agregadas:
  - Total de vendas
  - Número de transações
  - Ticket médio
  - Produto mais vendido
  - Categoria mais lucrativa
- ✅ Gráficos de evolução (7 dias)
- ✅ Comparativo com período anterior
- ✅ Exportação em CSV e PDF
- ✅ Filtros por data, vendedor, método de pagamento

---

### 5. **Módulo Dashboard**
Visão geral instantânea da saúde do negócio.

**Características:**
- ✅ Saudação personalizada (Bom dia/Boa tarde/Boa noite)
- ✅ KPIs principais:
  - Vendas hoje
  - Vendas este mês
  - Fiados abertos
  - Despesas do mês
  - Stock baixo/zerado
- ✅ Gráfico de 7 dias
- ✅ Alertas visuais
- ✅ Acesso rápido às tarefas comuns
- ✅ Atualização em tempo real

---

## 📦 Módulos da Aplicação

### Perfil e Configurações

#### **3.5.1 Dados da Loja**
- Nome, telefone, email
- Logo (upload de imagem)
- Endereço e província (18 províncias de Angola)
- NIF e IVA configuráveis
- Aparece nos recibos impressos

#### **3.5.2 Gestão de Stock**
- Listagem completa de produtos
- Modo Inventário (contagem física)
- Entrada/saída manual
- Movimentações rastreadas
- Reconciliação com vendas
- Alertas de stock baixo

#### **3.5.3 Incidentes**
- Registro de problemas operacionais
- Categorização automática
- Rastreamento por operador
- Impacto em perdas

#### **3.5.4 Equipa e Utilizadores**
- Gestão de múltiplos utilizadores:
  - Admin (controle total)
  - Operador (vendas apenas)
  - Gerente (vendas + relatórios)
  - Convidado (acesso limitado)
- PIN de acesso de 4 dígitos
- Rastreamento de quem fez cada venda
- Convite de novos dispositivos

#### **3.5.5 Clientes**
- Base de dados de clientes
- Histórico de compras
- Valor total gasto
- Segmentação por volume
- Exportação de lista

#### **3.5.6 Despesas**
- Registro de custos operacionais:
  - Aluguel, salários, utilidades
  - Transportes, manutenção
- Categorização automática
- Impacto direto no lucro

#### **3.5.7 Contabilidade**
- Dashboard contabilístico:
  - Receita (mês/ano)
  - COGS (Custo dos Produtos Vendidos)
  - Lucro Bruto e Líquido
  - Margem de Lucro
- Análise de fiados
- Análise de devoluções
- Relatórios mensais/anuais

#### **3.5.8 Fornecedores e Compras**
- Registro de fornecedores
- Rastreamento de compras
- Entrada automática de stock
- Histórico de preços
- Alertas de compras vencidas

#### **3.5.9 Turno do Operador**
- Abertura/encerramento de turno
- Saldo inicial e final
- Resumo de vendas
- Detecção de diferenças
- Histórico completo

#### **3.5.10 Segurança e Autenticação**
- PIN de acesso (4 dígitos)
- Encriptação SHA-256
- Tentativas limitadas
- Timeout automático
- Logout seguro

#### **3.5.11 Assinatura e Planos**
- Exibição do plano atual
- Funcionalidades por plano
- Informações de upgrade
- Data de expiração

#### **3.5.12 Backup e Sincronização**
- Acesso remoto aos dados
- Sincronização automática
- Importação/exportação
- Configuração de sync
- Último backup registado

#### **3.5.13 Contactos**
- Informações de contato da Introxeer
- Links para suporte
- Social media
- Chat direto (WhatsApp)

#### **3.5.14 Ajuda e FAQ**
- Base de conhecimento interativa
- Busca em ajuda
- Guias por funcionalidade
- Resolução de problemas
- Vídeo-tutoriais

#### **3.5.15 Sobre**
- Versão do aplicativo
- Desenvolvedor
- Licença
- Changelog

#### **3.5.16 Notificações**
- Centro de notificações unificado
- Alertas por:
  - Stock baixo
  - Fiados vencidos
  - Turnos abertos
  - Atualizações
- Badge com contagem
- Histórico

#### **3.5.17 Dark Mode**
- Tema automático
- Economia de bateria
- Sincronização com sistema
- Alternância manual

---

## 🔒 Segurança

### Autenticação e Acesso
- **PIN de 4 dígitos** encriptado com SHA-256
- Limite de **5 tentativas** de login
- Bloqueio de **15 minutos** após limite
- Timeout automático (**15 minutos** de inatividade)

### Proteção de Dados
- **IndexedDB** isolado por origem
- **HTTPS obrigatório** para sincronização
- Certificados **TLS/SSL 1.2+**
- Verificação de integridade com **HMAC-SHA256**
- Encriptação **ponta-a-ponta** para backup

### Auditoria e Rastreamento
- Logging detalhado de:
  - **Quem** (identificação do utilizador)
  - **O quê** (ação realizada)
  - **Quando** (timestamp exato)
  - **Onde** (origem)
- Eventos rastreados:
  - Login/logout
  - Cada venda
  - Edições de preços
  - Ajustes de stock
  - Alterações de configuração
- Retenção de **12 meses**

### Proteção Contra Fraude
- ✅ Hash de cada transação
- ✅ Verificação de sequência
- ✅ Detecção de duplicatas
- ✅ Validação de valores
- ✅ Alertas automáticos para:
  - Descontos anormalmente altos
  - Devoluções inexplicáveis
  - Variação de preço anormal
- ✅ Aprovações requeridas para:
  - Descontos acima de limite
  - Devoluções acima de montante
  - Alterações de preço

### Conformidade Regulatória

#### Lei Angolana
- ✅ Lei n.º 7/17 — Proteção de Dados Pessoais
- ✅ Decreto-Lei n.º 2/17 — Direitos de Autor
- ✅ Lei n.º 3/92 — Propriedade Industrial
- ✅ Código do IVA (Lei n.º 7/19)
- ✅ Código do Imposto Industrial (Lei n.º 19/14)

#### Direitos do Utilizador
- ✅ Acesso aos dados
- ✅ Retificação de dados
- ✅ Apagamento/direito ao esquecimento
- ✅ Portabilidade de dados
- ✅ Oposição ao tratamento

#### DPO (Data Protection Officer)
- **Email:** dpo@introxeer.co.ao

### Segurança Fiscal

⚠️ **IMPORTANTE:** Os recibos do Kontaki são documentos de **GESTÃO INTERNA** e **NÃO possuem validade fiscal** perante a AGT.

O utilizador é responsável por:
- Emitir facturas oficiais conforme Lei n.º 7/19
- Cumprir com Lei n.º 19/14
- Manter registos de IVA regularmente
- Pagar impostos no prazo

---

## 📡 Offline-First

### Armazenamento Local (IndexedDB)

**Capacidade:** ~50MB por aplicação (pode pedir mais)

**Estrutura de dados:**
```
IndexedDB {
  ├── products          # Catálogo de produtos
  ├── sales            # Vendas realizadas
  ├── saleItems        # Itens de cada venda
  ├── fiado            # Clientes em crédito
  ├── stockMovements   # Histórico de movimento
  ├── expenses         # Despesas
  ├── users            # Utilizadores
  ├── settings         # Configurações
  ├── accountingArchive # Períodos anteriores
  └── logs             # Auditoria
}

LocalStorage {
  ├── Carrinho temporário
  ├── Preferências de UI
  ├── Last sync timestamp
  └── Dark mode preference
}
```

### Operações Completamente Offline
- ✅ Realizar vendas
- ✅ Pesquisar produtos
- ✅ Consultar stock
- ✅ Ver histórico
- ✅ Registar despesas
- ✅ Gerir clientes fiados
- ✅ Imprimir recibos
- ✅ Gerar relatórios locais
- ✅ Ver dados contabilísticos

### Service Worker
- **Cache-first strategy** para assets
- Todos os arquivos em cache
- Sem requisições de rede necessárias
- Atualização automática quando online

### Sincronização com Backup

**Início:**
- Manual: Clique em "Sincronizar"
- Automático: A cada 30 minutos (se online)
- Ao abrir/fechar turno

**Processo:**
1. Detectar mudanças locais
2. Encriptar dados
3. Enviar para servidor
4. Receber confirmação
5. Atualizar timestamp de sync
6. Notificar sucesso

**Proteção contra colisões:**
- Última escrita vence
- Versioning automático
- Sem perda de dados

### Recuperação de Dados

Se houver perda local de dados:
1. App detecta IndexedDB vazio/corrompido
2. Oferece restauração de backup
3. Restauração completa de dados
4. Confirmação de integridade
5. Resumo de dados restaurados

**Proteção:**
- Backup automático a cada sincronização
- Múltiplas versões mantidas
- Recuperação de até 30 dias

---

## 💻 Requisitos e Compatibilidade

### Navegadores Suportados
- ✅ Chrome/Edge (88+)
- ✅ Firefox (87+)
- ✅ Safari iOS (15+)
- ✅ Samsung Internet (14+)
- ✅ Opera (74+)

### Requisitos Mínimos
- **RAM:** 2GB
- **Espaço:** 50MB
- **Conexão:** Nenhuma (funciona offline)
- **Câmara:** Opcional (para barcode scanner)

### Instalação
- **Web:** Acesso via navegador
- **PWA:** Instalar como app nativo
- **Plataformas:** Desktop, Tablet, Smartphone

---

## 💳 Planos e Preços

### PLANO GRATUITO (FREE)
- ✅ Vendas ilimitadas
- ✅ Gestão de stock básica
- ✅ Clientes fiados
- ✅ Recibos digitais
- ✅ Um utilizador
- ❌ Histórico bloqueado
- ❌ Dashboard bloqueado
- ❌ QR Scanner bloqueado
- ❌ Modo Caixa Rápida bloqueado

### PLANO PROFISSIONAL (PRO)
- ✅ Tudo do Free +
- ✅ Histórico de vendas
- ✅ Dashboard completo
- ✅ QR Scanner
- ✅ Até 5 utilizadores
- ✅ Relatórios avançados
- ✅ Backup automático
- ✅ Suporte por email

### PLANO EMPRESARIAL (BUSINESS)
- ✅ Tudo do Pro +
- ✅ Fornecedores e compras
- ✅ Modo Caixa Rápida
- ✅ Até 20 utilizadores
- ✅ API de integração
- ✅ Escritório remoto
- ✅ Sincronização em tempo real
- ✅ Suporte prioritário

---

## 🚀 Instalação e Configuração

### Como Iniciar

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/samuelfranckarnaldo/kontaki.git
   cd kontaki
   ```

2. **Instale dependências:**
   ```bash
   npm install
   ```

3. **Inicie o servidor:**
   ```bash
   npm start
   ```

4. **Abra no navegador:**
   ```
   http://localhost:3000
   ```

### Instalar como PWA

1. Abra a aplicação no navegador
2. Clique no ícone de instalação (geralmente no endereço ou menu)
3. Confirme a instalação
4. A app será instalada como ícone nativo no seu dispositivo

### Para Desenvolvimento

```bash
# Sincronizar com Capacitor (Android)
npm run cap:sync

# Abrir projeto Android no Android Studio
npm run cap:open

# Build para Android
npm run cap:build
```

---

## 🏗️ Arquitetura Técnica

### Fluxo de Login
```
Utilizador introduz credenciais
    ↓
db.getAll("users") — verifica username + password
    ↓
db.getAll("sessions") — procura turno aberto
    ↓
SE EXISTE: retoma turno
SE NÃO EXISTE: sessionService.openSession()
    ↓
currentUser.sessionId = sessionId
    ↓
router.init() → router.go("vender")
```

### Fluxo de Turno

**ABRIR TURNO (automático no login):**
1. Gera UUID único para a sessão
2. Regista stockRecebido (snapshot do stock atual)
3. Cria StockMovements tipo "session_open"
4. Persiste em sessions{}

**FECHAR TURNO (manual — Perfil → Meu Turno):**
1. Calcula stockEsperado (recebido - vendido)
2. Atualiza sessions{status: "closed"}
3. ktkService.generate(sessionId)
4. Agrega vendas, fiados, incidentes
5. Gera HMAC-SHA256 com storeKey
6. Retorna ficheiro .ktk para download/partilha

**IMPORTAR TURNO (admin):**
1. validateKtkHash(ktk) — verifica integridade HMAC
2. sessionService.checkDuplicate(uuid) — evita importação dupla
3. ktkService.import(ktk)
4. Cria sessão importada com imported:true
5. Insere stockMovements com imported:true

### Fluxo de Venda

```
Pesquisa ou scan de produto
    ↓
addToCart(product) — verifica stock
    ↓
openCheckout() — resumo + método de pagamento
    ↓
saleService.create(items, payMethod, discount, client)
    ↓
Verifica stock via getStock()
    ↓
db.add("sales") + db.add("saleItems")
    ↓
addStockMovement(type:"sale", qty:-n)
    ↓
SE fiado: db.add("fiado")
    ↓
showReceipt() — recibo com QR
```

### Fluxo de Fiado

**Durante venda:**
- payMethod = "fiado" + nome do cliente
- saleService.create() → db.add("fiado", {status:"open"})

**Pagamento:**
- _confirmPay(id, amount)
- Pagamento total: fiado.status = "paid"
- Pagamento parcial: novo registo paid

### Sincronização KTK

```
DISPOSITIVO DO CAIXA               DISPOSITIVO DO PATRÃO
─────────────────────              ─────────────────────
Fecha turno
    ↓
ktkService.generate()
    ↓
HMAC-SHA256 com storeKey
    ↓
Download .ktk
    ↓
Partilha por WhatsApp ───────────→ Recebe .ktk
                                        ↓
                            Perfil → Meu Turno → Importar
                                        ↓
                            validateKtkHash() — verifica
                                        ↓
                            checkDuplicate() — evita duplos
                                        ↓
                            ktkService.import()
                                        ↓
                            Sessão criada (isImported:true)
                                        ↓
                            Incidentes visíveis
```

### Permissões por Papel

| Operação | Admin | Caixa | Gerente |
|----------|-------|-------|---------|
| Vender | ✅ | ✅ | ✅ |
| Ver Histórico | ✅ | ❌ | ✅ |
| Gerir Utilizadores | ✅ | ❌ | ❌ |
| Configurar Loja | ✅ | ❌ | ❌ |
| Ver Dashboard | ✅ | ❌ | ✅ |
| Registar Despesas | ✅ | ❌ | ✅ |

---

## 🎨 Design System

### Paleta de Cores

| Token | Valor | Uso |
|---|---|---|
| `--primary` | #5b21b6 | Marca, ações primárias, aba ativa |
| `--primary-mid` | #7c3aed | Gradiente do hero |
| `--success` | #16a34a | Positivo, compra |
| `--warning-muted` | #a87438 | Atenção suave |
| `--danger-muted` | #b3554f | Anomalias |
| `--danger` | #dc2626 | Venda/saída |
| `--info` | #2563eb | Transferência bancária |
| `--teal` | #0d9488 | Pagamento em dinheiro |

### Tipografia

- **Escala:** `--text-2xs` (9px) → `--text-xl` (22px)
- **Pesos:** regular (400), medium (600), strong (700)
- **Labels:** Peso 600, tamanho normal (nunca MAIÚSCULAS com letter-spacing)
- **Números importantes:** Usam `tabular-nums` para não "pular"

### Espaçamento

Grid de **8px:**
- `--space-1` (4px)
- `--space-2` (8px)
- `--space-3` (12px)
- `--space-4` (16px)
- `--space-5` (24px)
- `--space-6` (32px)

Preferir **8/12/16/24** em paddings e gaps.

### Componentes Padrão

#### Card de KPI
- Estrutura: label → valor → sub opcional
- Cor condicional com `border-left` colorido
- Grid 2 colunas, gap 12px

#### Avatar Pattern
- Todo evento tem: **ícone Lucide** + cor de texto + cor de fundo clara
- Nunca emoji — sempre `data-lucide`
- Mapear em função JS tipo `payIcon()`, nunca hardcoded

#### Card de Lista
- Hierarquia: nome (grande) → tag (pill pequeno) → meta discreta → valor (grande)
- Nunca duplicar número em dois lugares

#### Agrupamento por Dia
- Usar `groupByDay()` + `dayLabel()`
- Retorna "Hoje"/"Ontem"/"Dia da semana, DD de mês"
- Separador visual com linhas finas (estilo timeline)

#### Skeleton Loading
- Shimmer cinza por ~280ms
- Antes do conteúdo real
- Evita "flash" visual

### Regras de Linguagem (PT-PT/PT-AO)

- "de + o" = "do" (do mês passado)
- "de + a" = "da" (da semana passada)
- "ontem" sem artigo
- Frases completas por contexto
- Nomenclatura adaptada ao mercado angolano

### Ícones

- **Sempre Lucide:** `data-lucide="..."`
- Nunca emoji Unicode
- Após inserir dinamicamente, chamar `refreshIcons(container)`

### Cache / Service Worker

⚠️ Toda alteração de CSS/JS **exige** incrementar `CACHE_NAME` em `sw.js`
- Exemplo: `kontaki-v133` → `v134`
- Senão, dispositivos em cache continuam servindo versão antiga

---

## 🗺️ Roadmap

### Versão 2.0 (Atual) ✅
- ✅ Vendas offline-first
- ✅ Gestão completa de stock
- ✅ Contabilidade básica
- ✅ Fiados e crédito
- ✅ Dashboard
- ✅ Múltiplos utilizadores
- ✅ Backup opcional

### Próximas Versões 🚀
- **v2.1:** Integração com Multicaixa (gateway pagamento)
- **v2.2:** App mobile nativa (React Native)
- **v2.3:** API REST para integrações
- **v2.4:** IA para previsão de vendas
- **v3.0:** Plataforma SaaS completa

---

## 💬 Contato e Suporte

### Empresa
**Introxeer Technology, Lda.**  
Luanda, Angola

### Canais de Contato
- **Email:** info@introxeer.co.ao
- **WhatsApp:** +244 900 000 000
- **DPO (Privacy):** dpo@introxeer.co.ao
- **Suporte:** support@introxeer.co.ao

### Documentação Legal
- Termos de Uso: `termos.html`
- Política de Privacidade: `privacidade.html`
- FAQ e Ajuda: Dentro da aplicação

---

## ⚖️ Conformidade Legal

### Propriedade Intelectual
- © 2026 Introxeer Technology, Lda.
- Todos os direitos reservados
- Código-fonte proprietário
- **Marcas registadas:** Kontaki, Introxeer, Xee, Cloxeer, Topikos, Faroscoop

### Termos de Uso
- Aceitação obrigatória
- Uso pessoal não-comercial
- Não permitido: cópia, modificação, engenharia reversa
- Violações resultam em rescisão de licença

### Responsabilidade
- Fornecida "TAL COMO ESTÁ" (AS IS)
- Sem garantias de funcionamento ininterrupto
- Utilizador responsável pelos seus dados
- Limite de indemnização: valor pago ou 50.000 Kz

### Disputa
- Negociação amigável (60 dias)
- Arbitragem (Lei n.º 16/03)
- Centro de Arbitragem de Angola
- Renúncia a ações judiciais

---

## 📚 Boas Práticas

### Para Melhor Desempenho
1. ✅ Sincronize backup regularmente
2. ✅ Limpe histórico antigo mensalmente
3. ✅ Atualize a aplicação quando disponível
4. ✅ Use modo escuro para economia de bateria
5. ✅ Realize inventário mensal

### Para Segurança
1. ✅ Use PIN único e forte
2. ✅ Não compartilhe PIN
3. ✅ Faça logout ao sair
4. ✅ Guarde backup em local seguro
5. ✅ Revise auditoria regularmente

### Para Precisão Contabilística
1. ✅ Registre despesas no dia
2. ✅ Reporte fiados vencidos
3. ✅ Reconcilie caixa diariamente
4. ✅ Arquive períodos mensalmente
5. ✅ Mantenha NIF atualizado

---

## 📝 Estrutura do Repositório

```
kontaki/
├── index.html              # Aplicação principal
├── reset.html              # Página de reset de dados
├── server.js               # Servidor Node.js
├── sw.js                   # Service Worker
├── manifest.json           # PWA Manifest
├── package.json            # Configuração NPM
├── package-lock.json       # Lock file
├── DESIGN_SYSTEM.md        # Sistema de Design
├── RELEASE.md              # Checklist de Release
├── README.md               # Este arquivo
├── KONTAKI_DOCUMENTACAO_COMPLETA.txt  # Documentação completa
│
├── src/                    # Código-fonte
│   ├── main.js             # Inicialização
│   ├── db.js               # IndexedDB management
│   ├── auth.js             # Autenticação
│   ├── router.js           # Navegação
│   ├── utils.js            # Utilidades
│   ├── print.js            # Impressão/PDF
│   ├── modal.js            # Modais
│   ├── setup.js            # Configuração inicial
│   ├── onboarding.js       # Onboarding
│   ├── license.js          # Gestão de licença
│   ├── logger.js           # Logging
│   ├── pgc.js              # Chart of Accounts
│   ├── services.js         # Serviços de negócio
│   ├── message-ui.js       # Mensagens
│   └── styles/             # CSS
│       ├── base.css        # Estilos base
│       ├── layout.css      # Layout
│       └── ...
│
├── docs/                   # Documentação
│   ├── ARCHITECTURE.md     # Arquitetura
│   └── architecture/       # ADRs e decisões
│
└── assets/                 # Recursos
    ├── icons/              # Ícones PWA
    └── ...
```

---

## 🤝 Contribuindo

Este é um projeto proprietário. Para contribuições, contate:
- **support@introxeer.co.ao**
- **dpo@introxeer.co.ao**

---

## 📞 Suporte Rápido

### Problema comum: App não sincroniza
**Solução:**
1. Verifique conexão de internet
2. Vá para Perfil → Configurações → Sincronizar agora
3. Se persistir, tente reset: `/reset.html`

### Problema comum: Stock em discrepância
**Solução:**
1. Vá para Perfil → Gestão de Stock → Modo Inventário
2. Conte os produtos fisicamente
3. Ajuste quantidades
4. Feche o turno

### Problema comum: Login bloqueado
**Solução:**
1. Aguarde 15 minutos
2. O bloqueio é automático após 5 tentativas erradas
3. Recupere o PIN em Perfil → Segurança

---

## 📈 Estatísticas

- **Versão:** 2.0
- **Data:** Junho de 2026
- **Tamanho da app:** ~7.6MB
- **Tempo de carregamento:** <2s (com cache)
- **Tempo offline:** Ilimitado
- **Máximo de utilizadores:** 1 (Free) / 5 (Pro) / 20 (Business)

---

## 🎓 Aprenda Mais

- **[Design System](./DESIGN_SYSTEM.md)** — Guia completo de design
- **[Documentação Completa](./KONTAKI_DOCUMENTACAO_COMPLETA.txt)** — Referência técnica
- **[Checklist de Release](./RELEASE.md)** — Como publicar novas versões
- **Ajuda in-app** — Acesso através de Perfil → Ajuda

---

<div align="center">

**Desenvolvido com ❤️ pela Introxeer Technology, Lda.**

*Gestão de negócios inteligente. Offline. Segura. Para Angola e PALOP.*

© 2026 — Todos os direitos reservados

</div>
