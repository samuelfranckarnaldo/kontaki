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
    alerts.push({
      id: "product-expired", type: "product", category: "expired", severity: "danger",
      title: expired.length + " produto" + (expired.length>1?"s":"") + " vencido" + (expired.length>1?"s":""),
      description: expired.slice(0,3).map(function(p){return p.name;}).join(", ") + (expired.length>3?" e mais...":""),
      action: { page:"produtos", filter:"expired" },
      createdAt: latestTimestamp(expired, "updatedAt"),
      actionable: true,
    });
  }
  if (expiring.length) {
    alerts.push({
      id: "product-expiring", type: "product", category: "expiring", severity: "warning",
      title: expiring.length + " produto" + (expiring.length>1?"s":"") + " a vencer em 30 dias",
      description: expiring.slice(0,3).map(function(p){return p.name;}).join(", ") + (expiring.length>3?" e mais...":""),
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

export async function getSystemAlerts() {
  // Preparado para o futuro: sincronização, backups, licença, atualizações.
  return [];
}

// ── AGREGAÇÃO E ESTADO ───────────────────────────────────────────────────────

export async function buildNotificationState() {
  var [productAlerts, cashAlerts, systemAlerts, lastSeen] = await Promise.all([
    getProductAlerts(),
    getCashAlerts(),
    getSystemAlerts(),
    db.get("settings", "notificationsLastSeenAt"),
  ]);

  var lastSeenAt = (lastSeen && lastSeen.value) ? lastSeen.value : null;
  var all = productAlerts.concat(cashAlerts, systemAlerts);

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
