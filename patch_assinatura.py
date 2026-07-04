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
            if content.count(new) > 0:
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


# ── perfil.js ────────────────────────────────────────────────────────────
JS_PATCHES = [
    (
        "hero: remover versão, mostrar preço do plano",
        '''    '<div class="lic-hero-sub">Introxeer · Kontaki v1.0.0</div>' +''',
        '''    '<div class="lic-hero-price">' + plan.price.toLocaleString() + ' Kz<span>/mês</span></div>' +''',
    ),
    (
        "hero: badge com variante de cor por estado",
        '''    '<div class="lic-hero-badge">' +''',
        '''    '<div class="lic-hero-badge lic-hero-badge--' + (isExpired?"expired":isTrial?"trial":"active") + '">' +''',
    ),
    (
        "planos: título dedicado em vez de desp-section-label",
        '  plansLabel.className = "desp-section-label";',
        '  plansLabel.className = "planos-section-title";',
    ),
    (
        "planos: remover margin-top inline",
        '  plansLabel.style.marginTop = "8px";\n',
        '',
    ),
    (
        "activate-card: remover style inline, usar classe",
        '''    '<div class="field" style="margin-bottom:12px">' +''',
        '''    '<div class="field lic-activate-field">' +''',
    ),
    (
        "activate-card: ligar máscara de formatação ao input",
        '  // ── Lista de planos ──',
        '  var codeInputEl = document.getElementById("activation-code");\n'
        '  if (codeInputEl) codeInputEl.oninput = formatLicenseCodeInput;\n\n'
        '  // ── Lista de planos ──',
    ),
    (
        "adicionar função formatLicenseCodeInput",
        'function licRow(label, value, color) {',
        'function formatLicenseCodeInput() {\n'
        '  var raw = this.value.toUpperCase().replace(/[^A-Z0-9]/g, "");\n'
        '  var groups = [4, 4, 4, 8];\n'
        '  var out = "";\n'
        '  var pos = 0;\n'
        '  for (var g = 0; g < groups.length; g++) {\n'
        '    if (pos >= raw.length) break;\n'
        '    if (out) out += "-";\n'
        '    out += raw.slice(pos, pos + groups[g]);\n'
        '    pos += groups[g];\n'
        '  }\n'
        '  this.value = out;\n'
        '}\n\n'
        'function licRow(label, value, color) {',
    ),
]

# ── components.css ───────────────────────────────────────────────────────
CSS_PATCHES = [
    (
        "lic-hero: card neutro em vez de bloco roxo colado ao header",
        '.lic-hero { background: linear-gradient(135deg,#4c1d95,#6d28d9); border-radius: var(--radius-xl); padding: 24px 20px; color: #fff; text-align: center; margin-bottom: 20px; }\n'
        '.lic-hero-icon { width: 56px; height: 56px; background: rgba(255,255,255,.15); border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 auto 14px; }\n'
        '.lic-hero-icon i, .lic-hero-icon svg { width: 28px; height: 28px; color: #fff; }\n'
        '.lic-hero-plan { font-size: 22px; font-weight: 800; letter-spacing: -.3px; }\n'
        '.lic-hero-sub { font-size: 13px; color: #c4b5fd; margin-top: 4px; }\n'
        '.lic-hero-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,.15); border-radius: 20px; padding: 6px 12px; font-size: 12px; font-weight: 700; margin-top: 12px; }',
        '.lic-hero { background: var(--bg2); border: 1px solid var(--border2); border-radius: var(--radius-xl); padding: 24px 20px; text-align: center; margin-bottom: 20px; }\n'
        '.lic-hero-icon { width: 56px; height: 56px; background: var(--primary-light); border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 auto 14px; }\n'
        '.lic-hero-icon i, .lic-hero-icon svg { width: 28px; height: 28px; color: var(--primary); }\n'
        '.lic-hero-plan { font-size: 22px; font-weight: 800; letter-spacing: -.3px; color: var(--text); }\n'
        '.lic-hero-price { font-size: 14px; font-weight: 700; color: var(--text3); margin-top: 4px; }\n'
        '.lic-hero-price span { font-size: 11px; font-weight: 500; color: var(--text4); }\n'
        '.lic-hero-badge { display: inline-flex; align-items: center; gap: 6px; border-radius: 20px; padding: 6px 12px; font-size: 12px; font-weight: 700; margin-top: 12px; }\n'
        '.lic-hero-badge--active { background: var(--success-light); color: var(--success); }\n'
        '.lic-hero-badge--trial { background: var(--warning-light); color: var(--warning); }\n'
        '.lic-hero-badge--expired { background: #fee2e2; color: var(--danger); }',
    ),
    (
        "adicionar .lic-activate-field",
        '.lic-code-input { width: 100%; padding: 14px;',
        '.lic-activate-field { margin-bottom: 12px; }\n'
        '.lic-code-input { width: 100%; padding: 14px;',
    ),
    (
        "adicionar .planos-section-title com mais peso visual",
        '/* ── Planos ──────────────────────────────────────────────────────────────────── */',
        '.planos-section-title { font-size: 15px; font-weight: 800; color: var(--text); margin: 20px 0 12px; }\n\n'
        '/* ── Planos ──────────────────────────────────────────────────────────────────── */',
    ),
]

print("Aplicando patches em perfil.js:")
apply_patches("~/kontaki/src/components/perfil.js", JS_PATCHES)

print("Aplicando patches em components.css:")
apply_patches("~/kontaki/src/styles/components.css", CSS_PATCHES)

print("Feito. Lembra de bumpar a versão do Service Worker (sw.js) antes de testar.")
