import os

path = os.path.expanduser('~/kontaki/src/components/recibo-pdf.js')
js = open(path, 'r').read()

marker = "function getQrDataUrl(text) {"

new_function = '''async function buildReceiptImage(sale, store) {
  const storeName  = store.name    || "Kontaki";
  const storeAddr  = store.address || "";
  const storePhone = store.phone   || "";
  const storeLogo  = store.logo    || "";
  const nif        = store.nif     || "";
  const items      = sale.items || [];
  const total      = (sale.total || 0) - (sale.totalDevolvido || 0);

  const W = 600;
  const scale = 2;
  const pad = 24;

  // Calcula altura estimada
  let estH = 220 + items.length * 32 + 260;
  if (sale.clientName) estH += 60;
  if (sale.discount > 0) estH += 24;
  if (sale.ivaPct > 0) estH += 24;

  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = estH * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  // Fundo branco
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, estH);

  let y = 0;

  function roundRect(x, yy, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, yy);
    ctx.arcTo(x + w, yy, x + w, yy + h, r);
    ctx.arcTo(x + w, yy + h, x, yy + h, r);
    ctx.arcTo(x, yy + h, x, yy, r);
    ctx.arcTo(x, yy, x + w, yy, r);
    ctx.closePath();
  }

  function centerText(str, yy, size, color, bold) {
    ctx.font = (bold ? "700 " : "600 ") + size + "px DM Sans, Arial, sans-serif";
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(str, W / 2, yy);
  }

  function leftText(str, x, yy, size, color, bold, align) {
    ctx.font = (bold ? "700 " : "600 ") + size + "px DM Sans, Arial, sans-serif";
    ctx.fillStyle = color;
    ctx.textAlign = align || "left";
    ctx.fillText(str, x, yy);
  }

  // ── Header verde (sucesso) ──
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, "#059669");
  grad.addColorStop(1, "#10b981");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 130);

  ctx.beginPath();
  ctx.arc(W/2, 44, 26, 0, Math.PI*2);
  ctx.fillStyle = "rgba(255,255,255,.2)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,.4)";
  ctx.stroke();

  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(W/2-10, 44);
  ctx.lineTo(W/2-3, 52);
  ctx.lineTo(W/2+12, 34);
  ctx.stroke();

  centerText(fmt(total), 92, 34, "#ffffff", true);
  const nItems = items.reduce((a,i)=>a+i.qty,0);
  centerText(nItems + (nItems===1?" item":" itens") + " · Venda concluída", 114, 13, "rgba(255,255,255,.85)");

  y = 150;
  const cardX = pad, cardW = W - pad*2;

  // Bloco loja
  ctx.fillStyle = "#fafafa";
  ctx.fillRect(cardX, y, cardW, 100);
  y += 30;
  centerText(storeName, y, 17, "#111827", true);
  y += 20;
  if (storeAddr)  { centerText(storeAddr, y, 12, "#6b7280"); y += 16; }
  if (storePhone) { centerText(storePhone, y, 12, "#6b7280"); y += 16; }
  if (nif)        { centerText("NIF: " + nif, y, 12, "#6b7280"); y += 16; }

'''

if marker in js and 'buildReceiptImage' not in js:
    js = js.replace(marker, new_function + marker, 1)
    open(path, 'w').write(js)
    print("Parte 1 (header + loja) de buildReceiptImage adicionada.")
else:
    print("Aviso: marcador não encontrado ou função já existe.")
