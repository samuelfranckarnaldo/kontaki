import { db } from "../db.js";
import { fmt, fmtDate, el, refreshIcons } from "../utils.js";
import { toast } from "../toast.js";
import { openModal, closeModal } from "../modal.js";
import { getUser } from "../auth.js";
import { ktkService, sessionService, validateKtkHash } from "../services.js";

export async function loadEscritorio() {
  var wrap = document.getElementById("escritorio-content");
  if (!wrap) return;
  wrap.innerHTML = "";

  var user = getUser();

  var importSection = document.createElement("div");
  importSection.className = "esc-import-section";
  importSection.innerHTML =
    '<div class="planos-section-title">Importar ficheiro</div>' +
    '<label class="esc-import-btn">' +
    '<input type="file" accept=".ktk,application/json" style="display:none" onchange="window._handleKtkImport(this)"/>' +
    '<i data-lucide="upload"></i> Importar turno (.ktk)' +
    '</label>';
  wrap.appendChild(importSection);

  if (user.role === "admin") {
    var all     = await db.getAll("ktkImports");
    var pending = all.filter(function(p) { return p.status === "pending"; });

    var summaryWrap = document.createElement("div");
    summaryWrap.className = "esc-summary-wrap";
    summaryWrap.innerHTML =
      '<div class="lic-limit-item">' +
      '<div class="lic-limit-val">' + pending.length + '</div>' +
      '<div class="lic-limit-label">Turno' + (pending.length !== 1 ? "s" : "") + ' pendente' + (pending.length !== 1 ? "s" : "") + '</div>' +
      '</div>';
    wrap.appendChild(summaryWrap);

    var listWrap = document.createElement("div");
    if (!pending.length) {
      listWrap.className = "empty-state";
      listWrap.innerHTML = '<div class="empty-state-title">Nenhum turno pendente</div>';
    } else {
      listWrap.className = "esc-pending-list";
      listWrap.innerHTML = pending.map(function(p) {
        var pktk = p.ktk;
        return '<button class="esc-pending-item" onclick="window._abrirRevisaoKtk(' + p.id + ')">' +
          '<div>' +
          '<div class="esc-pending-name">' + (pktk.funcionario||"Desconhecido") + '</div>' +
          '<div class="esc-pending-meta">' + fmtDate(p.importedAt) + '</div>' +
          '</div>' +
          '<span class="perfil-menu-chevron">›</span>' +
          '</button>';
      }).join("");
    }
    wrap.appendChild(listWrap);
  }

  refreshIcons(wrap);
}
window._handleKtkImport = async function(input) {
  var file = input.files[0];
  if (!file) return;
  input.value = "";

  var text, ktk;
  try {
    text = await file.text();
    ktk  = JSON.parse(text);
  } catch(e) {
    toast("Ficheiro inválido — não é JSON válido.","error"); return;
  }

  if (!ktk.id_sessao || !ktk.versao || !ktk.loja_id) {
    toast("Ficheiro .ktk inválido — campos em falta.","error"); return;
  }

  var dup = await sessionService.checkDuplicate(ktk.id_sessao);
  if (dup) {
    toast("Sessão já importada em "+fmtDate(dup.openedAt)+".","error"); return;
  }

  var hashResult = await validateKtkHash(ktk);
  if (!hashResult.valid && !hashResult.legacy) {
    toast("Hash inválido — ficheiro foi modificado.","error"); return;
  }

  showKtkViewer(ktk, hashResult);
};

