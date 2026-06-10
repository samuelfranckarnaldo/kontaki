import { fmt, fmtDate } from "./utils.js";
import { generateQR }   from "./utils.js";

export function printRecibo(sale, store, format) {
  format = format || "58mm";
  const html = buildRecibo(sale, store, format);
  const win  = window.open("","_blank","width=800,height=600");
  win.document.write(
    "<!DOCTYPE html><html><head><meta charset='UTF-8'/>" +
    "<title>Recibo #" + sale.id + "</title>" +
    "<link rel='stylesheet' href='/src/styles/print.css'/>" +
    "</head><body>" +
    "<div id='print-root'>" + html + "</div>" +
    "<script>window.onload=function(){window.print();setTimeout(function(){window.close();},500);}<\/script>" +
    "</body></html>"
  );
  win.document.close();
}

export function buildRecibo(sale, store, format) {
  format = format || "58mm";
  if (format === "a4" || format === "a5") return buildFactura(sale, store, format);
  return buildTalao(sale, store, format);
}

function buildTalao(sale, store, format) {
  const storeName = (store && store.name) || "Kontaki";
  const items     = sale.items || [];
  const currency  = (store && store.currency) || "Kz";

  var rows = items.map(function(i) {
    var total = i.price * i.qty;
    return (
      '<div class="recibo-row">' +
      '<span>' + i.name + ' x' + i.qty + '</span>' +
      '<span>' + fmt(total) + '</span>' +
      '</div>'
    );
  }).join("");

  return (
    '<div class="recibo-' + format + '">' +
    '<div class="recibo-header">' +
    '<h1>' + storeName + '</h1>' +
    ((store && store.address) ? '<p>' + store.address + '</p>' : '') +
    ((store && store.phone)   ? '<p>' + store.phone + '</p>'   : '') +
    '</div>' +
    '<hr class="recibo-divider"/>' +
    '<div class="recibo-row"><span>Recibo Nº</span><span>#' + sale.id + '</span></div>' +
    '<div class="recibo-row"><span>Data</span><span>' + fmtDate(sale.date) + '</span></div>' +
    ((sale.clientName) ? '<div class="recibo-row"><span>Cliente</span><span>' + sale.clientName + '</span></div>' : '') +
    '<hr class="recibo-divider"/>' +
    rows +
    '<hr class="recibo-divider-solid"/>' +
    ((sale.discount > 0)
      ? '<div class="recibo-row"><span>Desconto</span><span>- ' + fmt(sale.discount) + '</span></div>'
      : '') +
    '<div class="recibo-row total"><span>TOTAL</span><span>' + fmt(sale.total) + '</span></div>' +
    '<div class="recibo-row"><span>Pagamento</span><span>' + sale.payMethod + '</span></div>' +
    '<hr class="recibo-divider"/>' +
    '<div class="recibo-qr" id="qr-print-' + sale.id + '"></div>' +
    '<div class="recibo-aviso">Código: <strong>' + (sale.hash || "N/A") + '</strong></div>' +
    '<hr class="recibo-divider"/>' +
    '<div class="recibo-footer">' +
    'Documento de gestão interna.<br/>' +
    'Sem validade fiscal perante a AGT.<br/>' +
    '<strong>Powered by Kontaki · Introxeer Technology</strong>' +
    '</div>' +
    '</div>'
  );
}

function buildFactura(sale, store, format) {
  const storeName = (store && store.name)    || "Kontaki";
  const storeAddr = (store && store.address) || "";
  const storePhone= (store && store.phone)   || "";
  const items     = sale.items || [];

  var tableRows = items.map(function(i) {
    var total = i.price * i.qty;
    return (
      '<tr>' +
      '<td>' + i.name + '</td>' +
      '<td style="text-align:center">' + i.qty + '</td>' +
      '<td style="text-align:right">' + fmt(i.price) + '</td>' +
      '<td style="text-align:right">' + fmt(total) + '</td>' +
      '</tr>'
    );
  }).join("");

  return (
    '<div class="recibo-' + format + '">' +
    '<div class="recibo-header">' +
    '<h1>' + storeName + '</h1>' +
    (storeAddr ? '<p>' + storeAddr + '</p>' : '') +
    (storePhone ? '<p>' + storePhone + '</p>' : '') +
    '</div>' +
    '<hr class="recibo-divider-solid"/>' +
    '<div class="factura-info">' +
    '<div class="factura-info-box"><h3>Documento</h3>' +
    '<div>Nº: <strong>#' + sale.id + '</strong></div>' +
    '<div>Data: <strong>' + fmtDate(sale.date) + '</strong></div>' +
    '<div>Pagamento: <strong>' + sale.payMethod + '</strong></div>' +
    '</div>' +
    '<div class="factura-info-box"><h3>Cliente</h3>' +
    '<div>' + (sale.clientName || "—") + '</div>' +
    (sale.clientPhone ? '<div>' + sale.clientPhone + '</div>' : '') +
    '</div>' +
    '</div>' +
    '<table>' +
    '<thead><tr><th>Produto</th><th style="text-align:center">Qtd</th><th style="text-align:right">Preço</th><th style="text-align:right">Total</th></tr></thead>' +
    '<tbody>' + tableRows + '</tbody>' +
    '</table>' +
    '<div class="totais-box">' +
    '<div class="row"><span>Subtotal</span><span>' + fmt(sale.subtotal || sale.total) + '</span></div>' +
    (sale.discount > 0 ? '<div class="row"><span>Desconto</span><span>- ' + fmt(sale.discount) + '</span></div>' : '') +
    '<div class="row total"><span>TOTAL</span><span>' + fmt(sale.total) + '</span></div>' +
    '</div>' +
    '<hr class="recibo-divider"/>' +
    '<div class="recibo-footer">' +
    'Código de verificação: <strong>' + (sale.hash || "N/A") + '</strong><br/>' +
    'Documento de gestão interna · Sem validade fiscal perante a AGT<br/>' +
    '<strong>Powered by Kontaki · Introxeer Technology</strong>' +
    '</div>' +
    '</div>'
  );
}
