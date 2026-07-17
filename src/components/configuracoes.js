import { db }              from "../db.js";
import { getUser }         from "../auth.js";
import { fmt, el, val, refreshIcons } from "../utils.js";
import { toast }           from "../toast.js";
import { openModal, closeModal } from "../modal.js";
import { backupService }   from "../backup.js";
import { getLogs, clearLogs } from "../logger.js";
import { generateUUID } from "../services.js";

export async function loadConfiguracoes() {
  const btn = document.getElementById("btn-back-configuracoes");
  if (btn) btn.onclick = () => window._showSubpage(null);
  await renderConfiguracoes();
}

function sectionLabel(text) {
  return '<div style="font-size:12.5px;font-weight:600;color:var(--text3);margin-bottom:8px;margin-top:4px">' + text + '</div>';
}

async function renderConfiguracoes() {
  const wrap = document.getElementById("configuracoes-content");
  if (!wrap) return;

  const user = getUser();
  if (!user || user.role !== "admin") {
    wrap.innerHTML =
      '<div style="text-align:center;padding:48px 20px;color:var(--text4)">' +
      '<div style="font-size:14px;font-weight:600">Acesso restrito</div>' +
      '<div style="font-size:13px;margin-top:6px">Esta secção está disponível apenas para administradores.</div>' +
      '</div>';
    return;
  }

  const store = (await db.get("settings","store")) || {};
  const logs  = await getLogs(5);

  wrap.innerHTML =
    sectionLabel("Backup") +
    '<div class="vender-card" style="margin-bottom:14px;display:flex;flex-direction:column;gap:8px;border-radius:var(--radius-lg);box-shadow:var(--shadow-sm)">' +
    '<div style="font-size:13px;color:var(--text3);margin-bottom:4px;line-height:1.5">Exporta todos os dados da app para um ficheiro JSON. Usa para fazer backup ou transferir dados.</div>' +
    '<button onclick="window._exportBackup()" style="width:100%;padding:13px;background:var(--success);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px">' +
    '<i data-lucide="download" style="width:16px;height:16px"></i> Exportar backup</button>' +
    '<label style="display:flex;align-items:center;justify-content:center;gap:8px;padding:13px;border:2px dashed var(--border2);border-radius:10px;cursor:pointer;font-size:14px;font-weight:700;color:var(--primary)">' +
    '<i data-lucide="upload" style="width:16px;height:16px"></i> Importar backup' +
    '<input type="file" accept=".json" style="display:none" onchange="window._importBackup(this)"/>' +
    '</label>' +
    '</div>' +

    sectionLabel("Inventário") +
    '<div class="vender-card" style="margin-bottom:14px;border-radius:var(--radius-lg);box-shadow:var(--shadow-sm)">' +
    '<div style="font-size:13px;color:var(--text3);margin-bottom:12px;line-height:1.5">Define o que acontece quando alguém tenta vender um produto com um incidente de stock em aberto.</div>' +
    _incidentPolicyOption("block", store, "lock", "Bloquear vendas (recomendado)", "Produtos com incidente em aberto não podem ser vendidos até o incidente ser resolvido.") +
    _incidentPolicyOption("allow_with_auth", store, "alert-triangle", "Permitir com autorização", "A venda é permitida após confirmação com PIN de administrador. A decisão fica registada na auditoria.") +
    '</div>' +

    sectionLabel("Últimos erros (" + logs.length + ")") +
    '<div class="vender-card" style="margin-bottom:14px;border-radius:var(--radius-lg);box-shadow:var(--shadow-sm)">' +
    (logs.length === 0
      ? '<div style="font-size:13px;color:var(--text4);text-align:center;padding:16px">Sem erros registados</div>'
      : logs.map(l =>
          '<div style="padding:8px 0;border-bottom:1px solid var(--border2);font-size:12px">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:2px">' +
          '<span style="font-weight:700;color:' + (l.level==="error"?"var(--danger)":l.level==="warn"?"var(--warning)":"var(--text3)") + '">' + l.level.toUpperCase() + '</span>' +
          '<span style="color:var(--text4)">' + new Date(l.date).toLocaleString("pt-AO") + '</span>' +
          '</div>' +
          '<div style="color:var(--text3)">' + l.message + '</div>' +
          '</div>'
        ).join("")
    ) +
    (logs.length > 0
      ? '<button onclick="window._clearLogs()" style="width:100%;padding:10px;background:none;border:none;color:var(--danger);font-size:13px;font-weight:600;cursor:pointer;margin-top:8px">Limpar logs</button>'
      : "") +
    '</div>';

  refreshIcons(wrap);
}

function _incidentPolicyOption(value, store, icon, title, desc) {
  const policy = store.stockIncidentPolicy || "block";
  const active = policy === value;
  return '<label style="display:flex;align-items:flex-start;gap:10px;padding:12px;border:1.5px solid ' + (active?"var(--primary)":"var(--border2)") + ';border-radius:10px;margin-bottom:8px;cursor:pointer;background:' + (active?"var(--primary-light)":"var(--bg2)") + '">' +
    '<input type="radio" name="inc-policy" value="' + value + '" ' + (active?"checked":"") + ' onchange="window._setIncidentPolicy(&#39;' + value + '&#39;)" style="margin-top:2px"/>' +
    '<div style="width:32px;height:32px;border-radius:9px;background:' + (active?"#fff":"var(--border2)") + ';color:var(--primary);display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
    '<i data-lucide="' + icon + '" style="width:16px;height:16px"></i></div>' +
    '<div><div style="font-size:14px;font-weight:700;color:var(--text)">' + title + '</div>' +
    '<div style="font-size:12px;color:var(--text3);margin-top:2px">' + desc + '</div></div>' +
    '</label>';
}

window._setIncidentPolicy = async (policy) => {
  const store = (await db.get("settings","store")) || {};
  await db.put("settings", { ...store, key:"store", stockIncidentPolicy: policy });
  toast("Política de inventário actualizada.", "success");
  await renderConfiguracoes();
};

window._exportBackup = async () => {
  const licMod = await import("../license.js");
  if (!licMod.hasFeature("backup")) {
    licMod.showUpgradeBanner("Backup disponível a partir do plano Standard. Contacta a Introxeer para upgrade.");
    return;
  }
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
    '<div style="background:var(--warning-muted-light);border:1.5px solid var(--warning-muted);border-radius:12px;padding:14px;margin-bottom:16px;display:flex;gap:10px;align-items:flex-start">' +
    '<i data-lucide="alert-triangle" style="width:18px;height:18px;color:var(--warning-muted);flex-shrink:0;margin-top:1px"></i>' +
    '<div><div style="font-size:13px;font-weight:700;color:var(--warning-muted);margin-bottom:4px">Atenção</div>' +
    '<div style="font-size:13px;color:var(--warning-muted);line-height:1.5">Importar um backup substitui os dados existentes. Esta acção não pode ser desfeita.</div></div>' +
    '</div>' +
    '<div style="font-size:13px;color:var(--text3);margin-bottom:16px">Ficheiro: <strong>' + file.name + '</strong></div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" onclick="window._confirmImportBackup(&#39;' + encodeURIComponent(text) + '&#39;)" style="background:var(--danger)">' +
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
