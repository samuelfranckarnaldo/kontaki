import { refreshIcons } from "./utils.js";

const ICONS = { success: "check-circle", error: "x-circle", info: "info" };

export function toast(msg, type = "info") {
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `<i data-lucide="${ICONS[type]}"></i><span>${msg}</span>`;
  el.onclick   = () => el.remove();
  document.getElementById("toasts").appendChild(el);
  refreshIcons(el);
  setTimeout(() => el.remove(), 3500);
}
