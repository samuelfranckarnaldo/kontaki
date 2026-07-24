import { db } from "./db.js";
import { logger } from "./logger.js";

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
    if (!licenseCode) { logger.warn("[sync] syncRegister abortado: sem licenseCode"); return; }

    var storeId = await getStoreId();
    if (!storeId) { logger.warn("[sync] syncRegister abortado: sem storeId"); return; }

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

    var resBody = await res.text();
    if (!res.ok) {
      logger.error("[sync] syncRegister falhou: status=" + res.status + " body=" + resBody.slice(0, 300));
      return;
    }

    var data = JSON.parse(resBody);
    logger.info("[sync] syncRegister OK: storeUuid=" + (data && data.storeUuid) + " conflict=" + (data && data.conflict));
    if (data && data.conflict) {
      logger.warn("[sync] storeId em conflito com o registado no Console");
    }
  } catch (e) {
    logger.error("[sync] syncRegister erro de rede/execução", e);
  }
}

// ── FILA DE SINCRONIZAÇÃO ───────────────────────────────────────────────

// Adiciona uma entrada à fila local. Nunca falha de forma visível — se o
// IndexedDB der erro aqui, a operação de negócio (ex.: criar venda) já
// terminou e não deve ser bloqueada por causa da sincronização.
export async function queueSync(entityType, localId, action, payload) {
  try {
    await db.add("syncQueue", {
      entityType: entityType,
      localId: localId,
      action: action,
      payload: payload,
      createdAt: new Date().toISOString(),
      syncedAt: null,
    });
  } catch (e) {
    console.warn("[sync] falha ao enfileirar", entityType, localId, e);
  }
}

// ── SINCRONIZAÇÃO DE VENDAS ─────────────────────────────────────────────

var BATCH_SIZE = 50;

export async function syncSales() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  try {
    var storeId = await getStoreId();
    var licenseCode = await getLicenseCode();
    if (!storeId || !licenseCode) return;

    var all = await db.getAll("syncQueue");
    var pending = all.filter(function(item) {
      return item.entityType === "sales" && !item.syncedAt;
    });
    if (pending.length === 0) return;

    var batch = pending.slice(0, BATCH_SIZE);
    var deviceId = await getDeviceId();

    var res = await fetch(CONSOLE_API + "/sync/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId: storeId,
        licenseCode: licenseCode,
        deviceId: deviceId,
        changes: batch.map(function(item) {
          return {
            localId: item.localId,
            action: item.action,
            payload: item.payload,
            createdAt: item.createdAt,
          };
        }),
      }),
    });

    if (!res.ok) return;
    var data = await res.json();
    if (!data || !data.success) return;

    var acceptedIds = data.acceptedLocalIds || [];
    var now = new Date().toISOString();
    for (var i = 0; i < batch.length; i++) {
      if (acceptedIds.indexOf(batch[i].localId) !== -1) {
        await db.put("syncQueue", Object.assign({}, batch[i], { syncedAt: now }));
      }
    }

    // Se ainda houver mais pendentes que o tamanho do lote, continua.
    if (pending.length > BATCH_SIZE) {
      await syncSales();
    }
  } catch (e) {
    // offline ou falha de rede — a fila fica intacta para o próximo gatilho
  }
}

// ── SINCRONIZAÇÃO DE PRODUTOS (snapshot completo) ───────────────────────
// Ao contrário de vendas (fila incremental), produtos são poucos e mudam
// em vários sítios do código sem updatedAt consistente. Por isso, em vez
// de perseguir cada ponto de escrita, envia-se sempre o estado completo
// dos produtos ativos. O Console faz upsert por (store_id, local_id).
export async function syncProducts() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  try {
    var storeId = await getStoreId();
    var licenseCode = await getLicenseCode();
    if (!storeId || !licenseCode) {
      logger.warn("[sync] syncProducts abortado: storeId=" + storeId + " licenseCode=" + licenseCode);
      return;
    }

    var products = await db.getAll("products");
    var active = products.filter(function(p) { return p.active; });
    logger.info("[sync] syncProducts: " + active.length + " produtos ativos de " + products.length + " total");

    var deviceId = await getDeviceId();

    var res = await fetch(CONSOLE_API + "/sync/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId: storeId,
        licenseCode: licenseCode,
        deviceId: deviceId,
        products: active.map(function(p) {
          return {
            localId: p.id,
            name: p.name,
            category: p.category || null,
            price: p.price || 0,
            costPrice: p.costPrice || 0,
            stock: p.stock || 0,
            warehouseStock: p.warehouseStock || 0,
            minStock: p.minStock || 5,
            unit: p.unit || null,
          };
        }),
      }),
    });

    var resBody = await res.text();
    if (!res.ok) {
      logger.error("[sync] syncProducts falhou: status=" + res.status + " body=" + resBody.slice(0, 300));
      return;
    }
    logger.info("[sync] syncProducts OK: status=" + res.status);
  } catch (e) {
    logger.error("[sync] syncProducts erro de rede/execução", e);
  }
}

// ── SINCRONIZAÇÃO DE INCIDENTES (snapshot dos últimos 300) ──────────────
// Como produtos, incidentes são escritos/atualizados em vários pontos do
// código (abertura/fecho de turno, resolução, arquivamento) sem
// updatedAt consistente em todos. Snapshot é mais robusto do que
// perseguir cada ponto de escrita.
export async function syncIncidents() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  try {
    var storeId = await getStoreId();
    var licenseCode = await getLicenseCode();
    if (!storeId || !licenseCode) {
      logger.warn("[sync] syncIncidents abortado: storeId ou licenseCode em falta");
      return;
    }

    var all = await db.getAll("incidents");
    all.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    var recent = all.slice(0, 300);
    logger.info("[sync] syncIncidents: " + recent.length + " de " + all.length + " total");

    var deviceId = await getDeviceId();

    var res = await fetch(CONSOLE_API + "/sync/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId: storeId,
        licenseCode: licenseCode,
        deviceId: deviceId,
        incidents: recent.map(function(inc) {
          return {
            localId: inc.id,
            type: inc.type || null,
            productId: inc.productId || null,
            productName: inc.productName || null,
            expected: inc.expected,
            found: inc.found,
            diff: inc.diff,
            status: inc.status || "open",
            note: inc.note || null,
            sessionId: inc.sessionId || null,
            createdAt: inc.createdAt,
            resolvedAt: inc.resolvedAt || null,
            archived: !!inc.archived,
            archivedAt: inc.archivedAt || null,
          };
        }),
      }),
    });

    var resBody = await res.text();
    if (!res.ok) {
      logger.error("[sync] syncIncidents falhou: status=" + res.status + " body=" + resBody.slice(0, 300));
      return;
    }
    logger.info("[sync] syncIncidents OK: status=" + res.status);
  } catch (e) {
    logger.error("[sync] syncIncidents erro de rede/execução", e);
  }
}
