// ---------------------------------------------------------------------------
// Customer navigation drawer (slides in from the left on any customer page).
// Opened by any [data-cdrawer-open] element (Home ☰ button, "Lagi" tab in the
// bottom bar) or by swiping in from the left screen edge. Rendered into the
// #cdrawer container from index.html so it lives outside the view root.
// ---------------------------------------------------------------------------
import { Store, ACTIVE_STATUSES } from '../store.js';
import { Cart } from '../cart.js';
import { CATEGORIES } from '../sample-data.js';
import { esc, initials, fmtDate, fmtTime, greeting } from '../utils.js';
import { icon } from '../ui.js';
import { contactShopLink } from '../whatsapp.js';
import { installState, promptInstall } from '../pwa.js';
import { permission, myOrderIds } from '../push.js';
import { logoSVG } from './customer.js';

const state = { open: false };
let host = null;
let currentPath = '';

function myOrders() {
  const u = Store.user;
  const local = new Set(myOrderIds());
  return Store.orders.filter((o) => local.has(o.id) || o.customer?.uid === u.id || (u.role === 'customer' && u.phone && o.customer?.phone === u.phone));
}

function html() {
  const u = Store.user;
  const isCustomer = u.role === 'customer';
  const name = isCustomer ? u.name : '';
  const active = myOrders().filter((o) => ACTIVE_STATUSES.includes(o.status))
    .sort((a, b) => (a.pickupDate + a.pickupTime).localeCompare(b.pickupDate + b.pickupTime));
  const favCount = (u.favourites || []).length;
  const cartCount = Cart.count;
  const inst = installState();
  const on = (p) => (currentPath === p || (p === 'home' && currentPath === '') ? 'on' : '');
  const link = (href, ico, label, path, count = 0) =>
    `<a href="${href}" class="${on(path)}" ${on(path) ? 'aria-current="page"' : ''}>${ico}<span>${label}</span>${count ? `<i class="nav-count">${count > 99 ? '99+' : count}</i>` : ''}</a>`;

  return `
    <div class="admin-brand">
      <span class="logo-mark">${logoSVG()}</span><div><strong>PICK UP N GO</strong><small>Pre-order • Pickup</small></div>
      <button class="drawer-close" data-cdrawer-close aria-label="Tutup menu">${icon.x}</button>
    </div>
    <a class="drawer-user" href="#/profile">
      <span class="avatar">${esc(initials(name))}</span>
      <div><small>${greeting()} 👋</small><strong>${esc(name || 'Tetamu')}</strong><small>${esc((isCustomer && u.phone) || 'Lengkapkan profil anda')}</small></div>
      ${icon.chevronRight}
    </a>
    ${active.length ? `<a class="drawer-order" href="#/order/${active[0].id}">
        <span class="ao-pulse"></span>
        <div><small>Pesanan aktif • ${esc(active[0].id)}</small><strong>${esc(active[0].status)}</strong><small>Pickup ${fmtDate(active[0].pickupDate, false)} • ${fmtTime(active[0].pickupTime)}</small></div>
      </a>` : ''}
    <nav class="admin-nav" aria-label="Navigasi utama">
      ${link('#/home', icon.home, 'Home', 'home')}
      ${link('#/menu', icon.grid, 'Food Catalog', 'menu')}
      ${link('#/cart', icon.bag, 'My Cart', 'cart', cartCount)}
      ${link('#/orders', icon.receipt, 'My Orders', 'orders', active.length)}
      ${link('#/profile', icon.heart, 'Favourites & Profile', 'profile', favCount)}
    </nav>
    <p class="side-label">Kategori</p>
    <nav class="cat-grid" aria-label="Kategori makanan">
      ${CATEGORIES.map((c) => `<a href="#/menu?cat=${c.id}" class="cat-chip"><span class="cat-emoji">${c.icon}</span><span>${esc(c.name)}</span></a>`).join('')}
    </nav>
    <p class="side-label">Bantuan</p>
    <a href="${contactShopLink()}" target="_blank" rel="noopener" class="wa-pill">${icon.whatsapp}<span><strong>WhatsApp Kedai</strong><small>Tanya menu, pesanan & pickup</small></span></a>
    <nav class="admin-nav" aria-label="Bantuan">
      <a href="#/profile"><span class="row-emoji">🔔</span><span>Notifikasi</span>${permission() === 'granted' ? '<em class="side-ok">Aktif</em>' : '<em class="side-off">Hidupkan</em>'}</a>
      ${inst.canInstall ? `<button data-nav data-install>${icon.install}<span>Pasang App</span></button>` : ''}
      ${inst.ios ? `<span class="side-note">${icon.install}<span>iPhone: Share → Add to Home Screen</span></span>` : ''}
    </nav>
    <div class="admin-foot">
      ${Store.isAdmin() ? `<a href="#/admin">${icon.chart}<span>Admin Panel</span></a>` : ''}
      ${Store.isStaff() ? `<a href="#/staff">${icon.scan}<span>Staff Counter</span></a>` : `<a href="#/login">${icon.store}<span>Staff / Admin Login</span></a>`}
      <p class="side-version">v1.6 • ${Store.mode === 'firebase' ? '<b class="mode-on">Firebase</b>' : '<b class="mode-demo">Demo mode</b>'}</p>
    </div>`;
}

