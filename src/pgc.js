import { db } from "./db.js";

// Plano Geral de Contabilidade — Angola (Decreto 82/01)
// tipo: activo | passivo | capital | proveito | custo | resultado
// natureza: devedora | credora  (lado que aumenta o saldo da conta)
export const CHART_OF_ACCOUNTS = [
  // Classe 1 — Meios Fixos e Investimentos
  { code:"11", name:"Imobilizações Corpóreas",        classe:1, tipo:"activo", natureza:"devedora" },
  { code:"12", name:"Imobilizações Incorpóreas",      classe:1, tipo:"activo", natureza:"devedora" },
  { code:"13", name:"Investimentos Financeiros",      classe:1, tipo:"activo", natureza:"devedora" },
  { code:"14", name:"Imobilizações em Curso",         classe:1, tipo:"activo", natureza:"devedora" },
  { code:"18", name:"Amortizações Acumuladas",        classe:1, tipo:"activo", natureza:"credora" },

  // Classe 2 — Existências
  { code:"21", name:"Compras",                        classe:2, tipo:"activo", natureza:"devedora" },
  { code:"22", name:"Matérias-primas, subsidiárias e de consumo", classe:2, tipo:"activo", natureza:"devedora" },
  { code:"23", name:"Produtos e trabalhos em curso",  classe:2, tipo:"activo", natureza:"devedora" },
  { code:"24", name:"Produtos Acabados e Intermédios",classe:2, tipo:"activo", natureza:"devedora" },
  { code:"25", name:"Subprodutos, desperdícios e refugos", classe:2, tipo:"activo", natureza:"devedora" },
  { code:"26", name:"Mercadorias",                    classe:2, tipo:"activo", natureza:"devedora" },
  { code:"27", name:"Matérias-primas/mercadorias em trânsito", classe:2, tipo:"activo", natureza:"devedora" },
  { code:"28", name:"Adiantamentos por conta de compras", classe:2, tipo:"activo", natureza:"devedora" },

  // Classe 3 — Terceiros
  { code:"31", name:"Clientes",                       classe:3, tipo:"activo",  natureza:"devedora" },
  { code:"32", name:"Fornecedores",                   classe:3, tipo:"passivo", natureza:"credora" },
  { code:"33", name:"Empréstimos",                    classe:3, tipo:"passivo", natureza:"credora" },
  { code:"34", name:"Estado",                         classe:3, tipo:"passivo", natureza:"credora" },
  { code:"35", name:"Entidades Participantes e Participadas", classe:3, tipo:"activo", natureza:"devedora" },
  { code:"36", name:"Pessoal",                        classe:3, tipo:"passivo", natureza:"credora" },
  { code:"37", name:"Outros valores a receber e a pagar", classe:3, tipo:"activo", natureza:"devedora" },

  // Classe 4 — Meios Monetários
  { code:"41", name:"Títulos Negociáveis",            classe:4, tipo:"activo", natureza:"devedora" },
  { code:"42", name:"Depósitos a prazo",               classe:4, tipo:"activo", natureza:"devedora" },
  { code:"43", name:"Depósitos à ordem",               classe:4, tipo:"activo", natureza:"devedora" },
  { code:"44", name:"Outros depósitos",                classe:4, tipo:"activo", natureza:"devedora" },
  { code:"45", name:"Caixa",                           classe:4, tipo:"activo", natureza:"devedora" },

  // Classe 5 — Capital e Reservas
  { code:"51", name:"Capital",                         classe:5, tipo:"capital", natureza:"credora" },
  { code:"55", name:"Reservas legais",                 classe:5, tipo:"capital", natureza:"credora" },
  { code:"58", name:"Reservas livres",                 classe:5, tipo:"capital", natureza:"credora" },

  // Classe 6 — Proveitos por Natureza
  { code:"61", name:"Vendas",                          classe:6, tipo:"proveito", natureza:"credora" },
  { code:"62", name:"Prestações de serviços",          classe:6, tipo:"proveito", natureza:"credora" },
  { code:"63", name:"Outros proveitos operacionais",   classe:6, tipo:"proveito", natureza:"credora" },
  { code:"66", name:"Proveitos e ganhos financeiros",  classe:6, tipo:"proveito", natureza:"credora" },
  { code:"68", name:"Outros proveitos não operacionais", classe:6, tipo:"proveito", natureza:"credora" },
  { code:"69", name:"Proveitos e ganhos extraordinários", classe:6, tipo:"proveito", natureza:"credora" },

  // Classe 7 — Custos por Natureza
  { code:"71", name:"Custo das existências vendidas",  classe:7, tipo:"custo", natureza:"devedora" },
  { code:"72", name:"Custos com o pessoal",            classe:7, tipo:"custo", natureza:"devedora" },
  { code:"73", name:"Amortizações do exercício",       classe:7, tipo:"custo", natureza:"devedora" },
  { code:"75", name:"Outros custos e perdas operacionais", classe:7, tipo:"custo", natureza:"devedora" },
  { code:"75.1",  name:"Renda",                        classe:7, tipo:"custo", natureza:"devedora" },
  { code:"75.2",  name:"Electricidade",                 classe:7, tipo:"custo", natureza:"devedora" },
  { code:"75.3",  name:"Água",                          classe:7, tipo:"custo", natureza:"devedora" },
  { code:"75.4",  name:"Transporte",                    classe:7, tipo:"custo", natureza:"devedora" },
  { code:"75.5",  name:"Manutenção",                    classe:7, tipo:"custo", natureza:"devedora" },
  { code:"75.6",  name:"Internet/Telefone",             classe:7, tipo:"custo", natureza:"devedora" },
  { code:"75.7",  name:"Impostos e Taxas",              classe:7, tipo:"custo", natureza:"devedora" },
  { code:"75.8",  name:"Combustível",                   classe:7, tipo:"custo", natureza:"devedora" },
  { code:"75.9",  name:"Marketing e Publicidade",       classe:7, tipo:"custo", natureza:"devedora" },
  { code:"75.10", name:"Seguros",                       classe:7, tipo:"custo", natureza:"devedora" },
  { code:"75.11", name:"Material de Escritório",        classe:7, tipo:"custo", natureza:"devedora" },
  { code:"75.12", name:"Limpeza",                       classe:7, tipo:"custo", natureza:"devedora" },
  { code:"75.13", name:"Segurança",                     classe:7, tipo:"custo", natureza:"devedora" },
  { code:"75.14", name:"Comissões",                     classe:7, tipo:"custo", natureza:"devedora" },
  { code:"75.15", name:"Despesas diversas (Outro)",     classe:7, tipo:"custo", natureza:"devedora" },
  { code:"76", name:"Custos e perdas financeiras",     classe:7, tipo:"custo", natureza:"devedora" },
  { code:"78", name:"Outros custos não operacionais",  classe:7, tipo:"custo", natureza:"devedora" },
  { code:"79", name:"Custos e perdas extraordinários", classe:7, tipo:"custo", natureza:"devedora" },

  // Classe 8 — Resultados
  { code:"81", name:"Resultados Transitados",          classe:8, tipo:"resultado", natureza:"credora" },
  { code:"82", name:"Resultados operacionais",         classe:8, tipo:"resultado", natureza:"credora" },
  { code:"83", name:"Resultados financeiros",          classe:8, tipo:"resultado", natureza:"credora" },
  { code:"85", name:"Resultados não operacionais",     classe:8, tipo:"resultado", natureza:"credora" },
  { code:"86", name:"Resultados Extraordinários",      classe:8, tipo:"resultado", natureza:"credora" },
  { code:"87", name:"Imposto sobre os lucros",         classe:8, tipo:"resultado", natureza:"devedora" },
  { code:"88", name:"Resultados líquidos do exercício",classe:8, tipo:"resultado", natureza:"credora" },
];

