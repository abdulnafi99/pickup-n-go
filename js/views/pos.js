// ---------------------------------------------------------------------------
// Simple POS for the staff counter: walk-in sales.
//   menu grid (search + category) → ticket → pay (cash with change / DuitNow)
//   → saved as an order (source: 'pos') that does NOT use a pickup slot.
// The sale is written with the existing order rules: created as a pending
// order by the staff account, then immediately marked paid by staff.
// ---------------------------------------------------------------------------
import { Store } from '../store.js';
import { categories } from '../categories.js';
import { itemVisual } from '../food-art.js';
import { defaultVariant, unitPrice, variantText } from '../cart.js';
import { $, esc, money, orderId, todayStr } from '../utils.js';
import { icon, toast, modal, busy, confirmDialog } from '../ui.js';
import { renderQR } from '../qr.js';
import { printReceipt } from './shared.js';

const pos = {
  q: '',
  cat: '',
  lines: [], // { key, menuId, qty, variant, note }
  name: '',
  phone: '',
  note: '',
  method: 'cash',
  cash: '',
};

const lineKey = (menuId, variant) => `${menuId}|${JSON.stringify(variant)}`;

function ticketLines() {
  return pos.lines
    .map((l) => {
      const m = Store.menuItem(l.menuId);
      if (!m) return null;
      const price = unitPrice(m, l.variant);
      return { ...l, item: m, unitPrice: price, lineTotal: +(price * l.qty).toFixed(2) };
    })
    .filter(Boolean);
}
const ticketTotal = () => +ticketLines().reduce((s, l) => s + l.lineTotal, 0).toFixed(2);
const ticketCount = () => pos.lines.reduce((s, l) => s + l.qty, 0);

function addItem(id) {
  const m = Store.menuItem(id);
  if (!m) return;
  if (!m.available) return toast(`${m.name} sold out`, 'error');
  const variant = defaultVariant(m);
  const key = lineKey(id, variant);
  const ex = pos.lines.find((l) => l.key === key);
  if (ex) ex.qty = Math.min(99, ex.qty + 1);
  else pos.lines.push({ key, menuId: id, qty: 1, variant, note: '' });
  if (navigator.vibrate) navigator.vibrate(15);
}

function setQty(key, qty) {
  const l = pos.lines.find((x) => x.key === key);
  if (!l) return;
  if (qty <= 0) pos.lines = pos.lines.filter((x) => x.key !== key);
  else l.qty = Math.min(99, qty);
}

function resetTicket() {
  Object.assign(pos, { lines: [], name: '', phone: '', note: '', method: 'cash', cash: '' });
}

