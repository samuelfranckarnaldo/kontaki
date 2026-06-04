import { db } from "../db.js";
import { fmt, fmtDate, el, val, setVal, refreshIcons, generateQR } from "../utils.js";
import { toast } from "../toast.js";
import { openModal, closeModal } from "../modal.js";
import { getUser } from "../auth.js";
import { initCamera } from "./camera.js";

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
    document.getElementById("verify-overlay").style.display = "none";
    initCamera(onVerifyQR);
  };
  window._verifyByCode = () => {
    const wrap = document.getElementById("verify-code-input");
    wrap.style.display = wrap.style.display === "flex" ? "none" : "flex";
    if (wrap.style.display === "flex") {
      setTimeout(() => (document.getElementById("manual-code") && document.getElementById("manual-code").focus()), 100);
    }
  };
  window._verifyManualCode = async () => {
    const code = (document.getElementById("manual-code") ? document.getElementById("manual-code").value.trim() : "").toUpperCase();
    if (!code) { toast("Insere o código.", "error"); return; }
    document.getElementById("verify-overlay").style.display = "none";
    await verifyCode(code);
  };

  // Botão topbar QR — abre modal de escolha
  const qrBtn = document.getElementById("btn-topbar-qr");
  if (qrBtn) {
    qrBtn.onclick = () => {
      const overlay = document.getElementById("verify-overlay");
      overlay.style.display = "flex";
      document.getElementById("verify-code-input").style.display = "none";
      document.getElementById("manual-code").value = "";
      refreshIcons(overlay);
    };
  }

  el("prod-search").oninput = () => {
    const q = el("prod-search").value.trim().toLowerCase();
    if (!q) { el("search-results").style.display = "none"; return; }
    const f = products.filter(p => p.name.toLowerCase().includes(q) || (p.barcode||"").includes(q));
    renderSearchResults(f);
  };

  el("prod-search").onkeydown = (e) => {
    if (e.key !== "Enter") return;
    const q = el("prod-search").value.trim().toLowerCase();
    const f = products.filter(p => p.name.toLowerCase().includes(q) || (p.barcode||"").includes(q));
    if (f.length === 1) addToCart(f[0]);
  };

  document.querySelectorAll(".pay-method-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      payMethod = btn.dataset.method;
      document.querySelectorAll(".pay-method-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      el("pay-method-desc").textContent = PAY_DESC[payMethod];
      el("fiado-client-wrap").style.display  = payMethod === "fiado"    ? "block" : "none";
      el("troco-wrap").style.display         = payMethod === "dinheiro" ? "block" : "none";
      if (payMethod !== "dinheiro") el("troco-bar").style.display = "none";
    });
  });

  renderRecentProducts();
  renderCart();
  renderSummary();
  refreshIcons(el("pg-vender"));
}

// ── VERIFICAÇÃO ───────────────────────────────────────────────────────────────
function onVerifyQR(code) {
  verifyCode(code);
}

