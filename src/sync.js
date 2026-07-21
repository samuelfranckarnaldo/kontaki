import { db } from "./db.js";

var CONSOLE_API = "https://kontaki-console.vercel.app/api";

// ── IDENTIDADE ───────────────────────────────────────────────────────────

async function getDeviceId() {
  var d = await db.get("settings", "deviceId");
  if (d && d.value) return d.value;
  var id = "dev-" + Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36);
  await db.put("settings", { key: "deviceId", value: id });
  return id;
}

async function getStoreId() {
  var s = await db.get("settings", "storeId");
  return s ? s.value : null;
}

async function getLicenseCode() {
  var lic = await db.get("settings", "license");
  return lic ? lic.code : null;
}

function getPlatformInfo() {
  var ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  var platform = /android/i.test(ua) ? "Android" : /iphone|ipad/i.test(ua) ? "iOS" : "Web";
  var osMatch = ua.match(/Android\s([\d.]+)/);
  var osVersion = osMatch ? "Android " + osMatch[1] : null;
  return { platform: platform, osVersion: osVersion };
}

// ── REGISTO ──────────────────────────────────────────────────────────────

// Liga o storeId público (gerado localmente) à loja já existente no Console
// (criada manualmente pelo admin ao emitir a licença). Idempotente — pode
// ser chamado repetidamente sem efeitos colaterais. Nunca bloqueia nem
// lança erro para quem chama: sem rede ou sem licença, sai em silêncio.
export async function syncRegister() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  try {
    var licenseCode = await getLicenseCode();
    if (!licenseCode) return;

    var storeId = await getStoreId();
    if (!storeId) return;

    var deviceId = await getDeviceId();
    var pInfo = getPlatformInfo();

    var res = await fetch(CONSOLE_API + "/sync/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        licenseCode: licenseCode,
        storeId: storeId,
        deviceId: deviceId,
        platform: pInfo.platform,
        osVersion: pInfo.osVersion,
        appVersion: (typeof window !== "undefined" && window.KONTAKI_VERSION) || null,
      }),
    });

    if (!res.ok) return;
    var data = await res.json();
    if (data && data.conflict) {
      console.warn("[sync] storeId em conflito com o registado no Console — contacta o suporte.");
    }
  } catch (e) {
    // offline ou falha de rede — tenta novamente no próximo gatilho
  }
}
