// UI para mensagens do Console com display_mode = "modal" ou "blocking".
// Isolado de notification-ui.js de propósito: estas mensagens não fazem
// parte do centro de notificações, aparecem por cima de tudo, no arranque,
// antes do utilizador poder navegar.
import { evaluateMessages, syncConsoleMessages, dismissMessage } from "./messages.js";
import { refreshIcons, el } from "./utils.js";
import { db } from "./db.js";
import { getUser } from "./auth.js";
import { openModal, closeModal } from "./modal.js";
import { toast } from "./toast.js";
import { verifyAdminPin } from "./services.js";

var WORKSPACE_CONSOLE_API = "https://kontaki-console.vercel.app/api";

async function getLicenseCodeForLink() {
  var lic = await db.get("settings", "license");
  return lic ? lic.code : null;
}

async function confirmWorkspaceLink(m, accept) {
  var licenseCode = await getLicenseCodeForLink();
  if (!licenseCode) {
    toast("Licença não encontrada neste dispositivo.", "error");
    return;
  }
  try {
    var res = await fetch(WORKSPACE_CONSOLE_API + "/workspace-auth/link-response", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: m.action_value, licenseCode: licenseCode, accept: accept }),
    });
    var body = await res.json().catch(function() { return {}; });
    if (!res.ok) {
      toast(body.error || "Erro ao responder ao pedido.", "error");
      return;
    }
    if (accept) {
      await db.put("settings", { key: "workspaceLink", status: "active", linkedAt: new Date().toISOString() });
    }
    await dismissMessage(m.id);
    var overlay = document.getElementById("msg-blocking-overlay");
    if (overlay) overlay.style.display = "none";
    toast(accept ? "Ligação aceite." : "Pedido rejeitado.", "success");
  } catch (e) {
    toast("Erro de rede ao responder ao pedido.", "error");
  }
}

function showWorkspaceLinkPinModal(m) {
  openModal("Confirmar administrador",
    '<div style="font-size:13px;color:var(--text3);line-height:1.6;margin-bottom:16px">' +
    'É necessário o PIN de um administrador para autorizar a ligação ao Workspace.' +
    '</div>' +
    '<div class="field" style="margin-bottom:14px">' +
    '<label>PIN do administrador</label>' +
    '<input type="password" inputmode="numeric" maxlength="6" id="wslink-pin" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022" style="width:100%;padding:12px;border:1.5px solid var(--border);border-radius:10px;font-size:18px;text-align:center;letter-spacing:6px;font-family:inherit"/>' +
    '</div>' +
    '<div id="wslink-err" style="display:none;color:var(--danger);font-size:12px;margin-bottom:10px"></div>' +
    '<div style="display:flex;gap:8px">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" onclick="window._submitWorkspaceLinkPin()">Confirmar</button>' +
    '</div>');
  refreshIcons(el("modal-box"));
  window._pendingWorkspaceLinkMessage = m;
}

window._submitWorkspaceLinkPin = async function() {
  var pinEl = document.getElementById("wslink-pin");
  var pin = pinEl ? pinEl.value : "";
  var errEl = document.getElementById("wslink-err");
  if (!pin || pin.length < 4) {
    if (errEl) { errEl.style.display = "block"; errEl.textContent = "Introduz o PIN."; }
    return;
  }
  var result = await verifyAdminPin(pin);
  if (!result.ok) {
    if (errEl) { errEl.style.display = "block"; errEl.textContent = "PIN inválido."; }
    return;
  }
  closeModal();
  var m = window._pendingWorkspaceLinkMessage;
  window._pendingWorkspaceLinkMessage = null;
  if (m) await confirmWorkspaceLink(m, true);
};

window._acceptWorkspaceLink = async function(m) {
  var u = getUser();
  if (u && u.role === "admin") {
    await confirmWorkspaceLink(m, true);
  } else {
    showWorkspaceLinkPinModal(m);
  }
};

window._rejectWorkspaceLink = async function(m) {
  await confirmWorkspaceLink(m, false);
};

