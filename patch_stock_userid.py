import pathlib

f = pathlib.Path.home() / "kontaki" / "src" / "components" / "historico.js"
src = f.read_text(encoding="utf-8")

def replace_once(s, old, new, label):
    n = s.count(old)
    if n != 1:
        raise SystemExit(f"[ABORTADO] '{label}' encontrado {n}x (esperado 1x). Nada foi alterado.")
    return s.replace(old, new)

old1 = '''  var movements = await db.getAll("stockMovements");
  var filtered  = movements.filter(function(m) {
    var d = toLocalDateStr(m.createdAt);
    return d >= from && d <= to;
  });'''
new1 = '''  var movements = await db.getAll("stockMovements");
  var users     = await db.getAll("users");
  var usersById = {};
  users.forEach(function(u){ usersById[u.id] = u; });

  var filtered  = movements.filter(function(m) {
    var d = toLocalDateStr(m.createdAt);
    return d >= from && d <= to;
  });'''
src = replace_once(src, old1, new1, "carregar users em loadStock")

old2 = '''        var sign  = m.qty > 0 ? "+" : "";
        return '<div class="hist-mov-item">' +
          '<div class="hist-mov-icon" style="background:' + bg + ';color:' + color + '">' + sign + m.qty + '</div>' +
          '<div style="flex:1">' +
          '<div class="hist-mov-name">' + m.productName + '</div>' +
          '<div class="hist-mov-meta">' + label + ' · ' + fmtDate(m.createdAt) + '</div>' +
          '</div>' +'''
new2 = '''        var sign  = m.qty > 0 ? "+" : "";
        var autor = (m.userId != null && usersById[m.userId]) ? usersById[m.userId].name : "Desconhecido";
        return '<div class="hist-mov-item">' +
          '<div class="hist-mov-icon" style="background:' + bg + ';color:' + color + '">' + sign + m.qty + '</div>' +
          '<div style="flex:1">' +
          '<div class="hist-mov-name">' + m.productName + '</div>' +
          '<div class="hist-mov-meta">' + label + ' · ' + fmtDate(m.createdAt) + ' · <strong>' + autor + '</strong></div>' +
          '</div>' +'''
src = replace_once(src, old2, new2, "mostrar autor na linha de metadados")

f.write_text(src, encoding="utf-8")
print("OK — historico.js: movimentos de stock agora mostram quem fez cada ajuste/transferência.")
