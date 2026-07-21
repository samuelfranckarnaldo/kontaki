const DB_NAME    = "kontaki_db";
const DB_VERSION = 20; // v20: adiciona store "syncQueue" para sincronizacao incremental com o Console
let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      const ensure = (name, opts, indexes = []) => {
        if (db.objectStoreNames.contains(name)) return;
        const s = db.createObjectStore(name, opts);
        indexes.forEach(([k, u]) => s.createIndex(k, k, { unique:!!u }));
      };
      ensure("users",            { keyPath:"id", autoIncrement:true }, [["username",true]]);
      ensure("products",         { keyPath:"id", autoIncrement:true }, [["barcode",false]]);
      ensure("sales",            { keyPath:"id", autoIncrement:true }, [["date",false],["sessionId",false]]);
      ensure("saleItems",        { keyPath:"id", autoIncrement:true }, [["saleId",false],["productId",false]]);
      ensure("fiado",            { keyPath:"id", autoIncrement:true }, [["clientName",false],["sessionId",false]]);
      ensure("incidents",        { keyPath:"id", autoIncrement:true }, [["productId",false],["sessionId",false],["status",false]]);
      ensure("settings",         { keyPath:"key" });
      ensure("suppliers",        { keyPath:"id", autoIncrement:true });
      ensure("purchases",        { keyPath:"id", autoIncrement:true });
      ensure("sessions",         { keyPath:"id", autoIncrement:true }, [["uuid",false],["userId",false],["status",false]]);
      ensure("stockMovements",   { keyPath:"id", autoIncrement:true }, [["productId",false],["sessionId",false],["type",false],["createdAt",false],["imported",false]]);
      ensure("sessionTransfers", { keyPath:"id", autoIncrement:true }, [["fromSessionUuid",false],["status",false]]);
      ensure("logs",             { keyPath:"id", autoIncrement:true }, [["date",false],["level",false],["userId",false]]);
      ensure("accountingArchive",{ keyPath:"period" });
      ensure("clients",          { keyPath:"id", autoIncrement:true }, [["name",false],["phone",false]]);
      ensure("expenses",         { keyPath:"id", autoIncrement:true }, [["date",false],["category",false]]);
      ensure("ktkImports",       { keyPath:"id", autoIncrement:true }, [["sessionUuid",false],["status",false],["importedAt",false]]);
      ensure("stockDecisions",   { keyPath:"id", autoIncrement:true }, [["productId",false],["decidedAt",false]]);
      ensure("stockCorrections", { keyPath:"id", autoIncrement:true }, [["importId",false],["productId",false],["correctedAt",false]]);
      ensure("loginAttempts",    { keyPath:"userId" });
      ensure("auditLog",         { keyPath:"id", autoIncrement:true }, [["entityType",false],["entityId",false],["userId",false],["createdAt",false]]);
      ensure("pendingSales",     { keyPath:"id", autoIncrement:true }, [["createdAt",false],["sessionId",false],["status",false]]);
      ensure("recoveryCodes",      { keyPath:"id", autoIncrement:true }, [["userId",false],["hash",false],["usedAt",false]]);
      ensure("recoveryBackupState",{ keyPath:"key" }); // { key:"state", version, pending, lastSync }
      ensure("chartOfAccounts", { keyPath:"code" }); // plano de contas PGC (classes 1-8), semeado por seedChartOfAccounts()
      ensure("journalEntries",  { keyPath:"id", autoIncrement:true },
        [["date",false],["sourceType",false],["sourceId",false]]); // lançamentos de partidas dobradas
      ensure("treasuryMovements", { keyPath:"id", autoIncrement:true },
        [["type",false],["date",false],["sessionId",false],["createdAt",false]]);
        // { id, type, date, amount, description, origem (null|"caixa"|"cofre"|"banco"|"proprietario"),
        //   sessionId, userId, journalEntryId (null se nao gerar lancamento), createdAt }

      ensure("syncQueue", { keyPath:"id", autoIncrement:true },
        [["entityType",false],["syncedAt",false],["createdAt",false]]);
        // { id, entityType ("sales"|"expenses"|...), localId, action ("create"|"update"|"delete"),
        //   payload, createdAt, syncedAt (null ate ser confirmado pelo Console) }
    };
    req.onsuccess = () => {
      _db = req.result;
      _db.onclose = () => { _db = null; };
      _db.onversionchange = () => {
        try { _db.close(); } catch (e) {}
        _db = null;
      };
      resolve(_db);
    };
    req.onerror   = () => reject(req.error);
    req.onblocked = () => {
      console.warn("IndexedDB: abertura bloqueada — outra aba pode estar a usar uma versão antiga.");
      // Sem isto a Promise ficava pendente para sempre se o bloqueio nao se
      // resolvesse sozinho (ex: outra aba/instancia a fechar a ligacao antiga
      // devagar). Da um tempo razoavel para resolver e so rejeita se persistir,
      // para quem chamou poder recuperar (retry) em vez de ficar preso.
      setTimeout(() => {
        if (!_db) reject(new Error("IndexedDB continua bloqueado — fecha outras abas do Kontaki e tenta novamente."));
      }, 4000);
    };
  });
}

