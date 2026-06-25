import { refreshIcons } from "./utils.js";

var ICONS = {
  success: "check-circle",
  error:   "x-circle",
  info:    "info",
  warning: "alert-triangle",
};
var COLORS = {
  success: "#064e3b",
  error:   "#7f1d1d",
  info:    "#1e3a5f",
  warning: "#78350f",
};

export function toast(message, type) {
  type = type || "info";
  var container = document.getElementById("toasts");
  if (!container) return;

  var t = document.createElement("div");
  t.className = "toast toast-" + type;
  t.style.background = COLORS[type] || COLORS.info;
  t.innerHTML =
    "<i data-lucide='" + (ICONS[type]||"info") + "' style='width:16px;height:16px;flex-shrink:0'></i>" +
    "<span style='flex:1;line-height:1.4'>" + message + "</span>" +
    "<button onclick='this.parentNode.remove()' style='background:none;border:none;color:rgba(255,255,255,.6);cursor:pointer;padding:0;font-size:16px;line-height:1;flex-shrink:0'>×</button>";

  container.appendChild(t);
  refreshIcons(t);

  setTimeout(function() {
    t.style.opacity = "0";
    t.style.transform = "translateY(8px)";
    t.style.transition = "all .25s ease";
    setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 250);
  }, 3500);
}
