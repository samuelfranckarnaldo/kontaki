import pathlib

f = pathlib.Path.home() / "kontaki" / "src" / "styles" / "components.css"
s = f.read_text(encoding="utf-8")

def r1(s, old, new, label):
    n = s.count(old)
    if n != 1:
        raise SystemExit(f"[ABORTADO] '{label}' encontrado {n}x (esperado 1x).")
    return s.replace(old, new)

s = r1(s,
    '.desp-item-val { font-weight: 700; color: var(--danger); flex-shrink: 0; }',
    '.desp-item-val { font-weight: 700; color: var(--text2); flex-shrink: 0; }',
    "valor no histórico")

f.write_text(s, encoding="utf-8")
print("OK — components.css: valores das despesas passam a neutro em vez de vermelho.")
