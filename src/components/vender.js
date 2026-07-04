import { db } from "../db.js";
import { fmt, fmtDate, el, val, setVal, refreshIcons, generateQR } from "../utils.js";
import { toast } from "../toast.js";
import { openModal, closeModal } from "../modal.js";
import { getUser } from "../auth.js";
import { initCamera } from "./camera.js";
import { addStockMovement, getStock } from "../services.js";
import { gerarReciboPDF, partilharReciboPDF, printReciboHTML } from "./recibo-pdf.js";
import { printRecibo } from "../print.js";

let products  = [];
let cart      = [];
let payMethod = "dinheiro";
let discType  = "pct";
let lastRemoved = null;

function genHash(sid, date) {
  const str = "KONTAKI-" + sid + "-" + date;
  let h = 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return Math.abs(h).toString(36).toUpperCase().slice(0, 6);
}

const PAY_DESC = {
  dinheiro:      "Pagamento em dinheiro no ato da venda.",
  transferencia: "Transferência bancária antes de levantar.",
  multicaixa:    "Pagamento via terminal Multicaixa.",
  fiado:         "Produto cedido a crédito. Registado em fiados.",
};

export async function initVender() {
  products = await db.getAll("products").then(p => p.filter(x => x.active));
  _storeIvaCache = null;

  // Restaurar carrinho guardado
  try {
    var saved = localStorage.getItem("kontaki-cart");
    if (saved) {
      var savedCart = JSON.parse(saved);
      // Validar que os produtos ainda existem e têm stock suficiente
      cart = savedCart.filter(function(item) {
        var p = products.find(function(p){ return p.id === item.id; });
        return p && p.stock > 0;
      }).map(function(item) {
        var p = products.find(function(p){ return p.id === item.id; });
        return Object.assign({}, item, {
          stock: p.stock, price: p.price, name: p.name
        });
      });
    } else {
      cart = [];
    }
  } catch(e) { cart = []; }

  const btnScanner   = el("btn-scanner");
  const btnLimpar    = el("btn-limpar");
  const btnFinalizar = el("btn-finalizar");
  const discInput    = el("disc-input");
  const discType2    = el("btn-disc-type");

  if (!btnScanner || !btnFinalizar) {
    console.warn("[Vender] DOM incompleto — abortando init");
    return;
  }

  btnScanner.onclick   = () => initCamera(onBarcode);
  btnLimpar.onclick    = limpar;
  btnFinalizar.onclick = async function() {
    var { getSession } = await import("../auth.js");
    if (!getSession()) {
      var { toast } = await import("../toast.js");
      toast("Abre um turno para poder vender.", "error");
      return;
    }
    openCheckout();
  };


  // Verificação QR — abre modal de escolha
  window._onVerifyQR = onVerifyQR;
  window._verifyByCam  = () => {
    var ov = document.getElementById("verify-overlay");
    if (ov) ov.style.display = "none";
    initCamera(onVerifyQR);
  };
  window._verifyByCode = () => {
    var wrap = document.getElementById("verify-code-input");
    if (!wrap) return;
    wrap.style.display = wrap.style.display === "flex" ? "none" : "flex";
    if (wrap.style.display === "flex") {
      setTimeout(() => { var m = document.getElementById("manual-code"); if (m) m.focus(); }, 100);
    }
  };
  window._verifyManualCode = async () => {
    var codeEl = document.getElementById("manual-code");
    var code = codeEl ? codeEl.value.trim().toUpperCase() : "";
    if (!code) { toast("Insere o código.", "error"); return; }
    var ov = document.getElementById("verify-overlay");
    if (ov) ov.style.display = "none";
    await verifyCode(code);
  };

  const qrBtn = document.getElementById("btn-topbar-qr");
  if (qrBtn) {
    qrBtn.onclick = () => {
      var ov = document.getElementById("verify-overlay");
      if (ov) ov.style.display = "flex";
    };
  }

  const search = el("prod-search");
  if (search) {
    search.oninput = () => {
      const q = search.value.trim().toLowerCase();
      var results = el("search-results");
      if (!q) { if (results) results.style.display = "none"; return; }
      const f = products.filter(p => p.name.toLowerCase().includes(q) || (p.barcode||"").includes(q));
      renderSearchResults(f);
    };
    search.onkeydown = (e) => {
      if (e.key !== "Enter") return;
      const q = search.value.trim().toLowerCase();
      const f = products.filter(p => p.name.toLowerCase().includes(q) || (p.barcode||"").includes(q));
      if (f.length === 1) addToCart(f[0]);
    };
  }

  // pay method seleccionado no modal de checkout

  renderRecentProducts();
  renderCart();
  renderSummary();
  refreshIcons(el("pg-vender"));
}

// ── VERIFICAÇÃO ───────────────────────────────────────────────────────────────
function onVerifyQR(code) { verifyCode(code); }

