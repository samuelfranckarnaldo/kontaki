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


SERVICES_PATCHES = [
    (
        "stageImport: requireRole('admin') -> requireAuth()",
        '  async stageImport(ktk) {\n'
        '    requireRole("admin");',
        '  async stageImport(ktk) {\n'
        '    requireAuth();',
    ),
]

PERFIL_PATCHES = [
    (
        "caixaItems: adicionar Escritório (só importar, sem confirmar)",
        '  const caixaItems = [\n'
        '    { label: "Meu Turno",         sub: "Abrir, fechar e exportar turno", icon: "clock",          color: "#ede9fe", iconColor: "#5b21b6", page: "turno",         group: "Operações"  },\n'
        '    { label: "Clientes",          sub: "Fichas e histórico de compras",  icon: "users",          color: "#dbeafe", iconColor: "#2563eb", page: "clientes",      group: "Operações"  },\n'
        '  ];',
        '  const caixaItems = [\n'
        '    { label: "Meu Turno",         sub: "Abrir, fechar e exportar turno", icon: "clock",          color: "#ede9fe", iconColor: "#5b21b6", page: "turno",         group: "Operações"  },\n'
        '    { label: "Clientes",          sub: "Fichas e histórico de compras",  icon: "users",          color: "#dbeafe", iconColor: "#2563eb", page: "clientes",      group: "Operações"  },\n'
        '    { label: "Escritório",        sub: "Importar ficheiros de turno",    icon: "archive",        color: "#ede9fe", iconColor: "#5b21b6", page: "escritorio",    group: "Operações"  },\n'
        '  ];',
    ),
]

TURNO_PATCHES = [
    (
        "remover botão-atalho 'Abrir o Escritório' (admin-only, agora redundante)",
        '  // ── Importar — apenas admin, com atalho para o Escritório ──\n'
        '  if (user.role === "admin") {\n'
        '    html +=\n'
        '      \'<div style="margin-bottom:20px">\' +\n'
        '        \'<div style="font-size:11px;font-weight:700;color:#a1a1aa;text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">Importar ficheiros de turno</div>\' +\n'
        '        \'<button onclick="window._showSubpage(\\\'escritorio\\\')" style="width:100%;display:flex;align-items:center;justify-content:center;gap:10px;padding:14px;border:1.5px dashed #ddd6fe;border-radius:12px;background:#faf5ff;cursor:pointer;font-family:inherit">\' +\n'
        '          \'<i data-lucide="archive" style="width:18px;height:18px;color:#7c3aed"></i>\' +\n'
        '          \'<span style="font-size:13px;font-weight:600;color:#7c3aed">Abrir o Escritório</span>\' +\n'
        '        \'</button>\' +\n'
        '      \'</div>\';\n'
        '  }\n\n',
        '',
    ),
]

ESCRITORIO_PATCHES = [
    (
        "reescrever imports e loadEscritorio() com secção de import + gate de admin na revisão",
        'import { db } from "../db.js";\n'
        'import { refreshIcons } from "../utils.js";\n\n'
        'export async function loadEscritorio() {\n'
        '  var wrap = document.getElementById("escritorio-content");\n'
        '  if (!wrap) return;\n'
        '  wrap.innerHTML = "";\n\n'
        '  var all     = await db.getAll("ktkImports");\n'
        '  var pending = all.filter(function(p) { return p.status === "pending"; });\n\n'
        '  var summaryWrap = document.createElement("div");\n'
        '  summaryWrap.className = "esc-summary-wrap";\n'
        '  summaryWrap.innerHTML =\n'
        '    \'<div class="lic-limit-item">\' +\n'
        '    \'<div class="lic-limit-val">\' + pending.length + \'</div>\' +\n'
        '    \'<div class="lic-limit-label">Turno\' + (pending.length !== 1 ? "s" : "") + \' pendente\' + (pending.length !== 1 ? "s" : "") + \'</div>\' +\n'
        '    \'</div>\';\n'
        '  wrap.appendChild(summaryWrap);\n\n'
        '  var placeholder = document.createElement("div");\n'
        '  placeholder.className = "empty-state";\n'
        '  placeholder.innerHTML =\n'
        '    \'<div class="empty-state-title">Em construção</div>\';\n'
        '  wrap.appendChild(placeholder);\n\n'
        '  refreshIcons(wrap);\n'
        '}',
        'import { db } from "../db.js";\n'
        'import { fmt, fmtDate, el, refreshIcons } from "../utils.js";\n'
        'import { toast } from "../toast.js";\n'
        'import { openModal, closeModal } from "../modal.js";\n'
        'import { getUser } from "../auth.js";\n'
        'import { ktkService, sessionService, validateKtkHash } from "../services.js";\n\n'
        'export async function loadEscritorio() {\n'
        '  var wrap = document.getElementById("escritorio-content");\n'
        '  if (!wrap) return;\n'
        '  wrap.innerHTML = "";\n\n'
        '  var user = getUser();\n\n'
        '  var importSection = document.createElement("div");\n'
        '  importSection.className = "esc-import-section";\n'
        '  importSection.innerHTML =\n'
        '    \'<div class="planos-section-title">Importar ficheiro</div>\' +\n'
        '    \'<label class="esc-import-btn">\' +\n'
        '    \'<input type="file" accept=".ktk,application/json" style="display:none" onchange="window._handleKtkImport(this)"/>\' +\n'
        '    \'<i data-lucide="upload"></i> Importar turno (.ktk)\' +\n'
        '    \'</label>\';\n'
        '  wrap.appendChild(importSection);\n\n'
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
        '  }\n\n'
        '  refreshIcons(wrap);\n'
        '}',
    ),
]

CSS_PATCHES = [
    (
        "adicionar .esc-import-section / .esc-import-btn",
        '.esc-summary-wrap { margin-bottom: 16px; }',
        '.esc-summary-wrap { margin-bottom: 16px; }\n\n'
        '.esc-import-section { margin-bottom: 20px; }\n'
        '.esc-import-btn { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 14px; border: 1.5px dashed #ddd6fe; border-radius: 12px; background: #faf5ff; cursor: pointer; font-family: var(--font); font-size: 13px; font-weight: 600; color: #7c3aed; width: 100%; }\n'
        '.esc-import-btn i, .esc-import-btn svg { width: 18px; height: 18px; }',
    ),
]

print("Aplicando patches em services.js:")
apply_patches("~/kontaki/src/services.js", SERVICES_PATCHES)

print("Aplicando patches em perfil.js:")
apply_patches("~/kontaki/src/components/perfil.js", PERFIL_PATCHES)

print("Aplicando patches em turno.js:")
apply_patches("~/kontaki/src/components/turno.js", TURNO_PATCHES)

print("Aplicando patches em escritorio.js:")
apply_patches("~/kontaki/src/components/escritorio.js", ESCRITORIO_PATCHES)

print("Aplicando patches em components.css:")
apply_patches("~/kontaki/src/styles/components.css", CSS_PATCHES)

print("Feito. Falta: bumpar SW e testar o fluxo de import como caixa e como admin.")
