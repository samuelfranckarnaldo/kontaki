import { db }              from "../db.js";
import { getUser }         from "../auth.js";
import { fmt, el, val, refreshIcons } from "../utils.js";
import { toast }           from "../toast.js";
import { openModal, closeModal, confirmDialog } from "../modal.js";
import { backupService }   from "../backup.js";
import { getLogs, clearLogs } from "../logger.js";
import { generateUUID, verifyAdminPin } from "../services.js";

window._regenerateSyncId = function() {
  confirmDialog(
    "Gerar um novo identificador de sincronização? Isto é útil se a loja não conseguir sincronizar com o Console. A app continua a funcionar normalmente offline.",
    async function() {
      try {
        var newId = generateUUID();
        await db.put("settings", { key: "storeId", value: newId, createdAt: new Date().toISOString() });
        toast("Identificador regenerado. A sincronizar…", "success");

        var syncMod = await import("../sync.js");
        await syncMod.syncRegister();
        toast("Sincronização de registo concluída.", "success");
      } catch (e) {
        toast("Erro ao regenerar identificador: " + (e.message || e), "error");
      }
    },
    { confirmText: "Gerar" }
  );
};

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

    sectionLabel("Devolução") +
    '<div class="vender-card" style="margin-bottom:14px;border-radius:var(--radius-lg);box-shadow:var(--shadow-sm)">' +
    '<div style="font-size:13px;color:var(--text3);margin-bottom:12px;line-height:1.5">Define até quantos dias após a venda uma devolução pode ser feita.</div>' +
    '<div class="field" style="margin-bottom:14px">' +
    '<label>Dias máximos para devolução</label>' +
    '<input type="number" id="dev-max-dias" min="0" value="' + (store.devolucaoMaxDias != null ? store.devolucaoMaxDias : 30) + '" onchange="window._setDevolucaoMaxDias(this.value)"/>' +
    '</div>' +
    _devolucaoPolicyOption("bloquear", store, "lock", "Bloquear fora do prazo", "Depois do limite de dias, a devolução não pode ser feita por ninguém.") +
    _devolucaoPolicyOption("avisar", store, "alert-triangle", "Apenas avisar (mais liberdade)", "Depois do limite de dias, mostra um aviso mas continua a permitir a devolução.") +
    '</div>' +

    sectionLabel("Sincronização") +
    '<div class="vender-card" style="margin-bottom:14px;border-radius:var(--radius-lg);box-shadow:var(--shadow-sm)">' +
    '<div style="font-size:13px;color:var(--text3);margin-bottom:12px;line-height:1.5">Se esta loja deixou de sincronizar corretamente com o Console (ex.: depois de testes ou troca de dispositivo), podes gerar um novo identificador de sincronização. A loja continua a funcionar normalmente offline.</div>' +
    '<button onclick="window._regenerateSyncId()" style="width:100%;padding:13px;background:none;border:1.5px solid var(--warning);color:var(--warning);border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px">' +
    '<i data-lucide="refresh-cw" style="width:16px;height:16px"></i> Regenerar identificador de sincronização</button>' +
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
    '</div>' +

    '<div style="text-align:center;margin-top:24px;padding-bottom:8px">' +
    '<button onclick="window._openDeleteAccount()" style="background:none;border:none;color:var(--text4);font-size:12px;font-weight:600;cursor:pointer;padding:8px">Eliminar conta</button>' +
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

function _devolucaoPolicyOption(value, store, icon, title, desc) {
  const policy = store.devolucaoForaPrazoPolicy || "bloquear";
  const active = policy === value;
  return '<label style="display:flex;align-items:flex-start;gap:10px;padding:12px;border:1.5px solid ' + (active?"var(--primary)":"var(--border2)") + ';border-radius:10px;margin-bottom:8px;cursor:pointer;background:' + (active?"var(--primary-light)":"var(--bg2)") + '">' +
    '<input type="radio" name="dev-policy" value="' + value + '" ' + (active?"checked":"") + ' onchange="window._setDevolucaoPolicy(&#39;' + value + '&#39;)" style="margin-top:2px"/>' +
    '<div style="width:32px;height:32px;border-radius:9px;background:' + (active?"#fff":"var(--border2)") + ';color:var(--primary);display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
    '<i data-lucide="' + icon + '" style="width:16px;height:16px"></i></div>' +
    '<div><div style="font-size:14px;font-weight:700;color:var(--text)">' + title + '</div>' +
    '<div style="font-size:12px;color:var(--text3);margin-top:2px">' + desc + '</div></div>' +
    '</label>';
}

