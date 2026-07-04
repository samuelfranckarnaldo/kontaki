import pathlib

f = pathlib.Path.home() / "kontaki" / "src" / "auth.js"
src = f.read_text(encoding="utf-8")

def replace_once(old, new, label):
    global src
    n = src.count(old)
    if n != 1:
        raise SystemExit(f"[ABORTADO] '{label}' encontrado {n}x (esperado 1x). Nada foi alterado.")
    src = src.replace(old, new)

# A) login deixa de criar sessão — só reconecta a um turno já aberto (ou nenhum)
old_a = '''    currentUser = _selectedUser;

    const session = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      userId: currentUser.id,
      userName: currentUser.name,
      openedAt: new Date().toISOString(),
      status: "open",
      vendas: [],
      fiados: [],
      incidentes: [],
    };

    await db.add("sessions", session);
    currentSession = session;
    currentUser.sessionId = session.id;

    localStorage.setItem("kontaki_session", JSON.stringify({
      userId: currentUser.id,
      sessionId: session.id
    }));'''

new_a = '''    currentUser = _selectedUser;
    currentSession = null;
    currentUser.sessionId = null;

    // Login só autentica. Não cria turno — abrir turno é sempre acção manual em "Meu Turno".
    // Se já houver um turno aberto (legítimo, com uuid), reconecta a ele.
    try {
      const sessions = await db.getAll("sessions");

      // Migração: fecha sessões antigas criadas pelo próprio login (formato legado, sem uuid)
      const legacyOpen = sessions.filter(s => s.status === "open" && s.userId === currentUser.id && !s.uuid);
      for (const ls of legacyOpen) {
        await db.put("sessions", Object.assign({}, ls, {
          status: "closed",
          closedAt: new Date().toISOString(),
          note: (ls.note || "") + " [auto-fechado: sessão legada criada no login]"
        }));
      }

      const openSession = sessions
        .filter(s => s.status === "open" && s.userId === currentUser.id && s.uuid)
        .sort((a, b) => b.id - a.id)[0];
      if (openSession) {
        currentSession = openSession;
        currentUser.sessionId = openSession.id;
      }
    } catch (e) {
      console.error("Erro ao procurar/limpar turnos no login:", e);
    }

    localStorage.setItem("kontaki_session", JSON.stringify({
      userId: currentUser.id,
      sessionId: currentUser.sessionId || null
    }));'''

replace_once(old_a, new_a, "criação de sessão no login")

# B) restoreSession só restaura turnos válidos (com uuid), nunca legado
old_b = '''    const sessions = await db.getAll("sessions");
    const session = sessions.find(s => s.id === data.sessionId && s.status === "open");
    if (!session) { localStorage.removeItem("kontaki_session"); return false; }'''

new_b = '''    const sessions = await db.getAll("sessions");
    const session = sessions.find(s => s.id === data.sessionId && s.status === "open" && s.uuid);
    if (!session) { localStorage.removeItem("kontaki_session"); return false; }'''

replace_once(old_b, new_b, "restoreSession — exigir uuid válido")

f.write_text(src, encoding="utf-8")
print("OK — auth.js: login deixou de criar turnos; reconecta a turnos abertos válidos e limpa legado.")
