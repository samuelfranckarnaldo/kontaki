import { db }                from "../db.js";
import { toast }             from "../toast.js";
import { openModal, closeModal } from "../modal.js";
import { refreshIcons }      from "../utils.js";
import { storeKeyService }   from "../services.js";
import { getUser }           from "../auth.js";
import { countAvailableCodes, isLowOnCodes, generateCodesForUser } from "../recovery-codes.js";
import { showRecoveryCodesScreen } from "../setup.js";

export async function loadSeguranca() {
  const btn = document.getElementById("btn-back-seguranca");
  if (btn) btn.onclick = () => window._showSubpage(null);
  window._showSubpage = window._showSubpage || (() => {});
  await renderSeguranca();
}

async function renderSeguranca() {
  const wrap = document.getElementById("seguranca-content");
  if (!wrap) return;

  const sk = await db.get("settings","storeKey");
  const hasKey     = !!((sk&&sk.value));
  const distributed= (sk&&sk.distributed) || false;
  const importedAt = (sk&&sk.importedAt)   || null;

  const user = getUser();
  const codesLeft = user ? await countAvailableCodes(user.id) : 0;
  const isLow = isLowOnCodes(codesLeft);

  wrap.innerHTML = `

    <!-- Códigos de recuperação -->
    <div style="background:${isLow?"#fffbeb":"#f0fdf4"};border:1.5px solid ${isLow?"#fde68a":"#bbf7d0"};
                border-radius:12px;padding:14px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:${isLow?"10px":"0"}">
        <div style="width:36px;height:36px;border-radius:50%;
                    background:${isLow?"#fef3c7":"#dcfce7"};
                    display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i data-lucide="key-round" style="width:18px;height:18px;color:${isLow?"#d97706":"#16a34a"}"></i>
        </div>
        <div style="flex:1">
          <div style="font-size:14px;font-weight:700;color:${isLow?"#d97706":"#16a34a"}">
            ${codesLeft} código${codesLeft===1?"":"s"} de recuperação disponíve${codesLeft===1?"l":"is"}
          </div>
          <div style="font-size:12px;color:#71717a;margin-top:2px">
            Usa-os se esqueceres o teu PIN
          </div>
        </div>
      </div>
      ${isLow ? `
      <div style="font-size:12px;color:#92400e;line-height:1.5;margin-bottom:10px">
        Restam poucos códigos. Gera um novo conjunto para não ficares sem acesso de recuperação.
      </div>` : ""}
      <button onclick="window._regenerateRecoveryCodes()"
              style="width:100%;padding:11px;background:#fff;border:1.5px solid ${isLow?"#fde68a":"#bbf7d0"};
                     color:${isLow?"#92400e":"#16a34a"};border-radius:10px;font-size:13px;font-weight:700;
                     cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px">
        <i data-lucide="refresh-cw" style="width:14px;height:14px"></i>
        Gerar novo conjunto de códigos
      </button>
    </div>

    <!-- Status da chave -->
    <div style="background:${hasKey?"#f0fdf4":"#fff5f5"};border:1.5px solid ${hasKey?"#bbf7d0":"#fca5a5"};
                border-radius:12px;padding:14px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div style="width:36px;height:36px;border-radius:50%;
                    background:${hasKey?"#dcfce7":"#fee2e2"};
                    display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i data-lucide="${hasKey?"shield-check":"shield-x"}"
             style="width:18px;height:18px;color:${hasKey?"#16a34a":"#dc2626"}"></i>
        </div>
        <div>
          <div style="font-size:14px;font-weight:700;color:${hasKey?"#16a34a":"#dc2626"}">
            ${hasKey?"Chave HMAC configurada":"Chave HMAC não configurada"}
          </div>
          <div style="font-size:12px;color:#71717a;margin-top:2px">
            ${hasKey
              ? distributed
                ? `Importada em ${new Date(importedAt).toLocaleDateString("pt-AO")}`
                : "Gerada neste dispositivo"
              : "Os ficheiros .ktk não podem ser verificados noutros dispositivos"}
          </div>
        </div>
      </div>
      ${!hasKey ? `
      <div style="font-size:12px;color:#dc2626;line-height:1.5">
        Instala a chave da loja para garantir a autenticidade dos ficheiros .ktk.
      </div>` : ""}
    </div>

    <!-- Exportar chave -->
    ${hasKey ? `
    <div style="margin-bottom:12px">
      <div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;
                  letter-spacing:.4px;margin-bottom:8px">Exportar chave da loja</div>
      <div style="font-size:13px;color:#71717a;margin-bottom:10px;line-height:1.5">
        Exporta a chave cifrada com uma senha. Envia o ficheiro ao próximo dispositivo
        via WhatsApp, Bluetooth ou cabo.
      </div>
      <div class="field" style="margin-bottom:10px">
        <label>Senha de protecção *</label>
        <input type="password" id="export-pw" placeholder="Mínimo 6 caracteres"/>
      </div>
      <div class="field" style="margin-bottom:12px">
        <label>Confirmar senha *</label>
        <input type="password" id="export-pw2" placeholder="Repete a senha"/>
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
    <div>
      <div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;
                  letter-spacing:.4px;margin-bottom:8px">Importar chave da loja</div>
      <div style="font-size:13px;color:#71717a;margin-bottom:10px;line-height:1.5">
        Importa a chave recebida do dispositivo principal. Todos os dispositivos
        devem usar a mesma chave para verificar ficheiros .ktk entre si.
      </div>
      <label style="display:flex;align-items:center;justify-content:center;gap:10px;
                    padding:14px;border:2px dashed #ddd6fe;border-radius:12px;
                    background:#faf5ff;cursor:pointer;margin-bottom:10px">
        <i data-lucide="upload" style="width:18px;height:18px;color:#5b21b6"></i>
        <span style="font-size:14px;font-weight:600;color:#5b21b6">
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
        <input type="password" id="import-pw" placeholder="Senha usada na exportação"/>
      </div>
      <button onclick="window._importStoreKey()"
              style="width:100%;padding:13px;background:#16a34a;color:#fff;border:none;
                     border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;
                     font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px">
        <i data-lucide="key" style="width:16px;height:16px"></i>
        Importar e instalar chave
      </button>
    </div>`;

  refreshIcons(wrap);
}

window._regenerateRecoveryCodes = async function() {
  const user = getUser();
  if (!user) return;
  if (!confirm("Gerar um novo conjunto de 10 códigos? Os códigos antigos deixam de funcionar.")) return;

  const codes = await generateCodesForUser(user.id);
  showRecoveryCodesScreen(codes, function() {
    renderSeguranca();
  });
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
