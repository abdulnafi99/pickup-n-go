// ---------------------------------------------------------------------------
// PWA: service worker registration, install prompt, online/offline status
// ---------------------------------------------------------------------------
import { toast } from './ui.js';

let deferredPrompt = null;

export function installState() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone;
  return { canInstall: !!deferredPrompt && !standalone, ios, standalone };
}

export async function promptInstall() {
  if (!deferredPrompt) return toast('Use your browser menu → “Add to Home screen”.');
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  if (outcome === 'accepted') toast('App installed!', 'success');
  window.dispatchEvent(new CustomEvent('pwa:install-change'));
}

export function initPWA() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.dispatchEvent(new CustomEvent('pwa:install-change'));
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent('pwa:install-change'));
  });

  const banner = document.getElementById('offline-banner');
  const setOnline = () => banner.classList.toggle('show', !navigator.onLine);
  window.addEventListener('online', () => { setOnline(); toast('Back online', 'success'); });
  window.addEventListener('offline', () => { setOnline(); toast('You are offline — browsing cached menu', 'error'); });
  setOnline();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          sw?.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              toast('New version available — refresh to update.', 'info', 5000);
            }
          });
        });
      }).catch((e) => console.warn('SW registration failed', e));
    });
  }
}