function severityColor(sev) {
  if (sev === "danger") return "var(--danger)";
  if (sev === "warning") return "var(--warning)";
  // "info" usa a cor de identidade do Kontaki (roxo), não a --info
  // genérica de sistema (azul) — mantém consistência com o resto do app.
  return "var(--primary)";
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

// Corpo da mensagem suporta uma sintaxe opcional de lista com ícones:
// cada linha no formato "icone-lucide|texto" vira um item com ícone,
// ex.: "shield-check|Segurança reforçada". Linhas sem esse padrão são
// tratadas como parágrafo normal. Permite ao Console escrever mensagens
// com destaques visuais (como as novidades de produto do Claude), sem
// exigir HTML.
function parseBody(body) {
  var lines = String(body || "").split("\n").map(function(l) { return l.trim(); }).filter(Boolean);
  var bulletPattern = /^([a-z0-9-]+)\|(.+)$/i;
  var bullets = lines.map(function(l) { return l.match(bulletPattern); });
  var allBullets = lines.length > 1 && bullets.every(Boolean);

  if (allBullets) {
    return { type: "bullets", items: bullets.map(function(match) { return { icon: match[1], text: match[2] }; }) };
  }
  return { type: "paragraph", text: String(body || "") };
}

function bodyHtml(parsed) {
  if (parsed.type === "bullets") {
    return '<div style="display:flex;flex-direction:column;gap:14px;margin-bottom:26px;text-align:left">' +
      parsed.items.map(function(item) {
        return '<div style="display:flex;align-items:flex-start;gap:12px">' +
          '<i data-lucide="' + item.icon + '" style="width:18px;height:18px;color:var(--primary);flex-shrink:0;margin-top:1px"></i>' +
          '<span style="font-size:13.5px;color:var(--text2);line-height:1.5">' + item.text + '</span>' +
        '</div>';
      }).join("") +
    '</div>';
  }

  var text = parsed.text;
  var isLong = text.length > 160;
  var alignment = isLong ? "text-align:left" : "text-align:center";

  if (!isLong) {
    return '<div id="msg-body-text" style="font-size:13.5px;color:var(--text3);line-height:1.55;margin-bottom:24px;' + alignment + '">' + text + '</div>';
  }

  return (
    '<div id="msg-body-text" style="font-size:13.5px;color:var(--text3);line-height:1.55;margin-bottom:6px;' + alignment + ';' +
      'display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden">' + text + '</div>' +
    '<button id="msg-readmore-btn" style="background:none;border:none;color:var(--primary);font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;padding:0;margin-bottom:24px;display:block">Ler mais</button>'
  );
}

function cardHtml(m, opts) {
  var color = severityColor(m.severity);
  var hasAction = m.action_type && m.action_type !== "none" && m.action_value;
  var parsedBody = parseBody(m.body);
  return (
    '<div style="padding:0 0 6px">' + syncIllustrationSVG() + '</div>' +
    '<div style="font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;font-weight:700;color:var(--text4);margin-bottom:14px">' +
      'Introxeer' +
    '</div>' +
    '<div style="font-size:19px;font-weight:800;color:var(--text);margin-bottom:8px;letter-spacing:-0.01em">' + (m.title || "Aviso") + '</div>' +
    bodyHtml(parsedBody) +
    '<div style="display:flex;flex-direction:column;gap:10px">' +
      (m.action_type === "workspace_link"
        ? '<button id="msg-accept-btn" style="background:' + color + ';color:#fff;border:none;border-radius:14px;padding:15px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit">Aceitar</button>' +
          '<button id="msg-reject-btn" style="background:transparent;color:var(--danger);border:none;padding:11px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit">Rejeitar</button>'
        : (hasAction ? '<button id="msg-action-btn" style="background:' + color + ';color:#fff;border:none;border-radius:14px;padding:15px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit">' + actionLabel(m) + '</button>' : '')) +
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

  var acceptBtn = document.getElementById("msg-accept-btn");
  if (acceptBtn) acceptBtn.onclick = function() { window._acceptWorkspaceLink(m); };

  var rejectBtn = document.getElementById("msg-reject-btn");
  if (rejectBtn) rejectBtn.onclick = function() { window._rejectWorkspaceLink(m); };

  var readMoreBtn = document.getElementById("msg-readmore-btn");
  if (readMoreBtn) readMoreBtn.onclick = function() {
    var bodyEl = document.getElementById("msg-body-text");
    if (bodyEl) {
      bodyEl.style.webkitLineClamp = "unset";
      bodyEl.style.display = "block";
    }
    readMoreBtn.style.display = "none";
  };

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

  var readMoreBtnModal = document.getElementById("msg-readmore-btn");
  if (readMoreBtnModal) readMoreBtnModal.onclick = function() {
    var bodyEl = document.getElementById("msg-body-text");
    if (bodyEl) {
      bodyEl.style.webkitLineClamp = "unset";
      bodyEl.style.display = "block";
    }
    readMoreBtnModal.style.display = "none";
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
