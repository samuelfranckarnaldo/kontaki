import os

path = os.path.expanduser('~/kontaki/src/components/recibo-pdf.js')
js = open(path, 'r').read()

old = '''  text(store.name || "Kontaki", cX, "center", 12, true); y += 1;
  if (store.address) { text(store.address, cX, "center", 7); }
  if (store.phone)   { text(store.phone,   cX, "center", 7); }
  if (store.nif)     { text("NIF: " + store.nif, cX, "center", 7); }
  y += 2;

  line(true);

  text("Recibo Nº " + String(sale.id).padStart(6, "0"), margin, "left", 7.5, true);
  y -= 1;
  text(fmtDate(sale.date), pageW - margin, "right", 7);
  y += 1;
  if (sale.clientName) {
    text("Cliente: " + sale.clientName, margin, "left", 7.5, true);
    if (sale.clientPhone) text("Tel: " + sale.clientPhone, margin, "left", 7);
  }
  y += 1;

  line(true);

  // ── ITENS ──
  items.forEach(function(i) {
    var name = i.name.length > 28 ? i.name.slice(0, 25) + "..." : i.name;
    text(name, margin, "left", 7.5, true);
    y -= 1;
    row(i.qty + " x " + fmt(i.price), fmt(i.price * i.qty), 7.5);
    y += 1;
  });

  line(true);

  // ── TOTAIS ──
  if (sale.discount > 0) {
    row("Desconto", "- " + fmt(sale.discount), 8);
  }
  if (sale.ivaPct > 0) {
    row("IVA " + sale.ivaPct + "%", "+ " + fmt(sale.ivaValor || 0), 8);
  }
  y += 1;
  doc.setFillColor(91, 33, 182);
  doc.roundedRect(margin, y - 4, cW, 9, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("TOTAL", margin + 3, y + 1.5);
  doc.text(fmt(total), pageW - margin - 3, y + 1.5, { align: "right" });
  y += 9;

  doc.setTextColor(60, 60, 60);
  y += 2;
  text("Pagamento: " + (sale.payMethod || ""), margin, "left", 7.5);
  if (sale.recebido > 0) row("Recebido", fmt(sale.recebido), 7.5);
  if (sale.troco > 0)    row("Troco",    fmt(sale.troco),    7.5, true);

  y += 2;
  line(true);

  // ── CÓDIGO ──
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(91, 33, 182);
  doc.text(sale.hash || "", cX, y, { align: "center" });
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(150, 150, 150);
  doc.text("Documento de gestao interna · Sem validade fiscal AGT", cX, y, { align: "center" }); y += 3;
  doc.text("Powered by Kontaki · Introxeer Technology", cX, y, { align: "center" });

  return doc;
}'''

new = '''  text(store.name || "Kontaki", cX, "center", 12, true); y += 1;
  if (store.address) { text(store.address, cX, "center", 7); }
  if (store.phone)   { text(store.phone,   cX, "center", 7); }
  if (store.nif)     { text("NIF: " + store.nif, cX, "center", 7); }
  y += 2;

  line(true);

  text("Recibo Nº " + String(sale.id).padStart(6, "0"), margin, "left", 7.5, true);
  y -= 1;
  text(fmtDate(sale.date), pageW - margin, "right", 7);
  if (sale.operatorName) { text("Atendido por " + sale.operatorName, margin, "left", 6.5); }
  y += 1;
  if (sale.clientName) {
    text("Cliente: " + sale.clientName, margin, "left", 7.5, true);
    if (sale.clientPhone) text("Tel: " + sale.clientPhone, margin, "left", 7);
  }
  y += 1;

  line(true);

  // ── ITENS ──
  items.forEach(function(i) {
    var name = i.name.length > 28 ? i.name.slice(0, 25) + "..." : i.name;
    text(name, margin, "left", 7.5, true);
    y -= 1;
    row(i.qty + " x " + fmt(i.price), fmt(i.price * i.qty), 7.5);
    y += 1;
  });

  y += 1;

  // ── TOTAIS ──
  if (sale.discount > 0) {
    row("Desconto", "- " + fmt(sale.discount), 8);
  }
  if (sale.ivaPct > 0) {
    row("IVA " + sale.ivaPct + "%", "+ " + fmt(sale.ivaValor || 0), 8);
  }
  y += 1;
  doc.setFillColor(91, 33, 182);
  doc.roundedRect(margin, y - 4, cW, 9, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("TOTAL", margin + 3, y + 1.5);
  doc.text(fmt(total), pageW - margin - 3, y + 1.5, { align: "right" });
  y += 9;

  doc.setTextColor(60, 60, 60);
  y += 2;
  var payLabel = (sale.payMethod || "").charAt(0).toUpperCase() + (sale.payMethod || "").slice(1);
  text("Pagamento: " + payLabel, margin, "left", 7.5);
  if (sale.recebido > 0) row("Recebido", fmt(sale.recebido), 7.5);
  if (sale.troco > 0)    row("Troco",    fmt(sale.troco),    7.5, true);

  y += 2;
  line(true);

  // ── CÓDIGO ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(150, 150, 150);
  doc.text("CÓDIGO DE VERIFICAÇÃO", cX, y, { align: "center" }); y += 4;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(60, 60, 60);
  doc.text(sale.hash || "", cX, y, { align: "center" });
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(55, 65, 81);
  doc.text("Obrigado pela preferência!", cX, y, { align: "center" }); y += 3.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(150, 150, 150);
  doc.text("Volte sempre", cX, y, { align: "center" }); y += 5;

  doc.setFontSize(6);
  doc.setTextColor(180, 180, 180);
  doc.text("Documento de gestão interna · Sem validade fiscal AGT", cX, y, { align: "center" }); y += 3;
  doc.text("Powered by Kontaki · Introxeer", cX, y, { align: "center" });

  return doc;
}'''

if old in js:
    js = js.replace(old, new, 1)
    open(path, 'w').write(js)
    print("recibo-pdf.js redesenhado: menos separadores, operador, código explicado, agradecimento, Introxeer simplificado.")
else:
    print("ERRO: bloco não encontrado exactamente — verificar manualmente.")
