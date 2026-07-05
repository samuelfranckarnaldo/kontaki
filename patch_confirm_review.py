#!/usr/bin/env python3
import os

def apply_patches(path, patches):
    path = os.path.expanduser(path)
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    applied = 0
    for desc, old, new in patches:
        count = content.count(old)
        if count == 0:
            if new and content.count(new) > 0:
                print(f"  [skip] {desc} — já aplicado")
                continue
            raise SystemExit(f"  [ERRO] {desc} — texto original não encontrado em {path}. Abortando sem gravar.")
        if count > 1:
            raise SystemExit(f"  [ERRO] {desc} — texto original aparece {count}x (ambíguo). Abortando sem gravar.")
        content = content.replace(old, new)
        applied += 1
        print(f"  [ok] {desc}")

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"-> {applied} patch(es) gravado(s) em {path}\n")


DB_PATCHES = [
    (
        "DB_VERSION 12 -> 13",
        'const DB_VERSION = 12;',
        'const DB_VERSION = 13;',
    ),
    (
        "adicionar store stockCorrections",
        '      ensure("stockDecisions",   { keyPath:"id", autoIncrement:true }, [["productId",false],["decidedAt",false]]);',
        '      ensure("stockDecisions",   { keyPath:"id", autoIncrement:true }, [["productId",false],["decidedAt",false]]);\n'
        '      ensure("stockCorrections", { keyPath:"id", autoIncrement:true }, [["importId",false],["productId",false],["correctedAt",false]]);',
    ),
]

