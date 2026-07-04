import pathlib

f = pathlib.Path.home() / "kontaki" / "src" / "components" / "perfil.js"
src = f.read_text(encoding="utf-8")

old = '''window._resolveInc = async (id) => {
  const i = await db.get("incidents", id);
  await db.put("incidents", { ...i, status: "resolved", resolvedAt: new Date().toISOString(), resolvedBy: getUser().id });
  const p = await db.get("products", i.productId);
  if (p) await db.put("products", { ...p, stock: i.countedStock, physicalStock: i.countedStock });
  toast("Incidente resolvido.", "success");
  loadIncidentes();
};'''

new = '''window._resolveInc = async (id) => {
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

n = src.count(old)
if n != 1:
    raise SystemExit(f"[ABORTADO] bloco _resolveInc encontrado {n}x (esperado 1x).")
src = src.replace(old, new)
f.write_text(src, encoding="utf-8")
print("OK — _resolveInc corrigido (null productId + countedStock/found).")
