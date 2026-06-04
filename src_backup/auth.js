import { db } from "./db.js";
import { refreshIcons } from "./utils.js";

let currentUser    = null;
let currentSession = null;

export function getUser()    { return currentUser; }
export function getSession() { return currentSession; }

export function initAuth() {
  const app   = document.getElementById("app");
  const login = document.getElementById("login-page");
  const inp   = document.getElementById("inp-user");
  const pass  = document.getElementById("inp-pass");
  const btn   = document.getElementById("btn-login");
  const err   = document.getElementById("login-err");
  const eye   = document.getElementById("pw-toggle");

  if (eye) eye.addEventListener("click", () => {
    const t = pass.type === "password" ? "text" : "password";
    pass.type = t;
    document.getElementById("pw-eye").setAttribute("data-lucide", t==="text"?"eye-off":"eye");
    refreshIcons(eye);
  });

  async function doLogin() {
    const u = inp.value.trim();
    const p = pass.value;
    if (!u || !p) { showErr("Preenche todos os campos."); return; }

    const users = await db.getAll("users");
    const user  = users.find(x => x.username===u && x.password===p && x.active!==false);
    if (!user) { showErr("Utilizador ou senha incorrectos."); return; }

    currentUser = { ...user, sessionId: null };
    err.style.display = "none";

    // Verifica turno aberto
    const sessions    = await db.getAll("sessions");
    const openSession = sessions.find(s => s.status==="open" && s.userId===user.id);

    if (openSession) {
      currentSession          = openSession;
      currentUser.sessionId   = openSession.id;
    } else {
      // Cria novo turno automaticamente
      const lastClosed = sessions.filter(s=>s.status==="closed").sort((a,b)=>b.id-a.id)[0];
      const products   = await db.getAll("products").then(p=>p.filter(x=>x.active));

      const stockRecebido = {};
      products.forEach(p => {
        stockRecebido[p.id] = {
          productId: p.id, productName: p.name,
          expected: p.stock, found: p.stock, unit: p.unit,
        };
      });

      const sessionId = await db.add("sessions", {
        userId:        user.id,
        userName:      user.name,
        openedAt:      new Date().toISOString(),
        status:        "open",
        prevSessionId: (lastClosed&&lastClosed.id) || null,
        stockRecebido,
        vendas:        [],
        fiados:        [],
        incidentes:    [],
        stockEsperado: {},
      });

      currentSession        = { id:sessionId, userId:user.id, openedAt:new Date().toISOString(), status:"open", prevSessionId:(lastClosed&&lastClosed.id)||null, stockRecebido };
      currentUser.sessionId = sessionId;
    }

    login.style.display = "none";
    app.style.display   = "flex";
    refreshIcons(app);
    import("./router.js").then(m => m.router.init());
  }

  btn.addEventListener("click", doLogin);
  inp.addEventListener("keydown", e => { if (e.key==="Enter") pass.focus(); });
  pass.addEventListener("keydown", e => { if (e.key==="Enter") doLogin(); });

  function showErr(msg) {
    document.getElementById("login-err-msg").textContent = msg;
    err.style.display = "flex";
  }

  refreshIcons(document.getElementById("login-page"));
}

export function logout() {
  if (!confirm("Tens a certeza que queres terminar a sessão?")) return;
  currentUser    = null;
  currentSession = null;
  const app   = document.getElementById("app");
  const login = document.getElementById("login-page");
  if (app)   app.style.display   = "none";
  if (login) login.style.display = "flex";
  document.getElementById("inp-user").value = "";
  document.getElementById("inp-pass").value = "";
}
