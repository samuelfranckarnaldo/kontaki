import { db }                                     from "../db.js";
import { fmt, fmtDate, today, el, refreshIcons }  from "../utils.js";
import { toast }                                  from "../toast.js";
import { openModal, closeModal }                  from "../modal.js";
import { getUser, getSession }                    from "../auth.js";
import { ktkService, sessionService, validateKtkHash } from "../services.js";

export async function loadTurno() {
  var btn = document.getElementById("btn-back-turno");
  if (btn) btn.onclick = function() { if (window._showSubpage) window._showSubpage(null); };
  await renderTurno();
}

async function renderTurno() {
  var user    = getUser();
  var session = getSession();
  var wrap    = document.getElementById("turno-content");
  if (!wrap) return;

  // Migração: sessões antigas sem UUID recebem um agora
  if (session && !session.uuid) {
    var { generateUUID } = await import("../services.js");
    var newUuid = generateUUID();
    await db.put("sessions", Object.assign({}, session, { uuid: newUuid }));
    session.uuid = newUuid;
    var authMod = await import("../auth.js");
    if (authMod._setSession) authMod._setSession(session);
  }

  var sessions     = await db.getAll("sessions");
  var sales        = await db.getAll("sales");
  var sessionSales = session ? sales.filter(function(s){ return s.sessionId===session.id; }) : [];
  var totalVendas  = sessionSales.reduce(function(a,s){ return a+(s.total||0); },0);
  var duration     = session ? sessionService.getTurnoDuration(session.openedAt) : null;
  var sk           = await db.get("settings","storeKey");
  var hasStoreKey  = !!(sk && sk.value);

  var closedSessions = sessions
    .filter(function(s){ return s.status==="closed"||s.status==="validated"; })
    .sort(function(a,b){ return b.id-a.id; })
    .slice(0,8);

  var html = "";

  if (session) {
    // ── Cabeçalho do turno activo ──
    html +=
      '<div style="background:linear-gradient(135deg,#4c1d95,#6d28d9);border-radius:16px;padding:20px;color:#fff;margin-bottom:16px">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">' +
          '<div>' +
            '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#c4b5fd;margin-bottom:6px">Turno activo</div>' +
            '<div style="font-size:18px;font-weight:700;line-height:1.2">' + user.name + '</div>' +
            '<div style="font-size:12px;color:#c4b5fd;margin-top:4px">desde ' + fmtDate(session.openedAt) + '</div>' +
          '</div>' +
          '<div style="background:rgba(255,255,255,.12);border-radius:10px;padding:8px 12px;text-align:center">' +
            '<div style="font-size:20px;font-weight:800;line-height:1">' + (duration?duration.str:"—") + '</div>' +
            '<div style="font-size:10px;color:#c4b5fd;margin-top:2px">duração</div>' +
            (duration&&duration.warn?'<div style="font-size:9px;color:#fde68a;margin-top:3px">⚠ longo</div>':"") +
          '</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
          '<div style="background:rgba(255,255,255,.1);border-radius:10px;padding:12px">' +
            '<div style="font-size:10px;color:#c4b5fd;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Vendas</div>' +
            '<div style="font-size:18px;font-weight:800">' + fmt(totalVendas) + '</div>' +
            '<div style="font-size:11px;color:#c4b5fd;margin-top:2px">' + sessionSales.length + ' transacções</div>' +
          '</div>' +
          '<div style="background:rgba(255,255,255,.1);border-radius:10px;padding:12px">' +
            '<div style="font-size:10px;color:#c4b5fd;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">ID do turno</div>' +
            '<div style="font-size:11px;font-weight:700;word-break:break-all;line-height:1.4;margin-top:2px">' + (session.uuid||"sem uuid...").slice(0,20) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    // ── Aviso sem chave HMAC ──
    if (!hasStoreKey) {
      html +=
        '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:12px 14px;margin-bottom:12px;display:flex;align-items:flex-start;gap:10px">' +
          '<i data-lucide="alert-triangle" style="width:16px;height:16px;color:#d97706;flex-shrink:0;margin-top:1px"></i>' +
          '<div style="font-size:12px;color:#92400e;line-height:1.5"><strong>Sem chave HMAC</strong> — o .ktk será exportado sem assinatura digital.</div>' +
        '</div>';
    }

    // ── Acções ──
    html +=
      '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">' +
        '<button onclick="window._fecharTurno()" style="width:100%;padding:15px;background:#dc2626;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 16px rgba(220,38,38,.3);letter-spacing:.2px">' +
          '<i data-lucide="log-out" style="width:17px;height:17px"></i>Fechar turno e exportar .ktk' +
        '</button>' +
        '<button onclick="window._verVendasTurno()" style="width:100%;padding:13px;background:#fff;color:#5b21b6;border:1.5px solid #ddd6fe;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px">' +
          '<i data-lucide="receipt" style="width:16px;height:16px"></i>Ver vendas deste turno (' + sessionSales.length + ')' +
        '</button>' +
      '</div>';

  } else {
    // ── Sem turno activo ──
    html +=
      '<div style="background:#fff;border:1.5px solid #e4e4e7;border-radius:16px;padding:28px 20px;text-align:center;margin-bottom:16px">' +
        '<div style="width:52px;height:52px;background:#f4f4f5;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 14px">' +
          '<i data-lucide="timer" style="width:24px;height:24px;color:#71717a"></i>' +
        '</div>' +
        '<div style="font-size:15px;font-weight:700;color:#18181b;margin-bottom:6px">Nenhum turno activo</div>' +
        '<div style="font-size:13px;color:#71717a;margin-bottom:18px;line-height:1.5">Abre um turno para começar<br>a registar vendas e despesas.</div>' +
        '<button onclick="window._abrirTurno()" style="padding:13px 28px;background:#5b21b6;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:8px;box-shadow:0 4px 14px rgba(91,33,182,.25)">' +
          '<i data-lucide="play" style="width:16px;height:16px"></i>Abrir turno' +
        '</button>' +
      '</div>';
  }

  // ── Turnos anteriores ──
  if (closedSessions.length) {
    html += '<div><div style="font-size:11px;font-weight:700;color:#a1a1aa;text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px">Turnos anteriores</div>';
    closedSessions.forEach(function(s) {
      var isValidated  = s.validated;
      var hasIncidents = s.hasIncidents;
      var isImported   = s.isImported;
      var color  = isValidated?"#16a34a":hasIncidents?"#dc2626":"#5b21b6";
      var bgPill = isValidated?"#dcfce7":hasIncidents?"#fee2e2":"#ede9fe";
      var label  = isValidated?"Validado":hasIncidents?"Com incidentes":isImported?"Importado":"Fechado";
      html +=
        '<div style="background:#fff;border-radius:12px;padding:14px 16px;margin-bottom:8px;border:1px solid #f4f4f5;box-shadow:0 1px 3px rgba(0,0,0,.05);display:flex;align-items:center;gap:12px">' +
          '<div style="width:36px;height:36px;border-radius:10px;background:' + bgPill + ';display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
            '<i data-lucide="' + (isValidated?"shield-check":hasIncidents?"alert-circle":"clock") + '" style="width:16px;height:16px;color:' + color + '"></i>' +
          '</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:13px;font-weight:700;color:#18181b">' + (s.userName||"Desconhecido") + '</div>' +
            '<div style="font-size:11px;color:#a1a1aa;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
              fmtDate(s.openedAt) + (s.closedAt?" → "+fmtDate(s.closedAt):"") +
            '</div>' +
          '</div>' +
          '<div style="text-align:right;flex-shrink:0">' +
            '<div style="font-size:14px;font-weight:700;color:#16a34a">' + fmt(s.totalVendas||0) + '</div>' +
            '<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;background:' + bgPill + ';color:' + color + '">' + label + '</span>' +
          '</div>' +
        '</div>';
    });
    html += '</div>';
  }

  wrap.innerHTML = html;
  refreshIcons(wrap);
}

