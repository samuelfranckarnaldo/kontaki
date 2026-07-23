import { db }           from "../db.js";
import { fmt, fmtDate }  from "../utils.js";
import { toast }        from "../toast.js";

// ── PDF 80mm ─────────────────────────────────────────────────────────────────
function payMethodLabel(m) {
  return { dinheiro: "Dinheiro", transferencia: "Transferência", multicaixa: "Multicaixa", fiado: "Crédito" }[m] || m;
}

async function getSkuMap() {
  var all = await db.getAll("products");
  var map = {};
  (all || []).forEach(function(p) { if (p.sku) map[p.id] = p.sku; });
  return map;
}

// ── TOTAL POR EXTENSO (Português) ──────────────────────────────────────────────
function trioExtenso(num) {
  var units    = ["","um","dois","três","quatro","cinco","seis","sete","oito","nove"];
  var teens    = ["dez","onze","doze","treze","catorze","quinze","dezasseis","dezassete","dezoito","dezanove"];
  var tens     = ["","dez","vinte","trinta","quarenta","cinquenta","sessenta","setenta","oitenta","noventa"];
  var hundreds = ["","cento","duzentos","trezentos","quatrocentos","quinhentos","seiscentos","setecentos","oitocentos","novecentos"];
  if (num === 0) return "";
  if (num === 100) return "cem";
  var parts = [];
  var h = Math.floor(num / 100), r = num % 100;
  if (h > 0) parts.push(hundreds[h]);
  if (r > 0) {
    if (r < 10) parts.push(units[r]);
    else if (r < 20) parts.push(teens[r - 10]);
    else {
      var t = Math.floor(r / 10), u = r % 10;
      parts.push(u > 0 ? tens[t] + " e " + units[u] : tens[t]);
    }
  }
  return parts.join(" e ");
}

function numeroExtenso(num) {
  if (num === 0) return "zero";
  var groupsArr = [];
  var temp = num;
  while (temp > 0) { groupsArr.unshift(temp % 1000); temp = Math.floor(temp / 1000); }
  var nGroups = groupsArr.length;
  // Guarda pares {palavra, valor} só dos grupos não-zero, para nunca
  // referenciar por engano um grupo final igual a 0 (ex: 1.234.000).
  var entries = [];
  for (var i = 0; i < nGroups; i++) {
    var g = groupsArr[i];
    var power = nGroups - 1 - i;
    if (g === 0) continue;
    var w = trioExtenso(g);
    if (power === 1) w = (g === 1) ? "mil" : w + " mil";
    else if (power === 2) w += (g === 1) ? " milhão" : " milhões";
    entries.push({ word: w, val: g });
  }
  if (entries.length === 0) return "zero";
  if (entries.length === 1) return entries[0].word;
  var lastEntry = entries[entries.length - 1];
  var rest = entries.slice(0, -1).map(function(e) { return e.word; });
  // "e" antes do último grupo se ele for < 100 OU for uma centena exacta
  // (100, 200, ..., 900); vírgula nos outros casos.
  var joiner = (lastEntry.val < 100 || lastEntry.val % 100 === 0) ? " e " : ", ";
  return rest.join(", ") + joiner + lastEntry.word;
}

function totalExtenso(valor) {
  var n = Math.round((valor || 0) * 100) / 100;
  var intPart  = Math.floor(n);
  var centPart = Math.round((n - intPart) * 100);
  var intWords = numeroExtenso(intPart);
  var result = intWords.charAt(0).toUpperCase() + intWords.slice(1) + " " + (intPart === 1 ? "Kwanza" : "Kwanzas");
  if (centPart > 0) {
    result += " e " + numeroExtenso(centPart) + (centPart === 1 ? " cêntimo" : " cêntimos");
  }
  return result;
}

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
  if (!jsPDFLib) { toast("Biblioteca PDF não carregada.", "error"); return null; }

  var pageW  = 80;
  var margin = 5;
  var cW     = pageW - margin * 2;
  var cX     = pageW / 2;
  var items  = sale.items || [];
  var total  = (sale.total || 0) - (sale.totalDevolvido || 0);
  var skuMap = await getSkuMap();

  // Estimar altura da página
  var estHeight = 60 + items.length * 11 + 60 + 28 + 14;
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
    try { doc.addImage(store.logo, "PNG", cX - 8, y, 16, 16); y += 21; }
    catch(e) {}
  }

  text(store.name || "Kontaki", cX, "center", 12, true); y += 1;
  if (store.address) { text(store.address, cX, "center", 7); }
  if (store.phone)   { text(store.phone,   cX, "center", 7); }
  if (store.nif)     { text("NIF: " + store.nif, cX, "center", 7); }
  y += 2;

  line(false);

  text("Recibo Nº " + String(sale.id).padStart(6, "0"), margin, "left", 7.5, true);
  y -= 1;
  text(fmtDate(sale.date), pageW - margin, "right", 7);
  if (sale.operatorName) { text("Atendido por " + sale.operatorName, margin, "left", 6.5); }
  y += 1;
  if (sale.clientName) {
    text("Cliente: " + sale.clientName, margin, "left", 7.5, true);
    if (sale.clientPhone)   text("Tel: " + sale.clientPhone, margin, "left", 7);
    if (sale.clientAddress) text(sale.clientAddress, margin, "left", 7);
  }
  y += 1;

  line(false);

  // ── ITENS ──
  items.forEach(function(i) {
    var name = i.name.length > 28 ? i.name.slice(0, 25) + "..." : i.name;
    text(name, margin, "left", 7.5, true);
    if (skuMap[i.id]) text("Ref: " + skuMap[i.id], margin, "left", 6);
    row(i.qty + " x " + fmt(i.price), fmt(i.price * i.qty), 7.5);
    y += 2.5;
  });

  y += 1;

  // ── TOTAIS ──
  if (sale.discount > 0) {
    row("Desconto", "- " + fmt(sale.discount), 8);
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

  doc.setFont("helvetica", "italic");
  doc.setFontSize(6.5);
  doc.setTextColor(120, 120, 120);
  var extensoLines = doc.splitTextToSize(totalExtenso(total), cW);
  doc.text(extensoLines, cX, y, { align: "center" });
  y += extensoLines.length * 3 + 2;

  doc.setTextColor(60, 60, 60);
  y += 2;
  text("Pagamento: " + payMethodLabel(sale.payMethod), margin, "left", 7.5);
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
  doc.text("Kontaki · Introxeer", cX, y, { align: "center" });

  return doc;
}

