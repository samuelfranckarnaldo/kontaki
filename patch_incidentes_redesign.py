import pathlib

f = pathlib.Path.home() / "kontaki" / "src" / "components" / "perfil.js"
src = f.read_text(encoding="utf-8")

def replace_once(s, old, new, label):
    n = s.count(old)
    if n != 1:
        raise SystemExit(f"[ABORTADO] '{label}' encontrado {n}x (esperado 1x). Nada foi alterado.")
    return s.replace(old, new)

# 1) botão do menu "Incidentes" recebe um id para poder ser alvo do badge
old1 = '''return '<button class="perfil-menu-item" onclick="window._perfilNav(\\'' + item.page + '\\')">' +'''
new1 = '''return '<button class="perfil-menu-item" id="' + (item.page==="incidentes"?"perfil-menu-incidentes":"") + '" onclick="window._perfilNav(\\'' + item.page + '\\')">' +'''
src = replace_once(src, old1, new1, "id no botão de menu")

# 2) chama updateIncidentesBadge() a seguir a renderMenu()
old2 = "renderMenu();"
new2 = "renderMenu();\n  updateIncidentesBadge();"
src = replace_once(src, old2, new2, "chamada updateIncidentesBadge após renderMenu")

# 3) insere a função updateIncidentesBadge antes de renderMenu
old3 = "function renderMenu() {"
new3 = '''async function updateIncidentesBadge() {
  try {
    var btn = document.getElementById("perfil-menu-incidentes");
    if (!btn) return;
    var incidents = await db.getAll("incidents");
    var openCount = incidents.filter(function(i){ return i.status==="open"; }).length;
    var iconWrap = btn.querySelector(".perfil-menu-icon");
    var iconEl   = btn.querySelector("i[data-lucide]");
    var existingBadge = btn.querySelector(".perfil-menu-badge");
    if (existingBadge) existingBadge.remove();
    if (openCount > 0) {
      if (iconWrap) iconWrap.style.background = "#fee2e2";
      if (iconEl) { iconEl.setAttribute("data-lucide","alert-octagon"); iconEl.style.color = "#dc2626"; }
      if (iconWrap) {
        iconWrap.style.position = "relative";
        var badge = document.createElement("span");
        badge.className = "perfil-menu-badge";
        badge.textContent = openCount > 9 ? "9+" : String(openCount);
        badge.style.cssText = "position:absolute;top:-4px;right:-4px;background:#dc2626;color:#fff;font-size:10px;font-weight:800;line-height:1;padding:2px 5px;border-radius:20px;min-width:16px;text-align:center;box-shadow:0 0 0 2px #fff";
        iconWrap.appendChild(badge);
      }
    } else {
      if (iconWrap) iconWrap.style.background = "#fef3c7";
      if (iconEl) { iconEl.setAttribute("data-lucide","alert-triangle"); iconEl.style.color = "#d97706"; }
    }
    refreshIcons(btn);
  } catch(e) { console.error("updateIncidentesBadge:", e); }
}

function renderMenu() {'''
src = replace_once(src, old3, new3, "definição updateIncidentesBadge")

