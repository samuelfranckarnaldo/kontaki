import { db } from "./db.js";
import { hashPassword } from "./crypto.js";
import { refreshIcons } from "./utils.js";
import { verifyInvite, saveStoreLink } from "./invite.js";
import { checkSetup } from "./setup.js";

function ensureAnimStyle() {
  if (document.getElementById("onb-anim-style")) return;
  var styleTag = document.createElement("style");
  styleTag.id = "onb-anim-style";
  styleTag.textContent =
    "@keyframes onbFadeIn { from { opacity:0 } to { opacity:1 } }" +
    "@keyframes onbSlideIn { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }" +
    "@keyframes onbFadeOut { from { opacity:1 } to { opacity:0 } }";
  document.head.appendChild(styleTag);
}

function fadeOutOverlay(overlay, cb) {
  overlay.style.animation = "onbFadeOut .2s ease forwards";
  setTimeout(function() { overlay.remove(); cb(); }, 180);
}

export async function showRoleSelect() {
  ensureAnimStyle();

  var overlay = document.createElement("div");
  overlay.id = "role-overlay";
  overlay.style.cssText = "position:fixed;inset:0;background:#fff;z-index:9999;overflow-y:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;font-family:inherit;animation:onbFadeIn .3s ease";

  overlay.innerHTML = [
    '<div style="width:100%;max-width:360px;text-align:center;animation:onbSlideIn .35s ease">',
      '<div style="font-size:11px;font-weight:700;color:#a1a1aa;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px">Kontaki</div>',
      '<div style="font-size:23px;font-weight:800;color:#18181b;margin-bottom:8px;letter-spacing:-.3px">Como vais usar o Kontaki?</div>',
      '<div style="font-size:13.5px;color:#71717a;margin-bottom:32px;line-height:1.5">Escolhe a opção certa para começares bem</div>',

      '<button id="btn-role-owner" style="width:100%;display:flex;align-items:center;gap:14px;padding:18px;background:#fff;border:1.5px solid #e4e4e7;border-radius:16px;cursor:pointer;font-family:inherit;text-align:left;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,.04);transition:border-color .15s ease">',
        '<div style="width:46px;height:46px;background:#f5f3ff;border-radius:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0">',
          '<i data-lucide="store" style="width:22px;height:22px;color:#5b21b6"></i>',
        '</div>',
        '<div style="flex:1">',
          '<div style="font-size:15.5px;font-weight:700;color:#18181b">Sou dono ou gerente</div>',
          '<div style="font-size:12.5px;color:#71717a;margin-top:2px">Vou criar a loja do zero</div>',
        '</div>',
        '<i data-lucide="chevron-right" style="width:18px;height:18px;color:#d4d4d8;flex-shrink:0"></i>',
      '</button>',

      '<button id="btn-role-staff" style="width:100%;display:flex;align-items:center;gap:14px;padding:18px;background:#fff;border:1.5px solid #e4e4e7;border-radius:16px;cursor:pointer;font-family:inherit;text-align:left;box-shadow:0 2px 8px rgba(0,0,0,.04);transition:border-color .15s ease">',
        '<div style="width:46px;height:46px;background:#f0fdf4;border-radius:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0">',
          '<i data-lucide="user-round" style="width:22px;height:22px;color:#16a34a"></i>',
        '</div>',
        '<div style="flex:1">',
          '<div style="font-size:15.5px;font-weight:700;color:#18181b">Sou funcionário</div>',
          '<div style="font-size:12.5px;color:#71717a;margin-top:2px">Já tenho um convite da minha loja</div>',
        '</div>',
        '<i data-lucide="chevron-right" style="width:18px;height:18px;color:#d4d4d8;flex-shrink:0"></i>',
      '</button>',

      '<div style="margin-top:36px;font-family:\'Playfair Display\',serif;font-size:14px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#a1a1aa;opacity:.75">Introxeer</div>',
    '</div>',
  ].join('');

  document.body.appendChild(overlay);
  refreshIcons(overlay);

  document.getElementById('btn-role-owner').onclick = function() {
    fadeOutOverlay(overlay, checkSetup);
  };
  document.getElementById('btn-role-staff').onclick = function() {
    fadeOutOverlay(overlay, showStaffInvite);
  };
}

