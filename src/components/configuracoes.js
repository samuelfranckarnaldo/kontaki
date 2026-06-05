import { db }              from "../db.js";
import { fmt, el, val, refreshIcons } from "../utils.js";
import { toast }           from "../toast.js";
import { openModal, closeModal } from "../modal.js";
import { backupService }   from "../backup.js";
import { getLogs, clearLogs } from "../logger.js";

export async function loadConfiguracoes() {
  const btn = document.getElementById("btn-back-configuracoes");
  if (btn) btn.onclick = () => window._showSubpage(null);
  await renderConfiguracoes();
}

async function renderConfiguracoes() {
  const wrap = document.getElementById("configuracoes-content");
  if (!wrap) return;

  const store = (await db.get("settings","store")) || {};
  const logs  = await getLogs(5);

  wrap.innerHTML =
    // Dados da loja
    '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Dados da loja</div>' +
    '<div class="vender-card" style="margin-bottom:14px;display:flex;flex-direction:column;gap:12px">' +
    '<div class="field"><label>Nome da loja</label><input id="cfg-name" value="' + (store.name||"") + '"/></div>' +
    '<div class="field"><label>Endereço</label><input id="cfg-addr" value="' + (store.address||"") + '"/></div>' +
    '<div class="field"><label>Telefone</label><input id="cfg-phone" value="' + (store.phone||"") + '"/></div>' +
    '<div class="field"><label>Moeda</label><input id="cfg-currency" value="' + (store.currency||"Kz") + '"/></div>' +
    '<button onclick="window._saveConfiguracoes()" style="width:100%;padding:13px;background:#5b21b6;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">Guardar configurações</button>' +
    '</div>' +

    // Backup
    '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Backup</div>' +
    '<div class="vender-card" style="margin-bottom:14px;display:flex;flex-direction:column;gap:8px">' +
    '<div style="font-size:13px;color:#71717a;margin-bottom:4px;line-height:1.5">Exporta todos os dados da app para um ficheiro JSON. Usa para fazer backup ou transferir dados.</div>' +
    '<button onclick="window._exportBackup()" style="width:100%;padding:13px;background:#16a34a;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px">' +
    '<i data-lucide="download" style="width:16px;height:16px"></i> Exportar backup</button>' +
    '<label style="display:flex;align-items:center;justify-content:center;gap:8px;padding:13px;border:2px dashed #e4e4e7;border-radius:10px;cursor:pointer;font-size:14px;font-weight:700;color:#5b21b6">' +
    '<i data-lucide="upload" style="width:16px;height:16px"></i> Importar backup' +
    '<input type="file" accept=".json" style="display:none" onchange="window._importBackup(this)"/>' +
    '</label>' +
    '</div>' +

    // Logs
    '<div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Últimos erros (' + logs.length + ')</div>' +
    '<div class="vender-card" style="margin-bottom:14px">' +
    (logs.length === 0
      ? '<div style="font-size:13px;color:#a1a1aa;text-align:center;padding:16px">Sem erros registados</div>'
      : logs.map(l =>
          '<div style="padding:8px 0;border-bottom:1px solid #f4f4f5;font-size:12px">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:2px">' +
          '<span style="font-weight:700;color:' + (l.level==="error"?"#dc2626":l.level==="warn"?"#d97706":"#71717a") + '">' + l.level.toUpperCase() + '</span>' +
          '<span style="color:#a1a1aa">' + new Date(l.date).toLocaleString("pt-AO") + '</span>' +
          '</div>' +
          '<div style="color:#71717a">' + l.message + '</div>' +
          '</div>'
        ).join("")
    ) +
    (logs.length > 0
      ? '<button onclick="window._clearLogs()" style="width:100%;padding:10px;background:none;border:none;color:#dc2626;font-size:13px;font-weight:600;cursor:pointer;margin-top:8px">Limpar logs</button>'
      : "") +
    '</div>';

  refreshIcons(wrap);
}

window._saveConfiguracoes = async () => {
  const store = (await db.get("settings","store")) || {};
  await db.put("settings", {
    ...store,
    key:      "store",
    name:     el("cfg-name").value.trim()     || store.name,
    address:  el("cfg-addr").value.trim()     || store.address,
    phone:    el("cfg-phone").value.trim()    || store.phone,
    currency: el("cfg-currency").value.trim() || "Kz",
  });
  toast("Configurações guardadas.", "success");
};

window._exportBackup = async () => {
  try {
    const checksum = await backupService.download();
    toast("Backup exportado. Checksum: " + checksum.split(",").length + " stores.", "success");
  } catch(err) {
    toast("Erro ao exportar: " + err.message, "error");
  }
};

window._importBackup = async (input) => {
  const file = input.files[0];
  if (!file) return;
  input.value = "";
  const text = await file.text();

  openModal("Importar Backup",
    '<div style="background:#fef3c7;border:1.5px solid #fde68a;border-radius:12px;padding:14px;margin-bottom:16px">' +
    '<div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:6px">⚠ Atenção</div>' +
    '<div style="font-size:13px;color:#92400e;line-height:1.5">Importar um backup substitui os dados existentes. Esta acção não pode ser desfeita.</div>' +
    '</div>' +
    '<div style="font-size:13px;color:#71717a;margin-bottom:16px">Ficheiro: <strong>' + file.name + '</strong></div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" onclick="window._confirmImportBackup(\'' + encodeURIComponent(text) + '\')" style="background:#dc2626">' +
    '<i data-lucide="upload"></i> Confirmar importação</button>' +
    '</div>');
  refreshIcons(el("modal-box"));
};

window._confirmImportBackup = async (encodedText) => {
  try {
    const text    = decodeURIComponent(encodedText);
    const results = await backupService.import(text);
    const total   = Object.values(results).reduce((a,b) => a+b, 0);
    toast("Backup importado: " + total + " registos restaurados.", "success");
    closeModal();
    await renderConfiguracoes();
  } catch(err) {
    toast("Erro: " + err.message, "error");
  }
};

window._clearLogs = async () => {
  await clearLogs();
  toast("Logs limpos.", "success");
  await renderConfiguracoes();
};

window._closeModal = closeModal;