async function verifyCode(code) {
  let hash = code;
  let sid  = null;

  if (code.startsWith("KONTAKI|") || code.startsWith("K|")) {
    const parts = code.split("|");
    if (code.startsWith("K|")) {
      sid  = parseInt(parts[1] || "0");
      hash = parts[2] || "";
    } else {
      sid  = parseInt((parts[1]||"").replace("VENDA#",""));
      hash = parts[4] || "";
    }
  } else if (code.length <= 10) {
    hash = code.toUpperCase();
  }

  const sales = await db.getAll("sales");
  const sale  = sid ? sales.find(s => s.id === sid) : sales.find(s => s.hash === hash);

  if (!sale) {
    openModal("Recibo Inválido",
      `<div style="text-align:center;padding:20px 0">
        <div style="width:60px;height:60px;background:#fee2e2;border-radius:50%;display:flex;
                    align-items:center;justify-content:center;margin:0 auto 14px">
          <i data-lucide="x-circle" style="width:28px;height:28px;color:#dc2626"></i>
        </div>
        <div style="font-size:16px;font-weight:700;color:#dc2626;margin-bottom:6px">Recibo não encontrado</div>
        <div style="font-size:13px;color:#71717a">Este código não foi emitido neste dispositivo.</div>
      </div>
      <button class="btn btn-ghost btn-full" onclick="window._closeModal()" style="margin-top:10px">Fechar</button>`);
    refreshIcons(el("modal-box")); return;
  }

  const isValid = sale.hash === hash || code.startsWith("KONTAKI|") || code.startsWith("K|");
  openModal("Verificação de Recibo",
    `<div style="text-align:center;padding:16px 0">
      <div style="width:60px;height:60px;background:${isValid?"#dcfce7":"#fee2e2"};border-radius:50%;
                  display:flex;align-items:center;justify-content:center;margin:0 auto 14px">
        <i data-lucide="${isValid?"check-circle":"x-circle"}" style="width:28px;height:28px;color:${isValid?"#16a34a":"#dc2626"}"></i>
      </div>
      <div style="font-size:16px;font-weight:700;color:${isValid?"#16a34a":"#dc2626"};margin-bottom:6px">
        ${isValid ? "Recibo Válido" : "Recibo Inválido"}
      </div>
    </div>
    ${isValid ? `
    <div style="background:#f4f4f5;border-radius:12px;padding:14px;font-size:13px;display:flex;flex-direction:column;gap:8px">
      <div style="display:flex;justify-content:space-between"><span style="color:#71717a">Venda</span><span style="font-weight:600">#${sale.id}</span></div>
      <div style="display:flex;justify-content:space-between"><span style="color:#71717a">Data</span><span style="font-weight:600">${fmtDate(sale.date)}</span></div>
      <div style="display:flex;justify-content:space-between"><span style="color:#71717a">Total</span><span style="font-weight:700;color:#16a34a">${fmt(sale.total)}</span></div>
      <div style="display:flex;justify-content:space-between"><span style="color:#71717a">Pagamento</span><span style="font-weight:600">${sale.payMethod}</span></div>
      ${sale.clientName?`<div style="display:flex;justify-content:space-between"><span style="color:#71717a">Cliente</span><span style="font-weight:600">${sale.clientName}</span></div>`:""}
      <div style="display:flex;justify-content:space-between"><span style="color:#71717a">Código</span><span style="font-weight:700;color:#5b21b6;letter-spacing:2px">${sale.hash}</span></div>
    </div>` : ""}
    <button class="btn btn-ghost btn-full" onclick="window._closeModal()" style="margin-top:14px">Fechar</button>`);
  refreshIcons(el("modal-box"));
}

// ── CÂMARA ────────────────────────────────────────────────────────────────────
function onBarcode(code) {
  const p = products.find(x => x.barcode === code || (x.masterBarcode && x.masterBarcode === code));
  if (p) { addToCart(p); if (navigator.vibrate) navigator.vibrate(60); }
  else toast("Produto não encontrado: " + code, "error");
}

// ── PESQUISA ──────────────────────────────────────────────────────────────────
async function renderRecentProducts() {
  const sales  = await db.getAll("sales");
  const recent = sales.slice(-30).reverse();
  const seen   = new Set();
  const recProd = [];
  for (const sale of recent) {
    for (const item of (sale.items||[])) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        const p = products.find(x => x.id === item.id);
        if (p && p.stock > 0) recProd.push(p);
      }
      if (recProd.length >= 4) break;
    }
    if (recProd.length >= 4) break;
  }
  const wrap = el("recent-products");
  if (!wrap || !recProd.length) { if (wrap) wrap.style.display = "none"; return; }
  wrap.style.display = "block";
  wrap.innerHTML =
    `<div class="recentes-label">Recentes</div>` +
    `<div class="recentes-scroll">` +
    recProd.map(p =>
      `<button onclick="window._addProd(${p.id})" class="recente-chip">
        <div class="recente-chip-name">${p.name}</div>
        <div class="recente-chip-price">${fmt(p.price)}</div>
        <div class="recente-chip-stock" style="color:${p.stock<=5?"var(--warning)":"var(--text4)"}">${p.stock} em stock</div>
      </button>`
    ).join("") + `</div>`;
}

function renderSearchResults(f) {
  const wrap = el("search-results");
  if (!wrap) return;
  if (!f.length) { wrap.style.display = "none"; return; }
  wrap.style.display = "block";
  wrap.innerHTML = f.slice(0, 6).map(p =>
    `<div class="search-result-item" onclick="window._addProd(${p.id})">
      <div>
        <div style="font-size:14px;font-weight:600">${p.name}</div>
        <div style="font-size:11px;color:#71717a">${p.category||""} · ${p.stock} ${p.unit||"unid"} em stock</div>
      </div>
      <div style="font-size:14px;font-weight:700;color:#5b21b6">${fmt(p.price)}</div>
    </div>`
  ).join("");
}

window._addProd = (id) => {
  const p = products.find(x => x.id === Number(id));
  if (p) addToCart(p);
};

// ── CARRINHO ──────────────────────────────────────────────────────────────────
function addToCart(p) {
  if (p.stock <= 0) { toast("Produto sem stock.", "error"); return; }
  const ex = cart.find(i => i.id === p.id);
  if (ex) {
    if (ex.qty >= p.stock) { toast("Stock insuficiente.", "error"); return; }
    ex.qty++;
  } else {
    cart.push({ id:p.id, name:p.name, price:p.price, stock:p.stock, unit:p.unit, qty:1 });
  }
  var results = el("search-results");
  if (results) results.style.display = "none";
  var search = el("prod-search");
  if (search) search.value = "";
  if (navigator.vibrate) navigator.vibrate(40);
  renderCart();
  renderSummary();
}

