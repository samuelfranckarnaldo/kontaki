export function initCamera(onDetected) {
  const overlay = document.getElementById("camera-overlay");
  const video   = document.getElementById("camera-video");
  const btnClose = document.getElementById("btn-close-camera");
  let stream    = null;

  overlay.style.display = "flex";

  navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
    .then((s) => {
      stream       = s;
      video.srcObject = s;
      video.play();
      scanLoop();
    })
    .catch(() => {
      overlay.style.display = "none";
      alert("Câmara não disponível. Use a pesquisa manual.");
    });

  function scanLoop() {
    if (!window.BarcodeDetector) {
      overlay.style.display = "none";
      alert("Este browser não suporta leitura de códigos. Use a pesquisa manual.");
      stop(); return;
    }
    const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "qr_code", "code_128"] });
    const interval = setInterval(async () => {
      if (video.readyState !== video.HAVE_ENOUGH_DATA) return;
      try {
        const codes = await detector.detect(video);
        if (codes.length > 0) {
          clearInterval(interval);
          stop();
          onDetected(codes[0].rawValue);
        }
      } catch {}
    }, 300);
  }

  function stop() {
    overlay.style.display = "none";
    if (stream) stream.getTracks().forEach((t) => t.stop());
  }

  btnClose.onclick = stop;
}
