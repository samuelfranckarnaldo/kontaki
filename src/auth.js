import { db } from "./db.js";
import { refreshIcons } from "./utils.js";
import { hashPassword, verifyPassword } from "./crypto.js";
import { toast } from "./toast.js";
import { confirmDialog } from "./modal.js";
import { getTurnoDuration } from "./utils.js";

let currentUser    = null;
let currentSession = null;
let _pinBuffer     = "";
let _selectedUser  = null;

export function getUser()    { return currentUser; }
export function getSession() { return currentSession; }
export function _setSession(s) { currentSession = s; if (currentUser) currentUser.sessionId = s ? s.id : null; }

// ── TIMEOUT DE SESSÃO POR INATIVIDADE ──────────────────────────────────────
// 15 minutos sem interação (toque, clique, tecla) faz logout automático.
// Só ativo depois de currentUser existir (não corre no ecrã de login).
const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
let _inactivityTimer = null;

function _resetInactivityTimer() {
  if (_inactivityTimer) clearTimeout(_inactivityTimer);
  if (!currentUser) return;
  _inactivityTimer = setTimeout(_handleInactivityTimeout, SESSION_TIMEOUT_MS);
}

function _handleInactivityTimeout() {
  if (!currentUser) return;
  console.info("Sessão terminada por inatividade.");
  logout(true);
}

(function initInactivityWatcher() {
  ["touchstart", "mousedown", "keydown", "click"].forEach(function (evt) {
    document.addEventListener(evt, _resetInactivityTimer, { passive: true });
  });
})();

function ensurePinCardStyle() {
  if (document.getElementById("login-pin-card-style")) return;
  var styleTag = document.createElement("style");
  styleTag.id = "login-pin-card-style";
  styleTag.textContent =
    ".login-pin-btn:active { transform:scale(.92); background:#f5f3ff !important; border-color:#c4b5fd !important; }" +
    ".login-pin-btn-ghost:active { background:#f4f4f5 !important; }" +
    "@keyframes loginPinDotPop { 0% { transform:scale(1) } 50% { transform:scale(1.25) } 100% { transform:scale(1.06) } }" +
    ".login-pin-dot-filled { animation:loginPinDotPop .25s ease; }";
  document.head.appendChild(styleTag);
}

function renderPinCard() {
  var container = document.getElementById("login-pin-container");
  if (!container) return;

  container.innerHTML = [
    '<div id="login-pin-user" style="display:flex;align-items:center;gap:10px;background:#fff;border:1.5px solid #ede9fe;border-radius:14px;padding:10px 14px;margin-bottom:12px;width:100%;box-sizing:border-box;max-width:320px"></div>',

    '<div style="font-size:12.5px;font-weight:600;color:#71717a;text-align:center;margin-bottom:12px" id="login-pin-label">Introduz o teu PIN</div>',

    '<div id="pin-dots" style="display:flex;gap:9px;justify-content:center;margin-bottom:12px"></div>',

    '<div id="login-err" class="login-err" style="text-align:center;margin-bottom:4px">',
      '<span id="login-err-msg">PIN incorrecto</span>',
    '</div>',

    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:100%;max-width:220px;margin:0 auto">',
      [1,2,3,4,5,6,7,8,9,'back','0','del'].map(function(n) {
        if (n === 'back') return '<button onclick="window._backToRole()" class="login-pin-btn login-pin-btn-ghost"><i data-lucide="arrow-left"></i></button>';
        if (n === 'del') return '<button onclick="window._pinKey(String.fromCharCode(9003))" class="login-pin-btn login-pin-btn-ghost"><i data-lucide="delete"></i></button>';
        return '<button onclick="window._pinKey(\'' + n + '\')" class="login-pin-btn">' + n + '</button>';
      }).join(''),
    '</div>',

    '<button id="btn-forgot-pw" class="login-forgot-btn">Esqueci o PIN</button>',
  ].join('');

  refreshIcons(container);

  var forgotBtn = document.getElementById("btn-forgot-pw");
  if (forgotBtn) forgotBtn.addEventListener("click", openForgotPassword);
}

