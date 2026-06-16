import { db }                        from "./db.js";
import { refreshIcons }              from "./utils.js";
import { hashPassword, verifyPassword, generateRecoveryCode, generateResetToken } from "./crypto.js";

let currentUser    = null;
let currentSession = null;
let _pinBuffer     = "";
let _selectedUser  = null;

export function getUser()    { return currentUser; }
export function getSession() { return currentSession; }
export function _setSession(s) { currentSession = s; if (currentUser) currentUser.sessionId = s ? s.id : null; }

export function initAuth() {
  _renderLoginUsers();
  _initPinKeypad();

  var forgotBtn = document.getElementById("btn-forgot-pw");
  if (forgotBtn) forgotBtn.addEventListener("click", openForgotPassword);
}

async function _renderLoginUsers() {
  var users = await db.getAll("users");
  var store = await db.get("settings","store");
  var storeName = document.getElementById("login-store-name");
  if (storeName && store) storeName.textContent = store.name || "Kontaki";

  var list  = document.getElementById("login-users-list");
  if (!list) return;

  var active = users.filter(function(u){ return u.active !== false; });

  list.innerHTML = active.map(function(u) {
    var isAdmin = u.role === "admin";
    var color   = isAdmin ? "#5b21b6" : "#16a34a";
    var bg      = isAdmin ? "#ede9fe" : "#f0fdf4";
    var border  = isAdmin ? "#ddd6fe" : "#bbf7d0";
    var roleLabel = isAdmin ? "Administrador" : "Operador de Caixa";
    return '<button onclick="window._selectUser(' + u.id + ')" ' +
      'style="display:flex;align-items:center;gap:14px;padding:14px 16px;background:' + bg + ';' +
      'border:2px solid ' + border + ';border-radius:14px;cursor:pointer;font-family:inherit;text-align:left;width:100%">' +
      '<div style="width:48px;height:48px;background:' + color + ';border-radius:14px;' +
      'display:flex;align-items:center;justify-content:center;flex-shrink:0;' +
      'font-size:20px;font-weight:700;color:#fff">' + (u.avatar||u.name.charAt(0).toUpperCase()) + '</div>' +
      '<div><div style="font-size:16px;font-weight:700;color:#18181b">' + u.name + '</div>' +
      '<div style="font-size:12px;color:' + color + ';margin-top:2px">' + roleLabel + '</div></div>' +
      '</button>';
  }).join("");
}

window._selectUser = async function(userId) {
  var users = await db.getAll("users");
  _selectedUser = users.find(function(u){ return u.id === userId; });
  if (!_selectedUser) return;

  _pinBuffer = "";
  _updatePinDots();

  var badge = document.getElementById("login-pin-user");
  if (badge) {
    var isAdmin = _selectedUser.role === "admin";
    var color   = isAdmin ? "#5b21b6" : "#16a34a";
    var bg      = isAdmin ? "#ede9fe" : "#f0fdf4";
    badge.style.cssText = "display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;margin-bottom:16px;background:" + bg;
    badge.innerHTML =
      '<div style="width:40px;height:40px;background:' + color + ';border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#fff">' +
      (_selectedUser.avatar||_selectedUser.name.charAt(0).toUpperCase()) + '</div>' +
      '<div><div style="font-size:15px;font-weight:700;color:#18181b">' + _selectedUser.name + '</div>' +
      '<div style="font-size:12px;color:' + color + '">' + (isAdmin?"Administrador":"Operador de Caixa") + '</div></div>';
  }

  var stepRole = document.getElementById("login-step-role");
  var stepPin  = document.getElementById("login-step-pin");
  if (stepRole) stepRole.style.display = "none";
  if (stepPin)  { stepPin.style.display = "flex"; stepPin.style.flexDirection = "column"; }

  var err = document.getElementById("login-err");
  if (err) err.style.display = "none";
};

window._backToRole = function() {
  _selectedUser = null;
  _pinBuffer    = "";
  _updatePinDots();
  var stepRole = document.getElementById("login-step-role");
  var stepPin  = document.getElementById("login-step-pin");
  if (stepRole) stepRole.style.display = "flex";
  if (stepPin)  stepPin.style.display  = "none";
};

