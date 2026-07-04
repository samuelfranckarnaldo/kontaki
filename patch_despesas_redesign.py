import pathlib

f = pathlib.Path.home() / "kontaki" / "src" / "components" / "despesas.js"
src = f.read_text(encoding="utf-8")

def replace_once(s, old, new, label):
    n = s.count(old)
    if n != 1:
        raise SystemExit(f"[ABORTADO] '{label}' encontrado {n}x (esperado 1x). Nada foi alterado.")
    return s.replace(old, new)

# 1) usar as classes .desp-hero-* já existentes, mostrar total contabilizável se houver excepções
old1 = '''  // ── Hero: total do mês
  var heroEl = document.createElement("div");
  heroEl.className = "desp-hero";
  heroEl.style.background = "linear-gradient(135deg,#dc2626,#ef4444)";
  heroEl.style.color = "#fff";
  heroEl.style.borderRadius = "16px";
  heroEl.style.padding = "20px 16px";
  heroEl.style.marginBottom = "16px";
  heroEl.innerHTML =
    '<div style="font-size:11px;font-weight:700;opacity:.8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Total em ' + nomeMes + '</div>' +
    '<div style="font-size:32px;font-weight:800;line-height:1;letter-spacing:-.5px">' + fmt(totalMes) + '</div>' +
    '<div style="font-size:12px;opacity:.8;margin-top:6px">' + doMes.length + ' despesa' + (doMes.length!==1?"s":"") + ' · clica + para registar</div>';
  wrap.appendChild(heroEl);'''

new1 = '''  // ── Hero: total do mês
  var totalContabilizavel = doMes.filter(function(e){ return e.countsInAccounting !== false; })
    .reduce(function(a,e){ return a+(e.amount||0); },0);
  var temExcecoes = doMes.some(function(e){ return e.countsInAccounting === false; });

  var heroEl = document.createElement("div");
  heroEl.className = "desp-hero";
  heroEl.innerHTML =
    '<div class="desp-hero-label">Total em ' + nomeMes + '</div>' +
    '<div class="desp-hero-val">' + fmt(totalMes) + '</div>' +
    '<div class="desp-hero-sub">' + doMes.length + ' despesa' + (doMes.length!==1?"s":"") + ' · clica + para registar</div>' +
    (temExcecoes
      ? '<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border2);font-size:12px;color:var(--text3)">Contabilizável: <strong style="color:var(--text2)">' + fmt(totalContabilizavel) + '</strong></div>'
      : '');
  wrap.appendChild(heroEl);'''
src = replace_once(src, old1, new1, "hero neutro com total contabilizável")

# 2) botão "Nova despesa" em roxo
old2 = '''  btnEl.style.background = "var(--danger)";'''
new2 = '''  btnEl.style.background = "var(--primary)";'''
src = replace_once(src, old2, new2, "cor do botão Nova despesa")

# 3) etiqueta "Não contabilizável" no histórico
old3 = '''    item.innerHTML =
      '<div class="desp-item-icon"><i data-lucide="arrow-down-left"></i></div>' +
      '<div style="flex:1;min-width:0">' +
        '<div class="desp-item-desc">' + e.description + '</div>' +
        '<div class="desp-item-meta">' + e.category + ' · ' + fmtDate(e.date) + '</div>' +
      '</div>' +'''
new3 = '''    var naoContabilizavel = e.countsInAccounting === false;
    item.innerHTML =
      '<div class="desp-item-icon"><i data-lucide="arrow-down-left"></i></div>' +
      '<div style="flex:1;min-width:0">' +
        '<div class="desp-item-desc">' + e.description + '</div>' +
        '<div class="desp-item-meta">' + e.category + ' · ' + fmtDate(e.date) + (naoContabilizavel ? ' · <span style="color:var(--text4)">Não contabilizável</span>' : '') + '</div>' +
      '</div>' +'''
src = replace_once(src, old3, new3, "etiqueta não contabilizável")

# 4) formulário de EDIÇÃO: bloqueio antes de abrir modal + toggle de contabilidade
old4 = '''window._editDespesa = async function(id) {
  var e = await db.get("expenses", id);
  if (!e) return;
  openModal("Editar Despesa",
    '<div style="display:flex;flex-direction:column;gap:14px">' +
    '<div class="field"><label>Descrição *</label><input id="de-desc" value="' + e.description + '" placeholder="Ex: Renda de Junho"/></div>' +
    '<div class="field"><label>Categoria</label><select id="de-cat">' + CATEGORIAS.map(function(c){ return '<option' + (c===e.category?' selected':'') + '>' + c + '</option>'; }).join("") + '</select></div>' +
    '<div class="field"><label>Valor (Kz) *</label><input type="number" id="de-amount" value="' + e.amount + '" placeholder="0"/></div>' +
    '<div class="field"><label>Data</label><input type="date" id="de-date" value="' + (e.date||"").slice(0,10) + '"/></div>' +
    '</div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" style="background:var(--danger)" onclick="window._updateDespesa(' + id + ')"><i data-lucide="save"></i> Guardar</button>' +
    '</div>');
  refreshIcons(el("modal-box"));
};'''

