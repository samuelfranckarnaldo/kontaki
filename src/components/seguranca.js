import { db }                from "../db.js";
import { toast }             from "../toast.js";
import { openModal, closeModal, confirmDialog } from "../modal.js";
import { refreshIcons, generateQR } from "../utils.js";
import { storeKeyService, verifyAdminPin } from "../services.js";
import { getUser }           from "../auth.js";
import { countAvailableCodes, isLowOnCodes, generateCodesForUser } from "../recovery-codes.js";
import { showRecoveryCodesScreen } from "../setup.js";
import { ensureStoreId } from "../invite.js";

window._togglePwVisibility = function(id) {
  var input = document.getElementById(id);
  var icon  = document.getElementById(id + "-eye");
  if (!input || !icon) return;
  var isPw = input.type === "password";
  input.type = isPw ? "text" : "password";
  icon.setAttribute("data-lucide", isPw ? "eye-off" : "eye");
  refreshIcons(icon.parentElement);
};

export async function loadSeguranca() {
  const btn = document.getElementById("btn-back-seguranca");
  if (btn) btn.onclick = () => window._showSubpage(null);
  window._showSubpage = window._showSubpage || (() => {});
  await renderSeguranca();
}

var _segActiveTab = "geral";
var SEG_TABS = [
  { key: "geral", label: "Geral" },
  { key: "chave", label: "Chave da loja" },
];

window._segSwitchTab = function(tab) {
  _segActiveTab = tab;
  renderSeguranca();
};

function _renderSegTabs(wrap) {
  var tabsEl = wrap.querySelector("#seg-tabs");
  if (!tabsEl) return;
  tabsEl.innerHTML = SEG_TABS.map(function(t) {
    var active = _segActiveTab === t.key;
    return '<button class="ct-tab' + (active ? " active" : "") + '" data-tab="' + t.key + '" onclick="window._segSwitchTab(\'' + t.key + '\')">' + t.label + '</button>';
  }).join("") + '<div class="ct-tab-indicator" id="seg-tab-indicator"></div>';

  var indicator = tabsEl.querySelector("#seg-tab-indicator");
  var activeBtn = tabsEl.querySelector('.ct-tab[data-tab="' + _segActiveTab + '"]');
  if (indicator && activeBtn) {
    indicator.style.width = "1px";
    indicator.style.transformOrigin = "left center";
    indicator.style.willChange = "transform";
    indicator.style.transform = "translateX(" + activeBtn.offsetLeft + "px) scaleX(" + activeBtn.offsetWidth + ")";
  }
}

