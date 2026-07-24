import { db } from "../db.js";
import { postSaleJournal } from "../pgc.js";
import { fmt, el, refreshIcons } from "../utils.js";
import { toast } from "../toast.js";
import { getUser } from "../auth.js";
import { initCamera } from "./camera.js";
import { confirmDialog } from "../modal.js";
import { getOpenIncidentForProduct, getStockIncidentPolicy } from "../services.js";
import { showIncidentBlockedModal, showIncidentAuthModal } from "./vender.js";

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
    const doCancel = () => {
      qmCart = [];
      renderQmCart();
      renderQmTotal();
      resetSearch();
      document.getElementById("qm-search").focus();
    };
    if (qmCart.length > 0) {
      confirmDialog("Cancelar a venda? O carrinho será limpo.", doCancel, { title: "Cancelar venda", confirmText: "Sim, cancelar", danger: true, icon: "x-circle" });
    } else {
      doCancel();
    }
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

  bindQmClientAutocomplete();

  // Pagamento
  document.querySelectorAll(".qm-pay-btn").forEach(btn => {
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
  });
  document.querySelectorAll(".qm-pay-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      qmPayMethod = btn.dataset.method;
      selectPayBtn(btn);
      document.getElementById("qm-fiado-wrap").style.display =
        qmPayMethod === "fiado" ? "block" : "none";
    });
  });
}