function showKtkViewer(ktk, hashResult) {
  var vendas     = ktk.vendas    || [];
  var fiados     = ktk.fiados    || [];
  var incidentes = ktk.incidentes|| [];
  var stockRows  = Object.values(ktk.stock_esperado||{});
  var totalVendas= vendas.reduce(function(a,v){ return a+(v.total||0); },0);
  var fiadoAberto= fiados.filter(function(f){ return f.status==="open"; }).reduce(function(a,f){ return a+(f.amount||0); },0);

  var stockHtml = stockRows.length ?
    '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Stock declarado</div>' +
    '<div style="background:#fff;border-radius:10px;border:1px solid #f4f4f5;overflow:hidden;margin-bottom:12px">' +
    '<div style="display:grid;grid-template-columns:1fr 60px 60px 60px;padding:8px 12px;background:#f4f4f5;font-size:10px;font-weight:700;color:#71717a;text-transform:uppercase">' +
    '<span>Produto</span><span style="text-align:center">Recebeu</span><span style="text-align:center">Vendeu</span><span style="text-align:right">Esperado</span></div>' +
    stockRows.map(function(r){
      var color = r.expected<0?"#dc2626":r.expected<2?"#d97706":"#16a34a";
      return '<div style="display:grid;grid-template-columns:1fr 60px 60px 60px;padding:9px 12px;border-top:1px solid #f4f4f5;align-items:center">' +
        '<span style="font-size:13px;font-weight:600">' + r.productName + '</span>' +
        '<span style="text-align:center;font-size:13px;color:#71717a">' + r.received + '</span>' +
        '<span style="text-align:center;font-size:13px;color:#dc2626">' + r.sold + '</span>' +
        '<span style="text-align:right;font-size:13px;font-weight:700;color:'+color+'">' + r.expected + '</span>' +
        '</div>';
    }).join("") + '</div>' : "";

  var incHtml = incidentes.length ?
    '<div style="font-size:12px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">⚠ Incidentes ('+incidentes.length+')</div>' +
    incidentes.map(function(i){
      return '<div style="background:#fff5f5;border:1px solid #fca5a5;border-radius:10px;padding:10px;margin-bottom:6px">' +
        '<div style="font-size:13px;font-weight:700;color:#dc2626">' + i.productName + '</div>' +
        '<div style="font-size:12px;color:#71717a;margin-top:4px">Esperado: <strong>'+i.expected+'</strong> · Encontrado: <strong>'+i.found+'</strong> · Dif: <strong style="color:#dc2626">'+(i.diff>0?"+":"")+i.diff+'</strong></div>' +
        '</div>';
    }).join("") : "";

  var fiadoHtml = fiados.length ?
    '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Fiados</div>' +
    fiados.map(function(f){
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f4f4f5;font-size:13px">' +
        '<span style="font-weight:600">' + f.clientName + '</span>' +
        '<div style="display:flex;align-items:center;gap:8px">' +
        '<span style="font-weight:700;color:'+(f.status==="paid"?"#16a34a":"#dc2626")+'">' + fmt(f.amount) + '</span>' +
        '<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:'+(f.status==="paid"?"#dcfce7":"#fee2e2")+';color:'+(f.status==="paid"?"#16a34a":"#dc2626")+'">' + (f.status==="paid"?"Pago":"Em aberto") + '</span>' +
        '</div></div>';
    }).join("") : "";

  // Guarda ktk em variável global para confirmar
  window._ktkPendente = ktk;
  window._ktkContagemManual = {};

  openModal("Turno — " + ktk.funcionario,
    '<div style="max-height:65vh;overflow-y:auto">' +
    '<div style="background:linear-gradient(135deg,#5b21b6,#7c3aed);border-radius:12px;padding:14px;color:#fff;margin-bottom:14px">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
    '<div>' +
    '<div style="font-size:16px;font-weight:700">' + ktk.funcionario + '</div>' +
    '<div style="font-size:12px;color:#ddd6fe;margin-top:3px">' + (ktk.data_abertura?fmtDate(ktk.data_abertura):"") + (ktk.data_fecho?" → "+fmtDate(ktk.data_fecho):"") + '</div>' +
    '<div style="font-size:11px;color:#ddd6fe;margin-top:2px">' + (ktk.loja_nome||"") + ' · v' + ktk.versao + '</div>' +
    '</div>' +
    '<span style="font-size:11px;font-weight:700;padding:4px 8px;border-radius:6px;background:'+(hashResult.legacy?"rgba(251,191,36,.3)":"rgba(255,255,255,.2)")+';color:'+(hashResult.legacy?"#fef3c7":"#fff")+'">' +
    (hashResult.legacy?"⚠ Hash legado":"✓ HMAC válido") + '</span>' +
    '</div></div>' +

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">' +
    '<div class="stat-card" style="border-left:3px solid #16a34a"><div class="stat-label" style="color:#16a34a">Total vendido</div><div class="stat-val" style="color:#16a34a;font-size:14px">' + fmt(totalVendas) + '</div><div style="font-size:11px;color:#71717a">' + vendas.length + ' vendas</div></div>' +
    '<div class="stat-card" style="border-left:3px solid '+(incidentes.length?"#dc2626":"#16a34a")+'"><div class="stat-label">Incidentes</div><div class="stat-val" style="color:'+(incidentes.length?"#dc2626":"#18181b")+'">' + incidentes.length + '</div></div>' +
    '<div class="stat-card" style="border-left:3px solid #d97706"><div class="stat-label" style="color:#d97706">Fiado aberto</div><div class="stat-val" style="color:#d97706;font-size:13px">' + fmt(fiadoAberto) + '</div></div>' +
    '<div class="stat-card" style="border-left:3px solid #5b21b6"><div class="stat-label" style="color:#5b21b6">Fiados pagos</div><div class="stat-val" style="color:#5b21b6">' + fiados.filter(function(f){return f.status==="paid";}).length + '</div></div>' +
    '</div>' +
    (fiadoAberto > 0 ? '<div style="background:#fef3c7;border:2px solid #fde68a;border-radius:12px;padding:14px;margin-bottom:14px">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
    '<i data-lucide="alert-circle" style="width:16px;height:16px;color:#92400e"></i>' +
    '<div style="font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:.4px">⚠ Fiados em aberto neste turno</div>' +
    '</div>' +
    fiados.filter(function(f){ return f.status==="open"; }).map(function(f){
      return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #fde68a;font-size:13px">' +
        '<span style="font-weight:600;color:#92400e">' + f.clientName + '</span>' +
        '<span style="font-weight:700;color:#dc2626">' + fmt(f.amount) + '</span></div>';
    }).join("") +
    '<div style="font-size:12px;font-weight:700;color:#92400e;margin-top:6px">Total em aberto: ' + fmt(fiadoAberto) + '</div>' +
    '</div>' : "") +
    stockHtml + incHtml + fiadoHtml +
    '</div>' +

    '<div style="background:#ede9fe;border-radius:10px;padding:12px 14px;margin-bottom:14px;display:flex;gap:10px;align-items:flex-start">' +
    '<i data-lucide="archive" style="width:16px;height:16px;color:#5b21b6;flex-shrink:0;margin-top:1px"></i>' +
    '<div style="font-size:12px;color:#5b21b6;line-height:1.5">Este turno fica pendente de revisão. Compara os dados abaixo com os do turno físico antes de confirmar.</div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-top:14px;border-top:1px solid #f4f4f5;padding-top:14px">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Fechar</button>' +
    '<button class="btn btn-primary btn-full" onclick="window._confirmarImportKtk()">' +
    '<i data-lucide="send"></i> Enviar para o Escritório</button>' +
    '</div>');

  refreshIcons(el("modal-box"));
}

