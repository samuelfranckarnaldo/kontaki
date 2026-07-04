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


# ── perfil.js ────────────────────────────────────────────────────────────
JS_PATCHES = [
    (
        "initPerfil: remover chamada a renderVersionFooter",
        '  renderMenu();\n'
        '  setupSubpageButtons();\n'
        '  renderPwaButton();\n'
        '  renderVersionFooter();\n'
        '}',
        '  renderMenu();\n'
        '  setupSubpageButtons();\n'
        '  renderPwaButton();\n'
        '}',
    ),
    (
        "remover função renderVersionFooter inteira",
        'function renderVersionFooter() {\n'
        '  var existing = document.getElementById("perfil-version-footer");\n'
        '  if (existing) existing.remove();\n'
        '  var pg = el("pg-perfil");\n'
        '  if (!pg) return;\n'
        '  var div = document.createElement("div");\n'
        '  div.id = "perfil-version-footer";\n'
        '  div.style.cssText = "padding:16px;text-align:center;border-top:1px solid #f4f4f5;margin-top:8px";\n'
        '  div.innerHTML =\n'
        '    \'<div style="font-size:12px;color:#a1a1aa;line-height:1.8">\' +\n'
        '    \'Kontaki v1.0.0-beta<br/>\' +\n'
        '    \'Introxeer Technology · Angola<br/>\' +\n'
        '    \'<button onclick="window._showTermos()" style="background:none;border:none;color:#5b21b6;\' +\n'
        '    \'font-size:11px;cursor:pointer;font-family:inherit;text-decoration:underline">Termos</button>\' +\n'
        '    \' · \' +\n'
        '    \'<button onclick="window._showPrivacidade()" style="background:none;border:none;color:#5b21b6;\' +\n'
        '    \'font-size:11px;cursor:pointer;font-family:inherit;text-decoration:underline">Privacidade</button>\' +\n'
        '    \'</div>\';\n'
        '  pg.appendChild(div);\n'
        '}\n',
        '',
    ),
    (
        "commonItems: adicionar 'Sobre' antes de Terminar Sessão",
        '  const commonItems = [\n'
        '    { label: "Alterar PIN",       sub: "Mudar PIN de acesso",            icon: "lock",           color: "#f4f4f5", iconColor: "#5b21b6", page: "senha",         group: "Sistema"    },\n'
        '    { label: "Assinatura",        sub: "Licença e plano activo",         icon: "award",          color: "#ede9fe", iconColor: "#5b21b6", page: "assinatura",    group: "Sistema"    },\n'
        '    { label: "Contactos",         sub: "Suporte Introxeer Technology",   icon: "headphones",     color: "#dbeafe", iconColor: "#2563eb", page: "contactos",     group: "Sistema"    },\n'
        '    { label: "Terminar Sessão",   sub: "",                               icon: "log-out",        color: "#fee2e2", iconColor: "#dc2626", page: "logout",        group: null         },\n'
        '  ];',
        '  const commonItems = [\n'
        '    { label: "Alterar PIN",       sub: "Mudar PIN de acesso",            icon: "lock",           color: "#f4f4f5", iconColor: "#5b21b6", page: "senha",         group: "Sistema"    },\n'
        '    { label: "Assinatura",        sub: "Licença e plano activo",         icon: "award",          color: "#ede9fe", iconColor: "#5b21b6", page: "assinatura",    group: "Sistema"    },\n'
        '    { label: "Contactos",         sub: "Suporte Introxeer Technology",   icon: "headphones",     color: "#dbeafe", iconColor: "#2563eb", page: "contactos",     group: "Sistema"    },\n'
        '    { label: "Sobre",             sub: "Termos, ajuda e versão",         icon: "info",           color: "#f4f4f5", iconColor: "#71717a", page: "sobre",         group: "Sistema"    },\n'
        '    { label: "Terminar Sessão",   sub: "",                               icon: "log-out",        color: "#fee2e2", iconColor: "#dc2626", page: "logout",        group: null         },\n'
        '  ];',
    ),
    (
        "setupSubpageButtons: adicionar 'sobre' à lista de back-buttons",
        '  ["stock","incidentes","equipa","loja","senha","dashboard","clientes",\n'
        '   "despesas","contabilidade","assinatura","contactos","configuracoes",\n'
        '   "seguranca","turno","fornecedores"].forEach(function(name) {',
        '  ["stock","incidentes","equipa","loja","senha","dashboard","clientes",\n'
        '   "despesas","contabilidade","assinatura","contactos","configuracoes",\n'
        '   "seguranca","turno","fornecedores","sobre"].forEach(function(name) {',
    ),
    (
        "showSubpage: adicionar 'sobre' à lista de subpages",
        'const subpages = ["stock","incidentes","equipa","loja","senha","dashboard","fornecedores","turno","seguranca","configuracoes","contabilidade","clientes","despesas","assinatura","contactos","escritorio"];',
        'const subpages = ["stock","incidentes","equipa","loja","senha","dashboard","fornecedores","turno","seguranca","configuracoes","contabilidade","clientes","despesas","assinatura","contactos","escritorio","sobre"];',
    ),
    (
        "_perfilNav: rotear page 'sobre' para loadSobre()",
        '  if (page === "senha")        loadSenhaPage();\n'
        '};',
        '  if (page === "senha")        loadSenhaPage();\n'
        '  if (page === "sobre")        loadSobre();\n'
        '};',
    ),
    (
        "adicionar loadSobre() e handlers de Sobre antes de loadSenhaPage",
        'function loadSenhaPage() {',
        'function loadSobre() {\n'
        '  var wrap = document.getElementById("sobre-content");\n'
        '  if (!wrap) return;\n'
        '  wrap.innerHTML = "";\n\n'
        '  var items = [\n'
        '    { label: "Termos do Consumidor",          icon: "file-text",    action: "window._showTermos()" },\n'
        '    { label: "Política de Privacidade",       icon: "shield-check", action: "window._showPrivacidade()" },\n'
        '    { label: "Política de Uso Aceitável",     icon: "file-text",    action: "window._showPlaceholderDoc(\'Política de Uso Aceitável\')" },\n'
        '    { label: "Licença de Utilização (EULA)",  icon: "award",        action: "window._showLicencaEula()" },\n'
        '    { label: "Ajuda",                         icon: "help-circle",  action: "window._showAjudaFAQ()" },\n'
        '    { label: "Documentação",                  icon: "book-open",    action: "window._showPlaceholderDoc(\'Documentação\')" },\n'
        '  ];\n\n'
        '  var list = document.createElement("div");\n'
        '  list.className = "perfil-group";\n'
        '  items.forEach(function(item) {\n'
        '    var btn = document.createElement("button");\n'
        '    btn.className = "perfil-menu-item";\n'
        '    btn.setAttribute("onclick", item.action);\n'
        '    btn.innerHTML =\n'
        '      \'<div class="perfil-menu-item-left">\' +\n'
        '      \'<div class="perfil-menu-icon" style="background:#f4f4f5">\' +\n'
        '      \'<i data-lucide="\' + item.icon + \'" style="color:#71717a"></i>\' +\n'
        '      \'</div><div>\' +\n'
        '      \'<div style="font-size:15px;font-weight:600">\' + item.label + \'</div>\' +\n'
        '      \'</div></div>\' +\n'
        '      \'<span class="perfil-menu-chevron">›</span>\';\n'
        '    list.appendChild(btn);\n'
        '  });\n'
        '  wrap.appendChild(list);\n\n'
        '  var footer = document.createElement("div");\n'
        '  footer.className = "sobre-footer";\n'
        '  footer.innerHTML = "Kontaki v1.0.0-beta<br/>Introxeer Technology · Angola";\n'
        '  wrap.appendChild(footer);\n\n'
        '  refreshIcons(wrap);\n'
        '}\n\n'
        'window._showPlaceholderDoc = function(title) {\n'
        '  openModal(title,\n'
        '    \'<div style="font-size:13px;color:var(--text3);line-height:1.6;margin-bottom:16px">\' +\n'
        '    \'Este documento está em preparação. Contacta a Introxeer Technology para mais informações.\' +\n'
        '    \'</div>\' +\n'
        '    \'<a href="https://wa.me/244900000000" target="_blank" class="btn btn-primary btn-full" style="text-decoration:none;display:flex;align-items:center;justify-content:center;gap:8px">\' +\n'
        '    \'<i data-lucide="message-circle"></i> Falar via WhatsApp</a>\' +\n'
        '    \'<button class="btn btn-ghost btn-full" style="margin-top:8px" onclick="window._closeModal()">Fechar</button>\');\n'
        '  refreshIcons(el("modal-box"));\n'
        '};\n\n'
        'window._showAjudaFAQ = function() {\n'
        '  var faqs = [\n'
        '    ["Como funciona o Kontaki sem internet?", "O Kontaki funciona totalmente offline. Todos os dados ficam guardados no teu dispositivo, e a sincronização entre Escritório e Caixa é feita por ficheiro, sem depender de ligação permanente à internet."],\n'
        '    ["Esqueci o meu PIN, o que faço?", "Pede a um administrador da tua loja para repor o teu PIN em Equipa. Se és o único administrador, contacta o suporte da Introxeer."],\n'
        '    ["Como faço backup dos meus dados?", "Vai a Configurações → Backup para exportar uma cópia dos teus dados. Recomendamos fazer isto regularmente."],\n'
        '    ["O que acontece se a avaliação expirar?", "Após o período de avaliação, algumas funcionalidades ficam bloqueadas até activares um plano em Assinatura."],\n'
        '    ["Posso usar o Kontaki em mais de um dispositivo?", "Depende do teu plano. O número de dispositivos permitido está indicado em Assinatura."],\n'
        '    ["Como contacto o suporte?", "Vai a Contactos, no menu do Perfil, para falar com a Introxeer Technology via WhatsApp."]\n'
        '  ];\n'
        '  var body = faqs.map(function(f) {\n'
        '    return \'<div style="margin-bottom:14px">\' +\n'
        '      \'<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px">\' + f[0] + \'</div>\' +\n'
        '      \'<div style="font-size:12px;color:var(--text3);line-height:1.5">\' + f[1] + \'</div>\' +\n'
        '      \'</div>\';\n'
        '  }).join("");\n'
        '  openModal("Ajuda", body + \'<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Fechar</button>\');\n'
        '  refreshIcons(el("modal-box"));\n'
        '};\n\n'
        'window._showLicencaEula = function() {\n'
        '  var text =\n'
        '    \'<div style="font-size:12px;color:var(--text3);line-height:1.6;max-height:50vh;overflow-y:auto;padding-right:4px">\' +\n'
        '    \'<p><strong>1. Objecto.</strong> Este Acordo de Licença de Utilizador Final ("EULA") rege o uso do software Kontaki, propriedade da Introxeer Technology.</p>\' +\n'
        '    \'<p><strong>2. Concessão de Licença.</strong> A Introxeer Technology concede ao utilizador uma licença não exclusiva, intransmissível e limitada para usar o Kontaki de acordo com o plano de assinatura activo, indicado na secção Assinatura.</p>\' +\n'
        '    \'<p><strong>3. Restrições.</strong> É proibido copiar, modificar, descompilar ou redistribuir o software sem autorização escrita da Introxeer Technology.</p>\' +\n'
        '    \'<p><strong>4. Dados.</strong> Os dados inseridos no Kontaki (vendas, stock, clientes) pertencem ao utilizador. O armazenamento é local e offline, salvo quando o utilizador optar por sincronização ou backup manual.</p>\' +\n'
        '    \'<p><strong>5. Limitação de Responsabilidade.</strong> O software é fornecido "tal como está". A Introxeer Technology não garante disponibilidade ininterrupta nem se responsabiliza por perdas decorrentes de uso indevido ou falhas do dispositivo do utilizador.</p>\' +\n'
        '    \'<p><strong>6. Vigência.</strong> Esta licença vigora enquanto a assinatura estiver activa. O não pagamento pode resultar em suspensão de funcionalidades, conforme descrito na secção Assinatura.</p>\' +\n'
        '    \'<p><strong>7. Lei Aplicável.</strong> Este EULA rege-se pelas leis da República de Angola.</p>\' +\n'
        '    \'</div>\';\n'
        '  openModal("Licença de Utilização", text + \'<button class="btn btn-ghost btn-full" style="margin-top:14px" onclick="window._closeModal()">Fechar</button>\');\n'
        '};\n\n'
        'function loadSenhaPage() {',
    ),
]

