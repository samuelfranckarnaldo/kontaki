import { db, getAllStoreNames } from "./db.js";
import { encryptBackup, decryptBackup, hashRecoveryCode, unwrapMasterKeyWithRecoveryCode } from "./crypto.js";
import { hasMasterKey, getOrCreateMasterKey, getAllPersistedWraps } from "./recovery-codes.js";
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

    // Embute os wraps (Master Key selada por Recovery Code) diretamente
    // no ficheiro — sem isto, restaurar exigiria sempre contactar o
    // Console para obter o wrappedMasterKey. Com os wraps embutidos, o
    // .ktkbackup é autossuficiente: ficheiro + Recovery Code chegam para
    // restaurar, mesmo sem rede. Isto muda o modelo de segurança do
    // ficheiro — deixa de depender do Console como segundo fator de
    // posse; ver aviso mostrado ao utilizador em downloadEncrypted().
    payload.recoveryWraps = await getAllPersistedWraps();

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
      const { logger } = await import("./logger.js");
      logger.error("[uploadToConsole] fetch falhou: " + (e.name || "") + " " + (e.message || ""), e);
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        throw new Error("Sem ligação à Internet. Tenta novamente quando estiveres online.");
      }
      throw new Error("Não foi possível contactar o Kontaki Console. Verifica a tua ligação e tenta novamente.");
    }

    if (res.status >= 500) {
      throw new Error("O servidor encontrou um problema. Tenta novamente mais tarde.");
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error("A tua sessão expirou ou a licença precisa de atenção.");
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
  // Backup automático em segundo plano (Fase 2) — dispara em eventos com
  // significado (abertura/fecho de turno, backup manual) em vez de um
  // relógio curto: reter só os 10 backups mais recentes esgotaria a
  // janela de histórico em minutos se o upload fosse muito frequente.
  // DEBOUNCE_MS evita uploads duplicados se dois eventos dispararem perto
  // um do outro (ex. abrir turno logo a seguir a fechar o anterior).
  // Backoff progressivo apos falha: 1min -> 5min -> 15min, depois
  // fica em 15min. Evita rajadas de tentativas em rede instavel —
  // cada gatilho (abrir turno, fecho, fallback 4h) so tenta de novo
  // depois do backoff atual ter passado.
  _BACKOFF_STEPS_MS: [60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000],

  async autoBackupIfNeeded(reason, opts) {
    const skipBackoff = !!(opts && opts.skipBackoff);
    const { logger } = await import("./logger.js");
    try {
      const ready = await hasMasterKey();
      if (!ready) return; // loja ainda sem PIN/Recovery Codes — nada a fazer

      const DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutos (sucesso -> sucesso)
      const lastSuccess = await db.get("settings", "lastCloudBackupAt");
      const lastSuccessTime = lastSuccess ? new Date(lastSuccess.value).getTime() : 0;
      if (Date.now() - lastSuccessTime < DEBOUNCE_MS) {
        logger.info("[autoBackup] ignorado (debounce): " + reason);
        return;
      }

      if (!skipBackoff) {
        const nextRetry = await db.get("settings", "backupNextAllowedRetry");
        const nextRetryTime = nextRetry ? new Date(nextRetry.value).getTime() : 0;
        if (Date.now() < nextRetryTime) {
          logger.info("[autoBackup] ignorado (backoff ativo até " + nextRetry.value + "): " + reason);
          return;
        }
      }

      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        logger.info("[autoBackup] ignorado (dispositivo offline): " + reason);
        return; // nao conta como falha — navigator.onLine e so otimizacao, nao penaliza o backoff
      }

      await db.put("settings", { key: "lastBackupAttempt", value: new Date().toISOString() });

      logger.info("[autoBackup] a disparar por: " + reason);
      const backupId = await this.uploadToConsole();
      const now = new Date().toISOString();
      await db.put("settings", { key: "lastCloudBackupAt", value: now });
      await db.put("settings", { key: "lastBackupSuccess", value: now });
      await db.put("settings", { key: "backupFailureCount", value: 0 });
      await db.delete("settings", "backupNextAllowedRetry");
      logger.info("[autoBackup] OK — backupId: " + backupId + " (motivo: " + reason + ")");
    } catch (e) {
      // Nunca deixa o backup automático interromper o fluxo principal
      // (abrir/fechar turno tem de funcionar mesmo sem internet).
      logger.warn("[autoBackup] falhou (" + reason + "): " + (e.message || e));

      const countRec = await db.get("settings", "backupFailureCount");
      const count = (countRec ? countRec.value : 0) + 1;
      await db.put("settings", { key: "backupFailureCount", value: count });
      await db.put("settings", { key: "lastBackupFailure", value: new Date().toISOString() });

      const stepIdx = Math.min(count - 1, this._BACKOFF_STEPS_MS.length - 1);
      const nextRetryTime = new Date(Date.now() + this._BACKOFF_STEPS_MS[stepIdx]).toISOString();
      await db.put("settings", { key: "backupNextAllowedRetry", value: nextRetryTime });
      logger.info("[autoBackup] backoff: proxima tentativa automatica so apos " + nextRetryTime);
    }
  },

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
      const { logger } = await import("./logger.js");
      logger.error("[restoreFromConsole] fetch /restore falhou: " + (e.name || "") + " " + (e.message || ""), e);
      throw new Error("Falha de rede: " + (e.message || e.name || "desconhecida") + ". Ver Últimos erros.");
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
      const { logger } = await import("./logger.js");
      logger.error("[restoreFromConsole] fetch /download falhou: " + (e.name || "") + " " + (e.message || ""), e);
      throw new Error("Falha de rede durante a transferência: " + (e.message || e.name || "desconhecida") + ". Ver Últimos erros.");
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

  // Restauro 100% local a partir de um ficheiro .ktkbackup — não contacta
  // o Console em nenhum momento. Usa os wraps embutidos no próprio
  // ficheiro (ver _buildEncryptedBackup) para desbloquear a Master Key
  // localmente a partir do Recovery Code introduzido.
  async restoreFromFile(fileText, recoveryCode, onStatus) {
    const notify = onStatus || function () {};
    notify("A ler ficheiro...");

    let backupPayload;
    try { backupPayload = JSON.parse(fileText); }
    catch { throw new Error("Ficheiro de backup inválido ou corrompido."); }

    if (!backupPayload.metadata || !backupPayload.recoveryWraps) {
      throw new Error("Este ficheiro não contém as chaves de recuperação necessárias. Backups antigos (antes desta funcionalidade) só podem ser restaurados através do Console.");
    }
    if (!backupPayload.recoveryWraps.length) {
      throw new Error("Este ficheiro não tem nenhum código de recuperação associado. Gera códigos de recuperação e cria um novo backup.");
    }

    notify("A validar código...");
    const recoveryHash = await hashRecoveryCode(recoveryCode);
    const wrap = backupPayload.recoveryWraps.find(function(w) { return w.hash === recoveryHash; });
    if (!wrap) {
      throw new Error("Código de recuperação inválido para este ficheiro. Usa um código que estava ativo quando este backup foi criado.");
    }

    notify("A desbloquear a chave da loja...");
    const storeId = backupPayload.metadata.storeId;
    let masterKey;
    try {
      masterKey = await unwrapMasterKeyWithRecoveryCode(
        { wrapVersion: wrap.wrapVersion, wrappedKey: wrap.wrappedKey, iv: wrap.iv },
        recoveryCode,
        storeId
      );
    } catch (e) {
      throw new Error("Não foi possível desbloquear a chave — código incorreto ou ficheiro corrompido.");
    }

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