# 4) redesign completo de loadIncidentes (filtros, tipos, turno responsável)
old4 = '''async function loadIncidentes() {
  const allList = (await db.getAll("incidents")).reverse();
  const resolvedCount = allList.filter(function(i){ return i.status==="resolved"; }).length;
  const list = allList;

  var clearBtn = document.getElementById("btn-clear-resolved-inc");
  if (!clearBtn) {
    var wrap = document.getElementById("subpage-incidentes");
    var header = wrap ? wrap.querySelector(".page-inner") : null;
    if (header) {
      clearBtn = document.createElement("button");
      clearBtn.id = "btn-clear-resolved-inc";
      clearBtn.style.cssText = "width:100%;padding:11px;background:#f4f4f5;color:#71717a;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:12px;display:flex;align-items:center;justify-content:center;gap:8px";
      clearBtn.onclick = window._clearResolvedIncidents;
      var listEl = document.getElementById("inc-list");
      if (listEl) header.insertBefore(clearBtn, listEl);
    }
  }
  if (clearBtn) {
    clearBtn.innerHTML = '<i data-lucide="trash-2" style="width:14px;height:14px"></i> Limpar ' + resolvedCount + ' incidente(s) resolvido(s)';
    clearBtn.style.display = resolvedCount > 0 ? "flex" : "none";
    refreshIcons(clearBtn);
  }

  el("inc-list").innerHTML = !list.length
    ? `<div class="empty-state"><div class="empty-state-title">Sem incidentes</div></div>`
    : list.map(i => `
        <div style="padding:14px;border:1px solid ${i.status === "resolved" ? "#e4e4e7" : "#fde68a"};
                    border-radius:12px;margin-bottom:10px;
                    background:${i.status === "resolved" ? "#fff" : "#fef3c7"}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
            <div>
              <div style="font-weight:700;font-size:14px;margin-bottom:4px">${i.productName}</div>
              <div style="font-size:12px;color:#71717a">
                Esperado: <strong>${i.expected||0}</strong> ·
                Encontrado: <strong>${i.found||0}</strong> ·
                Diferença: <strong style="color:${(i.diff||0) < 0 ? "#dc2626" : "#16a34a"}">${(i.diff||0) > 0 ? "+" : ""}${i.diff||0}</strong>
              </div>
            </div>
            ${i.status === "open" && getUser().role === "admin"
              ? `<button class="btn btn-success btn-sm" onclick="window._resolveInc(${i.id})">
                   <i data-lucide="check"></i> Resolver
                 </button>`
              : `<span style="font-size:12px;color:#16a34a;font-weight:600">✓ Resolvido</span>`}
          </div>
        </div>`).join("");
  refreshIcons(el("inc-list"));
}'''

new4 = '''function _fmtDateLocal(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  return d.toLocaleDateString("pt-PT") + " " + d.toLocaleTimeString("pt-PT", {hour:"2-digit",minute:"2-digit"});
}

var _incFilterType   = "all";
var _incFilterStatus = "open";

window._setIncFilter = function(kind, value) {
  if (kind === "type")   _incFilterType   = value;
  if (kind === "status") _incFilterStatus = value;
  loadIncidentes();
};

async function loadIncidentes() {
  const [allList, sessions, users] = await Promise.all([
    db.getAll("incidents"), db.getAll("sessions"), db.getAll("users")
  ]);
  allList.reverse();

  const sessionsById = {};
  sessions.forEach(function(s){ sessionsById[s.id] = s; });
  const usersById = {};
  users.forEach(function(u){ usersById[u.id] = u; });

  const withType = allList.map(function(i){ return Object.assign({}, i, { _type: i.type || "stock" }); });

  const filtered = withType.filter(function(i){
    if (_incFilterType   !== "all" && i._type   !== _incFilterType)   return false;
    if (_incFilterStatus !== "all" && i.status  !== _incFilterStatus) return false;
    return true;
  });

  const resolvedCount = allList.filter(function(i){ return i.status==="resolved"; }).length;
  const openCount     = allList.filter(function(i){ return i.status==="open"; }).length;

  function pillRow(kind, current, options) {
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
    ]);

  var filtersWrap = document.getElementById("inc-filters");
  if (!filtersWrap) {
    var wrap0 = document.getElementById("subpage-incidentes");
    var header0 = wrap0 ? wrap0.querySelector(".page-inner") : null;
    var listEl0 = document.getElementById("inc-list");
    if (header0 && listEl0) {
      filtersWrap = document.createElement("div");
      filtersWrap.id = "inc-filters";
      header0.insertBefore(filtersWrap, listEl0);
    }
  }
  if (filtersWrap) { filtersWrap.innerHTML = filtersHtml; refreshIcons(filtersWrap); }

  var clearBtn = document.getElementById("btn-clear-resolved-inc");
  if (!clearBtn) {
    var wrap = document.getElementById("subpage-incidentes");
    var header = wrap ? wrap.querySelector(".page-inner") : null;
    if (header) {
      clearBtn = document.createElement("button");
      clearBtn.id = "btn-clear-resolved-inc";
      clearBtn.style.cssText = "width:100%;padding:11px;background:#f4f4f5;color:#71717a;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:12px;display:flex;align-items:center;justify-content:center;gap:8px";
      clearBtn.onclick = window._clearResolvedIncidents;
      var listEl = document.getElementById("inc-list");
      if (listEl) header.insertBefore(clearBtn, listEl);
    }
  }
  if (clearBtn) {
    clearBtn.innerHTML = '<i data-lucide="trash-2" style="width:14px;height:14px"></i> Limpar ' + resolvedCount + ' incidente(s) resolvido(s)';
    clearBtn.style.display = resolvedCount > 0 ? "flex" : "none";
    refreshIcons(clearBtn);
  }

  function typeIcon(t)  { return t === "caixa" ? "wallet" : "package"; }
  function typeColor(t) { return t === "caixa" ? "#5b21b6" : "#d97706"; }
  function typeBg(t)    { return t === "caixa" ? "#ede9fe" : "#fef3c7"; }
  function typeLabel(t) { return t === "caixa" ? "Caixa" : "Stock"; }

  function turnoInfo(i) {
    var s    = i.sessionId != null ? sessionsById[i.sessionId] : null;
    var resp = i.responsibleSessionId != null ? sessionsById[i.responsibleSessionId] : null;
    if (resp) {
      return 'Detectado no turno de <strong>' + (s?s.userName:"?") + '</strong> — responsabilidade do turno anterior: <strong>' + resp.userName + '</strong> (fechou ' + _fmtDateLocal(resp.closedAt) + ')';
    }
    if (s) {
      return 'Turno: <strong>' + s.userName + '</strong> · ' + (s.status==="open" ? "em curso" : "fechado " + _fmtDateLocal(s.closedAt));
    }
    return 'Sem turno associado';
  }

  el("inc-list").innerHTML = !filtered.length
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
      }).join("");
  refreshIcons(el("inc-list"));
  updateIncidentesBadge();
}'''
src = replace_once(src, old4, new4, "redesign loadIncidentes")

