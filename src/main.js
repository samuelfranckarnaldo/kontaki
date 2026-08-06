import { loadLicense } from "./license.js";
import { seed, db } from "./db.js";
import { seedChartOfAccounts } from "./pgc.js";
import { checkSetup } from "./setup.js";
import { showOnboarding } from "./onboarding.js";
import { initAuth, restoreSession } from "./auth.js";
import { initModal } from "./modal.js";
import { logger } from "./logger.js";
import { router } from "./router.js";
import { initMessagesOnBoot } from "./message-ui.js";
import { migrateProductCatalogIds } from "./services.js";

function hideBootSpinner() {
  var el = document.getElementById("boot-spinner-overlay");
  if (el) el.remove();
}

// Le e consome a flag imediatamente — nunca deve sobreviver para um arranque
// futuro, seja qual for o caminho (onboarding, login, sessao restaurada).
function consumeBootMessageFlag() {
  try {
    var flag = sessionStorage.getItem("kontaki_boot_msg");
    sessionStorage.removeItem("kontaki_boot_msg");
    return flag;
  } catch (e) {
    return null;
  }
}

// So aplica a mensagem especial no ramo pos-onboarding (login/sessao
// restaurada) — nunca antes do onboarding, mesmo que a flag exista.
function applyBootSpinnerMessage(flag) {
  if (flag !== "criando_conta") return;
  var msgEl = document.getElementById("boot-spinner-msg");
  if (msgEl) msgEl.textContent = "Só mais um segundo, estamos a criar a tua conta.";
}

// Expõe o router globalmente
window.router = router;

// Bloqueia zoom por duplo-toque (o meta viewport user-scalable=no
// nao cobre isto de forma confiavel em todos os Android/Chrome).
// Esconde o navbar/barra de total quando o teclado virtual está aberto —
// em Android/WebView não há forma fiável de "encolher" o layout para caber
// no espaço livre acima do teclado (100dvh nem sempre reflete isso), então
// em vez de tentar mantê-los ancorados corretamente, simplesmente somem
// enquanto o teclado estiver visível (de qualquer forma ficariam cobertos
// por ele). Aplica-se a toda a app, não só ao ecrã de Vender.
(function detectVirtualKeyboard() {
  if (!window.visualViewport) return;
  var initialHeight = window.visualViewport.height;
  var threshold = 150; // px de redução considerados "teclado aberto"

  function syncAppHeight() {
    // #app usa esta variável em vez de confiar só em vh/dvh — no Android
    // o "layout viewport" muitas vezes não encolhe com o teclado (só o
    // "visual viewport" encolhe), o que deixava uma faixa do fundo do app
    // visível por baixo do conteúdo quando escondíamos o navbar.
    document.documentElement.style.setProperty("--app-vh", window.visualViewport.height + "px");
  }

  function onViewportResize() {
    var shrink = initialHeight - window.visualViewport.height;
    document.body.classList.toggle("keyboard-open", shrink > threshold);
    syncAppHeight();
    if (!document.body.classList.contains("keyboard-open")) {
      initialHeight = window.visualViewport.height;
    }
  }

  syncAppHeight();
  window.visualViewport.addEventListener("resize", onViewportResize);
})();

(function preventDoubleTapZoom() {
  var lastTouchEnd = 0;
  document.addEventListener("touchend", function (e) {
    var now = Date.now();
    if (now - lastTouchEnd <= 350) {
      e.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });
})();

async function boot() {
  var _bootMsgFlag = consumeBootMessageFlag();
  await seed();
  await seedChartOfAccounts();
  initModal();
  await loadLicense();

  await migrateProductCatalogIds().catch(function(e) {
    logger.error("[migration] falha ao migrar catalogId de produtos", e);
  });

  import("./sync.js").then(function(m) {
    return m.runFullSyncCycle();
  }).catch(function() {});

  const users = await db.getAll("users");

  const hasUsers = users && users.length > 0;

  if (!hasUsers) {
    // Nunca aplica a mensagem de "criando a tua conta" antes do onboarding —
    // mesmo que a flag exista (ex: reset de dados apos criar conta antes).
    hideBootSpinner();
    await showOnboarding();
    return;
  }

  applyBootSpinnerMessage(_bootMsgFlag);

  // Aguarda o DOM estar pronto
  if (document.readyState === "loading") {
    await new Promise(resolve => {
      document.addEventListener("DOMContentLoaded", resolve);
    });
  }

  const restored = await restoreSession().catch(() => false);
  if (restored) {
    hideBootSpinner();
    document.getElementById("login-page").style.display = "none";
    document.getElementById("app").style.display = "flex";
    if (window.router) setTimeout(() => window.router.init(), 100);

    // Licença já revogada localmente (offline desde o arranque) — não
    // carrega o dashboard, mesmo com sessão restaurada. Sem isto, o
    // router.go() nunca corre neste caminho (router.init() só liga
    // listeners de clique) e o lockout ficava por disparar até o
    // utilizador navegar manualmente.
    const { getLicense, showRevokedLockout, showLicenseReplacedScreen } = await import("./license.js");
    var _licStatus = getLicense().status;
    if (_licStatus === "revoked") {
      showRevokedLockout();
      if (window.lucide) window.lucide.createIcons();
      return;
    }
    if (_licStatus === "replaced") {
      showLicenseReplacedScreen();
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    import("./components/dashboard.js").then(m => {
      if (m.loadDashboard) m.loadDashboard();
    }).catch(() => {});
    if (window.lucide) window.lucide.createIcons();
    initMessagesOnBoot().catch(() => {});
    return;
  }

  const login = document.getElementById("login-users-list");

  if (!login) {
    console.error("Login UI não existe no DOM. Abortando auth.");
    hideBootSpinner();
    return;
  }

  // Garante que a tela de login está visível
  hideBootSpinner();
  document.getElementById("login-page").style.display = "flex";
  document.getElementById("app").style.display = "none";

  // Mostra step 1 (perfis) e esconde step 2 (PIN)
  var stepRole = document.getElementById("login-step-role");
  var stepPin  = document.getElementById("login-step-pin");
  if (stepRole) stepRole.style.display = "flex";
  if (stepPin)  stepPin.style.display  = "none";

  initAuth();

  if (window.lucide) window.lucide.createIcons();
}

boot().catch(e => {
  hideBootSpinner();
  try { logger.error(e.message, e); } catch {}
  console.error(e);
});