// ---------------------------------------------------------------------------
export function posHTML() {
  const q = pos.q.trim().toLowerCase();
  const cats = categories();
  const list = Store.menu
    .filter((m) => (!pos.cat || m.category === pos.cat) && (!q || `${m.name} ${m.desc || ''}`.toLowerCase().includes(q)))
    .sort((a, b) => (b.available - a.available) || a.name.localeCompare(b.name));
  const qtyIn = (id) => pos.lines.filter((l) => l.menuId === id).reduce((s, l) => s + l.qty, 0);
  const count = ticketCount();
  return `<section class="pos">
    <div class="pos-tools">
      <div class="search">${icon.search}<input type="search" data-pos-q value="${esc(pos.q)}" placeholder="Cari menu…" autocomplete="off"></div>
    </div>
    <div class="chip-scroll pos-cats">
      <button class="fchip ${!pos.cat ? 'on' : ''}" data-pos-cat="">Semua</button>
      ${cats.map((c) => `<button class="fchip ${pos.cat === c.id ? 'on' : ''}" data-pos-cat="${esc(c.id)}">${esc(c.icon)} ${esc(c.name)}</button>`).join('')}
    </div>
    ${list.length ? `<div class="pos-grid">${list.map((m) => {
      const n = qtyIn(m.id);
      return `<button class="pos-item ${m.available ? '' : 'off'} ${n ? 'in' : ''}" data-pos-add="${esc(m.id)}" ${m.available ? '' : 'disabled'} aria-label="Tambah ${esc(m.name)}">
        ${n ? `<i class="pos-qty">${n}</i>` : ''}
        <span class="pos-art">${itemVisual(m)}</span>
        <span class="pos-name">${esc(m.name)}</span>
        <span class="pos-price">${m.available ? money(m.price) : 'Sold out'}</span>
      </button>`;
    }).join('')}</div>` : `<div class="empty"><div class="empty-emoji">🔍</div><h3>Tiada menu</h3><p>Cuba carian atau kategori lain.</p></div>`}
  </section>
  <div class="pos-bar ${count ? '' : 'empty'}">
    <div class="pos-bar-sum"><small>${count} item</small><strong>${money(ticketTotal())}</strong></div>
    ${count ? `<button class="btn btn-ghost btn-sm" data-pos-clear>${icon.trash}<span class="hide-sm">Kosongkan</span></button>` : ''}
    <button class="btn btn-accent btn-lg" data-pos-checkout ${count ? '' : 'disabled'}>${icon.wallet} Bayar</button>
  </div>`;
}

// ---------------------------------------------------------------------------
function checkoutHTML() {
  const lines = ticketLines();
  const total = ticketTotal();
  const cashNum = Number(pos.cash) || 0;
  const change = +(cashNum - total).toFixed(2);
  const quick = [...new Set([Math.ceil(total), Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10, 50, 100].filter((v) => v >= total))].slice(0, 4);
  const s = Store.settings;
  return `<div class="pos-checkout">
    <ul class="pos-lines">${lines.map((l) => `<li data-key="${esc(l.key)}">
      <div class="pl-main"><strong>${esc(l.item.name)}</strong>${variantText(l.variant) ? `<small>${esc(variantText(l.variant))}</small>` : ''}<small class="muted">${money(l.unitPrice)}</small></div>
      <div class="stepper"><button data-dec aria-label="Kurang">${icon.minus}</button><output>${l.qty}</output><button data-inc aria-label="Tambah">${icon.plus}</button></div>
      <strong class="pl-total">${money(l.lineTotal)}</strong>
    </li>`).join('')}</ul>
    <div class="pos-total"><span>Jumlah</span><strong>${money(total)}</strong></div>

    <details class="pos-cust" ${pos.name || pos.phone || pos.note ? 'open' : ''}>
      <summary>Pelanggan & nota <small>(pilihan)</small></summary>
      <div class="two">
        <input class="input sm" data-pf="name" value="${esc(pos.name)}" placeholder="Nama (Walk-in)" maxlength="40">
        <input class="input sm" data-pf="phone" value="${esc(pos.phone)}" placeholder="Telefon" inputmode="tel" maxlength="15">
      </div>
      <input class="input sm" data-pf="note" value="${esc(pos.note)}" placeholder="Nota (cth: kurang manis, bungkus)" maxlength="120">
    </details>

    <div class="seg">
      <button class="${pos.method === 'cash' ? 'on' : ''}" data-method="cash">💵 Tunai</button>
      ${s.payments?.duitnow !== false ? `<button class="${pos.method === 'duitnow' ? 'on' : ''}" data-method="duitnow">📱 DuitNow QR</button>` : ''}
    </div>
    ${pos.method === 'cash' ? `<div class="pos-cash">
        <label class="label" for="pos-cash">Tunai diterima (RM)</label>
        <input id="pos-cash" class="input pos-cash-in" data-pf="cash" value="${esc(pos.cash)}" inputmode="decimal" placeholder="${total.toFixed(2)}">
        <div class="pos-quick">${quick.map((v) => `<button class="fchip" data-cash="${v}">RM${v}</button>`).join('')}<button class="fchip" data-cash="${total.toFixed(2)}">Tepat</button></div>
        <div class="pos-change ${pos.cash && change < 0 ? 'short' : ''}">
          <span>${pos.cash && change < 0 ? 'Tidak cukup' : 'Baki'}</span><strong>${pos.cash ? money(Math.abs(change)) : '—'}</strong>
        </div>
      </div>` : `<div class="pos-qr">
        <div class="pos-qr-box">${s.duitnowQR ? `<img src="${esc(s.duitnowQR)}" alt="DuitNow QR">` : '<div data-pos-demo-qr></div>'}</div>
        <p class="muted small center">Minta pelanggan scan &amp; bayar <b>${money(total)}</b>${s.duitnowQR ? '' : ' (QR demo — muat naik QR sebenar di Shop &amp; Payment)'}. Sahkan bayaran diterima sebelum tekan.</p>
      </div>`}

    <div class="pos-actions">
      <button class="btn btn-ghost" data-pos-pay="prepare">👨‍🍳 Bayar &amp; Sediakan</button>
      <button class="btn btn-primary btn-lg" data-pos-pay="done">${icon.check} Bayar &amp; Selesai</button>
    </div>
  </div>`;
}