SERVICES_PATCHES = [
    (
        "confirmImport: aceitar manualCorrections e reconciliar stock real",
        '  async confirmImport(importId) {\n'
        '    requireRole("admin");\n'
        '    const rec=await db.get("ktkImports",importId);\n'
        '    if(!rec || rec.status!=="pending") throw new Error("Importação não encontrada ou já processada.");\n'
        '    const ktk=rec.ktk;\n'
        '    const dup=await sessionService.checkDuplicate(ktk.id_sessao);\n'
        '    if(dup) { await db.put("ktkImports",{...rec,status:"rejected",rejectedReason:"Duplicado no momento da confirmação"}); throw new Error(`DUPLICATE:${dup.id}:${dup.openedAt}`); }\n\n'
        '    const user=getUser();\n'
        '    const sessionId=await db.add("sessions",{\n'
        '      uuid:ktk.id_sessao, userId:ktk.funcionario_id, userName:ktk.funcionario,\n'
        '      status:"validated", openedAt:ktk.data_abertura, closedAt:ktk.data_fecho,\n'
        '      prevSessionUuid:ktk.sessao_anterior||null,\n'
        '      stockRecebido:ktk.stock_recebido||{}, stockEsperado:ktk.stock_esperado||{},\n'
        '      totalVendas:ktk.total_vendas||0, nVendas:ktk.n_vendas||0,\n'
        '      hasIncidents:(ktk.incidentes||[]).length>0,\n'
        '      validated:true, validatedBy:user.id, validatedAt:new Date().toISOString(),\n'
        '      ktkHash:ktk.hash, importedKtkUuid:ktk.id_sessao,\n'
        '      isImported:true, hashLegacy:rec.hashResult?.legacy,\n'
        '      lojaId:ktk.loja_id, lojaNome:ktk.loja_nome,\n'
        '    });\n'
        '    for(const m of (ktk.stock_movements||[])) {\n'
        '      await db.add("stockMovements",{...m,sessionId,userId:ktk.funcionario_id,imported:true,createdAt:m.createdAt||new Date().toISOString()});\n'
        '    }\n'
        '    for(const inc of (ktk.incidentes||[])) {\n'
        '      await db.add("incidents",{\n'
        '        productName:inc.productName,expected:inc.expected,found:inc.found,diff:inc.diff,\n'
        '        sessionId,responsibleSessionId:null,foundBy:ktk.funcionario_id,responsible:null,\n'
        '        status:"open",importedFrom:ktk.id_sessao,\n'
        '        note:`Importado de ${ktk.funcionario}`,\n'
        '        createdAt:inc.date||new Date().toISOString(),\n'
        '      });\n'
        '    }\n'
        '    await db.put("ktkImports",{...rec,status:"confirmed",confirmedAt:new Date().toISOString(),confirmedBy:user.id,sessionId});\n'
        '    return {sessionId,incidentCount:(ktk.incidentes||[]).length};\n'
        '  },\n\n'
        '  async rejectImport(importId,reason) {\n'
        '    requireRole("admin");\n'
        '    const rec=await db.get("ktkImports",importId);\n'
        '    if(!rec) throw new Error("Importação não encontrada.");',
        '  async confirmImport(importId, manualCorrections) {\n'
        '    requireRole("admin");\n'
        '    manualCorrections = manualCorrections || {};\n'
        '    const rec=await db.get("ktkImports",importId);\n'
        '    if(!rec || rec.status!=="pending") throw new Error("Importação não encontrada ou já processada.");\n'
        '    const ktk=rec.ktk;\n'
        '    const dup=await sessionService.checkDuplicate(ktk.id_sessao);\n'
        '    if(dup) { await db.put("ktkImports",{...rec,status:"rejected",rejectedReason:"Duplicado no momento da confirmação"}); throw new Error(`DUPLICATE:${dup.id}:${dup.openedAt}`); }\n\n'
        '    const user=getUser();\n'
        '    const sessionId=await db.add("sessions",{\n'
        '      uuid:ktk.id_sessao, userId:ktk.funcionario_id, userName:ktk.funcionario,\n'
        '      status:"validated", openedAt:ktk.data_abertura, closedAt:ktk.data_fecho,\n'
        '      prevSessionUuid:ktk.sessao_anterior||null,\n'
        '      stockRecebido:ktk.stock_recebido||{}, stockEsperado:ktk.stock_esperado||{},\n'
        '      totalVendas:ktk.total_vendas||0, nVendas:ktk.n_vendas||0,\n'
        '      hasIncidents:(ktk.incidentes||[]).length>0,\n'
        '      validated:true, validatedBy:user.id, validatedAt:new Date().toISOString(),\n'
        '      ktkHash:ktk.hash, importedKtkUuid:ktk.id_sessao,\n'
        '      isImported:true, hashLegacy:rec.hashResult?.legacy,\n'
        '      lojaId:ktk.loja_id, lojaNome:ktk.loja_nome,\n'
        '    });\n'
        '    for(const m of (ktk.stock_movements||[])) {\n'
        '      await db.add("stockMovements",{...m,sessionId,userId:ktk.funcionario_id,imported:true,createdAt:m.createdAt||new Date().toISOString()});\n'
        '    }\n'
        '    for(const inc of (ktk.incidentes||[])) {\n'
        '      await db.add("incidents",{\n'
        '        productName:inc.productName,expected:inc.expected,found:inc.found,diff:inc.diff,\n'
        '        sessionId,responsibleSessionId:null,foundBy:ktk.funcionario_id,responsible:null,\n'
        '        status:"open",importedFrom:ktk.id_sessao,\n'
        '        note:`Importado de ${ktk.funcionario}`,\n'
        '        createdAt:inc.date||new Date().toISOString(),\n'
        '      });\n'
        '    }\n\n'
        '    // Reconciliação real do stock: aplica o delta vendido (corrigido ou original).\n'
        '    const stockRows = Object.values(ktk.stock_esperado||{});\n'
        '    for (const row of stockRows) {\n'
        '      const hasCorrection = Object.prototype.hasOwnProperty.call(manualCorrections, row.productId);\n'
        '      const soldFinal = hasCorrection ? Number(manualCorrections[row.productId]) : Number(row.sold||0);\n'
        '      if (soldFinal !== 0) {\n'
        '        await addStockMovement({\n'
        '          productId: row.productId, productName: row.productName,\n'
        '          type: "import_turno", location: "shop", qty: -soldFinal,\n'
        '          reference: "ktk:"+ktk.id_sessao, note: "Importado do turno de "+ktk.funcionario,\n'
        '          sessionId, userId: ktk.funcionario_id, createdAt: new Date().toISOString(),\n'
        '        });\n'
        '      }\n'
        '      if (hasCorrection) {\n'
        '        await db.add("stockCorrections", {\n'
        '          importId, productId: row.productId, productName: row.productName,\n'
        '          originalValue: Number(row.sold||0), correctedValue: soldFinal,\n'
        '          correctedBy: user.id, correctedAt: new Date().toISOString(),\n'
        '        });\n'
        '      }\n'
        '    }\n\n'
        '    await db.put("ktkImports",{...rec,status:"confirmed",confirmedAt:new Date().toISOString(),confirmedBy:user.id,sessionId});\n'
        '    return {sessionId,incidentCount:(ktk.incidentes||[]).length};\n'
        '  },\n\n'
        '  async rejectImport(importId,reason) {\n'
        '    requireRole("admin");\n'
        '    const rec=await db.get("ktkImports",importId);\n'
        '    if(!rec || rec.status!=="pending") throw new Error("Importação não encontrada ou já processada.");',
    ),
]

