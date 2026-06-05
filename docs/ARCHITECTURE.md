# Kontaki — Arquitectura Técnica

## Estrutura de Pastas
kontaki/
├── index.html              # Shell HTML — contém toda a UI estática
├── server.js               # Servidor Node HTTP simples (porta 3000)
├── reset.html              # Página de reset da IndexedDB
├── assets/
│   ├── lucide.min.js       # Ícones SVG (offline)
│   ├── qrcode.min.js       # Geração de QR offline
│   └── fonts/              # DM Sans (woff2)
├── docs/
│   ├── ARCHITECTURE.md     # Este ficheiro
│   └── BETA_READINESS_REPORT.md
└── src/
├── main.js             # Ponto de entrada — seed + initAuth
├── auth.js             # Autenticação + gestão de sessão
├── db.js               # IndexedDB wrapper + seed
├── services.js         # Camada de negócio + guards de permissão
├── router.js           # Navegação entre abas
├── utils.js            # Utilitários (fmt, el, refreshIcons, generateQR)
├── modal.js            # Sistema de modais
├── toast.js            # Notificações temporárias
└── components/
├── vender.js       # Aba Vender — carrinho, checkout, recibo
├── produtos.js     # Aba Produtos — stock duplo, transferências
├── fiados.js       # Aba Fiados — crédito por cliente
├── historico.js    # Aba Histórico — vendas e exportação CSV
├── perfil.js       # Aba Perfil — subpáginas admin/caixa
├── dashboard.js    # Subpágina — KPIs e gráficos
├── turno.js        # Subpágina — fecho de turno e KTK
├── seguranca.js    # Subpágina — StoreKey HMAC
├── incidentes.js   # Subpágina — divergências de stock
├── fornecedores.js # Subpágina — fornecedores e compras
├── quickmode.js    # Modo caixa rápida (overlay)
└── camera.js       # Scanner de código de barras
## Stores IndexedDB (DB_VERSION 5)

| Store | Descrição | Índices |
|-------|-----------|---------|
| users | Utilizadores e roles | username |
| products | Produtos (cache de stock) | barcode |
| sales | Vendas realizadas | date, sessionId |
| saleItems | Items de cada venda | saleId, productId |
| fiado | Créditos por cliente | clientName, sessionId |
| incidents | Divergências de stock | productId, sessionId, status |
| sessions | Turnos de trabalho | uuid, userId, status |
| stockMovements | Fonte de verdade do stock | productId, sessionId, type, createdAt |
| sessionTransfers | Transferências de turno | fromSessionUuid, status |
| suppliers | Fornecedores | — |
| purchases | Compras a fornecedores | — |
| settings | Configurações (store, storeKey) | key |

## Regra Global — Stock
StockMovements = fonte oficial de verdade
Products.stock = cache sincronizado (nunca escrever directamente)
imported:true  = movimentos de auditoria (excluídos de getStock())
## Fluxo de Login
Utilizador introduz credenciais
→ db.getAll("users") — verifica username + password
→ db.getAll("sessions") — procura turno aberto do utilizador
→ SE EXISTE: retoma turno (currentSession = openSession)
→ SE NÃO EXISTE: sessionService.openSession() — cria novo turno
→ currentUser.sessionId = sessionId
→ import("./router.js") → router.init()
→ router.go("vender")
## Fluxo de Turno
ABRIR TURNO (automático no login)
sessionService.openSession(userId, userName, prevSessionUuid)
→ Gera UUID único para a sessão
→ Regista stockRecebido (snapshot do stock actual)
→ Cria StockMovements tipo "session_open" para cada produto
→ Persiste em sessions{}
FECHAR TURNO (manual — Perfil → Meu Turno)
sessionService.closeSession(sessionId)
→ Calcula stockEsperado (recebido - vendido)
→ Actualiza sessions{status: "closed"}
ktkService.generate(sessionId)
→ Agrega vendas, fiados, incidentes, movimentos da sessão
→ Gera HMAC-SHA256 com storeKey
→ Retorna ficheiro .ktk para download/partilha
IMPORTAR TURNO (admin — Perfil → Meu Turno)
validateKtkHash(ktk) → verifica integridade HMAC
sessionService.checkDuplicate(uuid) → evita importação dupla
ktkService.import(ktk)
→ Cria sessão importada com imported:true
→ Insere stockMovements com imported:true (não afectam stock operacional)
→ Cria incidents para divergências detectadas
## Fluxo de Venda
Pesquisa ou scan de produto
→ addToCart(product) — verifica stock disponível
→ openCheckout() — resumo + método de pagamento
→ saleService.create(items, payMethod, discount, client)
→ Verifica stock via getStock() (ignora imported:true)
→ db.add("sales") + db.add("saleItems")
→ addStockMovement(type:"sale", qty:-n) para cada item
→ addStockMovement actualiza cache Products.stock
→ SE fiado: db.add("fiado")
→ showReceipt() — recibo com QR gerado offline
## Fluxo de Fiado
Durante venda: payMethod = "fiado" + nome do cliente
→ saleService.create() → db.add("fiado", {status:"open"})
Pagamento (Aba Fiados):
→ _confirmPay(id, amount)
→ pagamento total: fiado.status = "paid"
→ pagamento parcial: fiado.amount -= pagamento + novo registo paid
Visualização:
→ Agrupado por cliente
→ Total em aberto calculado em tempo real
## Fluxo de Sincronização KTK
DISPOSITIVO DO CAIXA                    DISPOSITIVO DO PATRÃO
─────────────────────                   ─────────────────────
Fecha turno
ktkService.generate()
HMAC-SHA256 com storeKey
Download .ktk
Partilha por WhatsApp ──────────────→ Recebe .ktk
6. Perfil → Meu Turno → Importar
7. validateKtkHash() — verifica HMAC
8. checkDuplicate() — evita duplicados
9. ktkService.import()
10. Sessão criada (isImported:true)
11. Incidentes visíveis em Perfil → Incidentes
## Permissões

| Operação | Admin | Caixa |
|----------|-------|-------|
| Vender | ✓ | ✓ |
| Ver fiados | ✓ | ✓ |
| Ver histórico | ✓ | ✓ |
| Fechar turno | ✓ | ✓ |
| Criar produto | ✓ | ✗ |
| Ajustar stock | ✓ | ✗ |
| Resolver incidentes | ✓ | ✗ |
| Importar KTK | ✓ | ✗ |
| Gerir storeKey | ✓ | ✗ |
| Dashboard | ✓ | ✗ |
| Gerir equipa | ✓ | ✗ |

## Tecnologias

- **Runtime**: Node.js (servidor estático simples)
- **Frontend**: HTML + CSS + ES6 Modules (sem framework)
- **Base de dados**: IndexedDB (offline-first)
- **Ícones**: Lucide (local, offline)
- **QR**: QRCode.js (local, offline)
- **Criptografia**: Web Crypto API (HMAC-SHA256, AES-GCM, PBKDF2)
- **Fontes**: DM Sans (local, offline)