async function charge(mode) {
  const lines = ticketLines();
  if (!lines.length) throw new Error('Tiket kosong.');
  const unavailable = lines.find((l) => !l.item.available);
  if (unavailable) throw new Error(`${unavailable.item.name} sudah sold out.`);
  const total = ticketTotal();
  const cashNum = Number(pos.cash) || 0;
  if (pos.method === 'cash' && pos.cash && cashNum < total) throw new Error('Tunai diterima kurang daripada jumlah.');
  const u = Store.user;
  const now = new Date();
  const id = orderId(now);
  const order = {
    id,
    source: 'pos',
    createdAt: now.getTime(),
    updatedAt: now.getTime(),
    customer: { uid: u.id, name: pos.name.trim() || 'Walk-in', phone: pos.phone.trim(), email: '' },
    items: lines.map((l) => ({ menuId: l.menuId, name: l.item.name, art: l.item.art || '', unitPrice: l.unitPrice, qty: l.qty, variant: l.variant, note: l.note || '' })),
    specialRequest: pos.note.trim(),
    subtotal: total,
    discount: 0,
    promoCode: '',
    total,
    pickupDate: todayStr(),
    pickupTime: now.toTimeString().slice(0, 5),
    location: Store.settings.locations?.[0]?.id || '',
    orderType: 'walk-in',
    payment: { method: pos.method, status: 'Pending', receipt: '' },
    status: 'Pending Confirmation',
    history: [{ status: 'Pending Confirmation', at: now.getTime() }],
    pushSub: null,
    staff: { uid: u.id, name: u.name || u.email || '' },
  };
  await Store.createOrder(order, () => {});
  const paid = {
    ...order.payment,
    status: 'Verified',
    ...(pos.method === 'cash' ? { cashReceived: pos.cash ? cashNum : total, change: pos.cash ? +(cashNum - total).toFixed(2) : 0 } : {}),
  };
  await Store.updateOrder(id, { status: mode === 'done' ? 'Completed' : 'Preparing', payment: paid });
  return { id, total, change: paid.change || 0, method: pos.method, mode };
}