function selectPayBtn(selected) {
  document.querySelectorAll(".qm-pay-btn").forEach(b => {
    var isSel = b === selected || b.dataset.method === (selected ? selected.dataset.method : null);
    b.style.borderColor = isSel ? "#5b21b6" : "#e4e4e7";
    b.style.background  = isSel ? "#ede9fe" : "#fff";
    b.style.color       = isSel ? "#5b21b6" : "#71717a";
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

async function addToQmCart(p) {
  if (p.stock <= 0) { toast("Produto sem stock.", "error"); return; }

  const incident = await getOpenIncidentForProduct(p.id);
  if (incident) {
    const policy = await getStockIncidentPolicy();
    if (policy === "block") {
      showIncidentBlockedModal(p, incident);
      return;
    }
    showIncidentAuthModal(p, incident, function() {
      pushToQmCart(p);
    });
    return;
  }
  pushToQmCart(p);
}

function pushToQmCart(p) {
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
    wrap.innerHTML = `<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;text-align:center;gap:12px">
      <div style="width:56px;height:56px;background:#ede9fe;border-radius:16px;display:flex;align-items:center;justify-content:center">
        <i data-lucide="scan-line" style="width:26px;height:26px;color:#5b21b6"></i>
      </div>
      <div style="font-size:14px;font-weight:600;color:#52525b">Carrinho vazio</div>
      <div style="font-size:12.5px;color:#a1a1aa;max-width:220px;line-height:1.5">Pesquisa ou usa o scanner para adicionar produtos rapidamente</div>
    </div>`;
    if (window.lucide) window.lucide.createIcons({ el: wrap });
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
                style="width:32px;height:32px;background:#f4f4f5;border:none;color:#18181b;
                       cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center">
          <i data-lucide="minus" style="width:14px;height:14px"></i>
        </button>
        <span style="width:36px;text-align:center;font-size:15px;font-weight:700;
                     border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;
                     padding:6px 0;display:block">${item.qty}</span>
        <button onclick="window._qmChangeQty(${item.id},1)"
                style="width:32px;height:32px;background:#f4f4f5;border:none;color:#18181b;
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
  const licMod = await import("../license.js");
  if (licMod.getLicense().status === "none") {
    licMod.showUpgradeBanner("Ativa um plano para começar a vender. Contacta a Introxeer.");
    return;
  }
  if (!qmCart.length) { toast("Carrinho vazio.", "error"); return; }
  const fc = (document.getElementById("qm-fiado-client") ? document.getElementById("qm-fiado-client").value.trim() : "") || "";
  if (qmPayMethod === "fiado" && !fc) {
    toast("Insira o nome do cliente para fiado.", "error"); return;
  }

  const sub      = qmCart.reduce((a, i) => a + i.price * i.qty, 0);
  const saleDate = new Date().toISOString();

  try {
    const store  = (await db.get("settings","store")) || {};
    const ivaPct = Number(store.iva) || 0;
    const ivaVal = ivaPct > 0 ? sub * (ivaPct/100) : 0;
    const total  = sub + ivaVal;
    const sid   = await db.add("sales", {
      items:       qmCart.map(i => ({ id:i.id, name:i.name, price:i.price, qty:i.qty, itemDisc:0 })),
      subtotal:    sub, discount:0, ivaPct, ivaValor:ivaVal, total,
      payMethod:   qmPayMethod, date:saleDate,
      userId:      getUser().id, sessionId:getUser().sessionId,
      clientName:  fc, clientPhone:"", clientId: qmClientSelectedId || null,
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
        clientName:fc, clientId: qmClientSelectedId || null, amount:total, saleId:sid,
        date:saleDate, status:"open", userId:getUser().id, notes:"",
      });
    }

    // Contabilidade — lançamentos de partidas dobradas (PGC)
    try {
      await postSaleJournal(
        { id:sid, date:saleDate, total, subtotal:sub, discount:0, ivaValor:ivaVal, payMethod:qmPayMethod },
        qmCart.map(i => ({ id:i.id, qty:i.qty }))
      );
    } catch (pgcErr) {
      console.error("Erro ao lançar venda (quickmode) na contabilidade:", pgcErr);
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
      #${sid} · ${itemCount} produto(s) · ${payMethod === "fiado" ? "crédito" : payMethod}
    </div>
    <div style="display:flex;gap:10px">
    <button onclick="this.parentElement.parentElement.remove();window._qmNewSale()"
            style="background:rgba(255,255,255,.2);border:2px solid rgba(255,255,255,.4);
                   border-radius:12px;color:#fff;padding:16px 28px;font-size:15px;
                   font-weight:700;cursor:pointer;font-family:inherit">
      Nova venda
    </button>
    <button onclick="this.parentElement.parentElement.remove();document.getElementById('quick-mode').style.display='none';qmCart=[];"
            style="background:none;border:2px solid rgba(255,255,255,.4);
                   border-radius:12px;color:#fff;padding:16px 28px;font-size:15px;
                   font-weight:700;cursor:pointer;font-family:inherit">
      Fechar
    </button>
    </div>`;
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
  const sug = document.getElementById("qm-fiado-suggestions");
  if (sug) sug.style.display = "none";
};

let qmClientSelectedId = null;

function bindQmClientAutocomplete() {
  const inp = document.getElementById("qm-fiado-client");
  const sug = document.getElementById("qm-fiado-suggestions");
  if (!inp || !sug || inp.dataset.autocompleteBound) return;
  inp.dataset.autocompleteBound = "1";

  inp.addEventListener("input", async () => {
    qmClientSelectedId = null;
    const q = inp.value.trim().toLowerCase();
    if (!q) { sug.style.display = "none"; return; }

    const clients = await db.getAll("clients");
    const matches = clients.filter(c => (c.name||"").toLowerCase().includes(q)).slice(0, 5);

    if (!matches.length) {
      sug.innerHTML = '<div style="padding:12px 14px;font-size:12.5px;color:#a1a1aa">Nenhum cliente encontrado — será criado um novo ao finalizar.</div>';
      sug.style.display = "block";
      return;
    }

    sug.innerHTML = matches.map(c =>
      '<button type="button" class="qm-client-suggestion" data-id="' + c.id + '" data-name="' + c.name.replace(/"/g,"&quot;") + '" ' +
      'style="display:flex;align-items:center;gap:10px;width:100%;padding:10px 14px;background:none;border:none;border-bottom:1px solid #f4f4f5;cursor:pointer;text-align:left;font-family:inherit">' +
      '<div style="width:28px;height:28px;border-radius:8px;background:#ede9fe;color:#5b21b6;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">' + c.name.charAt(0).toUpperCase() + '</div>' +
      '<div><div style="font-size:13px;font-weight:600;color:#18181b">' + c.name + '</div>' +
      (c.phone ? '<div style="font-size:11px;color:#a1a1aa">' + c.phone + '</div>' : '') + '</div>' +
      '</button>'
    ).join("");
    sug.style.display = "block";

    sug.querySelectorAll(".qm-client-suggestion").forEach(btn => {
      btn.addEventListener("click", () => {
        inp.value = btn.dataset.name;
        qmClientSelectedId = Number(btn.dataset.id);
        sug.style.display = "none";
      });
    });
  });

  inp.addEventListener("blur", () => {
    setTimeout(() => { sug.style.display = "none"; }, 150);
  });
}
