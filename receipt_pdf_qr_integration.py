import os

path = os.path.expanduser('~/kontaki/src/components/recibo-pdf.js')
js = open(path, 'r').read()

count = 0

# 1. Torna buildPdfDoc assíncrona
old_fn = "function buildPdfDoc(sale, store) {"
new_fn = "async function buildPdfDoc(sale, store) {"
if old_fn in js:
    js = js.replace(old_fn, new_fn, 1)
    count += 1
    print("buildPdfDoc agora é async.")
else:
    print("Aviso: assinatura da função não encontrada.")

# 2. Adiciona await nas duas chamadas
old_call = "var doc = buildPdfDoc(sale, store);"
new_call = "var doc = await buildPdfDoc(sale, store);"
occ = js.count(old_call)
if occ > 0:
    js = js.replace(old_call, new_call)
    count += 1
    print(str(occ) + " chamadas actualizadas com await.")
else:
    print("Aviso: chamadas não encontradas.")

# 3. Insere o QR no PDF, antes do código de verificação
old_code_block = '''  // ── CÓDIGO ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(150, 150, 150);
  doc.text("CÓDIGO DE VERIFICAÇÃO", cX, y, { align: "center" }); y += 4;'''

new_code_block = '''  // ── QR CODE ──
  if (sale.hash) {
    try {
      var qrDataUrl = await getQrDataUrl(sale.hash);
      if (qrDataUrl) {
        var qrSize = 22;
        doc.addImage(qrDataUrl, "PNG", cX - qrSize/2, y, qrSize, qrSize);
        y += qrSize + 3;
      }
    } catch(e) {}
  }

  // ── CÓDIGO ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(150, 150, 150);
  doc.text("CÓDIGO DE VERIFICAÇÃO", cX, y, { align: "center" }); y += 4;'''

if old_code_block in js:
    js = js.replace(old_code_block, new_code_block, 1)
    count += 1
    print("QR code inserido antes do código de verificação.")
else:
    print("Aviso: bloco do código não encontrado exactamente.")

open(path, 'w').write(js)
print(str(count) + " de 3 alterações aplicadas.")
