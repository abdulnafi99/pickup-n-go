// ---------------------------------------------------------------------------
// Staff pickup counter: today's pickups by time, search, QR scan, verify,
// mark completed.
// ---------------------------------------------------------------------------
import { Store, ACTIVE_STATUSES } from '../store.js';
import { $, esc, money, todayStr, fmtDate, fmtTime } from '../utils.js';
import { icon, toast, modal, busy, badge, confirmDialog } from '../ui.js';
import { variantText } from '../cart.js';
import { waLink, reminderMessage, PAY_LABEL } from '../whatsapp.js';
import { startScanner, parseOrderQR } from '../qr.js';
import { openOrderModal, nextStatusBtn, deniedHTML } from './admin.js';
import { logoSVG } from './customer.js';
import { bindDrawer, drawerButton } from './drawer.js';
import { permission, enableNotifications, pushReminder } from '../push.js';
import { posHTML, bindPOS, posTicketCount } from './pos.js';

const st = { q: '', filter: 'todo', mode: 'orders' }; // mode: 'orders' | 'pos'
const staffDrawer = { open: false };

const FILTERS = [
  ['todo', 'To Do', icon.receipt],
  ['ready', 'Ready for Pickup', icon.bag],
  ['done', 'Done', icon.check],
  ['all', 'All Today', icon.grid],
];

function staffCard(o) {
  const unpaid = o.payment.status !== 'Verified';
  return `<article class="staff-card st-${o.status.split(' ')[0].toLowerCase()}" data-id="${o.id}">
    <header>
      <div><strong class="oid">${esc(o.id)}</strong><small>${esc(o.customer.name)} • ${esc(o.customer.phone)}</small></div>
      ${badge(o.status)}
    </header>
    <ul class="staff-items">${o.items.map((it) => `<li><b>${it.qty}×</b> ${esc(it.name)}${variantText(it.variant) ? ` <small>(${esc(variantText(it.variant))})</small>` : ''}${it.note ? `<em>📝 ${esc(it.note)}</em>` : ''}</li>`).join('')}</ul>
    ${o.specialRequest ? `<p class="special">🗒️ ${esc(o.specialRequest)}</p>` : ''}
    <div class="staff-pay"><span>${PAY_LABEL[o.payment.method]}</span>${badge(o.payment.status)}<strong>${money(o.total)}</strong></div>
    ${unpaid && o.payment.method === 'cash' ? `<p class="collect">💵 Collect ${money(o.total)} cash</p>` : ''}
    <footer>
      ${o.status === 'Pending Confirmation' ? `<button class="btn btn-primary btn-sm" data-status="Order Accepted">${icon.check} Accept</button>` : ''}
      ${o.status === 'Ready for Pickup' ? `<button class="btn btn-accent btn-sm" data-complete>✅ Complete</button>` : nextStatusBtn(o).replace('btn btn-accent', 'btn btn-accent btn-sm')}
      <a class="btn btn-wa btn-sm" href="${waLink(o.customer.phone, reminderMessage(o))}" target="_blank" rel="noopener" title="Send pickup reminder">${icon.whatsapp}</a>
      ${o.pushSub && ACTIVE_STATUSES.includes(o.status) ? '<button class="btn btn-ghost btn-sm" data-push title="Push pickup reminder" aria-label="Push pickup reminder">🔔</button>' : ''}
      <button class="btn btn-ghost btn-sm" data-details>Details</button>
    </footer>
  </article>`;
}

async function completeOrder(id) {
  const o = Store.order(id);
  if (!o) return;
  const unpaid = o.payment.status !== 'Verified';
  if (unpaid) {
    const msg = o.payment.method === 'cash'
      ? `Confirm you have collected ${money(o.total)} cash from ${o.customer.name}.`
      : `Payment is still “${o.payment.status}”. Mark as verified and complete?`;
    if (!(await confirmDialog(msg, { title: 'Complete pickup', ok: 'Paid & Complete' }))) return;
  }
  await Store.updateOrder(id, { status: 'Completed', payment: { ...o.payment, status: 'Verified' } });
  toast(`${o.id} completed`, 'success');
}

