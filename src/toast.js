import { refreshIcons } from "./utils.js";

var ICONS = {
  success: "check-circle",
  error:   "x-circle",
  info:    "info",
  warning: "alert-triangle",
};

export function toast(message, type) {
  type = type || "info";
  var container = document.getElementById("toasts");
  if (!container) return;

  var t = document.createElement("div");
  t.className = "toast toast-" + type;
  t.innerHTML =
    "<div class='toast-icon-badge'><i data-lucide='" + (ICONS[type]||"info") + "'></i></div>" +
    "<span class='toast-body'>" + message + "</span>" +
    "<button class='toast-close' onclick='this.parentNode.remove()'>×</button>";

  container.appendChild(t);
  refreshIcons(t);

  setTimeout(function() {
    t.style.opacity = "0";
    t.style.transform = "translateY(10px) scale(.97)";
    t.style.transition = "all .25s ease";
    setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 250);
  }, 3500);
}