// Semeia o plano de contas se ainda não existir (idempotente — seguro chamar sempre)
export async function seedChartOfAccounts() {
  var existing = await db.getAll("chartOfAccounts");
  if (existing && existing.length) return;
  for (var i = 0; i < CHART_OF_ACCOUNTS.length; i++) {
    await db.put("chartOfAccounts", CHART_OF_ACCOUNTS[i]);
  }
}

// Mapeia forma de pagamento -> conta de Meios Monetários / Terceiros
function paymentAccount(method) {
  var m = (method || "").toLowerCase();
  if (m.includes("fiado") || m.includes("crédito")) return "31"; // Clientes
  if (m.includes("transfer") || m.includes("banco") || m.includes("multicaixa") || m.includes("cartão") || m.includes("cartao")) return "43"; // Depósitos à ordem
  return "45"; // Caixa (dinheiro / default)
}

// Verifica se um mes (YYYY-MM) ja foi fechado — periodos fechados sao imutaveis.
export async function isPeriodClosed(dateStr) {
  if (!dateStr) return false;
  var period = String(dateStr).slice(0, 7);
  var closure = await db.get("accountingArchive", period);
  return !!closure;
}

// Cria um lançamento (partidas dobradas) — valida que débito == crédito antes de gravar
// e que a data não cai num período já fechado.
async function createJournalEntry(date, description, sourceType, sourceId, lines, _bypassClosedCheck) {
  var totalDebit  = lines.reduce(function(a,l){ return a + (l.debit||0); }, 0);
  var totalCredit = lines.reduce(function(a,l){ return a + (l.credit||0); }, 0);
  if (Math.round(totalDebit*100) !== Math.round(totalCredit*100)) {
    throw new Error("Lançamento desequilibrado: débito " + totalDebit + " != crédito " + totalCredit + " (" + description + ")");
  }
  if (!_bypassClosedCheck && await isPeriodClosed(date)) {
    throw new Error("Período " + String(date).slice(0,7) + " já está fechado — não é possível criar lançamentos nesse mês.");
  }
  return db.add("journalEntries", { date, description, sourceType, sourceId, lines, createdAt: new Date().toISOString() });
}

