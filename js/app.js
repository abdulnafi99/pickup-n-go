// ---------------------------------------------------------------------------
// PICK UP N GO — app bootstrap + hash router
// ---------------------------------------------------------------------------
import { Store } from './store.js';
import { Cart } from './cart.js';
import { $, money } from './utils.js';
import { icon, toast, closeAllModals } from './ui.js';
import { initPWA } from './pwa.js';
import { startOrderWatcher, pushOrderStatus, refreshSubscription } from './push.js';
import * as C from './views/customer.js';
import { admin } from './views/admin.js';
import { staff } from './views/staff.js';
import { initCustomerDrawer, syncCustomerDrawer } from './views/customer-drawer.js';
import { startAutoPrint } from './printer.js';
import { awardLoyalty } from './loyalty.js';

const routes = [
  [/^(home)?$/, C.home],
  [/^welcome$/, C.welcome],
  [/^table\/([^/]+)$/, C.table],
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

/**
 * Jump to a scroll position with no animation. The stylesheet sets
 * `html { scroll-behavior: smooth }` for in-page links, which would otherwise
 * make every route change / live refresh visibly glide.
 */
function jumpTo(y) {
  const root = document.documentElement;
  const prev = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  window.scrollTo(0, y);
  root.style.scrollBehavior = prev;
}

let lastNavCount = null;

function navHTML(path) {
  const active = (p) => (path === p || (p === 'home' && path === '') ? 'on' : '');
  const count = Cart.count;
  const bump = lastNavCount !== null && count > lastNavCount; // pop the badge only when it goes up
  lastNavCount = count;
  return `<div class="nav-pill">
    <a href="#/home" class="${active('home')}" aria-label="Home">${icon.home}<span>Home</span></a>
    <a href="#/menu" class="${active('menu')}" aria-label="Menu">${icon.grid}<span>Menu</span></a>
    <a href="#/cart" class="nav-cart ${active('cart')}" aria-label="Cart, ${count} items">${icon.bag}${count ? `<i class="cart-badge${bump ? ' bump' : ''}">${count > 99 ? '99+' : count}</i>` : ''}</a>
    <a href="#/orders" class="${active('orders')}" aria-label="My orders">${icon.receipt}<span>Orders</span></a>
    <button type="button" class="${active('profile')}" data-cdrawer-open aria-controls="customer-drawer" aria-expanded="false" aria-label="Open menu">${icon.menu}<span>More</span></button>
  </div>`;
}

// ---------------------------------------------------------------------------
// Floating cart bar — always visible while the cart has items, on browsing
// pages (Home, Menu, Item, Table). Hidden on Cart/Checkout and wherever a
// page already shows its own sticky call-to-action.
// ---------------------------------------------------------------------------
const FCART_VIEWS = new Set([C.home, C.catalog, C.item, C.table]);
const chevron = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
let fcartEl = null;
let lastCount = null;

function updateFloatingCart() {
  if (!fcartEl) {
    fcartEl = document.createElement('a');
    fcartEl.href = '#/cart';
    fcartEl.className = 'fcart';
    document.body.appendChild(fcartEl);
  }
  const count = Number(Cart.count) || 0;
  const show = !!current && count > 0 && FCART_VIEWS.has(current.view) && !viewEl.querySelector('.sticky-cta');
  const body = document.body;
  body.classList.toggle('fcart-show', show);
  body.classList.toggle('fcart-nav', !navEl.hidden);
  fcartEl.setAttribute('aria-hidden', show ? 'false' : 'true');
  fcartEl.tabIndex = show ? 0 : -1;

  if (count > 0) {
    const total = money(Cart.totals().total);
    const label = `${count} item${count === 1 ? '' : 's'}`;
    fcartEl.setAttribute('aria-label', `View cart, ${label}, ${total}`);
    fcartEl.innerHTML = `
      <span class="fcart-ico">${icon.bag}<i>${count > 99 ? '99+' : count}</i></span>
      <span class="fcart-main">
        <small>Your cart · ${label}</small>
        <strong>${total}</strong>
      </span>
      <span class="fcart-go">View cart ${chevron}</span>`;
  }

  // Little "pop" whenever an item is added.
  if (show && lastCount !== null && count > lastCount) {
    fcartEl.classList.remove('bump');
    void fcartEl.offsetWidth; // restart the animation
    fcartEl.classList.add('bump');
  }
  lastCount = count;
}

function updateNav() {
  if (!current) return;
  const show = current.view.chrome === 'customer';
  navEl.hidden = !show;
  document.body.dataset.chrome = current.view.chrome;
  if (show) navEl.innerHTML = navHTML(current.ctx.path);
  syncCustomerDrawer(current.ctx.path, current.view.chrome);
  updateFloatingCart();
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
  pendingTopic = null; // this render covers any deferred refresh

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

  jumpTo(fresh ? 0 : scrollY);
  if (focusSel) {
    const el = root.querySelector(focusSel);
    if (el) {
      el.focus({ preventScroll: true });
      try { el.setSelectionRange(caret ?? el.value.length, caret ?? el.value.length); } catch { /* type=search etc */ }
    }
  }
}

/**
 * Fade the current page out, then navigate. Waits a moment first so the
 * customer sees the "added" confirmation. Cancels itself if they move on.
 */
let leaving = false;
function leaveTo(hash, fromView, { wait = 450, fade = 280 } = {}) {
  if (leaving) return;
  leaving = true;
  setTimeout(() => {
    if (current?.view !== fromView) { leaving = false; return; } // customer already left
    viewEl.firstElementChild?.classList.add('leaving');
    setTimeout(() => {
      leaving = false;
      if (current?.view === fromView) go(hash);
    }, fade);
  }, wait);
}

function isTyping() {
  const a = document.activeElement;
  return a && viewEl.contains(a) && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'file'].includes(a.type)) || a.tagName === 'SELECT');
}

