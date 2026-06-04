import { seed } from "./db.js";
import { initAuth } from "./auth.js";
import { initModal } from "./modal.js";

window.onerror = function(msg, url, line, col, err) {
  alert(
    "JS ERROR\n\n" +
    msg + "\n\n" +
    "FILE: " + url + "\n" +
    "LINE: " + line + ":" + col + "\n\n" +
    (err && err.stack ? err.stack : "")
  );
};

window.onunhandledrejection = function(e) {
  alert(
    "PROMISE ERROR\n\n" +
    String(e.reason) + "\n\n" +
    (e.reason && e.reason.stack ? e.reason.stack : "")
  );
};

async function main() {
  await seed();
  initModal();
  initAuth();

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

main();
