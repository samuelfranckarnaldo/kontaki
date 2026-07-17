import { db } from "./db.js";

var _license = null;

export var PLANS = {
  basic: {
    name: "Basic", price: 500,
    maxProducts: 30, maxUsers: 2, maxDevices: 1,
    features: ["vendas","stock","fiados","clientes","despesas","pin_recovery","historico","scanner","venda_rapida","dashboard"],
  },
  standard: {
    name: "Standard", price: 1000,
    maxProducts: 100, maxUsers: 5, maxDevices: 2,
    features: ["vendas","stock","fiados","clientes","despesas","pin_recovery","historico","scanner","venda_rapida","dashboard","contabilidade","fornecedores","backup","relatorio_funcionario"],
  },
  pro: {
    name: "Pro", price: 5000,
    maxProducts: 500, maxUsers: 10, maxDevices: 5,
    features: ["vendas","stock","fiados","clientes","despesas","pin_recovery","historico","scanner","venda_rapida","dashboard","contabilidade","fornecedores","backup","relatorio_funcionario","pdf_contabilidade","recibo_qr","logotipo","equipe"],
  },
  enterprise: {
    name: "Enterprise", price: 10000,
    maxProducts: 999999, maxUsers: 999999, maxDevices: 10,
    features: ["all"],
  },
};

var CONSOLE_API = "https://kontaki-console.vercel.app/api";

export async function loadLicense() {
  try {
    var lic = await db.get("settings", "license");
    if (!lic || !lic.plan) {
      _license = { plan: "basic", status: "trial", daysLeft: 7, expiresAt: null, code: null };
    } else {
      var now      = Date.now();
      var exp      = lic.expiresAt ? new Date(lic.expiresAt).getTime() : null;
      var daysLeft = exp ? Math.ceil((exp - now) / 86400000) : 999;
      _license = {
        plan:          lic.plan,
        status:        exp && daysLeft <= 0 ? "expired" : "active",
        daysLeft:      daysLeft,
        expiresAt:     lic.expiresAt,
        code:          lic.code,
        activatedAt:   lic.activatedAt,
        lastValidated: lic.lastValidated,
        deviceId:      lic.deviceId,
      };
    }
  } catch(e) {
    _license = { plan: "basic", status: "trial", daysLeft: 7, expiresAt: null };
  }
  return _license;
}

export function getLicense() {
  return _license || { plan: "basic", status: "trial", daysLeft: 7 };
}

export function hasFeature(feature) {
  var lic  = getLicense();
  if (lic.status === "expired") return false;
  var plan = PLANS[lic.plan] || PLANS.basic;
  if (plan.features.includes("all")) return true;
  return plan.features.includes(feature);
}

export function getPlanLimit(key) {
  var lic  = getLicense();
  var plan = PLANS[lic.plan] || PLANS.basic;
  return plan[key] !== undefined ? plan[key] : PLANS.basic[key];
}

async function getDeviceId() {
  var d = await db.get("settings", "deviceId");
  if (d && d.value) return d.value;
  var id = "dev-" + Math.random().toString(36).slice(2,10) + "-" + Date.now().toString(36);
  await db.put("settings", { key: "deviceId", value: id });
  return id;
}

export async function activateLicense(code) {
  code = code.toUpperCase().trim().replace(/\s/g, "");

  var parts = code.split("-");
  if (parts.length < 4 || parts[0] !== "KTKI") {
    throw new Error("Formato inválido. Exemplo: KTKI-PROO-2026-XXXXXXXX");
  }

  var deviceId = await getDeviceId();

  var res, data;
  try {
    res = await fetch(CONSOLE_API + "/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, deviceId }),
    });
    data = await res.json();
  } catch(e) {
    throw new Error("Sem ligação à internet. Liga-te e tenta novamente.");
  }

  if (!res.ok || !data.success) {
    throw new Error(data.error || "Código inválido ou já utilizado.");
  }

  var licData = {
    key:           "license",
    plan:          data.plan,
    code:          code,
    deviceId:      deviceId,
    activatedAt:   new Date().toISOString(),
    expiresAt:     data.expiresAt,
    lastValidated: new Date().toISOString(),
    serverTime:    data.serverTime || new Date().toISOString(),
  };
  await db.put("settings", licData);

  _license = {
    plan:      data.plan,
    status:    "active",
    daysLeft:  Math.ceil((new Date(data.expiresAt) - Date.now()) / 86400000),
    expiresAt: data.expiresAt,
    code:      code,
    deviceId:  deviceId,
  };

  return {
    plan:      data.plan,
    planName:  PLANS[data.plan]?.name || data.plan,
    expiresAt: data.expiresAt
  };
}

