import pathlib

f = pathlib.Path.home() / "kontaki" / "src" / "components" / "perfil.js"
src = f.read_text(encoding="utf-8")

def replace_once(s, old, new, label):
    n = s.count(old)
    if n != 1:
        raise SystemExit(f"[ABORTADO] '{label}' encontrado {n}x (esperado 1x). Nada foi alterado.")
    return s.replace(old, new)

# 1) função de arquivar em vez de eliminar
old1 = '''window._clearResolvedIncidents = async function() {
  if (!confirm("Eliminar todos os incidentes resolvidos? O stock já foi corrigido, isto so limpa a lista.")) return;
  const all = await db.getAll("incidents");
  const resolved = all.filter(function(i){ return i.status==="resolved"; });
  for (var i=0;i<resolved.length;i++) await db.delete("incidents", resolved[i].id);
  toast(resolved.length + " incidente(s) removido(s).", "success");
  await loadIncidentes();
};'''

new1 = '''window._clearResolvedIncidents = async function() {
  if (!confirm("Arquivar todos os incidentes resolvidos? Saem desta lista mas continuam guardados em \\"Arquivados\\" para auditoria.")) return;
  const all = await db.getAll("incidents");
  const resolved = all.filter(function(i){ return i.status==="resolved" && !i.archived; });
  for (var i=0;i<resolved.length;i++) {
    await db.put("incidents", Object.assign({}, resolved[i], { archived:true, archivedAt:new Date().toISOString() }));
  }
  toast(resolved.length + " incidente(s) arquivado(s).", "success");
  await loadIncidentes();
};'''
src = replace_once(src, old1, new1, "arquivar em vez de eliminar")

# 2) filtro de estado ganha opção "Arquivados"; filtro por omissão ignora arquivados
old2 = '''var _incFilterType   = "all";
var _incFilterStatus = "open";'''
new2 = '''var _incFilterType   = "all";
var _incFilterStatus = "open";
var _incShowArchived = false;'''
src = replace_once(src, old2, new2, "estado _incShowArchived")

old3 = '''window._setIncFilter = function(kind, value) {
  if (kind === "type")   _incFilterType   = value;
  if (kind === "status") _incFilterStatus = value;
  loadIncidentes();
};'''
new3 = '''window._setIncFilter = function(kind, value) {
  if (kind === "type")   _incFilterType   = value;
  if (kind === "status") { _incFilterStatus = value; _incShowArchived = (value === "archived"); }
  loadIncidentes();
};'''
src = replace_once(src, old3, new3, "toggle _incShowArchived pelo filtro")

old4 = '''  const filtered = withType.filter(function(i){
    if (_incFilterType   !== "all" && i._type   !== _incFilterType)   return false;
    if (_incFilterStatus !== "all" && i.status  !== _incFilterStatus) return false;
    return true;
  });

  const resolvedCount = allList.filter(function(i){ return i.status==="resolved"; }).length;
  const openCount     = allList.filter(function(i){ return i.status==="open"; }).length;'''
new4 = '''  const filtered = withType.filter(function(i){
    if (_incFilterType !== "all" && i._type !== _incFilterType) return false;
    if (_incFilterStatus === "archived") return !!i.archived;
    if (!!i.archived) return false;
    if (_incFilterStatus !== "all" && i.status !== _incFilterStatus) return false;
    return true;
  });

  const resolvedCount  = allList.filter(function(i){ return i.status==="resolved" && !i.archived; }).length;
  const openCount      = allList.filter(function(i){ return i.status==="open"; }).length;
  const archivedCount  = allList.filter(function(i){ return !!i.archived; }).length;'''
src = replace_once(src, old4, new4, "cálculo de contagens incl. arquivados")

old5 = '''    segmentedControl("status", _incFilterStatus, [
      { value:"open",     label:"Abertos (" + openCount + ")" },
      { value:"resolved", label:"Resolvidos (" + resolvedCount + ")" },
      { value:"all",      label:"Todos" },
    ]) +'''
new5 = '''    segmentedControl("status", _incFilterStatus, [
      { value:"open",     label:"Abertos (" + openCount + ")" },
      { value:"resolved", label:"Resolvidos (" + resolvedCount + ")" },
      { value:"archived", label:"Arquivados (" + archivedCount + ")" },
      { value:"all",      label:"Todos" },
    ]) +'''
src = replace_once(src, old5, new5, "pill Arquivados no segmented control")

# 3) botão fica com estilo tonal, texto "Arquivar", e conta só resolvidos não arquivados
old6 = '''      clearBtn.style.cssText = "width:100%;padding:11px;background:#f4f4f5;color:#71717a;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:12px;display:flex;align-items:center;justify-content:center;gap:8px";'''
new6 = '''      clearBtn.style.cssText = "width:100%;padding:11px;background:var(--primary-light);color:var(--primary);border:none;border-radius:var(--radius-sm);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:12px;display:flex;align-items:center;justify-content:center;gap:8px";'''
src = replace_once(src, old6, new6, "estilo tonal do botão Arquivar")

old7 = '''    clearBtn.innerHTML = '<i data-lucide="trash-2" style="width:14px;height:14px"></i> Limpar ' + resolvedCount + ' incidente(s) resolvido(s)';'''
new7 = '''    clearBtn.innerHTML = '<i data-lucide="archive" style="width:14px;height:14px"></i> Arquivar ' + resolvedCount + ' incidente(s) resolvido(s)';'''
src = replace_once(src, old7, new7, "texto do botão Arquivar")

f.write_text(src, encoding="utf-8")
print("OK — perfil.js: incidentes resolvidos passam a ser arquivados (não eliminados), com filtro 'Arquivados' próprio.")
