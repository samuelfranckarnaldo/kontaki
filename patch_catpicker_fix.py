import pathlib

f = pathlib.Path.home() / "kontaki" / "src" / "components" / "despesas.js"
src = f.read_text(encoding="utf-8")

def replace_once(s, old, new, label):
    n = s.count(old)
    if n != 1:
        raise SystemExit(f"[ABORTADO] '{label}' encontrado {n}x (esperado 1x). Nada foi alterado.")
    return s.replace(old, new)

old = '''window._openCatPicker = function() {
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
};'''

new = '''window._openCatPicker = function() {
  var btn = document.getElementById("de-cat-btn");
  var current = btn ? btn.getAttribute("data-value") : CATEGORIAS[0];
  window._catPickerReturnTo = btn;

  var old = document.getElementById("cat-picker-overlay");
  if (old) old.remove();

  var rows = CATEGORIAS.map(function(c){
    var active = c === current;
    return '<button onclick="window._selectCat(\\'' + c.replace(/'/g,"\\\\'") + '\\')" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border:none;border-bottom:1px solid #f4f4f5;background:none;font-size:14px;font-family:inherit;color:' + (active?"var(--primary)":"var(--text)") + ';font-weight:' + (active?"700":"500") + ';cursor:pointer;text-align:left">' +
      '<span>' + c + '</span>' +
      (active ? '<i data-lucide="check" style="width:16px;height:16px;color:var(--primary)"></i>' : '') +
      '</button>';
  }).join("");

  var overlay = document.createElement("div");
  overlay.id = "cat-picker-overlay";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9999;display:flex;align-items:flex-end";
  overlay.innerHTML =
    '<div style="width:100%;background:#fff;border-radius:20px 20px 0 0;max-height:70vh;display:flex;flex-direction:column;padding-bottom:env(safe-area-inset-bottom,0)">' +
      '<div style="padding:16px 18px 10px;font-size:15px;font-weight:700;color:var(--text);border-bottom:1px solid #f4f4f5">Escolher Categoria</div>' +
      '<div style="overflow-y:auto">' + rows + '</div>' +
    '</div>';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
  refreshIcons(overlay);
};

window._selectCat = function(value) {
  var btn = window._catPickerReturnTo || document.getElementById("de-cat-btn");
  if (btn) {
    btn.setAttribute("data-value", value);
    var span = btn.querySelector("span");
    if (span) span.textContent = value;
  }
  var overlay = document.getElementById("cat-picker-overlay");
  if (overlay) overlay.remove();
};'''
src = replace_once(src, old, new, "picker de categoria como folha própria (não usa openModal)")

f.write_text(src, encoding="utf-8")
print("OK — despesas.js: picker de categoria agora é uma folha independente, não apaga o formulário por baixo.")
