import { db }                        from "./db.js";
import { refreshIcons }              from "./utils.js";
import { hashPassword, verifyPassword, generateRecoveryCode, generateResetToken } from "./crypto.js";

let currentUser    = null;
let currentSession = null;

export function getUser()    { return currentUser; }
export function getSession() { return currentSession; }

// ── LOGIN ─────────────────────────────────────────────────────────────────────
export function initAuth() {
  const app   = document.getElementById("app");
  const login = document.getElementById("login-page");
  const inp   = document.getElementById("inp-user");
  const pass  = document.getElementById("inp-pass");
  const btn   = document.getElementById("btn-login");
  const err   = document.getElementById("login-err");
  const eye   = document.getElementById("pw-toggle");
  const forgotBtn = document.getElementById("btn-forgot-pw");

  if (eye) eye.addEventListener("click", function() {
    var t = pass.type === "password" ? "text" : "password";
    pass.type = t;
    var eyeIcon = document.getElementById("pw-eye");
    if (eyeIcon) eyeIcon.setAttribute("data-lucide", t === "text" ? "eye-off" : "eye");
    refreshIcons(eye);
  });

  if (forgotBtn) forgotBtn.addEventListener("click", openForgotPassword);

  async function doLogin() {
    var u = inp.value.trim();
    var p = pass.value;
    if (!u || !p) { showErr("Preenche todos os campos."); return; }

    var users = await db.getAll("users");
    var user  = null;

    for (var i = 0; i < users.length; i++) {
      var candidate = users[i];
      if (candidate.username !== u) continue;
      if (candidate.active === false) continue;

      // Suporta senha em texto simples (migração) e hash SHA-256
      var valid = false;
      if (candidate.passwordHash) {
        valid = await verifyPassword(p, candidate.passwordHash);
      } else if (candidate.password) {
        // Migração: senha em texto simples — verifica e migra
        valid = candidate.password === p;
        if (valid) {
          var newHash = await hashPassword(p);
          await db.put("users", {
            ...candidate,
            passwordHash: newHash,
            password:     null,
            migratedAt:   new Date().toISOString(),
          });
        }
      }

      if (valid) { user = candidate; break; }
    }

    if (!user) { showErr("Utilizador ou senha incorrectos."); return; }

    currentUser = { ...user, sessionId: null };
    err.style.display = "none";

    // Verifica turno aberto
    var sessions    = await db.getAll("sessions");
    var openSession = null;
    for (var j = 0; j < sessions.length; j++) {
      if (sessions[j].status === "open" && sessions[j].userId === user.id) {
        openSession = sessions[j]; break;
      }
    }

    if (openSession) {
      currentSession        = openSession;
      currentUser.sessionId = openSession.id;
    } else {
      var lastClosed = sessions
        .filter(function(s) { return s.status === "closed" || s.status === "validated"; })
        .sort(function(a,b) { return b.id - a.id; })[0];

      var products = await db.getAll("products");
      products = products.filter(function(x) { return x.active; });

      var stockRecebido = {};
      products.forEach(function(p) {
        stockRecebido[p.id] = {
          productId: p.id, productName: p.name,
          expected: p.stock || 0, found: p.stock || 0, unit: p.unit,
        };
      });

      var sessionId = await db.add("sessions", {
        uuid:            generateSessionUUID(),
        userId:          user.id,
        userName:        user.name,
        status:          "open",
        openedAt:        new Date().toISOString(),
        closedAt:        null,
        prevSessionUuid: lastClosed ? (lastClosed.uuid || null) : null,
        stockRecebido,
        stockEsperado:   {},
        totalVendas:     0,
        nVendas:         0,
        hasIncidents:    false,
        validated:       false,
        validatedBy:     null,
        validatedAt:     null,
        ktkHash:         null,
        importedKtkUuid: null,
      });

      currentSession        = await db.get("sessions", sessionId);
      currentUser.sessionId = sessionId;
    }

    login.style.display = "none";
    app.style.display   = "flex";
    refreshIcons(app);
    import("./router.js").then(function(m) { m.router.init(); });
  }

  if (btn) btn.addEventListener("click", doLogin);
  if (inp) inp.addEventListener("keydown", function(e) { if (e.key === "Enter") pass.focus(); });
  if (pass) pass.addEventListener("keydown", function(e) { if (e.key === "Enter") doLogin(); });

  function showErr(msg) {
    var msgEl = document.getElementById("login-err-msg");
    if (msgEl) msgEl.textContent = msg;
    err.style.display = "flex";
  }

  refreshIcons(document.getElementById("login-page"));
}

function generateSessionUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  var b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6]=(b[6]&0x0f)|0x40; b[8]=(b[8]&0x3f)|0x80;
  var h=Array.from(b).map(function(x){return x.toString(16).padStart(2,"0");}).join("");
  return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20);
}

// ── RECUPERAÇÃO DE SENHA ──────────────────────────────────────────────────────
async function openForgotPassword() {
  var users   = await db.getAll("users");
  var admins  = users.filter(function(u) { return u.role === "admin" && u.active !== false; });

  if (!admins.length) {
    alert("Nenhum administrador encontrado."); return;
  }

  // Gera código de recuperação
  var code      = generateRecoveryCode();
  var token     = await generateResetToken(admins[0].id, code);
  var expiresAt = new Date(Date.now() + 24*60*60*1000).toISOString();

  // Guarda pedido de reset
  await db.put("settings", {
    key:       "resetRequest",
    userId:    admins[0].id,
    code:      code,
    token:     token,
    expiresAt: expiresAt,
    used:      false,
    createdAt: new Date().toISOString(),
  });

  // Mostra modal com código para enviar
  var overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:400;display:flex;align-items:center;justify-content:center;padding:20px";
  overlay.innerHTML =
    '<div style="background:#fff;border-radius:16px;padding:24px;width:100%;max-width:340px">' +
    '<div style="font-size:17px;font-weight:700;margin-bottom:8px">Recuperar Senha</div>' +
    '<div style="font-size:13px;color:#71717a;margin-bottom:16px;line-height:1.5">' +
    'Envia este código ao administrador do sistema (Introxeer Technology) por WhatsApp.' +
    ' Após validação recebes um código de reset.</div>' +
    '<div style="background:#ede9fe;border-radius:12px;padding:16px;text-align:center;margin-bottom:16px">' +
    '<div style="font-size:11px;color:#5b21b6;font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Código de recuperação</div>' +
    '<div style="font-size:28px;font-weight:700;color:#5b21b6;letter-spacing:6px">' + code + '</div>' +
    '<div style="font-size:11px;color:#7c3aed;margin-top:6px">Válido por 24 horas</div>' +
    '</div>' +
    '<div style="display:flex;flex-direction:column;gap:8px">' +
    '<button onclick="window._shareRecoveryCode(\'' + code + '\')" style="padding:13px;background:#25D366;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">' +
    'Enviar por WhatsApp</button>' +
    '<button onclick="window._openResetForm()" style="padding:13px;background:#f4f4f5;color:#5b21b6;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">' +
    'Já tenho o código de reset</button>' +
    '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="padding:10px;background:none;border:none;color:#71717a;font-size:13px;cursor:pointer;font-family:inherit">' +
    'Cancelar</button>' +
    '</div></div>';

  document.body.appendChild(overlay);

  window._shareRecoveryCode = function(c) {
    var msg = "Kontaki - Pedido de recuperação de senha\n\nCódigo: " + c + "\n\nPor favor valida este código no Kontaki Console.";
    if (navigator.share) {
      navigator.share({ title:"Kontaki Recovery", text:msg });
    } else {
      var wa = "https://wa.me/?text=" + encodeURIComponent(msg);
      window.open(wa, "_blank");
    }
  };

  window._openResetForm = function() {
    overlay.innerHTML =
      '<div style="background:#fff;border-radius:16px;padding:24px;width:100%;max-width:340px">' +
      '<div style="font-size:17px;font-weight:700;margin-bottom:8px">Inserir código de reset</div>' +
      '<div style="font-size:13px;color:#71717a;margin-bottom:16px">Insere o código de reset recebido.</div>' +
      '<div class="field" style="margin-bottom:12px">' +
      '<label>Código de reset</label>' +
      '<input id="reset-code-input" placeholder="Ex: AB12CD34" style="text-align:center;font-size:20px;font-weight:700;letter-spacing:4px;text-transform:uppercase"/>' +
      '</div>' +
      '<div class="field" style="margin-bottom:12px">' +
      '<label>Nova senha</label>' +
      '<input type="password" id="reset-new-pw" placeholder="Nova senha"/>' +
      '</div>' +
      '<div class="field" style="margin-bottom:16px">' +
      '<label>Confirmar senha</label>' +
      '<input type="password" id="reset-conf-pw" placeholder="Confirma a senha"/>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px">' +
      '<button onclick="window._applyReset()" style="padding:13px;background:#5b21b6;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">Redefinir senha</button>' +
      '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="padding:10px;background:none;border:none;color:#71717a;font-size:13px;cursor:pointer;font-family:inherit">Cancelar</button>' +
      '</div></div>';
  };

  window._applyReset = async function() {
    var inputCode = document.getElementById("reset-code-input").value.trim().toUpperCase();
    var newPw     = document.getElementById("reset-new-pw").value;
    var confPw    = document.getElementById("reset-conf-pw").value;

    if (!inputCode || !newPw) { alert("Preenche todos os campos."); return; }
    if (newPw !== confPw)     { alert("As senhas não coincidem."); return; }
    if (newPw.length < 6)     { alert("A senha deve ter pelo menos 6 caracteres."); return; }

    // Valida o código de reset
    var resetReq = await db.get("settings","resetRequest");
    if (!resetReq || resetReq.used) { alert("Código inválido ou já utilizado."); return; }
    if (new Date(resetReq.expiresAt) < new Date()) { alert("Código expirado. Gera um novo."); return; }

    // Verifica o token
    var expectedToken = await generateResetToken(resetReq.userId, inputCode);
    if (expectedToken !== resetReq.token) { alert("Código incorrecto."); return; }

    // Aplica nova senha com hash
    var user    = await db.get("users", resetReq.userId);
    var newHash = await hashPassword(newPw);
    await db.put("users", {
      ...user,
      passwordHash: newHash,
      password:     null,
      updatedAt:    new Date().toISOString(),
    });

    // Marca código como usado
    await db.put("settings", { ...resetReq, used: true, usedAt: new Date().toISOString() });

    overlay.remove();
    alert("Senha redefinida com sucesso! Faz login com a nova senha.");
  };
}

