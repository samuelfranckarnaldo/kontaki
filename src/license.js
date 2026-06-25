import { db } from "./db.js";

var _license = null;

export var PLANS = {
  free:       { name:"Gratuito",          maxProducts:20,    maxUsers:1,  price:0,     features:["vendas","stock"] },
  basic:      { name:"Básico",            maxProducts:100,   maxUsers:3,  price:500,   features:["vendas","stock","fiados","clientes","historico"] },
  standard:   { name:"Standard",          maxProducts:500,   maxUsers:5,  price:1000,  features:["vendas","stock","fiados","clientes","historico","fornecedores","ktk","relatorios"] },
  pro:        { name:"Pro",               maxProducts:99999, maxUsers:99, price:5000,  features:["all"] },
  enterprise: { name:"Enterprise",        maxProducts:99999, maxUsers:99, price:10000, features:["all"], priority:true },
};

export async function loadLicense() {
  try {
    var lic = await db.get("settings","license");
    if (!lic || !lic.plan) {
      _license = { plan:"free", status:"active", daysLeft:999, expiresAt:null };
    } else {
      var now = Date.now();
      var exp = lic.expiresAt ? new Date(lic.expiresAt).getTime() : null;
      var daysLeft = exp ? Math.ceil((exp - now) / 86400000) : 999;
      _license = {
        plan:      lic.plan,
        status:    exp && daysLeft < 0 ? "expired" : "active",
        daysLeft:  daysLeft,
        expiresAt: lic.expiresAt,
        code:      lic.code,
      };
    }
  } catch(e) {
    _license = { plan:"free", status:"active", daysLeft:999, expiresAt:null };
  }
  return _license;
}

export function getLicense() {
  return _license || { plan:"free", status:"active", daysLeft:999 };
}

export function hasFeature(feature) {
  var lic  = getLicense();
  if (lic.status === "expired") return false;
  var plan = PLANS[lic.plan] || PLANS.free;
  if (plan.features.includes("all")) return true;
  return plan.features.includes(feature);
}

export function getPlanLimit(key) {
  var lic  = getLicense();
  var plan = PLANS[lic.plan] || PLANS.free;
  return plan[key] !== undefined ? plan[key] : PLANS.free[key];
}

export async function activateLicense(code) {
  code = code.toUpperCase().replace(/\s/g,"");
  // Formato: KTKI-XXXX-XXXX-XXXX
  var parts = code.split("-");
  if (parts.length !== 4 || parts[0] !== "KTKI") {
    throw new Error("Código inválido. Formato: KTKI-XXXX-XXXX-XXXX");
  }
  var planMap = { FREE:"free", BASI:"basic", STAN:"standard", PROO:"pro", ENTR:"enterprise" };
  var planCode = parts[1];
  var plan = planMap[planCode];
  if (!plan) throw new Error("Código de plano inválido.");

  var expires = new Date();
  expires.setDate(expires.getDate() + 30);

  await db.put("settings", {
    key:"license", plan, code,
    activatedAt: new Date().toISOString(),
    expiresAt:   expires.toISOString(),
  });

  _license = { plan, status:"active", daysLeft:30, expiresAt:expires.toISOString(), code };
  return { plan, planName: PLANS[plan].name, expiresAt: expires.toISOString() };
}

export function showUpgradeBanner(msg) {
  var old = document.getElementById("upgrade-banner");
  if (old) old.remove();
  var b = document.createElement("div");
  b.id = "upgrade-banner";
  b.style.cssText = "position:fixed;bottom:72px;left:16px;right:16px;background:linear-gradient(135deg,#5b21b6,#7c3aed);color:#fff;border-radius:14px;padding:14px 16px;z-index:9500;display:flex;align-items:center;gap:12px;box-shadow:0 8px 24px rgba(91,33,182,.35);font-family:inherit";
  b.innerHTML =
    "<i data-lucide='lock' style='width:20px;height:20px;flex-shrink:0'></i>" +
    "<div style='flex:1;font-size:13px;line-height:1.4'>" + (msg||"Esta função requer upgrade do plano.") + "</div>" +
    "<button onclick=\"document.querySelector('.nav-item[data-page=perfil]').click();document.getElementById('upgrade-banner')&&document.getElementById('upgrade-banner').remove()\" style='background:rgba(255,255,255,.25);border:none;color:#fff;padding:6px 10px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap'>Ver planos</button>";
  document.body.appendChild(b);
  if (window.lucide) window.lucide.createIcons({el:b});
  setTimeout(function(){ if(b.parentNode) b.remove(); }, 10000);
}
