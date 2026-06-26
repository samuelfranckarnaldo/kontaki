import { db, isFirstTime } from "./db.js";
import { hashPassword }    from "./crypto.js";
import { refreshIcons }    from "./utils.js";

export async function checkSetup() {
  const first = await isFirstTime();
  if (!first) return false;
  showSetup();
  return true;
}

function inp(id, type, placeholder, required) {
  var req = required ? '<span style="color:#dc2626"> *</span>' : '<span style="color:#9ca3af;font-weight:400"> (opcional)</span>';
  return (
    '<div>' +
    '<label style="display:block;font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">' + id.replace('setup-','').replace('store-','').replace('admin-','Admin ').replace(/-/g,' ') + req + '</label>' +
    '<input id="' + id + '" type="' + type + '" placeholder="' + placeholder + '" autocomplete="off" ' +
    'style="width:100%;padding:13px 14px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:15px;font-family:inherit;box-sizing:border-box;background:#fff;color:#111827;outline:none;" />' +
    '</div>'
  );
}

function showSetup() {
  var overlay = document.createElement("div");
  overlay.id  = "setup-overlay";
  overlay.style.cssText = "position:fixed;inset:0;background:#f8f7ff;z-index:9999;overflow-y:auto;display:flex;flex-direction:column;font-family:inherit";

  overlay.innerHTML = [
    // HEADER
    '<div style="background:linear-gradient(135deg,#5b21b6,#7c3aed);padding:48px 24px 32px;text-align:center;color:#fff;position:relative;flex-shrink:0">',
      '<label style="position:absolute;top:16px;right:16px;display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.15);border:1.5px solid rgba(255,255,255,.25);border-radius:10px;padding:8px 14px;cursor:pointer;font-size:12px;font-weight:700;color:#fff">',
        '<i data-lucide="upload-cloud" style="width:14px;height:14px"></i> Restaurar',
        '<input type="file" accept=".json" style="display:none" onchange="window._restoreBackupLogin(this)"/>',
      '</label>',
      '<div style="width:80px;height:80px;background:rgba(255,255,255,.15);border:2px solid rgba(255,255,255,.25);border-radius:24px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px">',
        '<i data-lucide="zap" style="width:40px;height:40px;color:#fff"></i>',
      '</div>',
      '<div style="font-size:26px;font-weight:800;margin-bottom:8px;letter-spacing:-.3px">Bem-vindo ao Kontaki</div>',
      '<div style="font-size:14px;color:#ddd6fe;line-height:1.5">Configura a tua loja em 2 minutos</div>',
    '</div>',

    // PROGRESS
    '<div style="background:#ede9fe;height:4px;flex-shrink:0">',
      '<div id="setup-progress" style="height:4px;background:#5b21b6;width:50%;transition:width .4s ease"></div>',
    '</div>',

    // BODY
    '<div style="padding:24px 20px;flex:1;max-width:480px;margin:0 auto;width:100%;box-sizing:border-box">',

      // PASSO 1
      '<div id="setup-step-1">',
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">',
          '<div style="width:32px;height:32px;background:#5b21b6;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0">1</div>',
          '<div>',
            '<div style="font-size:18px;font-weight:700;color:#111827">Dados da loja</div>',
            '<div style="font-size:12px;color:#6b7280">Passo 1 de 2 · Podes alterar depois</div>',
          '</div>',
        '</div>',

        '<div style="display:flex;flex-direction:column;gap:14px">',
          inp('setup-store-name',    'text',  'Ex: Mercearia Central',  true),
          inp('setup-admin-name',    'text',  'Ex: João Silva',          true),
          inp('setup-store-phone',   'tel',   'Ex: 923 000 000',         true),
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">',
            inp('setup-store-address',  'text',  'Bairro, Rua...',    false),
            inp('setup-store-province', 'text',  'Ex: Luanda',        false),
          '</div>',
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">',
            inp('setup-store-nif',   'text',  'Ex: 5417382LA041',  false),
            inp('setup-store-email', 'email', 'loja@email.com',     false),
          '</div>',
        '</div>',

        '<button onclick="window._setupStep2()" style="width:100%;padding:15px;background:#5b21b6;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:24px;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 14px rgba(91,33,182,.3)">',
          'Continuar <i data-lucide="arrow-right" style="width:18px;height:18px"></i>',
        '</button>',
      '</div>',

      // PASSO 2
      '<div id="setup-step-2" style="display:none">',
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">',
          '<div style="width:32px;height:32px;background:#5b21b6;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0">2</div>',
          '<div>',
            '<div style="font-size:18px;font-weight:700;color:#111827">PIN de administrador</div>',
            '<div style="font-size:12px;color:#6b7280">Passo 2 de 2 · 6 dígitos para entrar</div>',
          '</div>',
        '</div>',

        '<div id="setup-admin-preview" style="display:flex;align-items:center;gap:12px;background:#fff;border:1.5px solid #ede9fe;border-radius:14px;padding:14px;margin-bottom:24px">',
          '<div id="setup-preview-avatar" style="width:48px;height:48px;background:#5b21b6;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:#fff;flex-shrink:0">A</div>',
          '<div>',
            '<div id="setup-preview-name" style="font-size:16px;font-weight:700;color:#111827"></div>',
            '<div style="font-size:12px;color:#5b21b6;margin-top:2px;font-weight:600">Administrador</div>',
          '</div>',
        '</div>',

        '<div id="setup-pin-label" style="font-size:13px;font-weight:600;color:#6b7280;text-align:center;margin-bottom:16px">Cria um PIN de 6 dígitos</div>',
        '<div id="setup-pin-dots" style="display:flex;gap:10px;justify-content:center;margin-bottom:28px"></div>',

        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;max-width:264px;margin:0 auto 24px">',
          [1,2,3,4,5,6,7,8,9,'back','0','del'].map(function(n) {
            if (n === 'back') return '<button onclick="window._setupBack()" style="width:72px;height:72px;border-radius:50%;background:transparent;border:none;cursor:pointer;color:#9ca3af;margin:0 auto;display:flex;align-items:center;justify-content:center"><i data-lucide="arrow-left" style="width:22px;height:22px"></i></button>';
            if (n === 'del')  return '<button onclick="window._setupPinKey(\'del\')" style="width:72px;height:72px;border-radius:50%;background:transparent;border:none;cursor:pointer;color:#ef4444;margin:0 auto;display:flex;align-items:center;justify-content:center"><i data-lucide="delete" style="width:22px;height:22px"></i></button>';
            return '<button onclick="window._setupPinKey(\'' + n + '\')" style="width:72px;height:72px;border-radius:50%;background:#fff;border:1.5px solid #e5e7eb;font-size:24px;font-weight:400;cursor:pointer;font-family:inherit;color:#111827;margin:0 auto;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.08)">' + n + '</button>';
          }).join(''),
        '</div>',

        '<button id="setup-btn-finalizar" onclick="window._setupFinalizar()" style="display:none;width:100%;padding:15px;background:#16a34a;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 14px rgba(22,163,74,.3)">',
          '<i data-lucide="check" style="width:18px;height:18px"></i> Começar a usar o Kontaki',
        '</button>',
      '</div>',

    '</div>',

    // FOOTER
    '<div style="text-align:center;padding:16px;font-size:11px;color:#9ca3af;flex-shrink:0">',
      'Desenvolvido por <span style="color:#5b21b6;font-weight:700">Introxeer Technology</span>',
    '</div>',

  ].join('');

  document.body.appendChild(overlay);
  refreshIcons(overlay);

  // Adiciona focus highlight nos inputs
  overlay.querySelectorAll('input').forEach(function(el) {
    el.addEventListener('focus', function() { this.style.borderColor = '#5b21b6'; this.style.boxShadow = '0 0 0 3px rgba(91,33,182,.1)'; });
    el.addEventListener('blur',  function() { this.style.borderColor = '#e5e7eb'; this.style.boxShadow = 'none'; });
  });

  var _pin = "";
  var _pinConfirm = "";
  var _step = "enter";

  function renderDots() {
    var dotsEl = document.getElementById("setup-pin-dots");
    if (!dotsEl) return;
    var src   = _step === "confirm" ? _pinConfirm : _pin;
    var color = _step === "confirm" ? "#16a34a" : "#5b21b6";
    dotsEl.innerHTML = [0,1,2,3,4,5].map(function(i) {
      var filled = i < src.length;
      return '<div style="width:46px;height:46px;border-radius:50%;border:2px solid ' +
        (filled ? color : '#e5e7eb') + ';background:' + (filled ? color : '#f9fafb') +
        ';display:flex;align-items:center;justify-content:center;transition:all .15s;' +
        (filled ? 'box-shadow:0 4px 12px rgba(91,33,182,.25);transform:scale(1.08)' : '') +
        '"></div>';
    }).join("");
  }

  renderDots();

  window._setupPinKey = function(key) {
    if (key === "del") {
      if (_step === "confirm") _pinConfirm = _pinConfirm.slice(0,-1);
      else _pin = _pin.slice(0,-1);
    } else {
      var src = _step === "confirm" ? _pinConfirm : _pin;
      if (src.length < 6) {
        if (_step === "confirm") _pinConfirm += key;
        else _pin += key;
      }
    }
    renderDots();

    if (_step === "enter" && _pin.length === 6) {
      setTimeout(function() {
        _step = "confirm";
        var lbl = document.getElementById("setup-pin-label");
        if (lbl) { lbl.textContent = "Confirma o PIN"; lbl.style.color = "#16a34a"; }
        renderDots();
      }, 250);
    }

    var btn = document.getElementById("setup-btn-finalizar");
    if (btn) btn.style.display = (_step === "confirm" && _pinConfirm.length === 6) ? "flex" : "none";
  };

  window._setupStep2 = function() {
    var storeName  = (document.getElementById("setup-store-name")  || {}).value || "";
    var adminName  = (document.getElementById("setup-admin-name")  || {}).value || "";
    var storePhone = (document.getElementById("setup-store-phone") || {}).value || "";
    if (!storeName.trim())  { alert("Insere o nome da loja."); return; }
    if (!adminName.trim())  { alert("Insere o nome do administrador."); return; }
    if (!storePhone.trim()) { alert("Insere o telefone."); return; }
    document.getElementById("setup-step-1").style.display = "none";
    document.getElementById("setup-step-2").style.display = "block";
    document.getElementById("setup-progress").style.width = "100%";
    var n = document.getElementById("setup-preview-name");
    var a = document.getElementById("setup-preview-avatar");
    if (n) n.textContent = adminName.trim();
    if (a) a.textContent = adminName.trim().charAt(0).toUpperCase();
    _pin = ""; _pinConfirm = ""; _step = "enter";
    var lbl = document.getElementById("setup-pin-label");
    if (lbl) { lbl.textContent = "Cria um PIN de 6 dígitos"; lbl.style.color = "#6b7280"; }
    renderDots();
    refreshIcons(overlay);
  };

  window._setupBack = function() {
    document.getElementById("setup-step-2").style.display = "none";
    document.getElementById("setup-step-1").style.display = "block";
    document.getElementById("setup-progress").style.width = "50%";
  };

  window._setupFinalizar = async function() {
    if (_pin.length !== 6) { alert("O PIN deve ter 6 dígitos."); return; }
    if (_pin !== _pinConfirm) {
      alert("Os PINs não coincidem. Tenta novamente.");
      _pin = ""; _pinConfirm = ""; _step = "enter";
      var lbl = document.getElementById("setup-pin-label");
      if (lbl) { lbl.textContent = "Cria um PIN de 6 dígitos"; lbl.style.color = "#6b7280"; }
      var btn = document.getElementById("setup-btn-finalizar");
      if (btn) btn.style.display = "none";
      renderDots(); return;
    }

    var storeName  = document.getElementById("setup-store-name").value.trim();
    var adminName  = document.getElementById("setup-admin-name").value.trim();
    var storePhone = document.getElementById("setup-store-phone").value.trim();
    var storeAddr  = (document.getElementById("setup-store-address")  || {}).value || "";
    var storeProv  = (document.getElementById("setup-store-province") || {}).value || "";
    var storeNif   = (document.getElementById("setup-store-nif")      || {}).value || "";
    var storeEmail = (document.getElementById("setup-store-email")    || {}).value || "";

    await db.put("settings", {
      key: "store",
      name: storeName, phone: storePhone,
      address: storeAddr.trim(), province: storeProv.trim(),
      nif: storeNif.trim(), email: storeEmail.trim(),
      iva: 0, currency: "Kz",
      createdAt: new Date().toISOString(),
    });

    var pinHash  = await hashPassword(_pin);
    var username = adminName.toLowerCase().replace(/\s+/g, ".");
    await db.add("users", {
      name: adminName, phone: storePhone, username: username,
      passwordHash: pinHash, password: null,
      role: "admin", active: true,
      avatar: adminName.charAt(0).toUpperCase(),
      createdAt: new Date().toISOString(),
    });

    document.getElementById("setup-overlay").remove();
    window.location.reload();
  };
}
