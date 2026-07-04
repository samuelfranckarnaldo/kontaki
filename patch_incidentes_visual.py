import pathlib

f = pathlib.Path.home() / "kontaki" / "src" / "components" / "perfil.js"
src = f.read_text(encoding="utf-8")

def replace_once(s, old, new, label):
    n = s.count(old)
    if n != 1:
        raise SystemExit(f"[ABORTADO] '{label}' encontrado {n}x (esperado 1x). Nada foi alterado.")
    return s.replace(old, new)

# 1) pillRow: dois estilos diferentes — segmented control (status) vs chips discretos (tipo)
old1 = '''  function pillRow(kind, current, options) {
    return '<div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">' +
      options.map(function(o){
        var active = current === o.value;
        return '<button onclick="window._setIncFilter(\\'' + kind + '\\',\\'' + o.value + '\\')" style="padding:7px 14px;border-radius:20px;border:1.5px solid ' + (active?"#5b21b6":"#e4e4e7") + ';background:' + (active?"#5b21b6":"#fff") + ';color:' + (active?"#fff":"#71717a") + ';font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">' + o.label + '</button>';
      }).join("") +
      '</div>';
  }

  var filtersHtml =
    pillRow("status", _incFilterStatus, [
      { value:"open",     label:"Abertos (" + openCount + ")" },
      { value:"resolved", label:"Resolvidos (" + resolvedCount + ")" },
      { value:"all",      label:"Todos" },
    ]) +
    pillRow("type", _incFilterType, [
      { value:"all",   label:"Todos os tipos" },
      { value:"stock", label:"Stock" },
      { value:"caixa", label:"Caixa" },
    ]);'''

new1 = '''  function segmentedControl(kind, current, options) {
    return '<div style="display:flex;background:var(--primary-light);border-radius:var(--radius-xl);padding:3px;margin-bottom:10px;gap:2px">' +
      options.map(function(o){
        var active = current === o.value;
        return '<button onclick="window._setIncFilter(\\'' + kind + '\\',\\'' + o.value + '\\')" style="flex:1;padding:8px 10px;border-radius:calc(var(--radius-xl) - 3px);border:none;background:' + (active?"#fff":"transparent") + ';color:' + (active?"var(--primary)":"var(--text3)") + ';font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:' + (active?"var(--shadow-sm)":"none") + ';transition:all .15s ease">' + o.label + '</button>';
      }).join("") +
      '</div>';
  }

  function chipRow(kind, current, options) {
    return '<div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">' +
      options.map(function(o){
        var active = current === o.value;
        return '<button onclick="window._setIncFilter(\\'' + kind + '\\',\\'' + o.value + '\\')" style="padding:6px 12px;border-radius:var(--radius-sm);border:1px solid ' + (active?"var(--primary)":"#e4e4e7") + ';background:' + (active?"var(--primary-light)":"#fff") + ';color:' + (active?"var(--primary)":"var(--text3)") + ';font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit">' + o.label + '</button>';
      }).join("") +
      '</div>';
  }

  var filtersHtml =
    segmentedControl("status", _incFilterStatus, [
      { value:"open",     label:"Abertos (" + openCount + ")" },
      { value:"resolved", label:"Resolvidos (" + resolvedCount + ")" },
      { value:"all",      label:"Todos" },
    ]) +
    chipRow("type", _incFilterType, [
      { value:"all",   label:"Todos os tipos" },
      { value:"stock", label:"Stock" },
      { value:"caixa", label:"Caixa" },
    ]);'''
src = replace_once(src, old1, new1, "filtros: segmented control + chips")

