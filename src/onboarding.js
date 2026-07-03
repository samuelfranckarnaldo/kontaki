import { refreshIcons } from "./utils.js";
import { showRoleSelect } from "./role-select.js";

const SLIDES = [
  {
    icon: "receipt",
    color: "#5b21b6",
    bg: "#ede9fe",
    title: "Bem-vindo ao Kontaki",
    text: "Vende, controla o stock e sabe sempre quanto estás a ganhar — tudo no teu telemóvel.",
  },
  {
    icon: "wifi-off",
    color: "#16a34a",
    bg: "#f0fdf4",
    title: "Funciona sem internet",
    text: "Os teus dados ficam guardados no dispositivo. Vende mesmo sem rede.",
  },
  {
    icon: "wallet",
    color: "#d97706",
    bg: "#fffbeb",
    title: "Fiados organizados",
    text: "Sabe sempre quem te deve e quanto, sem confusão nem caderno.",
  },
  {
    icon: "printer",
    color: "#2563eb",
    bg: "#eff6ff",
    title: "Recibo profissional",
    text: "Emite recibos para os teus clientes em segundos, prontos a imprimir ou partilhar.",
  },
];

export function showOnboarding() {
  var seen = localStorage.getItem("kontaki_onboarding_seen");
  if (seen) {
    showRoleSelect();
    return;
  }

  var current = 0;
  var overlay = document.createElement("div");
  overlay.id = "onboarding-overlay";
  overlay.style.cssText = "position:fixed;inset:0;background:#fff;z-index:9999;display:flex;flex-direction:column;font-family:inherit;animation:onbFadeIn .3s ease";

  if (!document.getElementById("onb-anim-style")) {
    var styleTag = document.createElement("style");
    styleTag.id = "onb-anim-style";
    styleTag.textContent =
      "@keyframes onbFadeIn { from { opacity:0 } to { opacity:1 } }" +
      "@keyframes onbSlideIn { from { opacity:0; transform:translateX(24px) } to { opacity:1; transform:translateX(0) } }" +
      "@keyframes onbFadeOut { from { opacity:1 } to { opacity:0 } }" +
      ".onb-slide-content { animation: onbSlideIn .35s ease; }";
    document.head.appendChild(styleTag);
  }

  function render() {
    var s = SLIDES[current];
    var isLast = current === SLIDES.length - 1;

    overlay.innerHTML = [
      '<div style="display:flex;justify-content:flex-end;padding:16px 20px 0">',
        '<button id="btn-onb-skip" style="background:none;border:none;color:#a1a1aa;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Saltar</button>',
      '</div>',

      '<div class="onb-slide-content" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center">',
        '<div style="width:96px;height:96px;background:' + s.bg + ';border-radius:28px;display:flex;align-items:center;justify-content:center;margin-bottom:28px">',
          '<i data-lucide="' + s.icon + '" style="width:44px;height:44px;color:' + s.color + '"></i>',
        '</div>',
        '<div style="font-size:22px;font-weight:800;color:#18181b;margin-bottom:12px;letter-spacing:-.3px;max-width:300px">' + s.title + '</div>',
        '<div style="font-size:14px;color:#71717a;line-height:1.6;max-width:280px">' + s.text + '</div>',
      '</div>',

      '<div style="display:flex;justify-content:center;gap:8px;padding-bottom:24px">',
        SLIDES.map(function(_, i) {
          var active = i === current;
          return '<div style="width:' + (active ? '22px' : '8px') + ';height:8px;border-radius:4px;background:' + (active ? s.color : '#e4e4e7') + ';transition:all .25s"></div>';
        }).join(''),
      '</div>',

      '<div style="padding:0 24px 32px">',
        '<button id="btn-onb-next" style="width:100%;padding:16px;background:' + s.color + ';color:#fff;border:none;border-radius:14px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px">',
          (isLast ? 'Começar' : 'Continuar'),
          '<i data-lucide="arrow-right" style="width:18px;height:18px"></i>',
        '</button>',
      '</div>',
    ].join('');

    refreshIcons(overlay);

    overlay.querySelector('#btn-onb-skip').onclick = finish;
    overlay.querySelector('#btn-onb-next').onclick = function() {
      if (isLast) { finish(); return; }
      current++;
      render();
    };
  }

  function finish() {
    localStorage.setItem("kontaki_onboarding_seen", "1");
    overlay.style.animation = "onbFadeOut .25s ease forwards";
    setTimeout(function() {
      overlay.remove();
      showRoleSelect();
    }, 220);
  }

  document.body.appendChild(overlay);
  render();
}
