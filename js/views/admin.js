// ---------------------------------------------------------------------------
// Admin dashboard: analytics, orders, schedule, menu, pickup settings,
// customers and shop/payment settings
// ---------------------------------------------------------------------------
import { Store, ORDER_STATUSES, ACTIVE_STATUSES } from '../store.js';
import { categories, catName as catNameFn } from '../categories.js';
import { ART_KEYS, itemVisual, foodArt } from '../food-art.js';
import { $, $$, esc, money, uid, todayStr, addDays, fmtDate, fmtTime, fmtDateTime, compressImage, parseDate, DAYS_LONG, isValidPhone } from '../utils.js';
import { icon, toast, modal, confirmDialog, busy, badge } from '../ui.js';
import { generateSlots } from '../pickup.js';
import { waLink, reminderMessage, statusMessage, PAY_LABEL, locationName } from '../whatsapp.js';
import { itemsHTML, totalsHTML, pickupInfoHTML, customerHTML, paymentHTML, printReceipt, downloadReceipt, viewImage, trackerHTML } from './shared.js';
import { logoSVG } from './customer.js';
import { bindDrawer, drawerButton } from './drawer.js';
import { permission, enableNotifications, pushReminder } from '../push.js';

const TABS = [
  ['dashboard', 'Dashboard', icon.chart, 'Operasi'],
  ['orders', 'Orders', icon.receipt, 'Operasi'],
  ['schedule', 'Pickup Schedule', icon.calendar, 'Operasi'],
  ['menu', 'Menu', icon.grid, 'Kedai'],
  ['pickup', 'Pickup Settings', icon.clock, 'Kedai'],
  ['settings', 'Shop & Payment', icon.settings, 'Kedai'],
  ['customers', 'Customers', icon.people, 'Pelanggan'],
];

const st = {
  orderStatus: 'active',
  orderDate: '',
  orderQ: '',
  schedDate: todayStr(),
  menuQ: '',
  menuCat: '',
  custQ: '',
  pickup: null, // working copy of pickup settings
  shop: null, // working copy of shop settings
};

export const catName = catNameFn;

// ---------------------------------------------------------------------------
// Access guard shared with staff view
// ---------------------------------------------------------------------------
export function deniedHTML(next, role = 'admin') {
  return `<section class="page login">
    <div class="login-hero"><span class="logo-mark lg">${logoSVG()}</span><h2>Restricted Area</h2>
    <p>${role === 'admin' ? 'Admin' : 'Staff'} access required.</p></div>
    ${Store.user && !Store.user.guest ? `<div class="card">
      <p class="small">Log masuk sebagai <b>${esc(Store.user.email || '-')}</b> (${esc(Store.user.role)}) • ${Store.mode === 'firebase' ? '<b class="mode-on">Firebase</b>' : '<b class="mode-demo">Demo mode</b>'}</p>
      <p class="small">UID anda: <code>${esc(Store.user.id)}</code></p>
      ${Store.user.ownerRulesMissing ? '<div class="alert alert-warn" style="margin-top:10px">UID ini ada dalam senarai pemilik app, tetapi <b>rules yang dipublish di Firebase belum mengenalinya</b>. Semak fungsi <code>isOwner()</code> dalam Firestore → Rules mengandungi UID di atas, Publish, kemudian log masuk semula.</div>' : '<p class="small muted">Minta pemilik kedai tambah UID ini sebagai staff/admin.</p>'}
    </div>` : ''}
    <a class="btn btn-primary btn-block btn-lg" href="#/login?next=${encodeURIComponent(next)}">Log in</a>
    <a class="btn btn-ghost btn-block" href="#/home">Back to shop</a>
  </section>`;
}

