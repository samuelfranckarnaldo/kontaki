import pathlib

f = pathlib.Path.home() / "kontaki" / "index.html"
src = f.read_text(encoding="utf-8")

old = '''      <div id="subpage-sobre" style="display:none">'''
new = '''      <div id="subpage-ajuda" style="display:none">
        <div class="page-inner">
          <button class="btn btn-ghost btn-sm" id="btn-back-ajuda">← Voltar</button>
          <div style="font-size:17px;font-weight:700;margin:8px 0 14px">Ajuda</div>
          <div style="position:relative;margin-bottom:16px">
            <i data-lucide="search" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:#a1a1aa;pointer-events:none"></i>
            <input id="ajuda-search" placeholder="Pesquisar (ex: abrir turno, incidente...)" style="width:100%;padding:12px 12px 12px 36px;border:1.5px solid #e4e4e7;border-radius:12px;font-size:14px;font-family:inherit;box-sizing:border-box"/>
          </div>
          <div id="ajuda-content"></div>
        </div>
      </div>

      <div id="subpage-sobre" style="display:none">'''

n = src.count(old)
if n != 1:
    raise SystemExit(f"[ABORTADO] âncora 'subpage-sobre' encontrada {n}x (esperado 1x).")
src = src.replace(old, new)
f.write_text(src, encoding="utf-8")
print("OK — index.html: subpage 'Ajuda' criada com campo de busca.")
