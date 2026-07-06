import pathlib

f = pathlib.Path.home() / "kontaki" / "src" / "styles" / "components.css"
s = f.read_text(encoding="utf-8")

old = '.desp-item-val { font-size: 14px; font-weight: 700; color: var(--danger); margin-left: auto; flex-shrink: 0; }'
new = '.desp-item-val { font-size: 14px; font-weight: 700; color: var(--text2); margin-left: auto; flex-shrink: 0; }'

n = s.count(old)
if n != 1:
    raise SystemExit(f"[ABORTADO] encontrado {n}x (esperado 1x).")
s = s.replace(old, new)
f.write_text(s, encoding="utf-8")
print("OK — components.css: valores das despesas passam a neutro em vez de vermelho.")
