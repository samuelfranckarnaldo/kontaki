import { db } from "../db.js";
import { fmt, fmtDate } from "../utils.js";
import { payMethodLabel, totalExtenso, getSkuMap } from "./recibo-pdf.js";

// ---------- Constantes ESC/POS ----------
const ESC = 0x1b;
const GS  = 0x1d;
const LF  = 0x0a;

// Font A num rolo de 80mm (576 dots / 12 dots por char) = 48 colunas.
// Se o papel/impressora real usar outra largura, ajustar aqui.
const CHARS_PER_LINE = 48;

// ---------- Helpers de baixo nível ----------
function pushBytes(arr) {
  for (var i = 1; i < arguments.length; i++) arr.push(arguments[i]);
}

function semAcentos(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/·/g, "-");
}

function pushText(arr, str) {
  var limpo = semAcentos(str);
  for (var i = 0; i < limpo.length; i++) {
    var code = limpo.charCodeAt(i);
    arr.push(code > 255 ? 63 : code);
  }
}

function pushLine(arr, str) {
  pushText(arr, str);
  arr.push(LF);
}

function align(arr, pos) {
  pushBytes(arr, ESC, 0x61, pos);
}

function bold(arr, on) {
  pushBytes(arr, ESC, 0x45, on ? 1 : 0);
}

function tamanho(arr, mult) {
  pushBytes(arr, GS, 0x21, mult);
}

function feed(arr, n) {
  for (var i = 0; i < (n || 1); i++) arr.push(LF);
}

function corte(arr) {
  feed(arr, 3);
  pushBytes(arr, GS, 0x56, 0x01);
}

function pushRow(arr, esquerda, direita) {
  var e = semAcentos(esquerda);
  var d = semAcentos(direita);
  var espacos = CHARS_PER_LINE - e.length - d.length;
  if (espacos < 1) espacos = 1;
  pushLine(arr, e + " ".repeat(espacos) + d);
}

function pushDivisor(arr, ch) {
  pushLine(arr, (ch || "-").repeat(CHARS_PER_LINE));
}

function pushQr(arr, data, moduleSize, ecLevel) {
  var texto = String(data || "");
  if (!texto) return;
  var size = moduleSize || 6;
  var ec = ecLevel || 49;

  pushBytes(arr, GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
  pushBytes(arr, GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, size);
  pushBytes(arr, GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, ec);
  var len = texto.length + 3;
  var pL = len & 0xff;
  var pH = (len >> 8) & 0xff;
  pushBytes(arr, GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30);
  pushText(arr, texto);
  pushBytes(arr, GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
}

export async function buildEscPosBytes(saleId) {
  var sale = await db.get("sales", saleId);
  if (!sale) return null;
  var store = (await db.get("settings", "store")) || {};
  var items = sale.items || [];
  var total = (sale.total || 0) - (sale.totalDevolvido || 0);
  var skuMap = await getSkuMap();

  var b = [];
  pushBytes(b, ESC, 0x40);

  align(b, 1);
  bold(b, true);
  tamanho(b, 0x11);
  pushLine(b, store.name || "Kontaki");
  tamanho(b, 0x00);
  bold(b, false);
  if (store.address) pushLine(b, store.address);
  if (store.phone) pushLine(b, store.phone);
  if (store.nif) pushLine(b, "NIF: " + store.nif);

  align(b, 0);
  pushDivisor(b, "-");

  bold(b, true);
  pushRow(b, "Recibo No " + String(sale.id).padStart(6, "0"), fmtDate(sale.date));
  bold(b, false);

  if (sale.operatorName) pushLine(b, "Atendido por " + sale.operatorName);
  if (sale.clientName) {
    bold(b, true);
    pushLine(b, "Cliente: " + sale.clientName);
    bold(b, false);
  }
  if (sale.clientPhone) pushLine(b, "Tel: " + sale.clientPhone);
  if (sale.clientAddress) pushLine(b, sale.clientAddress);

  pushDivisor(b, "-");

  items.forEach(function (i) {
    bold(b, true);
    pushLine(b, i.name);
    bold(b, false);
    if (skuMap[i.id]) pushLine(b, "Ref: " + skuMap[i.id]);
    pushRow(b, i.qty + " x " + fmt(i.price), fmt(i.price * i.qty));
  });

  pushDivisor(b, "=");

  if (sale.discount > 0) pushRow(b, "Desconto", "- " + fmt(sale.discount));

  bold(b, true);
  tamanho(b, 0x01);
  pushRow(b, "TOTAL", fmt(total));
  tamanho(b, 0x00);
  bold(b, false);

  align(b, 1);
  pushLine(b, totalExtenso(total));
  align(b, 0);

  pushRow(
    b,
    "Pagamento: " + payMethodLabel(sale.payMethod),
    sale.recebido > 0 ? "Receb: " + fmt(sale.recebido) : ""
  );
  if (sale.troco > 0) {
    bold(b, true);
    pushRow(b, "Troco", fmt(sale.troco));
    bold(b, false);
  }

  pushDivisor(b, "-");

  if (sale.hash) {
    align(b, 1);
    pushQr(b, sale.hash);
    feed(b, 1);
    bold(b, true);
    pushLine(b, sale.hash);
    bold(b, false);
  }

  align(b, 1);
  pushLine(b, "Documento de gestao interna");
  pushLine(b, "Sem validade fiscal perante a AGT");
  pushLine(b, "Kontaki - Introxeer");

  corte(b);

  return Uint8Array.from(b);
}

export function previewEscPos(bytes) {
  var out = "";
  var i = 0;
  while (i < bytes.length) {
    var c = bytes[i];
    if (c === LF) { out += "\n"; i += 1; continue; }
    if (c === ESC) {
      var op = bytes[i + 1];
      if (op === 0x40) { i += 2; continue; }   // ESC @ (init, 2 bytes)
      if (op === 0x61) { i += 3; continue; }   // ESC a n (align, 3 bytes)
      if (op === 0x45) { i += 3; continue; }   // ESC E n (bold, 3 bytes)
      i += 2;
      continue;
    }
    if (c === GS) {
      var op2 = bytes[i + 1];
      if (op2 === 0x28 && bytes[i + 2] === 0x6b) {
        var pL = bytes[i + 3];
        var pH = bytes[i + 4];
        var dataLen = pL + pH * 256;
        i += 5 + dataLen;
        continue;
      }
      if (op2 === 0x21) { i += 3; continue; }  // GS ! n (tamanho, 3 bytes)
      if (op2 === 0x56) { i += 3; continue; }  // GS V m (corte, 3 bytes)
      i += 2;
      continue;
    }
    if (c >= 32 && c <= 126) out += String.fromCharCode(c);
    i += 1;
  }
  return out;
}
