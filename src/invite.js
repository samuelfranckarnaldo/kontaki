import { db } from "./db.js";
import { verifyInviteSignature } from "./crypto.js";
import { getLicense } from "./license.js";

const CONSOLE_API = "https://kontaki-console.vercel.app/api";

// Gera um storeId único e persistente para esta loja (uma vez, no setup)
export async function ensureStoreId() {
  var store = await db.get("settings", "store");
  if (store && store.storeId) return store.storeId;

  var id = "STORE-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2,8).toUpperCase();
  if (store) {
    store.storeId = id;
    await db.put("settings", store);
  }
  return id;
}

// Gera o payload do convite e pede a assinatura ao Console.
// ADR-0004: a assinatura exige internet (ação do dono/gerente); a
// verificação, no novo dispositivo, continua sempre offline.
export async function generateInvite(inviteCode, role) {
  var store = await db.get("settings", "store");
  if (!store) throw new Error("Loja não configurada.");

  var storeId = await ensureStoreId();
  var license = getLicense();

  if (!license || !license.code) {
    throw new Error("É necessária uma licença ativa para convidar um novo dispositivo.");
  }

  var payload = {
    storeId: storeId,
    storeName: store.name || "Loja",
    inviteCode: inviteCode.trim().toUpperCase(),
    role: role === "admin" ? "admin" : "caixa",
    createdAt: new Date().toISOString(),
  };

  var res, data;
  try {
    res = await fetch(CONSOLE_API + "/invites/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: payload, code: license.code }),
    });
    data = await res.json();
  } catch (e) {
    throw new Error("Sem ligação à internet. Liga-te para gerar um convite.");
  }

  if (!res.ok || !data.success) {
    throw new Error(data.error || "Não foi possível assinar o convite.");
  }

  payload.signature = data.signature;
  return payload;
}

// Valida um convite recebido (QR lido ou ficheiro importado)
export async function verifyInvite(payload) {
  if (!payload || !payload.storeId || !payload.signature) {
    throw new Error("Convite inválido ou incompleto.");
  }

  var check = {
    storeId: payload.storeId,
    storeName: payload.storeName,
    inviteCode: payload.inviteCode,
    role: payload.role,
    createdAt: payload.createdAt,
  };

  var valid = await verifyInviteSignature(check, payload.signature);
  if (!valid) throw new Error("Convite adulterado ou inválido. Pede um novo ao teu patrão.");

  return payload;
}

// Guarda a ligação à loja no dispositivo do caixa (antes de criar o utilizador)
export async function saveStoreLink(payload) {
  await db.put("settings", {
    key: "store",
    name: payload.storeName,
    storeId: payload.storeId,
    linkedAt: new Date().toISOString(),
    iva: 0,
    currency: "Kz",
  });
}
