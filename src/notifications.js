import { db } from "./db.js";

// ── MODELO DE NOTIFICAÇÃO ────────────────────────────────────────────────────
// { id, type, category, severity, title, description, action, createdAt, isNew }

function daysUntil(dateStr) {
  if (!dateStr) return Infinity;
  var diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / 86400000);
}

function latestTimestamp(items, field) {
  var dates = items.map(function(i){ return i[field] ? new Date(i[field]).getTime() : 0; });
  var max = Math.max.apply(null, dates.concat([0]));
  return max ? new Date(max).toISOString() : new Date().toISOString();
}

// ── FONTES DE ALERTA ─────────────────────────────────────────────────────────

export async function getProductAlerts() {
  var products = await db.getAll("products");
  var active = products.filter(function(p){ return p.active; });

  var zero = active.filter(function(p){ return (p.stock||0) === 0; });
  var low  = active.filter(function(p){ return (p.stock||0) > 0 && (p.stock||0) <= (p.minStock||5); });
  var expired  = active.filter(function(p){ return p.expiryDate && daysUntil(p.expiryDate) < 0; });
  var expiring = active.filter(function(p){ return p.expiryDate && daysUntil(p.expiryDate) <= 30 && daysUntil(p.expiryDate) >= 0; });

  var alerts = [];

  if (zero.length) {
    alerts.push({
      id: "product-zero", type: "product", category: "zero_stock", severity: "danger",
      title: zero.length + " produto" + (zero.length>1?"s":"") + " esgotado" + (zero.length>1?"s":""),
      description: zero.slice(0,3).map(function(p){return p.name;}).join(", ") + (zero.length>3?" e mais...":""),
      action: { page:"produtos", filter:"zero" },
      createdAt: latestTimestamp(zero, "updatedAt"),
      actionable: true,
    });
  }
  if (low.length) {
    alerts.push({
      id: "product-low", type: "product", category: "low_stock", severity: "warning",
      title: low.length + " produto" + (low.length>1?"s":"") + " com stock baixo",
      description: low.slice(0,3).map(function(p){return p.name;}).join(", ") + (low.length>3?" e mais...":""),
      action: { page:"produtos", filter:"low" },
      createdAt: latestTimestamp(low, "updatedAt"),
      actionable: true,
    });
  }
  if (expired.length) {
    var mostExpired = expired.slice().sort(function(a,b){ return daysUntil(a.expiryDate) - daysUntil(b.expiryDate); })[0];
    var daysAgo = Math.abs(daysUntil(mostExpired.expiryDate));
    alerts.push({
      id: "product-expired", type: "product", category: "expired", severity: "danger",
      title: expired.length + " produto" + (expired.length>1?"s":"") + " vencido" + (expired.length>1?"s":""),
      description: expired.slice(0,3).map(function(p){return p.name;}).join(", ") + (expired.length>3?" e mais...":"") +
        " · há " + daysAgo + " dia" + (daysAgo!==1?"s":""),
      action: { page:"produtos", filter:"expired" },
      createdAt: latestTimestamp(expired, "updatedAt"),
      actionable: true,
    });
  }
  if (expiring.length) {
    var soonest = expiring.slice().sort(function(a,b){ return daysUntil(a.expiryDate) - daysUntil(b.expiryDate); })[0];
    var daysLeft = daysUntil(soonest.expiryDate);
    alerts.push({
      id: "product-expiring", type: "product", category: "expiring", severity: "warning",
      title: expiring.length + " produto" + (expiring.length>1?"s":"") + " a vencer",
      description: expiring.slice(0,3).map(function(p){return p.name;}).join(", ") + (expiring.length>3?" e mais...":"") +
        " · " + (daysLeft===0 ? "vence hoje" : daysLeft===1 ? "vence amanhã" : "em " + daysLeft + " dias"),
      action: { page:"produtos", filter:"expiring" },
      createdAt: latestTimestamp(expiring, "updatedAt"),
      actionable: true,
    });
  }

  return alerts;
}

export async function getCashAlerts() {
  var incidents = await db.getAll("incidents");
  var open = incidents.filter(function(i){ return i.status === "open"; });

  if (!open.length) return [];

  return [{
    id: "cash-incidents", type: "cash", category: "incident", severity: "danger",
    title: open.length + " incidente" + (open.length>1?"s":"") + " de caixa/stock",
    description: "Requer revisão de um administrador",
    action: { page:"perfil", subpage:"incidentes" },
    createdAt: latestTimestamp(open, "createdAt"),
    actionable: true,
  }];
}

export async function getSupplierAlerts() {
  var [purchases, suppliers] = await Promise.all([
    db.getAll("purchases"),
    db.getAll("suppliers"),
  ]);
  var suppliersById = {};
  suppliers.forEach(function(s){ suppliersById[s.id] = s; });

  var vencidas = [];
  purchases.forEach(function(p) {
    if (p.archived === true) return;
    var saldo = (p.total||0) - (p.amountPaid||0);
    if (saldo <= 0) return;
    var supp = suppliersById[p.supplierId];
    if (!supp || !supp.paymentTermDays) return;
    var dueDate = new Date(p.date);
    dueDate.setDate(dueDate.getDate() + supp.paymentTermDays);
    if (new Date() > dueDate) {
      vencidas.push({ purchase: p, supplier: supp, dueDate: dueDate });
    }
  });

  var alerts = [];
  if (vencidas.length) {
    alerts.push({
      id: "supplier-overdue", type: "supplier", category: "overdue_payment", severity: "danger",
      title: vencidas.length + " conta" + (vencidas.length>1?"s":"") + " a fornecedor" + (vencidas.length>1?"es":"") + " vencida" + (vencidas.length>1?"s":""),
      description: vencidas.slice(0,3).map(function(v){return v.supplier.name;}).join(", ") + (vencidas.length>3?" e mais...":""),
      action: { page:"perfil", subpage:"fornecedores", tab:"compras", filter:"vencido" },
      createdAt: latestTimestamp(vencidas.map(function(v){return v.purchase;}), "date"),
      actionable: true,
    });
  }
  return alerts;
}

export async function getSystemAlerts() {
  // Preparado para o futuro: sincronização, backups, licença, atualizações.
  return [];
}

// ── AGREGAÇÃO E ESTADO ───────────────────────────────────────────────────────

export async function buildNotificationState() {
  var [productAlerts, cashAlerts, systemAlerts, supplierAlerts, lastSeen] = await Promise.all([
    getProductAlerts(),
    getCashAlerts(),
    getSystemAlerts(),
    getSupplierAlerts(),
    db.get("settings", "notificationsLastSeenAt"),
  ]);

  var lastSeenAt = (lastSeen && lastSeen.value) ? lastSeen.value : null;
  var all = productAlerts.concat(cashAlerts, systemAlerts, supplierAlerts);

  all.forEach(function(n) {
    n.actionable = n.actionable !== false;
    n.isNew = n.actionable ? true : (!lastSeenAt || new Date(n.createdAt) > new Date(lastSeenAt));
  });

  var badgeCount = all.filter(function(n){ return n.actionable || n.isNew; }).length;

  return { alerts: all, totalCount: all.length, badgeCount: badgeCount };
}

export async function markNotificationsSeen() {
  await db.put("settings", { key: "notificationsLastSeenAt", value: new Date().toISOString() });
}
