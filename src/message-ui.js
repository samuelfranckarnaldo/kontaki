// UI para mensagens do Console com display_mode = "modal" ou "blocking".
// Isolado de notification-ui.js de propósito: estas mensagens não fazem
// parte do centro de notificações, aparecem por cima de tudo, no arranque,
// antes do utilizador poder navegar.
import { evaluateMessages, syncConsoleMessages, dismissMessage } from "./messages.js";
import { refreshIcons } from "./utils.js";

function severityColor(sev) {
  if (sev === "danger") return "var(--danger)";
  if (sev === "warning") return "var(--warning)";
  return "var(--info)";
}

function severityIcon(sev) {
  if (sev === "danger") return "alert-circle";
  if (sev === "warning") return "alert-triangle";
  return "info";
}

function actionLabel(m) {
  if (m.type === "update") return "Atualizar agora";
  if (m.action_type === "download") return "Transferir";
  if (m.action_type === "url") return "Saber mais";
  if (m.action_type === "page") return "Ver";
  return "Entendido";
}

function runAction(m) {
  if (m.action_type === "url" || m.action_type === "download") {
    window.open(m.action_value, "_blank", "noopener");
    return;
  }
  if (m.action_type === "page" && m.action_value && window.router) {
    window.router.go(m.action_value);
  }
}

function reducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Diagrama de sincronização em miniatura — o mesmo motivo do site da
// Introxeer, adaptado ao cartão. SVG nativo com <animate>, sem
// depender de keyframes CSS que não existem no stylesheet do Kontaki.
function syncIllustrationSVG() {
  var anim = reducedMotion() ? "" :
    '<animate attributeName="stroke-dashoffset" from="0" to="-24" dur="1.6s" repeatCount="indefinite"/>';
  var pulseAnim = reducedMotion() ? "" :
    '<animate attributeName="r" values="4;15;4" dur="2s" repeatCount="indefinite"/>' +
    '<animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite"/>';

  return (
    '<svg viewBox="0 0 220 110" width="100%" height="88" style="display:block;margin:0 auto" aria-hidden="true">' +
      '<line x1="34" y1="82" x2="176" y2="30" stroke="#C4B5FD" stroke-width="2" stroke-dasharray="5 7" fill="none">' + anim + '</line>' +
      '<rect x="14" y="62" width="46" height="40" rx="10" fill="#fff" stroke="#E7E2F3" stroke-width="1.5"/>' +
      '<rect x="28" y="72" width="18" height="20" rx="3" fill="none" stroke="#1A1425" stroke-width="1.4"/>' +
      '<rect x="160" y="10" width="46" height="40" rx="10" fill="#fff" stroke="#E7E2F3" stroke-width="1.5"/>' +
      '<path d="M172 34c-4 0-7-3-7-6.5 0-3 2-5.5 5-6.5.5-4.5 4.5-8 9-8 4 0 7.5 2.5 8.5 6.5 3.5.5 6 3.5 6 7 0 4-3 7.5-7 7.5z" fill="none" stroke="#1A1425" stroke-width="1.4"/>' +
      '<circle cx="105" cy="56" r="4" fill="#6D28D9"/>' +
      '<circle cx="105" cy="56" r="4" fill="none" stroke="#A78BFA" stroke-width="1.2">' + pulseAnim + '</circle>' +
    '</svg>'
  );
}

