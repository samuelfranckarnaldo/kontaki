import { db } from "./db.js";

var _license = null;

// v2 (pendente): limite de dispositivos por loja, ficou fora desta
// ronda por limitação da arquitetura de sincronização atual.
export var PLANS = {
  basic: {
    name: "Básico", price: 500,
    maxProducts: 300, maxClients: 200, maxUsers: 1,
    features: [
      "vendas","stock","fiados","clientes","despesas","pin_recovery",
      "historico","scanner","venda_rapida","dashboard",
      "fatura_pdf","fatura_whatsapp","pedidos_aguardados","filtro_categorias",
    ],
  },
  standard: {
    name: "Standard", price: 1000,
    maxProducts: 2000, maxClients: 2000, maxUsers: 1,
    features: [
      "vendas","stock","fiados","clientes","despesas","pin_recovery",
      "historico","scanner","venda_rapida","dashboard",
      "fatura_pdf","fatura_whatsapp","pedidos_aguardados","filtro_categorias",
      "contabilidade","exportar_relatorios","inventario_periodico",
      "relatorios_estoque","fornecedores",
    ],
  },
  pro: {
    name: "Pro", price: 2500,
    // -1 = ilimitado (serializável; Infinity vira null em JSON.stringify)
    // maxUsers do Pro fica em 2 (não -1) por limitação de arquitetura,
    // não de preço — mesma razão que já limitou dispositivos antes.
    maxProducts: -1, maxClients: -1, maxUsers: 2,
    features: [
      "vendas","stock","fiados","clientes","despesas","pin_recovery",
      "historico","scanner","venda_rapida","dashboard",
      "fatura_pdf","fatura_whatsapp","pedidos_aguardados","filtro_categorias",
      "contabilidade","exportar_relatorios","inventario_periodico",
      "relatorios_estoque","fornecedores",
      "relatorio_funcionario","equipe","logotipo","backup",
    ],
  },
};

var ALL_FEATURES = Array.from(new Set(
  Object.keys(PLANS).flatMap(function(k) { return PLANS[k].features; })
));

function resolveLimit(val) {
  return val === -1 ? Infinity : val;
}

var CONSOLE_API = "https://kontaki-console.vercel.app/api";

export async function loadLicense() {
  try {
    var lic = await db.get("settings", "license");
    if (!lic || !lic.plan) {
      _license = { plan: "basic", status: "none", daysLeft: 0, expiresAt: null, code: null };
    } else {
      var now      = Date.now();
      var exp      = lic.expiresAt ? new Date(lic.expiresAt).getTime() : null;
      var daysLeft = exp ? Math.ceil((exp - now) / 86400000) : 999;
      _license = {
        plan:          lic.plan,
        status:        lic.revoked ? "revoked" : (exp && daysLeft <= 0 ? "expired" : "active"),
        daysLeft:      daysLeft,
        expiresAt:     lic.expiresAt,
        code:          lic.code,
        activatedAt:   lic.activatedAt,
        lastValidated: lic.lastValidated,
        deviceId:      lic.deviceId,
      };
    }
  } catch(e) {
    _license = { plan: "basic", status: "none", daysLeft: 0, expiresAt: null };
  }
  return _license;
}

export function getLicense() {
  return _license || { plan: "basic", status: "none", daysLeft: 0 };
}

export function hasFeature(feature) {
  var lic = getLicense();
  if (lic.status === "expired" || lic.status === "none") return false;
  if (lic.status === "trial") return ALL_FEATURES.includes(feature);
  var plan = PLANS[lic.plan] || PLANS.basic;
  return plan.features.includes(feature);
}

export function getPlanLimit(key) {
  var lic = getLicense();
  if (lic.status === "expired" || lic.status === "none") return 0;
  // Trial = experiência Pro com prazo, não "ilimitado à parte": herda o
  // limite do Pro (hoje -1/ilimitado; se o Pro ganhar um teto finito no
  // futuro, o trial acompanha automaticamente, sem alteração aqui).
  if (lic.status === "trial") return resolveLimit(PLANS.pro[key]);
  var plan = PLANS[lic.plan] || PLANS.basic;
  var val = plan[key] !== undefined ? plan[key] : PLANS.basic[key];
  return resolveLimit(val);
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
    try {
      const syncMod = await import("./sync.js");
      await syncMod.syncRegister();
      await syncMod.syncSales();
      await syncMod.syncProducts();
    } catch (e) {}
  });

  // Revalidação periódica enquanto estiver online — sem isto, uma
  // licença revogada só era detetada na próxima transição
  // offline->online ou no próximo arranque da app.
  setInterval(function () {
    if (navigator.onLine) {
      validateLicenseOnline().catch(function () {});
      import("./sync.js").then(function(m) { m.syncRegister().then(function(){ return m.syncSales(); }).then(function(){ return m.syncProducts(); }); }).catch(function() {});
    }
  }, 15 * 60 * 1000);
}

// Ecrã de bloqueio total — só para licença REVOGADA (ação
// administrativa deliberada). Licença apenas expirada NÃO usa isto;
// continua a permitir vender/gerir stock, só bloqueia os extras via
// hasFeature(). Sem botão de fechar, de propósito.
export function showRevokedLockout() {
  if (document.getElementById("revoked-lockout")) return;
  var ov = document.createElement("div");
  ov.id = "revoked-lockout";
  ov.style.cssText = "position:fixed;inset:0;background:#fff;z-index:99998;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;text-align:center;font-family:inherit";
  ov.innerHTML =
    '<i data-lucide="shield-off" style="width:48px;height:48px;color:#dc2626;margin-bottom:20px"></i>' +
    '<div style="font-size:19px;font-weight:800;color:#1A1425;margin-bottom:10px">Conta suspensa</div>' +
    '<div style="font-size:14px;color:#6E6680;line-height:1.6;max-width:320px;margin-bottom:28px">A tua licença foi revogada pela Introxeer. Contacta-nos para reactivar o acesso ao Kontaki.</div>' +
    '<a href="https://wa.me/244934923166" style="display:inline-flex;align-items:center;gap:8px;background:#25D366;color:#fff;font-weight:700;font-size:13.5px;padding:12px 24px;border-radius:999px;text-decoration:none">' +
      '<i data-lucide="message-circle" style="width:16px;height:16px"></i> Falar no WhatsApp' +
    '</a>';
  document.body.appendChild(ov);
  if (window.lucide) window.lucide.createIcons({ el: ov });
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
      if (data.reason === "revoked") {
        await db.put("settings", { ...lic, revoked: true, status: "revoked" });
        _license = { ...(_license||{}), status: "revoked" };
        showRevokedLockout();
      } else {
        await db.put("settings", { ...lic, status: "expired" });
        _license = { ...(_license||{}), status: "expired" };
      }
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