window._changeQty = (id, delta) => {
  const item = cart.find(i => i.id === Number(id));
  if (!item) return;
  const nq = item.qty + delta;
  if (nq <= 0) {
    lastRemoved = { ...item };
    cart = cart.filter(i => i.id !== Number(id));
    showUndo(item.name);
  } else {
    if (nq > item.stock) { toast("Stock insuficiente.", "error"); return; }
    item.qty = nq;
  }
  renderCart(); renderSummary();
};

window._setQty = (id, v) => {
  const nq = parseInt(v);
  if (isNaN(nq) || nq < 0) return;
  if (nq === 0) {
    const item = cart.find(i => i.id === Number(id));
    if (item) { lastRemoved = { ...item }; showUndo(item.name); }
    cart = cart.filter(i => i.id !== Number(id));
    renderCart(); renderSummary(); return;
  }
  const item = cart.find(i => i.id === Number(id));
  if (!item) return;
  if (nq > item.stock) { toast("Stock insuficiente.", "error"); return; }
  item.qty = nq;
  renderCart(); renderSummary();
};

window._removeItem = (id) => {
  const item = cart.find(i => i.id === Number(id));
  if (item) { lastRemoved = { ...item }; showUndo(item.name); }
  cart = cart.filter(i => i.id !== Number(id));
  renderCart(); renderSummary();
};

window._limparCart = limpar;

let undoTimer = null;
function showUndo(name) {
  var old = document.getElementById("undo-toast");
  if (old) old.remove();
  if (undoTimer) clearTimeout(undoTimer);
  const div = document.createElement("div");
  div.id = "undo-toast";
  div.style.cssText = "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#18181b;color:#fff;border-radius:10px;padding:12px 16px;font-size:13px;display:flex;align-items:center;gap:12px;z-index:500;box-shadow:0 4px 16px rgba(0,0,0,.2);font-family:inherit;white-space:nowrap";
  div.innerHTML = `<span style="color:#a1a1aa">${name} removido</span><button onclick="window._undoRemove()" style="background:none;border:none;color:#a78bfa;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit">Desfazer</button>`;
  document.body.appendChild(div);
  undoTimer = setTimeout(() => { div.remove(); lastRemoved = null; }, 4000);
}

window._undoRemove = () => {
  if (!lastRemoved) return;
  const ex = cart.find(i => i.id === lastRemoved.id);
  if (ex) ex.qty += lastRemoved.qty;
  else cart.push({ ...lastRemoved });
  lastRemoved = null;
  var old = document.getElementById("undo-toast");
  if (old) old.remove();
  if (undoTimer) clearTimeout(undoTimer);
  renderCart(); renderSummary();
  toast("Item restaurado.", "success");
};

function renderCart() {
  const count = cart.reduce((a, i) => a + i.qty, 0);
  var countEl = el("cart-count");
  if (countEl) countEl.textContent = count;
  var itemsEl = el("cart-items");
  if (!itemsEl) return;

  // Persistir carrinho
  try { localStorage.setItem("kontaki-cart", JSON.stringify(cart)); } catch(e){}

  if (!cart.length) {
    itemsEl.innerHTML = `<div class="cart-empty-state">
      <i data-lucide="shopping-cart"></i>
      <span>Nenhum produto adicionado</span>
    </div>`;
    refreshIcons(itemsEl);
    return;
  }
  let html = "";
  cart.forEach(item => {
    const isLow = item.qty >= item.stock * 0.8 && item.stock > 0;
    const total = item.price * item.qty;
    html +=
      `<div class="cart-item-row${isLow?" low":""}">` +
      `<div style="flex:1;min-width:0">` +
      `<div class="cart-item-name">${item.name}</div>` +
      `<div class="cart-item-sub">${fmt(item.price)} / un${isLow?" · <span style='color:var(--warning);font-weight:700'>Stock baixo</span>":""}</div>` +
      `</div>` +
      `<div class="qty-ctrl">` +
      `<button onclick="window._changeQty(${item.id},-1)" class="qty-ctrl-btn"><i data-lucide="minus"></i></button>` +
      `<input type="number" value="${item.qty}" min="0" max="${item.stock}" onchange="window._setQty(${item.id},this.value)" class="qty-ctrl-input"/>` +
      `<button onclick="window._changeQty(${item.id},1)" class="qty-ctrl-btn"><i data-lucide="plus"></i></button>` +
      `</div>` +
      `<div style="flex-shrink:0;text-align:right">` +
      `<div class="cart-item-total">${fmt(total)}</div>` +
      `<button onclick="window._removeItem(${item.id})" class="cart-item-remove">remover</button>` +
      `</div></div>`;
  });
  itemsEl.innerHTML = html;
  refreshIcons(itemsEl);
}

function itemTotal(item) { return item.price * item.qty; }

// ── CÁLCULO COM IVA OPCIONAL DA LOJA ──────────────────────────────────────────
let _storeIvaCache = null;
async function getStoreIva() {
  const store = (await db.get("settings","store")) || {};
  _storeIvaCache = Number(store.iva) || 0;
  return _storeIvaCache;
}

function calcTotal() {
  const subtotal = cart.reduce((a, i) => a + i.price * i.qty, 0);
  const disc = Number((el("disc-input") ? el("disc-input").value : "") || 0);
  let da = discType === "pct" ? subtotal * (disc/100) : disc;
  if (da > subtotal) da = subtotal;
  const base = subtotal - da;
  const ivaPct = _storeIvaCache || 0;
  const valorIva = ivaPct > 0 ? base * (ivaPct/100) : 0;
  const total = base + valorIva;
  return { sub: subtotal, da, ivaPct, valorIva, total };
}

