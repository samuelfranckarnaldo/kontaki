import os

path = os.path.expanduser('~/kontaki/src/components/recibo-pdf.js')
js = open(path, 'r').read()

marker = "  if (nif)        { centerText(\"NIF: \" + nif, y, 12, \"#6b7280\"); y += 16; }\n\n"

addition = '''  y += 8;

  // Bloco cliente
  if (sale.clientName) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cardX, y, cardW, 60);
    y += 22;
    leftText("CLIENTE", cardX + 20, y, 10, "#9ca3af", true);
    y += 18;
    leftText(sale.clientName, cardX + 20, y, 15, "#111827", true);
    if (sale.clientPhone) {
      ctx.font = "600 12px DM Sans, Arial, sans-serif";
      ctx.fillStyle = "#9ca3af";
      ctx.textAlign = "right";
      ctx.fillText(sale.clientPhone, cardX + cardW - 20, y);
    }
    y += 20;
  }

  // Bloco itens
  ctx.fillStyle = "#ffffff";
  const itemsH = items.length * 32 + 20;
  ctx.fillRect(cardX, y, cardW, itemsH);
  y += 26;
  items.forEach(function(i) {
    leftText(i.name, cardX + 20, y, 14, "#374151", true);
    ctx.font = "600 12px DM Sans, Arial, sans-serif";
    ctx.fillStyle = "#9ca3af";
    ctx.textAlign = "left";
    ctx.fillText("×" + i.qty, cardX + 20 + ctx.measureText(i.name).width + 8, y);

    ctx.font = "700 14px DM Sans, Arial, sans-serif";
    ctx.fillStyle = "#111827";
    ctx.textAlign = "right";
    ctx.fillText(fmt(i.price * i.qty), cardX + cardW - 20, y);
    y += 30;
  });

  // Bloco total
  const totalBlockH = 90 + (sale.discount > 0 ? 24 : 0) + (sale.ivaPct > 0 ? 24 : 0);
  ctx.fillStyle = "#fafafa";
  ctx.fillRect(cardX, y, cardW, totalBlockH);
  y += 24;

  if (sale.discount > 0) {
    leftText("Desconto", cardX + 20, y, 12, "#6b7280");
    ctx.font = "700 12px DM Sans, Arial, sans-serif";
    ctx.fillStyle = "#059669";
    ctx.textAlign = "right";
    ctx.fillText("− " + fmt(sale.discount), cardX + cardW - 20, y);
    y += 24;
  }
  if (sale.ivaPct > 0) {
    leftText("IVA " + sale.ivaPct + "%", cardX + 20, y, 12, "#6b7280");
    ctx.font = "700 12px DM Sans, Arial, sans-serif";
    ctx.fillStyle = "#374151";
    ctx.textAlign = "right";
    ctx.fillText("+ " + fmt(sale.ivaValor || 0), cardX + cardW - 20, y);
    y += 24;
  }

  roundRect(cardX + 12, y - 18, cardW - 24, 44, 10);
  ctx.fillStyle = "#5b21b6";
  ctx.fill();
  ctx.font = "700 15px DM Sans, Arial, sans-serif";
  ctx.fillStyle = "#ddd6fe";
  ctx.textAlign = "left";
  ctx.fillText("Total", cardX + 28, y + 10);
  ctx.font = "800 22px DM Sans, Arial, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "right";
  ctx.fillText(fmt(total), cardX + cardW - 28, y + 10);
  y += 44;

  const payLabel = (sale.payMethod||"").charAt(0).toUpperCase() + (sale.payMethod||"").slice(1);
  leftText(payLabel, cardX + 20, y, 12, "#6b7280");
  if (sale.recebido > 0) {
    ctx.font = "600 12px DM Sans, Arial, sans-serif";
    ctx.fillStyle = "#6b7280";
    ctx.textAlign = "right";
    ctx.fillText("Recebido: " + fmt(sale.recebido) + " · Troco: " + fmt(sale.troco), cardX + cardW - 20, y);
  }
  y += 30;

'''

if marker in js:
    js = js.replace(marker, marker + addition, 1)
    open(path, 'w').write(js)
    print("Parte 2 (cliente + itens + total) adicionada.")
else:
    print("ERRO: marcador não encontrado exactamente.")
