import { buildNotificationState, markNotificationsSeen } from "./notifications.js";
import { markMessagesSeen } from "./messages.js";
import { el, refreshIcons } from "./utils.js";

var _prevBadgeCount = null;

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

      if (_prevBadgeCount !== null && state.badgeCount > _prevBadgeCount) {
        badge.classList.remove("notif-badge-pulse");
        void badge.offsetWidth; // força reflow para reiniciar a animação
        badge.classList.add("notif-badge-pulse");
      }
    } else {
      badge.style.display = "none";
    }
    _prevBadgeCount = state.badgeCount;
  } catch (e) {
    console.error("updateNotificationBadge:", e);
  }
}

function fmtNotifDate(iso) {
  var d = new Date(iso);
  var str = d.toLocaleDateString("pt-AO", { weekday:"long", day:"numeric", month:"long", year:"numeric" });
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function severityMeta(sev) {
  if (sev === "danger")  return { bg: "var(--danger-light)",  color: "var(--danger)",  bar: "var(--danger)",  icon: "alert-circle" };
  if (sev === "warning") return { bg: "var(--warning-light)", color: "var(--warning)", bar: "var(--warning)", icon: "alert-triangle" };
  return { bg: "var(--info-light)", color: "var(--info)", bar: "var(--info)", icon: "info" };
}

function renderNotificationItem(n, index) {
  var s = severityMeta(n.severity);
  var delay = (index * 40);
  return (
    '<button onclick="window._handleNotificationAction(\'' + n.id + '\')" ' +
    'class="notif-item" style="animation-delay:' + delay + 'ms">' +
      '<span class="notif-item-bar" style="background:' + s.bar + '"></span>' +
      '<div class="notif-item-icon" style="background:' + s.bg + '">' +
        '<i data-lucide="' + s.icon + '" style="width:17px;height:17px;color:' + s.color + '"></i>' +
      '</div>' +
      '<div style="flex:1;min-width:0;text-align:left">' +
        '<div style="font-size:13.5px;font-weight:700;color:var(--text)">' + n.title + '</div>' +
        (n.description ? '<div style="font-size:12px;color:var(--text3);margin-top:3px">' + n.description + '</div>' : '') +
        '<div style="font-size:11px;color:var(--text4);margin-top:5px">' + fmtNotifDate(n.createdAt) + '</div>' +
      '</div>' +
      '<i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text4);flex-shrink:0;margin-top:8px"></i>' +
    '</button>'
  );
}

function groupBySeverity(alerts) {
  var groups = { danger: [], warning: [], info: [] };
  alerts.forEach(function(n){ (groups[n.severity] || groups.info).push(n); });
  return groups;
}

window._notificationsCache = [];

window._closeNotificationCenter = function() {
  var ov = document.getElementById("notif-center");
  if (ov) ov.style.display = "none";
};

window._handleNotificationAction = function(id) {
  var n = window._notificationsCache.find(function(x){ return x.id === id; });
  if (!n || !n.action) return;

  // Ações vindas de mensagens do Console (url/download/page) têm forma
  // { type, value } — distinto do formato { page, filter, subpage } usado
  // pelos alertas internos (stock, caixa), tratado mais abaixo.
  if (n.action.type === "url" || n.action.type === "download") {
    window.open(n.action.value, "_blank", "noopener");
    return;
  }
  if (n.action.type === "page") {
    window._closeNotificationCenter();
    if (window.router) window.router.go(n.action.value);
    return;
  }

  window._closeNotificationCenter();
  if (n.action.page === "perfil" && n.action.subpage) {
    if (window.router) window.router.go("perfil");
    setTimeout(function() {
      if (window._perfilNav) window._perfilNav(n.action.subpage);
      setTimeout(function() {
        if (n.action.tab && window._fornSwitchTab) window._fornSwitchTab(n.action.tab);
        if (n.action.filter && window._fornSetPaymentFilter) window._fornSetPaymentFilter(n.action.filter);
      }, 150);
    }, 150);
    return;
  }
  if (window.router) window.router.go(n.action.page);
  setTimeout(function() {
    if (n.action.filter && window._filterProd) window._filterProd(n.action.filter);
  }, 150);
};

export async function openNotificationCenter() {
  var overlay = document.getElementById("notif-center");
  if (!overlay) return;

  var state = await buildNotificationState();
  window._notificationsCache = state.alerts;

  var list = document.getElementById("notif-list");
  if (!list) return;

  if (!state.alerts.length) {
    list.innerHTML = '<div class="empty-state" style="padding-top:60px">' +
      '<div style="width:56px;height:56px;border-radius:16px;background:var(--success-light);display:flex;align-items:center;justify-content:center;margin:0 auto 14px">' +
      '<i data-lucide="check" style="width:26px;height:26px;color:var(--success)"></i>' +
      '</div>' +
      '<div class="empty-state-title">Tudo em ordem</div>' +
      '<div class="empty-state-sub">Sem alertas pendentes por agora.</div>' +
      '</div>';
  } else {
    var groups = groupBySeverity(state.alerts);
    var html = '';
    var idx = 0;

    if (groups.danger.length) {
      html += '<div class="notif-group-label" style="color:var(--danger)">Requer ação agora</div>';
      html += groups.danger.map(function(n){ return renderNotificationItem(n, idx++); }).join("");
    }
    if (groups.warning.length) {
      html += '<div class="notif-group-label" style="color:var(--warning);margin-top:20px">Vale atenção</div>';
      html += groups.warning.map(function(n){ return renderNotificationItem(n, idx++); }).join("");
    }
    if (groups.info.length) {
      html += '<div class="notif-group-label" style="color:var(--info);margin-top:20px">Informativo</div>';
      html += groups.info.map(function(n){ return renderNotificationItem(n, idx++); }).join("");
    }
    list.innerHTML = html;
  }

  overlay.style.display = "flex";
  overlay.style.animation = "none";
  void overlay.offsetHeight; // força reflow para reiniciar a animação
  overlay.style.animation = "slideUp .25s ease";

  refreshIcons(overlay);

  var closeBtn = document.getElementById("btn-notif-close");
  if (closeBtn) closeBtn.onclick = window._closeNotificationCenter;

  var msgIds = state.alerts
    .filter(function(n) { return n._rawId; })
    .map(function(n) { return n._rawId; });
  await markMessagesSeen(msgIds);

  await markNotificationsSeen();
  await updateNotificationBadge();
}

window._openNotificationCenter = openNotificationCenter;