// ── IMPRESSÃO HTML ────────────────────────────────────────────────────────────
async function printReciboHTML(saleId) {
  var sale  = await db.get("sales", saleId);
  if (!sale) return;
  var store = (await db.get("settings", "store")) || {};
  var items = sale.items || [];
  var total = (sale.total || 0) - (sale.totalDevolvido || 0);
  var qrDataUrl = await getQrDataUrl(sale.hash || "");
  var skuMap = await getSkuMap();

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
    "  .divider-dash { border: none; border-top: 1px solid #999; margin: 6px 0; }",
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

    sale.operatorName ? "<div class='sm'>Atendido por " + sale.operatorName + "</div>" : "",
    sale.clientName ? "<div class='row'><span class='bold'>Cliente: " + sale.clientName + "</span></div>" : "",
    sale.clientPhone   ? "<div class='sm'>Tel: " + sale.clientPhone + "</div>" : "",
    sale.clientAddress ? "<div class='sm'>" + sale.clientAddress + "</div>" : "",

    "<hr class='divider-dash'/>",

    // Itens
    items.map(function(i) {
      return "<div><div class='bold'>" + i.name + "</div>" +
             (skuMap[i.id] ? "<div class='sm'>Ref: " + skuMap[i.id] + "</div>" : "") +
             "<div class='row sm'><span>" + i.qty + " x " + fmt(i.price) + "</span>" +
             "<span class='bold' style='color:#111'>" + fmt(i.price * i.qty) + "</span></div></div>";
    }).join(""),

    "<hr class='divider-solid'/>",

    sale.discount > 0 ? "<div class='row'><span>Desconto</span><span>- " + fmt(sale.discount) + "</span></div>" : "",

    "<div class='total-box'><span>TOTAL</span><span>" + fmt(total) + "</span></div>",
    "<div style='text-align:center;font-size:8.5px;font-style:italic;color:#888;margin:3px 0 6px'>" + totalExtenso(total) + "</div>",

    "<div class='row sm'>",
    "<span>Pagamento: " + payMethodLabel(sale.payMethod) + "</span>",
    sale.recebido > 0 ? "<span>Recebido: " + fmt(sale.recebido) + "</span>" : "",
    "</div>",
    sale.troco > 0 ? "<div class='row'><span>Troco</span><span class='bold'>" + fmt(sale.troco) + "</span></div>" : "",

    "<hr class='divider-dash'/>",

    qrDataUrl ? "<div class='center'><img src='" + qrDataUrl + "' style='width:90px;height:90px;margin:4px auto'/></div>" : "",

    "<div class='hash'>" + (sale.hash||"") + "</div>",

    "<div class='center sm'>",
    "<div>Documento de gestão interna</div>",
    "<div>Sem validade fiscal perante a AGT</div>",
    "<div style='margin-top:4px;color:#5b21b6;font-weight:bold'>Kontaki · Introxeer</div>",
    "</div>",

    "<br/><br/>",
    "</body></html>"
  ].join("\n");

  var win = window.open("", "_blank", "width=400,height=600");
  if (!win) { toast("Permite pop-ups para imprimir.", "error"); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(function() { win.print(); }, 500);
}

function loadImageEl(src) {
  return new Promise(function(resolve, reject) {
    var img = new Image();
    img.onload  = function(){ resolve(img); };
    img.onerror = reject;
    img.src = src;
  });
}

