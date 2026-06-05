import { db } from "./db.js";

const STORES = [
  "users","products","sales","saleItems","fiado",
  "incidents","sessions","stockMovements","sessionTransfers",
  "suppliers","purchases","settings","logs",
];

export const backupService = {
  async export() {
    const data = {
      version:   "1.0",
      app:       "Kontaki",
      exportedAt: new Date().toISOString(),
      stores:    {},
    };
    for (const store of STORES) {
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

  async import(jsonText) {
    let data;
    try { data = JSON.parse(jsonText); }
    catch { throw new Error("Ficheiro de backup inválido."); }

    if (!data.stores || !data.version) throw new Error("Formato de backup inválido.");

    const results = {};
    for (const store of STORES) {
      if (!data.stores[store]) continue;
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