window._confirmarImportKtk = async function() {
  var ktk = window._ktkPendente;
  if (!ktk) { toast("Nenhum KTK pendente.","error"); return; }
  try {
    await ktkService.stageImport(ktk);
    window._ktkPendente = null;
    window._ktkContagemManual = {};
    toast("Turno enviado para o Escritório — aguarda revisão e confirmação.","success");
    closeModal();
    await loadEscritorio();
  } catch(err) {
    if (err.message.startsWith("DUPLICATE:")) toast("Este turno já foi importado.","error");
    else if (err.message.startsWith("PENDING_DUPLICATE:")) toast("Este turno já está pendente no Escritório.","error");
    else if (err.message==="INVALID_HASH") toast("Hash inválido — ficheiro modificado.","error");
    else if (err.message==="INVALID_FORMAT") toast("Formato .ktk inválido.","error");
    else toast("Erro: "+err.message,"error");
    closeModal();
  }
};

window._abrirRevisaoKtk = async function(importId) {
  var rec = await db.get("ktkImports", importId);
  if (!rec) { toast("Importação não encontrada.","error"); return; }
  showRevisaoModal(rec);
};

function showRevisaoModal(rec) {
  var ktk = rec.ktk;
  var stockRows = Object.values(ktk.stock_esperado||{});

  var rowsHtml = stockRows.map(function(r) {
    return '<div class="esc-review-row" data-product-id="' + r.productId + '" data-received="' + r.received + '">' +
      '<span class="esc-review-name">' + r.productName + '</span>' +
      '<span class="esc-review-received">' + r.received + '</span>' +
      '<input class="esc-review-input" type="number" value="' + r.sold + '" oninput="window._recalcEsperado(this)"/>' +
      '<span class="esc-review-expected">' + r.expected + '</span>' +
      '</div>';
  }).join("");

  openModal("Revisão — " + ktk.funcionario,
    '<div style="max-height:65vh;overflow-y:auto">' +
    '<div class="esc-review-header">' +
    '<span>Produto</span><span>Recebeu</span><span>Vendeu</span><span>Esperado</span>' +
    '</div>' +
    rowsHtml +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-top:14px;border-top:1px solid #f4f4f5;padding-top:14px">' +
    '<button class="btn btn-ghost btn-full" onclick="window._rejeitarKtkPendente(' + rec.id + ')">Rejeitar</button>' +
    '<button class="btn btn-primary btn-full" onclick="window._confirmarKtkPendente(' + rec.id + ')">' +
    '<i data-lucide="check"></i> Confirmar</button>' +
    '</div>');
  refreshIcons(el("modal-box"));
}

window._recalcEsperado = function(input) {
  var row = input.closest(".esc-review-row");
  var received = Number(row.getAttribute("data-received"));
  var sold = Number(input.value || 0);
  row.querySelector(".esc-review-expected").textContent = received - sold;
  row.classList.toggle("esc-review-row--edited", String(sold) !== input.defaultValue);
};

window._confirmarKtkPendente = async function(importId) {
  var corrections = {};
  document.querySelectorAll(".esc-review-row").forEach(function(row) {
    var pid = Number(row.getAttribute("data-product-id"));
    var input = row.querySelector(".esc-review-input");
    var val = Number(input.value || 0);
    if (String(val) !== input.defaultValue) corrections[pid] = val;
  });
  try {
    await ktkService.confirmImport(importId, corrections);
    toast("Turno confirmado.","success");
    closeModal();
    await loadEscritorio();
  } catch(err) {
    toast("Erro: "+err.message,"error");
  }
};

window._rejeitarKtkPendente = async function(importId) {
  if (!confirm("Rejeitar este turno? Esta ação não pode ser desfeita.")) return;
  try {
    await ktkService.rejectImport(importId, "Rejeitado manualmente no Escritório");
    toast("Turno rejeitado.","info");
    closeModal();
    await loadEscritorio();
  } catch(err) {
    toast("Erro: "+err.message,"error");
  }
};