export function initAuth() {
  const list = document.getElementById("login-users-list");

  if (!list) {
    console.warn("Auth UI não pronta.");
    return;
  }

  ensurePinCardStyle();
  renderPinCard();
  _renderLoginUsers();

  if (window.lucide) window.lucide.createIcons();
}

async function _renderLoginUsers() {
  const users = await db.getAll("users");
  const store = await db.get("settings", "store");
  const sessions = await db.getAll("sessions");
  const openSessionByUserId = {};
  sessions.forEach(function(s) {
    if (s.status === "open") openSessionByUserId[s.userId] = s;
  });

  const storeName = document.getElementById("login-store-name");
  if (storeName && store) storeName.textContent = store.name || "Kontaki";

  const logoWrap = document.getElementById("login-logo-wrap");
  if (logoWrap && store && store.logo) {
    logoWrap.innerHTML = "";
    logoWrap.className = "";
    var img = document.createElement("img");
    img.src = store.logo;
    img.className = "login-store-logo";
    img.alt = store.name || "Logo";
    logoWrap.appendChild(img);
  }

  const list = document.getElementById("login-users-list");
  if (!list) return;

  const active = users.filter(u => u.active !== false);

  if (!active.length) {
    list.innerHTML = '<div style="text-align:center;color:#a1a1aa;font-size:13px;padding:20px">Nenhum utilizador encontrado.<br/>Reinicia o setup.</div>';
    return;
  }

  list.innerHTML = "";

  active.forEach(u => {
    const isAdmin = u.role === "admin";
    const color   = isAdmin ? "#5b21b6" : "#16a34a";
    const bg      = "#fff";
    const border  = "#e4e4e7";
    const label   = isAdmin ? "Administrador" : "Operador de Caixa";

    const btn = document.createElement("button");
    btn.style.cssText =
      "display:flex;align-items:center;gap:14px;padding:14px 16px;background:" + bg +
      ";border:2px solid " + border + ";border-radius:14px;cursor:pointer;" +
      "font-family:inherit;text-align:left;width:100%;margin-bottom:8px;transition:all 0.2s";

    const openSession = openSessionByUserId[u.id];
    const turnoBadge = openSession
      ? '<div style="font-size:11px;color:#d97706;margin-top:3px;font-weight:600;display:flex;align-items:center;gap:4px"><i data-lucide="clock" style="width:11px;height:11px"></i>Turno activo · ' + getTurnoDuration(openSession.openedAt).str + '</div>'
      : '';

    btn.innerHTML =
      '<div style="width:48px;height:48px;background:' + color +
      ';border-radius:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:20px;font-weight:700;color:#fff">' +
      (u.avatar || u.name.charAt(0).toUpperCase()) +
      '</div>' +
      '<div><div style="font-size:16px;font-weight:700;color:#18181b">' + u.name +
      '</div><div style="font-size:12px;color:' + color + ';margin-top:2px">' + label +
      '</div>' + turnoBadge + '</div>';

    btn.onclick = () => _selectUserHandler(u.id);
    list.appendChild(btn);
  });

  if (window.lucide) window.lucide.createIcons();
}

window._selectUser = _selectUserHandler;

