import { db } from "./db.js";
import { generateRecoveryCodesBatch, hashRecoveryCode } from "./crypto.js";

const CONSOLE_API = "https://kontaki-console.vercel.app/api";
const LOW_CODES_WARNING = 3; // avisa quando restarem <= 3

async function getAll() {
  try {
    return await db.getAll("recoveryCodes");
  } catch (_) {
    return [];
  }
}

// Gera um NOVO conjunto de 10 códigos para um utilizador — substitui
// (histórico, nunca apaga) qualquer conjunto anterior ativo. Devolve
// os códigos em claro UMA VEZ; localmente só se guardam os hashes.
// Marca o backup como pendente de sincronização com o Console.
export async function generateCodesForUser(userId) {
  if (!userId) throw new Error("userId obrigatório");

  const codes = generateRecoveryCodesBatch(10);
  const now = new Date().toISOString();

  const existing = await getAll();
  for (const item of existing) {
    if (item.userId === userId && !item.usedAt) {
      item.usedAt = now;
      await db.put("recoveryCodes", item);
    }
  }

  for (const code of codes) {
    const hash = await hashRecoveryCode(code);
    await db.add("recoveryCodes", {
      userId: userId, hash: hash,
      createdAt: now, usedAt: null,
    });
  }

  await _markPendingAndTrySync(userId, codes);
  return codes; // mostrar uma única vez; chamador nunca persiste isto
}

export async function countAvailableCodes(userId) {
  const all = await getAll();
  return all.filter(function (c) { return c.userId === userId && !c.usedAt; }).length;
}

export function isLowOnCodes(count) {
  return count <= LOW_CODES_WARNING;
}

// Redime um código — consumível, SEM gerar substituto. O conjunto
// simplesmente diminui até 0, momento em que uma regeneração manual
// é necessária (ver components/seguranca.js).
export async function redeemRecoveryCode(inputCode) {
  const hash = await hashRecoveryCode(inputCode);
  const all = await getAll();
  const match = all.find(function (c) { return c.hash === hash && !c.usedAt; });

  if (!match) return { valid: false };

  const now = new Date().toISOString();
  await db.put("recoveryCodes", Object.assign({}, match, { usedAt: now }));

  const remaining = await countAvailableCodes(match.userId);
  return { valid: true, userId: match.userId, remaining: remaining };
}

// ── SINCRONIZAÇÃO COM O CONSOLE ─────────────────────────────────────────
// Só acontece na geração/regeneração de um conjunto (único momento em
// que os códigos existem em claro). Fila simples: marca pending, tenta
// logo; se falhar (sem internet), fica para a próxima tentativa.

async function _markPendingAndTrySync(userId, codes) {
  const state = (await db.get("recoveryBackupState", "state")) || { key: "state", version: 0 };
  const newVersion = (state.version || 0) + 1;

  await db.put("recoveryBackupState", {
    key: "state",
    version: newVersion,
    pending: true,
    lastSync: state.lastSync || null,
    _pendingPayload: { userId: userId, codes: codes, version: newVersion },
  });

  await triggerPendingSync();
}

// Chamável de qualquer ponto que saiba que há rede (ex: depois de
// validateLicenseOnline() correr com sucesso em license.js).
export async function triggerPendingSync() {
  const state = await db.get("recoveryBackupState", "state");
  if (!state || !state.pending || !state._pendingPayload) return;

  const licMod = await import("./license.js");
  const lic = licMod.getLicense();
  if (!lic || !lic.code) return; // sem licença ativa — tenta mais tarde

  const store = await db.get("settings", "store");
  const payload = state._pendingPayload;

  try {
    const res = await fetch(CONSOLE_API + "/recovery/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: lic.code,
        storeName: (store && store.name) || "",
        version: payload.version,
        userId: payload.userId,
        codes: payload.codes,
      }),
    });
    const data = await res.json();
    if (data.success) {
      await db.put("recoveryBackupState", {
        key: "state", version: payload.version,
        pending: false, lastSync: new Date().toISOString(),
      });
    }
  } catch (e) {
    // Sem rede — fica pending, tenta-se de novo na próxima oportunidade.
  }
}