function openCheckout(refresh) {
  const md = modal('', { title: 'Bayaran', wide: false });
  const draw = () => {
    if (!pos.lines.length) { md.close(); refresh(); return; }
    md.el.innerHTML = checkoutHTML();
    const demo = md.el.querySelector('[data-pos-demo-qr]');
    if (demo) renderQR(demo, `DUITNOW-DEMO|PICK UP N GO|${ticketTotal().toFixed(2)}`, 180);
  };
  draw();
  md.el.addEventListener('input', (e) => {
    const f = e.target.dataset.pf;
    if (!f) return;
    pos[f] = f === 'cash' ? e.target.value.replace(/[^0-9.]/g, '') : e.target.value;
    if (f === 'cash') {
      // update only the change line to keep the keyboard open
      const total = ticketTotal();
      const change = +((Number(pos.cash) || 0) - total).toFixed(2);
      const box = md.el.querySelector('.pos-change');
      if (box) {
        box.classList.toggle('short', !!pos.cash && change < 0);
        box.innerHTML = `<span>${pos.cash && change < 0 ? 'Tidak cukup' : 'Baki'}</span><strong>${pos.cash ? money(Math.abs(change)) : '—'}</strong>`;
      }
    }
  });
  md.el.addEventListener('click', (e) => {
    const li = e.target.closest('[data-key]');
    if (li && e.target.closest('[data-inc]')) { const l = pos.lines.find((x) => x.key === li.dataset.key); setQty(li.dataset.key, l.qty + 1); draw(); refresh(); return; }
    if (li && e.target.closest('[data-dec]')) { const l = pos.lines.find((x) => x.key === li.dataset.key); setQty(li.dataset.key, l.qty - 1); draw(); refresh(); return; }
    const m = e.target.closest('[data-method]');
    if (m) { pos.method = m.dataset.method; draw(); return; }
    const c = e.target.closest('[data-cash]');
    if (c) { pos.cash = String(c.dataset.cash); draw(); return; }
    const pay = e.target.closest('[data-pos-pay]');
    if (pay) {
      busy(pay, async () => {
        const r = await charge(pay.dataset.posPay);
        md.close();
        resetTicket();
        refresh();
        showDone(r);
      });
    }
  });
}

function showDone(r) {
  const md = modal(`<div class="pos-done">
      <div class="success-check">${icon.check}</div>
      <h2>Jualan berjaya</h2>
      <p class="oid">${esc(r.id)}</p>
      <div class="kv">
        <div><span>Jumlah</span><strong>${money(r.total)}</strong></div>
        <div><span>Bayaran</span><strong>${r.method === 'cash' ? 'Tunai' : 'DuitNow QR'}</strong></div>
        ${r.method === 'cash' ? `<div class="pos-change-row"><span>Baki kepada pelanggan</span><strong>${money(r.change)}</strong></div>` : ''}
        <div><span>Status</span><strong>${r.mode === 'done' ? 'Selesai' : 'Sedang disediakan (dalam senarai To Do)'}</strong></div>
      </div>
      <div class="btn-row">
        <button class="btn btn-ghost" data-print>${icon.print} Cetak Resit</button>
        <button class="btn btn-primary" data-close>Jualan Baru</button>
      </div>
    </div>`, { title: 'Selesai' });
  $('[data-print]', md.el).addEventListener('click', () => {
    const o = Store.order(r.id);
    if (o) printReceipt(o);
  });
}

// ---------------------------------------------------------------------------
export function bindPOS(root, ctx) {
  const input = $('[data-pos-q]', root);
  input?.addEventListener('input', () => { pos.q = input.value; ctx.refresh({ keepFocus: '[data-pos-q]' }); });
  root.addEventListener('click', async (e) => {
    const add = e.target.closest('[data-pos-add]');
    if (add) {
      addItem(add.dataset.posAdd);
      add.classList.add('pop');
      return ctx.refresh();
    }
    const cat = e.target.closest('[data-pos-cat]');
    if (cat) { pos.cat = cat.dataset.posCat; return ctx.refresh(); }
    if (e.target.closest('[data-pos-clear]')) {
      if (await confirmDialog('Kosongkan tiket semasa?', { ok: 'Kosongkan', danger: true })) { resetTicket(); ctx.refresh(); }
      return;
    }
    if (e.target.closest('[data-pos-checkout]')) openCheckout(() => ctx.refresh());
  });
}

export const posTicketCount = ticketCount;