// ── ABRIR TURNO ───────────────────────────────────────────────────────────────
window._abrirTurno = async function() {
  var user = getUser();
  if (!user) { toast("Não autenticado.","error"); return; }

  try {
    var sessions = await db.getAll("sessions");
    var lastClosed = sessions
      .filter(function(s){ return s.status==="closed"||s.status==="validated"; })
      .sort(function(a,b){ return b.id-a.id; })[0];

    await showAberturaModal(lastClosed);
  } catch(err) {
    toast("Erro ao abrir turno: "+err.message,"error");
  }
};

// ── ABRIR TURNO — modal de confirmação de stock/caixa ─────────────────────────
async function showAberturaModal(lastClosed) {
  var { getAllStocks } = await import("../services.js");
  var products = await db.getAll("products");
  products = products.filter(function(p){ return p.active; });
  var shopMap = await getAllStocks("shop");
  var cashEsperado = lastClosed ? (lastClosed.cashCounted||0) : 0;

  window._aberturaCtx = { lastClosed: lastClosed, products: products, shopMap: shopMap, cashEsperado: cashEsperado };

  var rows = products.map(function(p){
    var esperado = shopMap[p.id]||0;
    return '<div style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid #f4f4f5">' +
      '<div style="flex:1">' +
      '<div style="font-size:13px;font-weight:600">' + p.name + '</div>' +
      '<div style="font-size:11px;color:#71717a">Esperado: <strong>' + esperado + '</strong> ' + p.unit + '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px">' +
      '<input type="number" id="open-stock-'+p.id+'" min="0" value="'+esperado+'" ' +
      'style="width:70px;padding:7px;border:1.5px solid #ddd6fe;border-radius:8px;text-align:center;font-size:14px;font-weight:700;font-family:inherit"/>' +
      '<span style="font-size:11px;color:#71717a">' + p.unit + '</span>' +
      '</div></div>';
  }).join("");

  var prevInfo = lastClosed
    ? '<div style="font-size:11px;color:#71717a;margin-bottom:10px;line-height:1.5">Turno anterior — <strong>' + (lastClosed.userName||"?") + '</strong>, fechou em ' + fmtDate(lastClosed.closedAt) + '.</div>'
    : '<div style="font-size:11px;color:#71717a;margin-bottom:10px">Sem turno anterior registado — a contagem serve de ponto de partida.</div>';

  openModal("Abrir Turno — Confirmar Stock e Caixa",
    prevInfo +
    '<div style="background:#fff;border:1.5px solid #ddd6fe;border-radius:12px;padding:14px;margin-bottom:14px">' +
      '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">Fundo de caixa (dinheiro)</div>' +
      '<div style="margin-bottom:10px">' +
        '<div style="font-size:11px;color:#71717a">Esperado ao abrir</div>' +
        '<div style="font-size:18px;font-weight:800;color:#18181b">' + fmt(cashEsperado) + '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px">' +
        '<label style="font-size:12px;color:#71717a;flex-shrink:0">Dinheiro contado:</label>' +
        '<input type="number" id="open-cash-input" min="0" step="1" value="' + cashEsperado + '" ' +
        'style="flex:1;padding:9px;border:1.5px solid #ddd6fe;border-radius:8px;text-align:center;font-size:15px;font-weight:700;font-family:inherit"/>' +
      '</div>' +
    '</div>' +
    '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Confirma o stock encontrado fisicamente:</div>' +
    '<div style="max-height:280px;overflow-y:auto;margin-bottom:14px">' + rows + '</div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" onclick="window._confirmarAbertura()">' +
    '<i data-lucide="play"></i> Abrir turno</button>' +
    '</div>');
  refreshIcons(el("modal-box"));
}

