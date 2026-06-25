import { db } from "./db.js";
import { refreshIcons } from "./utils.js";

var STEPS = [
  {
    icon: "shopping-cart",
    title: "Regista as tuas vendas",
    desc: "Pesquisa um produto, adiciona ao carrinho e finaliza a venda. É rápido e simples.",
    color: "#5b21b6",
  },
  {
    icon: "package",
    title: "Gere o teu stock",
    desc: "Adiciona produtos com preço de venda e custo. O Kontaki controla automaticamente o stock.",
    color: "#16a34a",
  },
  {
    icon: "hand-coins",
    title: "Controla os fiados",
    desc: "Quando um cliente leva produtos a crédito, regista como fiado. Recebe notificação quando estiver por pagar.",
    color: "#d97706",
  },
  {
    icon: "clock",
    title: "Sistema de turnos",
    desc: "No início do dia abre um turno. No fim exporta o ficheiro .ktk para o patrão verificar.",
    color: "#2563eb",
  },
  {
    icon: "bar-chart-2",
    title: "Acompanha os lucros",
    desc: "O Dashboard mostra as vendas do dia, lucro estimado e alertas de stock em tempo real.",
    color: "#dc2626",
  },
];

export async function checkOnboarding() {
  try {
    var done = localStorage.getItem("kontaki-onboarding-done");
    if (done) return;
    // Só mostra se já tiver feito setup (tem users)
    var users = await db.getAll("users");
    if (!users.length) return;
    setTimeout(showOnboarding, 1500);
  } catch(e) {}
}

function showOnboarding() {
  var step = 0;

  var overlay = document.createElement("div");
  overlay.id = "onboarding-overlay";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:flex-end;justify-content:center";

  function render() {
    var s = STEPS[step];
    var isLast = step === STEPS.length - 1;
    overlay.innerHTML =
      "<div style='background:#fff;border-radius:24px 24px 0 0;width:100%;max-width:480px;padding:28px 24px 36px'>" +
      // Progress dots
      "<div style='display:flex;justify-content:center;gap:6px;margin-bottom:24px'>" +
      STEPS.map(function(_,i){
        return "<div style='width:" + (i===step?"24px":"8px") + ";height:8px;border-radius:4px;background:" + (i===step?s.color:"#e5e7eb") + ";transition:all .3s'></div>";
      }).join("") +
      "</div>" +
      // Icon
      "<div style='width:72px;height:72px;border-radius:20px;background:" + s.color + "20;display:flex;align-items:center;justify-content:center;margin:0 auto 20px'>" +
      "<i data-lucide='" + s.icon + "' style='width:32px;height:32px;color:" + s.color + "'></i>" +
      "</div>" +
      // Text
      "<div style='text-align:center;margin-bottom:28px'>" +
      "<div style='font-size:20px;font-weight:700;color:#111827;margin-bottom:10px'>" + s.title + "</div>" +
      "<div style='font-size:14px;color:#6b7280;line-height:1.6'>" + s.desc + "</div>" +
      "</div>" +
      // Buttons
      "<div style='display:flex;gap:10px'>" +
      "<button onclick='window._onboardingSkip()' style='flex:1;padding:13px;background:#f3f4f6;color:#6b7280;border:none;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit'>" +
      (isLast ? "Começar" : "Saltar") +
      "</button>" +
      (!isLast ?
      "<button onclick='window._onboardingNext()' style='flex:2;padding:13px;background:" + s.color + ";color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px'>" +
      "Próximo <i data-lucide='arrow-right' style='width:16px;height:16px'></i></button>" : "") +
      "</div></div>";

    if (window.lucide) window.lucide.createIcons({el:overlay});
  }

  window._onboardingNext = function() {
    if (step < STEPS.length - 1) { step++; render(); }
    else window._onboardingSkip();
  };

  window._onboardingSkip = function() {
    localStorage.setItem("kontaki-onboarding-done", "1");
    overlay.remove();
  };

  render();
  document.body.appendChild(overlay);
}
