import { db } from "./db.js";
import { getUser } from "./auth.js";

export function generateUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6]=(b[6]&0x0f)|0x40; b[8]=(b[8]&0x3f)|0x80;
  const h=Array.from(b).map(x=>x.toString(16).padStart(2,"0")).join("");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

async function getHmacKey() {
  const s=await db.get("settings","storeKey");
  if(!(s&&s.value)) throw new Error("Chave HMAC não configurada.");
  const bytes=new Uint8Array(s.value.match(/.{2}/g).map(b=>parseInt(b,16)));
  return crypto.subtle.importKey("raw",bytes,{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
}

export async function hmacSha256(message) {
  const key=await getHmacKey();
  const buf=new TextEncoder().encode(message);
  const sig=await crypto.subtle.sign("HMAC",key,buf);
  return Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

export async function generateKtkHash(ktk) {
  const payload=JSON.stringify({
    versao:ktk.versao, id_sessao:ktk.id_sessao,
    loja_id:ktk.loja_id, loja_nome:ktk.loja_nome,
    funcionario_id:ktk.funcionario_id,
    data_abertura:ktk.data_abertura, data_fecho:ktk.data_fecho,
    total_vendas:ktk.total_vendas, n_vendas:ktk.n_vendas,
    vendas:(ktk.vendas||[]).map(v=>({id:v.id,total:v.total,date:v.date})),
    stock_esperado:ktk.stock_esperado,
    stock_movements:(ktk.stock_movements||[]).map(m=>({type:m.type,productId:m.productId,qty:m.qty,createdAt:m.createdAt})),
  });
  return hmacSha256(payload);
}

export async function validateKtkHash(ktk) {
  if(!ktk.hash) return {valid:false,reason:"sem_hash",legacy:false};
  if(ktk.versao==="1.0") return {valid:true,reason:"hash_legado",legacy:true};
  try {
    const expected=await generateKtkHash(ktk);
    return expected===ktk.hash ? {valid:true,reason:"ok",legacy:false} : {valid:false,reason:"hash_invalido",legacy:false};
  } catch { return {valid:false,reason:"chave_em_falta",legacy:false}; }
}

export async function generateKtkcatHash(cat) {
  const payload=JSON.stringify({
    versao:cat.versao, loja_id:cat.loja_id, loja_nome:cat.loja_nome,
    produtos:(cat.produtos||[]).map(p=>({catalogId:p.catalogId,name:p.name,price:p.price})),
  });
  return hmacSha256(payload);
}

export async function validateKtkcatHash(cat) {
  if(!cat.hash) return {valid:false,reason:"sem_hash",legacy:false};
  try {
    const expected=await generateKtkcatHash(cat);
    return expected===cat.hash ? {valid:true,reason:"ok",legacy:false} : {valid:false,reason:"hash_invalido",legacy:false};
  } catch { return {valid:false,reason:"chave_em_falta",legacy:false}; }
}

async function deriveKey(password) {
  const pw=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey(
    {name:"PBKDF2",salt:new TextEncoder().encode("kontaki-salt-v1"),iterations:100000,hash:"SHA-256"},
    pw, {name:"AES-GCM",length:256}, false, ["encrypt","decrypt"]
  );
}

export const storeKeyService = {
  async export(password) {
    const s=await db.get("settings","storeKey");
    if(!(s&&s.value)) throw new Error("Chave não encontrada.");
    const pwKey=await deriveKey(password);
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},pwKey,new TextEncoder().encode(s.value));
    return JSON.stringify({
      versao:"1.0",
      iv:Array.from(iv).map(b=>b.toString(16).padStart(2,"0")).join(""),
      cipher:Array.from(new Uint8Array(cipher)).map(b=>b.toString(16).padStart(2,"0")).join(""),
      createdAt:new Date().toISOString(),
    });
  },
  async import(exportedJson, password) {
    let payload;
    try { payload=JSON.parse(exportedJson); } catch { throw new Error("Formato inválido."); }
    const iv=new Uint8Array(payload.iv.match(/.{2}/g).map(b=>parseInt(b,16)));
    const cipher=new Uint8Array(payload.cipher.match(/.{2}/g).map(b=>parseInt(b,16)));
    let keyBuf;
    try { keyBuf=await crypto.subtle.decrypt({name:"AES-GCM",iv},await deriveKey(password),cipher); }
    catch { throw new Error("Senha incorrecta ou ficheiro corrompido."); }
    await db.put("settings",{key:"storeKey",value:new TextDecoder().decode(keyBuf),createdAt:new Date().toISOString(),distributed:true,importedAt:new Date().toISOString()});
    return true;
  },
};

function requireAuth() {
  const u=getUser(); if(!u) throw new Error("Não autenticado."); return u;
}
function requireRole(role) {
  const u=requireAuth();
  if(role==="admin"&&u.role!=="admin") throw new Error("Permissão negada. Apenas administradores.");
  return u;
}

export async function getStock(productId, location) {
  const m=await db.getAll("stockMovements");
  return m.filter(x=>x.productId===Number(productId)&&x.location===location&&x.imported!==true)
          .reduce((a,x)=>a+(x.qty||0),0);
}

export async function getAllStocks(location) {
  const m=await db.getAll("stockMovements");
  const map={};
  m.filter(x=>x.location===location&&x.imported!==true)
   .forEach(x=>{ map[x.productId]=(map[x.productId]||0)+x.qty; });
  return map;
}

export async function rebuildStock(productId, location) {
  return getStock(productId, location);
}

export async function addStockMovement(data) {
  const user=requireAuth();
  const current=await getStock(data.productId, data.location||"shop");
  const after=current+data.qty;
  const id=await db.add("stockMovements",{
    productId:Number(data.productId), productName:data.productName||"",
    type:data.type, location:data.location||"shop",
    qty:data.qty, qtyBefore:current, qtyAfter:after,
    reference:data.reference||"", note:data.note||"",
    userId:data.userId||user.id,
    sessionId:data.sessionId!==undefined?data.sessionId:(user.sessionId||null),
    imported:false,
    createdAt:data.createdAt||new Date().toISOString(),
  });
  const product=await db.get("products",Number(data.productId));
  if(product) {
    const shop=await getStock(data.productId,"shop");
    const wh=await getStock(data.productId,"warehouse");
    await db.put("products",{...product,stock:shop,warehouseStock:wh,updatedAt:new Date().toISOString()});
  }
  return id;
}

export const productService = {
  async getAll() {
    requireAuth();
    const products=await db.getAll("products");
    const shopMap=await getAllStocks("shop");
    const whMap=await getAllStocks("warehouse");
    return products.map(p=>({...p,stock:shopMap[p.id]||0,warehouseStock:whMap[p.id]||0}));
  },
  async create(data) {
    requireRole("admin");
    const pid=await db.add("products",{
      name:data.name, barcode:data.barcode||"", price:data.price,
      costPrice:data.costPrice||0, minStock:data.minStock||5,
      category:data.category||"Outro", unit:data.unit||"unid",
      active:true, stock:0, warehouseStock:0, createdAt:new Date().toISOString(),
    });
    if((data.stock||0)>0) await addStockMovement({productId:pid,productName:data.name,type:"purchase",location:"shop",qty:data.stock,reference:"create",note:"Stock inicial loja",sessionId:null});
    if((data.warehouseStock||0)>0) await addStockMovement({productId:pid,productName:data.name,type:"purchase",location:"warehouse",qty:data.warehouseStock,reference:"create",note:"Stock inicial armazém",sessionId:null});
    return pid;
  },
  async update(id, data) {
    requireRole("admin");
    const ex=await db.get("products",id);
    if(!ex) throw new Error("Produto não encontrado.");
    return db.put("products",{...ex,...data,updatedAt:new Date().toISOString()});
  },
  async adjustStock(productId, newShop, newWarehouse, reason) {
    requireRole("admin");
    const p=await db.get("products",productId);
    if(!p) throw new Error("Produto não encontrado.");
    const cs=await getStock(productId,"shop");
    const cw=await getStock(productId,"warehouse");
    if(newShop-cs!==0) await addStockMovement({productId,productName:p.name,type:"adjustment",location:"shop",qty:newShop-cs,reference:"adjust",note:reason||"Ajuste manual",sessionId:null});
    if(newWarehouse-cw!==0) await addStockMovement({productId,productName:p.name,type:"adjustment",location:"warehouse",qty:newWarehouse-cw,reference:"adjust",note:reason||"Ajuste manual",sessionId:null});
  },
  async transfer(productId, qty, from, to) {
    requireRole("admin");
    const p=await db.get("products",productId);
    const c=await getStock(productId,from);
    if(qty>c) throw new Error("Stock insuficiente.");
    await addStockMovement({productId,productName:p.name,type:"transfer_out",location:from,qty:-qty,reference:"transfer",note:`${from} → ${to}`,sessionId:null});
    await addStockMovement({productId,productName:p.name,type:"transfer_in",location:to,qty:+qty,reference:"transfer",note:`${from} → ${to}`,sessionId:null});
  },
};

export const saleService = {
  async create(items, payMethod, discount, clientName, clientPhone) {
    const user=requireAuth();
    for(const item of items) {
      const av=await getStock(item.id,"shop");
      if(item.qty>av) throw new Error(`Stock insuficiente: ${item.name} (disponível: ${av})`);
    }
    const subtotal=items.reduce((a,i)=>a+i.price*i.qty,0);
    const total=Math.max(0,subtotal-(discount||0));
    const saleDate=new Date().toISOString();
    const sid=await db.add("sales",{
      subtotal,discount:discount||0,total,payMethod,date:saleDate,
      userId:user.id,sessionId:user.sessionId||null,
      clientName:clientName||"",clientPhone:clientPhone||"",
      fiadoClient:payMethod==="fiado"?(clientName||""):null,
      items:items.map(i=>({id:i.id,name:i.name,price:i.price,qty:i.qty})),
      hash:null,
    });
    for(const item of items) {
      await db.add("saleItems",{saleId:sid,productId:item.id,productName:item.name,qty:item.qty,unitPrice:item.price,total:item.price*item.qty,createdAt:saleDate});
    }
    const hashStr="KONTAKI-"+sid+"-"+saleDate;
    let h=0; for(let i=0;i<hashStr.length;i++) h=Math.imul(31,h)+hashStr.charCodeAt(i)|0;
    const hash=Math.abs(h).toString(36).toUpperCase().slice(0,6);
    const rec=await db.get("sales",sid);
    await db.put("sales",{...rec,hash});
    for(const item of items) {
      await addStockMovement({productId:item.id,productName:item.name,type:"sale",location:"shop",qty:-item.qty,reference:`sale#${sid}`,note:`Venda #${sid}`});
    }
    if(payMethod==="fiado"&&clientName) {
      await db.add("fiado",{clientName,clientPhone:clientPhone||"",amount:total,amountPaid:0,saleId:sid,sessionId:user.sessionId||null,userId:user.id,date:saleDate,status:"open",note:""});
    }
    return {sid,hash,total};
  },
};

export const sessionService = {
  async openSession(userId, userName, prevSessionUuid) {
    const products=await db.getAll("products").then(p=>p.filter(x=>x.active));
    const shopMap=await getAllStocks("shop");
    const stockRecebido={};
    for(const p of products) {
      stockRecebido[p.id]={productId:p.id,productName:p.name,expected:shopMap[p.id]||0,found:shopMap[p.id]||0,unit:p.unit};
    }
    const sessionUuid=generateUUID();
    const sessionId=await db.add("sessions",{
      uuid:sessionUuid, userId, userName, status:"open",
      openedAt:new Date().toISOString(), closedAt:null,
      prevSessionUuid:prevSessionUuid||null,
      stockRecebido, stockEsperado:{},
      totalVendas:0, nVendas:0, hasIncidents:false,
      validated:false, validatedBy:null, validatedAt:null,
      ktkHash:null, importedKtkUuid:null,
    });
    for(const p of products) {
      await db.add("stockMovements",{
        productId:p.id,productName:p.name,type:"session_open",location:"shop",
        qty:0,qtyBefore:shopMap[p.id]||0,qtyAfter:shopMap[p.id]||0,
        reference:`session#${sessionId}`,userId,sessionId,imported:false,
        note:`Abertura de turno — ${userName}`,createdAt:new Date().toISOString(),
      });
    }
    return {sessionId,sessionUuid};
  },
  async closeSession(sessionId) {
    const user=requireAuth();
    const session=await db.get("sessions",sessionId);
    if(!session) throw new Error("Sessão não encontrada.");
    if(session.userId!==user.id) throw new Error("Esta sessão não é tua.");
    const products=await db.getAll("products").then(p=>p.filter(x=>x.active));
    const sales=await db.getAll("sales");
    const shopMap=await getAllStocks("shop");
    const sessionSales=sales.filter(s=>s.sessionId===sessionId);
    const totalVendas=sessionSales.reduce((a,s)=>a+((s.total||0)-(s.totalDevolvido||0)),0);
    const stockEsperado={};
    for(const p of products) {
      const vendido=sessionSales.reduce((a,s)=>a+(s.items||[]).filter(i=>i.id===p.id).reduce((b,i)=>b+i.qty,0),0);
      const recebido = (session.stockRecebido && session.stockRecebido[p.id] && session.stockRecebido[p.id].found) || shopMap[p.id] || 0;
      stockEsperado[p.id]={productId:p.id,productName:p.name,received:recebido,sold:vendido,expected:recebido-vendido,current:shopMap[p.id]||0,unit:p.unit};
    }
    const closedAt=new Date().toISOString();
    await db.put("sessions",{...session,status:"closed",closedAt,stockEsperado,totalVendas,nVendas:sessionSales.length});
    return {stockEsperado,totalVendas,sessionSales,closedAt};
  },
  async checkDuplicate(ktkUuid) {
    const sessions=await db.getAll("sessions");
    return sessions.find(s=>s.importedKtkUuid===ktkUuid)||null;
  },
  async buildChain(sessionUuid, depth=0) {
    if(!sessionUuid||depth>50) return [];
    const sessions=await db.getAll("sessions");
    const current=sessions.find(s=>s.uuid===sessionUuid);
    if(!current) return [{uuid:sessionUuid,missing:true}];
    const prev=await this.buildChain(current.prevSessionUuid,depth+1);
    return [...prev,current];
  },
  getTurnoDuration(openedAt) {
    const mins=Math.round((Date.now()-new Date(openedAt))/60000);
    const hrs=Math.floor(mins/60);
    return {str:hrs>0?`${hrs}h ${mins%60}min`:`${mins}min`,warn:hrs>=12,hrs};
  },
};

export const incidentService = {
  async resolve(incidentId, status, note) {
    requireRole("admin");
    const inc=await db.get("incidents",incidentId);
    if(!inc) throw new Error("Incidente não encontrado.");
    if(inc.status!=="open") throw new Error("Incidente já resolvido.");
    await db.put("incidents",{...inc,status,resolvedBy:getUser().id,resolvedAt:new Date().toISOString(),resolution:note||""});
    await addStockMovement({
      productId:inc.productId||0,productName:inc.productName,
      type:"incident_resolved",location:"shop",qty:0,
      reference:`incident#${incidentId}`,
      note:`Incidente ${status==="resolved"?"resolvido":"ignorado"}: ${note||"sem nota"}`,
      sessionId:null,
    });
  },
};

export const ktkService = {
  async generate(sessionId) {
    const user=requireAuth();
    const session=await db.get("sessions",sessionId);
    if(!session) throw new Error("Sessão não encontrada.");
    const [sales,fiados,incidents,movements,store]=await Promise.all([
      db.getAll("sales"),db.getAll("fiado"),db.getAll("incidents"),
      db.getAll("stockMovements"),db.get("settings","store").then(s=>s||{}),
    ]);
    const sessionSales=sales.filter(s=>s.sessionId===sessionId);
    const sessionFiados=fiados.filter(f=>f.sessionId===sessionId);
    const sessionIncidents=incidents.filter(i=>i.sessionId===sessionId);
    const sessionMoves=movements.filter(m=>m.sessionId===sessionId&&m.imported!==true);
    const ktk={
      versao:"2.0", app:"Kontaki", empresa:"Introxeer Technology",
      loja_id:store.id||"kontaki-loja-default",
      loja_nome:store.name||"Loja Kontaki",
      id_sessao:session.uuid, id_sessao_local:sessionId,
      funcionario:session.userName, funcionario_id:session.userId,
      role:user.role, data_abertura:session.openedAt, data_fecho:session.closedAt,
      sessao_anterior:session.prevSessionUuid||null,
      stock_recebido:session.stockRecebido||{},
      stock_esperado:session.stockEsperado||{},
      stock_movements:sessionMoves.map(m=>({type:m.type,productId:m.productId,productName:m.productName,location:m.location,qty:m.qty,qtyBefore:m.qtyBefore,qtyAfter:m.qtyAfter,reference:m.reference,createdAt:m.createdAt})),
      vendas:sessionSales.map(s=>({id:s.id,total:s.total,payMethod:s.payMethod,date:s.date,items:s.items||[],clientName:s.clientName||"",hash:s.hash})),
      fiados:sessionFiados.map(f=>({clientName:f.clientName,amount:f.amount,amountPaid:f.amountPaid||0,date:f.date,status:f.status})),
      incidentes:sessionIncidents.map(i=>({productName:i.productName,expected:i.expected,found:i.found,diff:i.diff,date:i.createdAt})),
      total_vendas:session.totalVendas||0, n_vendas:session.nVendas||0, hash:null,
    };
    try { ktk.hash=await generateKtkHash(ktk); }
    catch(err) { ktk.hash=null; ktk.hash_error=err.message; }
    await db.put("sessions",{...session,ktkHash:ktk.hash});
    return ktk;
  },
  // Importa o .ktk para a área pendente — NÃO toca em sessions/incidents/stock ainda.
  async stageImport(ktk) {
    requireAuth();
    if(!ktk.id_sessao||!ktk.funcionario||!ktk.loja_id||!ktk.versao) throw new Error("INVALID_FORMAT");

    const dup=await sessionService.checkDuplicate(ktk.id_sessao);
    if(dup) throw new Error(`DUPLICATE:${dup.id}:${dup.openedAt}`);

    const pending=await db.getAll("ktkImports");
    const dupPending=pending.find(p=>p.sessionUuid===ktk.id_sessao && p.status==="pending");
    if(dupPending) throw new Error(`PENDING_DUPLICATE:${dupPending.id}`);

    const hashResult=await validateKtkHash(ktk);
    if(!hashResult.valid&&!hashResult.legacy) throw new Error("INVALID_HASH");

    const importId=await db.add("ktkImports",{
      sessionUuid:ktk.id_sessao, ktk, hashResult,
      status:"pending", importedAt:new Date().toISOString(),
      importedBy:getUser().id,
    });
    return {importId,hashResult,incidentCount:(ktk.incidentes||[]).length};
  },

  // Aplica um import pendente: cria sessão/movimentos/incidentes (não mexe em stock de produtos).
  async confirmImport(importId, manualCorrections) {
    requireRole("admin");
    manualCorrections = manualCorrections || {};
    const rec=await db.get("ktkImports",importId);
    if(!rec || rec.status!=="pending") throw new Error("Importação não encontrada ou já processada.");
    const ktk=rec.ktk;
    const dup=await sessionService.checkDuplicate(ktk.id_sessao);
    if(dup) { await db.put("ktkImports",{...rec,status:"rejected",rejectedReason:"Duplicado no momento da confirmação"}); throw new Error(`DUPLICATE:${dup.id}:${dup.openedAt}`); }

    const user=getUser();
    const sessionId=await db.add("sessions",{
      uuid:ktk.id_sessao, userId:ktk.funcionario_id, userName:ktk.funcionario,
      status:"validated", openedAt:ktk.data_abertura, closedAt:ktk.data_fecho,
      prevSessionUuid:ktk.sessao_anterior||null,
      stockRecebido:ktk.stock_recebido||{}, stockEsperado:ktk.stock_esperado||{},
      totalVendas:ktk.total_vendas||0, nVendas:ktk.n_vendas||0,
      hasIncidents:(ktk.incidentes||[]).length>0,
      validated:true, validatedBy:user.id, validatedAt:new Date().toISOString(),
      ktkHash:ktk.hash, importedKtkUuid:ktk.id_sessao,
      isImported:true, hashLegacy:rec.hashResult?.legacy,
      lojaId:ktk.loja_id, lojaNome:ktk.loja_nome,
    });
    for(const m of (ktk.stock_movements||[])) {
      await db.add("stockMovements",{...m,sessionId,userId:ktk.funcionario_id,imported:true,createdAt:m.createdAt||new Date().toISOString()});
    }
    for(const inc of (ktk.incidentes||[])) {
      await db.add("incidents",{
        productName:inc.productName,expected:inc.expected,found:inc.found,diff:inc.diff,
        sessionId,responsibleSessionId:null,foundBy:ktk.funcionario_id,responsible:null,
        status:"open",importedFrom:ktk.id_sessao,
        note:`Importado de ${ktk.funcionario}`,
        createdAt:inc.date||new Date().toISOString(),
      });
    }

    // Reconciliação real do stock: aplica o delta vendido (corrigido ou original).
    const stockRows = Object.values(ktk.stock_esperado||{});
    for (const row of stockRows) {
      const hasCorrection = Object.prototype.hasOwnProperty.call(manualCorrections, row.productId);
      const soldFinal = hasCorrection ? Number(manualCorrections[row.productId]) : Number(row.sold||0);
      if (soldFinal !== 0) {
        await addStockMovement({
          productId: row.productId, productName: row.productName,
          type: "import_turno", location: "shop", qty: -soldFinal,
          reference: "ktk:"+ktk.id_sessao, note: "Importado do turno de "+ktk.funcionario,
          sessionId, userId: ktk.funcionario_id, createdAt: new Date().toISOString(),
        });
      }
      if (hasCorrection) {
        await db.add("stockCorrections", {
          importId, productId: row.productId, productName: row.productName,
          originalValue: Number(row.sold||0), correctedValue: soldFinal,
          correctedBy: user.id, correctedAt: new Date().toISOString(),
        });
      }
    }

    await db.put("ktkImports",{...rec,status:"confirmed",confirmedAt:new Date().toISOString(),confirmedBy:user.id,sessionId});
    return {sessionId,incidentCount:(ktk.incidentes||[]).length};
  },

  async rejectImport(importId,reason) {
    requireRole("admin");
    const rec=await db.get("ktkImports",importId);
    if(!rec || rec.status!=="pending") throw new Error("Importação não encontrada ou já processada.");
    await db.put("ktkImports",{...rec,status:"rejected",rejectedReason:reason||"",rejectedAt:new Date().toISOString(),rejectedBy:getUser().id});
  },

  async getPending() {
    const all=await db.getAll("ktkImports");
    return all.filter(p=>p.status==="pending").sort((a,b)=>new Date(a.importedAt)-new Date(b.importedAt));
  },

  // Compara vendas de todos os imports pendentes por produto, ordenadas por hora real da venda.
  // Sinaliza quando o mesmo produto é vendido em 2+ sessões/turnos dentro de uma janela curta.
  async detectConflicts(windowMinutes=10) {
    const pending=await this.getPending();
    const byProduct={};
    pending.forEach(p=>{
      const ktk=p.ktk;
      (ktk.vendas||[]).forEach(v=>{
        (v.items||[]).forEach(it=>{
          const key=it.id;
          if(!byProduct[key]) byProduct[key]=[];
          byProduct[key].push({
            productId:it.id, productName:it.name, qty:it.qty,
            date:v.date, funcionario:ktk.funcionario, sessionUuid:ktk.id_sessao, importId:p.id,
          });
        });
      });
    });
    const conflicts=[];
    Object.keys(byProduct).forEach(pid=>{
      const events=byProduct[pid].sort((a,b)=>new Date(a.date)-new Date(b.date));
      const sessionsInvolved=new Set(events.map(e=>e.sessionUuid));
      if(sessionsInvolved.size<2) return;
      for(let i=1;i<events.length;i++) {
        const gapMin=(new Date(events[i].date)-new Date(events[i-1].date))/60000;
        if(gapMin<=windowMinutes && events[i].sessionUuid!==events[i-1].sessionUuid) {
          conflicts.push({productId:Number(pid),productName:events[i].productName,events:events,gapMinutes:Math.round(gapMin)});
          break;
        }
      }
    });
    return {byProduct,conflicts};
  },
};

export const catalogService = {
  async generate() {
    requireRole("admin");
    const products=await db.getAll("products");
    const active=products.filter(p=>p.active!==false);
    const items=[];
    for (const p of active) {
      let catalogId=p.catalogId;
      if (!catalogId) {
        catalogId=generateUUID();
        await db.put("products",{...p,catalogId});
      }
      items.push({
        catalogId, name:p.name, barcode:p.barcode||"", masterBarcode:p.masterBarcode||"",
        price:p.price, costPrice:p.costPrice||0, minStock:p.minStock||5,
        category:p.category||"Outro", unit:p.unit||"unid",
      });
    }
    const store=(await db.get("settings","store"))||{};
    const cat={
      tipo:"ktkcat", versao:"1.0",
      loja_id:store.id||null, loja_nome:store.name||"",
      gerado_em:new Date().toISOString(),
      produtos:items, hash:null,
    };
    try { cat.hash=await generateKtkcatHash(cat); }
    catch(err) { cat.hash=null; cat.hash_error=err.message; }
    return cat;
  },

  async apply(ktkcat) {
    requireAuth();
    if (!ktkcat || ktkcat.tipo!=="ktkcat" || !Array.isArray(ktkcat.produtos)) throw new Error("INVALID_FORMAT");
    const hashResult=await validateKtkcatHash(ktkcat);
    if (!hashResult.valid && !hashResult.legacy) throw new Error("INVALID_HASH");

    const localProducts=await db.getAll("products");
    const byCatalogId={};
    localProducts.forEach(p=>{ if (p.catalogId) byCatalogId[p.catalogId]=p; });

    let updated=0, created=0;
    for (const item of ktkcat.produtos) {
      const existing=byCatalogId[item.catalogId];
      if (existing) {
        await db.put("products",{
          ...existing,
          name:item.name, barcode:item.barcode, masterBarcode:item.masterBarcode,
          price:item.price, costPrice:item.costPrice, minStock:item.minStock,
          category:item.category, unit:item.unit,
          catalogId:item.catalogId, updatedAt:new Date().toISOString(),
        });
        updated++;
      } else {
        await db.add("products",{
          catalogId:item.catalogId, name:item.name, barcode:item.barcode||"",
          masterBarcode:item.masterBarcode||"", price:item.price, costPrice:item.costPrice||0,
          minStock:item.minStock||5, category:item.category||"Outro", unit:item.unit||"unid",
          active:true, stock:0, warehouseStock:0, createdAt:new Date().toISOString(),
        });
        created++;
      }
    }

    const incomingIds=new Set(ktkcat.produtos.map(i=>i.catalogId));
    const discontinued=localProducts.filter(p=>p.catalogId && !incomingIds.has(p.catalogId));
    const discontinuedWithStock=[];
    for (const p of discontinued) {
      const shopStock=await getStock(p.id,"shop");
      const whStock=await getStock(p.id,"warehouse");
      if (shopStock>0 || whStock>0) {
        discontinuedWithStock.push({productId:p.id,productName:p.name,shopStock,whStock});
      }
    }

    return {updated,created,discontinuedWithStock,legacy:hashResult.legacy};
  },
};

export const historicoService = {
  async query({from,to,userId,productId,type}={}) {
    requireAuth();
    const [sales,movements,incidents,fiados,users,products]=await Promise.all([
      db.getAll("sales"),db.getAll("stockMovements"),db.getAll("incidents"),
      db.getAll("fiado"),db.getAll("users"),db.getAll("products"),
    ]);
    const inRange=d=>{ if(!d) return true; const x=(d||"").split("T")[0]; return (!from||x>=from)&&(!to||x<=to); };
    return {
      sales:sales.filter(s=>inRange(s.date)&&(!userId||s.userId===Number(userId))),
      movements:movements.filter(m=>inRange(m.createdAt)&&(!userId||m.userId===Number(userId))&&(!productId||m.productId===Number(productId))&&(!type||m.type===type)),
      incidents:incidents.filter(i=>inRange(i.createdAt)&&(!userId||i.foundBy===Number(userId))&&(!productId||i.productId===Number(productId))),
      fiados:fiados.filter(f=>inRange(f.date)&&(!userId||f.userId===Number(userId))),
      userMap:Object.fromEntries(users.map(u=>[u.id,u.name])),
      productMap:Object.fromEntries(products.map(p=>[p.id,p.name])),
      summary:{
        totalVendas:sales.filter(s=>inRange(s.date)).reduce((a,s)=>a+(s.total||0),0),
        nVendas:sales.filter(s=>inRange(s.date)).length,
        nIncidentes:incidents.filter(i=>inRange(i.createdAt)).length,
        fiadoAberto:fiados.filter(f=>f.status==="open").reduce((a,f)=>a+f.amount,0),
      },
    };
  },
};
