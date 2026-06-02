import { el, refreshIcons } from "./utils.js";

export function openModal(title, bodyHTML) {
  el("modal-title").textContent = title;
  el("modal-body").innerHTML    = bodyHTML;
  el("overlay").classList.add("open");
  refreshIcons(el("modal-box"));
}

export function closeModal() {
  el("overlay").classList.remove("open");
  el("modal-body").innerHTML = "";
}

export function initModal() {
  el("overlay").addEventListener("click", (e) => {
    if (e.target === el("overlay")) closeModal();
  });
}
