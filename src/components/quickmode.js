import { db } from "../db.js";
import { fmt, el, refreshIcons } from "../utils.js";
import { toast } from "../toast.js";
import { getUser } from "../auth.js";
import { initCamera } from "./camera.js";

let qmProducts  = [];
let qmCart      = [];
let qmPayMethod = "dinheiro";

function genHash(sid, date) {
  const str = "KONTAKI-" + sid + "-" + date;
  let h = 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return Math.abs(h).toString(36).toUpperCase().slice(0, 6);
}

export function initQuickMode() {
  const btn = document.getElementById("btn-topbar-quick");
  if (btn) btn.addEventListener("click", openQuickMode);
}

async function openQuickMode() {
  qmProducts  = await db.getAll("products").then(p => p.filter(x => x.active));
  qmCart      = [];
  qmPayMethod = "dinheiro";

  const overlay = document.getElementById("quick-mode");
  if (!overlay) return;
  overlay.style.display = "flex";

  resetSearch();
  renderQmCart();
  renderQmTotal();
  resetPayBtns();

  if (window.lucide) window.lucide.createIcons({ nodes: [overlay] });

  // Botões fixos
  bindBtn("btn-qm-close", () => { overlay.style.display = "none"; qmCart = []; });
  bindBtn("btn-qm-scan",  () => initCamera(onQmBarcode));
  bindBtn("btn-qm-finalizar", finalizarQm);
  bindBtn("btn-qm-cancel", () => {
    if (qmCart.length > 0) {
      if (!confirm("Cancelar a venda? O carrinho será limpo.")) return;
    }
    qmCart = [];
    renderQmCart();
    renderQmTotal();
    resetSearch();
    document.getElementById("qm-search").focus();
  });
  bindBtn("btn-qm-cancel", () => {
    if (qmCart.length > 0) {
      if (!confirm("Cancelar a venda? O carrinho será limpo.")) return;
    }
    qmCart = [];
    renderQmCart();
    renderQmTotal();
    resetSearch();
    document.getElementById("qm-search").focus();
  });

  // Pesquisa
  const inp = document.getElementById("qm-search");
  const newInp = inp.cloneNode(true);
  inp.parentNode.replaceChild(newInp, inp);
  newInp.addEventListener("input", () => {
    const q = newInp.value.trim().toLowerCase();
    if (!q) { document.getElementById("qm-results").style.display = "none"; return; }
    renderQmResults(qmProducts.filter(p =>
      p.name.toLowerCase().includes(q) || (p.barcode||"").includes(q)
    ));
  });
  newInp.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    const q = newInp.value.trim().toLowerCase();
    const f = qmProducts.filter(p => p.name.toLowerCase().includes(q) || (p.barcode||"").includes(q));
    if (f.length === 1) addToQmCart(f[0]);
  });
  newInp.focus();

  // Pagamento
  document.querySelectorAll(".qm-pay-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      qmPayMethod = btn.dataset.method;
      resetPayBtns();
      btn.style.borderColor = "#5b21b6";
      btn.style.background  = "#ede9fe";
      btn.style.color       = "#5b21b6";
      document.getElementById("qm-fiado-wrap").style.display =
        qmPayMethod === "fiado" ? "block" : "none";
    });
  });
}

function bindBtn(id, fn) {
  const el = document.getElementById(id);
  if (!el) return;
  const clone = el.cloneNode(true);
  el.parentNode.replaceChild(clone, el);
  clone.addEventListener("click", fn);
}

function resetPayBtns() {
  document.querySelectorAll(".qm-pay-btn").forEach(b => {
    b.style.borderColor = "#e4e4e7";
    b.style.background  = "#fff";
    b.style.color       = "#71717a";
  });
  const d = document.querySelector('.qm-pay-btn[data-method="dinheiro"]');
  if (d) { d.style.borderColor="#5b21b6"; d.style.background="#ede9fe"; d.style.color="#5b21b6"; }
}

function resetSearch() {
  const inp = document.getElementById("qm-search");
  if (inp) inp.value = "";
  document.getElementById("qm-results").style.display = "none";
}

function onQmBarcode(code) {
  const p = qmProducts.find(x => x.barcode === code);
  if (p) { addToQmCart(p); if (navigator.vibrate) navigator.vibrate(60); }
  else toast("Produto não encontrado.", "error");
}