/** Big verification sheet shown after scanning / searching an order. */
function openVerify(id) {
  const o = Store.order(id);
  if (!o) {
    toast(`Order ${id} not found`, 'error', 4000);
    return;
  }
  const today = o.pickupDate === todayStr();
  const m = modal(`<div class="verify ${o.status === 'Cancelled' ? 'bad' : 'good'}">
      <div class="verify-icon">${o.status === 'Cancelled' ? icon.x : icon.check}</div>
      <h2>${o.status === 'Cancelled' ? 'Order Cancelled' : o.status === 'Completed' ? 'Already Collected' : 'Order Verified'}</h2>
      <p class="oid">${esc(o.id)}</p>
      <div class="kv">
        <div><span>Customer</span><strong>${esc(o.customer.name)}</strong></div>
        <div><span>Phone</span><strong>${esc(o.customer.phone)}</strong></div>
        <div><span>Pickup</span><strong>${fmtDate(o.pickupDate, false)} • ${fmtTime(o.pickupTime)} ${today ? '' : '<em class="warn">(not today)</em>'}</strong></div>
        <div><span>Payment</span><strong>${PAY_LABEL[o.payment.method]} ${badge(o.payment.status)}</strong></div>
        <div><span>Status</span>${badge(o.status)}</div>
      </div>
      <ul class="staff-items">${o.items.map((it) => `<li><b>${it.qty}×</b> ${esc(it.name)}${variantText(it.variant) ? ` <small>(${esc(variantText(it.variant))})</small>` : ''}</li>`).join('')}</ul>
      <div class="verify-total">Total <b>${money(o.total)}</b></div>
      <div class="btn-row">
        <button class="btn btn-ghost" data-full>Full details</button>
        ${!['Completed', 'Cancelled'].includes(o.status) ? `<button class="btn btn-primary btn-lg" data-done>✅ Mark as Completed</button>` : ''}
      </div>
    </div>`, { title: 'Verify Order' });
  m.el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-full]')) { m.close(); openOrderModal(id, { staffMode: true }); }
    const done = e.target.closest('[data-done]');
    if (done) busy(done, async () => { await completeOrder(id); m.close(); });
  });
}

function openScanner() {
  let stop = () => {};
  const m = modal(`<div class="scanner">
      <div class="scan-view"><video data-video muted playsinline></video><div class="scan-frame"></div></div>
      <p class="muted center" data-scan-msg>Point the camera at the customer’s order QR.</p>
      <form class="inline-form" data-manual>
        <input class="input" name="id" placeholder="Or type Order ID e.g. PNG-261106-AB12" autocapitalize="characters">
        <button class="btn btn-dark">Find</button>
      </form>
    </div>`, { title: 'Scan Order QR', onClose: () => stop() });
  startScanner($('[data-video]', m.el), (text) => {
    const id = parseOrderQR(text);
    if (navigator.vibrate) navigator.vibrate(80);
    stop();
    m.close();
    openVerify(id);
  }, (err) => {
    $('[data-scan-msg]', m.el).textContent = err.message;
    $('.scan-view', m.el).classList.add('no-cam');
  }).then((fn) => {
    if (m.root.isConnected) stop = fn;
    else fn();
  });
  $('[data-manual]', m.el).addEventListener('submit', (e) => {
    e.preventDefault();
    const id = parseOrderQR(e.target.id.value.trim().toUpperCase());
    if (!id) return;
    stop();
    m.close();
    openVerify(id);
  });
}