async function verifyCode(code) {
  // Suporta QR completo ou só o hash
  let hash = code;
  let sid  = null;

  if (code.startsWith("KONTAKI|")) {
    const parts = code.split("|");
    sid  = parseInt((parts[1]||"").replace("VENDA#",""));
    hash = parts[4] || "";
  } else if (code.length <= 10) {
    // Código curto — procura por hash
    hash = code.toUpperCase();
  }

  const sales = await db.getAll("sales");
  const sale  = sid
    ? sales.find(s => s.id === sid)
    : sales.find(s => s.hash === hash);

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

  const isValid = sale.hash === hash || code.startsWith("KONTAKI|");
  openModal("Verificação de Recibo",
    `<div style="text-align:center;padding:16px 0">
      <div style="width:60px;height:60px;background:${isValid?"#dcfce7":"#fee2e2"};border-radius:50%;
                  display:flex;align-items:center;justify-content:center;margin:0 auto 14px">
        <i data-lucide="${isValid?"check-circle":"x-circle"}" style="width:28px;height:28px;color:${isValid?"#16a34a":"#dc2626"}"></i>
      </div>
      <div style="font-size:16px;font-weight:700;color:${isValid?"#16a34a":"#dc2626"};margin-bottom:6px">
        ${isValid?"✓ Recibo Válido":"✗ Recibo Inválido"}
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
  const p = products.find(x => x.barcode === code);
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
  if (!f.length) { wrap.style.display = "none"; return; }
  wrap.style.display = "block";
  wrap.innerHTML = f.slice(0, 6).map(p =>
    `<div class="search-result-item" onclick="window._addProd(${p.id})">
      <div>
        <div style="font-size:14px;font-weight:600">${p.name}</div>
        <div style="font-size:11px;color:#71717a">${p.category} · ${p.stock} ${p.unit} em stock</div>
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
  el("search-results").style.display = "none";
  el("prod-search").value = "";
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
  (document.getElementById("undo-toast") && document.getElementById("undo-toast").remove());
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
  (document.getElementById("undo-toast") && document.getElementById("undo-toast").remove());
  if (undoTimer) clearTimeout(undoTimer);
  renderCart(); renderSummary();
  toast("Item restaurado.", "success");
};

function renderCart() {
  const count = cart.reduce((a, i) => a + i.qty, 0);
  el("cart-count").textContent = count;
  if (!cart.length) {
    el("cart-items").innerHTML = `<div style="padding:20px;text-align:center;color:#a1a1aa;font-size:13px">Nenhum produto adicionado</div>`;
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
  el("cart-items").innerHTML = html;
  refreshIcons(el("cart-items"));
}

function itemTotal(item) { return item.price * item.qty; }

function calcTotal() {
  const itemsTotal = cart.reduce((a, i) => a + itemTotal(i), 0);
  const disc = Number((el("disc-input") ? el("disc-input").value : "") || 0);
  const da   = discType === "pct" ? itemsTotal * (disc/100) : Math.min(disc, itemsTotal);
  return { sub: cart.reduce((a,i)=>a+i.price*i.qty,0), da, total: itemsTotal - da };
}

function renderSummary() {
  const { da, total } = calcTotal();
  el("total-val").textContent = fmt(total);
  const discRow = el("disc-amt-row");
  if (da > 0) { discRow.style.display = "flex"; el("disc-amt-val").textContent = "− " + fmt(da); }
  else discRow.style.display = "none";
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
  el("btn-disc-type").textContent = discType === "pct" ? "%" : "Kz";
  setVal("disc-input", "");
  renderSummary();
}

function limpar() {
  cart = []; lastRemoved = null;
  (document.getElementById("undo-toast") && document.getElementById("undo-toast").remove());
  setVal("disc-input", ""); setVal("valor-recebido", "");
  payMethod = "dinheiro"; discType = "pct";
  el("btn-disc-type").textContent = "%";
  document.querySelectorAll(".pay-method-btn").forEach(b => b.classList.remove("active"));
  var _dinBtn2 = document.querySelector('.pay-method-btn[data-method="dinheiro"]'); if (_dinBtn2) _dinBtn2.classList.add("active");
  el("pay-method-desc").textContent = PAY_DESC["dinheiro"];
  el("fiado-client-wrap").style.display = "none";
  el("troco-wrap").style.display        = "block";
  el("troco-bar").style.display         = "none";
  renderCart(); renderSummary();
}

// ── CHECKOUT ──────────────────────────────────────────────────────────────────
function openCheckout() {
  if (!cart.length) { toast("Carrinho vazio.", "error"); return; }
  const { da, total } = calcTotal();
  window._checkoutDa    = da;
  window._checkoutTotal = total;
  openModal("Finalizar Venda",
    `<div style="display:flex;flex-direction:column;gap:12px;margin-bottom:14px">
      <div class="field"><label>Nome do cliente (opcional)</label><input id="ck-name" placeholder="Ex: João Silva"/></div>
      <div class="field"><label>Telefone (opcional)</label><input id="ck-phone" placeholder="Ex: 923 000 000" type="tel"/></div>
    </div>
    <div style="background:#f4f4f5;border-radius:12px;padding:12px;margin-bottom:12px">
      <div style="font-size:10px;color:#a1a1aa;font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Resumo</div>
      ${cart.map(i=>`<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0"><span style="color:#71717a">${i.name} ×${i.qty}</span><span style="font-weight:600">${fmt(itemTotal(i))}</span></div>`).join("")}
      ${da>0?`<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0;border-top:1px solid #e4e4e7;margin-top:6px;padding-top:6px"><span style="color:#71717a">Desconto</span><span style="color:#dc2626;font-weight:600">− ${fmt(da)}</span></div>`:""}
      <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700;border-top:1px solid #e4e4e7;margin-top:6px;padding-top:8px"><span>Total</span><span style="color:#16a34a">${fmt(total)}</span></div>
    </div>
    <div style="background:#ede9fe;border-radius:10px;padding:10px 12px;font-size:13px;color:#7c3aed;margin-bottom:16px"><strong>Pagamento:</strong> ${payMethod}</div>
    <div class="form-actions">
      <button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>
      <button class="btn btn-primary btn-full" onclick="window._confirmarVenda()"><i data-lucide="check"></i> Confirmar</button>
    </div>`);
  refreshIcons(el("modal-box"));
}

window._confirmarVenda = async () => {
  const da    = window._checkoutDa    || 0;
  const total = window._checkoutTotal || 0;
  const clientName  = (el("ck-name") ? el("ck-name").value.trim() : "")  || "";
  const clientPhone = (el("ck-phone") ? el("ck-phone").value.trim() : "")  || "";
  const fc          = val("fiado-client");
  if (payMethod === "fiado" && !fc.trim() && !clientName) {
    toast("Insira o nome do cliente para fiado.", "error"); return;
  }
  try {
    const store    = (await db.get("settings","store")) || {};
    const saleDate = new Date().toISOString();
    const sub      = cart.reduce((a,i) => a+i.price*i.qty, 0);
    const sid      = await db.add("sales", {
      items: cart.map(i=>({id:i.id,name:i.name,price:i.price,qty:i.qty,itemDisc:0})),
      subtotal:sub, discount:da, total, payMethod, date:saleDate,
      userId:getUser().id, sessionId:getUser().sessionId,
      clientName, clientPhone,
      fiadoClient: payMethod==="fiado"?(fc||clientName):null,
    });
    const finalHash = genHash(sid, saleDate);
    const rec       = await db.get("sales", sid);
    await db.put("sales", { ...rec, hash:finalHash });
    for (const item of cart) {
      const p = await db.get("products", item.id);
      if (p) await db.put("products", { ...p, stock: p.stock - item.qty });
    }
    if (payMethod === "fiado") {
      await db.add("fiado", { clientName:fc||clientName, amount:total, saleId:sid, date:saleDate, status:"open", userId:getUser().id, notes:"" });
    }
    const cartSnap = [...cart];
    closeModal(); limpar();
    products = await db.getAll("products").then(p => p.filter(x => x.active));
    renderRecentProducts();
    showReceipt({ sid, items:cartSnap, sub, da, total, clientName, clientPhone, store, payMethod, saleDate, hash:finalHash });
  } catch (err) {
    toast("Erro: " + err.message, "error");
    console.error(err);
  }
};

// ── RECIBO COM QR OFFLINE ─────────────────────────────────────────────────────
function showReceipt({ sid, items, sub, da, total, clientName, clientPhone, store, payMethod, saleDate, hash }) {
  const dateStr   = fmtDate(saleDate);
  const storeName = store.name || "Kontaki";
  const qrData    = `KONTAKI|VENDA#${sid}|${fmt(total)}|${dateStr}|${hash}`;

  openModal(`Recibo #${sid}`,
    `<div id="recibo-content" style="font-family:monospace;max-width:300px;margin:0 auto;font-size:13px;line-height:1.6">
      <div style="text-align:center;border-bottom:2px dashed #ccc;padding-bottom:12px;margin-bottom:12px">
        <div style="font-size:16px;font-weight:700">${storeName}</div>
        ${store.address?`<div style="font-size:11px;color:#555">${store.address}</div>`:""}
        ${store.phone?`<div style="font-size:11px;color:#555">${store.phone}</div>`:""}
        <div style="font-size:11px;color:#777">Recibo Nº ${sid} · ${dateStr}</div>
      </div>
      ${clientName||clientPhone?`<div style="border-bottom:1px dashed #ccc;padding-bottom:8px;margin-bottom:8px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#777;margin-bottom:3px">Cliente</div>${clientName?`<div>${clientName}</div>`:""}${clientPhone?`<div style="color:#555">${clientPhone}</div>`:""}</div>`:""}
      <div style="border-bottom:1px dashed #ccc;padding-bottom:8px;margin-bottom:8px">
        ${items.map(i=>`<div style="display:flex;justify-content:space-between;margin-bottom:3px"><span>${i.name} ×${i.qty}</span><span style="font-weight:700">${fmt(i.price*i.qty)}</span></div>`).join("")}
      </div>
      <div style="border-bottom:2px dashed #ccc;padding-bottom:8px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between"><span style="color:#555">Subtotal</span><span>${fmt(sub)}</span></div>
        ${da>0?`<div style="display:flex;justify-content:space-between"><span style="color:#555">Desconto</span><span style="color:#c00">− ${fmt(da)}</span></div>`:""}
        <div style="display:flex;justify-content:space-between;font-weight:700;font-size:15px;margin-top:4px"><span>TOTAL</span><span>${fmt(total)}</span></div>
        <div style="font-size:11px;color:#555;margin-top:3px">Pagamento: ${payMethod}</div>
      </div>
      <div style="text-align:center;margin-bottom:10px">
        <div id="qr-container" style="display:flex;justify-content:center;margin-bottom:6px"></div>
        <div style="font-size:11px;color:#555">Código: <strong style="letter-spacing:2px">${hash}</strong></div>
        <div style="font-size:10px;color:#888">Scan para verificar autenticidade</div>
      </div>
      <div style="border-top:1px dashed #ccc;padding-top:8px;text-align:center;font-size:10px;color:#888">
        <div>Documento de gestão interna.</div>
        <div>Sem validade fiscal perante a AGT.</div>
        <div style="margin-top:4px;font-weight:700;color:#5b21b6">Powered by Kontaki · Introxeer Technology</div>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-ghost btn-full" onclick="window._printReceipt()"><i data-lucide="printer"></i> Imprimir</button>
      <button class="btn btn-primary btn-full" onclick="window._shareReceipt(${sid},${total},'${hash}','${storeName.replace(/'/g,"\\'")}')"><i data-lucide="share-2"></i> Partilhar</button>
    </div>
    <button class="btn btn-ghost btn-full" onclick="window._closeModal()" style="margin-top:8px">Fechar</button>`);

  refreshIcons(el("modal-box"));

  // Gera QR offline
  setTimeout(() => {
    const container = document.getElementById("qr-container");
    if (container) generateQR(qrData, container, 110);
  }, 100);
}

window._printReceipt = () => {
  const content = (document.getElementById("recibo-content") ? document.getElementById("recibo-content").innerHTML : "");
  if (!content) return;
  const win = window.open("","_blank");
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Recibo</title>
    <style>body{font-family:monospace;max-width:300px;margin:20px auto;font-size:13px}@media print{body{margin:0}}</style>
    </head><body>${content}<script>window.onload=()=>{window.print();window.close();}<\/script></body></html>`);
  win.document.close();
};

window._shareReceipt = async (sid, total, hash, storeName) => {
  const sale    = await db.get("sales", sid);
  const line    = "━━━━━━━━━━━━━━━━━━━━━";
  const dateStr = fmtDate(sale.date);
  const items   = (sale.items||[]).map(i => {
    const name = i.name.length > 16 ? i.name.slice(0,14)+".." : i.name.padEnd(16);
    return `${name} ×${i.qty}  ${fmt(i.price*i.qty)}`;
  }).join("\n");
  const text =
    `${line}\n    ${storeName.toUpperCase()}\n${line}\n` +
    `Recibo #${sid}\n${dateStr}\n` +
    `──────────────────────\n${items}\n──────────────────────\n` +
    (sale.discount>0?`Desconto:    − ${fmt(sale.discount)}\n`:"") +
    `TOTAL:       ${fmt(sale.total)}\nPagamento:   ${sale.payMethod}\n` +
    `──────────────────────\nCódigo: ${hash}\n${line}\n` +
    `Powered by Kontaki\nIntroxeer Technology\n${line}`;

  if (navigator.share) {
    try { await navigator.share({ title:`Recibo #${sid}`, text }); } catch {}
  } else {
    await navigator.clipboard.writeText(text);
    toast("Recibo copiado para a área de transferência.", "info");
  }
};

window._closeModal = closeModal;