function _initPinKeypad() {
  window._pinKey = function(key) {
    var err = document.getElementById("login-err");
    if (err) err.style.display = "none";

    if (key === "⌫") {
      _pinBuffer = _pinBuffer.slice(0,-1);
      _updatePinDots();
      return;
    }
    if (_pinBuffer.length >= 6) return;
    _pinBuffer += key;
    _updatePinDots();

    if (_pinBuffer.length === 6) {
      setTimeout(_tryLogin, 150);
    }
  };
}

function _updatePinDots() {
  for (var i=0; i<6; i++) {
    var dot = document.getElementById("pdot-"+i);
    if (!dot) continue;
    dot.classList.remove("filled","error");
    if (i < _pinBuffer.length) dot.classList.add("filled");
    dot.textContent = i < _pinBuffer.length ? "●" : "";
  }
}

function _shakePin() {
  for (var i=0; i<6; i++) {
    var dot = document.getElementById("pdot-"+i);
    if (dot) { dot.classList.add("error"); dot.textContent = "●"; }
  }
  setTimeout(function(){
    _pinBuffer = "";
    _updatePinDots();
  }, 400);
}

async function _tryLogin() {
  if (!_selectedUser) return;

  var valid = false;
  if (_selectedUser.passwordHash) {
    valid = await verifyPassword(_pinBuffer, _selectedUser.passwordHash);
  } else if (_selectedUser.password) {
    valid = _selectedUser.password === _pinBuffer;
    if (valid) {
      var newHash = await hashPassword(_pinBuffer);
      await db.put("users", Object.assign({}, _selectedUser, { passwordHash:newHash, password:null }));
    }
  }

  if (!valid) {
    _shakePin();
    var err = document.getElementById("login-err");
    var msg = document.getElementById("login-err-msg");
    if (msg) msg.textContent = "PIN incorrecto. Tenta novamente.";
    if (err) err.style.display = "block";
    return;
  }

  currentUser = Object.assign({}, _selectedUser, { sessionId:null });

  var sessions    = await db.getAll("sessions");
  var openSession = sessions.find(function(s){ return s.status==="open" && s.userId===_selectedUser.id; });

  if (openSession) {
    currentSession        = openSession;
    currentUser.sessionId = openSession.id;
  } else {
    var lastClosed = sessions.filter(function(s){ return s.status==="closed"||s.status==="validated"; })
      .sort(function(a,b){ return b.id-a.id; })[0];

    var products = await db.getAll("products");
    products = products.filter(function(x){ return x.active; });
    var stockRecebido = {};
    products.forEach(function(p){
      stockRecebido[p.id] = { productId:p.id, productName:p.name, expected:p.stock||0, found:p.stock||0, unit:p.unit };
    });

    var uuid = generateUUID();
    var sessionId = await db.add("sessions", {
      uuid:            uuid,
      userId:          _selectedUser.id,
      userName:        _selectedUser.name,
      status:          "open",
      openedAt:        new Date().toISOString(),
      closedAt:        null,
      prevSessionUuid: lastClosed ? (lastClosed.uuid||null) : null,
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

  var login = document.getElementById("login-page");
  var app   = document.getElementById("app");
  if (login) login.style.display = "none";
  if (app)   app.style.display   = "flex";

  if (window.lucide) window.lucide.createIcons();
  import("./router.js").then(function(m){ m.router.init(); });
}

function generateUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  var b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6]=(b[6]&0x0f)|0x40; b[8]=(b[8]&0x3f)|0x80;
  var h=Array.from(b).map(function(x){return x.toString(16).padStart(2,"0");}).join("");
  return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20);
}

