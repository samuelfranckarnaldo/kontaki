// Motor de mensagens do Console (centro de comunicação Console -> Kontaki).
// Busca mensagens elegíveis quando há rede, guarda em cache local (para
// funcionar offline), e decide o que mostrar: notificação normal (cai
// no centro de notificações existente), modal dispensável, ou modal
// bloqueante (sem fechar, só resolve por versão/expiração/desativação).
import { db } from "./db.js";
import { APP_VERSION } from "./version.js";

var CONSOLE_API = "https://kontaki-console.vercel.app/api";

// ── VERSÃO ────────────────────────────────────────────────────────────────

function parseVersion(v) {
  return String(v || "0").split(".").map(function(n) { return parseInt(n, 10) || 0; });
}

// Retorna -1 se a < b, 0 se iguais, 1 se a > b
function compareVersions(a, b) {
  var pa = parseVersion(a), pb = parseVersion(b);
  var len = Math.max(pa.length, pb.length);
  for (var i = 0; i < len; i++) {
    var da = pa[i] || 0, db_ = pb[i] || 0;
    if (da < db_) return -1;
    if (da > db_) return 1;
  }
  return 0;
}

function satisfiesVersion(m) {
  if (m.min_app_version && compareVersions(APP_VERSION, m.min_app_version) < 0) return false;
  if (m.max_app_version && compareVersions(APP_VERSION, m.max_app_version) > 0) return false;
  return true;
}

function notExpired(m) {
  if (!m.expires_at) return true;
  return new Date(m.expires_at).getTime() > Date.now();
}

// ── CACHE LOCAL ───────────────────────────────────────────────────────────

async function getCachedMessages() {
  try {
    var rec = await db.get("settings", "consoleMessages");
    return (rec && rec.value) || [];
  } catch (e) {
    return [];
  }
}

async function setCachedMessages(messages) {
  await db.put("settings", { key: "consoleMessages", value: messages || [] });
}

async function getDismissedIds() {
  try {
    var rec = await db.get("settings", "dismissedMessageIds");
    return (rec && rec.value) || [];
  } catch (e) {
    return [];
  }
}

export async function dismissMessage(id) {
  var ids = await getDismissedIds();
  if (ids.indexOf(id) === -1) ids.push(id);
  await db.put("settings", { key: "dismissedMessageIds", value: ids });
}

async function getSeenIds() {
  try {
    var rec = await db.get("settings", "seenMessageIds");
    return (rec && rec.value) || [];
  } catch (e) {
    return [];
  }
}

export async function markMessagesSeen(ids) {
  if (!ids || !ids.length) return;
  var seen = await getSeenIds();
  ids.forEach(function(id) { if (seen.indexOf(id) === -1) seen.push(id); });
  await db.put("settings", { key: "seenMessageIds", value: seen });
}

// ── SINCRONIZAÇÃO ─────────────────────────────────────────────────────────

// Busca mensagens elegíveis no Console. Silenciosamente não faz nada
// sem rede ou sem licença ativa — quem chama não precisa de tratar erro.
export async function syncConsoleMessages() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  try {
    var lic = await db.get("settings", "license");
    if (!lic || !lic.code) return;

    var res = await fetch(CONSOLE_API + "/messages?code=" + encodeURIComponent(lic.code));
    if (!res.ok) return;

    var data = await res.json();
    if (data && data.success) {
      await setCachedMessages(data.messages || []);
    }
  } catch (e) {
    // offline ou falha de rede — mantém o que já está em cache
  }
}

// ── AVALIAÇÃO ─────────────────────────────────────────────────────────────

// Devolve { blocking, modal, notifications } com base no cache local,
// já filtrado por versão, expiração, dispensa e leitura (read_once).
export async function evaluateMessages() {
  var all = await getCachedMessages();
  var eligible = all.filter(function(m) { return satisfiesVersion(m) && notExpired(m); });

  var blocking = eligible
    .filter(function(m) { return m.display_mode === "blocking"; })
    .sort(function(a, b) { return (b.priority || 0) - (a.priority || 0); })[0] || null;

  var dismissed = await getDismissedIds();
  var modal = eligible
    .filter(function(m) { return m.display_mode === "modal" && dismissed.indexOf(m.id) === -1; })
    .sort(function(a, b) { return (b.priority || 0) - (a.priority || 0); })[0] || null;

  var seen = await getSeenIds();
  var notifications = eligible
    .filter(function(m) { return m.display_mode === "notification"; })
    .filter(function(m) { return !(m.read_once && seen.indexOf(m.id) !== -1); });

  return { blocking: blocking, modal: modal, notifications: notifications };
}

// Usado por notifications.js para injetar mensagens no centro de
// notificações existente, no mesmo formato dos outros alertas.
export async function getMessageAlerts() {
  var state = await evaluateMessages();
  return state.notifications.map(function(m) {
    return {
      id: "msg-" + m.id,
      type: "system",
      category: "console_message",
      severity: m.severity || "info",
      title: m.title || bodyPreviewTitle(m.body),
      description: m.title ? m.body : null,
      action: messageActionToNav(m),
      createdAt: m.created_at,
      actionable: false,
      _rawId: m.id,
    };
  });
}

function bodyPreviewTitle(body) {
  if (!body) return "Mensagem";
  return body.length > 60 ? body.slice(0, 60) + "..." : body;
}

function messageActionToNav(m) {
  if (m.action_type === "none" || !m.action_value) return null;
  return { type: m.action_type, value: m.action_value };
}