new4 = '''function _accountingToggleHtml(checked) {
  return '<div class="field">' +
    '<label style="display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;padding:10px 12px;background:#fafafa;border-radius:var(--radius-sm)">' +
      '<span style="font-size:13px;font-weight:600;color:var(--text2)">Conta para a contabilidade</span>' +
      '<input type="checkbox" id="de-accounting" ' + (checked !== false ? 'checked' : '') + ' style="width:18px;height:18px;accent-color:var(--primary)"/>' +
    '</label>' +
    '<div style="font-size:11px;color:var(--text4);margin-top:4px;line-height:1.4">Desmarca se for uma despesa pessoal ou sem comprovativo — não entra no cálculo de lucro do negócio.</div>' +
  '</div>';
}

window._editDespesa = async function(id) {
  var { getSession } = await import("../auth.js");
  if (!getSession()) { toast("Abre um turno primeiro.", "error"); return; }

  var e = await db.get("expenses", id);
  if (!e) return;
  openModal("Editar Despesa",
    '<div style="display:flex;flex-direction:column;gap:14px">' +
    '<div class="field"><label>Descrição *</label><input id="de-desc" value="' + e.description + '" placeholder="Ex: Renda de Junho"/></div>' +
    '<div class="field"><label>Categoria</label><select id="de-cat">' + CATEGORIAS.map(function(c){ return '<option' + (c===e.category?' selected':'') + '>' + c + '</option>'; }).join("") + '</select></div>' +
    '<div class="field"><label>Valor (Kz) *</label><input type="number" id="de-amount" value="' + e.amount + '" placeholder="0"/></div>' +
    '<div class="field"><label>Data</label><input type="date" id="de-date" value="' + (e.date||"").slice(0,10) + '"/></div>' +
    _accountingToggleHtml(e.countsInAccounting) +
    '</div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" style="background:var(--primary)" onclick="window._updateDespesa(' + id + ')"><i data-lucide="save"></i> Guardar</button>' +
    '</div>');
  refreshIcons(el("modal-box"));
};'''
src = replace_once(src, old4, new4, "editar despesa: bloqueio + toggle")

# 5) gravar countsInAccounting ao actualizar
old5 = '''  await db.put("expenses", Object.assign({}, existing, {
    description: desc,
    category: (el("de-cat")||{}).value || "Outro",
    amount: amount,
    date: (el("de-date")||{}).value || existing.date,
  }));'''
new5 = '''  var accEl = document.getElementById("de-accounting");
  await db.put("expenses", Object.assign({}, existing, {
    description: desc,
    category: (el("de-cat")||{}).value || "Outro",
    amount: amount,
    date: (el("de-date")||{}).value || existing.date,
    countsInAccounting: accEl ? accEl.checked : true,
  }));'''
src = replace_once(src, old5, new5, "gravar toggle na actualização")

# 6) formulário de NOVA despesa: bloqueio antes de abrir modal + toggle + cor
old6 = '''window._openDespesaForm = function() {
  openModal("Nova Despesa",
    '<div style="display:flex;flex-direction:column;gap:14px">' +
    '<div class="field"><label>Descrição *</label><input id="de-desc" placeholder="Ex: Renda de Junho"/></div>' +
    '<div class="field"><label>Categoria</label><select id="de-cat">' + CATEGORIAS.map(function(c){return '<option>'+c+'</option>';}).join("") + '</select></div>' +
    '<div class="field"><label>Valor (Kz) *</label><input type="number" id="de-amount" placeholder="0"/></div>' +
    '<div class="field"><label>Data</label><input type="date" id="de-date" value="' + new Date().toISOString().slice(0,10) + '"/></div>' +
    '</div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" style="background:var(--danger)" onclick="window._saveDespesa()"><i data-lucide="save"></i> Registar</button>' +
    '</div>');
  refreshIcons(el("modal-box"));
};'''

new6 = '''window._openDespesaForm = async function() {
  var { getSession } = await import("../auth.js");
  if (!getSession()) { toast("Abre um turno primeiro.", "error"); return; }

  openModal("Nova Despesa",
    '<div style="display:flex;flex-direction:column;gap:14px">' +
    '<div class="field"><label>Descrição *</label><input id="de-desc" placeholder="Ex: Renda de Junho"/></div>' +
    '<div class="field"><label>Categoria</label><select id="de-cat">' + CATEGORIAS.map(function(c){return '<option>'+c+'</option>';}).join("") + '</select></div>' +
    '<div class="field"><label>Valor (Kz) *</label><input type="number" id="de-amount" placeholder="0"/></div>' +
    '<div class="field"><label>Data</label><input type="date" id="de-date" value="' + new Date().toISOString().slice(0,10) + '"/></div>' +
    _accountingToggleHtml(true) +
    '</div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" style="background:var(--primary)" onclick="window._saveDespesa()"><i data-lucide="save"></i> Registar</button>' +
    '</div>');
  refreshIcons(el("modal-box"));
};'''
src = replace_once(src, old6, new6, "novo formulário: bloqueio + toggle + cor")

# 7) gravar countsInAccounting ao criar
old7 = '''  await db.add("expenses", {
    description: desc,
    category: (el("de-cat")||{}).value || "Outro",
    amount: amount,
    date: (el("de-date")||{}).value || new Date().toISOString().slice(0,10),
    userId: user ? user.id : null,
    createdAt: new Date().toISOString(),
  });'''
new7 = '''  var accEl2 = document.getElementById("de-accounting");
  await db.add("expenses", {
    description: desc,
    category: (el("de-cat")||{}).value || "Outro",
    amount: amount,
    date: (el("de-date")||{}).value || new Date().toISOString().slice(0,10),
    userId: user ? user.id : null,
    countsInAccounting: accEl2 ? accEl2.checked : true,
    createdAt: new Date().toISOString(),
  });'''
src = replace_once(src, old7, new7, "gravar toggle na criação")

f.write_text(src, encoding="utf-8")
print("OK — despesas.js: paleta roxo/neutro, toggle de contabilidade, bloqueio de turno antes do modal abrir.")