// Gera os lançamentos de uma venda: (1) receita, (2) custo das existências vendidas
// sale: { id, date, total, subtotal, discount, ivaValor, payMethod }
// items: [{ id, qty }] — usa costPrice dos produtos para o COGS
export async function postSaleJournal(sale, items) {
  var acctRecebimento = paymentAccount(sale.payMethod);
  var receitaLiquida = (sale.subtotal||0) - (sale.discount||0);
  var iva = sale.ivaValor || 0;

  var linesReceita = [
    { account: acctRecebimento, debit: sale.total, credit: 0 },
    { account: "61", debit: 0, credit: receitaLiquida },
  ];
  if (iva > 0) linesReceita.push({ account: "34", debit: 0, credit: iva });

  await createJournalEntry(sale.date, "Venda #" + sale.id, "sale", sale.id, linesReceita);

  // COGS — busca costPrice dos produtos envolvidos
  var products = await db.getAll("products");
  var prodMap = {};
  products.forEach(function(p){ prodMap[p.id] = p; });

  var cogs = items.reduce(function(a, it) {
    var p = prodMap[it.id];
    return a + (p ? (p.costPrice||0) * it.qty : 0);
  }, 0);

  if (cogs > 0) {
    await createJournalEntry(sale.date, "Custo da venda #" + sale.id, "sale", sale.id, [
      { account: "71", debit: cogs, credit: 0 },
      { account: "26", debit: 0, credit: cogs },
    ]);
  }
}

