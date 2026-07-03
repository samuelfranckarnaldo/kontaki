const DB_NAME    = "kontaki_db";
const DB_VERSION = 12;
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
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror   = () => reject(req.error);
  });
}

function dba(store, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
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
  // Gera chave HMAC se nao existir
  const sk = await db.get("settings","storeKey");
  if (!sk) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const key = Array.from(bytes).map(b=>b.toString(16).padStart(2,"0")).join("");
    await db.put("settings",{ key:"storeKey", value:key, createdAt:new Date().toISOString(), distributed:false });
  }
}

export async function isFirstTime() {
  const users = await db.getAll("users");
  return users.length === 0;
}