window._confirmarAbertura = async function() {
  var ctx = window._aberturaCtx;
  if (!ctx) return;

  var cashInput   = document.getElementById("open-cash-input");
  var cashContado = cashInput ? (parseFloat(cashInput.value)||0) : ctx.cashEsperado;
  var cashDiff    = cashContado - ctx.cashEsperado;

  var diffs = [];
  var contagens = {};
  ctx.products.forEach(function(p){
    var inp = document.getElementById("open-stock-"+p.id);
    var esperado = ctx.shopMap[p.id]||0;
    var contado  = inp ? (parseInt(inp.value)||0) : esperado;
    contagens[p.id] = contado;
    if (contado !== esperado) diffs.push({ p:p, esperado:esperado, contado:contado, diff:contado-esperado });
  });

  if (cashDiff !== 0 || diffs.length > 0) {
    var msg =
      '<div style="font-size:13px;color:#18181b;margin-bottom:12px;line-height:1.5">Encontraste diferenças em relação ao esperado:</div>' +
      '<div style="max-height:200px;overflow-y:auto;margin-bottom:14px">' +
      (cashDiff !== 0 ? '<div style="padding:8px 0;border-bottom:1px solid #f4f4f5;font-size:13px"><strong>Caixa:</strong> ' + (cashDiff>0?"+":"") + fmt(cashDiff) + '</div>' : '') +
      diffs.map(function(d){
        return '<div style="padding:8px 0;border-bottom:1px solid #f4f4f5;font-size:13px"><strong>' + d.p.name + ':</strong> ' + (d.diff>0?"+":"") + d.diff + ' ' + d.p.unit + '</div>';
      }).join("") +
      '</div>' +
      '<div style="font-size:12px;color:#71717a;margin-bottom:14px">Queres continuar a abertura mesmo assim (gera incidente para investigar depois) ou cancelar?</div>' +
      '<div class="form-actions">' +
      '<button class="btn btn-ghost btn-full" onclick="window._cancelarAbertura()">Cancelar</button>' +
      '<button class="btn btn-primary btn-full" onclick="window._forcarAbertura()" style="background:#d97706">Continuar mesmo assim</button>' +
      '</div>';
    openModal("Divergência na abertura", msg);
    refreshIcons(el("modal-box"));
    window._aberturaContagens = contagens;
    window._aberturaCash      = { cashEsperado: ctx.cashEsperado, cashContado: cashContado, cashDiff: cashDiff };
    window._aberturaDiffs     = diffs;
    return;
  }

  await finalizarAbertura(contagens, { cashEsperado: ctx.cashEsperado, cashContado: cashContado, cashDiff: 0 }, []);
};

