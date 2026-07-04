import pathlib

def replace_once(src, old, new, label):
    n = src.count(old)
    if n != 1:
        raise SystemExit(f"[ABORTADO] '{label}' encontrado {n}x (esperado 1x). Nada foi alterado.")
    return src.replace(old, new)

# ── extras.js — bloquear devolução sem turno ──────────────────────────────────
f1 = pathlib.Path.home() / "kontaki" / "src" / "components" / "extras.js"
s1 = f1.read_text(encoding="utf-8")

old1 = '''export async function openDevolucao(saleId) {
  var sale = await db.get("sales", saleId);
  if (!sale) { toast("Venda não encontrada.", "error"); return; }'''
new1 = '''export async function openDevolucao(saleId) {
  var { getSession } = await import("../auth.js");
  if (!getSession()) { toast("Abre um turno primeiro.", "error"); return; }

  var sale = await db.get("sales", saleId);
  if (!sale) { toast("Venda não encontrada.", "error"); return; }'''
s1 = replace_once(s1, old1, new1, "bloqueio em openDevolucao")

old2 = '''window._confirmarDevolucao = async function() {
  var sale = window._saleParaDevolucao;
  if (!sale) return;'''
new2 = '''window._confirmarDevolucao = async function() {
  var { getSession } = await import("../auth.js");
  if (!getSession()) { toast("Abre um turno primeiro.", "error"); return; }

  var sale = window._saleParaDevolucao;
  if (!sale) return;'''
s1 = replace_once(s1, old2, new2, "bloqueio em _confirmarDevolucao")

f1.write_text(s1, encoding="utf-8")
print("OK — extras.js: devolução bloqueada sem turno (abertura do modal + confirmação).")

# ── fiados.js — verificar turno ANTES de abrir o modal, não só no submit ─────
f2 = pathlib.Path.home() / "kontaki" / "src" / "components" / "fiados.js"
s2 = f2.read_text(encoding="utf-8")

old3 = '''function openFiadoAdd(prefillName = "") {
  openModal("Registar Fiado",'''
new3 = '''async function openFiadoAdd(prefillName = "") {
  const { getSession } = await import("../auth.js");
  if (!getSession()) { toast("Abre um turno primeiro.", "error"); return; }

  openModal("Registar Fiado",'''
s2 = replace_once(s2, old3, new3, "bloqueio em openFiadoAdd (antes de abrir modal)")

f2.write_text(s2, encoding="utf-8")
print("OK — fiados.js: aviso 'Abre um turno primeiro' aparece ANTES de abrir o formulário.")