// ---------------------------------------------------------------------------
// Order detail modal with all management actions (also used by staff)
// ---------------------------------------------------------------------------
export function openOrderModal(id, { staffMode = false } = {}) {
  const m = modal('', { title: 'Order Details', wide: true, onClose: () => off() });
  const draw = () => {
    const o = Store.order(id);
    if (!o) { m.el.innerHTML = '<p>Order not found.</p>'; return; }
    const isAdmin = Store.isAdmin();
    m.el.innerHTML = `<div class="admin-order">
      <div class="ao-head">
        <div><small>Order ID</small><h2 class="oid">${esc(o.id)}</h2><small>${fmtDateTime(o.createdAt)}</small></div>
        <div class="ao-badges">${badge(o.status)} ${badge(o.payment.status)}</div>
      </div>
      ${trackerHTML(o)}
      <div class="ao-actions">
        ${o.status === 'Pending Confirmation' ? `<button class="btn btn-primary" data-status="Order Accepted">${icon.check} Accept Order</button>
          <button class="btn btn-danger" data-reject>${icon.x} Reject</button>` : ''}
        ${nextStatusBtn(o)}
        ${!staffMode || isAdmin ? `<label class="select-wrap inline"><span>Status</span><select data-set-status>${ORDER_STATUSES.map((s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>` : ''}
      </div>
      <div class="ao-grid">
        <div class="card"><h3>Pickup</h3>${pickupInfoHTML(o)}</div>
        <div class="card"><h3>Customer</h3>${customerHTML(o, { admin: true })}
          <div class="btn-row wrap">
            <a class="btn btn-wa btn-sm" href="${waLink(o.customer.phone, statusMessage(o))}" target="_blank" rel="noopener">${icon.whatsapp} Status Update</a>
            <a class="btn btn-wa btn-sm" href="${waLink(o.customer.phone, reminderMessage(o))}" target="_blank" rel="noopener">${icon.whatsapp} Pickup Reminder</a>
            <a class="btn btn-ghost btn-sm" href="tel:${esc(o.customer.phone)}">Call</a>
            ${o.pushSub ? '<button class="btn btn-ghost btn-sm" data-push-remind>🔔 Push Reminder</button>' : '<small class="muted push-none">No push subscription</small>'}
          </div>
        </div>
        <div class="card"><h3>Items</h3>${itemsHTML(o)}${o.specialRequest ? `<p class="special">🗒️ ${esc(o.specialRequest)}</p>` : ''}${totalsHTML(o, { promo: o.promoCode })}</div>
        <div class="card"><h3>Payment</h3>${paymentHTML(o)}
          ${o.payment.receipt ? `<button class="receipt-thumb" data-view-receipt><img src="${esc(o.payment.receipt)}" alt="Receipt"></button>` : o.payment.method === 'duitnow' ? '<p class="muted">No receipt uploaded yet.</p>' : ''}
          ${o.payment.status !== 'Verified' ? `<div class="btn-row"><button class="btn btn-primary btn-sm" data-pay="Verified">${icon.check} Verify Payment</button>
            ${o.payment.status !== 'Rejected' ? `<button class="btn btn-danger btn-sm" data-pay="Rejected">${icon.x} Reject Payment</button>` : ''}</div>`
            : `<button class="btn btn-ghost btn-sm" data-pay="Pending">Mark payment as Pending</button>`}
        </div>
      </div>
      <div class="btn-row wrap">
        <button class="btn btn-dark" data-print>${icon.print} Print Receipt</button>
        <button class="btn btn-ghost" data-download>${icon.download} Download</button>
      </div>
    </div>`;
  };
  draw();
  const off = Store.on((topic) => { if (topic === 'orders' || topic === 'sync') draw(); });

  m.el.addEventListener('click', async (e) => {
    const o = Store.order(id);
    const b = e.target.closest('button');
    if (!b || !o) return;
    if (b.dataset.status) busy(b, async () => { await Store.updateOrder(id, { status: b.dataset.status }); toast(`Order ${b.dataset.status}`, 'success'); });
    else if (b.hasAttribute('data-reject')) {
      if (await confirmDialog('Reject and cancel this order?', { ok: 'Reject Order', danger: true })) {
        await Store.updateOrder(id, { status: 'Cancelled' });
        toast('Order rejected');
      }
    } else if (b.dataset.pay) {
      const status = b.dataset.pay;
      busy(b, async () => { await Store.updateOrder(id, { payment: { ...o.payment, status } }); toast(`Payment ${status}`, status === 'Rejected' ? 'error' : 'success'); });
    } else if (b.hasAttribute('data-view-receipt')) modal(viewImage(o.payment.receipt), { title: 'Payment Receipt' });
    else if (b.hasAttribute('data-push-remind')) busy(b, async () => { await pushReminder(o); toast('Push reminder sent', 'success'); });
    else if (b.hasAttribute('data-print')) printReceipt(o);
    else if (b.hasAttribute('data-download')) busy(b, () => downloadReceipt(o));
  });
  m.el.addEventListener('change', (e) => {
    if (e.target.matches('[data-set-status]')) {
      Store.updateOrder(id, { status: e.target.value }).then(() => toast('Status updated', 'success')).catch((err) => toast(err.message, 'error'));
    }
  });
  return m;
}

export function nextStatusBtn(o) {
  const next = {
    'Order Accepted': ['Preparing', '👨‍🍳 Start Preparing'],
    Preparing: ['Ready for Pickup', '🔔 Mark Ready'],
    'Ready for Pickup': ['Completed', '✅ Mark Completed'],
  }[o.status];
  return next ? `<button class="btn btn-accent" data-status="${next[0]}">${next[1]}</button>` : '';
}

// ---------------------------------------------------------------------------
// Tab renderers
// ---------------------------------------------------------------------------
const countable = (o) => o.status !== 'Cancelled';

function dashboardTab() {
  const today = todayStr();
  const orders = Store.orders;
  const todays = orders.filter((o) => o.pickupDate === today);
  const sales = todays.filter(countable).reduce((s, o) => s + o.total, 0);
  const count = (s) => todays.filter((o) => o.status === s).length;
  const allPending = orders.filter((o) => o.status === 'Pending Confirmation').length;

  const days = [...Array(7)].map((_, i) => addDays(today, i - 6));
  const series = days.map((d) => ({ d, v: orders.filter((o) => o.pickupDate === d && countable(o)).reduce((s, o) => s + o.total, 0), n: orders.filter((o) => o.pickupDate === d && countable(o)).length }));
  const max = Math.max(1, ...series.map((x) => x.v));

  const pop = {};
  orders.filter(countable).forEach((o) => o.items.forEach((it) => {
    pop[it.menuId] ||= { name: it.name, qty: 0, art: it.art, menuId: it.menuId };
    pop[it.menuId].qty += it.qty;
  }));
  const top = Object.values(pop).sort((a, b) => b.qty - a.qty).slice(0, 5);
  const topMax = Math.max(1, ...top.map((x) => x.qty));
  const upcoming = todays.filter((o) => ACTIVE_STATUSES.includes(o.status)).sort((a, b) => a.pickupTime.localeCompare(b.pickupTime)).slice(0, 6);

  const stat = (label, value, cls, ico, link) => `<a class="kpi ${cls}" href="${link}"><span class="kpi-ico">${ico}</span><small>${label}</small><b>${value}</b></a>`;
  return `
    <div class="kpis">
      ${stat('Total Orders Today', todays.length, 'k-green', icon.receipt, '#/admin/orders')}
      ${stat('Total Sales Today', money(sales), 'k-orange', icon.wallet, '#/admin/orders')}
      ${stat('Pending Orders', allPending, 'k-pending', icon.clock, '#/admin/orders?s=Pending Confirmation')}
      ${stat('Preparing', count('Preparing'), 'k-prep', icon.fire, '#/admin/orders?s=Preparing')}
      ${stat('Ready for Pickup', count('Ready for Pickup'), 'k-ready', icon.bag, '#/admin/orders?s=Ready for Pickup')}
      ${stat('Completed Today', count('Completed'), 'k-done', icon.check, '#/admin/orders?s=Completed')}
    </div>
    <div class="dash-grid">
      <div class="card chart-card">
        <div class="card-head"><h3>Sales Overview</h3><small class="muted">Last 7 days • by pickup date</small></div>
        <div class="bars" role="img" aria-label="Sales for the last 7 days">
          ${series.map((x) => `<div class="bar-col ${x.d === today ? 'today' : ''}" title="${fmtDate(x.d)}: ${money(x.v)} (${x.n} orders)">
            <span class="bar-val">${x.v ? 'RM' + Math.round(x.v) : ''}</span>
            <span class="bar" style="height:${Math.max(2, (x.v / max) * 100)}%"></span>
            <span class="bar-lbl">${x.d === today ? 'Today' : parseDate(x.d).toLocaleDateString('en-MY', { weekday: 'short' })}</span>
          </div>`).join('')}
        </div>
        <p class="muted small">7-day total: <b>${money(series.reduce((s, x) => s + x.v, 0))}</b> from ${series.reduce((s, x) => s + x.n, 0)} orders</p>
      </div>
      <div class="card">
        <div class="card-head"><h3>Popular Menu</h3><a class="link" href="#/admin/menu">Manage</a></div>
        ${top.length ? `<ul class="pop-list">${top.map((x, i) => `<li>
          <span class="pop-rank">${i + 1}</span>
          <span class="pop-art">${(() => { const m = Store.menuItem(x.menuId); return m ? itemVisual(m) : foodArt(x.art); })()}</span>
          <span class="pop-main"><strong>${esc(x.name)}</strong><span class="pop-bar"><i style="width:${(x.qty / topMax) * 100}%"></i></span></span>
          <b>${x.qty}</b></li>`).join('')}</ul>` : '<p class="muted">No sales yet.</p>'}
      </div>
      <div class="card">
        <div class="card-head"><h3>Today’s Upcoming Pickups</h3><a class="link" href="#/admin/schedule">Schedule</a></div>
        ${upcoming.length ? upcoming.map((o) => `<button class="mini-order" data-open="${o.id}"><span class="sched-time">${fmtTime(o.pickupTime)}</span><span class="sched-main"><strong>${esc(o.customer.name)}</strong><small>${esc(o.id)} • ${money(o.total)}</small></span>${badge(o.status)}</button>`).join('') : '<p class="muted">No active pickups for today.</p>'}
      </div>
      <div class="card">
        <div class="card-head"><h3>Recent Orders</h3><a class="link" href="#/admin/orders">View all</a></div>
        ${orders.slice(0, 6).map((o) => `<button class="mini-order" data-open="${o.id}"><span class="sched-main"><strong>${esc(o.id)}</strong><small>${esc(o.customer.name)} • ${fmtDateTime(o.createdAt)}</small></span><span class="mo-right"><b>${money(o.total)}</b>${badge(o.status)}</span></button>`).join('')}
      </div>
    </div>`;
}

function ordersTab() {
  const all = Store.orders;
  const q = st.orderQ.trim().toLowerCase();
  const list = all.filter((o) =>
    (st.orderStatus === 'all' || (st.orderStatus === 'active' ? ACTIVE_STATUSES.includes(o.status) : st.orderStatus === 'payment' ? o.payment.status === 'Pending' && o.payment.method !== 'cash' && o.status !== 'Cancelled' : o.status === st.orderStatus)) &&
    (!st.orderDate || o.pickupDate === st.orderDate) &&
    (!q || `${o.id} ${o.customer.name} ${o.customer.phone}`.toLowerCase().includes(q))
  );
  const filters = [['active', 'Active'], ['all', 'All'], ...ORDER_STATUSES.map((s) => [s, s]), ['payment', 'Payment to verify']];
  const cnt = (k) => all.filter((o) => (k === 'all' ? true : k === 'active' ? ACTIVE_STATUSES.includes(o.status) : k === 'payment' ? o.payment.status === 'Pending' && o.payment.method !== 'cash' && o.status !== 'Cancelled' : o.status === k)).length;
  return `
    <div class="filters">
      <div class="search sm">${icon.search}<input type="search" data-oq value="${esc(st.orderQ)}" placeholder="Search order ID, name, phone"></div>
      <input type="date" class="input sm" data-odate value="${st.orderDate}" aria-label="Pickup date">
      ${st.orderDate ? '<button class="btn btn-ghost btn-sm" data-odate-clear>All dates</button>' : ''}
      <button class="btn btn-ghost btn-sm" data-export>${icon.download} Export CSV</button>
    </div>
    <div class="chip-scroll">${filters.map(([k, l]) => `<button class="fchip ${st.orderStatus === k ? 'on' : ''}" data-ostatus="${esc(k)}">${esc(l)} <i>${cnt(k)}</i></button>`).join('')}</div>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Order</th><th>Customer</th><th>Pickup</th><th>Total</th><th>Payment</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${list.length ? list.map((o) => `<tr data-open="${o.id}">
            <td data-l="Order"><strong>${esc(o.id)}</strong><small>${o.items.reduce((s, i) => s + i.qty, 0)} items</small></td>
            <td data-l="Customer">${esc(o.customer.name)}<small>${esc(o.customer.phone)}</small></td>
            <td data-l="Pickup">${fmtDate(o.pickupDate, false)}<small>${fmtTime(o.pickupTime)}</small></td>
            <td data-l="Total"><strong>${money(o.total)}</strong></td>
            <td data-l="Payment">${PAY_LABEL[o.payment.method]}<br>${badge(o.payment.status)}</td>
            <td data-l="Status">${badge(o.status)}</td>
            <td class="row-actions">
              ${o.status === 'Pending Confirmation' ? `<button class="btn btn-primary btn-xs" data-quick="Order Accepted" data-id="${o.id}">Accept</button><button class="btn btn-danger btn-xs" data-quick="Cancelled" data-id="${o.id}">Reject</button>` : ''}
              <button class="btn btn-ghost btn-xs" data-open="${o.id}">View</button>
            </td>
          </tr>`).join('') : '<tr><td colspan="7" class="empty-cell">No orders match these filters.</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

function scheduleTab() {
  const d = st.schedDate;
  const s = Store.settings;
  const dayOrders = Store.orders.filter((o) => o.pickupDate === d && o.status !== 'Cancelled');
  const times = [...new Set([...(s.slots || []), ...dayOrders.map((o) => o.pickupTime)])].sort();
  return `
    <div class="filters">
      <button class="btn btn-ghost btn-sm" data-sday="-1">${icon.back}</button>
      <input type="date" class="input sm" data-sdate value="${d}">
      <button class="btn btn-ghost btn-sm" data-sday="1">${icon.chevronRight}</button>
      <button class="btn btn-ghost btn-sm" data-sday="0">Today</button>
      <span class="muted">${fmtDate(d)} • ${dayOrders.length} orders • ${money(dayOrders.reduce((a, o) => a + o.total, 0))}</span>
    </div>
    <div class="sched-board">
      ${times.map((t) => {
        const os = dayOrders.filter((o) => o.pickupTime === t);
        const pct = Math.min(100, (os.length / s.maxPerSlot) * 100);
        const disabled = (s.disabledSlots || []).includes(t);
        return `<div class="slot-row ${os.length ? '' : 'empty'}">
          <div class="slot-time"><b>${fmtTime(t)}</b><span class="cap"><i style="width:${pct}%" class="${pct >= 100 ? 'full' : ''}"></i></span><small>${os.length}/${s.maxPerSlot}${disabled ? ' • off' : ''}</small></div>
          <div class="slot-orders">${os.map((o) => `<button class="slot-order ${o.status === 'Completed' ? 'done' : ''}" data-open="${o.id}">
              <strong>${esc(o.customer.name)}</strong><small>${esc(o.id)}</small>
              <small>${o.items.map((i) => `${i.qty}× ${esc(i.name)}`).join(', ')}</small>
              ${badge(o.status)}
            </button>`).join('') || '<span class="muted small">—</span>'}</div>
        </div>`;
      }).join('')}
    </div>`;
}

function menuTab() {
  const q = st.menuQ.trim().toLowerCase();
  const list = Store.menu.filter((m) => (!st.menuCat || m.category === st.menuCat) && (!q || m.name.toLowerCase().includes(q)));
  return `
    <div class="filters">
      <div class="search sm">${icon.search}<input type="search" data-mq value="${esc(st.menuQ)}" placeholder="Search menu"></div>
      <select class="input sm" data-mcat><option value="">All categories</option>${categories().map((c) => `<option value="${esc(c.id)}" ${st.menuCat === c.id ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}</select>
      <button class="btn btn-ghost btn-sm" data-edit-cats>🏷️ Kategori (${categories().length})</button>
      <button class="btn btn-primary btn-sm" data-add-menu>${icon.plus} Add New Menu</button>
      ${Store.mode === 'firebase' && !Store.menu.length ? '<button class="btn btn-accent btn-sm" data-seed>Seed sample menu</button>' : ''}
    </div>
    <p class="muted small">${list.length} items • ${Store.menu.filter((m) => !m.available).length} sold out</p>
    <div class="menu-admin-list">
      ${list.map((m) => `<div class="ma-item ${m.available ? '' : 'off'}">
        <div class="ma-art">${itemVisual(m)}</div>
        <div class="ma-main">
          <strong>${esc(m.name)}</strong>
          <small>${esc(catName(m.category))} • ${money(m.price)}${m.variants?.length ? ` • ${m.variants.length} variant group(s)` : ''}</small>
          <div class="ma-tags">${m.featured ? '<span>Featured</span>' : ''}${m.popular ? '<span>Popular</span>' : ''}${m.recommended ? '<span>Recommended</span>' : ''}</div>
        </div>
        <label class="switch" title="Available / Sold Out"><input type="checkbox" data-toggle-avail="${m.id}" ${m.available ? 'checked' : ''}><span></span><em>${m.available ? 'Available' : 'Sold Out'}</em></label>
        <div class="ma-actions">
          <button class="icon-btn" data-edit="${m.id}" aria-label="Edit">${icon.edit}</button>
          <button class="icon-btn danger" data-del="${m.id}" aria-label="Delete">${icon.trash}</button>
        </div>
      </div>`).join('') || '<p class="muted">No menu items.</p>'}
    </div>`;
}

function variantsToText(variants = []) {
  return variants.map((g) => `${g.name}: ${g.options.map((o) => `${o.label}${o.price ? '=' + o.price : ''}`).join(', ')}`).join('\n');
}
function textToVariants(text) {
  return text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const [name, opts = ''] = line.split(':');
    const options = opts.split(',').map((s) => s.trim()).filter(Boolean).map((o) => {
      const [label, price] = o.split('=');
      return { label: label.trim(), price: Number(price) || 0 };
    });
    return { name: name.trim(), options };
  }).filter((g) => g.name && g.options.length);
}

// ---------------------------------------------------------------------------
// Category manager: add / rename / change emoji / reorder / delete categories.
// Saved in settings.categories; a category still used by menu items can't be
// deleted (move those items first) so nothing is orphaned.
// ---------------------------------------------------------------------------
function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'kategori';
}

function openCategoryManager() {
  let list = JSON.parse(JSON.stringify(categories()));
  const usage = (id) => Store.menu.filter((m) => m.category === id).length;
  const md = modal('', { title: 'Urus Kategori', wide: false });
  const draw = (focusLast = false) => {
    md.el.innerHTML = `<div class="cat-manager">
      <p class="muted small">Ubah nama, emoji dan susunan kategori. Susunan di sini ialah susunan yang pelanggan nampak.</p>
      <ul class="cat-list">${list.map((c, i) => {
        const n = usage(c.id);
        return `<li class="cat-row" data-i="${i}">
          <input class="input sm cat-emoji-in" data-k="icon" value="${esc(c.icon)}" maxlength="8" aria-label="Emoji">
          <div class="cat-name-wrap">
            <input class="input sm" data-k="name" value="${esc(c.name)}" maxlength="30" placeholder="Nama kategori" aria-label="Nama kategori">
            <small class="muted">${n} menu</small>
          </div>
          <div class="cat-actions">
            <button type="button" class="icon-btn sm" data-up ${i === 0 ? 'disabled' : ''} aria-label="Naik">▲</button>
            <button type="button" class="icon-btn sm" data-down ${i === list.length - 1 ? 'disabled' : ''} aria-label="Turun">▼</button>
            <button type="button" class="icon-btn sm danger" data-del ${n ? 'disabled title="Pindahkan menu ke kategori lain dahulu"' : ''} aria-label="Padam">${icon.trash}</button>
          </div>
        </li>`;
      }).join('')}</ul>
      <button type="button" class="btn btn-ghost btn-block" data-add>${icon.plus} Tambah kategori</button>
      <div class="btn-row"><button type="button" class="btn btn-ghost" data-close>Batal</button><button type="button" class="btn btn-primary" data-save>Simpan Kategori</button></div>
    </div>`;
    if (focusLast) md.el.querySelector('.cat-row:last-child [data-k="name"]')?.focus();
  };
  draw();
  md.el.addEventListener('input', (e) => {
    const row = e.target.closest('[data-i]');
    if (row && e.target.dataset.k) list[Number(row.dataset.i)][e.target.dataset.k] = e.target.value;
  });
  md.el.addEventListener('click', async (e) => {
    const row = e.target.closest('[data-i]');
    const i = row ? Number(row.dataset.i) : -1;
    if (e.target.closest('[data-up]') && i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; return draw(); }
    if (e.target.closest('[data-down]') && i < list.length - 1) { [list[i + 1], list[i]] = [list[i], list[i + 1]]; return draw(); }
    if (e.target.closest('[data-del]') && i >= 0) {
      if (usage(list[i].id)) return toast('Kategori ini masih digunakan oleh menu.', 'error');
      if (!(await confirmDialog(`Padam kategori “${list[i].name}”?`, { ok: 'Padam', danger: true }))) return;
      list.splice(i, 1);
      return draw();
    }
    if (e.target.closest('[data-add]')) { list.push({ id: '', icon: '🍽️', name: '' }); return draw(true); }
    const save = e.target.closest('[data-save]');
    if (save) {
      const cleaned = list.map((c) => ({ ...c, name: c.name.trim(), icon: (c.icon || '').trim() || '🍽️' }));
      if (!cleaned.length) return toast('Perlu sekurang-kurangnya satu kategori.', 'error');
      if (cleaned.some((c) => !c.name)) return toast('Setiap kategori perlu nama.', 'error');
      const names = cleaned.map((c) => c.name.toLowerCase());
      if (new Set(names).size !== names.length) return toast('Nama kategori tidak boleh berulang.', 'error');
      const ids = new Set(cleaned.filter((c) => c.id).map((c) => c.id));
      cleaned.forEach((c) => {
        if (c.id) return;
        let id = slugify(c.name);
        while (ids.has(id)) id = `${slugify(c.name)}-${Math.random().toString(36).slice(2, 5)}`;
        ids.add(id);
        c.id = id;
      });
      busy(save, async () => {
        await Store.saveSettings({ categories: cleaned.map(({ id, name, icon: ic }) => ({ id, name, icon: ic })) });
        toast('Kategori disimpan', 'success');
        md.close();
      });
    }
  });
}

function openMenuForm(id) {
  const existing = id ? Store.menuItem(id) : null;
  const CAT_ART = { 'rice-noodles': 'nasi-lemak', 'main-course': 'ayam-goreng', snacks: 'karipap', desserts: 'cendol', drinks: 'kopi', kuih: 'kuih-lapis', combo: 'combo-nasi-lemak' };
  const m = existing ? JSON.parse(JSON.stringify(existing)) : { id: uid('m_'), name: '', desc: '', price: '', category: categories()[0]?.id || '', art: CAT_ART[categories()[0]?.id] || 'nasi-lemak', image: '', available: true, featured: false, popular: false, recommended: false, prepMin: 10, kcal: '', serves: 1, rating: 4.5, variants: [], createdAt: Date.now() };
  const md = modal(`<form class="form menu-form" data-mform>
      <div class="mf-preview" data-preview>${itemVisual(m)}</div>
      <div class="mf-img-row">
        <label class="btn btn-ghost btn-sm">${icon.upload} Upload Photo<input type="file" accept="image/*" data-img hidden></label>
        <button type="button" class="btn btn-ghost btn-sm" data-img-clear ${m.image ? '' : 'hidden'}>Use illustration</button>
        <select class="input sm" name="art" title="Illustration">${ART_KEYS.map((k) => `<option ${m.art === k ? 'selected' : ''}>${k}</option>`).join('')}</select>
      </div>
      <label class="label">Menu name *</label><input class="input" name="name" value="${esc(m.name)}" required maxlength="60">
      <label class="label">Short description *</label><textarea class="input" name="desc" rows="2" required maxlength="200">${esc(m.desc)}</textarea>
      <div class="two">
        <div><label class="label">Price (RM) *</label><input class="input" name="price" type="number" step="0.10" min="0" value="${m.price}" required></div>
        <div><label class="label">Category *</label><select class="input" name="category">${categories().map((c) => `<option value="${esc(c.id)}" ${m.category === c.id ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}${m.category && !categories().some((c) => c.id === m.category) ? `<option value="${esc(m.category)}" selected>${esc(m.category)} (dipadam)</option>` : ''}</select></div>
      </div>
      <div class="three">
        <div><label class="label">Prep (min)</label><input class="input" name="prepMin" type="number" min="0" value="${m.prepMin ?? ''}"></div>
        <div><label class="label">Serves</label><input class="input" name="serves" type="number" min="1" value="${m.serves ?? 1}"></div>
        <div><label class="label">kcal</label><input class="input" name="kcal" type="number" min="0" value="${m.kcal ?? ''}"></div>
      </div>
      <label class="label">Variations <small>— one group per line, e.g. <code>Portion: Regular, Large=2</code></small></label>
      <textarea class="input mono" name="variants" rows="3" placeholder="Portion: Regular, Large=2&#10;Spice Level: Original, Extra Pedas">${esc(variantsToText(m.variants))}</textarea>
      <div class="checks">
        <label class="check"><input type="checkbox" name="available" ${m.available ? 'checked' : ''}> Available</label>
        <label class="check"><input type="checkbox" name="featured" ${m.featured ? 'checked' : ''}> Featured</label>
        <label class="check"><input type="checkbox" name="popular" ${m.popular ? 'checked' : ''}> Popular</label>
        <label class="check"><input type="checkbox" name="recommended" ${m.recommended ? 'checked' : ''}> Recommended</label>
      </div>
      <div class="btn-row"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">${existing ? 'Save Changes' : 'Add Menu'}</button></div>
    </form>`, { title: existing ? 'Edit Menu' : 'Add New Menu', wide: true });
  const form = $('[data-mform]', md.el);
  let newImage = null;
  const preview = () => { $('[data-preview]', md.el).innerHTML = itemVisual({ ...m, art: form.art.value, image: newImage ?? m.image }); };
  // Illustration follows the category until the admin picks one explicitly.
  // (Items saved by the old form defaulted to 'nasi-lemak' regardless of category — treat that as untouched.)
  const legacyDefault = existing && existing.art === 'nasi-lemak' && existing.category !== 'rice-noodles' && !existing.image;
  let artTouched = !!existing && !legacyDefault && existing.art !== CAT_ART[existing.category];
  if (legacyDefault && CAT_ART[m.category]) { form.art.value = CAT_ART[m.category]; preview(); }
  form.art.addEventListener('change', () => { artTouched = true; preview(); });
  form.category.addEventListener('change', () => {
    if (!artTouched && CAT_ART[form.category.value]) { form.art.value = CAT_ART[form.category.value]; preview(); }
  });
  $('[data-img]', md.el).addEventListener('change', async (e) => {
    try {
      newImage = await compressImage(e.target.files[0], 700, 0.8);
      $('[data-img-clear]', md.el).hidden = false;
      preview();
    } catch (err) { toast(err.message, 'error'); }
  });
  $('[data-img-clear]', md.el).addEventListener('click', (e) => { newImage = ''; e.target.hidden = true; preview(); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const price = Number(f.get('price'));
    if (!f.get('name').trim()) return toast('Name is required', 'error');
    if (!(price >= 0)) return toast('Enter a valid price', 'error');
    busy(form.querySelector('[type=submit]'), async () => {
      let image = m.image;
      if (newImage === '') image = '';
      else if (newImage) image = await Store.uploadImage(newImage, `menu/${m.id}-${Date.now()}.jpg`);
      const item = {
        ...m,
        name: f.get('name').trim(),
        desc: f.get('desc').trim(),
        price: +price.toFixed(2),
        category: f.get('category'),
        art: f.get('art'),
        image,
        prepMin: Number(f.get('prepMin')) || 0,
        serves: Number(f.get('serves')) || 1,
        kcal: Number(f.get('kcal')) || 0,
        variants: textToVariants(f.get('variants')),
        available: f.has('available'),
        featured: f.has('featured'),
        popular: f.has('popular'),
        recommended: f.has('recommended'),
      };
      await Store.saveMenuItem(item);
      toast(existing ? 'Menu updated' : 'Menu added', 'success');
      md.close();
    });
  });
}

function pickupTab() {
  const p = st.pickup;
  return `
    <div class="settings-grid">
      <div class="card">
        <h3>Business Hours</h3>
        <div class="hours">${[1, 2, 3, 4, 5, 6, 0].map((d) => {
          const h = p.businessHours[d];
          return `<div class="hour-row ${h.closed ? 'closed' : ''}">
            <strong>${DAYS_LONG[d]}</strong>
            <label class="switch sm"><input type="checkbox" data-h-open="${d}" ${h.closed ? '' : 'checked'}><span></span><em>${h.closed ? 'Closed' : 'Open'}</em></label>
            <input type="time" class="input sm" data-h="${d}" data-k="open" value="${h.open}" ${h.closed ? 'disabled' : ''}>
            <span>–</span>
            <input type="time" class="input sm" data-h="${d}" data-k="close" value="${h.close}" ${h.closed ? 'disabled' : ''}>
          </div>`;
        }).join('')}</div>
      </div>

      <div class="card">
        <h3>Pickup Time Slots</h3>
        <p class="muted small">Tap a slot to turn it on/off. Customers can only book slots that are on, inside business hours, and not full.</p>
        <div class="slot-admin">${[...p.slots].sort().map((t) => `<span class="sa-chip ${p.disabledSlots.includes(t) ? 'off' : ''}"><button data-slot-toggle="${t}">${fmtTime(t)}</button><button class="x" data-slot-del="${t}" aria-label="Remove ${t}">×</button></span>`).join('')}</div>
        <div class="inline-form">
          <input type="time" class="input sm" data-new-slot step="900">
          <button class="btn btn-ghost btn-sm" data-add-slot>${icon.plus} Add slot</button>
        </div>
        <details class="gen"><summary>Generate slots automatically</summary>
          <div class="inline-form">
            <input type="time" class="input sm" data-g-start value="09:00"> to <input type="time" class="input sm" data-g-end value="17:00">
            every <select class="input sm" data-g-int><option>15</option><option selected>30</option><option>45</option><option>60</option></select> min
            <button class="btn btn-dark btn-sm" data-gen>Generate</button>
          </div>
        </details>
      </div>

      <div class="card">
        <h3>Capacity & Timing</h3>
        <div class="three">
          <div><label class="label">Max orders per slot</label><input type="number" min="1" max="200" class="input" data-num="maxPerSlot" value="${p.maxPerSlot}"></div>
          <div><label class="label">Preparation time (min)</label><input type="number" min="0" max="600" class="input" data-num="prepTime" value="${p.prepTime}"></div>
          <div><label class="label">Book up to (days ahead)</label><input type="number" min="0" max="60" class="input" data-num="maxAdvanceDays" value="${p.maxAdvanceDays}"></div>
        </div>
        <p class="muted small">Same-day slots earlier than now + preparation time are hidden from customers.</p>
      </div>

      <div class="card">
        <h3>Blocked Dates</h3>
        <p class="muted small">Public holidays, shop closures, or fully booked catering days.</p>
        <div class="inline-form"><input type="date" class="input sm" data-block-date min="${todayStr()}"><button class="btn btn-ghost btn-sm" data-block-add>${icon.plus} Block date</button></div>
        <div class="tag-list">${p.blockedDates.length ? [...p.blockedDates].sort().map((d) => `<span class="tag">${fmtDate(d)} <button data-block-del="${d}" aria-label="Unblock">×</button></span>`).join('') : '<span class="muted small">No blocked dates.</span>'}</div>
      </div>

      <div class="card wide">
        <h3>Pickup Locations</h3>
        ${p.locations.map((l, i) => `<div class="loc-row">
          <input class="input sm" data-loc="${i}" data-k="name" value="${esc(l.name)}" placeholder="Location name">
          <input class="input sm" data-loc="${i}" data-k="address" value="${esc(l.address)}" placeholder="Address">
          <button class="icon-btn danger" data-loc-del="${i}" aria-label="Remove">${icon.trash}</button>
        </div>`).join('')}
        <button class="btn btn-ghost btn-sm" data-loc-add>${icon.plus} Add location</button>
      </div>
    </div>
    <div class="save-bar"><button class="btn btn-ghost" data-pickup-reset>Discard changes</button><button class="btn btn-primary" data-pickup-save>Save Pickup Settings</button></div>`;
}

function customersTab() {
  const map = {};
  Store.orders.forEach((o) => {
    if (!o.customer?.phone) return; // walk-in POS sale without contact
    const k = o.customer.phone;
    map[k] ||= { name: o.customer.name, phone: o.customer.phone, email: o.customer.email, orders: [], spent: 0, last: 0 };
    const c = map[k];
    c.orders.push(o);
    if (o.status !== 'Cancelled') c.spent += o.total;
    if (o.createdAt > c.last) { c.last = o.createdAt; c.name = o.customer.name; c.email = o.customer.email || c.email; }
  });
  const q = st.custQ.trim().toLowerCase();
  const list = Object.values(map).filter((c) => !q || `${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(q)).sort((a, b) => b.last - a.last);
  return `
    <div class="filters"><div class="search sm">${icon.search}<input type="search" data-cq value="${esc(st.custQ)}" placeholder="Search name or phone"></div><span class="muted">${list.length} customers</span></div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Customer</th><th>Contact</th><th>Total Orders</th><th>Total Spent</th><th>Last Order</th><th></th></tr></thead>
      <tbody>${list.map((c) => `<tr data-cust="${esc(c.phone)}">
        <td data-l="Customer"><strong>${esc(c.name)}</strong></td>
        <td data-l="Contact">${esc(c.phone)}<small>${esc(c.email || '')}</small></td>
        <td data-l="Total Orders"><strong>${c.orders.length}</strong></td>
        <td data-l="Total Spent">${money(c.spent)}</td>
        <td data-l="Last Order">${fmtDateTime(c.last)}</td>
        <td class="row-actions"><a class="btn btn-wa btn-xs" href="${waLink(c.phone, `Hai ${c.name}, `)}" target="_blank" rel="noopener">${icon.whatsapp}</a><button class="btn btn-ghost btn-xs" data-cust="${esc(c.phone)}">History</button></td>
      </tr>`).join('') || '<tr><td colspan="6" class="empty-cell">No customers yet.</td></tr>'}</tbody>
    </table></div>`;
}

function openCustomer(phone) {
  const orders = Store.orders.filter((o) => o.customer.phone === phone);
  if (!orders.length) return;
  const c = orders[0].customer;
  const m = modal(`<div class="cust-detail">
    <div class="profile-card"><div class="avatar xl">${esc(c.name.slice(0, 1))}</div><div><h2>${esc(c.name)}</h2><small>${esc(c.phone)} ${c.email ? '• ' + esc(c.email) : ''}</small></div></div>
    <div class="stats-row"><div class="stat"><b>${orders.length}</b><small>Orders</small></div><div class="stat"><b>${money(orders.filter(countable).reduce((s, o) => s + o.total, 0))}</b><small>Spent</small></div><div class="stat"><b>${orders.filter((o) => o.status === 'Completed').length}</b><small>Completed</small></div></div>
    <div class="btn-row"><a class="btn btn-wa" href="${waLink(c.phone, `Hai ${c.name}, `)}" target="_blank" rel="noopener">${icon.whatsapp} WhatsApp</a><a class="btn btn-ghost" href="tel:${esc(c.phone)}">Call</a></div>
    <h3>Order History</h3>
    ${orders.map((o) => `<button class="mini-order" data-open="${o.id}"><span class="sched-main"><strong>${esc(o.id)}</strong><small>${fmtDate(o.pickupDate, false)} ${fmtTime(o.pickupTime)} • ${o.items.map((i) => `${i.qty}× ${esc(i.name)}`).join(', ')}</small></span><span class="mo-right"><b>${money(o.total)}</b>${badge(o.status)}</span></button>`).join('')}
  </div>`, { title: 'Customer', wide: true });
  m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (b) openOrderModal(b.dataset.open); });
}

function settingsTab() {
  const s = st.shop;
  return `
    <div class="settings-grid">
      <div class="card">
        <h3>Shop Profile</h3>
        <label class="label">Shop name</label><input class="input" data-s="shopName" value="${esc(s.shopName)}">
        <label class="label">Tagline</label><input class="input" data-s="tagline" value="${esc(s.tagline)}">
        <label class="label">WhatsApp number (orders are sent here)</label><input class="input" data-s="whatsapp" value="${esc(s.whatsapp)}" inputmode="tel" placeholder="60123456789">
        <label class="label">Display phone</label><input class="input" data-s="phone" value="${esc(s.phone)}">
        <label class="check"><input type="checkbox" data-sb="autoWhatsApp" ${s.autoWhatsApp ? 'checked' : ''}> Open WhatsApp with order details automatically after checkout</label>
      </div>
      <div class="card">
        <h3>Payment Methods</h3>
        <label class="check"><input type="checkbox" data-pm="cash" ${s.payments.cash ? 'checked' : ''}> 💵 Cash on Pickup</label>
        <label class="check"><input type="checkbox" data-pm="duitnow" ${s.payments.duitnow ? 'checked' : ''}> 📱 DuitNow QR</label>
        <label class="check"><input type="checkbox" data-pm="online" ${s.payments.online ? 'checked' : ''}> 💳 Online Payment (FPX/Card)</label>
        <p class="muted small">Online payment runs as a simulation in demo mode. Connect a gateway (e.g. ToyyibPay, Billplz, Stripe) via a Cloud Function for production.</p>
      </div>
      <div class="card">
        <h3>DuitNow QR</h3>
        <div class="dn-admin">
          <div class="dn-qr">${s.duitnowQR ? `<img src="${esc(s.duitnowQR)}" alt="DuitNow QR">` : '<div class="dn-empty">No QR uploaded<br><small>Customers see a demo QR</small></div>'}</div>
          <div>
            <label class="btn btn-ghost btn-sm">${icon.upload} Upload QR<input type="file" accept="image/*" data-dn-upload hidden></label>
            ${s.duitnowQR ? '<button class="btn btn-ghost btn-sm" data-dn-clear>Remove</button>' : ''}
          </div>
        </div>
        <label class="label">Account name</label><input class="input" data-s="duitnowName" value="${esc(s.duitnowName)}">
        <label class="label">DuitNow ID / phone</label><input class="input" data-s="duitnowId" value="${esc(s.duitnowId)}">
        <label class="label">Payment instructions</label><textarea class="input" rows="3" data-s="paymentInstructions">${esc(s.paymentInstructions)}</textarea>
      </div>
      <div class="card">
        <h3>Promo Codes</h3>
        ${s.promos.map((p, i) => `<div class="promo-admin">
          <input class="input sm" data-promo="${i}" data-k="code" value="${esc(p.code)}" placeholder="CODE">
          <select class="input sm" data-promo="${i}" data-k="type"><option value="percent" ${p.type === 'percent' ? 'selected' : ''}>%</option><option value="fixed" ${p.type === 'fixed' ? 'selected' : ''}>RM</option></select>
          <input class="input sm" type="number" min="0" data-promo="${i}" data-k="value" value="${p.value}" title="Value">
          <input class="input sm" type="number" min="0" data-promo="${i}" data-k="minSpend" value="${p.minSpend}" title="Min spend">
          <label class="switch sm"><input type="checkbox" data-promo="${i}" data-k="active" ${p.active ? 'checked' : ''}><span></span></label>
          <button class="icon-btn danger" data-promo-del="${i}" aria-label="Delete">${icon.trash}</button>
        </div>`).join('')}
        <small class="muted">Code • type • value • min spend • active</small><br>
        <button class="btn btn-ghost btn-sm" data-promo-add>${icon.plus} Add promo</button>
      </div>
      <div class="card">
        <h3>Data</h3>
        <p class="muted small">Mode: <b>${Store.mode === 'demo' ? 'Demo (LocalStorage)' : 'Firebase'}</b></p>
        ${Store.mode === 'demo' ? '<button class="btn btn-danger btn-sm" data-reset>Reset demo data</button>' : '<button class="btn btn-ghost btn-sm" data-seed>Seed sample menu & settings</button>'}
      </div>
    </div>
    <div class="save-bar"><button class="btn btn-ghost" data-shop-reset>Discard changes</button><button class="btn btn-primary" data-shop-save>Save Settings</button></div>`;
}

const clonePickup = () => {
  const s = Store.settings;
  return JSON.parse(JSON.stringify({ businessHours: s.businessHours, slots: s.slots, disabledSlots: s.disabledSlots || [], maxPerSlot: s.maxPerSlot, prepTime: s.prepTime, maxAdvanceDays: s.maxAdvanceDays, blockedDates: s.blockedDates || [], locations: s.locations }));
};
const cloneShop = () => {
  const s = Store.settings;
  return JSON.parse(JSON.stringify({ shopName: s.shopName, tagline: s.tagline, whatsapp: s.whatsapp, phone: s.phone, autoWhatsApp: s.autoWhatsApp, payments: s.payments, duitnowQR: s.duitnowQR, duitnowName: s.duitnowName, duitnowId: s.duitnowId, paymentInstructions: s.paymentInstructions, promos: s.promos || [] }));
};

function exportCSV() {
  const rows = [['Order ID', 'Created', 'Customer', 'Phone', 'Email', 'Pickup Date', 'Pickup Time', 'Location', 'Items', 'Subtotal', 'Discount', 'Total', 'Payment Method', 'Payment Status', 'Status']];
  Store.orders.forEach((o) => rows.push([o.id, new Date(o.createdAt).toISOString(), o.customer.name, o.customer.phone, o.customer.email, o.pickupDate, o.pickupTime, locationName(o.location), o.items.map((i) => `${i.qty}x ${i.name}`).join('; '), o.subtotal, o.discount, o.total, PAY_LABEL[o.payment.method], o.payment.status, o.status]));
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
  a.download = `orders-${todayStr()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------
export const admin = {
  chrome: 'admin',
  live: (topic) => {
    const tab = currentTab;
    if (tab === 'pickup' || tab === 'settings') return topic === 'reset';
    return true;
  },
  enter(ctx) {
    adminDrawer.open = false; // always start closed after navigating
    document.body.classList.remove('no-scroll');
    currentTab = ctx.params[0] || 'dashboard';
    if (ctx.query.s) st.orderStatus = ctx.query.s;
    st.pickup = clonePickup();
    st.shop = cloneShop();
  },
  render(ctx) {
    if (!Store.isAdmin()) return deniedHTML('#/admin', 'admin');
    const tab = TABS.find((t) => t[0] === currentTab) || TABS[0];
    const body = { dashboard: dashboardTab, orders: ordersTab, schedule: scheduleTab, menu: menuTab, pickup: pickupTab, customers: customersTab, settings: settingsTab }[tab[0]]();
    const pending = Store.orders.filter((o) => o.status === 'Pending Confirmation').length;
    void ctx;
    const modeBadge = Store.mode === 'firebase' ? '<b class="mode-on">● Firebase (live)</b>' : '<b class="mode-demo">● Demo mode</b>';
    const today = todayStr();
    const todays = Store.orders.filter((o) => o.pickupDate === today);
    const salesToday = todays.filter((o) => o.status !== 'Cancelled').reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const soldOut = Store.menu.filter((m) => !m.available).length;
    const navBadge = (k) => (k === 'orders' && pending ? `<i class="nbadge">${pending}</i>` : k === 'menu' && soldOut ? `<i class="nav-count" title="Sold out">${soldOut} habis</i>` : '');
    const groups = [...new Set(TABS.map((t) => t[3]))];
    return `<div class="admin ${adminDrawer.open ? 'drawer-open' : ''}">
      <div class="admin-scrim" data-drawer-close aria-hidden="true"></div>
      <aside class="admin-side" id="admin-drawer" aria-label="Admin navigation">
        <div class="admin-brand">
          <span class="logo-mark">${logoSVG()}</span><div><strong>PICK UP N GO</strong><small>Admin Panel</small></div>
          <button class="drawer-close" data-drawer-close aria-label="Tutup menu">${icon.x}</button>
        </div>
        <div class="drawer-user">
          <span class="avatar">${esc((Store.user.name || Store.user.email || 'A').slice(0, 1).toUpperCase())}</span>
          <div><strong>${esc(Store.user.name || 'Admin')}</strong><small>${esc(Store.user.email || '')}</small><small>${modeBadge}</small></div>
        </div>
        <a class="side-stats" href="#/admin/dashboard" aria-label="Ringkasan hari ini">
          <span><b>${todays.length}</b><small>Pesanan hari ini</small></span>
          <span><b>RM${salesToday.toFixed(0)}</b><small>Jualan</small></span>
          <span class="${pending ? 'warn' : ''}"><b>${pending}</b><small>Menunggu</small></span>
        </a>
        ${groups.map((g) => `<p class="side-label">${g}</p>
        <nav class="admin-nav" aria-label="${g}">${TABS.filter((t) => t[3] === g).map(([k, l, ic]) => `<a href="#/admin/${k}" class="${k === tab[0] ? 'on' : ''}" ${k === tab[0] ? 'aria-current="page"' : ''}>${ic}<span>${l}</span>${navBadge(k)}</a>`).join('')}</nav>`).join('')}
        <a class="side-cta" href="#/staff">${icon.scan}<span><strong>Kaunter Staff</strong><small>Scan QR &amp; serah pesanan</small></span>${icon.chevronRight}</a>
        <div class="admin-foot">
          <a href="#/home">${icon.store}<span>Customer App</span></a>
          <button data-logout class="side-logout">${icon.logout}<span>Log out</span></button>
          <p class="side-version">v1.7 • ${Store.mode === 'firebase' ? '<b class="mode-on">Firebase</b>' : '<b class="mode-demo">Demo mode</b>'}</p>
        </div>
      </aside>
      <main class="admin-main">
        <header class="admin-head">
          ${drawerButton(adminDrawer, pending)}
          <div class="admin-title"><h1>${tab[1]}</h1><small>${fmtDate(todayStr())} <span class="hide-sm">• ${esc(Store.user.name || Store.user.email)}</span> • ${modeBadge}</small></div>
          <div class="admin-head-actions">
            ${permission() === 'default' ? '<button class="btn btn-ghost btn-sm" data-bell>🔔 Enable order alerts</button>' : permission() === 'granted' ? '<span class="bell-on" title="New-order alerts are on">🔔</span>' : ''}
            ${pending ? `<a class="btn btn-accent btn-sm" href="#/admin/orders?s=Pending Confirmation">${pending} pending</a>` : ''}
          </div>
        </header>
        <div class="admin-body">
          ${Store.initError ? `<div class="alert alert-warn"><b>Firebase belum aktif — mod demo.</b> ${esc(Store.initError.message)} Muat semula halaman selepas diaktifkan.</div>` : ''}
          ${body}
        </div>
      </main>
    </div>`;
  },
  mount(root, ctx) {
    if (!Store.isAdmin()) return;
    const rerender = (opts) => ctx.refresh(opts);
    bindDrawer(root, adminDrawer);

    root.addEventListener('click', async (e) => {
      const t = e.target;
      const open = t.closest('[data-open]');
      if (t.closest('[data-logout]')) { await Store.logout(); toast('Logged out'); return ctx.go('#/home'); }
      const bell = t.closest('[data-bell]');
      if (bell) return busy(bell, async () => { await enableNotifications(); toast('New-order alerts on 🔔', 'success'); ctx.refresh(); });
      const quick = t.closest('[data-quick]');
      if (quick) {
        e.stopPropagation();
        if (quick.dataset.quick === 'Cancelled' && !(await confirmDialog('Reject and cancel this order?', { ok: 'Reject', danger: true }))) return;
        return busy(quick, async () => { await Store.updateOrder(quick.dataset.id, { status: quick.dataset.quick }); toast(quick.dataset.quick === 'Cancelled' ? 'Order rejected' : 'Order accepted', 'success'); });
      }
      if (open && !t.closest('a')) return openOrderModal(open.dataset.open);
      const fs = t.closest('[data-ostatus]');
      if (fs) { st.orderStatus = fs.dataset.ostatus; return rerender(); }
      if (t.closest('[data-odate-clear]')) { st.orderDate = ''; return rerender(); }
      if (t.closest('[data-export]')) return exportCSV();
      const sd = t.closest('[data-sday]');
      if (sd) { st.schedDate = sd.dataset.sday === '0' ? todayStr() : addDays(st.schedDate, Number(sd.dataset.sday)); return rerender(); }
      const cust = t.closest('[data-cust]');
      if (cust && !t.closest('a')) return openCustomer(cust.dataset.cust);

      // Menu
      if (t.closest('[data-add-menu]')) return openMenuForm();
      if (t.closest('[data-edit-cats]')) return openCategoryManager();
      const ed = t.closest('[data-edit]');
      if (ed) return openMenuForm(ed.dataset.edit);
      const del = t.closest('[data-del]');
      if (del) {
        const m = Store.menuItem(del.dataset.del);
        if (await confirmDialog(`Delete “${m.name}” from the menu?`, { ok: 'Delete', danger: true })) {
          busy(del, async () => { await Store.deleteMenuItem(m.id); toast('Menu deleted'); });
        }
        return;
      }
      const seed = t.closest('[data-seed]');
      if (seed) return busy(seed, async () => { await Store.seedMenu(); toast('Sample data added', 'success'); });
      if (t.closest('[data-reset]')) {
        if (await confirmDialog('Reset ALL demo menu, orders and settings?', { ok: 'Reset', danger: true })) {
          await Store.resetDemo();
          toast('Demo data reset', 'success');
          ctx.go('#/home');
        }
        return;
      }

      // Pickup settings
      const p = st.pickup;
      const tog = t.closest('[data-slot-toggle]');
      if (tog) { const v = tog.dataset.slotToggle; p.disabledSlots = p.disabledSlots.includes(v) ? p.disabledSlots.filter((x) => x !== v) : [...p.disabledSlots, v]; return rerender(); }
      const sdel = t.closest('[data-slot-del]');
      if (sdel) { p.slots = p.slots.filter((x) => x !== sdel.dataset.slotDel); return rerender(); }
      if (t.closest('[data-add-slot]')) {
        const v = $('[data-new-slot]', root).value;
        if (!v) return toast('Pick a time first', 'error');
        if (!p.slots.includes(v)) p.slots.push(v);
        return rerender();
      }
      if (t.closest('[data-gen]')) {
        const s = generateSlots($('[data-g-start]', root).value, $('[data-g-end]', root).value, $('[data-g-int]', root).value);
        if (!s.length) return toast('Invalid range', 'error');
        p.slots = s; p.disabledSlots = [];
        toast(`${s.length} slots generated — remember to save`);
        return rerender();
      }
      if (t.closest('[data-block-add]')) {
        const v = $('[data-block-date]', root).value;
        if (!v) return toast('Choose a date', 'error');
        if (!p.blockedDates.includes(v)) p.blockedDates.push(v);
        return rerender();
      }
      const bd = t.closest('[data-block-del]');
      if (bd) { p.blockedDates = p.blockedDates.filter((x) => x !== bd.dataset.blockDel); return rerender(); }
      if (t.closest('[data-loc-add]')) { p.locations.push({ id: uid('loc_'), name: '', address: '' }); return rerender(); }
      const ld = t.closest('[data-loc-del]');
      if (ld) {
        if (p.locations.length <= 1) return toast('Keep at least one pickup location', 'error');
        p.locations.splice(Number(ld.dataset.locDel), 1);
        return rerender();
      }
      if (t.closest('[data-pickup-reset]')) { st.pickup = clonePickup(); return rerender(); }
      const ps = t.closest('[data-pickup-save]');
      if (ps) {
        if (!p.slots.length) return toast('Add at least one pickup slot', 'error');
        if (p.locations.some((l) => !l.name.trim())) return toast('Every location needs a name', 'error');
        for (const h of Object.values(p.businessHours)) if (!h.closed && h.open >= h.close) return toast('Opening time must be before closing time', 'error');
        return busy(ps, async () => { await Store.saveSettings(JSON.parse(JSON.stringify(p))); toast('Pickup settings saved', 'success'); });
      }

      // Shop settings
      const s = st.shop;
      if (t.closest('[data-dn-clear]')) { s.duitnowQR = ''; return rerender(); }
      if (t.closest('[data-promo-add]')) { s.promos.push({ code: '', type: 'percent', value: 10, minSpend: 0, active: true }); return rerender(); }
      const pd = t.closest('[data-promo-del]');
      if (pd) { s.promos.splice(Number(pd.dataset.promoDel), 1); return rerender(); }
      if (t.closest('[data-shop-reset]')) { st.shop = cloneShop(); return rerender(); }
      const ss = t.closest('[data-shop-save]');
      if (ss) {
        if (!isValidPhone(s.whatsapp.replace(/^6/, ''))) return toast('Enter a valid WhatsApp number, e.g. 60123456789', 'error');
        if (!Object.values(s.payments).some(Boolean)) return toast('Enable at least one payment method', 'error');
        s.promos = s.promos.filter((x) => x.code.trim()).map((x) => ({ ...x, code: x.code.trim().toUpperCase(), value: Number(x.value) || 0, minSpend: Number(x.minSpend) || 0 }));
        return busy(ss, async () => { await Store.saveSettings(JSON.parse(JSON.stringify(s))); toast('Settings saved', 'success'); });
      }
    });

    root.addEventListener('input', (e) => {
      const t = e.target;
      if (t.matches('[data-oq]')) { st.orderQ = t.value; rerender({ keepFocus: '[data-oq]' }); }
      if (t.matches('[data-mq]')) { st.menuQ = t.value; rerender({ keepFocus: '[data-mq]' }); }
      if (t.matches('[data-cq]')) { st.custQ = t.value; rerender({ keepFocus: '[data-cq]' }); }
      if (t.matches('[data-loc]')) st.pickup.locations[Number(t.dataset.loc)][t.dataset.k] = t.value;
      if (t.matches('[data-num]')) st.pickup[t.dataset.num] = Math.max(0, Number(t.value) || 0);
      if (t.matches('[data-s]')) st.shop[t.dataset.s] = t.value;
      if (t.matches('[data-promo]') && t.type !== 'checkbox') st.shop.promos[Number(t.dataset.promo)][t.dataset.k] = t.value;
    });

    root.addEventListener('change', async (e) => {
      const t = e.target;
      if (t.matches('[data-odate]')) { st.orderDate = t.value; rerender(); }
      if (t.matches('[data-sdate]')) { st.schedDate = t.value || todayStr(); rerender(); }
      if (t.matches('[data-mcat]')) { st.menuCat = t.value; rerender(); }
      if (t.matches('[data-toggle-avail]')) {
        const m = Store.menuItem(t.dataset.toggleAvail);
        try { await Store.saveMenuItem({ ...m, available: t.checked }); toast(`${m.name}: ${t.checked ? 'Available' : 'Sold Out'}`); } catch (err) { toast(err.message, 'error'); }
      }
      if (t.matches('[data-h-open]')) { st.pickup.businessHours[t.dataset.hOpen].closed = !t.checked; rerender(); }
      if (t.matches('[data-h]')) st.pickup.businessHours[t.dataset.h][t.dataset.k] = t.value;
      if (t.matches('[data-sb]')) st.shop[t.dataset.sb] = t.checked;
      if (t.matches('[data-pm]')) st.shop.payments[t.dataset.pm] = t.checked;
      if (t.matches('[data-promo]') && t.type === 'checkbox') st.shop.promos[Number(t.dataset.promo)].active = t.checked;
      if (t.matches('[data-dn-upload]')) {
        try {
          const dataUrl = await compressImage(t.files[0], 800, 0.9);
          st.shop.duitnowQR = await Store.uploadImage(dataUrl, `settings/duitnow-${Date.now()}.jpg`);
          toast('QR uploaded — remember to save', 'success');
          rerender();
        } catch (err) { toast(err.message, 'error'); }
      }
    });
  },
};

let currentTab = 'dashboard';
const adminDrawer = { open: false };
