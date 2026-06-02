import { el, refreshIcons }                from "./utils.js";
import { initQuickMode }               from "./components/quickmode.js";
import { initVender }                      from "./components/vender.js";
import { initProdutos, openProductForm }   from "./components/produtos.js";
import { initFiados }                      from "./components/fiados.js";
import { initHistorico }                   from "./components/historico.js";
import { initPerfil }                      from "./components/perfil.js";
import { initCamera }                      from "./components/camera.js";

var PAGES = {
  vender:    { init: initVender    },
  produtos:  { init: initProdutos  },
  fiados:    { init: initFiados    },
  historico: { init: initHistorico },
  perfil:    { init: initPerfil    },
};

var TITLES = {
  vender: "Kontaki", produtos: "Produtos",
  fiados: "Fiados",  historico: "Historico", perfil: "Perfil",
};

export var router = {
  init: function() {
    var self = this;
    document.querySelectorAll(".nav-item").forEach(function(btn) {
      btn.addEventListener("click", function() { self.go(btn.dataset.page); });
    });

    var qrBtn  = el("btn-topbar-qr");
    var addBtn = el("btn-topbar-add");
    if (qrBtn)  qrBtn.addEventListener("click",  function() { initCamera(window._onVerifyQR); });
    if (addBtn) addBtn.addEventListener("click", function() { openProductForm(); });

    refreshIcons(el("bottom-nav"));
    refreshIcons(el("topbar"));
    initQuickMode();
    setTimeout(function() { self.go("vender"); }, 0);
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

    if (qrBtn)    qrBtn.style.display    = "none";
    if (addBtn)   addBtn.style.display   = "none";
    if (quickBtn) quickBtn.style.display = "none";

    if (pageId === "vender") {
      if (quickBtn) quickBtn.style.display = "flex";
      if (qrBtn)    qrBtn.style.display    = "flex";
    }
    if (pageId === "produtos") {
      if (addBtn) addBtn.style.display = "flex";
    }
    if (pageId === "fiados") {
      if (addBtn) {
        addBtn.style.display = "flex";
        addBtn.onclick = function() { if (window._openFiadoAdd) window._openFiadoAdd(); };
      }
    }

    PAGES[pageId].init();
    var pgEl = el("pg-" + pageId);
    if (pgEl) refreshIcons(pgEl);
  },
};
