import { loadLicense } from "./license.js";
import { seed, db } from "./db.js";
import { checkSetup } from "./setup.js";
import { showOnboarding } from "./onboarding.js";
import { initAuth } from "./auth.js";
import { initModal } from "./modal.js";
import { logger } from "./logger.js";
import { router } from "./router.js";

// Expõe o router globalmente
window.router = router;

async function boot() {
  await seed();
  initModal();
  await loadLicense();

  const users = await db.getAll("users");

  const hasUsers = users && users.length > 0;

  if (!hasUsers) {
    await showOnboarding();
    return;
  }

  // Aguarda o DOM estar pronto
  if (document.readyState === "loading") {
    await new Promise(resolve => {
      document.addEventListener("DOMContentLoaded", resolve);
    });
  }

  const login = document.getElementById("login-users-list");

  if (!login) {
    console.error("Login UI não existe no DOM. Abortando auth.");
    return;
  }

  // Garante que a tela de login está visível
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
  try { logger.error(e.message, e); } catch {}
  console.error(e);
});
