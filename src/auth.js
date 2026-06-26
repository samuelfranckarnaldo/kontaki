import { db } from "./db.js";
import { refreshIcons } from "./utils.js";
import { hashPassword, verifyPassword } from "./crypto.js";

let currentUser    = null;
let currentSession = null;
let _pinBuffer     = "";
let _selectedUser  = null;

export function getUser()    { return currentUser; }
export function getSession() { return currentSession; }
export function _setSession(s) { currentSession = s; if (currentUser) currentUser.sessionId = s ? s.id : null; }

export function initAuth() {
  const list = document.getElementById("login-users-list");
  const pin  = document.getElementById("login-pin-user");

  if (!list || !pin) {
    console.warn("Auth UI não pronta.");
    return;
  }

  _renderLoginUsers();
  _initPinKeypad();

  if (window.lucide) window.lucide.createIcons();

  const forgotBtn = document.getElementById("btn-forgot-pw");
  if (forgotBtn) forgotBtn.addEventListener("click", openForgotPassword);
}

async function _renderLoginUsers() {
  const users = await db.getAll("users");
  const store = await db.get("settings", "store");

  const storeName = document.getElementById("login-store-name");
  if (storeName && store) storeName.textContent = store.name || "Kontaki";

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
    const bg      = isAdmin ? "#ede9fe" : "#f0fdf4";
    const border  = isAdmin ? "#ddd6fe" : "#bbf7d0";
    const label   = isAdmin ? "Administrador" : "Operador de Caixa";

    const btn = document.createElement("button");
    btn.style.cssText = 
      "display:flex;align-items:center;gap:14px;padding:14px 16px;background:" + bg + 
      ";border:2px solid " + border + ";border-radius:14px;cursor:pointer;" +
      "font-family:inherit;text-align:left;width:100%;margin-bottom:8px;transition:all 0.2s";
    
    btn.innerHTML = 
      '<div style="width:48px;height:48px;background:' + color + 
      ';border-radius:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:20px;font-weight:700;color:#fff">' +
      (u.avatar || u.name.charAt(0).toUpperCase()) +
      '</div>' +
      '<div><div style="font-size:16px;font-weight:700;color:#18181b">' + u.name +
      '</div><div style="font-size:12px;color:' + color + ';margin-top:2px">' + label +
      '</div></div>';

    btn.onmouseenter = function() {
      this.style.transform = "translateY(-1px)";
      this.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
    };
    btn.onmouseleave = function() {
      this.style.transform = "translateY(0)";
      this.style.boxShadow = "none";
    };

    btn.onclick = () => _selectUserHandler(u.id);
    list.appendChild(btn);
  });

  if (window.lucide) window.lucide.createIcons();
}

async function _selectUserHandler(userId) {
  const users = await db.getAll("users");
  _selectedUser = users.find(u => u.id === userId);
  if (!_selectedUser) return;

  _pinBuffer = "";
  _updatePinDots();

  const stepRole = document.getElementById("login-step-role");
  const stepPin  = document.getElementById("login-step-pin");
  
  // Usa flex para compatibilidade com CSS
  if (stepRole) stepRole.style.display = "none";
  if (stepPin) {
    stepPin.style.display = "flex";
    stepPin.classList.add("active");
  }

  const pinUserEl = document.getElementById("login-pin-user");
  if (pinUserEl) {
    pinUserEl.innerHTML = 
      '<div style="width:40px;height:40px;background:#5b21b6;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#fff;flex-shrink:0">' +
      (_selectedUser.avatar || _selectedUser.name.charAt(0).toUpperCase()) +
      '</div>' +
      '<div style="font-size:15px;font-weight:600;color:#18181b">' + _selectedUser.name + '</div>';
  }

  const errEl = document.getElementById("login-err");
  if (errEl) errEl.classList.remove("show");
  
  if (window.lucide) window.lucide.createIcons();
}

window._selectUser = _selectUserHandler;

function _updatePinDots() {
  for (let i = 0; i < 6; i++) {
    const dot = document.getElementById("pdot-" + i);
    if (dot) {
      dot.classList.toggle("filled", i < _pinBuffer.length);
    }
  }
  const errEl = document.getElementById("login-err");
  if (errEl && _pinBuffer.length > 0) {
    errEl.classList.remove("show");
  }
}