ESCRITORIO_PATCHES = [
    (
        "trocar placeholder por lista real de turnos pendentes",
        '  if (user.role === "admin") {\n'
        '    var all     = await db.getAll("ktkImports");\n'
        '    var pending = all.filter(function(p) { return p.status === "pending"; });\n\n'
        '    var summaryWrap = document.createElement("div");\n'
        '    summaryWrap.className = "esc-summary-wrap";\n'
        '    summaryWrap.innerHTML =\n'
        '      \'<div class="lic-limit-item">\' +\n'
        '      \'<div class="lic-limit-val">\' + pending.length + \'</div>\' +\n'
        '      \'<div class="lic-limit-label">Turno\' + (pending.length !== 1 ? "s" : "") + \' pendente\' + (pending.length !== 1 ? "s" : "") + \'</div>\' +\n'
        '      \'</div>\';\n'
        '    wrap.appendChild(summaryWrap);\n\n'
        '    var placeholder = document.createElement("div");\n'
        '    placeholder.className = "empty-state";\n'
        '    placeholder.innerHTML =\n'
        '      \'<div class="empty-state-title">Revisão e confirmação — em construção</div>\';\n'
        '    wrap.appendChild(placeholder);\n'
        '  }',
        '  if (user.role === "admin") {\n'
        '    var all     = await db.getAll("ktkImports");\n'
        '    var pending = all.filter(function(p) { return p.status === "pending"; });\n\n'
        '    var summaryWrap = document.createElement("div");\n'
        '    summaryWrap.className = "esc-summary-wrap";\n'
        '    summaryWrap.innerHTML =\n'
        '      \'<div class="lic-limit-item">\' +\n'
        '      \'<div class="lic-limit-val">\' + pending.length + \'</div>\' +\n'
        '      \'<div class="lic-limit-label">Turno\' + (pending.length !== 1 ? "s" : "") + \' pendente\' + (pending.length !== 1 ? "s" : "") + \'</div>\' +\n'
        '      \'</div>\';\n'
        '    wrap.appendChild(summaryWrap);\n\n'
        '    var listWrap = document.createElement("div");\n'
        '    if (!pending.length) {\n'
        '      listWrap.className = "empty-state";\n'
        '      listWrap.innerHTML = \'<div class="empty-state-title">Nenhum turno pendente</div>\';\n'
        '    } else {\n'
        '      listWrap.className = "esc-pending-list";\n'
        '      listWrap.innerHTML = pending.map(function(p) {\n'
        '        var pktk = p.ktk;\n'
        '        return \'<button class="esc-pending-item" onclick="window._abrirRevisaoKtk(\' + p.id + \')">\' +\n'
        '          \'<div>\' +\n'
        '          \'<div class="esc-pending-name">\' + (pktk.funcionario||"Desconhecido") + \'</div>\' +\n'
        '          \'<div class="esc-pending-meta">\' + fmtDate(p.importedAt) + \'</div>\' +\n'
        '          \'</div>\' +\n'
        '          \'<span class="perfil-menu-chevron">›</span>\' +\n'
        '          \'</button>\';\n'
        '      }).join("");\n'
        '    }\n'
        '    wrap.appendChild(listWrap);\n'
        '  }',
    ),
    (
        "adicionar modal de revisão + confirmar/rejeitar no fim do ficheiro",
        'window._confirmarImportKtk = async function() {\n'
        '  var ktk = window._ktkPendente;\n'
        '  if (!ktk) { toast("Nenhum KTK pendente.","error"); return; }\n'
        '  try {\n'
        '    await ktkService.stageImport(ktk);\n'
        '    window._ktkPendente = null;\n'
        '    window._ktkContagemManual = {};\n'
        '    toast("Turno enviado para o Escritório — aguarda revisão e confirmação.","success");\n'
        '    closeModal();\n'
        '    await loadEscritorio();\n'
        '  } catch(err) {\n'
        '    if (err.message.startsWith("DUPLICATE:")) toast("Este turno já foi importado.","error");\n'
        '    else if (err.message.startsWith("PENDING_DUPLICATE:")) toast("Este turno já está pendente no Escritório.","error");\n'
        '    else if (err.message==="INVALID_HASH") toast("Hash inválido — ficheiro modificado.","error");\n'
        '    else if (err.message==="INVALID_FORMAT") toast("Formato .ktk inválido.","error");\n'
        '    else toast("Erro: "+err.message,"error");\n'
        '    closeModal();\n'
        '  }\n'
        '};',
        'window._confirmarImportKtk = async function() {\n'
        '  var ktk = window._ktkPendente;\n'
        '  if (!ktk) { toast("Nenhum KTK pendente.","error"); return; }\n'
        '  try {\n'
        '    await ktkService.stageImport(ktk);\n'
        '    window._ktkPendente = null;\n'
        '    window._ktkContagemManual = {};\n'
        '    toast("Turno enviado para o Escritório — aguarda revisão e confirmação.","success");\n'
        '    closeModal();\n'
        '    await loadEscritorio();\n'
        '  } catch(err) {\n'
        '    if (err.message.startsWith("DUPLICATE:")) toast("Este turno já foi importado.","error");\n'
        '    else if (err.message.startsWith("PENDING_DUPLICATE:")) toast("Este turno já está pendente no Escritório.","error");\n'
        '    else if (err.message==="INVALID_HASH") toast("Hash inválido — ficheiro modificado.","error");\n'
        '    else if (err.message==="INVALID_FORMAT") toast("Formato .ktk inválido.","error");\n'
        '    else toast("Erro: "+err.message,"error");\n'
        '    closeModal();\n'
        '  }\n'
        '};\n\n'
        'window._abrirRevisaoKtk = async function(importId) {\n'
        '  var rec = await db.get("ktkImports", importId);\n'
        '  if (!rec) { toast("Importação não encontrada.","error"); return; }\n'
        '  showRevisaoModal(rec);\n'
        '};\n\n'
        'function showRevisaoModal(rec) {\n'
        '  var ktk = rec.ktk;\n'
        '  var stockRows = Object.values(ktk.stock_esperado||{});\n\n'
        '  var rowsHtml = stockRows.map(function(r) {\n'
        '    return \'<div class="esc-review-row" data-product-id="\' + r.productId + \'" data-received="\' + r.received + \'">\' +\n'
        '      \'<span class="esc-review-name">\' + r.productName + \'</span>\' +\n'
        '      \'<span class="esc-review-received">\' + r.received + \'</span>\' +\n'
        '      \'<input class="esc-review-input" type="number" value="\' + r.sold + \'" oninput="window._recalcEsperado(this)"/>\' +\n'
        '      \'<span class="esc-review-expected">\' + r.expected + \'</span>\' +\n'
        '      \'</div>\';\n'
        '  }).join("");\n\n'
        '  openModal("Revisão — " + ktk.funcionario,\n'
        '    \'<div style="max-height:65vh;overflow-y:auto">\' +\n'
        '    \'<div class="esc-review-header">\' +\n'
        '    \'<span>Produto</span><span>Recebeu</span><span>Vendeu</span><span>Esperado</span>\' +\n'
        '    \'</div>\' +\n'
        '    rowsHtml +\n'
        '    \'</div>\' +\n'
        '    \'<div style="display:flex;gap:8px;margin-top:14px;border-top:1px solid #f4f4f5;padding-top:14px">\' +\n'
        '    \'<button class="btn btn-ghost btn-full" onclick="window._rejeitarKtkPendente(\' + rec.id + \')">Rejeitar</button>\' +\n'
        '    \'<button class="btn btn-primary btn-full" onclick="window._confirmarKtkPendente(\' + rec.id + \')">\' +\n'
        '    \'<i data-lucide="check"></i> Confirmar</button>\' +\n'
        '    \'</div>\');\n'
        '  refreshIcons(el("modal-box"));\n'
        '}\n\n'
        'window._recalcEsperado = function(input) {\n'
        '  var row = input.closest(".esc-review-row");\n'
        '  var received = Number(row.getAttribute("data-received"));\n'
        '  var sold = Number(input.value || 0);\n'
        '  row.querySelector(".esc-review-expected").textContent = received - sold;\n'
        '};\n\n'
        'window._confirmarKtkPendente = async function(importId) {\n'
        '  var corrections = {};\n'
        '  document.querySelectorAll(".esc-review-row").forEach(function(row) {\n'
        '    var pid = Number(row.getAttribute("data-product-id"));\n'
        '    var input = row.querySelector(".esc-review-input");\n'
        '    var val = Number(input.value || 0);\n'
        '    if (String(val) !== input.defaultValue) corrections[pid] = val;\n'
        '  });\n'
        '  try {\n'
        '    await ktkService.confirmImport(importId, corrections);\n'
        '    toast("Turno confirmado.","success");\n'
        '    closeModal();\n'
        '    await loadEscritorio();\n'
        '  } catch(err) {\n'
        '    toast("Erro: "+err.message,"error");\n'
        '  }\n'
        '};\n\n'
        'window._rejeitarKtkPendente = async function(importId) {\n'
        '  if (!confirm("Rejeitar este turno? Esta ação não pode ser desfeita.")) return;\n'
        '  try {\n'
        '    await ktkService.rejectImport(importId, "Rejeitado manualmente no Escritório");\n'
        '    toast("Turno rejeitado.","info");\n'
        '    closeModal();\n'
        '    await loadEscritorio();\n'
        '  } catch(err) {\n'
        '    toast("Erro: "+err.message,"error");\n'
        '  }\n'
        '};',
    ),
]