// Estorna uma devolução (parcial ou total) de uma venda já lançada.
// Reverte a receita (e o IVA proporcional) e o custo das existências vendidas.
// params: { saleId, date, payMethod, totalBase, ivaValor, cogs }
export async function postReturnJournal(params) {
  var acctRecebimento = paymentAccount(params.payMethod);
  var totalEstorno = (params.totalBase||0) + (params.ivaValor||0);

  var linesEstorno = [
    { account: "61", debit: params.totalBase||0, credit: 0 },
  ];
  if (params.ivaValor > 0) linesEstorno.push({ account: "34", debit: params.ivaValor, credit: 0 });
  linesEstorno.push({ account: acctRecebimento, debit: 0, credit: totalEstorno });

  await createJournalEntry(params.date, "Devolução — Venda #" + params.saleId, "return", params.saleId, linesEstorno);

  if (params.cogs > 0) {
    await createJournalEntry(params.date, "Estorno do custo — Venda #" + params.saleId, "return", params.saleId, [
      { account: "26", debit: params.cogs, credit: 0 },
      { account: "71", debit: 0, credit: params.cogs },
    ]);
  }
}

// Mapeia forma de pagamento de compra -> conta
function purchasePaymentAccount(method) {
  var m = (method || "").toLowerCase();
  if (m.includes("credit") || m.includes("crédito") || m.includes("credito")) return "32"; // Fornecedores
  if (m.includes("transfer") || m.includes("multicaixa") || m.includes("cartão") || m.includes("cartao")) return "43"; // Depósitos à ordem
  return "45"; // Dinheiro (default)
}

// Lançamento de uma compra: débito Mercadorias, crédito conta de pagamento (ou Fornecedores, se a crédito)
export async function postPurchaseJournal(params) {
  var acctCredito = purchasePaymentAccount(params.payMethod);
  await createJournalEntry(params.date, "Compra #" + params.purchaseId, "purchase", params.purchaseId, [
    { account: "26", debit: params.total, credit: 0 },
    { account: acctCredito, debit: 0, credit: params.total },
  ]);
}

// Liquidação parcial de uma compra a crédito no próprio acto (assume pagamento em dinheiro)
export async function postSupplierPaymentJournal(params) {
  await createJournalEntry(params.date, "Pagamento a fornecedor — Compra #" + params.purchaseId, "purchase", params.purchaseId, [
    { account: "32", debit: params.amountPaid, credit: 0 },
    { account: "45", debit: 0, credit: params.amountPaid },
  ]);
}

// Mapeia forma de pagamento de despesa -> conta de crédito (despesas são sempre pagas no acto)
function expensePaymentAccount(method) {
  var m = (method || "").toLowerCase();
  if (m.includes("transfer") || m.includes("multicaixa")) return "43"; // Depósitos à ordem
  return "45"; // Dinheiro (default)
}

// Mapeia categoria de despesa -> conta de custo
var EXPENSE_ACCOUNT_MAP = {
  "salários": "72", "salarios": "72",
  "renda": "75.1",
  "electricidade": "75.2",
  "água": "75.3", "agua": "75.3",
  "transporte": "75.4",
  "manutenção": "75.5", "manutencao": "75.5",
  "internet/telefone": "75.6",
  "impostos e taxas": "75.7",
  "combustível": "75.8", "combustivel": "75.8",
  "marketing e publicidade": "75.9",
  "seguros": "75.10",
  "material de escritório": "75.11", "material de escritorio": "75.11",
  "limpeza": "75.12",
  "segurança": "75.13", "seguranca": "75.13",
  "comissões": "75.14", "comissoes": "75.14",
};
function expenseCostAccount(category) {
  var cat = (category || "").toLowerCase();
  return EXPENSE_ACCOUNT_MAP[cat] || "75.15"; // "Outro" e qualquer categoria não mapeada
}