function renderQmResults(f) {
  const wrap = document.getElementById("qm-results");
  if (!f.length) { wrap.style.display = "none"; return; }
  wrap.style.display = "block";
  wrap.innerHTML = f.slice(0, 5).map(p =>
    `<div onclick="window._qmAdd(${p.id})"
          style="padding:13px 16px;border-bottom:1px solid #f4f4f5;cursor:pointer;
                 display:flex;justify-content:space-between;align-items:center;background:#fff">
      <div>
        <div style="font-size:14px;font-weight:600;color:#18181b">${p.name}</div>
        <div style="font-size:11px;color:#71717a;margin-top:2px">${p.category} · ${p.stock} ${p.unit}</div>
      </div>
      <div style="font-size:14px;font-weight:700;color:#5b21b6;flex-shrink:0">${fmt(p.price)}</div>
    </div>`
  ).join("");
}

window._qmAdd = (id) => {
  const p = qmProducts.find(x => x.id === Number(id));
  if (p) addToQmCart(p);
};

function addToQmCart(p) {
  if (p.stock <= 0) { toast("Produto sem stock.", "error"); return; }
  const ex = qmCart.find(i => i.id === p.id);
  if (ex) {
    if (ex.qty >= p.stock) { toast("Stock insuficiente.", "error"); return; }
    ex.qty++;
  } else {
    qmCart.push({ id:p.id, name:p.name, price:p.price, stock:p.stock, unit:p.unit, qty:1 });
  }
  resetSearch();
  document.getElementById("qm-search").value = "";
  document.getElementById("qm-search").focus();
  if (navigator.vibrate) navigator.vibrate(40);
  renderQmCart();
  renderQmTotal();
}

function renderQmCart() {
  const wrap = document.getElementById("qm-cart");
  if (!wrap) return;

  if (!qmCart.length) {
    wrap.innerHTML = `<div style="padding:20px;text-align:center;color:#a1a1aa;font-size:13px">
      Pesquisa ou scan um produto para adicionar
    </div>`;
    return;
  }

  wrap.innerHTML = qmCart.map(item => `
    <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;
                border-bottom:1px solid #f4f4f5;background:#fff">
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.name}</div>
        <div style="font-size:11px;color:#71717a;margin-top:2px">${fmt(item.price)} / un</div>
      </div>
      <div style="display:flex;align-items:center;border:1.5px solid #e4e4e7;border-radius:8px;overflow:hidden;flex-shrink:0">
        <button onclick="window._qmChangeQty(${item.id},-1)"
                style="width:32px;height:32px;background:#f4f4f5;border:none;color:#5b21b6;
                       cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center">
          <i data-lucide="minus" style="width:14px;height:14px"></i>
        </button>
        <span style="width:36px;text-align:center;font-size:15px;font-weight:700;
                     border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;
                     padding:6px 0;display:block">${item.qty}</span>
        <button onclick="window._qmChangeQty(${item.id},1)"
                style="width:32px;height:32px;background:#f4f4f5;border:none;color:#5b21b6;
                       cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center">
          <i data-lucide="plus" style="width:14px;height:14px"></i>
        </button>
      </div>
      <div style="min-width:65px;text-align:right;flex-shrink:0">
        <div style="font-size:13px;font-weight:700;color:#5b21b6">${fmt(item.price*item.qty)}</div>
        <button onclick="window._qmRemove(${item.id})"
                style="background:none;border:none;color:#dc2626;font-size:10px;
                       cursor:pointer;font-family:inherit;margin-top:2px">remover</button>
      </div>
    </div>`).join("");

  refreshIcons(wrap);
}

window._qmChangeQty = (id, delta) => {
  const item = qmCart.find(i => i.id === Number(id));
  if (!item) return;
  const nq = item.qty + delta;
  if (nq <= 0) { qmCart = qmCart.filter(i => i.id !== Number(id)); }
  else if (nq > item.stock) { toast("Stock insuficiente.", "error"); return; }
  else item.qty = nq;
  renderQmCart();
  renderQmTotal();
};