# 5) substitui _resolveInc por fluxo com modal + nota obrigatória (só admin)
old5 = '''window._resolveInc = async (id) => {
  const i = await db.get("incidents", id);
  await db.put("incidents", { ...i, status: "resolved", resolvedAt: new Date().toISOString(), resolvedBy: getUser().id });
  if (i.productId != null) {
    const p = await db.get("products", i.productId);
    const novoStock = (i.countedStock != null) ? i.countedStock : i.found;
    if (p && novoStock != null) await db.put("products", { ...p, stock: novoStock, physicalStock: novoStock });
  }
  toast("Incidente resolvido.", "success");
  loadIncidentes();
};'''

new5 = '''window._openResolveModal = function(id) {
  if (!getUser() || getUser().role !== "admin") { toast("Só administradores podem resolver incidentes.", "error"); return; }
  openModal("Resolver Incidente",
    '<div style="font-size:13px;color:#71717a;margin-bottom:12px;line-height:1.5">Escreve uma justificação antes de marcar como resolvido — isto fica gravado na auditoria.</div>' +
    '<div class="field"><label>Justificação *</label>' +
    '<textarea id="resolve-note" rows="3" placeholder="Ex: confirmado com o funcionário, valor entregue ao caixa central." style="width:100%;padding:10px;border:1.5px solid #ddd6fe;border-radius:8px;font-family:inherit;font-size:13px;resize:vertical"></textarea>' +
    '</div>' +
    '<div class="form-actions" style="margin-top:14px">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
    '<button class="btn btn-success btn-full" onclick="window._confirmResolveInc(' + id + ')"><i data-lucide="check"></i> Confirmar resolução</button>' +
    '</div>');
  refreshIcons(el("modal-box"));
};

window._confirmResolveInc = async function(id) {
  var noteEl = document.getElementById("resolve-note");
  var note = noteEl ? noteEl.value.trim() : "";
  if (!note) { toast("Escreve uma justificação antes de resolver.", "error"); return; }
  if (!getUser() || getUser().role !== "admin") { toast("Só administradores podem resolver incidentes.", "error"); return; }

  const i = await db.get("incidents", id);
  await db.put("incidents", Object.assign({}, i, {
    status: "resolved", resolvedAt: new Date().toISOString(), resolvedBy: getUser().id, resolvedNote: note
  }));
  if (i.productId != null) {
    const p = await db.get("products", i.productId);
    const novoStock = (i.countedStock != null) ? i.countedStock : i.found;
    if (p && novoStock != null) await db.put("products", Object.assign({}, p, { stock: novoStock, physicalStock: novoStock }));
  }
  closeModal();
  toast("Incidente resolvido.", "success");
  loadIncidentes();
};'''
src = replace_once(src, old5, new5, "fluxo _openResolveModal/_confirmResolveInc")

f.write_text(src, encoding="utf-8")
print("OK — perfil.js: página Incidentes redesenhada (filtros, tipos, turno responsável, badge, nota obrigatória).")