async function renderSeguranca() {
  const wrap = document.getElementById("seguranca-content");
  if (!wrap) return;

  const sk = await db.get("settings","storeKey");
  const hasKey     = !!((sk&&sk.value));
  const distributed= (sk&&sk.distributed) || false;
  const importedAt = (sk&&sk.importedAt)   || null;

  const wsLink   = await db.get("settings","workspaceLink");
  const isLinked = !!(wsLink && wsLink.status === "active");
  // storeId real (o mesmo que sync.js envia ao Console) — settings.storeId
  // era uma chave órfã nunca lida por ninguém além deste ecrã.
  const publicStoreId = await ensureStoreId();

  const user = getUser();
  const codesLeft = user ? await countAvailableCodes(user.id) : 0;
  const isLow = isLowOnCodes(codesLeft);

  const geralHtml = `
    <!-- Códigos de recuperação -->
    <div style="background:${isLow?"#fffbeb":"#f0fdf4"};border:1.5px solid ${isLow?"#fde68a":"#bbf7d0"};
                border-radius:12px;padding:10px 12px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:${isLow?"8px":"0"}">
        <div style="width:28px;height:28px;border-radius:50%;
                    background:${isLow?"#fef3c7":"#dcfce7"};
                    display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i data-lucide="key-round" style="width:15px;height:15px;color:${isLow?"#d97706":"#16a34a"}"></i>
        </div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700;color:${isLow?"#d97706":"#16a34a"}">
            ${codesLeft} código${codesLeft===1?"":"s"} de recuperação disponíve${codesLeft===1?"l":"is"}
          </div>
          <div style="font-size:11px;color:#71717a;margin-top:1px">
            Usa-os se esqueceres o teu PIN
          </div>
        </div>
        ${!isLow ? `
        <button id="regen-codes-btn-sm" onclick="window._regenerateRecoveryCodes()"
                style="background:none;border:none;color:#16a34a;font-size:11px;font-weight:700;
                       cursor:pointer;font-family:inherit;flex-shrink:0">
          Gerar novos
        </button>` : ""}
      </div>
      ${isLow ? `
      <div style="font-size:12px;color:#92400e;line-height:1.5;margin-bottom:8px">
        Restam poucos códigos. Gera um novo conjunto para não ficares sem acesso de recuperação.
      </div>
      <button id="regen-codes-btn-lg" onclick="window._regenerateRecoveryCodes()"
              style="width:100%;padding:9px;background:#fff;border:1.5px solid #fde68a;
                     color:#92400e;border-radius:10px;font-size:12.5px;font-weight:700;
                     cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px">
        <i data-lucide="refresh-cw" id="regen-codes-icon-lg" style="width:13px;height:13px"></i>
        <span id="regen-codes-label-lg">Gerar novo conjunto de códigos</span>
      </button>` : ""}
    </div>

    <!-- Workspace -->
    <div class="list-card" style="padding:16px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="width:32px;height:32px;border-radius:9px;background:#ede9fe;
                    display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i data-lucide="network" style="width:16px;height:16px;color:#5b21b6"></i>
        </div>
        <div style="font-size:14.5px;font-weight:700;color:#18181b">Workspace</div>
      </div>
      ${isLinked ? `
      <div style="font-size:13px;color:#71717a;margin-bottom:12px;line-height:1.5">
        Esta loja está ligada ao Workspace desde ${new Date(wsLink.linkedAt).toLocaleDateString("pt-AO")}.
        O dono da empresa pode gerir esta loja remotamente.
      </div>
      <button onclick="window._removeWorkspaceLink()"
              style="width:100%;padding:13px;background:transparent;color:var(--danger);
                     border:1.5px solid var(--danger);border-radius:12px;font-size:14px;font-weight:700;
                     cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px">
        <i data-lucide="unlink" style="width:16px;height:16px"></i>
        Remover ligação
      </button>` : `
      <div style="font-size:13px;color:#71717a;margin-bottom:12px;line-height:1.5">
        Para ligar esta loja ao Workspace, o dono precisa deste identificador. Introduz este
        ID na app Workspace, ou pede-lhe para ler o código abaixo.
      </div>
      <div style="background:var(--bg2);border-radius:10px;padding:12px;margin-bottom:12px;
                  display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span style="font-family:ui-monospace,monospace;font-size:13px;color:var(--text2);word-break:break-all">
          ${publicStoreId || "—"}
        </span>
        ${publicStoreId ? `
        <button onclick="window._copyStoreId()" style="background:none;border:none;color:#5b21b6;
                flex-shrink:0;cursor:pointer;padding:4px;display:flex">
          <i data-lucide="copy" style="width:16px;height:16px"></i>
        </button>` : ""}
      </div>
      ${publicStoreId ? `
      <div style="display:flex;justify-content:center;padding:12px 0">
        <div id="workspace-qr"></div>
      </div>` : ""}`}
    </div>`;

  const chaveHtml = `
    <!-- Status da chave -->
    <div style="background:${hasKey?"#f0fdf4":"#fff5f5"};border:1.5px solid ${hasKey?"#bbf7d0":"#fca5a5"};
                border-radius:12px;padding:10px 12px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:8px">
        <div style="width:28px;height:28px;border-radius:50%;
                    background:${hasKey?"#dcfce7":"#fee2e2"};
                    display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i data-lucide="${hasKey?"shield-check":"shield-x"}"
             style="width:15px;height:15px;color:${hasKey?"#16a34a":"#dc2626"}"></i>
        </div>
        <div>
          <div style="font-size:13px;font-weight:700;color:${hasKey?"#16a34a":"#dc2626"}">
            ${hasKey?"Chave HMAC configurada":"Chave HMAC não configurada"}
          </div>
          <div style="font-size:11px;color:#71717a;margin-top:1px">
            ${hasKey
              ? distributed
                ? `Importada em ${new Date(importedAt).toLocaleDateString("pt-AO")}`
                : "Gerada neste dispositivo"
              : "Os ficheiros .ktk não podem ser verificados noutros dispositivos"}
          </div>
        </div>
      </div>
      ${!hasKey ? `
      <div style="font-size:12px;color:#dc2626;line-height:1.5;margin-top:8px">
        Instala a chave da loja para garantir a autenticidade dos ficheiros .ktk.
      </div>` : ""}
    </div>

    <!-- Exportar chave -->
    ${hasKey ? `
    <div class="list-card" style="padding:16px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="width:32px;height:32px;border-radius:9px;background:#ede9fe;
                    display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i data-lucide="download" style="width:16px;height:16px;color:#5b21b6"></i>
        </div>
        <div style="font-size:14.5px;font-weight:700;color:#18181b">Exportar chave da loja</div>
      </div>
      <div style="font-size:13px;color:#71717a;margin-bottom:12px;line-height:1.5">
        Exporta a chave cifrada com uma senha. Envia o ficheiro ao próximo dispositivo
        via WhatsApp, Bluetooth ou cabo.
      </div>
      <div class="field" style="margin-bottom:10px">
        <label>Senha de protecção *</label>
        <div style="position:relative">
          <input type="password" id="export-pw" placeholder="Mínimo 6 caracteres" style="padding-right:42px"/>
          <button type="button" onclick="window._togglePwVisibility('export-pw')" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:#9ca3af;cursor:pointer;padding:4px;display:flex">
            <i data-lucide="eye" id="export-pw-eye" style="width:17px;height:17px"></i>
          </button>
        </div>
      </div>
      <div class="field" style="margin-bottom:12px">
        <label>Confirmar senha *</label>
        <div style="position:relative">
          <input type="password" id="export-pw2" placeholder="Repete a senha" style="padding-right:42px"/>
          <button type="button" onclick="window._togglePwVisibility('export-pw2')" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:#9ca3af;cursor:pointer;padding:4px;display:flex">
            <i data-lucide="eye" id="export-pw2-eye" style="width:17px;height:17px"></i>
          </button>
        </div>
      </div>
      <button onclick="window._exportStoreKey()"
              style="width:100%;padding:13px;background:#5b21b6;color:#fff;border:none;
                     border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;
                     font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px">
        <i data-lucide="download" style="width:16px;height:16px"></i>
        Exportar chave cifrada (.json)
      </button>
    </div>` : ""}

    <!-- Importar chave -->
    <div class="list-card" style="padding:16px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="width:32px;height:32px;border-radius:9px;background:#ede9fe;
                    display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i data-lucide="upload" style="width:16px;height:16px;color:#5b21b6"></i>
        </div>
        <div style="font-size:14.5px;font-weight:700;color:#18181b">Importar chave da loja</div>
      </div>
      <div style="font-size:13px;color:#71717a;margin-bottom:12px;line-height:1.5">
        Importa a chave recebida do dispositivo principal. Todos os dispositivos
        devem usar a mesma chave para verificar ficheiros .ktk entre si.
      </div>
      <label style="display:flex;align-items:center;justify-content:center;gap:10px;
                    padding:13px;border:1.5px solid var(--border);border-radius:10px;
                    background:var(--bg2);cursor:pointer;margin-bottom:10px">
        <i data-lucide="upload" style="width:16px;height:16px;color:var(--text3)"></i>
        <span style="font-size:13.5px;font-weight:600;color:var(--text2)">
          Seleccionar ficheiro de chave (.json)
        </span>
        <input type="file" accept=".json" id="import-key-file"
               style="display:none" onchange="window._loadKeyFile(this)"/>
      </label>
      <div id="key-file-preview" style="display:none;background:#f4f4f5;border-radius:10px;
                                         padding:10px 12px;margin-bottom:10px;font-size:12px;
                                         color:#71717a"></div>
      <div class="field" style="margin-bottom:10px">
        <label>Senha do ficheiro *</label>
        <div style="position:relative">
          <input type="password" id="import-pw" placeholder="Senha usada na exportação" style="padding-right:42px"/>
          <button type="button" onclick="window._togglePwVisibility('import-pw')" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:#9ca3af;cursor:pointer;padding:4px;display:flex">
            <i data-lucide="eye" id="import-pw-eye" style="width:17px;height:17px"></i>
          </button>
        </div>
      </div>
      <button onclick="window._importStoreKey()"
              style="width:100%;padding:13px;background:#5b21b6;color:#fff;border:none;
                     border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;
                     font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px">
        <i data-lucide="key" style="width:16px;height:16px"></i>
        Importar e instalar chave
      </button>
    </div>`;

  wrap.innerHTML = '<div class="ct-tabbar ct-tabbar--evenly" id="seg-tabs" style="margin-bottom:14px"></div>' +
    (_segActiveTab === "geral" ? geralHtml : chaveHtml);

  _renderSegTabs(wrap);
  refreshIcons(wrap);

  if (_segActiveTab === "geral" && !isLinked && publicStoreId) {
    const qrEl = document.getElementById("workspace-qr");
    if (qrEl) generateQR(publicStoreId, qrEl, 140);
  }
}

