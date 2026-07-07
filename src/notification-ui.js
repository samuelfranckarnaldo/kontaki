import { buildNotificationState, markNotificationsSeen } from "./notifications.js";
import { refreshIcons } from "./utils.js";

export async function updateNotificationBadge() {
  try {
    var state = await buildNotificationState();
    var badge = document.getElementById("notif-badge");
    if (!badge) return;

    if (state.badgeCount > 0) {
      badge.textContent = state.badgeCount > 9 ? "9+" : String(state.badgeCount);
      badge.style.display = "flex";
      badge.style.alignItems = "center";
      badge.style.justifyContent = "center";
    } else {
      badge.style.display = "none";
    }
  } catch (e) {
    console.error("updateNotificationBadge:", e);
  }
}

function severityStyle(sev) {
  if (sev === "danger")  return { bg: "var(--danger-light)",  color: "var(--danger)",  icon: "alert-circle" };
  if (sev === "warning") return { bg: "var(--warning-light)", color: "var(--warning)", icon: "alert-triangle" };
  return { bg: "var(--info-light)", color: "var(--info)", icon: "info" };
}

function renderNotificationItem(n) {
  var s = severityStyle(n.severity);
  return (
    '<button onclick="window._handleNotificationAction(\'' + n.id + '\')" ' +
    'style="width:100%;display:flex;align-items:flex-start;gap:12px;padding:14px;border:1px solid var(--border2);' +
    'background:#fff;border-radius:12px;margin-bottom:8px;cursor:pointer;text-align:left;font-family:inherit">' +
      '<div style="width:34px;height:34px;border-radius:10px;background:' + s.bg + ';display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
        '<i data-lucide="' + s.icon + '" style="width:17px;height:17px;color:' + s.color + '"></i>' +
      '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:13.5px;font-weight:700;color:var(--text)">' + n.title + '</div>' +
        (n.description ? '<div style="font-size:12px;color:var(--text3);margin-top:3px">' + n.description + '</div>' : '') +
      '</div>' +
      '<i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text4);flex-shrink:0;margin-top:8px"></i>' +
    '</button>'
  );
}

window._notificationsCache = [];

window._closeNotificationCenter = function() {
  var ov = document.getElementById("notif-overlay");
  if (ov) ov.remove();
};

window._handleNotificationAction = function(id) {
  var n = window._notificationsCache.find(function(x){ return x.id === id; });
  if (!n || !n.action) return;
  window._closeNotificationCenter();
  if (n.action.page === "perfil" && n.action.subpage) {
    if (window.router) window.router.go("perfil");
    setTimeout(function() { if (window._perfilNav) window._perfilNav(n.action.subpage); }, 150);
    return;
  }
  if (window.router) window.router.go(n.action.page);
  setTimeout(function() {
    if (n.action.filter && window._filterProd) window._filterProd(n.action.filter);
  }, 150);
};

export async function openNotificationCenter() {
  var existing = document.getElementById("notif-overlay");
  if (existing) { existing.remove(); return; }

  var state = await buildNotificationState();
  window._notificationsCache = state.alerts;

  var overlay = document.createElement("div");
  overlay.id = "notif-overlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:200;display:flex;flex-direction:column;justify-content:flex-end";

  var backdrop = document.createElement("div");
  backdrop.style.cssText = "position:absolute;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(3px)";
  backdrop.onclick = window._closeNotificationCenter;
  overlay.appendChild(backdrop);

  var sheet = document.createElement("div");
  sheet.style.cssText = "position:relative;background:var(--bg2);border-radius:24px 24px 0 0;max-height:82vh;overflow-y:auto;z-index:1;animation:slideUp .3s ease;padding:20px";
  overlay.appendChild(sheet);

  var handle = document.createElement("div");
  handle.style.cssText = "display:flex;justify-content:center;margin:-8px 0 12px";
  handle.innerHTML = "<div style='width:40px;height:4px;background:var(--border);border-radius:2px'></div>";
  sheet.appendChild(handle);

  var title = document.createElement("div");
  title.style.cssText = "font-size:17px;font-weight:800;color:var(--text);margin-bottom:16px";
  title.textContent = "Notificações";
  sheet.appendChild(title);

  var body = document.createElement("div");

  if (!state.alerts.length) {
    body.innerHTML = '<div class="empty-state">' +
      '<i data-lucide="bell-off" style="width:36px;height:36px;color:#a1a1aa;margin-bottom:10px"></i>' +
      '<div class="empty-state-title">Sem notificações</div>' +
      '<div class="empty-state-sub">Tudo em ordem por agora.</div>' +
      '</div>';
  } else {
    var byType = { product: [], cash: [], system: [] };
    state.alerts.forEach(function(n){ (byType[n.type] || byType.system).push(n); });

    var html = '';
    if (byType.product.length) {
      html += '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Produtos</div>';
      html += byType.product.map(renderNotificationItem).join("");
    }
    if (byType.cash.length) {
      html += '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;margin:14px 0 6px">Caixa</div>';
      html += byType.cash.map(renderNotificationItem).join("");
    }
    if (byType.system.length) {
      html += '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;margin:14px 0 6px">Sistema</div>';
      html += byType.system.map(renderNotificationItem).join("");
    }
    body.innerHTML = html;
  }

  sheet.appendChild(body);
  document.body.appendChild(overlay);
  refreshIcons(sheet);

  await markNotificationsSeen();
  await updateNotificationBadge();
}

window._openNotificationCenter = openNotificationCenter;
