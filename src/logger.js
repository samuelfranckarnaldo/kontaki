import { db } from "./db.js";
import { getUser } from "./auth.js";

export const logger = {
  async _write(level, message, stack) {
    try {
      const user = getUser();
      await db.add("logs", {
        date:    new Date().toISOString(),
        userId:  user ? user.id : null,
        level,
        message: String(message).slice(0, 500),
        stack:   stack ? String(stack).slice(0, 1000) : null,
      });
    } catch {}
  },

  info(message)  { console.info("[INFO]",  message); this._write("info",  message, null); },
  warn(message)  { console.warn("[WARN]",  message); this._write("warn",  message, null); },
  error(message, err) {
    console.error("[ERROR]", message, err);
    this._write("error", message, err ? (err.stack || String(err)) : null);
  },
};

export async function getLogs(limit = 100) {
  const all = await db.getAll("logs");
  return all.slice(-limit).reverse();
}

export async function clearLogs() {
  const all = await db.getAll("logs");
  for (const log of all) await db.delete("logs", log.id);
}