# 2) cartão do incidente redesenhado (barra lateral, tipografia, botão tonal, grelha de números)
old2 = '''  el("inc-list").innerHTML = !filtered.length
    ? '<div class="empty-state"><div class="empty-state-title">Sem incidentes' + ((_incFilterStatus!=="all"||_incFilterType!=="all") ? " com este filtro" : "") + '</div></div>'
    : filtered.map(function(i) {
        var isOpen        = i.status === "open";
        var canResolve     = isOpen && getUser().role === "admin";
        var resolverName   = (i.resolvedBy != null && usersById[i.resolvedBy]) ? usersById[i.resolvedBy].name : null;
        return '<div style="padding:14px;border:1.5px solid ' + (isOpen ? "#fca5a5" : "#e4e4e7") + ';border-radius:12px;margin-bottom:10px;background:' + (isOpen ? "#fef2f2" : "#fff") + '">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px">' +
            '<div style="display:flex;align-items:flex-start;gap:10px">' +
              '<div style="width:34px;height:34px;border-radius:9px;background:' + typeBg(i._type) + ';display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
                '<i data-lucide="' + typeIcon(i._type) + '" style="width:16px;height:16px;color:' + typeColor(i._type) + '"></i>' +
              '</div>' +
              '<div>' +
                '<div style="font-weight:700;font-size:14px;margin-bottom:2px">' + i.productName + '</div>' +
                '<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;background:' + typeBg(i._type) + ';color:' + typeColor(i._type) + '">' + typeLabel(i._type) + '</span>' +
              '</div>' +
            '</div>' +
            (canResolve
              ? '<button class="btn btn-success btn-sm" onclick="window._openResolveModal(' + i.id + ')"><i data-lucide="check"></i> Resolver</button>'
              : (isOpen
                  ? '<span style="font-size:11px;color:#dc2626;font-weight:700;background:#fee2e2;padding:3px 9px;border-radius:20px">Pendente</span>'
                  : '<span style="font-size:11px;color:#16a34a;font-weight:700;background:#dcfce7;padding:3px 9px;border-radius:20px">✓ Resolvido</span>')) +
          '</div>' +
          '<div style="font-size:12px;color:#71717a;margin-bottom:6px">' +
            'Esperado: <strong>' + (i.expected||0) + '</strong> · ' +
            'Encontrado: <strong>' + (i.found||0) + '</strong> · ' +
            'Diferença: <strong style="color:' + ((i.diff||0) < 0 ? "#dc2626" : "#16a34a") + '">' + ((i.diff||0) > 0 ? "+" : "") + (i.diff||0) + '</strong>' +
          '</div>' +
          '<div style="font-size:11px;color:#a1a1aa;margin-bottom:2px">' + turnoInfo(i) + '</div>' +
          '<div style="font-size:11px;color:#a1a1aa">' + _fmtDateLocal(i.createdAt) + (i.note ? " · " + i.note : "") + '</div>' +
          (!isOpen && i.resolvedNote
            ? '<div style="margin-top:8px;padding:8px 10px;background:#f4f4f5;border-radius:8px;font-size:12px;color:#3f3f46"><strong>' + (resolverName||"Admin") + ':</strong> ' + i.resolvedNote + '</div>'
            : '') +
        '</div>';
      }).join("");'''