// ── PNG (partilha via WhatsApp) ────────────────────────────────────────────────
async function buildReciboPNG(sale, store) {
  var items = sale.items || [];
  var total = (sale.total || 0) - (sale.totalDevolvido || 0);
  var skuMap = await getSkuMap();
  var W = 600, pad = 28, cX = W / 2;

  // Canvas de trabalho com altura generosa; será recortado no final
  var estH = 700 + items.length * 46;
  var canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = estH;
  var ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, estH);

  var y = pad + 10;

  function center(str, size, bold, color) {
    ctx.fillStyle = color || "#111827";
    ctx.font = (bold ? "bold " : "") + size + "px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText(str, cX, y);
    y += size * 1.5;
  }
  function row(left, right, size, bold, color) {
    ctx.fillStyle = color || "#374151";
    ctx.font = (bold ? "bold " : "") + size + "px 'Courier New', monospace";
    ctx.textAlign = "left";
    ctx.fillText(left, pad, y);
    if (right) { ctx.textAlign = "right"; ctx.fillText(right, W - pad, y); }
    y += size * 1.6;
  }
  function divider() {
    y += 6;
    ctx.strokeStyle = "#e5e7eb"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
    y += 20;
  }

  if (store.logo) {
    try { var logo = await loadImageEl(store.logo); var ls = 64;
      ctx.drawImage(logo, cX - ls/2, y, ls, ls); y += ls + 26;
    } catch(e) {}
  }

  center(store.name || "Kontaki", 20, true);
  if (store.address) center(store.address, 12, false, "#6b7280");
  if (store.phone)   center(store.phone,   12, false, "#6b7280");
  if (store.nif)     center("NIF: " + store.nif, 12, false, "#6b7280");

  divider();

  row("Recibo Nº " + String(sale.id).padStart(6,"0"), fmtDate(sale.date), 13, true);
  if (sale.operatorName) row("Atendido por " + sale.operatorName, "", 11, false, "#9ca3af");
  if (sale.clientName) {
    row("Cliente: " + sale.clientName, "", 13, true);
    if (sale.clientPhone)   row("Tel: " + sale.clientPhone, "", 12, false, "#6b7280");
    if (sale.clientAddress) row(sale.clientAddress, "", 12, false, "#6b7280");
  }

  divider();

  items.forEach(function(i) {
    row(i.name, "", 14, true);
    if (skuMap[i.id]) row("Ref: " + skuMap[i.id], "", 11, false, "#9ca3af");
    row(i.qty + " x " + fmt(i.price), fmt(i.price * i.qty), 12.5, false, "#6b7280");
    y += 4;
  });

  divider();

  if (sale.discount > 0) row("Desconto", "- " + fmt(sale.discount), 13);

  y += 4;
  ctx.fillStyle = "#5b21b6";
  ctx.fillRect(pad, y - 22, W - pad*2, 46);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 18px 'Courier New', monospace";
  ctx.textAlign = "left";  ctx.fillText("TOTAL", pad + 14, y + 6);
  ctx.textAlign = "right"; ctx.fillText(fmt(total), W - pad - 14, y + 6);
  y += 56;

  row("Pagamento: " + payMethodLabel(sale.payMethod), "", 13);
  if (sale.recebido > 0) row("Recebido", fmt(sale.recebido), 13);
  if (sale.troco > 0)    row("Troco", fmt(sale.troco), 13, true);

  divider();

  var qrDataUrl = await getQrDataUrl(sale.hash || "");
  if (qrDataUrl) {
    try {
      var qrImg = await loadImageEl(qrDataUrl);
      var qs = 140;
      ctx.drawImage(qrImg, cX - qs/2, y, qs, qs);
      y += qs + 26;
    } catch(e) {}
  }
  center(sale.hash || "", 18, true, "#5b21b6");

  y += 6;
  center("Documento de gestão interna", 11, false, "#9ca3af");
  center("Sem validade fiscal perante a AGT", 11, false, "#9ca3af");
  center("Kontaki · Introxeer", 12, true, "#5b21b6");

  var finalCanvas = document.createElement("canvas");
  finalCanvas.width = W;
  finalCanvas.height = y + pad;
  finalCanvas.getContext("2d").drawImage(canvas, 0, 0);
  return finalCanvas;
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
  var canvas = await buildReciboPNG(sale, store);
  if (!canvas) return;

  canvas.toBlob(async function(blob) {
    if (!blob) { toast("Falha ao gerar imagem.", "error"); return; }
    var fname = "recibo_" + String(saleId).padStart(6,"0") + ".png";
    var file  = new File([blob], fname, { type:"image/png" });

    if (navigator.canShare && navigator.canShare({ files:[file] })) {
      try { await navigator.share({ files:[file], title:"Recibo Kontaki" }); return; }
      catch(e) {}
    }

    var url = URL.createObjectURL(blob);
    var a   = document.createElement("a");
    a.href = url; a.download = fname; a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

export { printReciboHTML, payMethodLabel, totalExtenso, getSkuMap };
