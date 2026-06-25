import { db } from "../db.js";
import { fmt, fmtDate, el, val, setVal, refreshIcons, generateQR } from "../utils.js";
import { toast } from "../toast.js";
import { openModal, closeModal } from "../modal.js";
import { getUser } from "../auth.js";
import { initCamera } from "./camera.js";
import { addStockMovement, getStock } from "../services.js";
import { gerarReciboPDF, partilharReciboPDF } from "./recibo-pdf.js";
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
  cart     = [];
  _storeIvaCache = null;

  const btnScanner   = el("btn-scanner");
  const btnLimpar    = el("btn-limpar");
  const btnFinalizar = el("btn-finalizar");
  const discInput    = el("disc-input");
  const discType2    = el("btn-disc-type");

  if (!btnScanner || !btnLimpar || !btnFinalizar || !discInput || !discType2) {
    console.warn("[Vender] DOM incompleto — abortando init");
    return;
  }

  btnScanner.onclick   = () => initCamera(onBarcode);
  btnLimpar.onclick    = limpar;
  btnFinalizar.onclick = openCheckout;
  discInput.oninput    = renderSummary;
  discType2.onclick    = toggleDiscType;

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
      initCamera(function(code) {
        verifyCode(code);
      });
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

  document.querySelectorAll(".pay-method-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      payMethod = btn.dataset.method;
      document.querySelectorAll(".pay-method-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      var desc = el("pay-method-desc");
      if (desc) desc.textContent = PAY_DESC[payMethod];
      var fiadoWrap = el("fiado-client-wrap");
      if (fiadoWrap) fiadoWrap.style.display = payMethod === "fiado" ? "block" : "none";
      var trocoWrap = el("troco-wrap");
      if (trocoWrap) trocoWrap.style.display = payMethod === "dinheiro" ? "block" : "none";
      if (payMethod !== "dinheiro") { var tb = el("troco-bar"); if (tb) tb.style.display = "none"; }
    });
  });

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
    `<div class="vender-card-title">Vendidos recentemente</div>` +
    `<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px">` +
    recProd.map(p =>
      `<button onclick="window._addProd(${p.id})"
               style="flex-shrink:0;background:#f4f4f5;border:1.5px solid #e4e4e7;border-radius:10px;
                      padding:10px 14px;cursor:pointer;font-family:inherit;text-align:left;min-width:110px">
        <div style="font-size:12px;font-weight:700;color:#18181b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100px">${p.name}</div>
        <div style="font-size:13px;font-weight:700;color:#5b21b6;margin-top:4px">${fmt(p.price)}</div>
        <div style="font-size:10px;color:${p.stock<=5?"#d97706":"#71717a"};margin-top:2px">${p.stock} em stock</div>
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

  if (!cart.length) {
    itemsEl.innerHTML = `<div style="padding:20px;text-align:center;color:#a1a1aa;font-size:13px">Nenhum produto adicionado</div>`;
    return;
  }
  let html = "";
  cart.forEach(item => {
    const isLow = item.qty >= item.stock * 0.8 && item.stock > 0;
    const total = item.price * item.qty;
    html +=
      `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid #f4f4f5;background:${isLow?"#fffbeb":"#fff"};border-left:3px solid ${isLow?"#d97706":"transparent"}">` +
      `<div style="flex:1;min-width:0">` +
      `<div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.name}</div>` +
      `<div style="font-size:11px;color:#71717a;margin-top:2px">${fmt(item.price)} / un${isLow?" · <span style='color:#d97706;font-weight:700'>Stock baixo</span>":""}</div>` +
      `</div>` +
      `<div style="display:flex;align-items:center;border:1.5px solid #e4e4e7;border-radius:8px;overflow:hidden;flex-shrink:0">` +
      `<button onclick="window._changeQty(${item.id},-1)" style="width:32px;height:32px;background:#f4f4f5;border:none;color:#5b21b6;cursor:pointer;display:flex;align-items:center;justify-content:center"><i data-lucide="minus" style="width:13px;height:13px"></i></button>` +
      `<input type="number" value="${item.qty}" min="0" max="${item.stock}" onchange="window._setQty(${item.id},this.value)" style="width:40px;text-align:center;font-size:14px;font-weight:700;border:none;border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;padding:6px 0;background:#fff;font-family:inherit;color:#18181b"/>` +
      `<button onclick="window._changeQty(${item.id},1)" style="width:32px;height:32px;background:#f4f4f5;border:none;color:#5b21b6;cursor:pointer;display:flex;align-items:center;justify-content:center"><i data-lucide="plus" style="width:13px;height:13px"></i></button>` +
      `</div>` +
      `<div style="min-width:65px;text-align:right;flex-shrink:0">` +
      `<div style="font-size:13px;font-weight:700;color:#5b21b6">${fmt(total)}</div>` +
      `<button onclick="window._removeItem(${item.id})" style="background:none;border:none;color:#dc2626;font-size:10px;cursor:pointer;font-family:inherit;margin-top:2px">remover</button>` +
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
    finBtn.innerHTML = cartCount > 0
      ? '<i data-lucide="check" style="width:16px;height:16px"></i> Finalizar · ' + fmt(total)
      : '<i data-lucide="check" style="width:16px;height:16px"></i> Finalizar';
    if (window.lucide) window.lucide.createIcons({el:finBtn});
  }

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
  var old = document.getElementById("undo-toast");
  if (old) old.remove();
  setVal("disc-input", ""); setVal("valor-recebido", "");
  payMethod = "dinheiro"; discType = "pct";
  var btn = el("btn-disc-type");
  if (btn) btn.textContent = "%";
  document.querySelectorAll(".pay-method-btn").forEach(b => b.classList.remove("active"));
  var dinBtn = document.querySelector('.pay-method-btn[data-method="dinheiro"]');
  if (dinBtn) dinBtn.classList.add("active");
  var desc = el("pay-method-desc");
  if (desc) desc.textContent = PAY_DESC["dinheiro"];
  var fc = el("fiado-client-wrap"); if (fc) fc.style.display = "none";
  var tw = el("troco-wrap"); if (tw) tw.style.display = "block";
  var tb = el("troco-bar"); if (tb) tb.style.display = "none";
  renderCart(); renderSummary();
}

