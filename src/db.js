const DB_NAME    = "kontaki_db";
const DB_VERSION = 6;
let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db  = e.target.result;
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
      ensure("logs",            { keyPath:"id", autoIncrement:true }, [["date",false],["level",false],["userId",false]]);
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
  // Chave HMAC — só gera se não existir
  const sk = await db.get("settings","storeKey");
  if (!sk) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const key = Array.from(bytes).map(b=>b.toString(16).padStart(2,"0")).join("");
    await db.put("settings",{
      key:"storeKey", value:key,
      createdAt:new Date().toISOString(),
      distributed:false,
    });
  }

  const store = await db.get("settings","store");
  if (!store) {
    await db.put("settings",{
      key:"store",
      id:"loja-" + Date.now(),
      name:"Mercearia Kontaki",
      address:"Bairro Popular, Luanda",
      phone:"923 000 000",
    });
  }

  const users = await db.getAll("users");
  if (!users.length) {
    await db.add("users",{ username:"admin",  password:"admin123", role:"admin", name:"Administrador",  active:true, createdAt:new Date().toISOString() });
    await db.add("users",{ username:"caixa1", password:"caixa123", role:"caixa", name:"Operador Caixa", active:true, createdAt:new Date().toISOString() });
  }

  const products = await db.getAll("products");
  if (!products.length) {
    const items = [
      { name:"Arroz 5kg",      barcode:"1001", price:2500, costPrice:1800, minStock:10, category:"Alimentação", unit:"saco",    stock:50,  wh:100 },
      { name:"Óleo 1L",        barcode:"1002", price:1200, costPrice:900,  minStock:5,  category:"Alimentação", unit:"litro",   stock:30,  wh:60  },
      { name:"Açúcar 1kg",     barcode:"1003", price:800,  costPrice:600,  minStock:8,  category:"Alimentação", unit:"kg",      stock:40,  wh:80  },
      { name:"Cerveja 33cl",   barcode:"1004", price:350,  costPrice:250,  minStock:20, category:"Bebidas",     unit:"unid",    stock:120, wh:240 },
      { name:"Água 1.5L",      barcode:"1005", price:200,  costPrice:120,  minStock:15, category:"Bebidas",     unit:"garrafa", stock:80,  wh:160 },
      { name:"Sabão em Barra", barcode:"1006", price:150,  costPrice:90,   minStock:10, category:"Higiene",     unit:"barra",   stock:60,  wh:120 },
    ];
    for (const item of items) {
      const pid = await db.add("products",{
        name:item.name, barcode:item.barcode, price:item.price,
        costPrice:item.costPrice, minStock:item.minStock,
        category:item.category, unit:item.unit, active:true,
        stock:item.stock, warehouseStock:item.wh,
        createdAt:new Date().toISOString(),
      });
      await db.add("stockMovements",{
        productId:pid, productName:item.name, type:"purchase",
        location:"shop", qty:item.stock, qtyBefore:0, qtyAfter:item.stock,
        reference:"seed", userId:1, sessionId:null,
        imported:false,
        note:"Stock inicial loja", createdAt:new Date().toISOString(),
      });
      await db.add("stockMovements",{
        productId:pid, productName:item.name, type:"purchase",
        location:"warehouse", qty:item.wh, qtyBefore:0, qtyAfter:item.wh,
        reference:"seed", userId:1, sessionId:null,
        imported:false,
        note:"Stock inicial armazém", createdAt:new Date().toISOString(),
      });
    }
  }
}
