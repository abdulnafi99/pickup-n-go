// ---------------------------------------------------------------------------
// PICK UP N GO — app bootstrap + hash router
// ---------------------------------------------------------------------------
import { Store } from './store.js';
import { Cart } from './cart.js';
import { $ } from './utils.js';
import { icon, toast, closeAllModals } from './ui.js';
import { initPWA } from './pwa.js';
import { startOrderWatcher, pushOrderStatus, refreshSubscription } from './push.js';
import * as C from './views/customer.js';
import { admin } from './views/admin.js';
import { staff } from './views/staff.js';
import { initCustomerDrawer, syncCustomerDrawer } from './views/customer-drawer.js';

const routes = [
  [/^(home)?$/, C.home],
  [/^welcome$/, C.welcome],
  [/^menu$/, C.catalog],
  [/^item\/([^/]+)$/, C.item],
  [/^cart$/, C.cart],
  [/^checkout$/, C.checkout],
  [/^order\/([^/]+)$/, C.order],
  [/^orders$/, C.orders],
  [/^profile$/, C.profile],
  [/^login$/, C.login],
  [/^staff$/, staff],
  [/^admin(?:\/([a-z-]+))?$/, admin],
];

const viewEl = $('#view');
const navEl = $('#bottom-nav');
let current = null; // { view, ctx }

function parseHash() {
  const raw = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [path, qs = ''] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  return { path: path.replace(/\/$/, ''), query };
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function navHTML(path) {
  const active = (p) => (path === p || (p === 'home' && path === '') ? 'on' : '');
  const count = Cart.count;
  return `<div class="nav-pill">
    <a href="#/home" class="${active('home')}" aria-label="Home">${icon.home}<span>Home</span></a>
    <a href="#/menu" class="${active('menu')}" aria-label="Menu">${icon.grid}<span>Menu</span></a>
    <a href="#/cart" class="nav-cart ${active('cart')}" aria-label="Cart, ${count} items">${icon.bag}${count ? `<i class="cart-badge">${count > 99 ? '99+' : count}</i>` : ''}</a>
    <a href="#/orders" class="${active('orders')}" aria-label="My orders">${icon.receipt}<span>Orders</span></a>
    <button type="button" class="${active('profile')}" data-cdrawer-open aria-controls="customer-drawer" aria-expanded="false" aria-label="Buka menu">${icon.menu}<span>Lagi</span></button>
  </div>`;
}

function updateNav() {
  if (!current) return;
  const show = current.view.chrome === 'customer';
  navEl.hidden = !show;
  document.body.dataset.chrome = current.view.chrome;
  if (show) navEl.innerHTML = navHTML(current.ctx.path);
  syncCustomerDrawer(current.ctx.path, current.view.chrome);
}

/** Render the current route (fresh=true on navigation). */
function render(fresh = true, opts = {}) {
  const { path, query } = parseHash();
  let view = null;
  let params = [];
  for (const [re, v] of routes) {
    const m = path.match(re);
    if (m) { view = v; params = m.slice(1).filter((x) => x !== undefined); break; }
  }
  if (!view) { go('#/home'); return; }
  if (view === C.home && !localStorage.getItem('png_welcomed')) view = C.welcome;

  const ctx = { path, query, params, go, refresh: (o) => render(false, o) };
  if (fresh) {
    closeAllModals();
    view.enter?.(ctx);
  }
  current = { view, ctx };

  const scrollY = window.scrollY;
  const focusSel = opts.keepFocus;
  let caret = null;
  if (focusSel) {
    const el = viewEl.querySelector(focusSel);
    if (el) caret = el.selectionStart;
  }

  // Fresh element each render so listeners from previous mounts are dropped.
  const root = document.createElement('div');
  root.className = 'view-root' + (fresh ? ' enter' : '');
  root.innerHTML = view.render(ctx);
  viewEl.replaceChildren(root);
  view.mount?.(root, ctx);
  updateNav();

  if (fresh) window.scrollTo(0, 0);
  else window.scrollTo(0, scrollY);
  if (focusSel) {
    const el = root.querySelector(focusSel);
    if (el) {
      el.focus({ preventScroll: true });
      try { el.setSelectionRange(caret ?? el.value.length, caret ?? el.value.length); } catch { /* type=search etc */ }
    }
  }
}

function isTyping() {
  const a = document.activeElement;
  return a && viewEl.contains(a) && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'file'].includes(a.type)) || a.tagName === 'SELECT');
}

let pendingTopic = null;
function onDataChange(topic) {
  if (!current) return;
  if (topic === 'auth' || topic === 'reset') return render(false);
  const live = current.view.live;
  const wants = typeof live === 'function' ? live(topic) : !!live;
  if (!wants) return;
  if (isTyping()) { pendingTopic = topic; return; } // don't wipe what the user is typing
  render(false);
}

async function boot() {
  initPWA();
  initCustomerDrawer();
  try {
    await Store.init();
  } catch (e) {
    console.error(e);
    $('#boot').innerHTML = `<div class="boot-error"><h2>Unable to start</h2><p>${e.message}</p><button onclick="location.reload()">Retry</button></div>`;
    return;
  }
  if (Store.initError && !sessionStorage.getItem('png_fb_warned')) {
    sessionStorage.setItem('png_fb_warned', '1');
    toast('Firebase belum siap — app berjalan dalam mod demo buat sementara.', 'error', 6000);
  }

  Store.on(onDataChange);
  // Notifications: push to the customer when staff change status, plus local alerts.
  Store.onStatusChanged = (order) => { if (Store.isStaff()) pushOrderStatus(order); };
  startOrderWatcher();
  refreshSubscription();
  window.addEventListener('notify:change', () => render(false));
  // Notification clicks from the service worker
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.type === 'navigate' && e.data.url) {
      const hash = e.data.url.includes('#') ? e.data.url.slice(e.data.url.indexOf('#')) : '#/home';
      go(hash);
    }
  });
  window.addEventListener('cart:change', () => {
    updateNav();
    if (current?.view === C.cart || current?.view === C.checkout) {
      if (!isTyping()) render(false);
    }
  });
  document.addEventListener('focusout', () => {
    setTimeout(() => {
      if (pendingTopic && !isTyping()) { pendingTopic = null; render(false); }
    }, 150);
  });
  window.addEventListener('pwa:install-change', () => { if (current?.view === C.home || current?.view === C.profile) render(false); });
  window.addEventListener('hashchange', () => render(true));

  render(true);
  document.body.classList.add('ready');
  setTimeout(() => $('#boot')?.remove(), 450);
}

boot();