// ── CHECKOUT ──────────────────────────────────────────────────────────────────
async function openCheckout() {
  if (!cart.length) { toast("Carrinho vazio.", "error"); return; }
  await getStoreIva();
  const existingClients = await db.getAll("clients");
  const { sub, da, ivaPct, valorIva, total } = calcTotal();
  window._checkoutSub     = sub;
  window._checkoutDa      = da;
  window._checkoutTotal   = total;
  window._checkoutIvaPct  = ivaPct;
  window._checkoutIvaVal  = valorIva;

  openModal("Finalizar Venda",
    `<div style="display:flex;flex-direction:column;gap:12px;margin-bottom:14px">
      <div class="field"><label>Nome do cliente (opcional)</label><input id="ck-name" list="ck-clients-list" placeholder="Ex: João Silva"/><datalist id="ck-clients-list"></datalist></div>
      <div class="field"><label>Telefone (opcional)</label><input id="ck-phone" placeholder="Ex: 923 000 000" type="tel"/></div>
    </div>
    <div style="background:#f4f4f5;border-radius:12px;padding:12px;margin-bottom:12px">
      <div style="font-size:10px;color:#a1a1aa;font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Resumo</div>
      ${cart.map(i=>`<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0"><span style="color:#71717a">${i.name} ×${i.qty}</span><span style="font-weight:600">${fmt(itemTotal(i))}</span></div>`).join("")}
      ${da>0?`<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0;color:#16a34a"><span>Desconto</span><span>− ${fmt(da)}</span></div>`:""}
      ${ivaPct>0?`<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0;color:#d97706"><span>IVA ${ivaPct}%</span><span>+ ${fmt(valorIva)}</span></div>`:""}
      <div id="ck-summary-iva" style="display:${ivaPct>0?'flex':'none'};justify-content:space-between;font-size:13px;padding:3px 0;color:#d97706"><span>IVA ${ivaPct}%</span><span>+ ${fmt(valorIva)}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:700;padding-top:8px;margin-top:6px;border-top:1.5px solid #e4e4e7">
        <span>Total</span><span id="ck-summary-total" style="color:#5b21b6">${fmt(total)}</span>
      </div>
    </div>

    <div style="display:flex;align-items:center;gap:10px;background:#fef3c7;border-radius:10px;padding:10px 12px;margin-bottom:12px">
      <i data-lucide="percent" style="width:16px;height:16px;color:#92400e;flex-shrink:0"></i>
      <div style="flex:1;font-size:13px;color:#92400e;font-weight:600">IVA</div>
      <input type="number" id="ck-iva-pct" min="0" max="100" step="0.1" value="${ivaPct||0}"
        placeholder="0" oninput="window._ckRecalcTotal()"
        style="width:70px;padding:6px 8px;border:1.5px solid #fde68a;border-radius:8px;text-align:center;font-size:14px;font-weight:700;font-family:inherit;background:#fff"/>
      <span style="font-size:13px;color:#92400e;font-weight:600">%</span>
    </div>
    <div style="font-size:11px;color:#a1a1aa;font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Método de pagamento</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <button class="pay-method-btn-ck active" data-method="dinheiro" onclick="window._ckSetPay(this,'dinheiro')" style="padding:12px;border-radius:10px;border:1.5px solid #5b21b6;background:#ede9fe;color:#5b21b6;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px"><i data-lucide="banknote" style="width:15px;height:15px"></i> Dinheiro</button>
      <button class="pay-method-btn-ck" data-method="transferencia" onclick="window._ckSetPay(this,'transferencia')" style="padding:12px;border-radius:10px;border:1.5px solid #e4e4e7;background:#fff;color:#71717a;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px"><i data-lucide="arrow-left-right" style="width:15px;height:15px"></i> Transferência</button>
      <button class="pay-method-btn-ck" data-method="multicaixa" onclick="window._ckSetPay(this,'multicaixa')" style="padding:12px;border-radius:10px;border:1.5px solid #e4e4e7;background:#fff;color:#71717a;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px"><i data-lucide="credit-card" style="width:15px;height:15px"></i> Multicaixa</button>
      <button class="pay-method-btn-ck" data-method="fiado" onclick="window._ckSetPay(this,'fiado')" style="padding:12px;border-radius:10px;border:1.5px solid #e4e4e7;background:#fff;color:#71717a;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px"><i data-lucide="hand-coins" style="width:15px;height:15px"></i> Fiado</button>
    </div>
    <div id="ck-pay-desc" style="font-size:12px;color:#71717a;margin-bottom:12px">${PAY_DESC.dinheiro}</div>

    <div id="ck-troco-wrap" style="margin-bottom:12px">
      <div class="field"><label>Valor recebido (opcional)</label><input id="ck-recebido" type="number" placeholder="Ex: 5000" oninput="window._ckCalcTroco()"/></div>
      <div id="ck-troco-bar" style="display:none;margin-top:8px;background:#dcfce7;border-radius:10px;padding:10px;display:flex;justify-content:space-between">
        <span style="font-size:13px;color:#15803d;font-weight:600">Troco</span>
        <span id="ck-troco-val" style="font-size:14px;font-weight:700;color:#15803d"></span>
      </div>
    </div>

    <div class="form-actions">
      <button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>
      <button class="btn btn-primary btn-full" onclick="window._confirmarVenda()">
        <i data-lucide="check"></i> Confirmar venda
      </button>
    </div>`);
  refreshIcons(el("modal-box"));

  var datalist = document.getElementById("ck-clients-list");
  if (datalist) datalist.innerHTML = existingClients.map(c => `<option value="${c.name}">`).join("");

  window._ckPayMethod = "dinheiro";

  window._ckRecalcTotal = function() {
    var ivaPctNew = Number(document.getElementById("ck-iva-pct").value) || 0;
    window._checkoutIvaPct = ivaPctNew;
    var sub  = window._checkoutSub || 0;
    var da   = window._checkoutDa  || 0;
    var base = sub - da;
    var ivaVal = base * ivaPctNew / 100;
    var total  = base + ivaVal;
    window._checkoutIvaVal = ivaVal;
    window._checkoutTotal  = total;
    var summaryTotal = document.getElementById("ck-summary-total");
    if (summaryTotal) summaryTotal.textContent = fmt(total);
    var summaryIva = document.getElementById("ck-summary-iva");
    if (summaryIva) {
      summaryIva.style.display = ivaPctNew > 0 ? "flex" : "none";
      summaryIva.querySelector("span:last-child").textContent = "+ " + fmt(ivaVal);
      summaryIva.querySelector("span:first-child").textContent = "IVA " + ivaPctNew + "%";
    }
  };
  window._ckSetPay = function(btn, method) {
    window._ckPayMethod = method;
    document.querySelectorAll(".pay-method-btn-ck").forEach(b => {
      b.classList.remove("active");
      b.style.border = "1.5px solid #e4e4e7";
      b.style.background = "#fff";
      b.style.color = "#71717a";
    });
    btn.classList.add("active");
    btn.style.border = "1.5px solid #5b21b6";
    btn.style.background = "#ede9fe";
    btn.style.color = "#5b21b6";
    var desc = document.getElementById("ck-pay-desc");
    if (desc) desc.textContent = PAY_DESC[method];
    var trocoWrap = document.getElementById("ck-troco-wrap");
    if (trocoWrap) trocoWrap.style.display = method === "dinheiro" ? "block" : "none";
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
  const clientName  = el("ck-name")  ? el("ck-name").value.trim()  : "";
  const clientPhone = el("ck-phone") ? el("ck-phone").value.trim() : "";
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

    showReceipt({ sid, items:cartSnap, sub:subtotal, da, ivaPct, ivaVal, total, clientName, clientPhone, store, payMethod:method, saleDate, hash:finalHash, recebido, troco });

  } catch (err) {
    toast("Erro: " + err.message, "error");
    console.error(err);
  }
};

// ── RECIBO ────────────────────────────────────────────────────────────────────
function showReceipt(d) {
  window._lastSaleId = d.sid;
  const storeName = (d.store&&d.store.name)||"Kontaki";
  const storeAddr = (d.store&&d.store.address)||"";
  const storePhone= (d.store&&d.store.phone)||"";
  const storeLogo = (d.store&&d.store.logo)||"";
  const nif       = (d.store&&d.store.nif)||"";

  openModal("",
    `<div style="background:#fff;font-family:'DM Sans',Arial,sans-serif">

      <!-- Cabeçalho verde sucesso -->
      <div style="background:linear-gradient(135deg,#059669,#10b981);padding:20px 16px;text-align:center;margin:-20px -20px 0;border-radius:16px 16px 0 0">
        <div style="width:52px;height:52px;background:rgba(255,255,255,.25);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 10px">
          <i data-lucide="check" style="width:26px;height:26px;color:#fff;stroke-width:3"></i>
        </div>
        <div style="font-size:22px;font-weight:700;color:#fff;margin-bottom:2px">${fmt(d.total)}</div>
        <div style="font-size:12px;color:rgba(255,255,255,.8)">Venda concluída</div>
      </div>

      <!-- Corpo do recibo — estilo talão -->
      <div style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin:16px 0 14px">

        <!-- Info da loja -->
        <div style="padding:14px 16px;text-align:center;background:#f9fafb;border-bottom:1px dashed #d1d5db">
          ${storeLogo?`<img src="${storeLogo}" style="width:36px;height:36px;object-fit:contain;margin:0 auto 6px;display:block;border-radius:6px"/>`:``}
          <div style="font-size:14px;font-weight:700;color:#111827">${storeName}</div>
          ${storeAddr?`<div style="font-size:11px;color:#6b7280;margin-top:1px">${storeAddr}</div>`:""}
          ${storePhone?`<div style="font-size:11px;color:#6b7280">${storePhone}</div>`:""}
          ${nif?`<div style="font-size:11px;color:#6b7280">NIF: ${nif}</div>`:""}
          <div style="font-size:10px;color:#9ca3af;margin-top:6px">Nº ${String(d.sid).padStart(6,"0")} · ${fmtDate(d.saleDate)}</div>
        </div>

        ${d.clientName?`<div style="padding:10px 16px;border-bottom:1px dashed #d1d5db;display:flex;align-items:center;gap:8px"><i data-lucide="user" style="width:13px;height:13px;color:#6b7280;flex-shrink:0"></i><span style="font-size:13px;font-weight:600;color:#111827">${d.clientName}</span></div>`:""}

        <!-- Itens -->
        <div style="padding:12px 16px;border-bottom:1px dashed #d1d5db">
          ${d.items.map(i=>`
          <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0">
            <div>
              <span style="font-size:13px;color:#374151">${i.name}</span>
              <span style="font-size:11px;color:#9ca3af;margin-left:6px">×${i.qty}</span>
            </div>
            <span style="font-size:13px;font-weight:600;color:#111827">${fmt(i.price*i.qty)}</span>
          </div>`).join("")}
        </div>

        <!-- Totais -->
        <div style="padding:12px 16px;border-bottom:1px dashed #d1d5db;background:#f9fafb">
          ${d.da>0?`<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0"><span style="color:#6b7280">Desconto</span><span style="color:#059669;font-weight:600">− ${fmt(d.da)}</span></div>`:""}
          ${d.ivaPct>0?`<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0"><span style="color:#6b7280">IVA ${d.ivaPct}%</span><span style="color:#d97706;font-weight:600">+ ${fmt(d.ivaVal)}</span></div>`:""}
          <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;margin-top:4px;border-top:1.5px solid #e5e7eb">
            <span style="font-size:15px;font-weight:700;color:#111827">TOTAL</span>
            <span style="font-size:18px;font-weight:700;color:#5b21b6">${fmt(d.total)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:6px">
            <span style="color:#6b7280;text-transform:capitalize">${d.payMethod}</span>
            ${d.recebido>0?`<span style="color:#6b7280">Recebido: ${fmt(d.recebido)} · Troco: <strong style="color:#059669">${fmt(d.troco)}</strong></span>`:""}
          </div>
        </div>

        <!-- QR + Código -->
        <div style="padding:14px 16px;text-align:center">
          <div id="receipt-qr" style="display:flex;justify-content:center;margin-bottom:8px"></div>
          <div style="font-size:14px;font-weight:700;color:#5b21b6;letter-spacing:4px">${d.hash}</div>
          <div style="font-size:9px;color:#9ca3af;margin-top:3px">Scan para verificar autenticidade</div>
        </div>

        <!-- Rodapé -->
        <div style="padding:8px 16px;text-align:center;background:#f9fafb;border-top:1px dashed #d1d5db">
          <div style="font-size:8px;color:#9ca3af;line-height:1.6">Documento de gestão interna · Sem validade fiscal perante a AGT<br/>Powered by Kontaki · Introxeer Technology</div>
        </div>
      </div>

      <!-- Botões de acção -->
      <div style="display:flex;flex-direction:column;gap:8px">
        <button onclick="window._partilharReciboPDF(${d.sid})" style="padding:13px;background:#25D366;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px">
          <i data-lucide="share-2" style="width:16px;height:16px"></i> Partilhar
        </button>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button onclick="window._gerarReciboPDF(${d.sid})" style="padding:12px;background:#ede9fe;color:#5b21b6;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px">
            <i data-lucide="printer" style="width:15px;height:15px"></i> PDF
          </button>
          <button onclick="window._closeModal()" style="padding:12px;background:#f4f4f5;color:#6b7280;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">
            Fechar
          </button>
        </div>
      </div>
    </div>`);

  refreshIcons(el("modal-box"));
  var qrContainer = document.getElementById("receipt-qr");
  if (qrContainer) generateQR("K|" + d.sid + "|" + d.hash, qrContainer, 120);
}

window._gerarReciboPDF     = gerarReciboPDF;
window._partilharReciboPDF = partilharReciboPDF;

window._closeModal = closeModal;
