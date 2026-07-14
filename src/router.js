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

// ── Pilha de navegação genérica ────────────────────────────────────────
// Cada ação "para a frente" (trocar de página, trocar de aba, abrir ficha...)
// empilha uma função de "desfazer". O gesto/botão de recuar desempilha uma
// de cada vez, nível a nível. Quando a pilha esvazia, "recuar" volta para
// "vender"; a partir de "vender" com a pilha vazia, pergunta se quer sair.
window._ctNav = {
  stack: [],
  push: function(undoFn) {
    this.stack.push(undoFn);
    history.pushState({ ctDepth: this.stack.length }, "", "");
  },
  rearm: function() {
    history.pushState({ ctDepth: this.stack.length }, "", "");
  },
  handleBack: function() {
    if (this.stack.length > 0) {
      var undo = this.stack.pop();
      undo();
      this.rearm();
      return;
    }
    if (router.currentPage() !== "vender") {
      router.go("vender", true);
      this.rearm();
      return;
    }
    router.confirmExit();
  },
};

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

    history.replaceState({ ctDepth: 0 }, "", "");
    setTimeout(function() { self.go("vender", true); }, 50);

    window.addEventListener("popstate", function() {
      // Prioridade 0: fechar modal genérico, se aberto (não entra na pilha)
      var modalOv = document.getElementById("modal-overlay");
      if (modalOv && modalOv.style.display !== "none" && modalOv.style.display !== "") {
        modalOv.style.display = "none";
        var bEl = document.getElementById("modal-body");
        if (bEl) bEl.innerHTML = "";
        window._ctNav.rearm();
        return;
      }
      window._ctNav.handleBack();
    });
  },

  currentPage: function() {
    var active = document.querySelector(".page.active");
    return active ? active.id.replace("pg-", "") : "vender";
  },

  confirmExit: function() {
    window._ctNav.rearm();
    var ov = document.createElement("div");
    ov.className = "m3-confirm-overlay";
    ov.innerHTML =
      '<div class="m3-confirm-box">' +
        '<div class="m3-confirm-title">Sair do Kontaki?</div>' +
        '<div class="m3-confirm-actions">' +
          '<button class="m3-btn-text" id="ct-exit-cancel">Cancelar</button>' +
          '<button class="m3-btn-filled" id="ct-exit-confirm">Sair</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    document.getElementById("ct-exit-cancel").onclick = function() { ov.remove(); };
    document.getElementById("ct-exit-confirm").onclick = function() {
      history.go(-(history.length - 1));
      setTimeout(function() { window.close(); }, 50);
    };
  },

  go: function(pageId, fromBack) {
    if (!PAGES[pageId]) return;
    var self = this;
    var prevPage = this.currentPage();

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
    if (pageId === "produtos") {
      if (addBtn) {
        addBtn.style.display = "flex";
        addBtn.onclick = function() { openProductForm(); };
      }
    }
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

    if (!fromBack && prevPage !== pageId && window._ctNav) {
      window._ctNav.push(function() { self.go(prevPage, true); });
    }
  },
};

window.router = router;
