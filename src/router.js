import { el, refreshIcons }                from "./utils.js";
import { initQuickMode }               from "./components/quickmode.js";
import { initVender }                      from "./components/vender.js";
import { initProdutos, openProductForm }   from "./components/produtos.js";
import { initFiados }                      from "./components/fiados.js";
import { initHistorico }                   from "./components/historico.js";
import { initPerfil }                      from "./components/perfil.js";
import { initCamera }                      from "./components/camera.js";
import { initDarkMode, checkStockAlerts, checkBadges, startRealtimeSync } from "./components/extras.js";
import { loadDashboard }                    from "./components/dashboard.js";
import { hasFeature, getLicense }          from "./license.js";

var PAGES = {
  vender:    { init: initVender    },
  produtos:  { init: initProdutos  },
  fiados:    { init: initFiados    },
  historico: { init: initHistorico },
  perfil:    { init: initPerfil    },
};

var TITLES = {
  vender: "Kontaki", produtos: "Produtos",
  fiados: "Fiados",  historico: "Histórico", perfil: "Perfil",
};

// Mapa de features por página/botão
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

    var qrBtn = el("btn-topbar-qr");
    if (qrBtn) qrBtn.addEventListener("click", function() {
      if (!hasFeature("scanner")) { bloqueado("scanner"); return; }
      initCamera(window._onVerifyQR);
    });

    refreshIcons(el("bottom-nav"));
    refreshIcons(el("topbar"));

    // Botão dashboard
    window._openDashboard = function() {
      if (!hasFeature("dashboard")) { bloqueado("dashboard"); return; }
      var existing = document.getElementById("dashboard-overlay");
      if (existing) { existing.remove(); return; }
      import("./components/dashboard.js").then(function(m){ m.loadDashboard(); });
    };

    initDarkMode();
    startRealtimeSync();
    checkStockAlerts();
    checkBadges();

    // Quick mode só se tiver feature
    if (hasFeature("venda_rapida")) {
      initQuickMode();
    }

    setTimeout(function() { self.go("vender"); }, 50);
  },

  go: function(pageId) {
    if (!PAGES[pageId]) return;

    // Verificar acesso à página
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
      if (pageId === "vender") {
        titleEl.textContent = TITLES[pageId] || pageId;
        import("./db.js").then(function(m) {
          return m.db.get("settings", "store");
        }).then(function(store) {
          if (titleEl && store && store.name) titleEl.textContent = store.name;
        }).catch(function(){});
      } else {
        titleEl.textContent = TITLES[pageId] || pageId;
      }
    }

    var qrBtn    = el("btn-topbar-qr");
    var addBtn   = el("btn-topbar-add");
    var quickBtn = el("btn-topbar-quick");

    if (qrBtn)    { qrBtn.style.display    = "none"; }
    if (addBtn)   { addBtn.style.display   = "none"; addBtn.onclick = null; }
    if (quickBtn) { quickBtn.style.display = "none"; }

    if (pageId === "vender") {
      if (quickBtn && hasFeature("venda_rapida")) quickBtn.style.display = "flex";
      if (qrBtn && hasFeature("scanner"))         qrBtn.style.display    = "flex";
    }
    if (pageId === "produtos") {
      if (addBtn) {
        addBtn.style.display = "flex";
        addBtn.onclick = function() { openProductForm(); };
      }
    }
    if (pageId === "fiados") {
      if (addBtn) {
        addBtn.style.display = "flex";
        addBtn.onclick = function() { if (window._openFiadoAdd) window._openFiadoAdd(); };
      }
    }

    PAGES[pageId].init();
    checkBadges();
    var pgEl = el("pg-" + pageId);
    if (pgEl) refreshIcons(pgEl);
  },
};

window.router = router;
