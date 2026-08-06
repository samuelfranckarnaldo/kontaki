import { db } from "./db.js";
import { generateNonce, verifyLicenseSignature } from "./crypto.js";

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
      "relatorios_estoque","fornecedores","pdf_contabilidade",
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
  // Não é um plano vendável — é o estado por omissão antes de qualquer
  // código ser ativado. hasFeature()/getPlanLimit() já tratam
  // status:"none" antes de chegarem a ler isto, mas o ecrã de
  // Assinatura lê PLANS[lic.plan] diretamente, por isso isto precisa
  // de existir com valores reais (não o fallback de Básico a 500 Kz).
  none: {
    name: "Sem plano", price: 0,
    maxProducts: 0, maxClients: 0, maxUsers: 0,
    features: [],
  },
};

// Pro ganha as duas features novas separadamente do resto — mantém o
// array principal do Pro legível, sem crescer numa linha só.
PLANS.pro.features.push("business_intelligence", "workspace", "pdf_contabilidade");

// ── Pontos de entrada únicos: licença (a loja paga por isto?) +
// autorização existente de cada módulo (este utilizador pode usá-lo?).
// As duas perguntas são independentes de propósito — juntá-las aqui
// evita espalhar a mesma combinação de checks pelos ficheiros que as
// usam, e centraliza qualquer mudança de regra num único sítio. ────

export async function canOpenBI(user) {
  if (!hasFeature("business_intelligence")) return { allowed: false, reason: "plan" };
  var permMod = await import("./permissions.js");
  if (!permMod.hasPermission(user, "ver_contabilidade")) return { allowed: false, reason: "permission" };
  return { allowed: true, reason: null };
}

// O token do Workspace é privado a multilojas.js (_getWorkspaceToken),
// por isso só a parte "a loja paga por isto?" vive aqui — o ecrã de
// login do Workspace continua a decidir "este utilizador pode entrar?"
// como já fazia, sem duplicar essa lógica aqui.
export function canOpenWorkspace() {
  return hasFeature("workspace");
}

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
      _license = { plan: "none", status: "none", daysLeft: 0, expiresAt: null, code: null };
    } else {
      var now      = Date.now();
      var exp      = lic.expiresAt ? new Date(lic.expiresAt).getTime() : null;
      var daysLeft = exp ? Math.ceil((exp - now) / 86400000) : 999;
      // 'replaced' é a única categoria de revogação que permite
      // reactivação directa — qualquer outra (manual/fraud/null) cai no
      // lockout total, por omissão segura (ver validateLicenseOnline).
      var _status = lic.revoked
        ? (lic.revokeCategory === "replaced" ? "replaced" : "revoked")
        : (exp && daysLeft <= 0) ? "expired"
        : (lic.plan === "trial") ? "trial"
        : "active";
      _license = {
        plan:          lic.plan,
        status:        _status,
        daysLeft:      daysLeft,
        expiresAt:     lic.expiresAt,
        code:          lic.code,
        activatedAt:   lic.activatedAt,
        lastValidated: lic.lastValidated,
        deviceId:      lic.deviceId,
      };
    }
  } catch(e) {
    _license = { plan: "none", status: "none", daysLeft: 0, expiresAt: null };
  }
  return _license;
}

export function getLicense() {
  return _license || { plan: "none", status: "none", daysLeft: 0 };
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
  var nonce = generateNonce();

  var res, data;
  try {
    res = await fetch(CONSOLE_API + "/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, deviceId, nonce }),
    });
    data = await res.json();
  } catch(e) {
    throw new Error("Sem ligação à internet. Liga-te e tenta novamente.");
  }

  if (!res.ok || !data.success) {
    throw new Error(data.error || "Código inválido ou já utilizado.");
  }

  // Verifica a assinatura ANTES de confiar em qualquer campo da
  // resposta — sem isto, TLS comprometido (ex: proxy corporativo com
  // certificado raiz injetado) poderia forjar uma "activação bem
  // sucedida" falsa. O nonce tem de bater certo com o que foi enviado,
  // senão a resposta pode ser um replay de um pedido anterior.
  if (data.nonce !== nonce) {
    throw new Error("Resposta do servidor inválida (nonce). Tenta novamente.");
  }
  var sigOk = await verifyLicenseSignature(
    [nonce, "true", data.plan, data.activatedAt, data.expiresAt, data.serverTime],
    data.signature
  );
  if (!sigOk) {
    throw new Error("Não foi possível verificar a autenticidade da resposta do servidor.");
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
    status:    data.plan === "trial" ? "trial" : "active",
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
      await syncMod.runFullSyncCycle();
    } catch (e) {}
    try {
      const backupMod = await import("./backup.js");
      // Ignora o backoff: tempo offline nao e uma falha de comunicacao,
      // e' so ausencia de tentativa — assim que a rede volta, tenta logo
      // em vez de esperar o backoff de uma falha real anterior.
      await backupMod.backupService.autoBackupIfNeeded("network_online", { skipBackoff: true });
    } catch (e) {}
  });

  // Revalidação periódica — verifica navigator.onLine a cada minuto,
  // em vez de depender só do evento "online" (que no Android nem sempre
  // dispara de forma confiável). Isto garante que os dados chegam ao
  // Console/Workspace assim que a rede estiver disponível, sem esperar
  // até 15 minutos como antes.
  setInterval(function () {
    if (navigator.onLine) {
      validateLicenseOnline().catch(function () {});
      import("./sync.js").then(function(m) { return m.runFullSyncCycle(); }).catch(function() {});
    }
  }, 60 * 1000);
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

