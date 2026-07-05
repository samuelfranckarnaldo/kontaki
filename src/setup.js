import { db, isFirstTime } from "./db.js";
import { hashPassword }    from "./crypto.js";
import { refreshIcons }    from "./utils.js";

export async function checkSetup() {
  const first = await isFirstTime();
  if (!first) return false;
  showSetup();
  return true;
}

var FIELD_LABELS = {
  'setup-store-name':    'Nome da loja',
  'setup-admin-name':    'Nome do administrador',
  'setup-store-phone':   'Telefone',
  'setup-store-address': 'Endereço',
  'setup-store-province':'Província',
  'setup-store-nif':     'NIF',
  'setup-store-email':   'Email',
};

function inp(id, type, placeholder, required) {
  var req = required ? '<span style="color:#dc2626"> *</span>' : '<span style="color:#a1a1aa;font-weight:500"> (opcional)</span>';
  var label = FIELD_LABELS[id] || id;
  return (
    '<div>' +
    '<label style="display:block;font-size:12px;font-weight:700;color:#3f3f46;letter-spacing:.2px;margin-bottom:6px">' + label + req + '</label>' +
    '<input id="' + id + '" type="' + type + '" placeholder="' + placeholder + '" autocomplete="off" ' +
    'style="width:100%;padding:13px 14px;border:1.5px solid #e4e4e7;border-radius:11px;font-size:15px;font-family:inherit;box-sizing:border-box;background:#fff;color:#18181b;outline:none;transition:border-color .15s ease,box-shadow .15s ease" />' +
    '</div>'
  );
}

function ensureAnimStyle() {
  if (document.getElementById("onb-anim-style")) return;
  var styleTag = document.createElement("style");
  styleTag.id = "onb-anim-style";
  styleTag.textContent =
    "@keyframes onbFadeIn { from { opacity:0 } to { opacity:1 } }" +
    "@keyframes onbSlideIn { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }" +
    "@keyframes onbFadeOut { from { opacity:1 } to { opacity:0 } }" +
    "@keyframes pinDotPop { 0% { transform:scale(1) } 50% { transform:scale(1.25) } 100% { transform:scale(1.06) } }" +
    ".setup-pin-btn:active { transform:scale(.92); background:#f5f3ff !important; border-color:#c4b5fd !important; }" +
    ".setup-pin-btn-ghost:active { background:#f4f4f5 !important; }" +
    ".setup-terms-label, .setup-terms-label * { text-transform:none !important; }" +
    ".pin-dot-filled { animation:pinDotPop .25s ease; }";
  document.head.appendChild(styleTag);
}

