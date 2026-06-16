import { db, isFirstTime } from "./db.js";
import { hashPassword }    from "./crypto.js";
import { refreshIcons }    from "./utils.js";

export async function checkSetup() {
  const first = await isFirstTime();
  if (!first) return false;

  showSetup();
  return true;
}

function showSetup() {
  var overlay = document.createElement("div");
  overlay.id  = "setup-overlay";
  overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:#fff;z-index:9999;overflow-y:auto;display:flex;flex-direction:column";

  overlay.innerHTML =
    '<div style="background:linear-gradient(135deg,#5b21b6,#7c3aed);padding:40px 24px 30px;text-align:center;color:#fff">' +
    '<div style="width:72px;height:72px;background:rgba(255,255,255,.2);border-radius:20px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">' +
    '<i data-lucide="zap" style="width:36px;height:36px;color:#fff"></i></div>' +
    '<div style="font-size:24px;font-weight:700;margin-bottom:6px">Bem-vindo ao Kontaki</div>' +
    '<div style="font-size:14px;color:#ddd6fe">Vamos configurar a tua loja em 2 minutos</div>' +
    '</div>' +

    '<div style="padding:24px;flex:1">' +

    // Step 1: Loja
    '<div id="setup-step-1">' +
    '<div style="font-size:11px;font-weight:700;color:#5b21b6;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Passo 1 de 2</div>' +
    '<div style="font-size:18px;font-weight:700;margin-bottom:4px">Dados da loja</div>' +
    '<div style="font-size:13px;color:#71717a;margin-bottom:20px">Podes alterar depois em Perfil → Dados da Loja</div>' +

    '<div style="display:flex;flex-direction:column;gap:14px">' +
    field("setup-store-name",    "Nome da loja *",       "text",  "Ex: Mercearia do Zé") +
    field("setup-store-phone",   "Telefone *",           "tel",   "Ex: 923 000 000") +
    field("setup-store-address", "Endereço",             "text",  "Ex: Bairro Popular, Luanda") +
    field("setup-store-province","Província",            "text",  "Ex: Luanda") +
    field("setup-store-nif",     "NIF (opcional)",       "text",  "Número de identificação fiscal") +
    field("setup-store-email",   "Email (opcional)",     "email", "Ex: loja@email.com") +
    '</div>' +

    '<button onclick="window._setupStep2()" style="width:100%;padding:14px;background:#5b21b6;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:20px">Continuar →</button>' +
    '</div>' +

    // Step 2: Admin
    '<div id="setup-step-2" style="display:none">' +
    '<div style="font-size:11px;font-weight:700;color:#5b21b6;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Passo 2 de 2</div>' +
    '<div style="font-size:18px;font-weight:700;margin-bottom:4px">Criar conta de Admin</div>' +
    '<div style="font-size:13px;color:#71717a;margin-bottom:20px">O administrador tem acesso total ao sistema</div>' +

    '<div style="display:flex;flex-direction:column;gap:14px">' +
    field("setup-admin-name",  "Nome completo *",  "text",     "Ex: João Silva") +
    field("setup-admin-phone", "Telefone *",       "tel",      "Ex: 923 000 000") +
    '</div>' +

    '<div style="margin-top:14px">' +
    '<label style="font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:8px">PIN de acesso (6 dígitos) *</label>' +
    '<div id="setup-pin-display" style="display:flex;gap:10px;justify-content:center;margin-bottom:16px">' +
    [0,1,2,3,4,5].map(function(i){
      return '<div id="setup-pin-dot-'+i+'" style="width:44px;height:44px;border-radius:50%;border:2.5px solid #ddd6fe;background:#f5f3ff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:#5b21b6"></div>';
    }).join("") +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;max-width:280px;margin:0 auto">' +
    [1,2,3,4,5,6,7,8,9,'','0','⌫'].map(function(n){
      return '<button onclick="window._setupPinKey(\''+n+'\')" style="padding:16px;background:#f4f4f5;border:none;border-radius:12px;font-size:20px;font-weight:700;cursor:pointer;font-family:inherit;color:#18181b">' + n + '</button>';
    }).join("") +
    '</div></div>' +

    '<div style="background:#f0fdf4;border-radius:10px;padding:12px;margin-top:14px;font-size:12px;color:#15803d;line-height:1.6">' +
    '🔒 O PIN é guardado de forma segura com SHA-256. Não é possível recuperá-lo sem redefinir.' +
    '</div>' +

    '<div style="display:flex;gap:10px;margin-top:16px">' +
    '<button onclick="window._setupBack()" style="flex:1;padding:13px;background:#f4f4f5;color:#71717a;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">← Voltar</button>' +
    '<button onclick="window._setupFinalizar()" style="flex:2;padding:13px;background:#16a34a;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit">Começar a usar ✓</button>' +
    '</div>' +
    '</div>' +

    '</div>'; // fim padding

  document.body.appendChild(overlay);
  refreshIcons(overlay);

  // PIN state
  window._setupPin = "";

  window._setupPinKey = function(key) {
    if (key === "⌫") {
      window._setupPin = window._setupPin.slice(0,-1);
    } else if (key === "") {
      return;
    } else if (window._setupPin.length < 6) {
      window._setupPin += String(key);
    }
    updatePinDisplay();
  };

  function updatePinDisplay() {
    for (var i=0; i<6; i++) {
      var dot = document.getElementById("setup-pin-dot-"+i);
      if (!dot) continue;
      if (i < window._setupPin.length) {
        dot.textContent = "●";
        dot.style.background = "#5b21b6";
        dot.style.color = "#fff";
        dot.style.borderColor = "#5b21b6";
      } else {
        dot.textContent = "";
        dot.style.background = "#f5f3ff";
        dot.style.color = "#5b21b6";
        dot.style.borderColor = "#ddd6fe";
      }
    }
  }

  window._setupStep2 = function() {
    var name  = document.getElementById("setup-store-name");
    var phone = document.getElementById("setup-store-phone");
    if (!name||!name.value.trim()) { alert("Insere o nome da loja."); return; }
    if (!phone||!phone.value.trim()) { alert("Insere o telefone da loja."); return; }
    document.getElementById("setup-step-1").style.display = "none";
    document.getElementById("setup-step-2").style.display = "block";
  };

  window._setupBack = function() {
    document.getElementById("setup-step-2").style.display = "none";
    document.getElementById("setup-step-1").style.display = "block";
  };

  window._setupFinalizar = async function() {
    var adminName  = document.getElementById("setup-admin-name");
    var adminPhone = document.getElementById("setup-admin-phone");
    if (!adminName||!adminName.value.trim()) { alert("Insere o teu nome."); return; }
    if (!adminPhone||!adminPhone.value.trim()) { alert("Insere o teu telefone."); return; }
    if (window._setupPin.length !== 6) { alert("O PIN deve ter exactamente 6 dígitos."); return; }

    // Guarda dados da loja
    var storeId = "loja-" + Date.now();
    await db.put("settings", {
      key:      "store",
      id:       storeId,
      name:     document.getElementById("setup-store-name").value.trim(),
      phone:    document.getElementById("setup-store-phone").value.trim(),
      address:  document.getElementById("setup-store-address").value.trim(),
      province: document.getElementById("setup-store-province").value.trim(),
      nif:      document.getElementById("setup-store-nif").value.trim(),
      email:    document.getElementById("setup-store-email").value.trim(),
      currency: "Kz",
      createdAt:new Date().toISOString(),
    });

    // Cria admin com PIN hash
    var pinHash = await hashPassword(window._setupPin);
    await db.add("users", {
      name:         adminName.value.trim(),
      phone:        adminPhone.value.trim(),
      username:     adminName.value.trim().toLowerCase().replace(/\s+/g,"."),
      passwordHash: pinHash,
      password:     null,
      role:         "admin",
      active:       true,
      avatar:       adminName.value.trim().charAt(0).toUpperCase(),
      createdAt:    new Date().toISOString(),
    });

    // Remove overlay e mostra login
    document.getElementById("setup-overlay").remove();
    window._setupPin = "";

    // Recarrega para mostrar login
    window.location.reload();
  };
}

function field(id, label, type, placeholder) {
  return '<div class="field">' +
    '<label style="font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.4px">' + label + '</label>' +
    '<input id="' + id + '" type="' + type + '" placeholder="' + placeholder + '" ' +
    'style="width:100%;padding:12px;border:1.5px solid #e4e4e7;border-radius:10px;font-size:14px;font-family:inherit;box-sizing:border-box;margin-top:4px"/>' +
    '</div>';
}
