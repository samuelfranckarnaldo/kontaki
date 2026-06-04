import { seed }      from "./db.js";
import { initAuth }  from "./auth.js";
import { initModal } from "./modal.js";

async function main() {
  await seed();
  initModal();
  initAuth();
  if (window.lucide) window.lucide.createIcons();
}

window.addEventListener("error", function(e) {
  var div = document.createElement("div");
  div.style.cssText = "position:fixed;top:0;left:0;right:0;background:red;color:white;padding:10px;font-size:11px;z-index:9999;word-break:break-all;white-space:pre-wrap";
  div.textContent = "ERROR: " + e.message + "\nFILE: " + e.filename + "\nLINE: " + e.lineno + ":" + e.colno;
  document.body.appendChild(div);
});

window.addEventListener("unhandledrejection", function(e) {
  var div = document.createElement("div");
  div.style.cssText = "position:fixed;top:80px;left:0;right:0;background:darkred;color:white;padding:10px;font-size:11px;z-index:9999;word-break:break-all;white-space:pre-wrap";
  div.textContent = "PROMISE ERROR: " + ((e.reason && e.reason.message) ? e.reason.message : String(e.reason));
  if (e.reason && e.reason.stack) div.textContent += "\n" + e.reason.stack.slice(0, 200);
  document.body.appendChild(div);
});

main().catch(function(e) {
  var div = document.createElement("div");
  div.style.cssText = "position:fixed;top:160px;left:0;right:0;background:maroon;color:white;padding:10px;font-size:11px;z-index:9999;word-break:break-all;white-space:pre-wrap";
  div.textContent = "MAIN ERROR: " + e.message;
  if (e.stack) div.textContent += "\n" + e.stack.slice(0, 300);
  document.body.appendChild(div);
  console.error(e);
});