// ── FECHO DE EXERCÍCIO (mensal) ──────────────────────────────────────────────
// Fecha um mês (YYYY-MM) já terminado: zera as contas de Proveitos (classe 6)
// e Custos (classe 7) desse mês, transferindo o saldo líquido para a conta 88
// (Resultados líquidos do exercício). Grava o registo em accountingArchive,
// tornando o mês imutável a partir daí (ver isPeriodClosed).
export async function closeAccountingPeriod(period, closedByUserId) {
  if (await isPeriodClosed(period)) {
    throw new Error("O período " + period + " já está fechado.");
  }
  var now = new Date();
  var currentPeriod = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0");
  if (period >= currentPeriod) {
    throw new Error("Só é possível fechar meses já terminados.");
  }

  var entries = await db.getAll("journalEntries");
  var doMes = entries.filter(function(e){ return String(e.date).slice(0,7) === period; });

  var saldosPorConta = {};
  doMes.forEach(function(e) {
    (e.lines||[]).forEach(function(l) {
      var acc = CHART_OF_ACCOUNTS.find(function(c){ return c.code === l.account; });
      if (!acc || (acc.tipo !== "proveito" && acc.tipo !== "custo")) return;
      saldosPorConta[l.account] = saldosPorConta[l.account] || 0;
      // proveito é credora (credit-debit), custo é devedora (debit-credit)
      saldosPorConta[l.account] += acc.natureza === "credora" ? (l.credit-l.debit) : (l.debit-l.credit);
    });
  });

  var contasComSaldo = Object.keys(saldosPorConta).filter(function(code){ return Math.round(saldosPorConta[code]*100) !== 0; });

  var closingLines = [];
  var totalProveitos = 0, totalCustos = 0;
  contasComSaldo.forEach(function(code) {
    var acc = CHART_OF_ACCOUNTS.find(function(c){ return c.code === code; });
    var saldo = saldosPorConta[code];
    if (acc.tipo === "proveito") {
      totalProveitos += saldo;
      // zera a conta de proveito (debito) e credita 88
      closingLines.push({ account: code, debit: saldo, credit: 0 });
      closingLines.push({ account: "88", debit: 0, credit: saldo });
    } else {
      totalCustos += saldo;
      // zera a conta de custo (credito) e debita 88
      closingLines.push({ account: code, debit: 0, credit: saldo });
      closingLines.push({ account: "88", debit: saldo, credit: 0 });
    }
  });

  var dataFecho = period + "-28"; // ultimo dia util seguro do mes, evita problemas de dias curtos
  var closingEntryIds = [];
  if (closingLines.length) {
    var entryId = await createJournalEntry(
      dataFecho, "Fecho do exercício — " + period, "period_closure", period, closingLines, true
    );
    closingEntryIds.push(entryId);
  }

  var resultadoLiquido = totalProveitos - totalCustos;

  await db.put("accountingArchive", {
    period: period,
    closedAt: new Date().toISOString(),
    closedBy: closedByUserId,
    totalProveitos: totalProveitos,
    totalCustos: totalCustos,
    resultadoLiquido: resultadoLiquido,
    saldosPorConta: saldosPorConta,
    closingEntryIds: closingEntryIds,
  });

  return { period, totalProveitos, totalCustos, resultadoLiquido };
}

// Calcula o saldo atual de uma conta a partir de todos os lançamentos —
// usado para validar operações de Tesouraria antes de gravar (ex: nao deixar
// retirar/levantar mais do que o saldo disponivel em Caixa/Banco).
export async function getAccountBalance(code) {
  var acc = CHART_OF_ACCOUNTS.find(function(c){ return c.code === code; });
  if (!acc) return 0;
  var entries = await db.getAll("journalEntries");
  var saldo = 0;
  entries.forEach(function(e) {
    (e.lines||[]).forEach(function(l) {
      if (l.account !== code) return;
      saldo += acc.natureza === "devedora" ? (l.debit-l.credit) : (l.credit-l.debit);
    });
  });
  return saldo;
}