window._cancelarAbertura = function() {
  closeModal();
  window._aberturaCtx = null;
  toast("Abertura cancelada.", "info");
};

window._forcarAbertura = async function() {
  await finalizarAbertura(window._aberturaContagens, window._aberturaCash, window._aberturaDiffs);
};

async function finalizarAbertura(contagens, cashInfo, diffs) {
  var user = getUser();
  var ctx  = window._aberturaCtx;
  if (!ctx) return;

  try {
    var result = await sessionService.openSession(
      user.id, user.name,
      ctx.lastClosed ? (ctx.lastClosed.uuid||null) : null
    );

    var newSession = await db.get("sessions", result.sessionId);
    newSession = Object.assign({}, newSession, {
      cashExpectedOpen: cashInfo.cashEsperado,
      cashCountedOpen:  cashInfo.cashContado,
      cashDiffOpen:     cashInfo.cashDiff,
    });
    await db.put("sessions", newSession);

    if (cashInfo.cashDiff !== 0) {
      await db.add("incidents", {
        productId:null, productName:"Numerário (Caixa)",
        expected:cashInfo.cashEsperado, found:cashInfo.cashContado, diff:cashInfo.cashDiff,
        sessionId:result.sessionId, responsibleSessionId:ctx.lastClosed?ctx.lastClosed.id:null,
        foundBy:user.id, responsible:null,
        status:"open", type:"caixa",
        note:"Divergência na abertura do turno",
        createdAt:new Date().toISOString(),
      });
    }
    for (var i=0;i<diffs.length;i++) {
      var d = diffs[i];
      await db.add("incidents", {
        productId:d.p.id, productName:d.p.name,
        expected:d.esperado, found:d.contado, diff:d.diff,
        sessionId:result.sessionId, responsibleSessionId:ctx.lastClosed?ctx.lastClosed.id:null,
        foundBy:user.id, responsible:null,
        status:"open", type:"stock",
        note:"Divergência na abertura do turno",
        createdAt:new Date().toISOString(),
      });
    }

    user.sessionId = result.sessionId;
    var authMod = await import("../auth.js");
    if (authMod._setSession) authMod._setSession(newSession);

    closeModal();
    toast("Turno aberto!", "success");
    window._aberturaCtx        = null;
    window._aberturaContagens  = null;
    window._aberturaCash       = null;
    window._aberturaDiffs      = null;
    await renderTurno();
  } catch(err) {
    toast("Erro ao abrir turno: "+err.message, "error");
  }
}