async function renderSummary() {
  await getStoreIva();
  const { da, total, ivaPct, valorIva } = calcTotal();
  var totalEl = el("total-val");
  if (totalEl) totalEl.textContent = fmt(total);
  var finBtn = el("btn-finalizar");
  if (finBtn) {
    var cartCount = cart.reduce(function(a,i){return a+i.qty;},0);
    var { getSession } = await import("../auth.js");
    var semTurno = !getSession();
    finBtn.disabled = cartCount === 0 || semTurno;
    finBtn.title = semTurno ? "Abre um turno para vender" : "";
    finBtn.style.opacity = semTurno ? "0.5" : "";
  }
  var totalEl2 = el("total-val");
  if (totalEl2) totalEl2.textContent = fmt(total);

  const discRow = el("disc-amt-row");
  if (discRow) {
    if (da > 0) { discRow.style.display = "flex"; var dv = el("disc-amt-val"); if (dv) dv.textContent = "− " + fmt(da); }
    else discRow.style.display = "none";
  }

  // Linha de IVA dinâmica
  var ivaRow = el("iva-amt-row");
  if (!ivaRow) {
    var totalRow = totalEl ? totalEl.closest("div") : null;
    if (totalRow && totalRow.parentNode) {
      ivaRow = document.createElement("div");
      ivaRow.id = "iva-amt-row";
      ivaRow.style.cssText = "display:none;justify-content:space-between;font-size:13px;color:#d97706;padding:2px 0";
      ivaRow.innerHTML = '<span>IVA <span id="iva-pct-label"></span>%</span><span id="iva-amt-val"></span>';
      totalRow.parentNode.insertBefore(ivaRow, totalRow);
    }
  }
  if (ivaRow) {
    if (ivaPct > 0 && valorIva > 0) {
      ivaRow.style.display = "flex";
      var pl = document.getElementById("iva-pct-label"); if (pl) pl.textContent = ivaPct;
      var iv = document.getElementById("iva-amt-val"); if (iv) iv.textContent = "+ " + fmt(valorIva);
    } else {
      ivaRow.style.display = "none";
    }
  }

  window._calcTroco();
}

window._calcTroco = () => {
  const { total } = calcTotal();
  const recebido  = Number(val("valor-recebido") || 0);
  const trocoBar  = el("troco-bar");
  if (!trocoBar) return;
  if (recebido > 0 && recebido >= total) {
    trocoBar.style.display = "flex";
    const tv = el("troco-val");
    if (tv) tv.textContent = fmt(recebido - total);
  } else {
    trocoBar.style.display = "none";
  }
};

function toggleDiscType() {
  discType = discType === "pct" ? "kz" : "pct";
  var btn = el("btn-disc-type");
  if (btn) btn.textContent = discType === "pct" ? "%" : "Kz";
  setVal("disc-input", "");
  renderSummary();
}

function limpar() {
  cart = []; lastRemoved = null;
  try { localStorage.removeItem("kontaki-cart"); } catch(e){}
  var old = document.getElementById("undo-toast");
  if (old) old.remove();
  payMethod = "dinheiro"; discType = "pct";
  renderCart(); renderSummary();
}

