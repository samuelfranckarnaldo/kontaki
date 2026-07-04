import pathlib

f = pathlib.Path.home() / "kontaki" / "src" / "components" / "turno.js"
src = f.read_text(encoding="utf-8")

old = '''    var lastClosed = sessions
      .filter(function(s){ return s.status==="closed"||s.status==="validated"; })
      .sort(function(a,b){ return b.id-a.id; })[0];

    var result = await sessionService.openSession(
      user.id, user.name,
      lastClosed ? (lastClosed.uuid||null) : null
    );

    // Actualiza sessão no auth
    var newSession = await db.get("sessions", result.sessionId);
    user.sessionId = result.sessionId;

    // Actualiza currentSession via auth
    var authMod = await import("../auth.js");
    if (authMod._setSession) authMod._setSession(newSession);

    toast("Turno aberto!", "success");
    await renderTurno();
  } catch(err) {
    toast("Erro ao abrir turno: "+err.message,"error");
  }
};'''

new = '''    var lastClosed = sessions
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
}'''

n = src.count(old)
if n != 1:
    raise SystemExit(f"[ABORTADO] bloco final de _abrirTurno encontrado {n}x (esperado 1x). Nada foi alterado.")
src = src.replace(old, new)
f.write_text(src, encoding="utf-8")
print("OK — turno.js: modal de abertura com confirmação de stock/caixa e fluxo de divergência.")