window._copyStoreId = async function() {
  const publicStoreId = await ensureStoreId();
  if (!publicStoreId) return;
  try {
    await navigator.clipboard.writeText(publicStoreId);
    toast("ID copiado.","success");
  } catch {
    toast("Não foi possível copiar.","error");
  }
};

var WORKSPACE_CONSOLE_API_SEG = "https://kontaki-console.vercel.app/api";

async function getLicenseCodeSeg() {
  var lic = await db.get("settings", "license");
  return lic ? lic.code : null;
}

window._removeWorkspaceLink = function() {
  openModal("Confirmar administrador",
    '<div style="font-size:13px;color:var(--text3);line-height:1.6;margin-bottom:16px">' +
    'É necessário o PIN de um administrador para remover a ligação ao Workspace.' +
    '</div>' +
    '<div class="field" style="margin-bottom:14px">' +
    '<label>PIN do administrador</label>' +
    '<input type="password" inputmode="numeric" maxlength="6" id="unlink-pin" placeholder="......" style="width:100%;padding:12px;border:1.5px solid var(--border);border-radius:10px;font-size:18px;text-align:center;letter-spacing:6px;font-family:inherit"/>' +
    '</div>' +
    '<div id="unlink-err" style="display:none;color:var(--danger);font-size:12px;margin-bottom:10px"></div>' +
    '<div style="display:flex;gap:8px">' +
    '<button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary btn-full" onclick="window._submitRemoveWorkspaceLink()">Confirmar</button>' +
    '</div>');
  refreshIcons(document.getElementById("modal-box"));
};

