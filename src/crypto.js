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

// ── VERIFICAÇÃO DE CONVITES (equipa) — ADR-0004 ───────────────────────────
// A assinatura é feita pelo Console (chave privada, nunca no cliente).
// O Kontaki só verifica, offline, com a chave pública embutida abaixo.
// Ver docs/architecture/adrs/ADR-0004-assinatura-convites.md

const INVITE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEhXcqSlrnvXmYvvzsFSZP6r1WFJUR
noMVdUjbT0ZFt8XvlErh4FK/v3aAu0M+G2Cw181Ry8owuSKikFqchIGnXw==
-----END PUBLIC KEY-----`;

function pemToArrayBuffer(pem) {
  const b64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/\s+/g, "");
  const raw = atob(b64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

let _invitePublicKeyCache = null;
async function getInvitePublicKey() {
  if (_invitePublicKeyCache) return _invitePublicKeyCache;
  const keyData = pemToArrayBuffer(INVITE_PUBLIC_KEY_PEM);
  _invitePublicKeyCache = await crypto.subtle.importKey(
    "spki", keyData, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]
  );
  return _invitePublicKeyCache;
}

// Assinatura recebida do Console vem em base64 (formato DER, produzido
// por crypto.createSign('SHA256').sign(key, 'base64') no Node).
// Web Crypto espera o formato "raw" (r || s, 64 bytes) para ECDSA —
// por isso convertemos de DER para raw antes de verificar.
function derToRawSignature(derB64) {
  const der = atob(derB64);
  const bytes = Array.from(der).map(c => c.charCodeAt(0));
  let i = 2;
  i++;
  const rLen = bytes[i++];
  let r = bytes.slice(i, i + rLen); i += rLen;
  i++;
  const sLen = bytes[i++];
  let s = bytes.slice(i, i + sLen); i += sLen;
  r = r.filter((b, idx) => !(idx === 0 && b === 0 && r.length > 32));
  s = s.filter((b, idx) => !(idx === 0 && b === 0 && s.length > 32));
  const pad = (arr) => {
    const out = new Uint8Array(32);
    out.set(arr, 32 - arr.length);
    return out;
  };
  const raw = new Uint8Array(64);
  raw.set(pad(r), 0);
  raw.set(pad(s), 32);
  return raw.buffer;
}

export async function verifyInviteSignature(payload, signatureB64) {
  try {
    const data = payload.storeId + ":" + payload.storeName + ":" +
                 payload.inviteCode + ":" + payload.role + ":" + payload.createdAt;
    const key = await getInvitePublicKey();
    const sigBuf = derToRawSignature(signatureB64);
    const dataBuf = new TextEncoder().encode(data);
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" }, key, sigBuf, dataBuf
    );
  } catch (e) {
    console.error("Erro ao verificar assinatura de convite:", e);
    return false;
  }
}