function showStaffInvite() {
  ensureAnimStyle();

  var overlay = document.createElement("div");
  overlay.id = "staff-overlay";
  overlay.style.cssText = "position:fixed;inset:0;background:#fff;z-index:9999;overflow-y:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;font-family:inherit;animation:onbFadeIn .3s ease";

  overlay.innerHTML = [
    '<div style="width:100%;max-width:360px;text-align:center;animation:onbSlideIn .35s ease">',
      '<button id="btn-staff-back" style="background:none;border:none;color:#71717a;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;margin-bottom:24px;display:flex;align-items:center;gap:4px">',
        '<i data-lucide="arrow-left" style="width:16px;height:16px"></i> Voltar',
      '</button>',

      '<div style="width:60px;height:60px;background:#f0fdf4;border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 18px">',
        '<i data-lucide="scan-line" style="width:26px;height:26px;color:#16a34a"></i>',
      '</div>',
      '<div style="font-size:19px;font-weight:800;color:#18181b;margin-bottom:8px">Ligar à tua loja</div>',
      '<div style="font-size:13px;color:#71717a;margin-bottom:28px;line-height:1.5">Pede ao teu patrão o QR code ou o ficheiro de convite</div>',

      '<button id="btn-staff-scan" style="width:100%;padding:15px;background:#16a34a;color:#fff;border:none;border-radius:13px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:10px;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 14px rgba(22,163,74,.25)">',
        '<i data-lucide="scan-line" style="width:18px;height:18px"></i> Ler QR code',
      '</button>',

      '<label style="width:100%;padding:15px;background:#fff;color:#18181b;border:1.5px solid #e4e4e7;border-radius:13px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px;box-sizing:border-box">',
        '<i data-lucide="upload" style="width:18px;height:18px;color:#71717a"></i> Importar ficheiro de convite',
        '<input type="file" id="staff-file-input" accept=".ktkinvite,.json" style="display:none"/>',
      '</label>',

      '<div id="staff-error" style="display:none;margin-top:14px;padding:12px;background:#fef2f2;border:1.5px solid #fecaca;border-radius:10px;color:#dc2626;font-size:12px;font-weight:600"></div>',
    '</div>',
  ].join('');

  document.body.appendChild(overlay);
  refreshIcons(overlay);

  document.getElementById('btn-staff-back').onclick = function() {
    fadeOutOverlay(overlay, showRoleSelect);
  };

  document.getElementById('btn-staff-scan').onclick = function() {
    import('./components/camera.js').then(function(m) {
      if (m.openCameraForInvite) {
        m.openCameraForInvite(function(data) {
          handleInvitePayload(data, overlay);
        });
      } else {
        showStaffError(overlay, "Scanner de câmara ainda não disponível para convites.");
      }
    }).catch(function() {
      showStaffError(overlay, "Não foi possível abrir a câmara.");
    });
  };

  document.getElementById('staff-file-input').addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(evt) {
      try {
        var data = JSON.parse(evt.target.result);
        handleInvitePayload(data, overlay);
      } catch (err) {
        showStaffError(overlay, "Ficheiro inválido. Pede um novo convite.");
      }
    };
    reader.readAsText(file);
  });
}

