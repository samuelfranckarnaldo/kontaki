import { el, refreshIcons } from "./utils.js";

export function openModal(title, bodyHTML) {
  var ov    = document.getElementById("modal-overlay");
  var tEl   = document.getElementById("modal-title");
  var bEl   = document.getElementById("modal-body");
  var box   = document.getElementById("modal-box");
  if (!ov || !tEl || !bEl) { console.error("Modal: elementos em falta"); return; }
  tEl.textContent  = title;
  bEl.innerHTML    = bodyHTML;
  ov.style.display = "flex";
  if (box) refreshIcons(box);
}

export function closeModal() {
  var ov = document.getElementById("modal-overlay");
  var bEl = document.getElementById("modal-body");
  if (ov)  ov.style.display = "none";
  if (bEl) bEl.innerHTML    = "";
}

export function initModal() {
  if (!document.getElementById("kontaki-focus-style")) {
    var style = document.createElement("style");
    style.id = "kontaki-focus-style";
    style.textContent =
      "*{-webkit-tap-highlight-color:transparent;}" +
      "input:focus,select:focus,textarea:focus,button:focus{outline:2px solid var(--primary);outline-offset:1px;}" +
      "#modal-title{margin:4px 4px 16px;}" +
      "@keyframes cdIconPop{from{opacity:0;transform:scale(.8);}to{opacity:1;transform:scale(1);}}";
    document.head.appendChild(style);
  }
  var ov = document.getElementById("modal-overlay");
  if (!ov) { console.error("Modal overlay nao encontrado"); return; }
  ov.addEventListener("click", function(e) {
    if (e.target === ov) closeModal();
  });
}

// ── CONFIRMAÇÃO CUSTOMIZADA (substitui confirm() nativo) ────────────────────
export function confirmDialog(message, onConfirm, options) {
  options = options || {};
  var title       = options.title       || "Confirmar";
  var confirmText = options.confirmText || "Confirmar";
  var cancelText  = options.cancelText  || "Cancelar";
  var danger      = options.danger      || false;
  var icon        = options.icon       || null;

  var confirmColor = danger ? "#dc2626" : "#5b21b6";
  var confirmShadow = danger ? "rgba(220,38,38,.25)" : "rgba(91,33,182,.25)";

  var iconHTML = icon ?
    `<div style="width:56px;height:56px;border-radius:16px;background:${danger?"#fee2e2":"var(--primary-light)"};
      display:flex;align-items:center;justify-content:center;margin:0 auto 22px;box-shadow:0 2px 10px rgba(0,0,0,.06);
      animation:cdIconPop .3s ease">
      <i data-lucide="${icon}" style="width:26px;height:26px;color:${danger?"#dc2626":"var(--primary)"}"></i>
    </div>` : "";

  openModal(title,
    `${iconHTML}
    <div style="font-size:14px;color:#374151;line-height:1.6;margin-bottom:22px">${message}</div>
    <div style="display:flex;flex-direction:column;gap:4px">
      <button id="cd-confirm" class="btn" style="width:100%;padding:13px 20px;line-height:1.2;background:${confirmColor};color:#fff;
              border:none;border-radius:13px;font-size:14px;font-weight:700;cursor:pointer;
              font-family:inherit;box-shadow:0 4px 14px ${confirmShadow}">
        ${confirmText}
      </button>
      <button id="cd-cancel" style="width:100%;padding:10px;background:none;border:none;color:var(--text3);
              font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">
        ${cancelText}
      </button>
    </div>`);

  var cancelBtn  = document.getElementById("cd-cancel");
  var confirmBtn = document.getElementById("cd-confirm");

  if (cancelBtn)  cancelBtn.onclick  = function() { closeModal(); };
  if (confirmBtn) confirmBtn.onclick = function() { closeModal(); onConfirm(); };
}
