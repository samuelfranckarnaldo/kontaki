import os

path = os.path.expanduser('~/kontaki/src/components/recibo-pdf.js')
js = open(path, 'r').read()

start_marker = "async function buildReceiptImage(sale, store) {"
end_marker = "function getQrDataUrl(text) {"

start_idx = js.find(start_marker)
end_idx = js.find(end_marker)

if start_idx != -1 and end_idx != -1 and start_idx < end_idx:
    js = js[:start_idx] + js[end_idx:]
    open(path, 'w').write(js)
    print("Função incompleta buildReceiptImage removida. Ficheiro revertido ao estado funcional.")
else:
    print("ERRO: marcadores não encontrados como esperado — verificar manualmente.")
