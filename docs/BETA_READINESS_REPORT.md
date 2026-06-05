# Kontaki — Beta Readiness Report

**Data:** 2026-06-05  
**Versão DB:** 6  
**Ambiente:** Android / Termux / Node.js

---

## Estado Geral

| Área | Estado | Notas |
|------|--------|-------|
| Login | ✅ Funcional | Sessões automáticas |
| Vender | ✅ Funcional | Carrinho, checkout, recibo, QR |
| Produtos | ✅ Funcional | Stock duplo, transferências, ajustes |
| Fiados | ✅ Funcional | Pagamento total e parcial |
| Histórico | ✅ Funcional | Filtros por data, exportação CSV |
| Perfil Admin | ✅ Funcional | Dashboard, equipa, loja |
| Turno / KTK | ✅ Funcional | Geração e importação |
| Segurança HMAC | ✅ Funcional | Export/import storeKey |
| Incidentes | ✅ Funcional | Criação e resolução |
| Fornecedores | ✅ Funcional | Cadastro e compras |
| Modo Caixa Rápida | ✅ Funcional | Multi-produto |
| Error Boundary | ✅ Implementado | Modal amigável + log |
| Sistema de Logs | ✅ Implementado | Store IndexedDB |
| Backup/Restore | ✅ Implementado | Export/import JSON |
| Configurações | ✅ Implementado | Loja, backup, logs |

---

## Stores IndexedDB (DB_VERSION 6)

| Store | Registos seed | Índices |
|-------|--------------|---------|
| users | 2 | username |
| products | 6 | barcode |
| sales | 0 | date, sessionId |
| saleItems | 0 | saleId, productId |
| fiado | 0 | clientName, sessionId |
| incidents | 0 | productId, sessionId, status |
| sessions | 0 | uuid, userId, status |
| stockMovements | 12 (seed) | productId, sessionId, type, createdAt |
| sessionTransfers | 0 | fromSessionUuid, status |
| suppliers | 0 | — |
| purchases | 0 | — |
| settings | 2 (store, storeKey) | key |
| logs | 0 | date, level, userId |

---

## Funções Globais window._*

| Ficheiro | Count | Exemplos |
|----------|-------|---------|
| vender.js | 15 | _addProd, _confirmarVenda, _shareReceipt |
| perfil.js | 12 | _perfilNav, _saveProd, _resolveInc |
| produtos.js | 10 | _openProdMenu, _saveProduto, _applyTransfer |
| turno.js | 9 | _fecharTurno, _handleKtkImport, _validarKtk |
| fiados.js | 8 | _openFiadoCliente, _confirmPay, _pagarTudo |
| fornecedores.js | 5 | _saveSupplier, _saveCompra, _applyTransfer |
| seguranca.js | 4 | _exportStoreKey, _importStoreKey |
| quickmode.js | 4 | _qmAdd, _qmChangeQty, _qmNewSale |
| historico.js | 3 | _openSaleDetail, _reimprimirVenda |
| incidentes.js | 2 | _resolveInc |

Total: 72 funções globais — documentadas, sem conflitos detectados.

---

## Problemas Conhecidos

| # | Descrição | Impacto | Prioridade |
|---|-----------|---------|-----------|
| 1 | SessionTransfers não implementado | Baixo | Fase 3 |
| 2 | Histórico sem subtabs Auditoria | Médio | Próxima |
| 3 | Formatos de impressão (58mm/A4) | Médio | Próxima |
| 4 | Relatórios por funcionário | Médio | Próxima |
| 5 | Recuperação de senha offline | Alto | Próxima |

---

## Segurança

| Item | Estado |
|------|--------|
| HMAC-SHA256 para KTK | ✅ |
| AES-GCM para storeKey | ✅ |
| PBKDF2 para derivação de chave | ✅ |
| Guards de permissão (services.js) | ✅ |
| imported:true não afecta stock | ✅ |
| Deduplicação de KTK por UUID | ✅ |
| Senhas em texto simples na DB | ⚠️ Aceitável para Beta offline |

---

## Recomendações antes de Lançamento

1. **Hash de senhas** — implementar bcrypt ou SHA-256 para passwords
2. **Histórico de auditoria** — subtab com movimentos importados vs locais  
3. **Formatos de impressão** — CSS @media print para talão 58mm e A4
4. **Testes em múltiplos dispositivos** — verificar fluxo KTK completo
5. **Modo offline completo** — testar sem servidor (service worker futuro)

---

## Credenciais de Teste
Admin:  admin / admin123
Caixa:  caixa1 / caixa123
---

**Conclusão:** O Kontaki está pronto para Beta limitado com utilizadores reais em ambiente controlado.