window._submitRemoveWorkspaceLink = async function() {
  const pinEl = document.getElementById("unlink-pin");
  const pin = pinEl ? pinEl.value : "";
  const errEl = document.getElementById("unlink-err");
  if (!pin || pin.length < 4) {
    if (errEl) { errEl.style.display = "block"; errEl.textContent = "Introduz o PIN."; }
    return;
  }
  const result = await verifyAdminPin(pin);
  if (!result.ok) {
    if (errEl) { errEl.style.display = "block"; errEl.textContent = "PIN inválido."; }
    return;
  }
  closeModal();

  const licenseCode = await getLicenseCodeSeg();
  if (!licenseCode) { toast("Licença não encontrada.","error"); return; }

  try {
    const res = await fetch(WORKSPACE_CONSOLE_API_SEG + "/workspace-auth/unlink", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenseCode: licenseCode }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast(body.error || "Erro ao remover ligação.","error"); return; }

    await db.put("settings", { key: "workspaceLink", status: "removed", removedAt: new Date().toISOString() });
    toast("Ligação removida.","success");
    await renderSeguranca();
  } catch (e) {
    toast("Erro de rede ao remover ligação.","error");
  }
};

window._regenerateRecoveryCodes = async function() {
  const user = getUser();
  if (!user) return;
  confirmDialog(
    "Gerar um novo conjunto de 10 códigos? Os códigos antigos deixam de funcionar.",
    async function() {
      // Feedback de carregamento — gerar códigos envolve hashing e escrita
      // no IndexedDB, que pode levar um instante percetível; sem isto o
      // utilizador pode pensar que o clique não teve efeito e repetir.
      const btnSm = document.getElementById("regen-codes-btn-sm");
      const btnLg = document.getElementById("regen-codes-btn-lg");
      const labelLg = document.getElementById("regen-codes-label-lg");
      const iconLg = document.getElementById("regen-codes-icon-lg");
      const originalSmText = btnSm ? btnSm.textContent : null;
      const originalLgText = labelLg ? labelLg.textContent : null;

      if (btnSm) { btnSm.disabled = true; btnSm.style.opacity = "0.5"; btnSm.textContent = "A gerar..."; }
      if (btnLg) { btnLg.disabled = true; btnLg.style.opacity = "0.6"; btnLg.style.pointerEvents = "none"; }
      if (labelLg) labelLg.textContent = "A gerar...";
      if (iconLg) iconLg.style.animation = "boot-spin .8s linear infinite";

      try {
        const codes = await generateCodesForUser(user.id);
        showRecoveryCodesScreen(codes, function() {
          renderSeguranca();
        });
      } catch (e) {
        const { logger } = await import("../logger.js");
        logger.error("[_regenerateRecoveryCodes] falhou", e);
        toast(e.message || "Erro ao gerar códigos de recuperação.", "error");
        if (btnSm) { btnSm.disabled = false; btnSm.style.opacity = "1"; btnSm.textContent = originalSmText; }
        if (btnLg) { btnLg.disabled = false; btnLg.style.opacity = "1"; btnLg.style.pointerEvents = "auto"; }
        if (labelLg) labelLg.textContent = originalLgText;
        if (iconLg) iconLg.style.animation = "";
      }
    },
    { danger: true, confirmText: "Gerar" }
  );
};

