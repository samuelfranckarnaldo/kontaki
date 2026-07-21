import { el, refreshIcons }                from "./utils.js";
import { initQuickMode }               from "./components/quickmode.js";
import { initVender }                      from "./components/vender.js";
import { initProdutos, openProductForm }   from "./components/produtos.js";
import "./components/fiados.js";
import { initClientesTab }                 from "./components/clientes.js";
import { initHistorico }                   from "./components/historico.js";
import { initPerfil }                      from "./components/perfil.js";
import { initCamera }                      from "./components/camera.js";
import { initDarkMode, checkBadges, startRealtimeSync } from "./components/extras.js";
import { updateNotificationBadge } from "./notification-ui.js";
import { saveScroll, restoreScroll } from "./view-state.js";
import { loadDashboard }                    from "./components/dashboard.js";
import { hasFeature, getLicense }          from "./license.js";

var PAGES = {
  vender:    { init: initVender    },
  produtos:  { init: initProdutos  },
  fiados:    { init: initClientesTab },
  historico: { init: initHistorico },
  perfil:    { init: initPerfil    },
};

var TITLES = {
  vender: "Kontaki", produtos: "Produtos",
  fiados: "Clientes", historico: "Histórico", perfil: "Perfil",
};

var FEATURE_MAP = {
  historico: "historico",
  dashboard: "dashboard",
  quickmode: "venda_rapida",
};

function bloqueado(feature) {
  import("./license.js").then(function(m) {
    m.showUpgradeBanner("Esta função requer um plano superior. Contacta a Introxeer para fazer upgrade.");
  });
}

export var router = {
  init: function() {
    var self = this;
    document.querySelectorAll(".nav-item").forEach(function(btn) {
      btn.addEventListener("click", function() { self.go(btn.dataset.page); });
    });

    refreshIcons(el("bottom-nav"));
    refreshIcons(el("topbar"));

    window._openDashboard = function() {
      if (!hasFeature("dashboard")) { bloqueado("dashboard"); return; }
      var existing = document.getElementById("dashboard-overlay");
      if (existing) { existing.remove(); return; }
      import("./components/dashboard.js").then(function(m){ m.loadDashboard(); });
    };

    initDarkMode();
    startRealtimeSync();
    checkBadges();
    updateNotificationBadge();

    if (hasFeature("venda_rapida")) {
      initQuickMode();
    }

    setTimeout(function() { self.go("vender"); }, 50);
  },

  go: function(pageId) {
    if (!PAGES[pageId]) return;

    // Fecha a ficha do cliente (overlay independente do sistema de páginas)
    // se estiver aberta ao navegar para outra aba — sem isto ela fica presa
    // por cima da página nova, já que o router não tinha conhecimento dela.
    if (document.getElementById("cliente-profile-overlay") && typeof window._closeClienteProfile === "function") {
      window._closeClienteProfile();
    }

    // Salva a posicao de scroll da pagina atual antes de trocar
    var currentActive = document.querySelector(".page.active");
    if (currentActive) {
      var currentId = currentActive.id.replace("pg-", "");
      var currentInner = currentActive.querySelector(".page-inner");
      saveScroll(currentId, currentInner);
    }

    if (pageId === "historico" && !hasFeature("historico")) {
      bloqueado("historico");
      return;
    }

    document.querySelectorAll(".page").forEach(function(p) { p.classList.remove("active"); });
    document.querySelectorAll(".nav-item").forEach(function(b) { b.classList.remove("active"); });

    var page = el("pg-" + pageId);
    if (page) page.classList.add("active");

    var navBtn = document.querySelector(".nav-item[data-page=" + pageId + "]");
    if (navBtn) navBtn.classList.add("active");

    var titleEl = el("topbar-title");
    if (titleEl) {
      titleEl.textContent = TITLES[pageId] || pageId;
    }

    var qrBtn      = el("btn-topbar-qr");
    var addBtn     = el("btn-topbar-add");
    var quickBtn   = el("btn-topbar-quick");
    var pedidosBtn = el("btn-topbar-pedidos");

    if (qrBtn)      { qrBtn.style.display      = "none"; }
    if (addBtn)     { addBtn.style.display     = "none"; addBtn.onclick = null; }
    if (quickBtn)   { quickBtn.style.display   = "none"; }
    if (pedidosBtn) { pedidosBtn.style.display = "none"; }

    if (pageId === "vender") {
      if (quickBtn && hasFeature("venda_rapida")) quickBtn.style.display = "flex";
      if (qrBtn && hasFeature("scanner"))         qrBtn.style.display    = "flex";
      if (pedidosBtn) pedidosBtn.style.display = "flex";
    }
    // Botão "+" oculto em Produtos — criação movida para Gestão de Stock
    if (pageId === "fiados") {
      if (addBtn) {
        addBtn.style.display = "flex";
        addBtn.onclick = function() { if (window._ctTopbarAdd) window._ctTopbarAdd(); };
      }
    }

    PAGES[pageId].init();
    checkBadges();
    updateNotificationBadge();
    var pgEl = el("pg-" + pageId);
    if (pgEl) refreshIcons(pgEl);

    // Restaura a posicao de scroll da pagina que acabou de abrir
    var newInner = pgEl ? pgEl.querySelector(".page-inner") : null;
    restoreScroll(pageId, newInner);
  },
};

window.router = router;