// ── FECHAR TURNO ──────────────────────────────────────────────────────────────
window._fecharTurno = async function() {
  var session = getSession();
  if (!session) { toast("Nenhum turno activo.","error"); return; }

  var products = await db.getAll("products");
  products = products.filter(function(p){ return p.active; });
  var sales = await db.getAll("sales");
  var sessionSales = sales.filter(function(s){ return s.sessionId===session.id; });
  var totalVendas  = sessionSales.reduce(function(a,s){ return a+(s.total||0); },0);
  var incidents    = await db.getAll("incidents");
  var sessionInc   = incidents.filter(function(i){ return i.sessionId===session.id; });

  var allExpensesFT   = await db.getAll("expenses");
  var sessionExpFT    = allExpensesFT.filter(function(x){ return x.sessionId===session.id && x.payMethod==="dinheiro"; });
  var despesasDinheiro= sessionExpFT.reduce(function(a,x){ return a+(x.amount||0); },0);
  var vendasDinheiro  = sessionSales.filter(function(s){ return s.payMethod==="dinheiro"; })
    .reduce(function(a,s){ return a+(s.total||0); },0);
  var fundoInicial    = session.cashCountedOpen || 0;
  var cashEsperado    = fundoInicial + vendasDinheiro - despesasDinheiro;

  var cashHtml =
    '<div style="background:#fff;border:1.5px solid #ddd6fe;border-radius:12px;padding:14px;margin-bottom:14px">' +
      '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">Conferência de caixa (dinheiro)</div>' +
      '<div style="display:flex;flex-direction:column;gap:4px;font-size:11.5px;color:#71717a;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid #f4f4f5">' +
        '<div style="display:flex;justify-content:space-between"><span>Fundo inicial</span><strong style="color:#3f3f46">' + fmt(fundoInicial) + '</strong></div>' +
        '<div style="display:flex;justify-content:space-between"><span>+ Vendas em dinheiro</span><strong style="color:#16a34a">' + fmt(vendasDinheiro) + '</strong></div>' +
        '<div style="display:flex;justify-content:space-between"><span>− Despesas em dinheiro</span><strong style="color:#dc2626">' + fmt(despesasDinheiro) + '</strong></div>' +
      '</div>' +
      '<div style="margin-bottom:10px">' +
        '<div style="font-size:11px;color:#71717a">Esperado em caixa</div>' +
        '<div style="font-size:18px;font-weight:800;color:#18181b">' + fmt(cashEsperado) + '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px">' +
        '<label style="font-size:12px;color:#71717a;flex-shrink:0">Dinheiro contado:</label>' +
        '<input type="number" id="cash-conf-input" min="0" step="1" value="' + cashEsperado + '" ' +
        'style="flex:1;padding:9px;border:1.5px solid #ddd6fe;border-radius:8px;text-align:center;font-size:15px;font-weight:700;font-family:inherit"/>' +
      '</div>' +
      '<div style="font-size:10px;color:#a1a1aa;margin-top:8px;line-height:1.4">Conta o dinheiro físico na gaveta e ajusta o valor acima. Vendas por Multicaixa/transferência não entram nesta contagem.</div>' +
    '</div>';

  // Calcula stock esperado por produto
  var stockMap = {};
  products.forEach(function(p){
    var vendido = sessionSales.reduce(function(a,s){
      return a + (s.items||[]).filter(function(i){ return i.id===p.id; })
        .reduce(function(b,i){ return b+i.qty; },0);
    },0);
    stockMap[p.id] = { product:p, vendido:vendido, esperado:p.stock };
  });

  var rows = products.map(function(p){
    var sm = stockMap[p.id];
    return '<div style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid #f4f4f5">' +
      '<div style="flex:1">' +
      '<div style="font-size:13px;font-weight:600">' + p.name + '</div>' +
      '<div style="font-size:11px;color:#71717a">Esperado: <strong>' + sm.esperado + '</strong> ' + p.unit + '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px">' +
      '<input type="number" id="stock-conf-'+p.id+'" min="0" value="'+sm.esperado+'" ' +
      'style="width:70px;padding:7px;border:1.5px solid #ddd6fe;border-radius:8px;text-align:center;font-size:14px;font-weight:700;font-family:inherit"/>' +
      '<span style="font-size:11px;color:#71717a">' + p.unit + '</span>' +
      '</div></div>';
  }).join("");

  openModal("Fechar Turno — Confirmar Stock",
    '<div style="background:#f4f4f5;border-radius:12px;padding:12px;margin-bottom:14px">' +
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:12px;text-align:center">' +
    '<div><div style="color:#71717a">Total vendido</div><div style="font-weight:700;color:#16a34a;font-size:15px">' + fmt(totalVendas) + '</div></div>' +
    '<div><div style="color:#71717a">Vendas</div><div style="font-weight:700;font-size:15px">' + sessionSales.length + '</div></div>' +
    '<div><div style="color:#71717a">Incidentes</div><div style="font-weight:700;color:' + (sessionInc.length?"#dc2626":"#16a34a") + ';font-size:15px">' + sessionInc.length + '</div></div>' +
    '</div></div>' +
    cashHtml +
    '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Confirma o stock encontrado fisicamente:</div>' +
    '<div style="max-height:300px;overflow-y:auto;margin-bottom:14px">' + rows + '</div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" onclick="window._confirmarFecho()" style="background:#dc2626">' +
    '<i data-lucide="log-out"></i> Fechar turno</button>' +
    '</div>');
  refreshIcons(el("modal-box"));
};