function render() {
  if (!host) return;
  host.querySelector('.admin-side').innerHTML = html();
}

function set(open) {
  if (!host) return;
  state.open = open;
  if (open) render();
  host.classList.toggle('drawer-open', open);
  host.setAttribute('aria-hidden', String(!open));
  document.body.classList.toggle('no-scroll', open);
  document.querySelectorAll('[data-cdrawer-open]').forEach((b) => b.setAttribute('aria-expanded', String(open)));
  if (open) host.querySelector('.admin-nav .on, .admin-nav a')?.focus({ preventScroll: true });
}

export const openCustomerDrawer = () => set(true);
export const closeCustomerDrawer = () => set(false);

/** Called by the router on every render so the drawer knows the current page. */
export function syncCustomerDrawer(path, chrome) {
  currentPath = path;
  if (chrome !== 'customer' && state.open) set(false);
  else if (state.open) render();
}

export function initCustomerDrawer() {
  host = document.getElementById('cdrawer');
  if (!host) return;
  host.innerHTML = `<div class="admin-scrim" data-cdrawer-close></div><aside class="admin-side" id="customer-drawer" aria-label="Menu pelanggan"></aside>`;
  const side = host.querySelector('.admin-side');

  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-cdrawer-open]');
    if (opener) { e.preventDefault(); set(!state.open); return; }
    if (!state.open) return;
    if (e.target.closest('[data-cdrawer-close]')) { set(false); return; }
    if (e.target.closest('#cdrawer [data-install]')) { set(false); promptInstall(); return; }
    if (e.target.closest('#cdrawer a')) set(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.open && !document.querySelector('.modal-wrap')) set(false);
  });
  window.addEventListener('hashchange', () => { if (state.open) set(false); });
  window.addEventListener('cart:change', () => { if (state.open) render(); });
  Store.on(() => { if (state.open) render(); });

  // Swipe left on the drawer to close.
  let x0 = null;
  side.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  side.addEventListener('touchmove', (e) => {
    if (x0 === null) return;
    const dx = e.touches[0].clientX - x0;
    if (dx < 0) side.style.transform = `translateX(${dx}px)`;
  }, { passive: true });
  side.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? x0) - x0;
    side.style.transform = '';
    x0 = null;
    if (dx < -70) set(false);
  });

  // Swipe right from the left screen edge (customer pages only) to open.
  let edge = null;
  document.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    edge = !state.open && document.body.dataset.chrome === 'customer' && t.clientX < 22 ? { x: t.clientX, y: t.clientY } : null;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!edge) return;
    const t = e.changedTouches[0];
    if (t && t.clientX - edge.x > 60 && Math.abs(t.clientY - edge.y) < 50) set(true);
    edge = null;
  });
}
