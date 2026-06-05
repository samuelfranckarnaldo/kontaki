import { db } from "./db.js";
import { refreshIcons } from "./utils.js";

let currentUser    = null;
let currentSession = null;
let loginAttempts  = 0;
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutos
let lockoutUntil   = null;

export function getUser()    { return currentUser; }
export function getSession() { return currentSession; }

// Função para hash simples (considera usar bcrypt em produção)
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Função para comparar senhas
async function comparePassword(inputPassword, storedHash) {
  const inputHash = await hashPassword(inputPassword);
  return inputHash === storedHash;
}

export function initAuth() {
  const app   = document.getElementById("app");
  const login = document.getElementById("login-page");
  const inp   = document.getElementById("inp-user");
  const pass  = document.getElementById("inp-pass");
  const btn   = document.getElementById("btn-login");
  const err   = document.getElementById("login-err");
  const eyeToggle = document.getElementById("pw-toggle");
  const eyeIcon   = document.getElementById("pw-eye");

  if (eyeToggle) {
    eyeToggle.addEventListener("click", () => {
      const t = pass.type === "password" ? "text" : "password";
      pass.type = t;
      if (eyeIcon) {
        eyeIcon.setAttribute("data-lucide", t === "text" ? "eye-off" : "eye");
      }
      refreshIcons(eyeToggle);
    });
  }

  async function doLogin() {
    try {
      // Verifica se está em lockout
      if (lockoutUntil && Date.now() < lockoutUntil) {
        const minutos = Math.ceil((lockoutUntil - Date.now()) / 1000 / 60);
        showErr(`Muitas tentativas. Tenta novamente em ${minutos} minutos.`);
        return;
      }

      const u = inp.value.trim();
      const p = pass.value;
      
      if (!u || !p) { 
        showErr("Preenche todos os campos."); 
        return; 
      }

      const users = await db.getAll("users");
      const user  = users.find(x => x.username === u && x.active !== false);
      
      if (!user) { 
        handleFailedLogin("Utilizador ou senha incorrectos.");
        return; 
      }

      // Compara senha com hash
      const passwordMatch = await comparePassword(p, user.password);
      if (!passwordMatch) {
        handleFailedLogin("Utilizador ou senha incorrectos.");
        return;
      }

      // Reset de tentativas após login bem-sucedido
      loginAttempts = 0;
      lockoutUntil = null;

      currentUser = { ...user, sessionId: null };
      err.style.display = "none";

      // Verifica turno aberto
      const sessions    = await db.getAll("sessions");
      const openSession = sessions.find(s => s.status === "open" && s.userId === user.id);

      if (openSession) {
        currentSession        = openSession;
        currentUser.sessionId = openSession.id;
      } else {
        // Cria novo turno automaticamente
        const lastClosed = sessions
          .filter(s => s.status === "closed")
          .sort((a, b) => b.id - a.id)[0];
        
        const products = await db.getAll("products");
        const activeProducts = products.filter(x => x.active);

        const stockRecebido = {};
        activeProducts.forEach(p => {
          stockRecebido[p.id] = {
            productId: p.id,
            productName: p.name,
            expected: p.stock,
            found: p.stock,
            unit: p.unit,
          };
        });

        const sessionData = {
          userId:        user.id,
          userName:      user.name,
          openedAt:      new Date().toISOString(),
          status:        "open",
          prevSessionId: (lastClosed && lastClosed.id) || null,
          stockRecebido,
          vendas:        [],
          fiados:        [],
          incidentes:    [],
          stockEsperado: {},
        };

        const sessionId = await db.add("sessions", sessionData);

        currentSession = {
          id:            sessionId,
          userId:        user.id,
          userName:      user.name,
          openedAt:      new Date().toISOString(),
          status:        "open",
          prevSessionId: (lastClosed && lastClosed.id) || null,
          stockRecebido,
          vendas:        [],
          fiados:        [],
          incidentes:    [],
          stockEsperado: {},
        };
        currentUser.sessionId = sessionId;
      }

      login.style.display = "none";
      app.style.display   = "flex";
      refreshIcons(app);
      import("./router.js").then(m => m.router.init());
    } catch (error) {
      console.error("Erro no login:", error);
      showErr("Erro ao fazer login. Tenta novamente.");
    }
  }

  function handleFailedLogin(message) {
    loginAttempts++;
    if (loginAttempts >= MAX_ATTEMPTS) {
      lockoutUntil = Date.now() + LOCKOUT_TIME;
      showErr(`Muitas tentativas. Conta bloqueada por 15 minutos.`);
    } else {
      const tentativas = MAX_ATTEMPTS - loginAttempts;
      showErr(`${message} (${tentativas} tentativas restantes)`);
    }
  }

  btn.addEventListener("click", doLogin);
  inp.addEventListener("keydown", e => { if (e.key === "Enter") pass.focus(); });
  pass.addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });

  function showErr(msg) {
    const errMsg = document.getElementById("login-err-msg");
    if (errMsg) {
      errMsg.textContent = msg;
    }
    err.style.display = "flex";
  }

  refreshIcons(document.getElementById("login-page"));
}

export function logout() {
  if (!confirm("Tens a certeza que queres terminar a sessão?")) return;
  
  try {
    currentUser    = null;
    currentSession = null;
    loginAttempts  = 0;
    lockoutUntil   = null;
    
    const app   = document.getElementById("app");
    const login = document.getElementById("login-page");
    if (app)   app.style.display   = "none";
    if (login) login.style.display = "flex";
    
    const inputUser = document.getElementById("inp-user");
    const inputPass = document.getElementById("inp-pass");
    if (inputUser) inputUser.value = "";
    if (inputPass) inputPass.value = "";
  } catch (error) {
    console.error("Erro ao fazer logout:", error);
  }
}