// ── TESOURARIA ────────────────────────────────────────────────────────────
// Conta usada para movimentos com o proprietário (aporte/retirada de capital
// e reforço de caixa vindo do próprio proprietário). Provisório: o PGC ainda
// nao tem uma conta corrente de socio/titular propria — usa-se Capital (51)
// ate essa conta ser criada e migrada. Ver discussao no handoff sobre V1/V2.
// ── ATIVOS FIXOS E AMORTIZAÇÕES ──────────────────────────────────────────────
// Amortização linear simples: valor de compra / vida útil em meses, até ao
// limite do valor de compra (nunca amortiza mais do que o bem vale).

function amortizacaoMensal(asset) {
  if (!asset.usefulLifeMonths) return 0;
  return Math.round((asset.purchaseValue / asset.usefulLifeMonths) * 100) / 100;
}

// Soma da amortização já lançada para um ativo, em todos os períodos.
export async function getAssetAccumulatedDepreciation(assetId, allEntriesCache) {
  var allEntries = allEntriesCache || (await db.getAll("journalEntries"));
  return allEntries
    .filter(function(e) { return e.sourceType === "depreciation" && e.sourceId === assetId; })
    .reduce(function(a, e) {
      var linha18 = (e.lines || []).find(function(l) { return l.account === "18"; });
      return a + (linha18 ? linha18.credit : 0);
    }, 0);
}

// Lança as amortizações de um período (YYYY-MM) para todos os ativos ativos
// que ainda não tenham sido amortizados nesse período e que ainda tenham
// valor por amortizar. Devolve quantos lançamentos foram criados.
export async function postDepreciationJournal(period) {
  if (await isPeriodClosed(period + "-01")) {
    throw new Error("Não é possível lançar amortizações — o período " + period + " já está fechado.");
  }
  var assets = await db.getAll("fixedAssets");
  var allEntries = await db.getAll("journalEntries");
  var lancados = 0;

  for (var i = 0; i < assets.length; i++) {
    var asset = assets[i];
    if (!asset.active) continue;
    if (String(asset.purchaseDate).slice(0, 7) > period) continue;

    var jaLancado = allEntries.some(function (e) {
      return e.sourceType === "depreciation" && e.sourceId === asset.id && String(e.date).slice(0, 7) === period;
    });
    if (jaLancado) continue;

    var acumulado = await getAssetAccumulatedDepreciation(asset.id, allEntries);
    var restante = Math.round((asset.purchaseValue - acumulado) * 100) / 100;
    if (restante <= 0) continue;

    var valor = Math.min(amortizacaoMensal(asset), restante);
    if (valor <= 0) continue;

    await createJournalEntry(period + "-01", "Amortização — " + asset.name + " (" + period + ")", "depreciation", asset.id, [
      { account: "73", debit: valor, credit: 0 },
      { account: "18", debit: 0, credit: valor },
    ]);
    lancados++;
  }
  return lancados;
}

// Lançamento da compra de um ativo fixo: débito Imobilizações Corpóreas (11),
// crédito Caixa (dinheiro) ou Depósitos à ordem (transferência).
export async function postFixedAssetPurchaseJournal(params) {
  var acctCredito = params.payMethod === "transferencia" ? "43" : "45";
  return createJournalEntry(params.date, "Compra de ativo — " + params.description, "fixed_asset_purchase", params.assetId, [
    { account: "11", debit: params.amount, credit: 0 },
    { account: acctCredito, debit: 0, credit: params.amount },
  ]);
}

export const OWNER_ACCOUNT = "51";

// Lança um movimento entre Caixa/Banco e a conta do proprietário.
// direction: "in"  (proprietario -> caixa/banco, ex: aporte, reforco de origem proprietario)
//            "out" (caixa/banco -> proprietario, ex: retirada)
// method: "caixa" (conta 45) ou "banco" (conta 43)
export async function postOwnerContribution(params) {
  var acct = params.method === "banco" ? "43" : "45";
  var lines = params.direction === "out"
    ? [ { account: OWNER_ACCOUNT, debit: params.amount, credit: 0 },
        { account: acct,          debit: 0, credit: params.amount } ]
    : [ { account: acct,          debit: params.amount, credit: 0 },
        { account: OWNER_ACCOUNT, debit: 0, credit: params.amount } ];
  return createJournalEntry(params.date, params.description, "treasury", params.movementId, lines);
}

