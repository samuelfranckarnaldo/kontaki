import { db, isFirstTime } from "./db.js";
import { hashPassword }    from "./crypto.js";
import { refreshIcons }    from "./utils.js";

export async function checkSetup() {
  const first = await isFirstTime();
  if (!first) return false;
  showSetup();
  return true;
}

function field(id, label, type, placeholder) {
  return '<div class="field">' +
    '<label style="font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.4px">' + label + '</label>' +
    '<input id="' + id + '" type="' + type + '" placeholder="' + placeholder + '" ' +
    'style="width:100%;padding:12px;border:1.5px solid #e4e4e7;border-radius:10px;font-size:14px;font-family:inherit;box-sizing:border-box;margin-top:4px"/>' +
    '</div>';
}

function showSetup() {
  var overlay = document.createElement("div");
  overlay.id  = "setup-overlay";
  overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:#fff;z-index:9999;overflow-y:auto;display:flex;flex-direction:column";

  var pinKeys = [1,2,3,4,5,6,7,8,9,'','0','del'];

  overlay.innerHTML =
    '<div style="position:relative;background:linear-gradient(135deg,#5b21b6,#7c3aed);padding:40px 24px 30px;text-align:center;color:#fff">' +
    '<label style="position:absolute;top:16px;right:16px;display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.2);border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px;font-weight:700;color:#fff">' +
    '<i data-lucide="upload" style="width:14px;height:14px"></i> Restaurar backup' +
    '<input type="file" accept=".json" style="display:none" onchange="window._restoreBackupLogin(this)"/>' +
    '</label>' +
    '<div style="width:72px;height:72px;background:rgba(255,255,255,.2);border-radius:20px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">' +
    '<i data-lucide="zap" style="width:36px;height:36px;color:#fff"></i></div>' +
    '<div style="font-size:24px;font-weight:700;margin-bottom:6px">Bem-vindo ao Kontaki</div>' +
    '<div style="font-size:14px;color:#ddd6fe">Vamos configurar a tua loja em 2 minutos</div>' +
    '</div>' +

    '<div style="padding:24px;flex:1">' +

    // ── PASSO 1: Dados da loja ──
    '<div id="setup-step-1">' +
    '<div style="font-size:11px;font-weight:700;color:#5b21b6;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Passo 1 de 2</div>' +
    '<div style="font-size:18px;font-weight:700;margin-bottom:4px">Dados da loja</div>' +
    '<div style="font-size:13px;color:#71717a;margin-bottom:20px">Podes alterar depois em Perfil</div>' +
    '<div style="display:flex;flex-direction:column;gap:14px">' +
    field("setup-store-name",    "Nome da loja *",    "text",  "Ex: Mercearia do Zé") +
    field("setup-store-phone",   "Telefone *",        "tel",   "Ex: 923 000 000") +
    field("setup-store-address", "Endereço",          "text",  "Ex: Bairro Popular, Luanda") +
    field("setup-store-province","Província",         "text",  "Ex: Luanda") +
    field("setup-store-nif",     "NIF (opcional)",    "text",  "Número de identificação fiscal") +
    field("setup-store-email",   "Email (opcional)",  "email", "Ex: loja@email.com") +
    '<div style="background:#fef3c7;border-radius:10px;padding:12px">' +
    '<label style="font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:.4px">IVA % (opcional)</label>' +
    '<input id="setup-store-iva" type="number" min="0" step="0.1" placeholder="Deixa vazio se não aplicas IVA" style="width:100%;padding:12px;border:1.5px solid #fde68a;border-radius:10px;font-size:14px;font-family:inherit;box-sizing:border-box;margin-top:4px;background:#fff"/>' +
    '<div style="font-size:11px;color:#92400e;margin-top:4px">Podes alterar a qualquer momento em Perfil</div>' +
    '</div>' +
    '</div>' +
    '<button onclick="window._setupStep2()" style="width:100%;padding:14px;background:#5b21b6;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:20px">Continuar →</button>' +
    '</div>' +

    // ── PASSO 2: PIN do admin ──
    '<div id="setup-step-2" style="display:none">' +
    '<div style="font-size:11px;font-weight:700;color:#5b21b6;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Passo 2 de 2</div>' +
    '<div style="font-size:18px;font-weight:700;margin-bottom:4px">Criar PIN de administrador</div>' +
    '<div style="font-size:13px;color:#71717a;margin-bottom:16px">6 dígitos para entrar na tua conta</div>' +

    '<div id="setup-admin-preview" style="background:#f4f4f5;border-radius:10px;padding:12px;margin-bottom:20px;font-size:14px;font-weight:600;text-align:center;color:#18181b"></div>' +

    '<div id="setup-pin-label" style="font-size:13px;font-weight:700;color:#5b21b6;text-align:center;margin-bottom:12px">Introduz o PIN</div>' +
    '<div id="setup-pin-dots" style="display:flex;gap:12px;justify-content:center;margin-bottom:24px"></div>' +

    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;max-width:260px;margin:0 auto 20px">' +
    pinKeys.map(function(n) {
      if (n === '') return '<div></div>';
      var icon = n === 'del' ? '&#‌x232B;' : n;
      return '<button onclick="window._setupPinKey(\'' + n + '\')" style="width:72px;height:72px;border-radius:50%;background:' + (n==='del'?'transparent':'#f4f4f5') + ';border:none;font-size:24px;font-weight:400;cursor:pointer;font-family:inherit;color:' + (n==='del'?'#dc2626':'#18181b') + ';margin:0 auto;display:flex;align-items:center;justify-content:center;box-shadow:' + (n==='del'?'none':'0 1px 3px rgba(0,0,0,.1)') + '">' + (n==='del'?'⌫':n) + '</button>';
    }).join('') +
    '</div>' +

    '<div style="display:flex;gap:10px">' +
    '<button onclick="window._setupBack()" style="flex:1;padding:13px;background:#f4f4f5;color:#71717a;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">← Voltar</button>' +
    '<button id="setup-btn-finalizar" onclick="window._setupFinalizar()" style="flex:2;padding:13px;background:#16a34a;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;display:none">Começar ✓</button>' +
    '</div>' +
    '</div>' +

    '</div>';

  document.body.appendChild(overlay);
  refreshIcons(overlay);

  // ── Estado do PIN ──
  var _pin = "";
  var _pinConfirm = "";
  var _step = "enter"; // "enter" | "confirm"

  function renderDots() {
    var dotsEl = document.getElementById("setup-pin-dots");
    if (!dotsEl) return;
    var src = _step === "confirm" ? _pinConfirm : _pin;
    dotsEl.innerHTML = [0,1,2,3,4,5].map(function(i) {
      var filled = i < src.length;
      var color  = _step === "confirm" ? "#16a34a" : "#5b21b6";
      return '<div style="width:44px;height:44px;border-radius:50%;border:2.5px solid ' + (filled?color:"#e4e4e7") + ';background:' + (filled?color:"#f4f4f5") + ';display:flex;align-items:center;justify-content:center;font-size:20px;color:#fff;transition:all .1s">' + (filled?"●":"") + '</div>';
    }).join("");
  }

  renderDots();

  window._setupPinKey = function(key) {
    var src = _step === "confirm" ? _pinConfirm : _pin;
    if (key === 'del') {
      if (_step === "confirm") _pinConfirm = _pinConfirm.slice(0,-1);
      else _pin = _pin.slice(0,-1);
    } else if (src.length < 6) {
      if (_step === "confirm") _pinConfirm += key;
      else _pin += key;
    }
    renderDots();

    if (_step === "enter" && _pin.length === 6) {
      setTimeout(function() {
        _step = "confirm";
        var lbl = document.getElementById("setup-pin-label");
        if (lbl) lbl.textContent = "Confirma o PIN";
        renderDots();
      }, 200);
    }

    if (_step === "confirm" && _pinConfirm.length === 6) {
      var btn = document.getElementById("setup-btn-finalizar");
      if (btn) btn.style.display = "flex";
    } else {
      var btn2 = document.getElementById("setup-btn-finalizar");
      if (btn2) btn2.style.display = "none";
    }
  };

  window._setupStep2 = function() {
    var name  = document.getElementById("setup-store-name");
    var phone = document.getElementById("setup-store-phone");
    if (!name || !name.value.trim())  { alert("Insere o nome da loja."); return; }
    if (!phone || !phone.value.trim()) { alert("Insere o telefone da loja."); return; }
    document.getElementById("setup-step-1").style.display = "none";
    document.getElementById("setup-step-2").style.display = "block";
    var preview = document.getElementById("setup-admin-preview");
    if (preview) preview.textContent = name.value.trim() + " · " + phone.value.trim();
    _pin = ""; _pinConfirm = ""; _step = "enter";
    var lbl = document.getElementById("setup-pin-label");
    if (lbl) lbl.textContent = "Introduz o PIN";
    renderDots();
  };

  window._setupBack = function() {
    document.getElementById("setup-step-2").style.display = "none";
    document.getElementById("setup-step-1").style.display = "block";
  };

  window._setupFinalizar = async function() {
    if (_pin.length !== 6) { alert("O PIN deve ter 6 dígitos."); return; }
    if (_pin !== _pinConfirm) {
      alert("Os PINs não coincidem. Tenta novamente.");
      _pin = ""; _pinConfirm = ""; _step = "enter";
      var lbl = document.getElementById("setup-pin-label");
      if (lbl) lbl.textContent = "Introduz o PIN";
      var btn = document.getElementById("setup-btn-finalizar");
      if (btn) btn.style.display = "none";
      renderDots(); return;
    }

    var storeName    = document.getElementById("setup-store-name").value.trim();
    var storePhone   = document.getElementById("setup-store-phone").value.trim();
    var storeAddr    = document.getElementById("setup-store-address").value.trim();
    var storeProv    = document.getElementById("setup-store-province").value.trim();
    var storeNif     = document.getElementById("setup-store-nif").value.trim();
    var storeEmail   = document.getElementById("setup-store-email").value.trim();
    var storeIva     = Number(document.getElementById("setup-store-iva").value) || 0;

    await db.put("settings", {
      key: "store",
      name: storeName, phone: storePhone, address: storeAddr,
      province: storeProv, nif: storeNif, email: storeEmail,
      iva: storeIva, currency: "Kz",
      createdAt: new Date().toISOString(),
    });

    var pinHash = await hashPassword(_pin);
    var username = storeName.toLowerCase().replace(/\s+/g, ".");
    await db.add("users", {
      name:         storeName,
      phone:        storePhone,
      username:     username,
      passwordHash: pinHash,
      password:     null,
      role:         "admin",
      active:       true,
      avatar:       storeName.charAt(0).toUpperCase(),
      createdAt:    new Date().toISOString(),
    });

    document.getElementById("setup-overlay").remove();
    window.location.reload();
  };
}