// TECLADO PIN - Funções globais chamadas pelo HTML
window._pinKey = function(key) {
  if (key === '⌫' || key === 'del' || key === 'delete') {
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
  
  if (stepRole) stepRole.style.display = "flex";
  if (stepPin) {
    stepPin.style.display = "none";
    stepPin.classList.remove("active");
  }
  
  _updatePinDots();
};

async function _verifyPin() {
  if (!_selectedUser) return;
  
  try {
    const valid = await verifyPassword(_pinBuffer, _selectedUser.passwordHash);
    
    if (!valid) {
      const errEl = document.getElementById("login-err");
      const errMsg = document.getElementById("login-err-msg");
      if (errEl) errEl.classList.add("show");
      if (errMsg) errMsg.textContent = "PIN incorrecto";
      
      const dotsContainer = document.getElementById("pin-dots");
      if (dotsContainer) {
        dotsContainer.style.animation = "none";
        dotsContainer.offsetHeight;
        dotsContainer.style.animation = "shake 0.5s ease";
      }
      
      _pinBuffer = "";
      _updatePinDots();
      
      setTimeout(() => { if (errEl) errEl.classList.remove("show"); }, 2000);
      return;
    }
    
    // PIN CORRETO!
    currentUser = _selectedUser;
    
    const session = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      userId: currentUser.id,
      userName: currentUser.name,
      openedAt: new Date().toISOString(),
      status: "open",
      vendas: [],
      fiados: [],
      incidentes: [],
    };
    
    await db.add("sessions", session);
    currentSession = session;
    currentUser.sessionId = session.id;
    
    localStorage.setItem("kontaki_session", JSON.stringify({
      userId: currentUser.id,
      sessionId: session.id
    }));
    
    // Transição
    const loginPage = document.getElementById("login-page");
    const app = document.getElementById("app");
    
    if (loginPage) loginPage.style.display = "none";
    if (app) app.style.display = "flex";
    
    // Inicializa o router
    if (window.router) {
      setTimeout(() => window.router.init(), 100);
    }
    
    // Carrega dashboard
    import("./components/dashboard.js").then(m => {
      if (m.loadDashboard) m.loadDashboard();
    }).catch(() => {});
    
    if (window.lucide) window.lucide.createIcons();
    
  } catch (err) {
    console.error("Erro PIN:", err);
    _pinBuffer = "";
    _updatePinDots();
  }
}

function openForgotPassword() {
  alert("Para recuperar o PIN, contacta o administrador.");
}

export function logout() {
  if (!confirm("Terminar sessão?")) return;

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
  
  if (app) app.style.display = "none";
  if (loginPage) loginPage.style.display = "flex";
  
  const stepRole = document.getElementById("login-step-role");
  const stepPin  = document.getElementById("login-step-pin");
  if (stepRole) stepRole.style.display = "flex";
  if (stepPin)  { stepPin.style.display = "none"; stepPin.classList.remove("active"); }
  
  _updatePinDots();
  _renderLoginUsers();
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
    const session = sessions.find(s => s.id === data.sessionId && s.status === "open");
    if (!session) { localStorage.removeItem("kontaki_session"); return false; }
    
    currentUser = user;
    currentUser.sessionId = session.id;
    currentSession = session;
    return true;
  } catch (e) {
    localStorage.removeItem("kontaki_session");
    return false;
  }
}

// ============ FUNÇÕES PARA PERFIL.JS ============

export async function changePasswordAuth(currentPassword, newPassword) {
  if (!currentUser) throw new Error("Nenhum usuário logado");
  
  const valid = await verifyPassword(currentPassword, currentUser.passwordHash);
  if (!valid) throw new Error("Senha atual incorreta");
  
  const newHash = await hashPassword(newPassword);
  currentUser.passwordHash = newHash;
  await db.put("users", currentUser);
}

export async function createUser(name, username, password, role) {
  if (!currentUser || currentUser.role !== "admin") {
    throw new Error("Apenas administradores podem criar usuários");
  }
  
  const users = await db.getAll("users");
  if (users.find(u => u.username === username)) {
    throw new Error("Nome de usuário já existe");
  }
  
  const passwordHash = await hashPassword(password);
  
  const newUser = {
    name,
    username,
    passwordHash,
    password: null,
    role: role || "caixa",
    active: true,
    avatar: name.charAt(0).toUpperCase(),
    createdAt: new Date().toISOString(),
  };
  
  const id = await db.add("users", newUser);
  return id;
}
