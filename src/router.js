import { el, refreshIcons }                from "./utils.js";
import { initQuickMode }               from "./components/quickmode.js";
import { initVender }                      from "./components/vender.js";
import { initProdutos, openProductForm }   from "./components/produtos.js";
import { initFiados }                      from "./components/fiados.js";
import { initHistorico }                   from "./components/historico.js";
import { initPerfil }                      from "./components/perfil.js";
import { initCamera }                      from "./components/camera.js";
import { initDarkMode, checkStockAlerts, checkBadges } from "./components/extras.js";
import { loadDashboard }                    from "./components/dashboard.js";

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

export var router = {
  init: function() {
    var self = this;
    document.querySelectorAll(".nav-item").forEach(function(btn) {
      btn.addEventListener("click", function() { self.go(btn.dataset.page); });
    });

    var qrBtn = el("btn-topbar-qr");
    if (qrBtn) qrBtn.addEventListener("click", function() { initCamera(window._onVerifyQR); });

    refreshIcons(el("bottom-nav"));
    refreshIcons(el("topbar"));
    // Mostrar nome da loja no topbar
    (async function() {
      var store = await (await import("./db.js")).db.get("settings","store");
      var titleEl = el("topbar-title");
      if (titleEl && store && store.name) titleEl.textContent = store.name;
    })();
    // Botão dashboard
    window._openDashboard = function() {
      var existing = document.getElementById("dashboard-overlay");
      if (existing) { existing.remove(); return; }
      import("./components/dashboard.js").then(function(m){ m.loadDashboard(); });
    };
    initDarkMode();
    checkStockAlerts();
    checkBadges();
    initQuickMode();
    setTimeout(function() { self.go("vender"); loadDashboard(); }, 50);
  },

  go: function(pageId) {
    if (!PAGES[pageId]) return;

    document.querySelectorAll(".page").forEach(function(p) { p.classList.remove("active"); });
    document.querySelectorAll(".nav-item").forEach(function(b) { b.classList.remove("active"); });

    var page = el("pg-" + pageId);
    if (page) page.classList.add("active");

    var navBtn = document.querySelector(".nav-item[data-page=" + pageId + "]");
    if (navBtn) navBtn.classList.add("active");

    var titleEl = el("topbar-title");
    if (titleEl) titleEl.textContent = TITLES[pageId] || pageId;

    var qrBtn    = el("btn-topbar-qr");
    var addBtn   = el("btn-topbar-add");
    var quickBtn = el("btn-topbar-quick");

    // Esconder todos os botões
    if (qrBtn)    qrBtn.classList.remove("visible");
    if (addBtn)   { addBtn.classList.remove("visible"); addBtn.onclick = null; }
    if (quickBtn) quickBtn.classList.remove("visible");

    if (pageId === "vender") {
      if (quickBtn) quickBtn.classList.add("visible");
      if (qrBtn)    qrBtn.classList.add("visible");
    }
    if (pageId === "produtos") {
      if (addBtn) {
        addBtn.classList.add("visible");
        addBtn.onclick = function() { openProductForm(); };
      }
    }
    if (pageId === "fiados") {
      if (addBtn) {
        addBtn.classList.add("visible");
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