// Lança uma transferência entre Caixa (45) e Banco (43) — nas duas direções.
// direction: "caixa_to_banco" ou "banco_to_caixa"
export async function postBankTransfer(params) {
  var lines = params.direction === "caixa_to_banco"
    ? [ { account: "43", debit: params.amount, credit: 0 },
        { account: "45", debit: 0, credit: params.amount } ]
    : [ { account: "45", debit: params.amount, credit: 0 },
        { account: "43", debit: 0, credit: params.amount } ];
  return createJournalEntry(params.date, params.description, "treasury", params.movementId, lines);
}

// Lançamento de uma despesa: débito conta de custo, crédito Caixa/Depósitos.
// Em edições, NÃO apaga o lançamento anterior — estorna-o (contrapartida) e
// lança o novo, preservando o histórico completo no Diário para auditoria
// (princípio de imutabilidade contabilística: um lançamento postado nunca
// desaparece, só é corrigido por contrapartida).
export async function postExpenseJournal(expense) {
  var all = await db.getAll("journalEntries");
  var anteriores = all.filter(function(e) { return e.sourceType === "expense" && e.sourceId === expense.id; });

  // Primeira vez (criação) — sem histórico anterior a preservar.
  if (anteriores.length === 0) {
    if (!expense.countsInAccounting) return;
    var acctCusto0  = expenseCostAccount(expense.category);
    var acctCredito0 = expensePaymentAccount(expense.payMethod);
    await createJournalEntry(expense.date, "Despesa — " + expense.description, "expense", expense.id, [
      { account: acctCusto0, debit: expense.amount, credit: 0 },
      { account: acctCredito0, debit: 0, credit: expense.amount },
    ]);
    return;
  }

  // Edição — estorna o(s) lançamento(s) anterior(es).
  for (var i = 0; i < anteriores.length; i++) {
    var ant = anteriores[i];
    if (await isPeriodClosed(ant.date)) {
      throw new Error("Não é possível corrigir — o período " + String(ant.date).slice(0,7) + " já está fechado.");
    }
  }
  for (var j = 0; j < anteriores.length; j++) {
    var e2 = anteriores[j];
    var linhasInvertidas = e2.lines.map(function(l) {
      return { account: l.account, debit: l.credit || 0, credit: l.debit || 0 };
    });
    await createJournalEntry(e2.date, "Estorno (correção) — " + e2.description, "expense", expense.id, linhasInvertidas);
  }

  if (!expense.countsInAccounting) return;

  if (await isPeriodClosed(expense.date)) {
    throw new Error("Não é possível lançar — o período " + String(expense.date).slice(0,7) + " já está fechado.");
  }
  var acctCusto  = expenseCostAccount(expense.category);
  var acctCredito = expensePaymentAccount(expense.payMethod);
  await createJournalEntry(expense.date, "Despesa — " + expense.description, "expense", expense.id, [
    { account: acctCusto, debit: expense.amount, credit: 0 },
    { account: acctCredito, debit: 0, credit: expense.amount },
  ]);
}

// Lançamento de um ajuste de caixa (contagem física vs esperado). Sobra
// (diff > 0) credita um proveito (63); falta (diff < 0) debita um custo (75).
// A conta 45 é sempre ajustada para bater com a contagem física real.
export async function postAjusteCaixaJournal(params) {
  if (!params.diff) return null;
  var valor = Math.abs(params.diff);
  var lines = params.diff > 0
    ? [ { account: "45", debit: valor, credit: 0 },
        { account: "63", debit: 0, credit: valor } ]
    : [ { account: "75", debit: valor, credit: 0 },
        { account: "45", debit: 0, credit: valor } ];
  return createJournalEntry(params.date, "Ajuste de caixa — " + (params.description || "Contagem física"), "treasury_adjustment", params.movementId, lines);
}
