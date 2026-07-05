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


ESCRITORIO_PATCHES = [
    (
        "destacar linha quando o valor 'Vendeu' é alterado",
        'window._recalcEsperado = function(input) {\n'
        '  var row = input.closest(".esc-review-row");\n'
        '  var received = Number(row.getAttribute("data-received"));\n'
        '  var sold = Number(input.value || 0);\n'
        '  row.querySelector(".esc-review-expected").textContent = received - sold;\n'
        '};',
        'window._recalcEsperado = function(input) {\n'
        '  var row = input.closest(".esc-review-row");\n'
        '  var received = Number(row.getAttribute("data-received"));\n'
        '  var sold = Number(input.value || 0);\n'
        '  row.querySelector(".esc-review-expected").textContent = received - sold;\n'
        '  row.classList.toggle("esc-review-row--edited", String(sold) !== input.defaultValue);\n'
        '};',
    ),
]

CSS_PATCHES = [
    (
        "adicionar estilo de linha editada",
        '.esc-review-expected { font-size: 13px; font-weight: 700; text-align: right; color: var(--primary); }',
        '.esc-review-expected { font-size: 13px; font-weight: 700; text-align: right; color: var(--primary); }\n'
        '.esc-review-row--edited { background: var(--primary-light); box-shadow: inset 3px 0 0 var(--primary); }',
    ),
]

print("Aplicando patches em escritorio.js:")
apply_patches("~/kontaki/src/components/escritorio.js", ESCRITORIO_PATCHES)

print("Aplicando patches em components.css:")
apply_patches("~/kontaki/src/styles/components.css", CSS_PATCHES)

print("Feito.")
