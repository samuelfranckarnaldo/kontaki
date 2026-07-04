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


def create_file_if_missing(path, content):
    path = os.path.expanduser(path)
    if os.path.exists(path):
        print(f"  [skip] {path} já existe — não sobrescrevo.")
        return
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"  [ok] criado {path}")


# ── novo componente escritorio.js ──────────────────────────────────────────
ESCRITORIO_JS = '''import { db } from "../db.js";
import { refreshIcons } from "../utils.js";

export async function loadEscritorio() {
  var wrap = document.getElementById("escritorio-content");
  if (!wrap) return;
  wrap.innerHTML = "";

  var all     = await db.getAll("ktkImports");
  var pending = all.filter(function(p) { return p.status === "pending"; });

  var summaryWrap = document.createElement("div");
  summaryWrap.className = "esc-summary-wrap";
  summaryWrap.innerHTML =
    \'<div class="lic-limit-item">\' +
    \'<div class="lic-limit-val">\' + pending.length + \'</div>\' +
    \'<div class="lic-limit-label">Turno\' + (pending.length !== 1 ? "s" : "") + \' pendente\' + (pending.length !== 1 ? "s" : "") + \'</div>\' +
    \'</div>\';
  wrap.appendChild(summaryWrap);

  var placeholder = document.createElement("div");
  placeholder.className = "empty-state";
  placeholder.innerHTML =
    \'<div class="empty-state-title">Em construção</div>\';
  wrap.appendChild(placeholder);

  refreshIcons(wrap);
}
'''

print("Criando escritorio.js:")
create_file_if_missing("~/kontaki/src/components/escritorio.js", ESCRITORIO_JS)
print()

# ── perfil.js ────────────────────────────────────────────────────────────
JS_PATCHES = [
    (
        "adicionar import de loadEscritorio",
        'import { loadFornecedores } from "./fornecedores.js";',
        'import { loadFornecedores } from "./fornecedores.js";\n'
        'import { loadEscritorio } from "./escritorio.js";',
    ),
    (
        "setupSubpageButtons: adicionar 'escritorio' à lista de back-buttons",
        '  ["stock","incidentes","equipa","loja","senha","dashboard","clientes",\n'
        '   "despesas","contabilidade","assinatura","contactos","configuracoes",\n'
        '   "seguranca","turno","fornecedores","sobre"].forEach(function(name) {',
        '  ["stock","incidentes","equipa","loja","senha","dashboard","clientes",\n'
        '   "despesas","contabilidade","assinatura","contactos","configuracoes",\n'
        '   "seguranca","turno","fornecedores","escritorio","sobre"].forEach(function(name) {',
    ),
    (
        "_perfilNav: rotear page 'escritorio' para loadEscritorioPage()",
        '  if (page === "sobre")        loadSobre();\n'
        '};',
        '  if (page === "sobre")        loadSobre();\n'
        '  if (page === "escritorio")   await loadEscritorioPage();\n'
        '};',
    ),
    (
        "adicionar wrapper loadEscritorioPage antes de loadSenhaPage",
        'function loadSenhaPage() {',
        'async function loadEscritorioPage() {\n'
        '  await loadEscritorio();\n'
        '}\n\n'
        'function loadSenhaPage() {',
    ),
]

# ── components.css ───────────────────────────────────────────────────────
CSS_PATCHES = [
    (
        "adicionar .esc-summary-wrap",
        '/* ── LOJA SUBPAGE ───────────────────────────────────────────────────────────── */',
        '.esc-summary-wrap { margin-bottom: 16px; }\n\n'
        '/* ── LOJA SUBPAGE ───────────────────────────────────────────────────────────── */',
    ),
]

# ── index.html ───────────────────────────────────────────────────────────
HTML_PATCHES = [
    (
        "adicionar container subpage-escritorio",
        '      <div id="subpage-sobre" style="display:none">\n'
        '        <div class="page-inner">\n'
        '          <button class="btn btn-ghost btn-sm" id="btn-back-sobre">← Voltar</button>\n'
        '          <div style="font-size:17px;font-weight:700;margin:8px 0 14px">Sobre</div>\n'
        '          <div id="sobre-content"></div>\n'
        '        </div>\n'
        '      </div>',
        '      <div id="subpage-sobre" style="display:none">\n'
        '        <div class="page-inner">\n'
        '          <button class="btn btn-ghost btn-sm" id="btn-back-sobre">← Voltar</button>\n'
        '          <div style="font-size:17px;font-weight:700;margin:8px 0 14px">Sobre</div>\n'
        '          <div id="sobre-content"></div>\n'
        '        </div>\n'
        '      </div>\n\n'
        '      <div id="subpage-escritorio" style="display:none">\n'
        '        <div class="page-inner">\n'
        '          <button class="btn btn-ghost btn-sm" id="btn-back-escritorio">← Voltar</button>\n'
        '          <div style="font-size:17px;font-weight:700;margin:8px 0 14px">Escritório</div>\n'
        '          <div id="escritorio-content"></div>\n'
        '        </div>\n'
        '      </div>',
    ),
]

print("Aplicando patches em perfil.js:")
apply_patches("~/kontaki/src/components/perfil.js", JS_PATCHES)

print("Aplicando patches em components.css:")
apply_patches("~/kontaki/src/styles/components.css", CSS_PATCHES)

print("Aplicando patches em index.html:")
apply_patches("~/kontaki/index.html", HTML_PATCHES)

print("Feito. Lembra de bumpar a versão do Service Worker (sw.js) — e desta vez adiciona")
print("também a nova entrada no array ASSETS: BASE + '/src/components/escritorio.js'")
