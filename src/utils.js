export const fmt = (n) =>
  `${Number(n || 0).toLocaleString("pt-AO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz`;

export const fmtDate = (iso) =>
  new Date(iso).toLocaleString("pt-AO", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

export const today = () => new Date().toISOString().split("T")[0];

export const el     = (id)    => document.getElementById(id);

// Vibração/haptic feedback. "success" = toque curto, "error" = padrão
// duplo, qualquer outro valor (ou nenhum) = toque curto genérico.
// Silencioso em dispositivos/browsers sem suporte (ex: iOS Safari).
export function haptic(pattern) {
  if (!navigator.vibrate) return;
  if (pattern === "error") navigator.vibrate([30, 60, 30]);
  else if (pattern === "success") navigator.vibrate(15);
  else navigator.vibrate(typeof pattern === "number" ? pattern : 15);
}

// ── WAKE LOCK (manter ecrã ligado durante uma venda) ────────────────────────
// O Wake Lock liberta-se sozinho quando a página fica escondida (ecrã apaga,
// troca de app); guardamos a intenção em _wakeLockWanted para reaquerir
// automaticamente quando a página volta a ficar visível.
let _wakeLock = null;
let _wakeLockWanted = false;

async function _acquireWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try {
    _wakeLock = await navigator.wakeLock.request("screen");
    _wakeLock.addEventListener("release", () => { _wakeLock = null; });
  } catch (e) {
    // falha silenciosa (ex: documento não visível); tenta de novo no
    // próximo visibilitychange enquanto _wakeLockWanted continuar true
  }
}

export async function setWakeLock(active) {
  _wakeLockWanted = active;
  if (!("wakeLock" in navigator)) return;
  if (active && !_wakeLock) {
    await _acquireWakeLock();
  } else if (!active && _wakeLock) {
    try { await _wakeLock.release(); } catch (e) {}
    _wakeLock = null;
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (_wakeLockWanted && document.visibilityState === "visible" && !_wakeLock) {
      _acquireWakeLock();
    }
  });
}
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
export function getQrDataUrl(text) {
  return new Promise(function(resolve) {
    if (typeof window.QRCode === "undefined") {
      console.error("QRCode: biblioteca não carregada");
      resolve(null);
      return;
    }
    if (!text) {
      resolve(null);
      return;
    }
    try {
      var temp = document.createElement("div");
      temp.style.cssText = "position:fixed;left:-9999px;top:-9999px";
      document.body.appendChild(temp);

      new window.QRCode(temp, {
        text: text, width: 200, height: 200,
        colorDark: "#18181b", colorLight: "#ffffff",
        correctLevel: window.QRCode.CorrectLevel.M,
      });

      setTimeout(function() {
        var canvas = temp.querySelector("canvas");
        var dataUrl = null;
        if (canvas) {
          try { dataUrl = canvas.toDataURL("image/png"); } catch(e) { console.error("QRCode: falha ao converter canvas", e); }
        } else {
          console.error("QRCode: canvas não gerado a tempo");
        }
        document.body.removeChild(temp);
        resolve(dataUrl);
      }, 400);
    } catch (e) {
      console.error("QRCode: erro ao instanciar", e);
      resolve(null);
    }
  });
}

export function generateQR(text, container, size) {
  size = size || 120;
  if (!container) return;
  // QRCode.js max ~512 chars no modo M — garante limite
  if (text && text.length > 200) text = text.slice(0, 200);
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

export function getTurnoDuration(openedAt) {
  const mins = Math.round((Date.now() - new Date(openedAt)) / 60000);
  const hrs  = Math.floor(mins / 60);
  return { str: hrs > 0 ? `${hrs}h ${mins % 60}min` : `${mins}min`, warn: hrs >= 12, hrs };
}
