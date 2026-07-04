import pathlib

f = pathlib.Path.home() / "kontaki" / "src" / "components" / "despesas.js"
src = f.read_text(encoding="utf-8")

def replace_once(s, old, new, label):
    n = s.count(old)
    if n != 1:
        raise SystemExit(f"[ABORTADO] '{label}' encontrado {n}x (esperado 1x). Nada foi alterado.")
    return s.replace(old, new)

# 1) lista de categorias ampliada
old1 = '''var CATEGORIAS = ["Renda","Electricidade","Água","Salários","Transporte","Manutenção","Internet/Telefone","Outro"];'''
new1 = '''var CATEGORIAS = ["Renda","Electricidade","Água","Salários","Transporte","Manutenção","Internet/Telefone","Impostos e Taxas","Combustível","Marketing e Publicidade","Seguros","Material de Escritório","Limpeza","Segurança","Comissões","Outro"];'''
src = replace_once(src, old1, new1, "lista de categorias ampliada")

# 2) picker próprio (substitui <select> nativo) — botão + modal com lista tocável
old2 = '''window._editDespesa = async function(id) {'''
new2 = '''function _catPickerButtonHtml(current) {
  return '<div class="field">' +
    '<label>Categoria</label>' +
    '<button type="button" id="de-cat-btn" data-value="' + current + '" onclick="window._openCatPicker()" ' +
    'style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:11px 12px;border:1.5px solid #e4e4e7;border-radius:var(--radius-sm);background:#fff;font-size:14px;font-family:inherit;color:var(--text);cursor:pointer">' +
    '<span>' + current + '</span>' +
    '<i data-lucide="chevron-down" style="width:16px;height:16px;color:var(--text4)"></i>' +
    '</button>' +
  '</div>';
}

window._openCatPicker = function() {
  var btn = document.getElementById("de-cat-btn");
  var current = btn ? btn.getAttribute("data-value") : CATEGORIAS[0];
  window._catPickerReturnTo = btn;

  var rows = CATEGORIAS.map(function(c){
    var active = c === current;
    return '<button onclick="window._selectCat(\\'' + c.replace(/'/g,"\\\\'") + '\\')" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:13px 4px;border:none;border-bottom:1px solid #f4f4f5;background:none;font-size:14px;font-family:inherit;color:' + (active?"var(--primary)":"var(--text)") + ';font-weight:' + (active?"700":"500") + ';cursor:pointer;text-align:left">' +
      '<span>' + c + '</span>' +
      (active ? '<i data-lucide="check" style="width:16px;height:16px;color:var(--primary)"></i>' : '') +
      '</button>';
  }).join("");

  openModal("Escolher Categoria",
    '<div style="max-height:360px;overflow-y:auto">' + rows + '</div>');
  refreshIcons(el("modal-box"));
};

window._selectCat = function(value) {
  var btn = window._catPickerReturnTo || document.getElementById("de-cat-btn");
  if (btn) {
    btn.setAttribute("data-value", value);
    var span = btn.querySelector("span");
    if (span) span.textContent = value;
  }
  closeModal();
};

window._editDespesa = async function(id) {'''
src = replace_once(src, old2, new2, "picker próprio de categorias")

# 3) formulário de edição usa o novo picker em vez de <select>
old3 = '''    '<div class="field"><label>Categoria</label><select id="de-cat">' + CATEGORIAS.map(function(c){ return '<option' + (c===e.category?' selected':'') + '>' + c + '</option>'; }).join("") + '</select></div>' +'''
new3 = '''    _catPickerButtonHtml(e.category || CATEGORIAS[0]) +'''
src = replace_once(src, old3, new3, "picker no formulário de edição")

# 4) formulário de nova despesa usa o novo picker
old4 = '''    '<div class="field"><label>Categoria</label><select id="de-cat">' + CATEGORIAS.map(function(c){return '<option>'+c+'</option>';}).join("") + '</select></div>' +'''
new4 = '''    _catPickerButtonHtml(CATEGORIAS[0]) +'''
src = replace_once(src, old4, new4, "picker no formulário de nova despesa")

# 5) leitura do valor escolhido passa a vir do botão, não de um <select>
old5 = '''  await db.put("expenses", Object.assign({}, existing, {
    description: desc,
    category: (el("de-cat")||{}).value || "Outro",'''
new5 = '''  var catBtnU = document.getElementById("de-cat-btn");
  await db.put("expenses", Object.assign({}, existing, {
    description: desc,
    category: (catBtnU ? catBtnU.getAttribute("data-value") : null) || "Outro",'''
src = replace_once(src, old5, new5, "ler categoria do botão ao actualizar")

old6 = '''  var accEl2 = document.getElementById("de-accounting");
  await db.add("expenses", {
    description: desc,
    category: (el("de-cat")||{}).value || "Outro",'''
new6 = '''  var accEl2 = document.getElementById("de-accounting");
  var catBtnN = document.getElementById("de-cat-btn");
  await db.add("expenses", {
    description: desc,
    category: (catBtnN ? catBtnN.getAttribute("data-value") : null) || "Outro",'''
src = replace_once(src, old6, new6, "ler categoria do botão ao criar")

f.write_text(src, encoding="utf-8")
print("OK — despesas.js: picker de categorias próprio (sem select nativo), 8 categorias novas adicionadas.")