window._setDevolucaoMaxDias = async (value) => {
  const dias = parseInt(value);
  if (isNaN(dias) || dias < 0) { toast("Introduz um número de dias válido.", "error"); return; }
  const store = (await db.get("settings","store")) || {};
  await db.put("settings", { ...store, key:"store", devolucaoMaxDias: dias });
  toast("Limite de dias actualizado.", "success");
};

window._setDevolucaoPolicy = async (policy) => {
  const store = (await db.get("settings","store")) || {};
  await db.put("settings", { ...store, key:"store", devolucaoForaPrazoPolicy: policy });
  toast("Política de devolução actualizada.", "success");
  await renderConfiguracoes();
};

window._exportBackup = async () => {
  const licMod = await import("../license.js");
  if (!licMod.hasFeature("backup")) {
    licMod.showUpgradeBanner("Backup disponível a partir do plano Pro. Contacta a Introxeer para upgrade.");
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

  // Guarda o conteúdo numa variável, nunca embutido no HTML/onclick — um
  // backup completo pode já ter megabytes (histórico de vendas, auditoria,
  // contabilidade), e uma string desse tamanho dentro de um atributo HTML
  // arrisca rebentar o WebView (mesma classe de bug já corrigida no botão
  // de partilhar .ktk via WhatsApp).
  window._pendingBackupImport = text;

  openModal("Importar Backup",
    '<div style="background:var(--warning-muted-light);border:1.5px solid var(--warning-muted);border-radius:12px;padding:14px;margin-bottom:16px;display:flex;gap:10px;align-items:flex-start">' +
    '<i data-lucide="alert-triangle" style="width:18px;height:18px;color:var(--warning-muted);flex-shrink:0;margin-top:1px"></i>' +
    '<div><div style="font-size:13px;font-weight:700;color:var(--warning-muted);margin-bottom:4px">Atenção</div>' +
    '<div style="font-size:13px;color:var(--warning-muted);line-height:1.5">Importar um backup substitui os dados existentes. Esta acção não pode ser desfeita.</div></div>' +
    '</div>' +
    '<div style="font-size:13px;color:var(--text3);margin-bottom:16px">Ficheiro: <strong>' + file.name + '</strong></div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" onclick="window._confirmImportBackup()" style="background:var(--danger)">' +
    '<i data-lucide="upload"></i> Confirmar importação</button>' +
    '</div>');
  refreshIcons(el("modal-box"));
};

window._confirmImportBackup = async () => {
  const body = el("modal-body");
  if (body) {
    body.innerHTML =
      '<div style="display:flex;flex-direction:column;align-items:center;gap:14px;padding:20px 0">' +
      '<div style="width:36px;height:36px;border:3px solid var(--border);border-top-color:var(--danger);border-radius:50%;animation:importSpin .8s linear infinite"></div>' +
      '<div style="font-size:13.5px;font-weight:600;color:var(--text3)">A importar backup\u2026</div>' +
      '</div>';
    if (!document.getElementById("import-spin-style")) {
      const s = document.createElement("style");
      s.id = "import-spin-style";
      s.textContent = "@keyframes importSpin { to { transform: rotate(360deg) } }";
      document.head.appendChild(s);
    }
  }

  try {
    const text = window._pendingBackupImport;
    if (!text) { toast("Nada para importar.", "error"); closeModal(); return; }
    const results = await backupService.import(text);
    const total   = Object.values(results).reduce((a,b) => a+b, 0);
    toast("Backup importado: " + total + " registos restaurados.", "success");
    window._pendingBackupImport = null;
    closeModal();
    await renderConfiguracoes();
  } catch(err) {
    toast("Erro: " + err.message, "error");
    closeModal();
  }
};

window._clearLogs = async () => {
  await clearLogs();
  toast("Logs limpos.", "success");
  await renderConfiguracoes();
};

window._closeModal = closeModal;

// ── ELIMINAR CONTA ───────────────────────────────────────────────────────────
window._openDeleteAccount = () => {
  openModal("Eliminar conta",
    '<div style="background:var(--danger-muted-light);border:1.5px solid var(--danger-muted);border-radius:12px;padding:14px;margin-bottom:16px;display:flex;gap:10px;align-items:flex-start">' +
    '<i data-lucide="alert-triangle" style="width:18px;height:18px;color:var(--danger-muted);flex-shrink:0;margin-top:1px"></i>' +
    '<div><div style="font-size:13px;font-weight:700;color:var(--danger-muted);margin-bottom:4px">Isto é irreversível</div>' +
    '<div style="font-size:13px;color:var(--danger-muted);line-height:1.5">Todos os dados desta loja — vendas, clientes, produtos, histórico e configurações — serão apagados permanentemente deste dispositivo. Não há forma de recuperar depois.</div></div>' +
    '</div>' +
    '<div style="font-size:13px;color:var(--text3);margin-bottom:16px">Queres exportar um backup antes de continuar?</div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" onclick="window._deleteAccountWithBackup()">' +
    '<i data-lucide="download"></i> Exportar backup e continuar</button>' +
    '<button class="btn btn-full" style="background:var(--danger);color:#fff" onclick="window._openDeleteAccountPin()">Continuar sem backup</button>' +
    '</div>');
  refreshIcons(el("modal-box"));
};

window._deleteAccountWithBackup = async () => {
  try {
    await backupService.download();
    toast("Backup exportado.", "success");
  } catch(err) {
    toast("Erro ao exportar: " + err.message, "error");
    return;
  }
  window._openDeleteAccountPin();
};

window._openDeleteAccountPin = () => {
  openModal("Confirmar com PIN",
    '<div style="font-size:13px;color:var(--text3);margin-bottom:16px">Introduz o PIN de administrador para confirmar a eliminação.</div>' +
    '<input id="delacc-pin" type="password" inputmode="numeric" placeholder="PIN de administrador" autocomplete="off" ' +
    'style="width:100%;padding:13px;border:1.5px solid var(--border2);border-radius:10px;font-size:16px;font-family:inherit;text-align:center;letter-spacing:4px;margin-bottom:16px;box-sizing:border-box"/>' +
    '<div id="delacc-err" style="display:none;color:var(--danger);font-size:12.5px;font-weight:600;margin:-8px 0 12px;text-align:center">PIN inválido.</div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
    '<button class="btn btn-full" style="background:var(--danger);color:#fff" onclick="window._confirmDeleteAccountPin()">Confirmar</button>' +
    '</div>');
  refreshIcons(el("modal-box"));
  setTimeout(function() { var i = document.getElementById("delacc-pin"); if (i) i.focus(); }, 100);
};

window._confirmDeleteAccountPin = async () => {
  const pinEl = document.getElementById("delacc-pin");
  const errEl = document.getElementById("delacc-err");
  const pin = pinEl ? pinEl.value.trim() : "";
  if (!pin) { if (errEl) errEl.style.display = "block"; return; }

  const result = await verifyAdminPin(pin);
  if (!result.ok) {
    if (errEl) errEl.style.display = "block";
    if (pinEl) { pinEl.value = ""; pinEl.focus(); }
    return;
  }

  openModal("Última confirmação",
    '<div style="font-size:14px;color:var(--text);line-height:1.6;margin-bottom:16px;text-align:center">' +
    'Tens a certeza absoluta? Todos os dados de <strong>' + result.admin.name + '</strong> e da loja vão ser apagados agora.</div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
    '<button class="btn btn-full" style="background:var(--danger);color:#fff" onclick="window._executeDeleteAccount()">Eliminar tudo agora</button>' +
    '</div>');
  refreshIcons(el("modal-box"));
};

window._executeDeleteAccount = async () => {
  const body = el("modal-body");
  if (body) {
    body.innerHTML =
      '<div style="display:flex;flex-direction:column;align-items:center;gap:14px;padding:20px 0">' +
      '<div style="width:36px;height:36px;border:3px solid var(--border);border-top-color:var(--danger);border-radius:50%;animation:importSpin .8s linear infinite"></div>' +
      '<div style="font-size:13.5px;font-weight:600;color:var(--text3)">A eliminar todos os dados…</div>' +
      '</div>';
  }
  try {
    indexedDB.deleteDatabase("kontaki_db");
    localStorage.clear();
    sessionStorage.clear();
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) { await reg.unregister(); }
    }
    setTimeout(function() {
      location.href = "/";
      location.reload(true);
    }, 800);
  } catch(err) {
    toast("Erro ao eliminar: " + err.message, "error");
  }
};