async function _selectUserHandler(userId) {
  const users = await db.getAll("users");
  _selectedUser = users.find(u => u.id === userId);
  if (!_selectedUser) return;

  _pinBuffer = "";
  _updatePinDots();

  const stepRole = document.getElementById("login-step-role");
  const stepPin  = document.getElementById("login-step-pin");

  if (stepRole) stepRole.style.display = "none";

  if (stepPin) {
    stepPin.style.display = "flex";
    stepPin.classList.add("active");
  }

  const loginPageEl = document.getElementById("login-page");
  if (loginPageEl) loginPageEl.classList.add("pin-active");

  const pinUserEl = document.getElementById("login-pin-user");

  if (pinUserEl) {
    pinUserEl.innerHTML =
      '<div style="width:42px;height:42px;background:#5b21b6;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;color:#fff;flex-shrink:0">' +
      (_selectedUser.avatar || _selectedUser.name.charAt(0).toUpperCase()) +
      '</div>' +
      '<div style="font-size:15px;font-weight:600;color:#18181b">' +
      _selectedUser.name +
      '</div>';
  }

  const errEl = document.getElementById("login-err");

  if (errEl) {
    errEl.classList.remove("show");
  }

  const attempts = await _getLoginAttempts(_selectedUser.id);

  if (attempts.lockedUntil && attempts.lockedUntil > Date.now()) {
    const errMsg = document.getElementById("login-err-msg");

    if (errMsg) {
      errMsg.textContent = _formatLockMessage(attempts.lockedUntil);
    }

    if (errEl) {
      errEl.classList.add("show");
    }
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function _updatePinDots() {
  var dotsEl = document.getElementById("pin-dots");
  if (!dotsEl) return;
  dotsEl.innerHTML = [0,1,2,3,4,5].map(function(i) {
    var filled = i < _pinBuffer.length;
    return '<div class="' + (filled ? 'login-pin-dot-filled' : '') + '" style="width:28px;height:28px;border-radius:50%;border:2px solid ' +
      (filled ? '#5b21b6' : '#e4e4e7') + ';background:' + (filled ? '#5b21b6' : '#fafafa') +
      ';display:flex;align-items:center;justify-content:center;transition:background .15s ease,border-color .15s ease;flex-shrink:0;' +
      (filled ? 'transform:scale(1.06)' : '') +
      '"></div>';
  }).join('');

  const errEl = document.getElementById("login-err");
  if (errEl && _pinBuffer.length > 0) {
    errEl.classList.remove("show");
  }
}

window._pinKey = function(key) {
  if (key === '⌫' || key === 'del' || key === 'delete' || key === String.fromCharCode(9003)) {
    _pinBuffer = _pinBuffer.slice(0, -1);
  } else if (_pinBuffer.length < 6) {
    _pinBuffer += key;
  }
  _updatePinDots();
  if (_pinBuffer.length === 6) {
    setTimeout(() => _verifyPin(), 200);
  }
};

window._backToRole = function() {
  _pinBuffer = "";
  _selectedUser = null;

  const stepRole = document.getElementById("login-step-role");
  const stepPin  = document.getElementById("login-step-pin");

  if (stepRole) {
    stepRole.style.display = "flex";
  }

  if (stepPin) {
    stepPin.style.display = "none";
    stepPin.classList.remove("active");
  }

  const loginPageEl = document.getElementById("login-page");

  if (loginPageEl) {
    loginPageEl.classList.remove("pin-active");
  }

  _updatePinDots();
};

// ── LOCKOUT DE TENTATIVAS ──────────────────────────────────────────────
const LOCKOUT_STEPS = [
  { after: 5,  lockMs: 30 * 1000 },
  { after: 10, lockMs: 5  * 60 * 1000 },
  { after: 15, lockMs: 30 * 60 * 1000 },
];

async function _getLoginAttempts(userId) {
  const rec = await db.get("loginAttempts", userId);
  return rec || { userId, count: 0, lockedUntil: null };
}

async function _registerFailedAttempt(userId) {
  const rec = await _getLoginAttempts(userId);
  rec.count = (rec.count || 0) + 1;

  const now = Date.now();
  let step = null;
  for (const s of LOCKOUT_STEPS) { if (rec.count >= s.after) step = s; }
  if (step) rec.lockedUntil = now + step.lockMs;

  await db.put("loginAttempts", rec);
  return rec;
}

async function _clearLoginAttempts(userId) {
  await db.delete("loginAttempts", userId).catch(() => {});
}

function _formatLockMessage(lockedUntil) {
  const ms = lockedUntil - Date.now();
  const totalSec = Math.max(1, Math.ceil(ms / 1000));
  if (totalSec >= 60) {
    const min = Math.ceil(totalSec / 60);
    return "Demasiadas tentativas. Tenta novamente em " + min + " min.";
  }
  return "Demasiadas tentativas. Tenta novamente em " + totalSec + "s.";
}

async function _verifyPin() {
  if (!_selectedUser) return;

  try {
    const attempts = await _getLoginAttempts(_selectedUser.id);
    if (attempts.lockedUntil && attempts.lockedUntil > Date.now()) {
      const errEl = document.getElementById("login-err");
      const errMsg = document.getElementById("login-err-msg");
      if (errMsg) errMsg.textContent = _formatLockMessage(attempts.lockedUntil);
      if (errEl) errEl.classList.add("show");
      _pinBuffer = "";
      _updatePinDots();
      return;
    }

    const valid = await verifyPassword(_pinBuffer, _selectedUser.passwordHash);

    if (!valid) {
      const rec = await _registerFailedAttempt(_selectedUser.id);

      const errEl = document.getElementById("login-err");
      const errMsg = document.getElementById("login-err-msg");
      if (errEl) errEl.classList.add("show");
      if (errMsg) {
        errMsg.textContent = (rec.lockedUntil && rec.lockedUntil > Date.now())
          ? _formatLockMessage(rec.lockedUntil)
          : "PIN incorrecto";
      }

      const dotsContainer = document.getElementById("pin-dots");
      if (dotsContainer) {
        dotsContainer.style.animation = "none";
        dotsContainer.offsetHeight;
        dotsContainer.style.animation = "shake 0.5s ease";
      }

      _pinBuffer = "";
      _updatePinDots();

      setTimeout(() => { if (errEl) errEl.classList.remove("show"); }, 2500);
      return;
    }

    await _clearLoginAttempts(_selectedUser.id);

    currentUser = _selectedUser;
    currentSession = null;
    currentUser.sessionId = null;

    try {
      const sessions = await db.getAll("sessions");

      const legacyOpen = sessions.filter(s => s.status === "open" && s.userId === currentUser.id && !s.uuid);
      for (const ls of legacyOpen) {
        await db.put("sessions", Object.assign({}, ls, {
          status: "closed",
          closedAt: new Date().toISOString(),
          note: (ls.note || "") + " [auto-fechado: sessão legada criada no login]"
        }));
      }

      const openSession = sessions
        .filter(s => s.status === "open" && s.userId === currentUser.id && s.uuid)
        .sort((a, b) => b.id - a.id)[0];
      if (openSession) {
        currentSession = openSession;
        currentUser.sessionId = openSession.id;
      }
    } catch (e) {
      console.error("Erro ao procurar/limpar turnos no login:", e);
    }

    localStorage.setItem("kontaki_session", JSON.stringify({
      userId: currentUser.id,
      sessionId: currentUser.sessionId || null
    }));

    _resetInactivityTimer();

    const loginPage = document.getElementById("login-page");
    const app = document.getElementById("app");

    if (loginPage) loginPage.style.display = "none";
    if (app) app.style.display = "flex";

    if (window.router) {
      setTimeout(() => window.router.init(), 100);
    }

    import("./components/dashboard.js").then(m => {
      if (m.loadDashboard) m.loadDashboard();
    }).catch(() => {});

    if (window.lucide) window.lucide.createIcons();

    import("./message-ui.js").then(m => m.initMessagesOnBoot()).catch(() => {});

  } catch (err) {
    console.error("Erro PIN:", err);
    _pinBuffer = "";
    _updatePinDots();
  }
}

function openForgotPassword() {
  if (!_selectedUser) return;
  showRecoveryScreen(_selectedUser);
}

function showRecoveryScreen(targetUser) {
  var ov = document.createElement("div");
  ov.id = "recovery-redeem-overlay";
  ov.style.cssText = "position:fixed;inset:0;background:#fff;z-index:10001;overflow-y:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;font-family:inherit";

  ov.innerHTML = [
    '<div style="width:100%;max-width:340px;text-align:center">',
      '<button id="recovery-redeem-back" style="position:absolute;top:20px;left:20px;background:none;border:none;color:#a1a1aa;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Voltar</button>',
      '<div style="width:56px;height:56px;background:#f5f3ff;border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">',
        '<i data-lucide="key-round" style="width:26px;height:26px;color:#5b21b6"></i>',
      '</div>',
      '<div style="font-size:18px;font-weight:800;color:#18181b;margin-bottom:8px">Recuperar PIN</div>',
      '<div style="font-size:13px;color:#71717a;margin-bottom:20px;line-height:1.5">Introduz um dos teus códigos de recuperação de 8 caracteres.</div>',
      '<input id="recovery-code-input" type="text" placeholder="XXXX-XXXX" maxlength="9" inputmode="text" autocapitalize="characters" autocomplete="off" style="width:100%;padding:14px;border:1.5px solid #e4e4e7;border-radius:12px;font-size:18px;font-family:monospace;text-align:center;letter-spacing:2px;box-sizing:border-box;margin-bottom:16px;text-transform:uppercase"/>',
      '<div style="font-size:12px;color:#a1a1aa;line-height:1.5;margin-bottom:16px">São 10 códigos únicos, gerados na altura da configuração inicial — se não os apontaste nem tens acesso a eles offline, contacta a <strong>Introxeer</strong> pelo <a href="https://wa.me/244900000000" target="_blank" style="color:#5b21b6;font-weight:700;text-decoration:none">WhatsApp</a>.</div>',
      '<div id="recovery-redeem-error" style="display:none;margin-bottom:14px;padding:10px;background:#fef2f2;border:1.5px solid #fecaca;border-radius:10px;color:#dc2626;font-size:12px;font-weight:600"></div>',
      '<button id="recovery-redeem-submit" style="width:100%;padding:14px;background:#5b21b6;color:#fff;border:none;border-radius:13px;font-size:14.5px;font-weight:700;cursor:pointer;font-family:inherit">Verificar código</button>',
    '</div>',
  ].join('');

  document.body.appendChild(ov);
  refreshIcons(ov);

  document.getElementById("recovery-redeem-back").onclick = function() { ov.remove(); };

  var recInput = document.getElementById("recovery-code-input");
  recInput.addEventListener("input", function() {
    var raw = recInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    recInput.value = raw.length > 4 ? raw.slice(0,4) + "-" + raw.slice(4) : raw;
  });

  document.getElementById("recovery-redeem-submit").onclick = async function() {
    var input = document.getElementById("recovery-code-input");
    var errEl = document.getElementById("recovery-redeem-error");
    var code = input.value.trim().replace(/-/g, "");
    errEl.style.display = "none";

    if (!code) return;

    try {
      var mod = await import("./recovery-codes.js");
      var result = await mod.redeemRecoveryCode(code);

      if (!result.valid || result.userId !== targetUser.id) {
        errEl.textContent = "Código inválido. Verifica e tenta novamente.";
        errEl.style.display = "block";
        return;
      }

      ov.remove();
      showSetNewPinScreen(targetUser, result.remaining);
    } catch (e) {
      errEl.textContent = "Erro ao verificar o código.";
      errEl.style.display = "block";
    }
  };
}

function showSetNewPinScreen(targetUser, remaining) {
  var ov = document.createElement("div");
  ov.id = "recovery-newpin-overlay";
  ov.style.cssText = "position:fixed;inset:0;background:#fff;z-index:10001;overflow-y:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;font-family:inherit";

  var lowWarning = remaining <= 3
    ? '<div style="margin-bottom:14px;padding:10px;background:#fffbeb;border:1.5px solid #fde68a;border-radius:10px;color:#92400e;font-size:12px;font-weight:600">Restam apenas ' + remaining + ' códigos de recuperação. Considera gerar um novo conjunto em Segurança.</div>'
    : '';

  ov.innerHTML = [
    '<div style="width:100%;max-width:340px;text-align:center">',
      '<div style="width:56px;height:56px;background:#f0fdf4;border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">',
        '<i data-lucide="lock-open" style="width:26px;height:26px;color:#16a34a"></i>',
      '</div>',
      '<div style="font-size:18px;font-weight:800;color:#18181b;margin-bottom:8px">Código válido</div>',
      '<div style="font-size:13px;color:#71717a;margin-bottom:16px">Define um novo PIN para ' + targetUser.name + '.</div>',
      lowWarning,
      '<input id="newpin-input" type="password" inputmode="numeric" maxlength="6" placeholder="Novo PIN (6 dígitos)" style="width:100%;padding:14px;border:1.5px solid #e4e4e7;border-radius:12px;font-size:16px;text-align:center;letter-spacing:4px;box-sizing:border-box;margin-bottom:10px"/>',
      '<input id="newpin-confirm" type="password" inputmode="numeric" maxlength="6" placeholder="Confirma o PIN" style="width:100%;padding:14px;border:1.5px solid #e4e4e7;border-radius:12px;font-size:16px;text-align:center;letter-spacing:4px;box-sizing:border-box;margin-bottom:16px"/>',
      '<div id="newpin-error" style="display:none;margin-bottom:14px;padding:10px;background:#fef2f2;border:1.5px solid #fecaca;border-radius:10px;color:#dc2626;font-size:12px;font-weight:600"></div>',
      '<button id="newpin-submit" style="width:100%;padding:14px;background:#16a34a;color:#fff;border:none;border-radius:13px;font-size:14.5px;font-weight:700;cursor:pointer;font-family:inherit">Guardar novo PIN</button>',
    '</div>',
  ].join('');

  document.body.appendChild(ov);
  refreshIcons(ov);

  document.getElementById("newpin-submit").onclick = async function() {
    var pin = document.getElementById("newpin-input").value;
    var conf = document.getElementById("newpin-confirm").value;
    var errEl = document.getElementById("newpin-error");
    errEl.style.display = "none";

    if (!/^\d{6}$/.test(pin)) { errEl.textContent = "O PIN deve ter 6 dígitos."; errEl.style.display = "block"; return; }
    if (pin !== conf) { errEl.textContent = "Os PINs não coincidem."; errEl.style.display = "block"; return; }

    var newHash = await hashPassword(pin);
    var fresh = await db.get("users", targetUser.id);
    if (!fresh) { errEl.textContent = "Utilizador não encontrado."; errEl.style.display = "block"; return; }
    await db.put("users", Object.assign({}, fresh, { passwordHash: newHash }));
    await _clearLoginAttempts(targetUser.id).catch(function () {});

    // PIN mudou -> regenera códigos de recuperação (mesma lógica de
    // perfil.js/changePassword, mas aqui o utilizador está deslogado).
    var recMod = await import("./recovery-codes.js");
    var setupMod = await import("./setup.js");
    var newCodes = await recMod.generateCodesForUser(targetUser.id);

    ov.remove();
    setupMod.showRecoveryCodesScreen(newCodes, function() {
      toast("PIN atualizado com sucesso. Podes entrar com o novo PIN.", "success");
      _pinBuffer = "";
      _updatePinDots();
    });
  };
}

function doLogout() {
  if (_inactivityTimer) { clearTimeout(_inactivityTimer); _inactivityTimer = null; }

  if (currentSession?.id) {
    db.get("sessions", currentSession.id).then(s => {
      if (s) { s.status = "closed"; s.closedAt = new Date().toISOString(); db.put("sessions", s); }
    }).catch(() => {});
  }

  currentUser = null;
  currentSession = null;
  _pinBuffer = "";
  _selectedUser = null;
  localStorage.removeItem("kontaki_session");

  const app = document.getElementById("app");
  const loginPage = document.getElementById("login-page");

  if (app) {
    app.style.animation = "logoutFadeOut .25s ease forwards";
    setTimeout(function() {
      app.style.display = "none";
      app.style.animation = "";
      _showLoginAnimated();
    }, 240);
  } else {
    _showLoginAnimated();
  }
}

function _showLoginAnimated() {
  const loginPage = document.getElementById("login-page");
  if (loginPage) {
    loginPage.style.display = "flex";
    loginPage.style.animation = "loginFadeIn .3s ease";
  }

  const stepRole = document.getElementById("login-step-role");
  const stepPin  = document.getElementById("login-step-pin");
  if (stepRole) stepRole.style.display = "flex";
  if (stepPin)  { stepPin.style.display = "none"; stepPin.classList.remove("active"); }

  _updatePinDots();
  _renderLoginUsers();
}

export function logout(automatic) {
  if (automatic) { doLogout(); return; }
  confirmDialog("Tens a certeza que queres terminar a sessão?", doLogout, {
    title: "Terminar sessão", confirmText: "Terminar sessão", icon: "log-out"
  });
}

export async function restoreSession() {
  try {
    const saved = localStorage.getItem("kontaki_session");
    if (!saved) return false;

    const data = JSON.parse(saved);
    const users = await db.getAll("users");
    const user = users.find(u => u.id === data.userId);
    if (!user) { localStorage.removeItem("kontaki_session"); return false; }

    const sessions = await db.getAll("sessions");
    const session = sessions.find(s => s.id === data.sessionId && s.status === "open" && s.uuid);
    if (!session) { localStorage.removeItem("kontaki_session"); return false; }

    currentUser = user;
    currentUser.sessionId = session.id;
    currentSession = session;
    _resetInactivityTimer();
    return true;
  } catch (e) {
    localStorage.removeItem("kontaki_session");
    return false;
  }
}

export async function changePasswordAuth(currentPassword, newPassword) {
  if (!currentUser) throw new Error("Nenhum usuário logado");

  const valid = await verifyPassword(currentPassword, currentUser.passwordHash);
  if (!valid) throw new Error("Senha atual incorreta");

  const newHash = await hashPassword(newPassword);
  currentUser.passwordHash = newHash;
  await db.put("users", currentUser);
  await _clearLoginAttempts(currentUser.id).catch(() => {});
}

export async function resetUserPin(targetUserId, newPin, adminPin) {
  if (!currentUser || currentUser.role !== "admin") {
    throw new Error("Apenas administradores podem repor o PIN de outro utilizador.");
  }
  const validAdmin = await verifyPassword(adminPin, currentUser.passwordHash);
  if (!validAdmin) throw new Error("PIN de administrador incorrecto.");
  if (!/^\d{6}$/.test(newPin)) throw new Error("O novo PIN deve ter exactamente 6 dígitos.");
  const target = await db.get("users", targetUserId);
  if (!target) throw new Error("Utilizador não encontrado.");
  if (target.id === currentUser.id) throw new Error("Usa 'Alterar Senha' para o teu próprio PIN.");
  const newHash = await hashPassword(newPin);
  await db.put("users", { ...target, passwordHash: newHash });
  await _clearLoginAttempts(targetUserId).catch(() => {});
}

export async function createUser(name, username, password, role) {
  if (!currentUser || currentUser.role !== "admin") {
    throw new Error("Apenas administradores podem criar usuários");
  }

  const users = await db.getAll("users");
  if (users.find(u => u.username === username)) {
    throw new Error("Nome de usuário já existe");
  }

  // V1: só admin único por loja (decisão de produto). createUser nunca cria
  // outro admin, independentemente do que for pedido — reforço de backend,
  // já que a UI (Equipa, Convidar) também não oferece essa opção.
  const activeCaixas = users.filter(u => u.role === "caixa" && u.active !== false);
  if (activeCaixas.length >= 2) {
    throw new Error("Limite de 2 operadores de caixa activos neste dispositivo. Desactiva um para criar outro.");
  }

  const passwordHash = await hashPassword(password);

  const newUser = {
    name,
    username,
    passwordHash,
    password: null,
    role: "caixa",
    active: true,
    avatar: name.charAt(0).toUpperCase(),
    createdAt: new Date().toISOString(),
  };

  const id = await db.add("users", newUser);
  return id;
}
