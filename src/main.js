import { loadLicense } from "./license.js";
import { checkOnboarding } from "./onboarding.js";
import { seed }      from "./db.js";
import { checkSetup } from "./setup.js";
import { initAuth }  from "./auth.js";
import { initModal } from "./modal.js";
import { logger }    from "./logger.js";

async function main() {
  await seed();
  initModal();
  await loadLicense();
  var isSetup = await checkSetup();
  if (!isSetup) { initAuth(); } else { checkOnboarding(); }
  if (window.lucide) window.lucide.createIcons();
}

window.addEventListener("error", function(e) {
  try { logger.error(e.message, { stack: e.filename + ":" + e.lineno }); } catch(x){}
  showErrorBoundary(e.message, e.filename, e.lineno);
});

window.addEventListener("unhandledrejection", function(e) {
  var msg = (e.reason && e.reason.message) ? e.reason.message : String(e.reason);
  try { logger.error("Promise rejeitada: " + msg, {}); } catch(x){}
  showErrorBoundary(msg, null, null);
});

function showErrorBoundary(message, file, line) {
  if (document.getElementById("error-boundary")) return;
  var div = document.createElement("div");
  div.id = "error-boundary";
  div.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:#fff;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;font-family:sans-serif";
  div.innerHTML =
    "<div style='width:64px;height:64px;background:#fee2e2;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:16px'>" +
    "<svg width='28' height='28' viewBox='0 0 24 24' fill='none' stroke='#dc2626' stroke-width='2'><circle cx='12' cy='12' r='10'/><line x1='12' y1='8' x2='12' y2='12'/><line x1='12' y1='16' x2='12.01' y2='16'/></svg></div>" +
    "<div style='font-size:18px;font-weight:700;color:#18181b;margin-bottom:8px'>Algo correu mal</div>" +
    "<div style='font-size:13px;color:#71717a;text-align:center;margin-bottom:4px;max-width:300px'>" + (message||"Erro desconhecido") + "</div>" +
    (file ? "<div style='font-size:11px;color:#a1a1aa;margin-bottom:20px'>" + file + (line?":"+line:"") + "</div>" : "<div style='margin-bottom:20px'></div>") +
    "<button onclick='document.getElementById(\"error-boundary\").remove()' style='padding:12px 24px;background:#5b21b6;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:8px'>Tentar novamente</button>" +
    "<button onclick='window.location.reload()' style='padding:10px 24px;background:#f4f4f5;color:#71717a;border:none;border-radius:10px;font-size:13px;cursor:pointer'>Recarregar app</button>";
  document.body.appendChild(div);
}

window._restoreBackupLogin = async function(input) {
  var file = input.files[0];
  if (!file) return;
  if (!confirm("Restaurar backup vai substituir os dados actuais. Continuar?")) { input.value=""; return; }
  try {
    var text = await file.text();
    var backupMod = await import("./backup.js");
    var results = await backupMod.backupService.import(text);
    var total = Object.values(results).reduce(function(a,b){ return a+b; }, 0);
    alert("Backup restaurado: " + total + " registos. A app vai recarregar.");
    window.location.reload();
  } catch(err) {
    alert("Erro ao restaurar: " + err.message);
  }
};

main().catch(function(e) {
  try { logger.error("Erro fatal: " + e.message, e); } catch(x){}
  showErrorBoundary(e.message, null, null);
});

async function checkBackupReminder() {
  try {
    var last = localStorage.getItem("kontaki-last-backup");
    var now  = Date.now();
    if (!last || now - Number(last) > 7 * 24 * 60 * 60 * 1000) {
      setTimeout(function() {
        var banner = document.createElement("div");
        banner.style.cssText = "position:fixed;bottom:80px;left:16px;right:16px;background:#1e3a5f;color:#fff;border-radius:12px;padding:14px;z-index:9000;display:flex;align-items:center;gap:12px;box-shadow:0 8px 24px rgba(0,0,0,.2);font-family:inherit";
        banner.innerHTML =
          "<i data-lucide='cloud-upload' style='width:20px;height:20px;flex-shrink:0'></i>" +
          "<div style='flex:1'><div style='font-size:13px;font-weight:700'>Lembrete de backup</div><div style='font-size:11px;color:rgba(255,255,255,.7);margin-top:2px'>Há mais de 7 dias sem backup. Os teus dados são importantes.</div></div>" +
          "<button onclick='this.parentNode.remove()' style='background:none;border:none;color:rgba(255,255,255,.6);cursor:pointer;font-size:18px;padding:0'>×</button>";
        document.body.appendChild(banner);
        if (window.lucide) window.lucide.createIcons({el:banner});
        setTimeout(function(){ if(banner.parentNode) banner.remove(); }, 12000);
      }, 3000);
    }
  } catch(e) {}
}

checkBackupReminder();
