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

// ── CÓDIGOS DE RECUPERAÇÃO DE PIN (offline, consumíveis) ───────────────────
// Alta entropia (~2^40 por código) — sem stretching (SHA-256 simples
// basta; ao contrário do PIN de 6 dígitos, aqui não há espaço de busca
// pequeno a proteger contra brute-force offline). Ver
// docs/architecture (ADR de recuperação de PIN).
export function generateRecoveryCodesBatch(count) {
  const n = count || 10;
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const codes = [];
  for (let i = 0; i < n; i++) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const raw = Array.from(bytes).map(function (b) { return chars[b % chars.length]; }).join("");
    codes.push(raw.slice(0, 4) + "-" + raw.slice(4, 8));
  }
  return codes;
}

export async function hashRecoveryCode(code) {
  return sha256hex("kontaki-recovery-v1:" + code.trim().toUpperCase());
}

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

// ── BACKUP CIFRADO (envelope de duas camadas) ─────────────────────────────
// Desenho (ADR pendente de documentar em docs/architecture):
//   Recovery Code → PBKDF2 → KEK → unwrap → Master Key → unwrap → DEK → decrypt → Backup
//
// A Master Key é gerada UMA VEZ (quando os 10 Recovery Codes são criados/
// regenerados) e embrulhada uma vez por código — assim, cada backup só
// precisa de embrulhar a DEK com a Master Key (1 operação), sem tocar nos
// 10 códigos a cada backup. O servidor nunca vê nenhuma chave em claro,
// só os blobs cifrados e os wraps.
//
// Nota de modelo de ameaças sobre extractable:false na Master Key local:
// impede a Web Crypto API de exportar o material da chave, reduzindo
// significativamente o risco de exfiltração (ex. cópia do IndexedDB).
// NÃO impede um atacante com execução ativa na origem (ex. XSS same-
// origin) de invocar operações criptográficas usando a chave enquanto a
// app está aberta — a propriedade protegida é a exportação, não o uso
// indevido durante uma sessão já comprometida.

const BACKUP_ALGORITHM = "AES-256-GCM";
const KEK_ITERATIONS = 300000; // mesmo custo do hashPassword, por consistência
const WRAP_VERSION = 1;

async function generateAESKey(extractable) {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 }, extractable !== false, ["encrypt", "decrypt"]
  );
}

async function exportRawKey(key) {
  const raw = await crypto.subtle.exportKey("raw", key);
  return new Uint8Array(raw);
}

async function importRawKey(bytes, extractable) {
  return crypto.subtle.importKey(
    "raw", bytes, { name: "AES-GCM" }, extractable !== false, ["encrypt", "decrypt"]
  );
}

async function encryptWithKey(key, plaintextBytes) {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ctBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, plaintextBytes);
  return { iv: toHex(iv), ciphertext: toHex(new Uint8Array(ctBuf)) };
}

// O authTag do AES-GCM vai embutido no fim do ciphertext; se os dados
// tiverem sido corrompidos ou adulterados, decrypt() lança excepção —
// é essa excepção que garante a integridade autenticada do backup.
async function decryptWithKey(key, ivHex, ciphertextHex) {
  const iv = fromHex(ivHex);
  const ct = fromHex(ciphertextHex);
  const ptBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ct);
  return new Uint8Array(ptBuf);
}

// KEK derivada directamente do Recovery Code — deliberadamente NÃO reaproveita
// hashRecoveryCode() (esse hash sai do dispositivo, vai para o servidor para
// autenticação; a KEK tem de ficar sempre local — separação de domínios).
async function deriveKEKFromRecoveryCode(code, storeId) {
  const salt = new TextEncoder().encode("kontaki-backup-kek-v1:" + storeId);
  const derived = await pbkdf2(code.trim().toUpperCase(), salt, KEK_ITERATIONS);
  return importRawKey(derived, false);
}

// Gera a Master Key da loja. Extractable=true só temporariamente, para
// permitir o wrap para os 10 códigos — ver makeMasterKeyNonExtractable().
export async function generateMasterKey() {
  return generateAESKey(true);
}

// Reimporta a Master Key como extractable:false — é esta cópia que deve
// ficar guardada localmente; a original extraível deve ser descartada
// pelo chamador logo a seguir a isto.
export async function makeMasterKeyNonExtractable(masterKey) {
  const raw = await exportRawKey(masterKey);
  return importRawKey(raw, false);
}

export async function wrapMasterKeyWithRecoveryCode(masterKey, code, storeId) {
  const kek = await deriveKEKFromRecoveryCode(code, storeId);
  const raw = await exportRawKey(masterKey);
  const { iv, ciphertext } = await encryptWithKey(kek, raw);
  return { wrapVersion: WRAP_VERSION, iv: iv, wrappedKey: ciphertext };
}

export async function unwrapMasterKeyWithRecoveryCode(wrapped, code, storeId) {
  if (wrapped.wrapVersion !== WRAP_VERSION) {
    throw new Error("Versão de embrulho não suportada: " + wrapped.wrapVersion);
  }
  const kek = await deriveKEKFromRecoveryCode(code, storeId);
  const raw = await decryptWithKey(kek, wrapped.iv, wrapped.wrappedKey);
  return importRawKey(raw, false);
}

export async function encryptBackup(backupObject, masterKey) {
  const dek = await generateAESKey(true);
  const plaintext = new TextEncoder().encode(JSON.stringify(backupObject));
  const { iv, ciphertext } = await encryptWithKey(dek, plaintext);

  const rawDek = await exportRawKey(dek);
  const { iv: dekIv, ciphertext: wrappedDEK } = await encryptWithKey(masterKey, rawDek);

  return {
    version: 1,
    algorithm: BACKUP_ALGORITHM,
    createdAt: new Date().toISOString(),
    iv: iv,
    ciphertext: ciphertext,
    wrappedDEK: wrappedDEK,
    wrappedDEKIv: dekIv
  };
}

export async function decryptBackup(backupPayload, masterKey) {
  if (backupPayload.algorithm !== BACKUP_ALGORITHM) {
    throw new Error("Algoritmo de backup não suportado: " + backupPayload.algorithm);
  }
  const rawDek = await decryptWithKey(masterKey, backupPayload.wrappedDEKIv, backupPayload.wrappedDEK);
  const dek = await importRawKey(rawDek, false);
  const plaintextBytes = await decryptWithKey(dek, backupPayload.iv, backupPayload.ciphertext);
  const json = new TextDecoder().decode(plaintextBytes);
  return JSON.parse(json);
}