let _keyFileData = null;

window._loadKeyFile = async (input) => {
  const file = input.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    JSON.parse(text); // valida JSON
    _keyFileData = text;
    const preview = document.getElementById("key-file-preview");
    preview.style.display = "block";
    preview.textContent   = `Ficheiro carregado: ${file.name}`;
    input.value = "";
  } catch {
    toast("Ficheiro inválido.","error");
    input.value = "";
  }
};

window._exportStoreKey = async () => {
  const pw  = (document.getElementById("export-pw") ? document.getElementById("export-pw").value : "");
  const pw2 = (document.getElementById("export-pw2") ? document.getElementById("export-pw2").value : "");
  if (!pw || pw.length < 6) { toast("A senha deve ter pelo menos 6 caracteres.","error"); return; }
  if (pw !== pw2)           { toast("As senhas não coincidem.","error"); return; }

  try {
    const exported = await storeKeyService.export(pw);
    const blob     = new Blob([exported],{type:"application/json"});
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement("a");
    a.href         = url;
    a.download     = `kontaki_chave_loja_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Chave exportada. Envia o ficheiro ao próximo dispositivo.","success");
    document.getElementById("export-pw").value  = "";
    document.getElementById("export-pw2").value = "";
  } catch(err) {
    toast("Erro ao exportar: "+err.message,"error");
  }
};

window._importStoreKey = async () => {
  const pw = (document.getElementById("import-pw") ? document.getElementById("import-pw").value : "");
  if (!_keyFileData) { toast("Selecciona o ficheiro de chave primeiro.","error"); return; }
  if (!pw)           { toast("Insere a senha.","error"); return; }

  try {
    await storeKeyService.import(_keyFileData, pw);
    _keyFileData = null;
    toast("Chave instalada com sucesso! Este dispositivo pode agora verificar ficheiros .ktk.","success");
    document.getElementById("import-pw").value = "";
    document.getElementById("key-file-preview").style.display = "none";
    await renderSeguranca();
  } catch(err) {
    toast("Erro: "+err.message,"error");
  }
};
