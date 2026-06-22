import { db }        from "../db.js";
import { fmt, fmtDate } from "../utils.js";

function buildPdfDoc(sale, store) {
  var jsPDFLib = window.jspdf ? window.jspdf.jsPDF : null;
  if (!jsPDFLib) { alert("Biblioteca PDF não carregada. Recarrega a app."); return null; }

  var doc = new jsPDFLib({ unit: "mm", format: [80, 150] });
  var y = 10;
  var items = sale.items || [];
  var total = (sale.total||0) - (sale.totalDevolvido||0);

  if (store.logo) {
    try {
      doc.addImage(store.logo, "PNG", 30, y, 20, 20);
      y += 23;
    } catch(e) {}
  }

  doc.setFont("helvetica","bold");
  doc.setFontSize(13);
  doc.text((store.name||"Kontaki"), 40, y, { align:"center" }); y += 5;

  doc.setFont("helvetica","normal");
  doc.setFontSize(8);
  if (store.address) { doc.text(store.address, 40, y, { align:"center" }); y += 4; }
  if (store.phone)   { doc.text(store.phone, 40, y, { align:"center" }); y += 4; }
  if (store.nif)      { doc.text("NIF: "+store.nif, 40, y, { align:"center" }); y += 4; }

  y += 2;
  doc.setLineDashPattern([1,1],0);
  doc.line(5, y, 75, y); y += 5;

  doc.setFontSize(8);
  doc.text("Recibo Nº " + String(sale.id).padStart(6,"0"), 5, y); y += 4;
  doc.text(fmtDate(sale.date), 5, y); y += 4;
  if (sale.clientName) { doc.setFont("helvetica","bold"); doc.text("Cliente: "+sale.clientName,5,y); doc.setFont("helvetica","normal"); y += 4; }

  doc.line(5, y, 75, y); y += 5;

  doc.setFontSize(8);
  items.forEach(function(i){
    var label = i.name + " x" + i.qty;
    var val   = fmt(i.price*i.qty);
    doc.text(label, 5, y);
    doc.text(val, 75, y, { align:"right" });
    y += 4.5;
  });

  doc.line(5, y, 75, y); y += 5;

  if (sale.discount > 0) {
    doc.text("Desconto", 5, y);
    doc.text("- "+fmt(sale.discount), 75, y, { align:"right" });
    y += 4.5;
  }
  if (sale.ivaPct > 0) {
    doc.text("IVA "+sale.ivaPct+"%", 5, y);
    doc.text("+ "+fmt(sale.ivaValor||0), 75, y, { align:"right" });
    y += 4.5;
  }
  if (sale.totalDevolvido > 0) {
    doc.text("Devoluções", 5, y);
    doc.text("- "+fmt(sale.totalDevolvido), 75, y, { align:"right" });
    y += 4.5;
  }

  doc.setFont("helvetica","bold");
  doc.setFontSize(11);
  doc.text("TOTAL", 5, y);
  doc.text(fmt(total), 75, y, { align:"right" });
  y += 6;

  doc.setFont("helvetica","normal");
  doc.setFontSize(8);
  doc.text("Pagamento: " + sale.payMethod, 5, y); y += 4;
  if (sale.recebido > 0) { doc.text("Recebido: " + fmt(sale.recebido), 5, y); y += 4; }
  if (sale.troco > 0)    { doc.text("Troco: " + fmt(sale.troco), 5, y); y += 4; }

  y += 2;
  doc.line(5, y, 75, y); y += 5;

  doc.setFont("helvetica","bold");
  doc.setFontSize(9);
  doc.text((sale.hash||"N/A"), 40, y, { align:"center" }); y += 6;

  doc.setFont("helvetica","normal");
  doc.setFontSize(6.5);
  doc.text("Documento de gestão interna", 40, y, { align:"center" }); y += 3;
  doc.text("Sem validade fiscal perante a AGT", 40, y, { align:"center" }); y += 4;
  doc.setFont("helvetica","bold");
  doc.text("Kontaki · Introxeer Technology", 40, y, { align:"center" });

  return doc;
}

export async function gerarReciboPDF(saleId) {
  var sale  = await db.get("sales", saleId);
  if (!sale) return;
  var store = (await db.get("settings","store")) || {};
  var doc = buildPdfDoc(sale, store);
  if (!doc) return;
  doc.save("recibo_" + String(saleId).padStart(6,"0") + ".pdf");
}

export async function partilharReciboPDF(saleId) {
  var sale  = await db.get("sales", saleId);
  if (!sale) return;
  var store = (await db.get("settings","store")) || {};
  var doc = buildPdfDoc(sale, store);
  if (!doc) return;

  var blob = doc.output("blob");
  var fname = "recibo_" + String(saleId).padStart(6,"0") + ".pdf";
  var file = new File([blob], fname, { type:"application/pdf" });

  if (navigator.canShare && navigator.canShare({ files:[file] })) {
    try {
      await navigator.share({ files:[file], title:"Recibo Kontaki" });
      return;
    } catch(e) {}
  }

  var url = URL.createObjectURL(blob);
  var a   = document.createElement("a");
  a.href = url; a.download = fname; a.click();
  URL.revokeObjectURL(url);
}