# ── components.css ───────────────────────────────────────────────────────
CSS_PATCHES = [
    (
        "adicionar .sobre-footer",
        '/* ── LOJA SUBPAGE ───────────────────────────────────────────────────────────── */',
        '.sobre-footer { text-align: center; padding: 20px 16px; font-size: 12px; color: var(--text4); line-height: 1.8; }\n\n'
        '/* ── LOJA SUBPAGE ───────────────────────────────────────────────────────────── */',
    ),
]

# ── index.html ───────────────────────────────────────────────────────────
HTML_PATCHES = [
    (
        "adicionar container subpage-sobre",
        '      <div id="subpage-contactos" style="display:none">\n'
        '        <div class="page-inner">\n'
        '          <button class="btn btn-ghost btn-sm" id="btn-back-contactos">← Voltar</button>\n'
        '          <div style="font-size:17px;font-weight:700;margin:8px 0 14px">Contactos</div>\n'
        '          <div id="contactos-content"></div>\n'
        '        </div>\n'
        '      </div>',
        '      <div id="subpage-contactos" style="display:none">\n'
        '        <div class="page-inner">\n'
        '          <button class="btn btn-ghost btn-sm" id="btn-back-contactos">← Voltar</button>\n'
        '          <div style="font-size:17px;font-weight:700;margin:8px 0 14px">Contactos</div>\n'
        '          <div id="contactos-content"></div>\n'
        '        </div>\n'
        '      </div>\n\n'
        '      <div id="subpage-sobre" style="display:none">\n'
        '        <div class="page-inner">\n'
        '          <button class="btn btn-ghost btn-sm" id="btn-back-sobre">← Voltar</button>\n'
        '          <div style="font-size:17px;font-weight:700;margin:8px 0 14px">Sobre</div>\n'
        '          <div id="sobre-content"></div>\n'
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

print("Feito. Lembra de bumpar a versão do Service Worker (sw.js) antes de testar.")
