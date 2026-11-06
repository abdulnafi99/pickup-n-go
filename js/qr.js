// ---------------------------------------------------------------------------
// QR code generation (qrcodejs) and scanning (BarcodeDetector or jsQR fallback)
// ---------------------------------------------------------------------------
import { loadScript } from './utils.js';

// Bundled locally (MIT) so QR codes work fully offline.
const QR_LIB = 'js/vendor/qrcode-generator.js';
const JSQR_LIB = 'js/vendor/jsQR.js';

export const orderQRText = (id) => `PNG-ORDER:${id}`;
export function parseOrderQR(text) {
  const t = String(text || '').trim();
  if (t.startsWith('PNG-ORDER:')) return t.slice(10);
  const m = t.match(/PNG-\d{6}-[A-Z0-9]{4}/);
  return m ? m[0] : t;
}

async function ensureLib() {
  if (!window.qrcode) await loadScript(QR_LIB);
}

function qrCanvas(text, size) {
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 2;
  const cell = Math.max(2, Math.floor((size * 2) / (n + quiet * 2))); // 2x for crisp rendering
  const dim = cell * (n + quiet * 2);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = dim;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, dim, dim);
  ctx.fillStyle = '#1f1f1f';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
    }
  }
  return canvas;
}

/** Render a QR into a container element. Returns the generated data URL. */
export async function renderQR(el, text, size = 200) {
  try {
    await ensureLib();
    const canvas = qrCanvas(text, size);
    canvas.style.cssText = 'display:block;width:100%;height:auto;image-rendering:pixelated';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'QR code');
    el.replaceChildren(canvas);
    return canvas.toDataURL('image/png');
  } catch (e) {
    el.innerHTML = `<div class="qr-fallback"><strong>${text.replace(/^PNG-ORDER:/, '')}</strong><small>QR unavailable</small></div>`;
    return '';
  }
}

export async function qrDataURL(text, size = 220) {
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(div);
  const url = await renderQR(div, text, size);
  div.remove();
  return url;
}

/**
 * Start the camera and scan for QR codes. Returns a stop() function.
 * onResult(text) fires once per detected code.
 */
export async function startScanner(video, onResult, onError) {
  if (!navigator.mediaDevices?.getUserMedia) {
    onError?.(new Error('Camera is not available on this device/browser. Enter the Order ID manually.'));
    return () => {};
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch (e) {
    onError?.(new Error('Camera permission denied. Enter the Order ID manually.'));
    return () => {};
  }
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  await video.play().catch(() => {});

  let detector = null;
  if ('BarcodeDetector' in window) {
    try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch { detector = null; }
  }
  if (!detector) {
    try { await loadScript(JSQR_LIB); } catch (e) { onError?.(new Error('QR scanner library could not load (offline?).')); }
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let running = true;
  let last = '';

  const tick = async () => {
    if (!running) return;
    if (video.readyState >= 2) {
      try {
        let text = '';
        if (detector) {
          const codes = await detector.detect(video);
          text = codes[0]?.rawValue || '';
        } else if (window.jsQR) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          text = window.jsQR(img.data, img.width, img.height)?.data || '';
        }
        if (text && text !== last) {
          last = text;
          onResult(text);
          setTimeout(() => (last = ''), 2500);
        }
      } catch { /* keep scanning */ }
    }
    setTimeout(() => requestAnimationFrame(tick), 180);
  };
  tick();

  return () => {
    running = false;
    stream?.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
}