// ── LOGOUT ────────────────────────────────────────────────────────────────────
export function logout() {
  if (!confirm("Tens a certeza que queres terminar a sessão?")) return;
  currentUser    = null;
  currentSession = null;
  var app   = document.getElementById("app");
  var login = document.getElementById("login-page");
  if (app)   app.style.display   = "none";
  if (login) login.style.display = "flex";
  document.getElementById("inp-user").value = "";
  document.getElementById("inp-pass").value = "";
}

// ── ALTERAR SENHA (autenticado) ───────────────────────────────────────────────
export async function changePasswordAuth(currentPw, newPw) {
  var user = await db.get("users", currentUser.id);
  var valid = false;

  if (user.passwordHash) {
    valid = await verifyPassword(currentPw, user.passwordHash);
  } else {
    valid = user.password === currentPw;
  }

  if (!valid) throw new Error("Senha actual incorrecta.");
  if (newPw.length < 6) throw new Error("A nova senha deve ter pelo menos 6 caracteres.");

  var newHash = await hashPassword(newPw);
  await db.put("users", {
    ...user,
    passwordHash: newHash,
    password:     null,
    updatedAt:    new Date().toISOString(),
  });
}

// ── CRIAR UTILIZADOR ──────────────────────────────────────────────────────────
export async function createUser(name, username, password, role) {
  var users    = await db.getAll("users");
  var existing = users.find(function(u) { return u.username === username; });
  if (existing) throw new Error("Username já existe.");

  var passwordHash = await hashPassword(password);
  return db.add("users", {
    name, username, passwordHash, password: null,
    role, active: true, createdAt: new Date().toISOString(),
  });
}
