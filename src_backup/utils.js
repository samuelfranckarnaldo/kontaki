export const fmt = (n) =>
  `${Number(n || 0).toLocaleString("pt-AO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz`;

export const fmtDate = (iso) =>
  new Date(iso).toLocaleString("pt-AO", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

export const today = () => new Date().toISOString().split("T")[0];

export const el     = (id)    => document.getElementById(id);
export const val    = (id)    => (el(id) ? el(id).value : "") || "";
export const setVal = (id, v) => { if (el(id)) el(id).value = v; };
export const html   = (id, c) => { const n = el(id); if (n) n.innerHTML = c; };

export const stockColor = (qty) => {
  if (qty <= 0) return "var(--danger)";
  if (qty <= 5) return "var(--warning)";
  return "var(--success)";
};

export const refreshIcons = (node = document) => {
  if (window.lucide) window.lucide.createIcons({ nodes: [node] });
};

// QR Code gerado offline via Canvas - implementação minimalista
export function generateQR(text, container, size = 120) {
  if (!container) return;
  container.innerHTML = "";

  if (window.QRCode) {
    new window.QRCode(container, {
      text, width: size, height: size,
      colorDark: "#18181b", colorLight: "#ffffff",
      correctLevel: window.QRCode.CorrectLevel.M,
    });
    return;
  }

  // Fallback offline: mostra código formatado + link de verificação
  const hash = text.split("|").pop() || text;
  const box = document.createElement("div");
  box.style.cssText = `width:${size}px;height:${size}px;background:#f4f4f5;border:2px solid #e4e4e7;
    border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;
    padding:8px;box-sizing:border-box;text-align:center`;
  box.innerHTML =
    `<div style="font-size:9px;color:#71717a;font-weight:700;text-transform:uppercase;
                 letter-spacing:.5px;margin-bottom:6px">Código</div>` +
    `<div style="font-size:16px;font-weight:700;color:#5b21b6;letter-spacing:3px;
                 word-break:break-all">${hash}</div>` +
    `<div style="font-size:8px;color:#a1a1aa;margin-top:6px;line-height:1.4">
      Verificar na app<br/>Kontaki</div>`;
  container.appendChild(box);
}
