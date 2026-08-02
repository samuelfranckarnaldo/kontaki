import { db, getAllStoreNames } from "./db.js";
import { encryptBackup } from "./crypto.js";
import { hasMasterKey, getOrCreateMasterKey } from "./recovery-codes.js";

// Backup completo: lê a lista real de stores da base de dados em vez de
// manter uma lista fixa à parte — evita o problema que já aconteceu uma vez
// (backup.js ficou desatualizado à medida que a app cresceu, deixando de
// fora clients, expenses, auditLog, pendingSales, contabilidade, etc.).
// Sempre que uma store nova for criada em db.js, o backup já a inclui
// automaticamente, sem precisar de manutenção manual aqui.

export const backupService = {
  async export() {
    const stores = await getAllStoreNames();
    const data = {
      version:   "2.0",
      app:       "Kontaki",
      exportedAt: new Date().toISOString(),
      stores:    {},
    };
    for (const store of stores) {
      try { data.stores[store] = await db.getAll(store); }
      catch { data.stores[store] = []; }
    }
    data.checksum = Object.keys(data.stores)
      .map(k => k + ":" + data.stores[k].length)
      .join(",");
    return data;
  },

  async download() {
    const data    = await this.export();
    const json    = JSON.stringify(data, null, 2);
    const blob    = new Blob([json], { type:"application/json" });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement("a");
    const date    = new Date().toISOString().split("T")[0];
    a.href        = url;
    a.download    = "kontaki_backup_" + date + ".json";
    a.click();
    URL.revokeObjectURL(url);
    return data.checksum;
  },

  // Backup cifrado (.ktkbackup) — formato oficial de recuperação, ligado
  // ao Kontaki Console. Distinto de download() acima, que continua a
  // servir exportação/migração/suporte em JSON claro, sem alterações.
  async downloadEncrypted() {
    const ready = await hasMasterKey();
    if (!ready) {
      throw new Error("Gera os teus códigos de recuperação antes de exportar um backup seguro.");
    }
    const masterKey = await getOrCreateMasterKey();

    const store = await db.get("settings", "store");
    const storeId = store && store.storeId;
    if (!storeId) throw new Error("Loja sem storeId definido — não é possível gerar backup seguro.");

    const deviceIdRow = await db.get("settings", "deviceId");
    const deviceId = deviceIdRow && deviceIdRow.value;

    const { APP_VERSION } = await import("./version.js");

    const data = await this.export();
    const seqRow = await db.get("settings", "backupSequence");
    const sequence = ((seqRow && seqRow.value) || 0) + 1;
    await db.put("settings", { key: "backupSequence", value: sequence });

    const payload = await encryptBackup(data, masterKey, {
      storeId: storeId,
      deviceId: deviceId,
      appVersion: APP_VERSION,
      sequence: sequence,
    });

    const json = JSON.stringify(payload);
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    const date = new Date().toISOString().split("T")[0];
    a.href     = url;
    a.download = "kontaki_backup_" + date + ".ktkbackup";
    a.click();
    URL.revokeObjectURL(url);
    return payload.metadata.backupId;
  },

  async import(jsonText) {
    let data;
    try { data = JSON.parse(jsonText); }
    catch { throw new Error("Ficheiro de backup inválido."); }

    if (!data.stores || !data.version) throw new Error("Formato de backup inválido.");

    // Só tenta restaurar stores que existem de facto na base de dados atual
    // (protege contra um backup antigo referenciar uma store já removida/
    // renomeada) — não assume que tudo o que está no ficheiro é válido aqui.
    const validStores = new Set(await getAllStoreNames());

    const results = {};
    for (const store of Object.keys(data.stores)) {
      if (!validStores.has(store)) continue;
      let count = 0;
      for (const record of data.stores[store]) {
        try { await db.put(store, record); count++; }
        catch {}
      }
      results[store] = count;
    }
    return results;
  },

  validate(data) {
    const expected = Object.keys(data.stores)
      .map(k => k + ":" + data.stores[k].length)
      .join(",");
    return expected === data.checksum;
  },
};