window._confirmarFecho = async function() {
  var user    = getUser();
  var session = getSession();
  if (!session) return;

  // Lê contagens do modal
  var products = await db.getAll("products");
  products = products.filter(function(p){ return p.active; });
  var contagens = {};
  products.forEach(function(p){
    var inp = document.getElementById("stock-conf-"+p.id);
    contagens[p.id] = inp ? parseInt(inp.value)||0 : p.stock;
  });

  var cashInput    = document.getElementById("cash-conf-input");
  var allSales     = await db.getAll("sales");
  var sessSalesNow = allSales.filter(function(s){ return s.sessionId===session.id; });
  var vendasDinheiroConf = sessSalesNow.filter(function(s){ return s.payMethod==="dinheiro"; })
    .reduce(function(a,s){ return a+(s.total||0); },0);
  var allExpensesConf    = await db.getAll("expenses");
  var despesasDinheiroConf = allExpensesConf.filter(function(x){ return x.sessionId===session.id && x.payMethod==="dinheiro"; })
    .reduce(function(a,x){ return a+(x.amount||0); },0);
  var fundoInicialConf = session.cashCountedOpen || 0;
  var cashEsperado = fundoInicialConf + vendasDinheiroConf - despesasDinheiroConf;
  var cashContado  = cashInput ? (parseFloat(cashInput.value)||0) : cashEsperado;
  var cashDiff     = cashContado - cashEsperado;

  try {
    // Fecha sessão
    await sessionService.closeSession(session.id);

    // Limpar sessão no auth
    var authMod = await import("../auth.js");
    if (authMod._setSession) authMod._setSession(null);

    // Regista conferência de caixa na sessão
    var closedSessionRec = await db.get("sessions", session.id);
    if (closedSessionRec) {
      await db.put("sessions", Object.assign({}, closedSessionRec, {
        cashExpected: cashEsperado, cashCounted: cashContado, cashDiff: cashDiff
      }));
    }

    // Gera incidente se houver diferença de caixa
    if (cashDiff !== 0) {
      await db.add("incidents",{
        productId:null, productName:"Numerário (Caixa)",
        expected:cashEsperado, found:cashContado, diff:cashDiff,
        sessionId:session.id, responsibleSessionId:null,
        foundBy:user.id, responsible:null,
        status:"open", type:"caixa",
        note:"Diferença de caixa no fecho de turno",
        createdAt:new Date().toISOString(),
      });
    }

    // Gera incidentes para diferenças
    var incCount = 0;
    for (var i=0; i<products.length; i++) {
      var p = products[i];
      var encontrado = contagens[p.id];
      var esperado   = p.stock;
      var diff       = encontrado - esperado;
      if (diff !== 0) {
        await db.add("incidents",{
          productId:p.id, productName:p.name,
          expected:esperado, found:encontrado, diff:diff,
          sessionId:session.id, responsibleSessionId:null,
          foundBy:user.id, responsible:null,
          status:"open", note:"Conferência no fecho de turno",
          createdAt:new Date().toISOString(),
        });
        incCount++;
      }
    }

    // Gera KTK
    var ktk    = await ktkService.generate(session.id);
    var ktkStr = JSON.stringify(ktk, null, 2);
    var blob   = new Blob([ktkStr],{type:"application/json"});
    var url    = URL.createObjectURL(blob);
    var fname  = "turno_" + user.name.replace(/\s+/g,"_") + "_" + today() + ".ktk";

    closeModal();
    openModal("Turno fechado!",
      '<div style="text-align:center;padding:10px 0 16px">' +
      '<div style="width:64px;height:64px;background:#dcfce7;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px">' +
      '<i data-lucide="check-circle" style="width:32px;height:32px;color:#16a34a"></i></div>' +
      '<div style="font-size:16px;font-weight:700;margin-bottom:6px">Turno fechado!</div>' +
      '<div style="font-size:13px;color:#71717a;margin-bottom:6px">Partilha o ficheiro .ktk com o patrão.</div>' +
      (incCount>0?'<div style="background:#fee2e2;border-radius:8px;padding:8px 12px;font-size:12px;color:#dc2626;margin-top:6px">⚠ '+incCount+' incidente(s) gerado(s) por diferença de stock.</div>':"") +
      (cashDiff!==0?'<div style="background:#fee2e2;border-radius:8px;padding:8px 12px;font-size:12px;color:#dc2626;margin-top:6px">⚠ Diferença de caixa: '+(cashDiff>0?"+":"")+fmt(cashDiff)+'.</div>':"") +
      (!ktk.hash?'<div style="background:#fef3c7;border-radius:8px;padding:8px 12px;margin-top:8px;font-size:12px;color:#92400e">⚠ Sem assinatura HMAC.</div>':"") +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px">' +
      '<a href="'+url+'" download="'+fname+'" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:14px;background:#5b21b6;color:#fff;border-radius:12px;text-decoration:none;font-size:14px;font-weight:700;font-family:inherit">' +
      '<i data-lucide="download" style="width:18px;height:18px"></i>Guardar '+fname+'</a>' +
      '<button onclick="window._shareKtkFile(\''+encodeURIComponent(fname)+'\','+JSON.stringify(encodeURIComponent(ktkStr))+')" style="padding:14px;background:#25D366;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px">' +
      '<i data-lucide="share-2" style="width:18px;height:18px"></i>Partilhar WhatsApp</button>' +
      '<button onclick="window._closeModal()" style="padding:12px;background:#f4f4f5;color:#71717a;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">Fechar</button>' +
      '</div>');
    refreshIcons(el("modal-box"));
    await renderTurno();

  } catch(err) {
    toast("Erro ao fechar turno: "+err.message,"error");
    console.error(err);
  }
};

