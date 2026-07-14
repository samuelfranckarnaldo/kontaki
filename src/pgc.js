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

// Cria um lançamento (partidas dobradas) — valida que débito == crédito antes de gravar
async function createJournalEntry(date, description, sourceType, sourceId, lines) {
  var totalDebit  = lines.reduce(function(a,l){ return a + (l.debit||0); }, 0);
  var totalCredit = lines.reduce(function(a,l){ return a + (l.credit||0); }, 0);
  if (Math.round(totalDebit*100) !== Math.round(totalCredit*100)) {
    throw new Error("Lançamento desequilibrado: débito " + totalDebit + " != crédito " + totalCredit + " (" + description + ")");
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
