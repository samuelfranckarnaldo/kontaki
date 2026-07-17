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

function cardHtml(m, opts) {
  var color = severityColor(m.severity);
  var hasAction = m.action_type && m.action_type !== "none" && m.action_value;
  return (
    '<div style="width:56px;height:56px;border-radius:16px;background:' + color + '22;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">' +
      '<i data-lucide="' + severityIcon(m.severity) + '" style="width:26px;height:26px;color:' + color + '"></i>' +
    '</div>' +
    '<div style="font-size:16px;font-weight:800;color:var(--text);margin-bottom:8px">' + (m.title || "Aviso") + '</div>' +
    '<div style="font-size:13.5px;color:var(--text3);line-height:1.5;margin-bottom:22px">' + m.body + '</div>' +
    '<div style="display:flex;flex-direction:column;gap:8px">' +
      (hasAction ? '<button id="msg-action-btn" style="background:' + color + ';color:#fff;border:none;border-radius:12px;padding:13px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">' + actionLabel(m) + '</button>' : '') +
      (opts.dismissible ? '<button id="msg-dismiss-btn" style="background:transparent;color:var(--text3);border:none;padding:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Agora não</button>' : '') +
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