function showSetup() {
  ensureAnimStyle();

  function attachTouchFeedback() {
    document.querySelectorAll('.setup-pin-btn').forEach(function(btn) {
      if (btn.dataset.touchBound) return;
      btn.dataset.touchBound = "1";
      var isGhost = btn.classList.contains('setup-pin-btn-ghost');
      btn.addEventListener('touchstart', function() {
        btn.style.transform = 'scale(.92)';
        btn.style.background = isGhost ? '#f4f4f5' : '#f5f3ff';
        if (!isGhost) btn.style.borderColor = '#c4b5fd';
      }, { passive: true });
      btn.addEventListener('touchend', function() {
        setTimeout(function() {
          btn.style.transform = '';
          btn.style.background = isGhost ? 'transparent' : '#fff';
          if (!isGhost) btn.style.borderColor = '#e4e4e7';
        }, 80);
      }, { passive: true });
    });
  }

  var overlay = document.createElement("div");
  overlay.id  = "setup-overlay";
  overlay.style.cssText = "position:fixed;inset:0;background:#fff;z-index:9999;overflow-y:auto;display:flex;flex-direction:column;font-family:inherit;animation:onbFadeIn .3s ease";

  overlay.innerHTML = [
    // HEADER
    '<div id="setup-header" style="padding:32px 24px 20px;text-align:center;flex-shrink:0;border-bottom:1px solid #f4f4f5;position:relative">',
      '<button id="setup-back-role" style="position:absolute;top:16px;left:16px;background:none;border:none;color:#a1a1aa;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:4px">',
        '<i data-lucide="arrow-left" style="width:15px;height:15px"></i> Voltar',
      '</button>',
      '<div style="font-size:11px;font-weight:700;color:#a1a1aa;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">Kontaki</div>',
      '<div style="font-size:21px;font-weight:800;margin-bottom:4px;letter-spacing:-.3px;color:#18181b">Vamos criar a tua loja</div>',
      '<div style="font-size:13px;color:#71717a;line-height:1.4;margin-bottom:16px">Leva menos de 2 minutos</div>',
      '<label id="setup-restore-btn" style="display:inline-flex;align-items:center;gap:8px;background:#f5f3ff;border:1.5px solid #ddd6fe;border-radius:12px;padding:9px 14px;cursor:pointer;font-size:12.5px;font-weight:700;color:#5b21b6;transition:opacity .2s ease">',
        '<i data-lucide="upload-cloud" style="width:15px;height:15px"></i> Já usei o Kontaki? Restaurar',
        '<input type="file" accept=".json" style="display:none" onchange="window._restoreBackupLogin(this)"/>',
      '</label>',
    '</div>',

    // PROGRESS
    '<div style="background:#f4f4f5;height:3px;flex-shrink:0">',
      '<div id="setup-progress" style="height:3px;background:#5b21b6;width:33.33%;transition:width .4s ease"></div>',
    '</div>',

    // BODY
    '<div style="padding:20px 20px 16px;flex:1;max-width:480px;margin:0 auto;width:100%;box-sizing:border-box;display:flex;flex-direction:column">',

      // PASSO 1 — ESSENCIAL
      '<div id="setup-step-1" style="animation:onbSlideIn .3s ease">',
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">',
          '<div style="width:28px;height:28px;background:#5b21b6;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;flex-shrink:0">1</div>',
          '<div>',
            '<div style="font-size:16px;font-weight:700;color:#18181b">O essencial</div>',
            '<div style="font-size:11.5px;color:#a1a1aa">Passo 1 de 3</div>',
          '</div>',
        '</div>',

        '<div style="display:flex;flex-direction:column;gap:14px">',
          inp('setup-store-name',  'text', 'Ex: Mercearia Central', true),
          inp('setup-admin-name',  'text', 'Ex: João Silva',         true),
          inp('setup-store-phone', 'tel',  'Ex: 923 000 000',        true),
        '</div>',

        '<button onclick="window._setupStep2()" style="width:100%;padding:15px;background:#5b21b6;color:#fff;border:none;border-radius:13px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:22px;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 14px rgba(91,33,182,.25)">',
          'Continuar <i data-lucide="arrow-right" style="width:18px;height:18px"></i>',
        '</button>',
      '</div>',

      // PASSO 2 — OPCIONAL
      '<div id="setup-step-2" style="display:none">',
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">',
          '<div style="width:28px;height:28px;background:#5b21b6;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;flex-shrink:0">2</div>',
          '<div>',
            '<div style="font-size:16px;font-weight:700;color:#18181b">Detalhes da loja</div>',
            '<div style="font-size:11.5px;color:#a1a1aa">Passo 2 de 3 · Tudo opcional, podes saltar</div>',
          '</div>',
        '</div>',

        '<div style="display:flex;flex-direction:column;gap:14px">',
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">',
            inp('setup-store-address',  'text', 'Bairro, Rua...', false),
            inp('setup-store-province', 'text', 'Ex: Luanda',     false),
          '</div>',
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">',
            inp('setup-store-nif',   'text',  'Ex: 5417382LA041', false),
            inp('setup-store-email', 'email', 'loja@email.com',   false),
          '</div>',
        '</div>',

        '<div style="display:flex;gap:10px;margin-top:22px">',
          '<button onclick="window._setupBackTo1()" style="flex:0 0 auto;padding:15px 18px;background:#fafafa;color:#71717a;border:1.5px solid #e4e4e7;border-radius:13px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit">',
            '<i data-lucide="arrow-left" style="width:18px;height:18px"></i>',
          '</button>',
          '<button onclick="window._setupStep3()" style="flex:1;padding:15px;background:#5b21b6;color:#fff;border:none;border-radius:13px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 14px rgba(91,33,182,.25)">',
            'Continuar <i data-lucide="arrow-right" style="width:18px;height:18px"></i>',
          '</button>',
        '</div>',
      '</div>',

      // PASSO 3 — PIN (compacto, sem scroll)
      '<div id="setup-step-3" style="display:none">',
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">',
          '<div style="width:26px;height:26px;background:#5b21b6;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:700;color:#fff;flex-shrink:0">3</div>',
          '<div>',
            '<div style="font-size:15px;font-weight:700;color:#18181b">PIN de administrador</div>',
            '<div style="font-size:11px;color:#a1a1aa">Passo 3 de 3</div>',
          '</div>',
        '</div>',

        '<div style="background:#fafafa;border:1.5px solid #f0f0f2;border-radius:18px;padding:14px 14px 16px;margin-bottom:12px">',

          '<div id="setup-admin-preview" style="display:flex;align-items:center;gap:10px;background:#fff;border:1.5px solid #ede9fe;border-radius:12px;padding:9px 12px;margin-bottom:14px">',
            '<div id="setup-preview-avatar" style="width:36px;height:36px;background:#5b21b6;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:#fff;flex-shrink:0">A</div>',
            '<div>',
              '<div id="setup-preview-name" style="font-size:14px;font-weight:700;color:#18181b"></div>',
              '<div style="font-size:11px;color:#5b21b6;margin-top:1px;font-weight:600">Administrador</div>',
            '</div>',
          '</div>',

          '<div id="setup-pin-label" style="font-size:12.5px;font-weight:600;color:#71717a;text-align:center;margin-bottom:12px">Cria um PIN de 6 dígitos</div>',
          '<div id="setup-pin-dots" style="display:flex;gap:8px;justify-content:center;margin-bottom:14px"></div>',

          '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:228px;margin:0 auto">',
            [1,2,3,4,5,6,7,8,9,'back','0','del'].map(function(n) {
              if (n === 'back') return '<button onclick="window._setupBack()" class="setup-pin-btn setup-pin-btn-ghost" style="width:60px;height:60px;border-radius:50%;background:transparent;border:none;cursor:pointer;color:#a1a1aa;margin:0 auto;display:flex;align-items:center;justify-content:center">' + '<i data-lucide="arrow-left" style="width:18px;height:18px"></i></button>';
              if (n === 'del')  return '<button onclick="window._setupPinKey(\'del\')" class="setup-pin-btn setup-pin-btn-ghost" style="width:60px;height:60px;border-radius:50%;background:transparent;border:none;cursor:pointer;color:#71717a;margin:0 auto;display:flex;align-items:center;justify-content:center"><i data-lucide="delete" style="width:18px;height:18px"></i></button>';
              return '<button onclick="window._setupPinKey(\'' + n + '\')" class="setup-pin-btn" style="width:60px;height:60px;border-radius:50%;background:#fff;border:1.5px solid #e4e4e7;font-size:19px;font-weight:500;cursor:pointer;font-family:inherit;color:#18181b;margin:0 auto;display:flex;align-items:center;justify-content:center">' + n + '</button>';
            }).join(''),
          '</div>',
        '</div>',

        '<label class="setup-terms-label" style="display:flex;align-items:flex-start;gap:8px;margin-bottom:12px;cursor:pointer">',
          '<input type="checkbox" id="setup-terms-check" style="width:16px;height:16px;margin-top:1px;accent-color:#5b21b6;flex-shrink:0;cursor:pointer"/>',
          '<span class="setup-terms-label" style="font-size:11px;color:#71717a;line-height:1.5;text-align:left">Li e aceito os <button type="button" onclick="window._showTermos()" style="background:none;border:none;padding:0;color:#5b21b6;font-weight:600;font-size:11px;cursor:pointer;font-family:inherit;text-decoration:underline">Termos</button>, a <button type="button" onclick="window._showPrivacidade()" style="background:none;border:none;padding:0;color:#5b21b6;font-weight:600;font-size:11px;cursor:pointer;font-family:inherit;text-decoration:underline">Política de Privacidade</button> e a <button type="button" onclick="window._showUsoAceitavel()" style="background:none;border:none;padding:0;color:#5b21b6;font-weight:600;font-size:11px;cursor:pointer;font-family:inherit;text-decoration:underline">Política de Uso Aceitável</button> da Introxeer</span>',
        '</label>',

        '<button id="setup-btn-finalizar" onclick="window._setupFinalizar()" style="display:none;width:100%;padding:14px;background:#16a34a;color:#fff;border:none;border-radius:13px;font-size:14.5px;font-weight:700;cursor:pointer;font-family:inherit;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 14px rgba(22,163,74,.25)">',
          '<i data-lucide="check" style="width:17px;height:17px"></i> Começar a usar o Kontaki',
        '</button>',
      '</div>',

    '</div>',

    // FOOTER
    '<div id="setup-footer" style="text-align:center;padding:14px;font-size:10.5px;color:#a1a1aa;flex-shrink:0">',
      'Desenvolvido por <span style="color:#71717a;font-weight:700">Introxeer</span>',
    '</div>',

  ].join('');

  document.body.appendChild(overlay);
  refreshIcons(overlay);

  var backBtn = document.getElementById("setup-back-role");
  if (backBtn) {
    backBtn.onclick = function() {
      overlay.style.animation = "onbFadeOut .2s ease forwards";
      setTimeout(function() {
        overlay.remove();
        if (window._showRoleSelect) window._showRoleSelect();
        else window.location.reload();
      }, 180);
    };
  }

  overlay.querySelectorAll('input[type=text],input[type=tel],input[type=email]').forEach(function(el) {
    el.addEventListener('focus', function() { this.style.borderColor = '#5b21b6'; this.style.boxShadow = '0 0 0 3px rgba(91,33,182,.08)'; });
    el.addEventListener('blur',  function() { this.style.borderColor = '#e4e4e7'; this.style.boxShadow = 'none'; });
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
      return '<div class="' + (filled ? 'pin-dot-filled' : '') + '" style="width:40px;height:40px;border-radius:50%;border:2px solid ' +
        (filled ? color : '#e4e4e7') + ';background:' + (filled ? color : '#fafafa') +
        ';display:flex;align-items:center;justify-content:center;transition:background .15s ease,border-color .15s ease;' +
        (filled ? 'transform:scale(1.06)' : '') +
        '"></div>';
    }).join("");
  }

  function switchStep(fromId, toId, progressPct) {
    var from = document.getElementById(fromId);
    var to = document.getElementById(toId);
    from.style.animation = "onbFadeOut .18s ease forwards";
    setTimeout(function() {
      from.style.display = "none";
      to.style.display = "flex";
      to.style.flexDirection = "column";
      to.style.animation = "onbSlideIn .3s ease";
      document.getElementById("setup-progress").style.width = progressPct;
      refreshIcons(overlay);
    }, 160);
  }

  function hideRestoreAndCompactFooter() {
    var restoreBtn = document.getElementById("setup-restore-btn");
    var header = document.getElementById("setup-header");
    var footer = document.getElementById("setup-footer");
    if (restoreBtn) restoreBtn.style.display = "none";
    if (header) header.style.padding = "20px 24px 14px";
    if (footer) footer.style.padding = "8px";
  }

  window._setupStep2 = function() {
    var storeName  = (document.getElementById("setup-store-name")  || {}).value || "";
    var adminName  = (document.getElementById("setup-admin-name")  || {}).value || "";
    var storePhone = (document.getElementById("setup-store-phone") || {}).value || "";
    if (!storeName.trim())  { alert("Insere o nome da loja."); return; }
    if (!adminName.trim())  { alert("Insere o nome do administrador."); return; }
    if (!storePhone.trim()) { alert("Insere o telefone."); return; }
    switchStep("setup-step-1", "setup-step-2", "66.66%");
  };

  window._setupBackTo1 = function() {
    switchStep("setup-step-2", "setup-step-1", "33.33%");
  };

  window._setupStep3 = function() {
    var adminName = (document.getElementById("setup-admin-name") || {}).value || "";
    switchStep("setup-step-2", "setup-step-3", "100%");
    hideRestoreAndCompactFooter();
    setTimeout(function() {
      attachTouchFeedback();
      var n = document.getElementById("setup-preview-name");
      var a = document.getElementById("setup-preview-avatar");
      if (n) n.textContent = adminName.trim();
      if (a) a.textContent = adminName.trim().charAt(0).toUpperCase();
      _pin = ""; _pinConfirm = ""; _step = "enter";
      var lbl = document.getElementById("setup-pin-label");
      if (lbl) { lbl.textContent = "Cria um PIN de 6 dígitos"; lbl.style.color = "#71717a"; }
      renderDots();
    }, 170);
  };

  window._setupBack = function() {
    var restoreBtn = document.getElementById("setup-restore-btn");
    var header = document.getElementById("setup-header");
    var footer = document.getElementById("setup-footer");
    if (restoreBtn) restoreBtn.style.display = "inline-flex";
    if (header) header.style.padding = "32px 24px 20px";
    if (footer) footer.style.padding = "14px";
    switchStep("setup-step-3", "setup-step-2", "66.66%");
  };

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

  window._setupFinalizar = async function() {
    var termsChecked = document.getElementById("setup-terms-check");
    if (!termsChecked || !termsChecked.checked) {
      alert("Precisas de aceitar os Termos, a Política de Privacidade e a Política de Uso Aceitável para continuar.");
      return;
    }
    if (_pin.length !== 6) { alert("O PIN deve ter 6 dígitos."); return; }
    if (_pin !== _pinConfirm) {
      alert("Os PINs não coincidem. Tenta novamente.");
      _pin = ""; _pinConfirm = ""; _step = "enter";
      var lbl = document.getElementById("setup-pin-label");
      if (lbl) { lbl.textContent = "Cria um PIN de 6 dígitos"; lbl.style.color = "#71717a"; }
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
      termsAcceptedAt: new Date().toISOString(),
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

    var ov = document.getElementById("setup-overlay");
    ov.style.animation = "onbFadeOut .25s ease forwards";
    setTimeout(function() {
      ov.remove();
      window.location.reload();
    }, 220);
  };
}