// ── CHECKOUT ──────────────────────────────────────────────────────────────────
async function openCheckout() {
  const { getSession } = await import("../auth.js");
  if (!getSession()) {
    const { toast } = await import("../toast.js");
    toast("Abre um turno antes de vender.", "error");
    return;
  }
  if (!cart.length) { toast("Carrinho vazio.", "error"); return; }
  await getStoreIva();
  const existingClients = await db.getAll("clients");
  const { sub, da, ivaPct, valorIva, total } = calcTotal();
  window._checkoutSub     = sub;
  window._checkoutDa      = da;
  window._checkoutTotal   = total;
  window._checkoutIvaPct  = ivaPct;
  window._checkoutIvaVal  = valorIva;

  openModal("",
    `<div class="ck-header">
      <div class="ck-header-total">${fmt(total)}</div>
      <div class="ck-header-label">${cart.length} ${cart.length===1?"produto":"produtos"} · Total a pagar</div>
    </div>

    <div class="ck-section-label">Método de pagamento</div>
    <div class="ck-pay-grid">
      <button class="ck-pay-btn active" data-method="dinheiro" onclick="window._ckSetPay(this,'dinheiro')">
        <i data-lucide="banknote"></i> Dinheiro
      </button>
      <button class="ck-pay-btn" data-method="transferencia" onclick="window._ckSetPay(this,'transferencia')">
        <i data-lucide="arrow-left-right"></i> Transferência
      </button>
      <button class="ck-pay-btn" data-method="multicaixa" onclick="window._ckSetPay(this,'multicaixa')">
        <i data-lucide="credit-card"></i> Multicaixa
      </button>
      <button class="ck-pay-btn" data-method="fiado" onclick="window._ckSetPay(this,'fiado')">
        <i data-lucide="hand-coins"></i> Fiado
      </button>
    </div>

    <div id="ck-troco-wrap" class="ck-troco-wrap">
      <div class="ck-input-row">
        <i data-lucide="banknote" style="width:16px;height:16px;color:var(--text3);flex-shrink:0"></i>
        <input id="ck-recebido" type="number" placeholder="Valor recebido" oninput="window._ckCalcTroco()"
          style="flex:1;border:none;outline:none;font-size:15px;font-family:inherit;background:transparent;color:var(--text)"/>
        <span style="font-size:13px;color:var(--text3);font-weight:600">Kz</span>
      </div>
      <div id="ck-troco-bar" style="display:none" class="ck-troco-bar">
        <span>Troco</span>
        <span id="ck-troco-val" class="ck-troco-val"></span>
      </div>
    </div>

    <div id="ck-fiado-wrap" style="display:none" class="ck-fiado-wrap">
      <div class="ck-client-search-wrap">
        <div class="ck-input-row" style="border-color:var(--warning);background:#fffbeb;margin-bottom:0">
          <i data-lucide="user" style="width:16px;height:16px;color:var(--warning);flex-shrink:0"></i>
          <input id="ck-name" placeholder="Nome do cliente *" autocomplete="off"
            oninput="window._ckSearchFiadoClient(this.value)"
            style="flex:1;border:none;outline:none;font-size:15px;font-family:inherit;background:transparent;color:var(--text)"/>
          <button id="ck-fiado-client-clear" onclick="window._ckClearFiadoClient()" style="display:none;background:none;border:none;cursor:pointer;padding:0;color:var(--text4)">
            <i data-lucide="x" style="width:16px;height:16px"></i>
          </button>
        </div>
        <div id="ck-fiado-client-results" style="display:none" class="ck-client-results"></div>
      </div>
    </div>

    <div class="ck-details" id="ck-client-section">
      <div class="ck-details-summary" onclick="window._ckToggleClient()" style="cursor:pointer">
        <i data-lucide="user" style="width:14px;height:14px"></i>
        <span id="ck-client-summary-label">Cliente (opcional)</span>
        <i data-lucide="chevron-down" id="ck-client-chevron" style="width:14px;height:14px;margin-left:auto;transition:transform .2s"></i>
      </div>
      <div id="ck-client-body" style="display:none" class="ck-details-body">
        <div class="ck-client-search-wrap">
          <div class="ck-input-row" style="margin-bottom:6px">
            <i data-lucide="user" style="width:16px;height:16px;color:var(--text3);flex-shrink:0"></i>
            <input id="ck-name-opt" placeholder="Nome do cliente"
              autocomplete="off"
              oninput="window._ckSearchClient(this.value)"
              style="flex:1;border:none;outline:none;font-size:15px;font-family:inherit;background:transparent;color:var(--text)"/>
            <button id="ck-client-clear" onclick="window._ckClearClient()" style="display:none;background:none;border:none;cursor:pointer;padding:0;color:var(--text4)">
              <i data-lucide="x" style="width:16px;height:16px"></i>
            </button>
          </div>
          <div id="ck-client-results" style="display:none" class="ck-client-results"></div>
        </div>
        <div id="ck-client-phone-row" style="display:none;align-items:center;gap:8px;padding:8px 10px;background:var(--border2);border-radius:8px;margin-top:4px">
          <i data-lucide="phone" style="width:13px;height:13px;color:var(--text3);flex-shrink:0"></i>
          <span id="ck-client-phone-val" style="font-size:13px;color:var(--text3)"></span>
        </div>
        <div class="ck-input-row" style="margin-top:6px">
          <i data-lucide="phone" style="width:16px;height:16px;color:var(--text3);flex-shrink:0"></i>
          <input id="ck-phone-opt" type="tel" placeholder="Telefone (opcional)"
            autocomplete="off"
            style="flex:1;border:none;outline:none;font-size:15px;font-family:inherit;background:transparent;color:var(--text)"/>
        </div>
      </div>
    </div>

    <details class="ck-details">
      <summary class="ck-details-summary">
        <i data-lucide="receipt" style="width:14px;height:14px"></i>
        Resumo (${cart.length} ${cart.length===1?"item":"itens"})
        <i data-lucide="chevron-down" style="width:14px;height:14px;margin-left:auto"></i>
      </summary>
      <div class="ck-details-body">
        ${cart.map(i=>`
        <div class="ck-item-row">
          <span class="ck-item-name">${i.name} <span class="ck-item-qty">×${i.qty}</span></span>
          <span class="ck-item-total">${fmt(itemTotal(i))}</span>
        </div>`).join("")}
        ${da>0?`<div class="ck-item-row" style="color:var(--success)"><span>Desconto</span><span>− ${fmt(da)}</span></div>`:""}
        <div class="ck-item-row ck-item-total-row">
          <span>Total</span>
          <span id="ck-summary-total">${fmt(total)}</span>
        </div>
      </div>
    </details>

    <button class="ck-confirm-btn" onclick="window._confirmarVenda()">
      <i data-lucide="check"></i>
      Confirmar venda · ${fmt(total)}
    </button>
    <button class="ck-cancel-btn" onclick="window._closeModal()">Cancelar</button>
    <div id="ck-summary-iva" style="display:none"></div>
    <input type="hidden" id="ck-iva-pct" value="0"/>
    <input type="hidden" id="ck-phone" value=""/>
    `);
  refreshIcons(el("modal-box"));

  window._ckClients = existingClients;

  window._ckToggleClient = function() {
    var body = document.getElementById("ck-client-body");
    var chevron = document.getElementById("ck-client-chevron");
    if (!body) return;
    var open = body.style.display === "none";
    body.style.display = open ? "block" : "none";
    if (chevron) chevron.style.transform = open ? "rotate(180deg)" : "";
    if (open) setTimeout(function() { var inp = document.getElementById("ck-name-opt"); if (inp) inp.focus(); }, 100);
  };

  function renderClientResults(results, inputId, resultsId, clearId) {
    var wrap = document.getElementById(resultsId);
    var inp  = document.getElementById(inputId);
    if (!wrap) return;
    if (!results.length) { wrap.style.display = "none"; return; }
    // Posicionar abaixo do input usando coordenadas absolutas
    if (inp) {
      var rect = inp.getBoundingClientRect();
      var spaceBelow = window.innerHeight - rect.bottom;
      var spaceAbove = rect.top;
      // Se há mais espaço acima (teclado aberto), abre para cima
      if (spaceBelow < 200 && spaceAbove > spaceBelow) {
        wrap.style.bottom = (window.innerHeight - rect.top + 6) + "px";
        wrap.style.top    = "auto";
      } else {
        wrap.style.top    = (rect.bottom + 6) + "px";
        wrap.style.bottom = "auto";
      }
      wrap.style.left  = "20px";
      wrap.style.right = "20px";
    }
    wrap.style.display = "block";
    wrap.innerHTML = "";
    results.slice(0,5).forEach(function(c) {
      var item = document.createElement("div");
      item.className = "ck-client-result-item";
      item.innerHTML =
        '<div class="ck-client-result-name">' + c.name + '</div>' +
        (c.phone ? '<div class="ck-client-result-sub">' + c.phone + '</div>' : '');
      item.addEventListener("click", function() {
        window._ckSelectClient(inputId, resultsId, clearId, c.name);
      });
      wrap.appendChild(item);
    });
  }

  window._ckSelectClient = function(inputId, resultsId, clearId, name) {
    var inp = document.getElementById(inputId);
    var res = document.getElementById(resultsId);
    var clr = document.getElementById(clearId);
    if (inp) inp.value = name;
    if (res) res.style.display = "none";
    if (clr) clr.style.display = "flex";
    // Guardar telefone do cliente seleccionado
    var client = (window._ckClients||[]).find(function(c) { return c.name === name; });
    window._ckSelectedPhone = client ? (client.phone || "") : "";
    // Mostrar telefone se existir
    var phoneRow = document.getElementById("ck-client-phone-row");
    if (phoneRow) {
      if (window._ckSelectedPhone) {
        phoneRow.style.display = "flex";
        var phoneVal = document.getElementById("ck-client-phone-val");
        if (phoneVal) phoneVal.textContent = window._ckSelectedPhone;
      } else {
        phoneRow.style.display = "none";
      }
    }
    var lbl = document.getElementById("ck-client-summary-label");
    if (lbl && inputId === "ck-name-opt") lbl.textContent = name;
  };

  window._ckSearchClient = function(q) {
    var clr = document.getElementById("ck-client-clear");
    if (clr) clr.style.display = q ? "flex" : "none";
    if (!q) { var r = document.getElementById("ck-client-results"); if (r) r.style.display = "none"; return; }
    var filtered = (window._ckClients||[]).filter(function(c) {
      return c.name.toLowerCase().includes(q.toLowerCase());
    });
    renderClientResults(filtered, "ck-name-opt", "ck-client-results", "ck-client-clear");
  };

  window._ckClearClient = function() {
    var inp = document.getElementById("ck-name-opt");
    var res = document.getElementById("ck-client-results");
    var clr = document.getElementById("ck-client-clear");
    var lbl = document.getElementById("ck-client-summary-label");
    var phr = document.getElementById("ck-client-phone-row");
    var pho = document.getElementById("ck-phone-opt");
    if (inp) inp.value = "";
    if (res) res.style.display = "none";
    if (clr) clr.style.display = "none";
    if (lbl) lbl.textContent = "Cliente (opcional)";
    if (phr) phr.style.display = "none";
    if (pho) pho.value = "";
    window._ckSelectedPhone = null;
  };

  window._ckSearchFiadoClient = function(q) {
    var clr = document.getElementById("ck-fiado-client-clear");
    if (clr) clr.style.display = q ? "flex" : "none";
    if (!q) { var r = document.getElementById("ck-fiado-client-results"); if (r) r.style.display = "none"; return; }
    var filtered = (window._ckClients||[]).filter(function(c) {
      return c.name.toLowerCase().includes(q.toLowerCase());
    });
    renderClientResults(filtered, "ck-name", "ck-fiado-client-results", "ck-fiado-client-clear");
  };

  window._ckClearFiadoClient = function() {
    var inp = document.getElementById("ck-name");
    var res = document.getElementById("ck-fiado-client-results");
    var clr = document.getElementById("ck-fiado-client-clear");
    if (inp) inp.value = "";
    if (res) res.style.display = "none";
    if (clr) clr.style.display = "none";
  };

  window._ckPayMethod = "dinheiro";

  window._ckRecalcTotal = function() {};
  window._ckSetPay = function(btn, method) {
    window._ckPayMethod = method;
    document.querySelectorAll(".ck-pay-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    var trocoWrap = document.getElementById("ck-troco-wrap");
    if (trocoWrap) trocoWrap.style.display = method === "dinheiro" ? "block" : "none";
    var fiadoWrap = document.getElementById("ck-fiado-wrap");
    if (fiadoWrap) fiadoWrap.style.display = method === "fiado" ? "block" : "none";
    var troco = document.getElementById("ck-troco-bar");
    if (troco && method !== "dinheiro") troco.style.display = "none";
  };

  window._ckCalcTroco = function() {
    var recebido = Number(document.getElementById("ck-recebido").value || 0);
    var bar = document.getElementById("ck-troco-bar");
    if (!bar) return;
    if (recebido > 0 && recebido >= window._checkoutTotal) {
      bar.style.display = "flex";
      var tv = document.getElementById("ck-troco-val");
      if (tv) tv.textContent = fmt(recebido - window._checkoutTotal);
    } else {
      bar.style.display = "none";
    }
  };
}

window._confirmarVenda = async () => {
  const fiadoWrap = document.getElementById("ck-fiado-wrap");
  const isFiado = fiadoWrap && fiadoWrap.style.display !== "none";
  const clientNameFiado = el("ck-name") ? el("ck-name").value.trim() : "";
  const clientNameOpt   = el("ck-name-opt") ? el("ck-name-opt").value.trim() : "";
  const clientName = isFiado ? clientNameFiado : clientNameOpt;
  var clientPhone = window._ckSelectedPhone || "";
  // Se não veio da selecção, tentar campo manual
  if (!clientPhone) {
    var phoneOptEl = document.getElementById("ck-phone-opt");
    if (phoneOptEl) clientPhone = phoneOptEl.value.trim();
  }
  window._ckSelectedPhone = null;
  const method       = window._ckPayMethod || "dinheiro";

  if (method === "fiado" && !clientName) {
    toast("Insere o nome do cliente para venda a fiado.", "error"); return;
  }

  try {
    const store    = (await db.get("settings","store")) || {};
    let   clientId = null;
    if (clientName) {
      const allClients = await db.getAll("clients");
      const match = allClients.find(c => c.name.toLowerCase() === clientName.toLowerCase());
      if (match) {
        clientId = match.id;
        if (clientPhone && !match.phone) await db.put("clients", { ...match, phone:clientPhone });
      } else {
        clientId = await db.add("clients", { name:clientName, phone:clientPhone||"", address:"", notes:"", createdAt:new Date().toISOString() });
      }
    }
    const da       = window._checkoutDa     || 0;
    const ivaEl    = document.getElementById("ck-iva-pct");
    const ivaPct   = ivaEl ? (Number(ivaEl.value)||0) : (window._checkoutIvaPct||0);
    const sub2     = window._checkoutSub || 0;
    const ivaVal   = (sub2 - da) * ivaPct / 100;
    const total    = (sub2 - da) + ivaVal;
    const subtotal = cart.reduce((a,i)=>a+i.price*i.qty,0);
    const saleDate = new Date().toISOString();
    const user     = getUser();

    // Verifica stock antes de confirmar
    for (const item of cart) {
      const available = await getStock(item.id, "shop");
      if (item.qty > available) {
        toast(`Stock insuficiente: ${item.name} (disponível: ${available})`, "error");
        return;
      }
    }

    const recebidoEl = document.getElementById("ck-recebido");
    const recebido   = method==="dinheiro" ? Number(recebidoEl ? recebidoEl.value : 0) || 0 : 0;
    const troco      = recebido > total ? recebido - total : 0;

    const sid = await db.add("sales", {
      items: cart.map(i=>({id:i.id,name:i.name,price:i.price,qty:i.qty})),
      subtotal, discount:da,
      ivaPct, ivaValor:ivaVal,
      total, payMethod:method, date:saleDate,
      userId:user.id, sessionId:user.sessionId||null,
      clientName, clientPhone, clientId,
      fiadoClient: method==="fiado" ? clientName : null,
      recebido, troco,
      hash:null,
    });

    const finalHash = genHash(sid, saleDate);
    const rec       = await db.get("sales", sid);
    await db.put("sales", { ...rec, hash:finalHash });

    // SaleItems
    for (const item of cart) {
      await db.add("saleItems", {
        saleId:sid, productId:item.id, productName:item.name,
        qty:item.qty, unitPrice:item.price, total:item.price*item.qty,
        createdAt:saleDate,
      });
    }

    // StockMovements — fonte de verdade
    for (const item of cart) {
      await addStockMovement({
        productId:item.id, productName:item.name,
        type:"sale", location:"shop", qty:-item.qty,
        reference:`sale#${sid}`, note:`Venda #${sid}`,
      });
    }

    // Fiado
    if (method === "fiado") {
      await db.add("fiado", {
        clientName, clientPhone, clientId, amount:total, amountPaid:0,
        saleId:sid, sessionId:user.sessionId||null, userId:user.id,
        date:saleDate, status:"open", note:"",
      });
    }

    const cartSnap = [...cart];
    closeModal();
    limpar();
    products = await db.getAll("products").then(p => p.filter(x => x.active));
    renderRecentProducts();

    showReceipt({ sid, items:cartSnap, sub:subtotal, da, ivaPct, ivaVal, total, clientName, clientPhone, store, payMethod:method, saleDate, hash:finalHash, recebido, troco, operatorName: (getUser()||{}).name });

  } catch (err) {
    toast("Erro: " + err.message, "error");
    console.error(err);
  }
};

// ── RECIBO ────────────────────────────────────────────────────────────────────
function showReceipt(d) {
  window._lastSaleId = d.sid;
  const storeName  = (d.store&&d.store.name)  || "Kontaki";
  const storeAddr  = (d.store&&d.store.address)|| "";
  const storePhone = (d.store&&d.store.phone)  || "";
  const storeLogo  = (d.store&&d.store.logo)   || "";
  const nif        = (d.store&&d.store.nif)    || "";
  const nItems     = d.items.reduce(function(a,i){return a+i.qty;},0);

  openModal("",
    `<div style="font-family:'DM Sans',Arial,sans-serif">

      <div style="background:linear-gradient(135deg,#059669,#10b981);
                  padding:24px 20px 20px;text-align:center;
                  margin:-20px -20px 0;border-radius:20px 20px 0 0">
        <div style="width:56px;height:56px;background:rgba(255,255,255,.2);
                    border-radius:50%;display:flex;align-items:center;
                    justify-content:center;margin:0 auto 12px;
                    border:2px solid rgba(255,255,255,.4)">
          <i data-lucide="check" style="width:28px;height:28px;color:#fff;stroke-width:3"></i>
        </div>
        <div style="font-size:32px;font-weight:800;color:#fff;letter-spacing:-.5px;line-height:1">${fmt(d.total)}</div>
        <div style="font-size:12px;color:rgba(255,255,255,.8);margin-top:6px">
          ${nItems} ${nItems===1?"item":"itens"} · Venda concluída
        </div>
      </div>

      <div style="border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;margin:16px 0 0">

        <div style="padding:16px;text-align:center;background:#fafafa;border-bottom:1px solid #e5e7eb">
          ${storeLogo?`<img src="${storeLogo}" style="width:40px;height:40px;object-fit:contain;margin:0 auto 8px;display:block;border-radius:8px"/>`:``}
          <div style="font-size:16px;font-weight:800;color:#111827">${storeName}</div>
          ${storeAddr  ? `<div style="font-size:11px;color:#6b7280;margin-top:3px">${storeAddr}</div>`  : ""}
          ${storePhone ? `<div style="font-size:11px;color:#6b7280;margin-top:1px">${storePhone}</div>`                : ""}
          ${nif        ? `<div style="font-size:11px;color:#6b7280;margin-top:1px">NIF: ${nif}</div>`                  : ""}
          <div style="font-size:10px;color:#9ca3af;margin-top:8px;font-weight:600;padding-top:8px;border-top:1px dashed #d1d5db">
            Nº ${String(d.sid).padStart(6,"0")} · ${fmtDate(d.saleDate)}${d.operatorName ? ` · Atendido por ${d.operatorName}` : ""}
          </div>
        </div>

        ${d.clientName ? `
        <div style="padding:10px 16px;border-bottom:1px solid #f3f4f6;
                    display:flex;align-items:center;gap:10px;background:#fff">
          <div style="width:30px;height:30px;background:#f3f4f6;border-radius:8px;
                      display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i data-lucide="user" style="width:13px;height:13px;color:#6b7280"></i>
          </div>
          <div>
            <div style="font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;font-weight:700">Cliente</div>
            <div style="font-size:13px;font-weight:700;color:#111827;margin-top:1px">${d.clientName}</div>
            ${d.clientPhone ? `<div style="font-size:11px;color:#9ca3af;margin-top:1px">${d.clientPhone}</div>` : ""}
          </div>
        </div>` : ""}

        <div style="padding:12px 16px;background:#fff">
          ${d.items.map(i=>`
          <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">
            <div style="flex:1;min-width:0">
              <span style="font-size:13px;color:#374151;font-weight:600">${i.name}</span>
              <span style="font-size:11px;color:#9ca3af;margin-left:6px">×${i.qty}</span>
            </div>
            <span style="font-size:13px;font-weight:700;color:#111827;flex-shrink:0">${fmt(i.price*i.qty)}</span>
          </div>`).join("")}
        </div>

        <div style="padding:12px 16px;background:#fafafa;border-top:1px solid #e5e7eb">
          ${d.da>0?`
          <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0">
            <span style="color:#6b7280">Desconto</span>
            <span style="color:#059669;font-weight:600">− ${fmt(d.da)}</span>
          </div>`:""}
          <div style="display:flex;justify-content:space-between;align-items:center;
                      padding:10px 12px;background:#5b21b6;border-radius:10px;margin-top:6px">
            <span style="font-size:14px;font-weight:700;color:#ddd6fe">Total</span>
            <span style="font-size:20px;font-weight:800;color:#fff">${fmt(d.total)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:8px;color:#6b7280">
            <span style="text-transform:capitalize;font-weight:600">${d.payMethod}</span>
            ${d.recebido>0?`<span>Recebido: ${fmt(d.recebido)} · Troco: <strong style="color:#059669">${fmt(d.troco)}</strong></span>`:""}
          </div>
        </div>

        <div style="padding:14px 16px;display:flex;align-items:center;gap:14px;background:#fff;border-top:1px solid #e5e7eb">
          <div id="receipt-qr" style="flex-shrink:0"></div>
          <div>
            <div style="font-size:9px;color:#9ca3af;text-transform:uppercase;
                        letter-spacing:.6px;margin-bottom:5px;font-weight:700">Verificação</div>
            <div style="font-size:20px;font-weight:800;color:#374151;letter-spacing:3px">${d.hash}</div>
            <div style="font-size:10px;color:#9ca3af;margin-top:4px;line-height:1.5">
              Scan para verificar autenticidade
            </div>
          </div>
        </div>

        <div style="padding:14px 16px;text-align:center;background:#fafafa;border-top:1px solid #e5e7eb">
          <div style="font-size:13px;font-weight:700;color:#374151">Obrigado pela preferência!</div>
          <div style="font-size:11px;color:#9ca3af;margin-top:2px;margin-bottom:10px">Volte sempre</div>
          <div style="font-size:9px;color:#c4c4c8;line-height:1.7;padding-top:8px;border-top:1px dashed #e5e7eb">
            Documento de gestão interna · Sem validade fiscal perante a AGT<br/>
            Powered by Kontaki · Introxeer
          </div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
        <button onclick="window._printRecibo(${d.sid})"
          style="width:100%;padding:14px;background:var(--primary);color:#fff;border:none;
                 border-radius:14px;font-size:14px;font-weight:700;cursor:pointer;
                 font-family:inherit;display:flex;align-items:center;justify-content:center;
                 gap:8px;box-shadow:0 4px 14px rgba(91,33,182,.3)">
          <i data-lucide="printer" style="width:17px;height:17px"></i> Imprimir talão
        </button>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          <button onclick="window._partilharReciboPDF(${d.sid})"
            style="padding:13px 6px;background:#f0fdf4;color:#16a34a;border:none;
                   border-radius:12px;font-size:12px;font-weight:700;cursor:pointer;
                   font-family:inherit;display:flex;align-items:center;justify-content:center;gap:5px">
            <i data-lucide="share-2" style="width:14px;height:14px"></i> WhatsApp
          </button>
          <button onclick="window._gerarReciboPDF(${d.sid})"
            style="padding:13px 6px;background:#ede9fe;color:#5b21b6;border:none;
                   border-radius:12px;font-size:12px;font-weight:700;cursor:pointer;
                   font-family:inherit;display:flex;align-items:center;justify-content:center;gap:5px">
            <i data-lucide="download" style="width:14px;height:14px"></i> PDF
          </button>
          <button onclick="window._closeModal()"
            style="padding:13px 6px;background:#f4f4f5;color:#6b7280;border:none;
                   border-radius:12px;font-size:12px;font-weight:700;cursor:pointer;
                   font-family:inherit;display:flex;align-items:center;justify-content:center;gap:5px">
            <i data-lucide="x" style="width:14px;height:14px"></i> Fechar
          </button>
        </div>
      </div>
    </div>`);

  refreshIcons(el("modal-box"));
  var qrContainer = document.getElementById("receipt-qr");
  if (qrContainer) generateQR("K|" + d.sid + "|" + d.hash, qrContainer, 72);
}

window._gerarReciboPDF     = gerarReciboPDF;
window._partilharReciboPDF = partilharReciboPDF;
window._printRecibo        = printReciboHTML;

window._closeModal = closeModal;
