import pathlib

f = pathlib.Path.home() / "kontaki" / "src" / "components" / "perfil.js"
src = f.read_text(encoding="utf-8")

def replace_once(s, old, new, label):
    n = s.count(old)
    if n != 1:
        raise SystemExit(f"[ABORTADO] '{label}' encontrado {n}x (esperado 1x). Nada foi alterado.")
    return s.replace(old, new)

# 1) item de menu, disponível para todos (commonItems)
old1 = '''    { label: "Contactos",         sub: "Suporte Introxeer Technology",   icon: "headphones",     color: "#dbeafe", iconColor: "#2563eb", page: "contactos",     group: "Sistema"    },'''
new1 = '''    { label: "Ajuda",             sub: "Perguntas frequentes e como usar",icon: "help-circle",   color: "#dbeafe", iconColor: "#2563eb", page: "ajuda",         group: "Sistema"    },
    { label: "Contactos",         sub: "Suporte Introxeer Technology",   icon: "headphones",     color: "#dbeafe", iconColor: "#2563eb", page: "contactos",     group: "Sistema"    },'''
src = replace_once(src, old1, new1, "item de menu Ajuda")

# 2) botão voltar
old2 = '''  ["stock","incidentes","equipa","loja","senha","dashboard","clientes",
   "despesas","contabilidade","assinatura","contactos","configuracoes",
   "seguranca","turno","fornecedores","escritorio","sobre"].forEach(function(name) {'''
new2 = '''  ["stock","incidentes","equipa","loja","senha","dashboard","clientes",
   "despesas","contabilidade","assinatura","contactos","configuracoes",
   "seguranca","turno","fornecedores","escritorio","sobre","ajuda"].forEach(function(name) {'''
src = replace_once(src, old2, new2, "botão voltar de Ajuda")

# 3) array usado por showSubpage
old3 = '''  const subpages = ["stock","incidentes","equipa","loja","senha","dashboard","fornecedores","turno","seguranca","configuracoes","contabilidade","clientes","despesas","assinatura","contactos","escritorio","sobre"];'''
new3 = '''  const subpages = ["stock","incidentes","equipa","loja","senha","dashboard","fornecedores","turno","seguranca","configuracoes","contabilidade","clientes","despesas","assinatura","contactos","escritorio","sobre","ajuda"];'''
src = replace_once(src, old3, new3, "subpages array")

# 4) router chama loadAjuda()
old4 = '''  if (page === "incidentes") await loadIncidentes();'''
new4 = '''  if (page === "incidentes") await loadIncidentes();
  if (page === "ajuda") await loadAjuda();'''
src = replace_once(src, old4, new4, "router de Ajuda")

# 5) função loadAjuda + busca, inserida antes de loadIncidentes
old5 = '''async function loadIncidentes() {'''
new5 = '''var _ajudaLoaded = false;

function _ajudaMatch(article, q) {
  if (!q) return true;
  q = q.toLowerCase();
  if (article.title.toLowerCase().indexOf(q) !== -1) return true;
  if (article.body.toLowerCase().indexOf(q) !== -1) return true;
  return article.keywords.some(function(k){ return k.toLowerCase().indexOf(q) !== -1; });
}

function _renderAjuda(query) {
  var wrap = document.getElementById("ajuda-content");
  if (!wrap) return;
  var articles = window._helpArticles || [];
  var results = articles.filter(function(a){ return _ajudaMatch(a, query); });

  if (!results.length) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-state-title">Nada encontrado para "' + query + '"</div><div style="font-size:12px;color:#71717a;margin-top:4px">Tenta outra palavra, ex: "turno", "incidente", "fiado"</div></div>';
    return;
  }

  var byCategory = {};
  var order = [];
  results.forEach(function(a){
    if (!byCategory[a.category]) { byCategory[a.category] = { icon:a.categoryIcon, items:[] }; order.push(a.category); }
    byCategory[a.category].items.push(a);
  });

  wrap.innerHTML = order.map(function(cat){
    var group = byCategory[cat];
    return '<div style="display:flex;align-items:center;gap:8px;margin:18px 0 10px">' +
        '<i data-lucide="' + group.icon + '" style="width:16px;height:16px;color:var(--primary)"></i>' +
        '<div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">' + cat + '</div>' +
      '</div>' +
      group.items.map(function(a){
        return '<div style="background:#fff;border:1px solid #e4e4e7;border-radius:var(--radius-lg);padding:14px 16px;margin-bottom:10px;box-shadow:var(--shadow-sm)">' +
          '<div style="font-weight:700;font-size:14px;color:var(--text);margin-bottom:6px">' + a.title + '</div>' +
          '<div style="font-size:13px;color:var(--text2);line-height:1.6">' + a.body + '</div>' +
        '</div>';
      }).join("");
  }).join("");

  refreshIcons(wrap);
}

async function loadAjuda() {
  if (!_ajudaLoaded) {
    var mod = await import("../help/index.js");
    window._helpArticles = mod.helpArticles;
    _ajudaLoaded = true;
  }
  var searchInput = document.getElementById("ajuda-search");
  if (searchInput && !searchInput._wired) {
    searchInput.oninput = function() { _renderAjuda(this.value.trim()); };
    searchInput._wired = true;
  }
  _renderAjuda(searchInput ? searchInput.value.trim() : "");
}

async function loadIncidentes() {'''
src = replace_once(src, old5, new5, "função loadAjuda + busca")

f.write_text(src, encoding="utf-8")
print("OK — perfil.js: página Ajuda integrada (menu, router, busca por título/corpo/palavras-chave).")