window._qmRemove = (id) => {
  qmCart = qmCart.filter(i => i.id !== Number(id));
  renderQmCart();
  renderQmTotal();
};

function renderQmTotal() {
  const total = qmCart.reduce((a, i) => a + i.price * i.qty, 0);
  const count = qmCart.reduce((a, i) => a + i.qty, 0);
  const totalEl = document.getElementById("qm-total");
  const countEl = document.getElementById("qm-count");
  if (totalEl) totalEl.textContent = fmt(total);
  if (countEl) countEl.textContent = count;
}

async function finalizarQm() {
  if (!qmCart.length) { toast("Carrinho vazio.", "error"); return; }
  const fc = (document.getElementById("qm-fiado-client") ? document.getElementById("qm-fiado-client").value.trim() : "") || "";
  if (qmPayMethod === "fiado" && !fc) {
    toast("Insira o nome do cliente para fiado.", "error"); return;
  }

  const total    = qmCart.reduce((a, i) => a + i.price * i.qty, 0);
  const sub      = total;
  const saleDate = new Date().toISOString();

  try {
    const store = (await db.get("settings","store")) || {};
    const sid   = await db.add("sales", {
      items:       qmCart.map(i => ({ id:i.id, name:i.name, price:i.price, qty:i.qty, itemDisc:0 })),
      subtotal:    sub, discount:0, total,
      payMethod:   qmPayMethod, date:saleDate,
      userId:      getUser().id, sessionId:getUser().sessionId,
      clientName:  fc, clientPhone:"",
      fiadoClient: qmPayMethod === "fiado" ? fc : null,
      quickMode:   true,
    });

    const hash = genHash(sid, saleDate);
    const rec  = await db.get("sales", sid);
    await db.put("sales", { ...rec, hash });

    for (const item of qmCart) {
      const p = await db.get("products", item.id);
      if (p) await db.put("products", { ...p, stock: p.stock - item.qty });
    }

    if (qmPayMethod === "fiado") {
      await db.add("fiado", {
        clientName:fc, amount:total, saleId:sid,
        date:saleDate, status:"open", userId:getUser().id, notes:"",
      });
    }

    if (navigator.vibrate) navigator.vibrate([60,40,60]);
    showQmSuccess({ sid, total, payMethod: qmPayMethod, itemCount: qmCart.length });
    qmCart     = [];
    qmProducts = await db.getAll("products").then(pr => pr.filter(x => x.active));

  } catch (err) {
    toast("Erro: " + err.message, "error");
    console.error(err);
  }
}

function showQmSuccess({ sid, total, payMethod, itemCount }) {
  const div = document.createElement("div");
  div.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:#5b21b6;z-index:260;display:flex;flex-direction:column;align-items:center;justify-content:center";
  div.innerHTML =
    `<div style="width:80px;height:80px;background:rgba(255,255,255,.2);border-radius:50%;
                 display:flex;align-items:center;justify-content:center;margin-bottom:20px">
      <i data-lucide="check" style="width:40px;height:40px;color:#fff"></i>
    </div>
    <div style="font-size:22px;font-weight:700;color:#fff;margin-bottom:8px">Venda registada!</div>
    <div style="font-size:32px;font-weight:700;color:#ddd6fe;margin-bottom:6px">${fmt(total)}</div>
    <div style="font-size:14px;color:rgba(255,255,255,.7);margin-bottom:32px">
      #${sid} · ${itemCount} produto(s) · ${payMethod}
    </div>
    <button onclick="this.parentElement.remove();window._qmNewSale()"
            style="background:rgba(255,255,255,.2);border:2px solid rgba(255,255,255,.4);
                   border-radius:12px;color:#fff;padding:16px 36px;font-size:16px;
                   font-weight:700;cursor:pointer;font-family:inherit">
      Nova venda
    </button>`;
  document.body.appendChild(div);
  if (window.lucide) window.lucide.createIcons({ nodes: [div] });
  setTimeout(() => { if (div.parentElement) { div.remove(); window._qmNewSale(); } }, 3000);
}

window._qmNewSale = () => {
  renderQmCart();
  renderQmTotal();
  resetSearch();
  document.getElementById("qm-search").focus();
  const fc = document.getElementById("qm-fiado-client");
  if (fc) fc.value = "";
};
