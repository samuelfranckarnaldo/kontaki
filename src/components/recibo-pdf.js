import { db }           from "../db.js";
import { fmt, fmtDate }  from "../utils.js";

// ── PDF 80mm ─────────────────────────────────────────────────────────────────
function getQrDataUrl(text) {
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
        var canvas = temp.querySelector("canvas");
        var dataUrl = null;
        if (canvas) {
          try { dataUrl = canvas.toDataURL("image/png"); } catch(e) {}
        }
        document.body.removeChild(temp);
        resolve(dataUrl);
      }, 200);
    } catch (e) {
      resolve(null);
    }
  });
}

async function buildPdfDoc(sale, store) {
  var jsPDFLib = window.jspdf ? window.jspdf.jsPDF : null;
  if (!jsPDFLib) { alert("Biblioteca PDF não carregada."); return null; }

  var pageW  = 80;
  var margin = 5;
  var cW     = pageW - margin * 2;
  var cX     = pageW / 2;
  var items  = sale.items || [];
  var total  = (sale.total || 0) - (sale.totalDevolvido || 0);

  // Estimar altura da página
  var estHeight = 60 + items.length * 6 + 60 + 28;
  var doc = new jsPDFLib({ unit: "mm", format: [pageW, estHeight] });
  var y = margin;

  function line(dash) {
    if (dash) doc.setLineDashPattern([1,1], 0);
    else doc.setLineDashPattern([], 0);
    doc.setDrawColor(180, 180, 180);
    doc.line(margin, y, pageW - margin, y);
    y += 4;
  }

  function text(str, x, align, size, bold) {
    doc.setFontSize(size || 8);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(bold ? 30 : 80, bold ? 30 : 80, bold ? 30 : 80);
    doc.text(str, x, y, { align: align || "left" });
    y += (size || 8) * 0.45;
  }

  function row(left, right, size, bold) {
    doc.setFontSize(size || 8);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(bold ? 30 : 60, bold ? 30 : 60, bold ? 30 : 60);
    doc.text(left,  margin, y);
    doc.text(right, pageW - margin, y, { align: "right" });
    y += (size || 8) * 0.45;
  }

  // ── CABEÇALHO ──
  if (store.logo) {
    try { doc.addImage(store.logo, "PNG", cX - 8, y, 16, 16); y += 18; }
    catch(e) {}
  }

  text(store.name || "Kontaki", cX, "center", 12, true); y += 1;
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

  // ── QR CODE ──
  if (sale.hash) {
    var qrDataUrl = await getQrDataUrl(sale.hash);
    if (qrDataUrl) {
      try {
        var qrSize = 22;
        doc.addImage(qrDataUrl, "PNG", cX - qrSize/2, y, qrSize, qrSize);
        y += qrSize + 3;
      } catch(e) {}
    }
  }

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
}

