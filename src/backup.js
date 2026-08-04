import { db, getAllStoreNames } from "./db.js";
import { encryptBackup, decryptBackup, hashRecoveryCode, unwrapMasterKeyWithRecoveryCode } from "./crypto.js";
import { hasMasterKey, getOrCreateMasterKey } from "./recovery-codes.js";
import { ensureStoreId } from "./invite.js";

const CONSOLE_API = "https://kontaki-console.vercel.app/api";

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
  // Monta o backup cifrado completo (payload + storeId + deviceId), reaproveitado
  // por downloadEncrypted() e uploadToConsole() — evita duplicar a lógica de
  // Master Key/sequence/meta nos dois sítios.
  async _buildEncryptedBackup() {
    const ready = await hasMasterKey();
    if (!ready) {
      throw new Error("Gera os teus códigos de recuperação antes de criar um backup seguro.");
    }
    const masterKey = await getOrCreateMasterKey();

    const storeId = await ensureStoreId();

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

    return { payload: payload, storeId: storeId, deviceId: deviceId };
  },

  async downloadEncrypted() {
    const { payload } = await this._buildEncryptedBackup();

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

  // Envia o backup cifrado directamente ao Console, sem gerar ficheiro local.
  async uploadToConsole(onStatus) {
    const notify = onStatus || function () {};
    notify("A preparar backup...");
    const { payload, storeId, deviceId } = await this._buildEncryptedBackup();

    const licMod = await import("./license.js");
    const lic = licMod.getLicense();
    if (!lic || !lic.code) throw new Error("Sem licença ativa — não é possível enviar ao Console.");

    notify("A enviar...");
    let res;
    try {
      res = await fetch(CONSOLE_API + "/backup/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseCode: lic.code,
          storeId: storeId,
          deviceId: deviceId,
          backup: payload,
        }),
      });
    } catch (e) {
      throw new Error("Sem ligação à internet. Tenta novamente mais tarde.");
    }

    let result;
    try { result = await res.json(); }
    catch { throw new Error("Resposta inválida do Console."); }

    if (!res.ok || !result.success) {
      throw new Error(result.error || "Erro ao enviar backup ao Console.");
    }
    return result.backupId;
  },

  async import(jsonText) {
    let data;
    try { data = JSON.parse(jsonText); }
    catch { throw new Error("Ficheiro de backup inválido."); }
    return this.importObject(data);
  },

  // Partilhado por import() (ficheiro JSON) e restoreFromConsole() (backup
  // cifrado já decifrado em memória) — mesma lógica de escrita no IndexedDB.
  async importObject(data) {
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

  // Restauro completo a partir do Console: Store ID + Recovery Code em
  // claro nunca saem do dispositivo — só o hash local. O servidor devolve
  // wrappedMasterKey (nunca a chave em claro); a Master Key só existe
  // decifrada em memória, neste dispositivo, o tempo que durar a função.
  async restoreFromConsole(storeId, recoveryCode, onStatus) {
    const notify = onStatus || function () {};

    notify("A validar código...");
    const recoveryHash = await hashRecoveryCode(recoveryCode);

    let res;
    try {
      res = await fetch(CONSOLE_API + "/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: storeId, recoveryHash: recoveryHash }),
      });
    } catch (e) {
      throw new Error("Sem ligação à internet.");
    }
    let result;
    try { result = await res.json(); }
    catch { throw new Error("Resposta inválida do servidor."); }
    if (!res.ok) throw new Error(result.error || "Código de recuperação inválido.");

    notify("A desbloquear a chave da loja...");
    const masterKey = await unwrapMasterKeyWithRecoveryCode(
      { wrapVersion: result.wrapVersion, wrappedKey: result.wrappedMasterKey, iv: result.wrapIv },
      recoveryCode,
      storeId
    );

    notify("A transferir backup...");
    let dlRes;
    try {
      dlRes = await fetch(CONSOLE_API + "/backup/download", {
        headers: { "Authorization": "Bearer " + result.recoveryToken },
      });
    } catch (e) {
      throw new Error("Sem ligação à internet durante a transferência.");
    }
    let backupPayload;
    try { backupPayload = await dlRes.json(); }
    catch { throw new Error("Resposta inválida ao transferir backup."); }
    if (!dlRes.ok) throw new Error(backupPayload.error || "Erro ao transferir backup.");

    notify("A decifrar...");
    let data;
    try {
      data = await decryptBackup(backupPayload, masterKey);
    } catch (e) {
      throw new Error("Backup corrompido, adulterado, ou código incorreto — não foi possível decifrar.");
    }

    notify("A restaurar dados...");
    return await this.importObject(data);
  },

  validate(data) {
    const expected = Object.keys(data.stores)
      .map(k => k + ":" + data.stores[k].length)
      .join(",");
    return expected === data.checksum;
  },
};