export async function getAllStoreNames() {
  const database = await openDB();
  return Array.from(database.objectStoreNames);
}

function dba(store, mode, fn, _isRetry) {
  return openDB().then(db => new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(store, mode);
    } catch (err) {
      // Ligação morta (fechada pelo browser em background) — descarta e tenta reabrir, uma vez.
      _db = null;
      if (_isRetry) { reject(err); return; }
      dba(store, mode, fn, true).then(resolve, reject);
      return;
    }
    tx.onerror = () => reject(tx.error);
    fn(tx.objectStore(store), resolve, reject);
  }));
}

export const db = {
  get:        (s,k)       => dba(s,"readonly",  (st,r)=>{ const q=st.get(k);           q.onsuccess=()=>r(q.result); }),
  getAll:     (s)         => dba(s,"readonly",  (st,r)=>{ const q=st.getAll();          q.onsuccess=()=>r(q.result); }),
  add:        (s,d)       => dba(s,"readwrite", (st,r)=>{ const q=st.add(d);            q.onsuccess=()=>r(q.result); }),
  put:        (s,d)       => dba(s,"readwrite", (st,r)=>{ const q=st.put(d);            q.onsuccess=()=>r(q.result); }),
  delete:     (s,k)       => dba(s,"readwrite", (st,r)=>{ const q=st.delete(k);         q.onsuccess=()=>r(q.result); }),
  getByIndex: (s,idx,val) => dba(s,"readonly",  (st,r)=>{ const q=st.index(idx).getAll(val); q.onsuccess=()=>r(q.result); }),
};

export async function seed() {
  const sk = await db.get("settings","storeKey");
  if (!sk) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const key = Array.from(bytes).map(b=>b.toString(16).padStart(2,"0")).join("");
    await db.put("settings",{ key:"storeKey", value:key, createdAt:new Date().toISOString(), distributed:false });
  }

  // storeId: identificador PÚBLICO e permanente da loja, distinto do storeKey
  // (que é secreto, usado só para assinar hashes locais e nunca sai do dispositivo).
  // Enviado ao Console para identificar a loja em sincronizações e relatórios.
  const sid = await db.get("settings","storeId");
  if (!sid) {
    const uuid = (crypto.randomUUID) ? crypto.randomUUID() : _uuidFallback();
    await db.put("settings",{ key:"storeId", value:uuid, createdAt:new Date().toISOString() });
  }
}

function _uuidFallback() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    var v = c === "x" ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export async function isFirstTime() {
  const users = await db.getAll("users");
  return users.length === 0;
}