function cardHtml(m, opts) {
  var color = severityColor(m.severity);
  var hasAction = m.action_type && m.action_type !== "none" && m.action_value;
  return (
    '<div style="padding:4px 0 10px">' + syncIllustrationSVG() + '</div>' +
    '<div style="display:flex;justify-content:center;margin-bottom:16px">' +
      '<span style="display:inline-flex;align-items:center;gap:6px;font-family:ui-monospace,\'SFMono-Regular\',monospace;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;color:#6D28D9;background:#F6F4FD;border:1px solid #EDE9FB;padding:5px 12px 5px 10px;border-radius:999px">' +
        '<span style="width:6px;height:6px;border-radius:50%;background:' + color + ';flex-shrink:0"></span>Introxeer' +
      '</span>' +
    '</div>' +
    '<div style="font-size:19px;font-weight:800;color:var(--text);margin-bottom:10px;text-align:center;letter-spacing:-0.01em">' + (m.title || "Aviso") + '</div>' +
    '<div style="font-size:14px;color:var(--text3);line-height:1.6;margin-bottom:28px;text-align:center">' + m.body + '</div>' +
    '<div style="display:flex;flex-direction:column;gap:10px">' +
      (hasAction ? '<button id="msg-action-btn" style="background:' + color + ';color:#fff;border:none;border-radius:14px;padding:15px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit">' + actionLabel(m) + '</button>' : '') +
      (opts.dismissible ? '<button id="msg-dismiss-btn" style="background:transparent;color:var(--text3);border:none;padding:11px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit">Agora não</button>' : '') +
      (opts.blocking ? '<button id="msg-recheck-btn" style="background:transparent;color:var(--text4);border:none;padding:8px;font-size:11.5px;cursor:pointer;font-family:inherit">Verificar novamente</button>' : '') +
    '</div>'
  );
}

function renderBlocking(m) {
  var overlay = document.getElementById("msg-blocking-overlay");
  var card = document.getElementById("msg-blocking-card");
  if (!overlay || !card) return;

  card.innerHTML = cardHtml(m, { blocking: true, dismissible: false });
  overlay.style.display = "flex";
  refreshIcons(overlay);

  var actionBtn = document.getElementById("msg-action-btn");
  if (actionBtn) actionBtn.onclick = function() { runAction(m); };

  var recheckBtn = document.getElementById("msg-recheck-btn");
  if (recheckBtn) recheckBtn.onclick = async function() {
    recheckBtn.textContent = "A verificar...";
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
        var reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.update();
      }
    } catch (e) {}
    await syncConsoleMessages();
    await checkAndShowMessages();
  };
}

function renderModal(m) {
  var overlay = document.getElementById("msg-modal-overlay");
  var card = document.getElementById("msg-modal-card");
  if (!overlay || !card) return;

  card.innerHTML = cardHtml(m, { blocking: false, dismissible: true });
  overlay.style.display = "flex";
  refreshIcons(overlay);

  var actionBtn = document.getElementById("msg-action-btn");
  if (actionBtn) actionBtn.onclick = function() {
    runAction(m);
    overlay.style.display = "none";
  };

  var dismissBtn = document.getElementById("msg-dismiss-btn");
  if (dismissBtn) dismissBtn.onclick = async function() {
    await dismissMessage(m.id);
    overlay.style.display = "none";
  };
}

function hideBlocking() {
  var overlay = document.getElementById("msg-blocking-overlay");
  if (overlay) overlay.style.display = "none";
}

function hideModal() {
  var overlay = document.getElementById("msg-modal-overlay");
  if (overlay) overlay.style.display = "none";
}

// Reavalia o cache local e mostra blocking (prioridade máxima) ou modal.
// Não mexe em mensagens display_mode="notification" — essas ficam a
// cargo exclusivo do centro de notificações (notification-ui.js).
export async function checkAndShowMessages() {
  var state = await evaluateMessages();

  if (state.blocking) {
    renderBlocking(state.blocking);
  } else {
    hideBlocking();
  }

  // Modal só é mostrado se não houver blocking ativo — blocking tem
  // sempre prioridade visual, não faz sentido empilhar os dois.
  if (!state.blocking && state.modal) {
    renderModal(state.modal);
  } else {
    hideModal();
  }
}

// Revalida (sem forçar rede) sempre que a app volta ao primeiro plano —
// cobre o caso de uma mensagem ter sido desativada/expirado enquanto a
// app estava em segundo plano.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", function() {
    if (document.visibilityState === "visible") {
      checkAndShowMessages().catch(function() {});
    }
  });
}

// Ponto de entrada único para "app ficou pronta e visível" — chamado
// tanto no login automático como no manual (main.js / auth.js). O
// evento "internet voltou" continua a ser responsabilidade exclusiva
// do listener em license.js, para não duplicar sincronizações.
export async function initMessagesOnBoot() {
  await syncConsoleMessages();
  await checkAndShowMessages();
}