let pendingTopic = null;

/**
 * Re-render in place, unless the user is typing — then defer until the field
 * loses focus so we never wipe what they're entering.
 */
function safeRefresh(topic = 'refresh') {
  if (!current) return;
  if (isTyping()) { pendingTopic = topic; return; }
  render(false);
}

function onDataChange(topic) {
  if (!current) return;
  if (topic === 'auth' || topic === 'reset') return render(false);
  const live = current.view.live;
  const wants = typeof live === 'function' ? live(topic) : !!live;
  if (!wants) return;
  safeRefresh(topic);
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
    toast('Couldn’t connect to the server — running in demo mode for now.', 'error', 6000);
  }

  Store.on(onDataChange);
  window.addEventListener('table:change', () => safeRefresh('table'));
  // Notifications: push to the customer when staff change status, plus local alerts.
  Store.onStatusChanged = (order) => {
    if (!Store.isStaff()) return;
    pushOrderStatus(order);
    // Completed → +1 stamp / +10 points in the Selagi Coffee loyalty app.
    if (order?.status === 'Completed') awardLoyalty(order);
  };
  startOrderWatcher();
  refreshSubscription();
  // Bluetooth receipt printer on the counter tablet: auto-print new orders.
  startAutoPrint();
  window.addEventListener('printer:change', () => { if (current?.view === staff) safeRefresh('printer'); });
  window.addEventListener('notify:change', () => safeRefresh('notify'));
  // Notification clicks from the service worker
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.type === 'navigate' && e.data.url) {
      const hash = e.data.url.includes('#') ? e.data.url.slice(e.data.url.indexOf('#')) : '#/home';
      go(hash);
    }
  });
  let lastCartCount = Number(Cart.count) || 0;
  window.addEventListener('cart:change', () => {
    const count = Number(Cart.count) || 0;
    const added = count > lastCartCount;
    lastCartCount = count;
    updateNav();
    // Added from an item page → glide back to Home (cart bar shows the total there).
    if (added && current?.view === C.item) return leaveTo('#/home', C.item);
    if (current?.view === C.cart || current?.view === C.checkout) safeRefresh('cart');
  });
  document.addEventListener('focusout', () => {
    setTimeout(() => {
      if (pendingTopic && !isTyping()) render(false);
    }, 150);
  });
  window.addEventListener('pwa:install-change', () => {
    if (current?.view === C.home || current?.view === C.profile) safeRefresh('pwa');
  });
  window.addEventListener('hashchange', () => render(true));

  render(true);
  document.body.classList.add('ready');
  setTimeout(() => $('#boot')?.remove(), 450);
}

boot();
