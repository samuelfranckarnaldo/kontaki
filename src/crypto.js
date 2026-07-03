export async function sha256hex(message) {
  const buf  = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map(function(b) { return b.toString(16).padStart(2,"0"); }).join("");
}

export async function hashPassword(password) {
  return sha256hex("kontaki-pw-v1:" + password);
}

export async function verifyPassword(password, hash) {
  const computed = await hashPassword(password);
  return computed === hash;
}

export function generateRecoveryCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(function(b) { return chars[b % chars.length]; }).join("");
}

export async function generateResetToken(userId, code) {
  const payload = userId + ":" + code + ":" + Math.floor(Date.now() / 86400000);
  return sha256hex("kontaki-reset-v1:" + payload);
}

// ── ASSINATURA DE CONVITES (equipa) ──────────────────────────────────────
const INVITE_SECRET = "kontaki-invite-v1";

export async function signInvite(payload) {
  const data = payload.storeId + ":" + payload.storeName + ":" + payload.inviteCode + ":" + payload.createdAt;
  return sha256hex(INVITE_SECRET + ":" + data);
}

export async function verifyInviteSignature(payload, signature) {
  const expected = await signInvite(payload);
  return expected === signature;
}
