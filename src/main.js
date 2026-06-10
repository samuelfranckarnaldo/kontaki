import { seed }      from "./db.js";
import { initAuth }  from "./auth.js";
import { initModal } from "./modal.js";
import { logger }    from "./logger.js";

async function main() {
  await seed();
  initModal();
  initAuth();
  if (window.lucide) window.lucide.createIcons();
}

// Error Boundary global — nenhum erro deixa a tela branca
window.addEventListener("error", function(e) {
  logger.error(e.message, { stack: e.filename + ":" + e.lineno });
  showErrorBoundary(e.message, e.filename, e.lineno);
});

window.addEventListener("unhandledrejection", function(e) {
  const msg = (e.reason && e.reason.message) ? e.reason.message : String(e.reason);
  const stack = (e.reason && e.reason.stack) ? e.reason.stack : null;
  logger.error("Promise rejeitada: " + msg, { stack });
  showErrorBoundary(msg, null, null);
});

function showErrorBoundary(message, file, line) {
  console.error("ERROR BOUNDARY");
  console.error("MESSAGE:", message);
  console.error("FILE:", file);
  console.error("LINE:", line);

  if (document.getElementById("error-boundary")) return;

  const div = document.createElement("div");
  div.id = "error-boundary";
  div.style.cssText = [
    "position:fixed", "top:0", "left:0", "right:0", "bottom:0",
    "background:#fff", "z-index:9999", "display:flex",
    "flex-direction:column", "align-items:center", "justify-content:center",
    "padding:24px", "font-family:sans-serif"
  ].join(";");

  div.innerHTML =
    '<div style="width:64px;height:64px;background:#fee2e2;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:16px">' +
    '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2">' +
    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>' +
    '<line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>' +
    '<div style="font-size:18px;font-weight:700;color:#18181b;margin-bottom:8px">Algo correu mal</div>' +
    '<div style="font-size:13px;color:#71717a;text-align:center;margin-bottom:4px;max-width:300px">' +
    message + '</div>' +
    (file
      ? '<div style="font-size:11px;color:#a1a1aa;margin-bottom:20px">' + file + (line ? ":" + line : "") + "</div>"
      : '<div style="margin-bottom:20px"></div>') +
    '<button onclick="document.getElementById(\'error-boundary\').remove()" style="padding:12px 24px;background:#5b21b6;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:8px">Tentar novamente</button>' +
    '<button onclick="window.location.reload()" style="padding:10px 24px;background:#f4f4f5;color:#71717a;border:none;border-radius:10px;font-size:13px;cursor:pointer">Recarregar app</button>';

  document.body.appendChild(div);
}

// Selecção de role no login
var _selectedRole = null;

window._selectRole = function(role) {
  _selectedRole = role;

  var stepRole  = document.getElementById("login-step-role");
  var stepCreds = document.getElementById("login-step-creds");
  var badge     = document.getElementById("login-role-badge");
  var loginBtn  = document.getElementById("btn-login");

  if (stepRole) stepRole.style.display = "none";
  if (stepCreds) stepCreds.style.display = "flex";

  if (badge) {
    var isAdmin = role === "admin";

    badge.style.background = isAdmin ? "#ede9fe" : "#f0fdf4";
    badge.style.border = "1.5px solid " + (isAdmin ? "#ddd6fe" : "#bbf7d0");

    badge.innerHTML =
      '<div style="width:32px;height:32px;background:' + (isAdmin ? "#5b21b6" : "#16a34a") + ';border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
      '<i data-lucide="' + (isAdmin ? "shield-check" : "shopping-cart") + '" style="width:16px;height:16px;color:#fff"></i></div>' +
      '<div>' +
      '<div style="font-size:14px;font-weight:700;color:#18181b">' + (isAdmin ? "Administrador" : "Operador de Caixa") + '</div>' +
      '<div style="font-size:11px;color:' + (isAdmin ? "#7c3aed" : "#16a34a") + '">' +
      (isAdmin ? "Acesso total ao sistema" : "Vendas e operações de caixa") +
      '</div></div>';

    if (window.lucide) window.lucide.createIcons();
  }

  if (loginBtn) {
    loginBtn.style.background = role === "admin" ? "#5b21b6" : "#16a34a";
  }

  var inpUser = document.getElementById("inp-user");
  if (inpUser) inpUser.focus();
};

window._backToRole = function() {
  _selectedRole = null;

  var stepRole  = document.getElementById("login-step-role");
  var stepCreds = document.getElementById("login-step-creds");

  if (stepRole) stepRole.style.display = "flex";
  if (stepCreds) stepCreds.style.display = "none";
};

window._showTermos = function() {
  var overlay = document.createElement("div");

  overlay.style.cssText =
    "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:flex-end;padding:0";

  overlay.innerHTML =
    '<div style="background:#fff;border-radius:20px 20px 0 0;width:100%;max-height:80vh;overflow-y:auto;padding:24px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
    '<div style="font-size:17px;font-weight:700">Termos e Condições</div>' +
    '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="background:#f4f4f5;border:none;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px">×</button>' +
    '</div>' +
    '<div style="font-size:13px;color:#71717a;line-height:1.8">' +
    '<strong style="color:#18181b">1. Uso do Software</strong><br/>' +
    'O Kontaki é um software de gestão de negócios desenvolvido pela Introxeer Technology.' +
    '</div>' +
    '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="width:100%;padding:14px;background:#5b21b6;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:16px">Li e aceito</button>' +
    '</div>';

  document.body.appendChild(overlay);
};

window._showPrivacidade = function() {
  var overlay = document.createElement("div");

  overlay.style.cssText =
    "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:flex-end;padding:0";

  overlay.innerHTML =
    '<div style="background:#fff;border-radius:20px 20px 0 0;width:100%;max-height:80vh;overflow-y:auto;padding:24px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
    '<div style="font-size:17px;font-weight:700">Política de Privacidade</div>' +
    '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="background:#f4f4f5;border:none;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px">×</button>' +
    '</div>' +
    '<div style="font-size:13px;color:#71717a;line-height:1.8">' +
    'Todos os dados são armazenados localmente usando IndexedDB.' +
    '</div>' +
    '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="width:100%;padding:14px;background:#5b21b6;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:16px">Fechar</button>' +
    '</div>';

  document.body.appendChild(overlay);
};

main().catch(function(e) {
  logger.error("Erro fatal no arranque: " + e.message, e);
  showErrorBoundary(e.message, null, null);
});
