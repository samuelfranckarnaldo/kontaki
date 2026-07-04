import pathlib

f = pathlib.Path.home() / "kontaki" / "src" / "components" / "turno.js"
src = f.read_text(encoding="utf-8")

def replace_once(old, new, label):
    global src
    n = src.count(old)
    if n != 1:
        raise SystemExit(f"[ABORTADO] '{label}' encontrado {n}x (esperado 1x). Nada foi alterado.")
    src = src.replace(old, new)

# 1) calcular dinheiro esperado logo a seguir aos incidentes da sessão
old1 = '''  var incidents    = await db.getAll("incidents");
  var sessionInc   = incidents.filter(function(i){ return i.sessionId===session.id; });'''
new1 = old1 + '''

  var cashEsperado = sessionSales.filter(function(s){ return s.payMethod==="dinheiro"; })
    .reduce(function(a,s){ return a+(s.total||0); },0);
  var cashHtml =
    '<div style="background:#fff;border:1.5px solid #ddd6fe;border-radius:12px;padding:14px;margin-bottom:14px">' +
      '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">Conferência de caixa (dinheiro)</div>' +
      '<div style="margin-bottom:10px">' +
        '<div style="font-size:11px;color:#71717a">Esperado em caixa</div>' +
        '<div style="font-size:18px;font-weight:800;color:#18181b">' + fmt(cashEsperado) + '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px">' +
        '<label style="font-size:12px;color:#71717a;flex-shrink:0">Dinheiro contado:</label>' +
        '<input type="number" id="cash-conf-input" min="0" step="1" value="' + cashEsperado + '" ' +
        'style="flex:1;padding:9px;border:1.5px solid #ddd6fe;border-radius:8px;text-align:center;font-size:15px;font-weight:700;font-family:inherit"/>' +
      '</div>' +
      '<div style="font-size:10px;color:#a1a1aa;margin-top:8px;line-height:1.4">Conta o dinheiro físico na gaveta e ajusta o valor acima. Vendas por Multicaixa/transferência não entram nesta contagem.</div>' +
    '</div>';'''
replace_once(old1, new1, "cálculo cashEsperado")

# 2) inserir cashHtml no modal de fecho, antes da secção de stock
old2 = '''    '</div></div>' +
    '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Confirma o stock encontrado fisicamente:</div>' +'''
new2 = '''    '</div></div>' +
    cashHtml +
    '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Confirma o stock encontrado fisicamente:</div>' +'''
replace_once(old2, new2, "inserir cashHtml no modal")

# 3) ler contagem de caixa no início de _confirmarFecho
old3 = '''  var contagens = {};
  products.forEach(function(p){
    var inp = document.getElementById("stock-conf-"+p.id);
    contagens[p.id] = inp ? parseInt(inp.value)||0 : p.stock;
  });

  try {
    // Fecha sessão
    await sessionService.closeSession(session.id);

    // Limpar sessão no auth
    var authMod = await import("../auth.js");
    if (authMod._setSession) authMod._setSession(null);'''
new3 = '''  var contagens = {};
  products.forEach(function(p){
    var inp = document.getElementById("stock-conf-"+p.id);
    contagens[p.id] = inp ? parseInt(inp.value)||0 : p.stock;
  });

  var cashInput    = document.getElementById("cash-conf-input");
  var allSales     = await db.getAll("sales");
  var sessSalesNow = allSales.filter(function(s){ return s.sessionId===session.id; });
  var cashEsperado = sessSalesNow.filter(function(s){ return s.payMethod==="dinheiro"; })
    .reduce(function(a,s){ return a+(s.total||0); },0);
  var cashContado  = cashInput ? (parseFloat(cashInput.value)||0) : cashEsperado;
  var cashDiff     = cashContado - cashEsperado;

  try {
    // Fecha sessão
    await sessionService.closeSession(session.id);

    // Limpar sessão no auth
    var authMod = await import("../auth.js");
    if (authMod._setSession) authMod._setSession(null);

    // Regista conferência de caixa na sessão
    var closedSessionRec = await db.get("sessions", session.id);
    if (closedSessionRec) {
      await db.put("sessions", Object.assign({}, closedSessionRec, {
        cashExpected: cashEsperado, cashCounted: cashContado, cashDiff: cashDiff
      }));
    }

    // Gera incidente se houver diferença de caixa
    if (cashDiff !== 0) {
      await db.add("incidents",{
        productId:null, productName:"Numerário (Caixa)",
        expected:cashEsperado, found:cashContado, diff:cashDiff,
        sessionId:session.id, responsibleSessionId:null,
        foundBy:user.id, responsible:null,
        status:"open", type:"caixa",
        note:"Diferença de caixa no fecho de turno",
        createdAt:new Date().toISOString(),
      });
    }'''
replace_once(old3, new3, "leitura e reconciliação de caixa em _confirmarFecho")

# 4) aviso de diferença de caixa no modal de sucesso
old4 = '''      (incCount>0?'<div style="background:#fee2e2;border-radius:8px;padding:8px 12px;font-size:12px;color:#dc2626;margin-top:6px">⚠ '+incCount+' incidente(s) gerado(s) por diferença de stock.</div>':"") +'''
new4 = old4 + '''
      (cashDiff!==0?'<div style="background:#fee2e2;border-radius:8px;padding:8px 12px;font-size:12px;color:#dc2626;margin-top:6px">⚠ Diferença de caixa: '+(cashDiff>0?"+":"")+fmt(cashDiff)+'.</div>':"") +'''
replace_once(old4, new4, "aviso de caixa no modal de sucesso")

f.write_text(src, encoding="utf-8")
print("OK — turno.js actualizado com reconciliação de caixa.")
