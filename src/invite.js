import { db } from "./db.js";
import { signInvite, verifyInviteSignature } from "./crypto.js";

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

// Gera o payload do convite, assinado
export async function generateInvite(inviteCode, role) {
  var store = await db.get("settings", "store");
  if (!store) throw new Error("Loja não configurada.");

  var storeId = await ensureStoreId();

  var payload = {
    storeId: storeId,
    storeName: store.name || "Loja",
    inviteCode: inviteCode.trim().toUpperCase(),
    role: role === "admin" ? "admin" : "caixa",
    createdAt: new Date().toISOString(),
  };

  var signature = await signInvite(payload);
  payload.signature = signature;

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