// Ecrã de substituição — licença antiga foi trocada por uma nova
// (renovação ou mudança de plano). Ao contrário do lockout total, este
// permite ao lojista introduzir o código novo directamente aqui, sem
// precisar de suporte humano. Também sem botão de fechar: sair deste
// ecrã sem activar deixaria a app presa no mesmo estado na próxima
// navegação (router.go() bloqueia enquanto status === "replaced").
export function showLicenseReplacedScreen() {
  if (document.getElementById("replaced-lockout")) return;
  var ov = document.createElement("div");
  ov.id = "replaced-lockout";
  ov.style.cssText = "position:fixed;inset:0;background:#fff;z-index:99998;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;text-align:center;font-family:inherit";
  ov.innerHTML =
    '<i data-lucide="refresh-cw" style="width:48px;height:48px;color:#7c3aed;margin-bottom:20px"></i>' +
    '<div style="font-size:19px;font-weight:800;color:#1A1425;margin-bottom:10px">Licença substituída</div>' +
    '<div style="font-size:14px;color:#6E6680;line-height:1.6;max-width:320px;margin-bottom:24px">A tua licença foi substituída por uma nova. Introduz o novo código para continuar.</div>' +
    '<input id="replaced-code-input" placeholder="KTKI-XXXX-XXXX-XXXXXXXXXXXX" maxlength="35" style="width:100%;max-width:320px;padding:12px 14px;border:1.5px solid #E4E0EC;border-radius:12px;font-size:14px;text-align:center;margin-bottom:12px;font-family:inherit;text-transform:uppercase"/>' +
    '<div id="replaced-error" style="font-size:12.5px;color:#dc2626;min-height:16px;margin-bottom:10px"></div>' +
    '<button id="replaced-activate-btn" style="width:100%;max-width:320px;background:#7c3aed;color:#fff;font-weight:700;font-size:14px;padding:13px 24px;border:none;border-radius:999px;cursor:pointer;font-family:inherit;margin-bottom:14px">Ativar nova licença</button>' +
    '<a href="https://wa.me/244934923166" style="display:inline-flex;align-items:center;gap:8px;background:#25D366;color:#fff;font-weight:700;font-size:13.5px;padding:12px 24px;border-radius:999px;text-decoration:none">' +
      '<i data-lucide="message-circle" style="width:16px;height:16px"></i> Não tenho o código — Falar no WhatsApp' +
    '</a>';
  document.body.appendChild(ov);
  if (window.lucide) window.lucide.createIcons({ el: ov });

  var input   = document.getElementById("replaced-code-input");
  var errEl   = document.getElementById("replaced-error");
  var btn     = document.getElementById("replaced-activate-btn");

  btn.onclick = async function () {
    errEl.textContent = "";
    var code = (input.value || "").trim();
    if (!code) { errEl.textContent = "Introduz o código de licença."; return; }
    btn.disabled = true;
    var _origText = btn.textContent;
    btn.textContent = "A activar…";
    try {
      await activateLicense(code);
      ov.remove();
      // Recarrega para garantir que todo o estado da app (router,
      // gates de features, etc.) parte do zero com a licença nova.
      window.location.reload();
    } catch (e) {
      errEl.textContent = e.message || "Não foi possível activar. Verifica o código.";
      btn.disabled = false;
      btn.textContent = _origText;
    }
  };
}

export async function validateLicenseOnline() {
  var lic = await db.get("settings", "license");
  if (!lic || !lic.code) return;

  var nonce = generateNonce();

  try {
    var res = await fetch(CONSOLE_API + "/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: lic.code, deviceId: lic.deviceId, nonce }),
    });
    var data = await res.json();

    // Verifica autenticidade da resposta ANTES de agir sobre ela — sem
    // isto, TLS comprometido (ex: proxy corporativo com certificado
    // raiz injetado) poderia forjar qualquer decisão de licenciamento.
    // "Licença não encontrada" é o único caso deliberadamente não
    // assinado pelo servidor (sem valor de ataque — ver licenses.js);
    // qualquer outra resposta sem assinatura é tratada como suspeita.
    // Falha de verificação é tratada como falha de rede: não altera o
    // estado local, deixa a última licença válida em cache continuar a
    // funcionar (fail-open), e regista para investigação.
    var _isUnsignedNotFound = !data.valid && data.error === "Licença não encontrada" && !data.signature;
    if (!_isUnsignedNotFound) {
      if (data.nonce !== nonce) {
        console.error("[license] resposta com nonce inesperado — possível replay.");
        return null;
      }
      var _sigFields = !data.valid
        ? [nonce, "false", "", "", data.reason || "", data.revokeCategory || "", data.serverTime || ""]
        : [nonce, "true", data.plan || "", data.expiresAt || "", "", "", data.serverTime || ""];
      var _sigOk = await verifyLicenseSignature(_sigFields, data.signature);
      if (!_sigOk) {
        console.error("[license] assinatura inválida na resposta de /verify — possível interceção.");
        return null;
      }
    }

    if (!res.ok || !data.valid) {
      if (data.reason === "revoked") {
        // 'replaced' é a única categoria que abre o ecrã de reactivação;
        // qualquer outra (manual/fraud/null) é lockout total — omissão
        // segura para categorias futuras que ainda não existem hoje.
        var _isReplaced = data.revokeCategory === "replaced";
        var _newStatus  = _isReplaced ? "replaced" : "revoked";
        await db.put("settings", { ...lic, revoked: true, revokeCategory: data.revokeCategory || null, status: _newStatus });
        _license = { ...(_license||{}), status: _newStatus };
        if (_isReplaced) {
          showLicenseReplacedScreen();
        } else {
          showRevokedLockout();
        }
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