CSS_PATCHES = [
    (
        "adicionar classes .esc-pending-* e .esc-review-*",
        '.esc-import-btn i, .esc-import-btn svg { width: 18px; height: 18px; }',
        '.esc-import-btn i, .esc-import-btn svg { width: 18px; height: 18px; }\n\n'
        '.esc-pending-list { background: var(--bg2); border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-sm); }\n'
        '.esc-pending-item { width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 13px 14px; border: none; border-bottom: 1px solid var(--border2); background: var(--bg2); cursor: pointer; font-family: var(--font); text-align: left; }\n'
        '.esc-pending-item:last-child { border-bottom: none; }\n'
        '.esc-pending-item:active { background: var(--border2); }\n'
        '.esc-pending-name { font-size: 14px; font-weight: 700; color: var(--text); }\n'
        '.esc-pending-meta { font-size: 11px; color: var(--text4); margin-top: 2px; }\n\n'
        '.esc-review-header { display: grid; grid-template-columns: 1fr 55px 55px 55px; padding: 8px 10px; background: var(--border2); border-radius: 8px 8px 0 0; font-size: 10px; font-weight: 700; color: var(--text3); text-transform: uppercase; }\n'
        '.esc-review-row { display: grid; grid-template-columns: 1fr 55px 55px 55px; align-items: center; padding: 8px 10px; border-bottom: 1px solid var(--border2); gap: 4px; }\n'
        '.esc-review-name { font-size: 12px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n'
        '.esc-review-received { font-size: 12px; color: var(--text3); text-align: center; }\n'
        '.esc-review-input { width: 100%; text-align: center; font-size: 13px; font-weight: 700; border: 1.5px solid var(--border); border-radius: 6px; padding: 4px 2px; font-family: var(--font); color: var(--text); }\n'
        '.esc-review-input:focus { border-color: var(--primary); outline: none; }\n'
        '.esc-review-expected { font-size: 13px; font-weight: 700; text-align: right; color: var(--primary); }',
    ),
]

print("Aplicando patches em db.js:")
apply_patches("~/kontaki/src/db.js", DB_PATCHES)

print("Aplicando patches em services.js:")
apply_patches("~/kontaki/src/services.js", SERVICES_PATCHES)

print("Aplicando patches em escritorio.js:")
apply_patches("~/kontaki/src/components/escritorio.js", ESCRITORIO_PATCHES)

print("Aplicando patches em components.css:")
apply_patches("~/kontaki/src/styles/components.css", CSS_PATCHES)

print("Feito. Falta: bumpar SW e testar confirmar/rejeitar com e sem correção manual.")