new2 = '''  el("inc-list").innerHTML = !filtered.length
    ? '<div class="empty-state"><div class="empty-state-title">Sem incidentes' + ((_incFilterStatus!=="all"||_incFilterType!=="all") ? " com este filtro" : "") + '</div></div>'
    : filtered.map(function(i) {
        var isOpen        = i.status === "open";
        var canResolve     = isOpen && getUser().role === "admin";
        var resolverName   = (i.resolvedBy != null && usersById[i.resolvedBy]) ? usersById[i.resolvedBy].name : null;
        var diffColor      = (i.diff||0) < 0 ? "var(--danger)" : "var(--success)";
        var accentColor    = isOpen ? "var(--danger)" : "#d4d4d8";

        return '<div style="display:flex;background:#fff;border-radius:var(--radius-lg);margin-bottom:10px;box-shadow:var(--shadow-sm);overflow:hidden">' +
          '<div style="width:4px;flex-shrink:0;background:' + accentColor + '"></div>' +
          '<div style="flex:1;padding:14px 16px;min-width:0">' +

            '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px">' +
              '<div style="display:flex;align-items:center;gap:9px;min-width:0">' +
                '<div style="width:30px;height:30px;border-radius:50%;background:' + typeBg(i._type) + ';display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
                  '<i data-lucide="' + typeIcon(i._type) + '" style="width:14px;height:14px;color:' + typeColor(i._type) + '"></i>' +
                '</div>' +
                '<div style="min-width:0">' +
                  '<div style="font-size:9.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:' + typeColor(i._type) + '">' + typeLabel(i._type) + '</div>' +
                  '<div style="font-weight:700;font-size:14px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + i.productName + '</div>' +
                '</div>' +
              '</div>' +
              (canResolve
                ? '<button onclick="window._openResolveModal(' + i.id + ')" style="flex-shrink:0;display:flex;align-items:center;gap:5px;padding:7px 12px;border-radius:var(--radius-sm);border:1px solid var(--success);background:var(--success-light);color:var(--success);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">' +
                    '<i data-lucide="check-circle" style="width:13px;height:13px"></i>Resolver</button>'
                : (isOpen
                    ? '<span style="flex-shrink:0;font-size:10.5px;color:var(--danger);font-weight:700;background:var(--danger-light);padding:4px 10px;border-radius:var(--radius-sm)">Pendente</span>'
                    : '<span style="flex-shrink:0;display:flex;align-items:center;gap:4px;font-size:10.5px;color:var(--success);font-weight:700"><i data-lucide="check" style="width:12px;height:12px"></i>Resolvido</span>')) +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;background:#fafafa;border-radius:var(--radius-sm);padding:10px 4px;margin-bottom:10px">' +
              '<div style="text-align:center"><div style="font-size:9.5px;color:var(--text4);text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px">Esperado</div><div style="font-size:13px;font-weight:700;color:var(--text2)">' + (i.expected||0) + '</div></div>' +
              '<div style="text-align:center;border-left:1px solid #ececee;border-right:1px solid #ececee"><div style="font-size:9.5px;color:var(--text4);text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px">Encontrado</div><div style="font-size:13px;font-weight:700;color:var(--text2)">' + (i.found||0) + '</div></div>' +
              '<div style="text-align:center"><div style="font-size:9.5px;color:var(--text4);text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px">Diferença</div><div style="font-size:13px;font-weight:800;color:' + diffColor + '">' + ((i.diff||0) > 0 ? "+" : "") + (i.diff||0) + '</div></div>' +
            '</div>' +

            '<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:3px">' +
              '<i data-lucide="user" style="width:12px;height:12px;color:var(--text4);flex-shrink:0;margin-top:1px"></i>' +
              '<span style="font-size:11.5px;color:var(--text3);line-height:1.4">' + turnoInfo(i) + '</span>' +
            '</div>' +
            '<div style="display:flex;align-items:flex-start;gap:6px">' +
              '<i data-lucide="clock" style="width:12px;height:12px;color:var(--text4);flex-shrink:0;margin-top:1px"></i>' +
              '<span style="font-size:11.5px;color:var(--text3);line-height:1.4">' + _fmtDateLocal(i.createdAt) + (i.note ? " · " + i.note : "") + '</span>' +
            '</div>' +

            (!isOpen && i.resolvedNote
              ? '<div style="margin-top:10px;padding:9px 11px;background:var(--success-light);border-radius:var(--radius-sm);font-size:12px;color:var(--text2);line-height:1.4"><strong style="color:var(--success)">' + (resolverName||"Admin") + ':</strong> ' + i.resolvedNote + '</div>'
              : '') +
          '</div>' +
        '</div>';
      }).join("");'''
src = replace_once(src, old2, new2, "cartão de incidente redesenhado")

f.write_text(src, encoding="utf-8")
print("OK — perfil.js: filtros em segmented control + chips, botão Resolver tonal, cartão redesenhado com tokens do design system.")
