import os

path = os.path.expanduser('~/kontaki/src/components/recibo-pdf.js')
js = open(path, 'r').read()

# 1. Adiciona função auxiliar para gerar QR como dataURL
old_marker = 'function buildPdfDoc(sale, store) {'

new_addition = '''function getQrDataUrl(text) {
  return new Promise(function(resolve) {
    try {
      var temp = document.createElement("div");
      temp.style.cssText = "position:fixed;left:-9999px;top:-9999px";
      document.body.appendChild(temp);

      new window.QRCode(temp, {
        text: text, width: 200, height: 200,
        colorDark: "#18181b", colorLight: "#ffffff",
        correctLevel: window.QRCode.CorrectLevel.M,
      });

      setTimeout(function() {
        var img = temp.querySelector("img");
        var dataUrl = img && img.src && img.src.indexOf("data:image") === 0 ? img.src : null;
        document.body.removeChild(temp);
        resolve(dataUrl);
      }, 100);
    } catch (e) {
      resolve(null);
    }
  });
}

function buildPdfDoc(sale, store) {'''

count = 0
if old_marker in js and 'getQrDataUrl' not in js:
    js = js.replace(old_marker, new_addition, 1)
    count += 1
    print("Função getQrDataUrl adicionada.")
else:
    print("Aviso: marcador não encontrado ou função já existe.")

open(path, 'w').write(js)
print(str(count) + " alteração aplicada.")
