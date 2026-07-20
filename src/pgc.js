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
function expenseCostAccount(category) {
  if ((category||"").toLowerCase() === "salários" || (category||"").toLowerCase() === "salarios") return "72"; // Custos com o pessoal
  return "75"; // Outros custos e perdas operacionais
}

// Remove lançamentos anteriores de uma origem (usado antes de re-lançar numa edição).
// Recusa apagar lançamentos cuja data caia num período já fechado.
async function deleteJournalEntriesBySource(sourceType, sourceId) {
  var all = await db.getAll("journalEntries");
  var toDelete = all.filter(function(e){ return e.sourceType === sourceType && e.sourceId === sourceId; });
  for (var i = 0; i < toDelete.length; i++) {
    if (await isPeriodClosed(toDelete[i].date)) {
      throw new Error("Não é possível alterar — o período " + String(toDelete[i].date).slice(0,7) + " já está fechado.");
    }
  }
  for (var j = 0; j < toDelete.length; j++) {
    await db.delete("journalEntries", toDelete[j].id);
  }
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

// Lançamento de uma despesa: débito conta de custo, crédito Caixa/Depósitos
export async function postExpenseJournal(expense) {
  await deleteJournalEntriesBySource("expense", expense.id);
  if (!expense.countsInAccounting) return;
  var acctCusto  = expenseCostAccount(expense.category);
  var acctCredito = expensePaymentAccount(expense.payMethod);
  await createJournalEntry(expense.date, "Despesa — " + expense.description, "expense", expense.id, [
    { account: acctCusto, debit: expense.amount, credit: 0 },
    { account: acctCredito, debit: 0, credit: expense.amount },
  ]);
}
