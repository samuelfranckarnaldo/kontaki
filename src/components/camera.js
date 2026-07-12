import { toast } from "../toast.js";

let _activeStream  = null;
let _activeInterval = null;

export function stopCamera() {
  const overlay = document.getElementById("camera-overlay");
  if (overlay) overlay.style.display = "none";
  if (_activeInterval) { clearInterval(_activeInterval); _activeInterval = null; }
  if (_activeStream) {
    _activeStream.getTracks().forEach((t) => t.stop());
    _activeStream = null;
  }
}

export function initCamera(onDetected) {
  // Garante que não há nenhuma sessão anterior presa antes de começar uma nova
  stopCamera();

  const overlay = document.getElementById("camera-overlay");
  const video   = document.getElementById("camera-video");
  const btnClose = document.getElementById("btn-close-camera");

  overlay.style.display = "flex";

  navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
    .then((s) => {
      _activeStream   = s;
      video.srcObject = s;
      video.play();
      scanLoop();
    })
    .catch((err) => {
      overlay.style.display = "none";
      if (err.name === "NotAllowedError") {
        toast("Permissão da câmara negada. Vai a Definições do site no browser e permite o acesso.", "error");
      } else {
        toast("Câmara não disponível. Usa a pesquisa manual.", "error");
      }
    });

  function scanLoop() {
    if (!window.BarcodeDetector) {
      overlay.style.display = "none";
      toast("Este browser não suporta leitura de códigos. Usa a pesquisa manual.", "error");
      stopCamera(); return;
    }
    const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "qr_code", "code_128"] });
    _activeInterval = setInterval(async () => {
      if (video.readyState !== video.HAVE_ENOUGH_DATA) return;
      try {
        const codes = await detector.detect(video);
        if (codes.length > 0) {
          stopCamera();
          onDetected(codes[0].rawValue);
        }
      } catch {}
    }, 300);
  }

  btnClose.onclick = stopCamera;
}

export function openCameraForInvite(onInvite) {
  initCamera(function(rawValue) {
    try {
      var data = JSON.parse(rawValue);
      onInvite(data);
    } catch (e) {
      toast("QR code inválido. Pede um novo convite ao teu patrão.", "error");
    }
  });
}
