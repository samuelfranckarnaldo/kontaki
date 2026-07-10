// ── HASHING DE CREDENCIAIS (PIN) ──────────────────────────────────────────
// Formato do hash armazenado: "pbkdf2-sha256-v1$<iterations>$<saltHex>$<hashHex>"
// Versionado deliberadamente: se um dia mudarmos o algoritmo ou custo,
// hashes antigos continuam a verificar-se corretamente (o custo fica
// gravado no próprio hash), e podemos fazer rehash silencioso no login.

const HASH_ALGO = "pbkdf2-sha256-v1";

// 300k iterações é um compromisso: acima da recomendação mínima da OWASP
// para PBKDF2-HMAC-SHA256, mas testado para não ultrapassar ~300-400ms
// num Android de gama baixa (o público-alvo do Kontaki). Se testares em
// dispositivos reais e vires um atraso inaceitável no login, este é o
// único número que precisas de ajustar — hashes já criados continuam a
// funcionar porque o custo usado fica gravado dentro do próprio hash.
const PBKDF2_ITERATIONS = 300000;

function toHex(bytes) {
  return Array.from(bytes).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}

function fromHex(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  return arr;
}

async function pbkdf2(password, saltBytes, iterations) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: iterations, hash: "SHA-256" },
    keyMaterial,
    256 // 256 bits = 32 bytes de saída
  );
  return new Uint8Array(bits);
}

// Comparação em tempo constante — impede que diferenças no tempo de
// resposta revelem informação sobre em que byte o hash diverge.
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPassword(password) {
  const salt = new Uint8Array(16); // 128 bits — suficiente para evitar colisões/rainbow tables
  crypto.getRandomValues(salt);
  const derived = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return HASH_ALGO + "$" + PBKDF2_ITERATIONS + "$" + toHex(salt) + "$" + toHex(derived);
}

export async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string") return false;

  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== HASH_ALGO) {
    // Hash em formato desconhecido/antigo — falha fechada (não autentica).
    console.error("Formato de hash não reconhecido.");
    return false;
  }

  const iterations = parseInt(parts[1], 10);
  const salt = fromHex(parts[2]);
  const expected = fromHex(parts[3]);

  const derived = await pbkdf2(password, salt, iterations);
  return constantTimeEqual(derived, expected);
}

// ── RECUPERAÇÃO E CONVITES ────────────────────────────────────────────────
// ATENÇÃO: as funções abaixo (generateRecoveryCode, generateResetToken,
// signInvite/verifyInviteSignature) continuam a ter os problemas
// identificados na auditoria (secret hardcoded no cliente, token
// determinístico). Não foram tocadas nesta entrega — ficam para a
// próxima fase, que exige mudança de arquitetura (mover assinatura para
// o servidor), não só troca de algoritmo. Mantidas aqui inalteradas
// para não partir imports existentes enquanto isso não for desenhado.

export function generateRecoveryCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(function (b) { return chars[b % chars.length]; }).join("");
}

export async function sha256hex(message) {
  const buf = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}

export async function generateResetToken(userId, code) {
  const payload = userId + ":" + code + ":" + Math.floor(Date.now() / 86400000);
  return sha256hex("kontaki-reset-v1:" + payload);
}

const INVITE_SECRET = "kontaki-invite-v1";

export async function signInvite(payload) {
  const data = payload.storeId + ":" + payload.storeName + ":" + payload.inviteCode + ":" + payload.createdAt;
  return sha256hex(INVITE_SECRET + ":" + data);
}

export async function verifyInviteSignature(payload, signature) {
  const expected = await signInvite(payload);
  return expected === signature;
}