// Dispara sincronização pendente (recovery codes) e revalidação de
// licença assim que a rede volta, sem depender de nova geração de
// códigos ou de o utilizador reabrir a app manualmente.
if (typeof window !== "undefined") {
  window.addEventListener("online", async function () {
    try {
      await validateLicenseOnline();
    } catch (e) {}
    try {
      const recMod = await import("./recovery-codes.js");
      await recMod.triggerPendingSync();
    } catch (e) {}
    try {
      const msgMod = await import("./messages.js");
      await msgMod.syncConsoleMessages();
      const uiMod = await import("./message-ui.js");
      await uiMod.checkAndShowMessages();
    } catch (e) {}
  });
}

export async function validateLicenseOnline() {
  var lic = await db.get("settings", "license");
  if (!lic || !lic.code) return;

  try {
    var res = await fetch(CONSOLE_API + "/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: lic.code, deviceId: lic.deviceId }),
    });
    var data = await res.json();

    if (!res.ok || !data.valid) {
      await db.put("settings", { ...lic, status: "expired" });
      _license = { ...(_license||{}), status: "expired" };
      return false;
    }

    var updated = {
      ...lic,
      expiresAt:     data.expiresAt,
      lastValidated: new Date().toISOString(),
      serverTime:    data.serverTime || new Date().toISOString(),
    };
    await db.put("settings", updated);

    var deviceNow = Date.now();
    var serverNow = data.serverTime ? new Date(data.serverTime).getTime() : deviceNow;
    if (deviceNow - serverNow < -300000) showDateWarning();

    return true;
  } catch(e) {
    if (lic.lastValidated) {
      var daysSince = (Date.now() - new Date(lic.lastValidated).getTime()) / 86400000;
      if (daysSince > 7) showOfflineWarning();
    }
    return null;
  }
}

function showDateWarning() {
  if (document.getElementById("date-warning-banner")) return;
  var b = document.createElement("div");
  b.id = "date-warning-banner";
  b.style.cssText = "position:fixed;top:0;left:0;right:0;background:#dc2626;color:#fff;padding:14px 16px;z-index:99999;text-align:center;font-size:13px;font-weight:600;font-family:inherit";
  b.textContent = "Data do dispositivo incorrecta. Acerta a data e liga a internet para continuar.";
  document.body.appendChild(b);
}

function showOfflineWarning() {
  showUpgradeBanner("Sem validação há 7 dias. Liga a internet para verificar a tua licença.");
}

export function showUpgradeBanner(msg) {
  var old = document.getElementById("upgrade-banner");
  if (old) old.remove();
  var b = document.createElement("div");
  b.id = "upgrade-banner";
  b.style.cssText = "position:fixed;bottom:72px;left:16px;right:16px;background:linear-gradient(135deg,#5b21b6,#7c3aed);color:#fff;border-radius:14px;padding:14px 16px;z-index:9500;display:flex;align-items:center;gap:12px;box-shadow:0 8px 24px rgba(91,33,182,.35);font-family:inherit";
  b.innerHTML =
    "<i data-lucide='lock' style='width:20px;height:20px;flex-shrink:0'></i>" +
    "<div style='flex:1;font-size:13px;line-height:1.4'>" + (msg || "Esta função requer upgrade do plano.") + "</div>" +
    "<button onclick=\"window._perfilNav('assinatura');document.getElementById('upgrade-banner')&&document.getElementById('upgrade-banner').remove()\" style='background:rgba(255,255,255,.25);border:none;color:#fff;padding:6px 10px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap'>Ver planos</button>";
  document.body.appendChild(b);
  if (window.lucide) window.lucide.createIcons({ el: b });
  setTimeout(function() { if (b.parentNode) b.remove(); }, 10000);
}