window._shareKtkFile = async function(encodedFname, encodedKtk) {
  try {
    var fname = decodeURIComponent(encodedFname);
    var ktkStr = decodeURIComponent(encodedKtk);
    var blob = new Blob([ktkStr],{type:"application/json"});
    var file = new File([blob], fname, {type:"application/json"});
    if (navigator.canShare && navigator.canShare({files:[file]})) {
      await navigator.share({files:[file], title:"Turno Kontaki"});
    } else {
      var url = URL.createObjectURL(blob);
      var a   = document.createElement("a");
      a.href=url; a.download=fname; a.click();
      URL.revokeObjectURL(url);
      toast("Ficheiro guardado.","info");
    }
  } catch(err) {
    toast("Erro: "+err.message,"error");
  }
};

// ── IMPORTAR KTK ──────────────────────────────────────────────────────────────
window._verVendasTurno = async function() {
  var session = getSession();
  if (!session) return;
  var sales = await db.getAll("sales");
  var mine  = sales.filter(function(s){ return s.sessionId===session.id; }).reverse();
  openModal("Vendas do turno",
    '<div style="max-height:60vh;overflow-y:auto">' +
    (!mine.length
      ? '<div style="text-align:center;color:#a1a1aa;padding:20px">Nenhuma venda neste turno</div>'
      : mine.map(function(s){
          return '<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f4f4f5;font-size:13px">' +
            '<div><div style="font-weight:600">#'+s.id+' · '+s.payMethod+'</div><div style="color:#71717a;font-size:11px">'+fmtDate(s.date)+'</div></div>' +
            '<div style="font-weight:700;color:#16a34a">'+fmt(s.total)+'</div></div>';
        }).join("")
    ) +
    '</div>' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()" style="margin-top:12px">Fechar</button>');
};

window._closeModal = closeModal;