function showStaffError(overlay, msg) {
  var el = overlay.querySelector('#staff-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

async function handleInvitePayload(data, overlay) {
  try {
    var payload = await verifyInvite(data);
    await saveStoreLink(payload);
    fadeOutOverlay(overlay, function() { showStaffProfile(payload); });
  } catch (err) {
    showStaffError(overlay, err.message || "Convite inválido.");
  }
}

function showStaffProfile(payload) {
  ensureAnimStyle();

  var overlay = document.createElement("div");
  overlay.id = "staff-profile-overlay";
  overlay.style.cssText = "position:fixed;inset:0;background:#fff;z-index:9999;overflow-y:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;font-family:inherit;animation:onbFadeIn .3s ease";

  overlay.innerHTML = [
    '<div style="width:100%;max-width:360px;text-align:center;animation:onbSlideIn .35s ease">',
      '<div style="font-size:11px;font-weight:700;color:#16a34a;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">Ligado à loja</div>',
      '<div style="font-size:20px;font-weight:800;color:#18181b;margin-bottom:28px">' + payload.storeName + '</div>',

      '<div style="text-align:left;margin-bottom:20px">',
        '<label style="display:block;font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">O teu nome <span style="color:#dc2626">*</span></label>',
        '<input id="staff-name" type="text" placeholder="Ex: Maria João" autocomplete="off" style="width:100%;padding:13px 14px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:15px;font-family:inherit;box-sizing:border-box;background:#fff;color:#111827;outline:none"/>',
      '</div>',

      '<div id="staff-pin-label" style="font-size:13px;font-weight:600;color:#6b7280;margin-bottom:14px">Cria o teu PIN de 6 dígitos</div>',
      '<div id="staff-pin-dots" style="display:flex;gap:10px;justify-content:center;margin-bottom:24px"></div>',

      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;max-width:264px;margin:0 auto 20px">',
        [1,2,3,4,5,6,7,8,9,'back','0','del'].map(function(n) {
          if (n === 'back') return '<button id="staff-pin-back" style="width:72px;height:72px;border-radius:50%;background:transparent;border:none;cursor:pointer;color:#9ca3af;margin:0 auto;display:flex;align-items:center;justify-content:center"><i data-lucide="arrow-left" style="width:20px;height:20px"></i></button>';
          if (n === 'del')  return '<button data-key="del" class="staff-pin-key" style="width:72px;height:72px;border-radius:50%;background:transparent;border:none;cursor:pointer;color:#ef4444;margin:0 auto;display:flex;align-items:center;justify-content:center"><i data-lucide="delete" style="width:20px;height:20px"></i></button>';
          return '<button data-key="' + n + '" class="staff-pin-key" style="width:72px;height:72px;border-radius:50%;background:#fafafa;border:1.5px solid #e5e7eb;font-size:22px;cursor:pointer;font-family:inherit;color:#111827;margin:0 auto;display:flex;align-items:center;justify-content:center">' + n + '</button>';
        }).join(''),
      '</div>',

      '<button id="staff-finalizar" style="display:none;width:100%;padding:15px;background:#16a34a;color:#fff;border:none;border-radius:13px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 14px rgba(22,163,74,.25)">',
        '<i data-lucide="check" style="width:18px;height:18px"></i> Entrar no Kontaki',
      '</button>',
      '<div id="staff-profile-error" style="display:none;margin-top:14px;padding:12px;background:#fef2f2;border:1.5px solid #fecaca;border-radius:10px;color:#dc2626;font-size:12px;font-weight:600"></div>',
    '</div>',
  ].join('');

  document.body.appendChild(overlay);
  refreshIcons(overlay);

  var _pin = "", _pinConfirm = "", _step = "enter";

  function renderDots() {
    var dotsEl = overlay.querySelector('#staff-pin-dots');
    var src = _step === "confirm" ? _pinConfirm : _pin;
    var color = _step === "confirm" ? "#16a34a" : "#5b21b6";
    dotsEl.innerHTML = [0,1,2,3,4,5].map(function(i) {
      var filled = i < src.length;
      return '<div style="width:44px;height:44px;border-radius:50%;border:2px solid ' +
        (filled ? color : '#e5e7eb') + ';background:' + (filled ? color : '#f9fafb') +
        ';display:flex;align-items:center;justify-content:center;transition:all .15s"></div>';
    }).join('');
  }
  renderDots();

  overlay.querySelectorAll('.staff-pin-key').forEach(function(btn) {
    btn.onclick = function() {
      var key = btn.getAttribute('data-key');
      if (key === 'del') {
        if (_step === 'confirm') _pinConfirm = _pinConfirm.slice(0,-1);
        else _pin = _pin.slice(0,-1);
      } else {
        var src = _step === 'confirm' ? _pinConfirm : _pin;
        if (src.length < 6) {
          if (_step === 'confirm') _pinConfirm += key;
          else _pin += key;
        }
      }
      renderDots();
      if (_step === 'enter' && _pin.length === 6) {
        setTimeout(function() {
          _step = 'confirm';
          overlay.querySelector('#staff-pin-label').textContent = 'Confirma o PIN';
          renderDots();
        }, 250);
      }
      var fbtn = overlay.querySelector('#staff-finalizar');
      fbtn.style.display = (_step === 'confirm' && _pinConfirm.length === 6) ? 'flex' : 'none';
    };
  });

  overlay.querySelector('#staff-pin-back').onclick = function() {
    _pin = ""; _pinConfirm = ""; _step = "enter";
    overlay.querySelector('#staff-pin-label').textContent = 'Cria o teu PIN de 6 dígitos';
    overlay.querySelector('#staff-finalizar').style.display = 'none';
    renderDots();
  };

  overlay.querySelector('#staff-finalizar').onclick = async function() {
    var name = overlay.querySelector('#staff-name').value.trim();
    var errEl = overlay.querySelector('#staff-profile-error');
    errEl.style.display = 'none';

    if (!name) { errEl.textContent = "Insere o teu nome."; errEl.style.display = 'block'; return; }
    if (_pin.length !== 6) { errEl.textContent = "PIN incompleto."; errEl.style.display = 'block'; return; }
    if (_pin !== _pinConfirm) {
      errEl.textContent = "Os PINs não coincidem. Tenta novamente.";
      errEl.style.display = 'block';
      _pin = ""; _pinConfirm = ""; _step = "enter";
      overlay.querySelector('#staff-pin-label').textContent = 'Cria o teu PIN de 6 dígitos';
      overlay.querySelector('#staff-finalizar').style.display = 'none';
      renderDots();
      return;
    }

    var pinHash = await hashPassword(_pin);
    var username = name.toLowerCase().replace(/\s+/g, ".");

    await db.add("users", {
      name: name, username: username,
      passwordHash: pinHash, password: null,
      role: payload.role === "admin" ? "admin" : "caixa", active: true,
      avatar: name.charAt(0).toUpperCase(),
      createdAt: new Date().toISOString(),
    });

    fadeOutOverlay(overlay, function() { window.location.reload(); });
  };
}