export const staff = {
  chrome: 'staff',
  live: true,
  render() {
    if (!Store.isStaff()) return deniedHTML('#/staff', 'staff');
    const today = todayStr();
    const q = st.q.trim().toLowerCase();
    const todays = Store.orders.filter((o) => o.pickupDate === today);
    let list;
    if (q) {
      list = Store.orders.filter((o) => `${o.id} ${o.customer.name} ${o.customer.phone}`.toLowerCase().includes(q));
    } else {
      list = todays.filter((o) => (st.filter === 'todo' ? ACTIVE_STATUSES.includes(o.status) : st.filter === 'ready' ? o.status === 'Ready for Pickup' : st.filter === 'done' ? ['Completed', 'Cancelled'].includes(o.status) : true));
    }
    list.sort((a, b) => (a.pickupDate + a.pickupTime).localeCompare(b.pickupDate + b.pickupTime));
    const groups = {};
    list.forEach((o) => (groups[q ? `${o.pickupDate}|${o.pickupTime}` : o.pickupTime] ||= []).push(o));
    const cnt = (fn) => todays.filter(fn).length;
    const nowT = new Date().toTimeString().slice(0, 5);
    const filterCount = {
      todo: cnt((o) => ACTIVE_STATUSES.includes(o.status)),
      ready: cnt((o) => o.status === 'Ready for Pickup'),
      done: cnt((o) => ['Completed', 'Cancelled'].includes(o.status)),
      all: todays.length,
    };
    const u = Store.user;
    const modeBadge = Store.mode === 'firebase' ? '<b class="mode-on">● Firebase (live)</b>' : '<b class="mode-demo">● Demo mode</b>';
    const activeFilter = q || st.mode === 'pos' ? '' : st.filter;
    const isPOS = st.mode === 'pos';

    return `<div class="admin staff-shell ${staffDrawer.open ? 'drawer-open' : ''}">
      <div class="admin-scrim" data-drawer-close aria-hidden="true"></div>
      <aside class="admin-side" id="admin-drawer" aria-label="Staff navigation">
        <div class="admin-brand">
          <span class="logo-mark">${logoSVG()}</span><div><strong>PICK UP N GO</strong><small>Pickup Counter</small></div>
          <button class="drawer-close" data-drawer-close aria-label="Tutup menu">${icon.x}</button>
        </div>
        <div class="drawer-user">
          <span class="avatar">${esc((u.name || u.email || 'S').slice(0, 1).toUpperCase())}</span>
          <div><strong>${esc(u.name || 'Staff')}</strong><small>${esc(u.email || '')} • ${esc(u.role)}</small><small>${modeBadge}</small></div>
        </div>
        <p class="side-label">Pesanan hari ini</p>
        <nav class="admin-nav" aria-label="Order filters">
          ${FILTERS.map(([k, l, ic]) => `<button data-nav data-filter="${k}" class="${activeFilter === k ? 'on' : ''}" ${activeFilter === k ? 'aria-current="page"' : ''}>${ic}<span>${l}</span><i class="nav-count">${filterCount[k]}</i></button>`).join('')}
        </nav>
        <p class="side-label">Jualan kaunter</p>
        <nav class="admin-nav" aria-label="POS">
          <button data-nav data-mode="pos" class="${isPOS ? 'on' : ''}" ${isPOS ? 'aria-current="page"' : ''}>${icon.wallet}<span>POS / Walk-in</span>${posTicketCount() ? `<i class="nav-count">${posTicketCount()}</i>` : ''}</button>
        </nav>
        <p class="side-label">Tindakan</p>
        <nav class="admin-nav" aria-label="Actions">
          <button data-nav data-scan>${icon.scan}<span>Scan Order QR</span></button>
          ${permission() === 'default' ? `<button data-nav data-bell>🔔<span>Hidupkan order alerts</span></button>` : permission() === 'granted' ? `<span class="side-note">🔔 Order alerts aktif</span>` : ''}
        </nav>
        <div class="admin-foot">
          ${Store.isAdmin() ? `<a href="#/admin">${icon.chart}<span>Admin Panel</span></a>` : ''}
          <a href="#/home">${icon.store}<span>Customer App</span></a>
          <button data-logout>${icon.logout}<span>Log out</span></button>
        </div>
      </aside>
      <main class="admin-main">
      <header class="admin-head">
        ${drawerButton(staffDrawer, filterCount.todo)}
        <div class="admin-title"><h1>${isPOS ? 'POS Kaunter' : 'Pickup Counter'}</h1><small>${fmtDate(today)} • ${modeBadge}</small></div>
        <div class="admin-head-actions">
          ${permission() === 'granted' ? '<span class="bell-on" title="New-order alerts are on">🔔</span>' : ''}
          <button class="btn btn-primary btn-sm head-scan" data-scan aria-label="Scan QR">${icon.scan}<span class="hide-sm">Scan QR</span></button>
        </div>
      </header>
      <div class="seg mode-switch">
        <button class="${isPOS ? '' : 'on'}" data-mode="orders">${icon.bag} Pickup <i class="nav-count">${filterCount.todo}</i></button>
        <button class="${isPOS ? 'on' : ''}" data-mode="pos">${icon.wallet} POS Walk-in</button>
      </div>
      ${isPOS ? posHTML() : `
      <section class="staff">
      <div class="staff-stats">
        <div class="stat"><b>${todays.length}</b><small>Today</small></div>
        <div class="stat"><b>${cnt((o) => ['Pending Confirmation', 'Order Accepted', 'Preparing'].includes(o.status))}</b><small>To prepare</small></div>
        <div class="stat"><b>${cnt((o) => o.status === 'Ready for Pickup')}</b><small>Ready</small></div>
        <div class="stat"><b>${cnt((o) => o.status === 'Completed')}</b><small>Collected</small></div>
      </div>
      <div class="staff-tools">
        <div class="search">${icon.search}<input type="search" data-q value="${esc(st.q)}" placeholder="Search Order ID or customer name" autocomplete="off"></div>
        <button class="btn btn-primary btn-lg scan-btn" data-scan>${icon.scan} Scan QR</button>
      </div>
      ${q ? `<p class="muted">${list.length} result(s) for “${esc(st.q)}” (all dates)</p>` : `<div class="seg tabs">
        ${[['todo', 'To Do'], ['ready', 'Ready'], ['done', 'Done'], ['all', 'All Today']].map(([k, l]) => `<button class="${st.filter === k ? 'on' : ''}" data-filter="${k}">${l}</button>`).join('')}
      </div>`}
      <div class="staff-timeline">
        ${Object.keys(groups).length ? Object.entries(groups).map(([k, os]) => {
          const [d, t] = q ? k.split('|') : [today, k];
          const late = !q && t < nowT && os.some((o) => ACTIVE_STATUSES.includes(o.status));
          return `<section class="time-group">
            <h3 class="${late ? 'late' : ''}">${icon.clock} ${fmtTime(t)} ${q ? `<small>${fmtDate(d, false)}</small>` : ''} <span>${os.length} order${os.length > 1 ? 's' : ''}${late ? ' • due' : ''}</span></h3>
            <div class="staff-grid">${os.map(staffCard).join('')}</div>
          </section>`;
        }).join('') : `<div class="empty"><div class="empty-emoji">🎉</div><h3>All clear!</h3><p>No orders in this view.</p></div>`}
      </div>
      </section>`}
      </main>
    </div>`;
  },
  enter() {
    staffDrawer.open = false;
    document.body.classList.remove('no-scroll');
  },
  mount(root, ctx) {
    if (!Store.isStaff()) return;
    bindDrawer(root, staffDrawer);
    if (st.mode === 'pos') bindPOS(root, ctx);
    $('[data-q]', root)?.addEventListener('input', (e) => { st.q = e.target.value; ctx.refresh({ keepFocus: '[data-q]' }); });
    $('[data-q]', root)?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const exact = Store.order(e.target.value.trim().toUpperCase());
        if (exact) openVerify(exact.id);
      }
    });
    root.addEventListener('click', async (e) => {
      const t = e.target;
      if (t.closest('[data-logout]')) { await Store.logout(); toast('Logged out'); return ctx.go('#/home'); }
      if (t.closest('[data-scan]')) return openScanner();
      const bell = t.closest('[data-bell]');
      if (bell) return busy(bell, async () => { await enableNotifications(); toast('New-order alerts on 🔔', 'success'); ctx.refresh(); });
      const md = t.closest('[data-mode]');
      if (md) { st.mode = md.dataset.mode; window.scrollTo(0, 0); return ctx.refresh(); }
      const f = t.closest('[data-filter]');
      if (f) { st.filter = f.dataset.filter; st.q = ''; st.mode = 'orders'; window.scrollTo(0, 0); return ctx.refresh(); }
      const card = t.closest('[data-id]');
      if (!card) return;
      const id = card.dataset.id;
      const sb = t.closest('[data-status]');
      if (sb) return busy(sb, async () => { await Store.updateOrder(id, { status: sb.dataset.status }); toast(`${id}: ${sb.dataset.status}`, 'success'); });
      const done = t.closest('[data-complete]');
      if (done) return busy(done, () => completeOrder(id));
      if (t.closest('[data-details]')) return openOrderModal(id, { staffMode: true });
      const pb = t.closest('[data-push]');
      if (pb) return busy(pb, async () => { await pushReminder(Store.order(id)); toast('Push reminder sent', 'success'); });
    });
  },
};