// ── IMPRESSÃO HTML ────────────────────────────────────────────────────────────
async function printReciboHTML(saleId) {
  var sale  = await db.get("sales", saleId);
  if (!sale) return;
  var store = (await db.get("settings", "store")) || {};
  var items = sale.items || [];
  var total = (sale.total || 0) - (sale.totalDevolvido || 0);

  var html = [
    "<!DOCTYPE html><html><head><meta charset='UTF-8'>",
    "<title>Recibo " + String(sale.id).padStart(6,"0") + "</title>",
    "<style>",
    "  * { box-sizing:border-box; margin:0; padding:0; }",
    "  body { font-family: 'Courier New', monospace; font-size: 11px;",
    "         width: 80mm; margin: 0 auto; padding: 8px; color: #111; }",
    "  .center { text-align: center; }",
    "  .bold   { font-weight: bold; }",
    "  .lg     { font-size: 14px; }",
    "  .xl     { font-size: 18px; font-weight: bold; }",
    "  .sm     { font-size: 9px; color: #666; }",
    "  .divider-dash { border: none; border-top: 1px dashed #999; margin: 6px 0; }",
    "  .divider-solid{ border: none; border-top: 1px solid #333; margin: 6px 0; }",
    "  .row    { display:flex; justify-content:space-between; padding: 2px 0; }",
    "  .total-box { background:#5b21b6; color:#fff; padding:6px 8px;",
    "               border-radius:4px; display:flex; justify-content:space-between;",
    "               margin:6px 0; font-weight:bold; font-size:13px; }",
    "  .hash   { font-size:16px; font-weight:bold; color:#5b21b6;",
    "            letter-spacing:3px; text-align:center; margin:6px 0; }",
    "  @media print {",
    "    body { width: 80mm; }",
    "    @page { size: 80mm auto; margin: 0; }",
    "  }",
    "</style></head><body>",

    // Cabeçalho
    "<div class='center'>",
    store.logo ? "<img src='" + store.logo + "' style='width:40px;height:40px;object-fit:contain;margin-bottom:4px'/><br/>" : "",
    "<div class='bold lg'>" + (store.name || "Kontaki") + "</div>",
    store.address ? "<div class='sm'>" + store.address + "</div>" : "",
    store.phone   ? "<div class='sm'>" + store.phone   + "</div>" : "",
    store.nif     ? "<div class='sm'>NIF: " + store.nif + "</div>" : "",
    "</div>",

    "<hr class='divider-dash'/>",

    "<div class='row'>",
    "<span class='bold'>Recibo Nº " + String(sale.id).padStart(6,"0") + "</span>",
    "<span class='sm'>" + fmtDate(sale.date) + "</span>",
    "</div>",

    sale.clientName ? "<div class='row'><span class='bold'>Cliente: " + sale.clientName + "</span></div>" : "",
    sale.clientPhone ? "<div class='sm'>Tel: " + sale.clientPhone + "</div>" : "",

    "<hr class='divider-dash'/>",

    // Itens
    items.map(function(i) {
      return "<div><div class='bold'>" + i.name + "</div>" +
             "<div class='row sm'><span>" + i.qty + " x " + fmt(i.price) + "</span>" +
             "<span class='bold' style='color:#111'>" + fmt(i.price * i.qty) + "</span></div></div>";
    }).join(""),

    "<hr class='divider-solid'/>",

    sale.discount > 0 ? "<div class='row'><span>Desconto</span><span>- " + fmt(sale.discount) + "</span></div>" : "",
    sale.ivaPct > 0   ? "<div class='row'><span>IVA " + sale.ivaPct + "%</span><span>+ " + fmt(sale.ivaValor||0) + "</span></div>" : "",

    "<div class='total-box'><span>TOTAL</span><span>" + fmt(total) + "</span></div>",

    "<div class='row sm'>",
    "<span>Pagamento: " + (sale.payMethod||"") + "</span>",
    sale.recebido > 0 ? "<span>Recebido: " + fmt(sale.recebido) + "</span>" : "",
    "</div>",
    sale.troco > 0 ? "<div class='row'><span>Troco</span><span class='bold'>" + fmt(sale.troco) + "</span></div>" : "",

    "<hr class='divider-dash'/>",

    "<div class='hash'>" + (sale.hash||"") + "</div>",

    "<div class='center sm'>",
    "<div>Documento de gestão interna</div>",
    "<div>Sem validade fiscal perante a AGT</div>",
    "<div style='margin-top:4px;color:#5b21b6;font-weight:bold'>Kontaki · Introxeer Technology</div>",
    "</div>",

    "<br/><br/>",
    "</body></html>"
  ].join("\n");

  var win = window.open("", "_blank", "width=400,height=600");
  if (!win) { alert("Permite pop-ups para imprimir."); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(function() { win.print(); }, 500);
}

// ── EXPORTS ───────────────────────────────────────────────────────────────────
export async function gerarReciboPDF(saleId) {
  var sale  = await db.get("sales", saleId);
  if (!sale) return;
  var store = (await db.get("settings","store")) || {};
  var doc = await buildPdfDoc(sale, store);
  if (!doc) return;
  doc.save("recibo_" + String(saleId).padStart(6,"0") + ".pdf");
}

export async function partilharReciboPDF(saleId) {
  var sale  = await db.get("sales", saleId);
  if (!sale) return;
  var store = (await db.get("settings","store")) || {};
  var doc = await buildPdfDoc(sale, store);
  if (!doc) return;

  var blob  = doc.output("blob");
  var fname = "recibo_" + String(saleId).padStart(6,"0") + ".pdf";
  var file  = new File([blob], fname, { type:"application/pdf" });

  if (navigator.canShare && navigator.canShare({ files:[file] })) {
    try { await navigator.share({ files:[file], title:"Recibo Kontaki" }); return; }
    catch(e) {}
  }

  var url = URL.createObjectURL(blob);
  var a   = document.createElement("a");
  a.href = url; a.download = fname; a.click();
  URL.revokeObjectURL(url);
}

export { printReciboHTML };
