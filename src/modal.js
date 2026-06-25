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
  var ov = document.getElementById("modal-overlay");
  if (!ov) { console.error("Modal overlay nao encontrado"); return; }
  ov.addEventListener("click", function(e) {
    if (e.target === ov) closeModal();
  });
}