export function logout() {
  if (!confirm("Tens a certeza que queres terminar a sessão?")) return;
  currentUser    = null;
  currentSession = null;
  _selectedUser  = null;
  _pinBuffer     = "";

  var app    = document.getElementById("app");
  var login  = document.getElementById("login-page");
  var screen = document.getElementById("logout-screen");

  if (app) app.style.display = "none";

  if (screen) {
    screen.style.display = "flex";
    if (window.lucide) window.lucide.createIcons();
    var bar = document.getElementById("logout-progress");
    if (bar) setTimeout(function(){ bar.style.width = "100%"; }, 100);
    setTimeout(function(){
      screen.style.display = "none";
      _pinBuffer = "";
      _updatePinDots();
      _renderLoginUsers();
      window._backToRole();
      if (login) login.style.display = "flex";
    }, 1800);
  } else {
    if (login) login.style.display = "flex";
    _renderLoginUsers();
    window._backToRole();
  }
}

export async function changePasswordAuth(currentPin, newPin) {
  var user = await db.get("users", currentUser.id);
  var valid = false;
  if (user.passwordHash) valid = await verifyPassword(currentPin, user.passwordHash);
  else valid = user.password === currentPin;
  if (!valid) throw new Error("PIN actual incorrecto.");
  if (newPin.length !== 6 || isNaN(newPin)) throw new Error("O novo PIN deve ter 6 dígitos numéricos.");
  var newHash = await hashPassword(newPin);
  await db.put("users", Object.assign({}, user, { passwordHash:newHash, password:null, updatedAt:new Date().toISOString() }));
}

export async function createUser(name, username, password, role) {
  var users = await db.getAll("users");
  if (users.find(function(u){ return u.username===username; })) throw new Error("Username já existe.");
  var passwordHash = await hashPassword(password);
  return db.add("users", {
    name, username, passwordHash, password:null,
    role, active:true,
    avatar: name.charAt(0).toUpperCase(),
    createdAt: new Date().toISOString(),
  });
}

async function openForgotPassword() {
  var users  = await db.getAll("users");
  var admins = users.filter(function(u){ return u.role==="admin"&&u.active!==false; });
  if (!admins.length) { alert("Nenhum administrador encontrado."); return; }

  var code      = generateRecoveryCode();
  var token     = await generateResetToken(admins[0].id, code);
  var expiresAt = new Date(Date.now()+24*60*60*1000).toISOString();

  await db.put("settings",{ key:"resetRequest", userId:admins[0].id, code, token, expiresAt, used:false, createdAt:new Date().toISOString() });

  var overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:400;display:flex;align-items:center;justify-content:center;padding:20px";
  overlay.innerHTML =
    '<div style="background:#fff;border-radius:16px;padding:24px;width:100%;max-width:340px">' +
    '<div style="font-size:17px;font-weight:700;margin-bottom:8px">Recuperar PIN</div>' +
    '<div style="font-size:13px;color:#71717a;margin-bottom:16px;line-height:1.5">Envia este código ao suporte da Introxeer Technology por WhatsApp.</div>' +
    '<div style="background:#ede9fe;border-radius:12px;padding:16px;text-align:center;margin-bottom:16px">' +
    '<div style="font-size:11px;color:#5b21b6;font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Código de recuperação</div>' +
    '<div style="font-size:28px;font-weight:700;color:#5b21b6;letter-spacing:6px">' + code + '</div>' +
    '<div style="font-size:11px;color:#7c3aed;margin-top:6px">Válido por 24 horas</div></div>' +
    '<div style="display:flex;flex-direction:column;gap:8px">' +
    '<button onclick="window._shareRecoveryCode(\'' + code + '\')" style="padding:13px;background:#25D366;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">Enviar por WhatsApp</button>' +
    '<button onclick="this.parentNode.parentNode.parentNode.remove()" style="padding:10px;background:none;border:none;color:#71717a;font-size:13px;cursor:pointer;font-family:inherit">Cancelar</button>' +
    '</div></div>';
  document.body.appendChild(overlay);

  window._shareRecoveryCode = function(c) {
    var msg = "Kontaki - Recuperação de PIN\n\nCódigo: " + c;
    if (navigator.share) { navigator.share({ title:"Kontaki Recovery", text:msg }); }
    else { window.open("https://wa.me/244900000000?text="+encodeURIComponent(msg),"_blank"); }
  };
}
