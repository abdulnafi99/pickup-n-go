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
  discType: 'none', // 'none' | 'percent' | 'fixed' | 'code'
  discValue: '',
  discCode: '',
};

/** Discount for the current ticket: { amount, label, error }. Never more than the subtotal. */
function discountInfo(subtotal) {
  const none = { amount: 0, label: '', error: '' };
  if (!subtotal || pos.discType === 'none') return none;
  if (pos.discType === 'percent') {
    const v = Math.min(100, Math.max(0, Number(pos.discValue) || 0));
    if (!v) return none;
    return { amount: +(subtotal * v / 100).toFixed(2), label: `${+v.toFixed(2)}%`, error: '' };
  }
  if (pos.discType === 'fixed') {
    const v = Math.max(0, Number(pos.discValue) || 0);
    if (!v) return none;
    return { amount: +Math.min(v, subtotal).toFixed(2), label: money(Math.min(v, subtotal)), error: '' };
  }
  const code = pos.discCode.trim().toUpperCase();
  if (!code) return none;
  const promo = (Store.settings.promos || []).find((p) => p.active && String(p.code).toUpperCase() === code);
  if (!promo) return { ...none, error: 'Kod promo tidak sah.' };
  if (subtotal < (Number(promo.minSpend) || 0)) return { ...none, error: `Min. belanja ${money(promo.minSpend)} untuk ${promo.code}.` };
  const amt = promo.type === 'percent' ? subtotal * Number(promo.value) / 100 : Number(promo.value);
  return { amount: +Math.min(amt, subtotal).toFixed(2), label: promo.code, error: '' };
}
const payable = () => { const sub = ticketTotal(); return +(sub - discountInfo(sub).amount).toFixed(2); };

const lineKey = (menuId, variant, note = '') => `${menuId}|${JSON.stringify(variant)}|${note.trim()}`;
/** Item has at least one variation group with a real choice. */
const hasChoices = (m) => (m.variants || []).some((g) => (g.options || []).length > 1);

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

function addItem(id, variant, qty = 1, note = '') {
  const m = Store.menuItem(id);
  if (!m) return;
  if (!m.available) return toast(`${m.name} sold out`, 'error');
  const v = variant || defaultVariant(m);
  const key = lineKey(id, v, note);
  const ex = pos.lines.find((l) => l.key === key);
  if (ex) ex.qty = Math.min(99, ex.qty + qty);
  else pos.lines.push({ key, menuId: id, qty: Math.min(99, qty), variant: v, note: note.trim() });
  if (navigator.vibrate) navigator.vibrate(15);
}

/**
 * Variation picker for items with choices (portion, spice, hot/iced, add-ons…).
 * `editKey` re-opens it for an existing ticket line so its variation can be changed.
 */
function openVariantPicker(id, onDone, editKey = null) {
  const m = Store.menuItem(id);
  if (!m) return;
  const editing = editKey ? pos.lines.find((l) => l.key === editKey) : null;
  const sel = { ...defaultVariant(m), ...(editing?.variant || {}) };
  let qty = editing?.qty || 1;
  let note = editing?.note || '';
  const md = modal('', { title: editing ? 'Ubah pilihan' : 'Pilih variasi' });
  const draw = () => {
    const price = unitPrice(m, sel);
    md.el.innerHTML = `<div class="pos-variant">
      <div class="pv-head"><span class="pv-art">${itemVisual(m)}</span><div><strong>${esc(m.name)}</strong><small class="muted">Harga asas ${money(m.price)}</small></div></div>
      ${(m.variants || []).map((g, gi) => `<div class="pv-group">
        <p class="pv-label">${esc(g.name)}</p>
        <div class="pv-opts">${g.options.map((o, oi) => `<button type="button" class="pv-opt ${sel[g.name] === o.label ? 'on' : ''}" data-g="${gi}" data-o="${oi}" aria-pressed="${sel[g.name] === o.label}">
          <span>${esc(o.label)}</span>${Number(o.price) ? `<small>${o.price > 0 ? '+' : '−'}${money(Math.abs(o.price))}</small>` : ''}
        </button>`).join('')}</div>
      </div>`).join('')}
      <input class="input sm pv-note" data-pv-note value="${esc(note)}" maxlength="80" placeholder="Nota item (pilihan), cth: tanpa bawang">
      <div class="pv-foot">
        <div class="stepper big-ish"><button type="button" data-pv-dec aria-label="Kurang">${icon.minus}</button><output>${qty}</output><button type="button" data-pv-inc aria-label="Tambah">${icon.plus}</button></div>
        <button type="button" class="btn btn-primary btn-lg pv-add" data-pv-add>${editing ? 'Simpan' : 'Tambah'} • ${money(price * qty)}</button>
      </div>
    </div>`;
  };
  draw();
  md.el.addEventListener('input', (e) => { if (e.target.matches('[data-pv-note]')) note = e.target.value; });
  md.el.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-g]');
    if (opt) {
      const g = m.variants[Number(opt.dataset.g)];
      sel[g.name] = g.options[Number(opt.dataset.o)].label;
      return draw();
    }
    if (e.target.closest('[data-pv-inc]')) { qty = Math.min(99, qty + 1); return draw(); }
    if (e.target.closest('[data-pv-dec]')) { qty = Math.max(1, qty - 1); return draw(); }
    if (e.target.closest('[data-pv-add]')) {
      if (editing) pos.lines = pos.lines.filter((l) => l.key !== editKey);
      addItem(id, { ...sel }, qty, note);
      md.close();
      onDone?.();
    }
  });
}

function setQty(key, qty) {
  const l = pos.lines.find((x) => x.key === key);
  if (!l) return;
  if (qty <= 0) pos.lines = pos.lines.filter((x) => x.key !== key);
  else l.qty = Math.min(99, qty);
}

function resetTicket() {
  Object.assign(pos, { lines: [], name: '', phone: '', note: '', method: 'cash', cash: '', discType: 'none', discValue: '', discCode: '' });
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
        ${m.available && hasChoices(m) ? '<span class="pos-var-hint">Pilih variasi</span>' : ''}
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
function discountHTML(subtotal) {
  const d = discountInfo(subtotal);
  const t = pos.discType;
  return `<div class="pos-disc">
    <div class="pos-disc-head"><span>Diskaun</span>
      <div class="seg sm">${[['none', 'Tiada'], ['percent', '%'], ['fixed', 'RM'], ['code', 'Kod']].map(([k, l]) => `<button type="button" class="${t === k ? 'on' : ''}" data-disc-type="${k}">${l}</button>`).join('')}</div>
    </div>
    ${t === 'percent' ? `<div class="pos-disc-row">
        <input class="input sm" data-disc="discValue" value="${esc(pos.discValue)}" inputmode="decimal" placeholder="cth: 10" aria-label="Peratus diskaun"><span class="pos-disc-unit">%</span>
        <div class="pos-quick">${[5, 10, 15, 20].map((v) => `<button type="button" class="fchip ${Number(pos.discValue) === v ? 'on' : ''}" data-disc-quick="${v}">${v}%</button>`).join('')}</div>
      </div>` : ''}
    ${t === 'fixed' ? `<div class="pos-disc-row"><span class="pos-disc-unit">RM</span><input class="input sm" data-disc="discValue" value="${esc(pos.discValue)}" inputmode="decimal" placeholder="cth: 5.00" aria-label="Jumlah diskaun"></div>` : ''}
    ${t === 'code' ? `<div class="pos-disc-row">
        <input class="input sm" data-disc="discCode" value="${esc(pos.discCode)}" placeholder="Kod promo, cth: PNG10" autocapitalize="characters" aria-label="Kod promo">
        <button type="button" class="btn btn-dark btn-sm" data-disc-apply>Guna</button>
      </div>` : ''}
    <small class="pos-disc-msg ${d.error ? 'danger' : 'ok'}" data-disc-msg>${d.error ? esc(d.error) : d.amount ? `✓ Diskaun ${esc(d.label)} = −${money(d.amount)}` : ''}</small>
  </div>`;
}

function sumHTML(subtotal) {
  const d = discountInfo(subtotal);
  return `<div class="pos-sum">
    ${d.amount ? `<div><span>Subtotal</span><span>${money(subtotal)}</span></div><div class="discount"><span>Diskaun (${esc(d.label)})</span><span>−${money(d.amount)}</span></div>` : ''}
    <div class="pos-total"><span>Jumlah</span><strong>${money(+(subtotal - d.amount).toFixed(2))}</strong></div>
  </div>`;
}

function checkoutHTML() {
  const lines = ticketLines();
  const subtotal = ticketTotal();
  const total = payable();
  const cashNum = Number(pos.cash) || 0;
  const change = +(cashNum - total).toFixed(2);
  const quick = [...new Set([Math.ceil(total), Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10, 50, 100].filter((v) => v >= total))].slice(0, 4);
  const s = Store.settings;
  return `<div class="pos-checkout">
    <ul class="pos-lines">${lines.map((l) => `<li data-key="${esc(l.key)}">
      <div class="pl-main">
        <strong>${esc(l.item.name)}</strong>
        ${variantText(l.variant) ? `<small>${esc(variantText(l.variant))}</small>` : ''}
        ${l.note ? `<small class="note">📝 ${esc(l.note)}</small>` : ''}
        <small class="muted">${money(l.unitPrice)}${hasChoices(l.item) ? ` • <button type="button" class="link-btn pl-edit" data-edit-line>Ubah</button>` : ''}</small>
      </div>
      <div class="stepper"><button data-dec aria-label="Kurang">${icon.minus}</button><output>${l.qty}</output><button data-inc aria-label="Tambah">${icon.plus}</button></div>
      <strong class="pl-total">${money(l.lineTotal)}</strong>
    </li>`).join('')}</ul>
    ${discountHTML(subtotal)}
    ${sumHTML(subtotal)}

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
        <p class="muted small center">Minta pelanggan scan &amp; bayar <b class="pos-qr-amt">${money(total)}</b>${s.duitnowQR ? '' : ' (QR demo — muat naik QR sebenar di Shop &amp; Payment)'}. Sahkan bayaran diterima sebelum tekan.</p>
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
  const subtotal = ticketTotal();
  const disc = discountInfo(subtotal);
  if (disc.error) throw new Error(disc.error);
  const total = +(subtotal - disc.amount).toFixed(2);
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
    subtotal,
    discount: disc.amount,
    promoCode: disc.amount ? disc.label : '',
    discountType: disc.amount ? pos.discType : '',
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
  return { id, total, subtotal, discount: disc.amount, discountLabel: disc.label, change: paid.change || 0, method: pos.method, mode };
}

function openCheckout(refresh) {
  const md = modal('', { title: 'Bayaran', wide: false });
  const draw = () => {
    if (!pos.lines.length) { md.close(); refresh(); return; }
    md.el.innerHTML = checkoutHTML();
    const demo = md.el.querySelector('[data-pos-demo-qr]');
    if (demo) renderQR(demo, `DUITNOW-DEMO|PICK UP N GO|${payable().toFixed(2)}`, 180);
  };
  draw();
  const updateSums = () => {
    const sub = ticketTotal();
    const d = discountInfo(sub);
    const sum = md.el.querySelector('.pos-sum');
    if (sum) sum.outerHTML = sumHTML(sub);
    const msg = md.el.querySelector('[data-disc-msg]');
    if (msg) {
      msg.className = `pos-disc-msg ${d.error ? 'danger' : 'ok'}`;
      msg.textContent = d.error || (d.amount ? `✓ Diskaun ${d.label} = −${money(d.amount)}` : '');
    }
    const total = payable();
    const box = md.el.querySelector('.pos-change');
    if (box) {
      const change = +((Number(pos.cash) || 0) - total).toFixed(2);
      box.classList.toggle('short', !!pos.cash && change < 0);
      box.innerHTML = `<span>${pos.cash && change < 0 ? 'Tidak cukup' : 'Baki'}</span><strong>${pos.cash ? money(Math.abs(change)) : '—'}</strong>`;
    }
    const cashIn = md.el.querySelector('.pos-cash-in');
    if (cashIn) cashIn.placeholder = total.toFixed(2);
    const amt = md.el.querySelector('.pos-qr-amt');
    if (amt) amt.textContent = money(total);
  };
  md.el.addEventListener('input', (e) => {
    const df = e.target.dataset.disc;
    if (df) {
      pos[df] = df === 'discValue' ? e.target.value.replace(/[^0-9.]/g, '') : e.target.value;
      if (df === 'discValue') updateSums(); // promo code applies on "Guna"
      return;
    }
    const f = e.target.dataset.pf;
    if (!f) return;
    pos[f] = f === 'cash' ? e.target.value.replace(/[^0-9.]/g, '') : e.target.value;
    if (f === 'cash') {
      // update only the change line to keep the keyboard open
      const total = payable();
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
    if (li && e.target.closest('[data-edit-line]')) {
      const l = pos.lines.find((x) => x.key === li.dataset.key);
      if (l) openVariantPicker(l.menuId, () => { draw(); refresh(); }, l.key);
      return;
    }
    if (li && e.target.closest('[data-inc]')) { const l = pos.lines.find((x) => x.key === li.dataset.key); setQty(li.dataset.key, l.qty + 1); draw(); refresh(); return; }
    if (li && e.target.closest('[data-dec]')) { const l = pos.lines.find((x) => x.key === li.dataset.key); setQty(li.dataset.key, l.qty - 1); draw(); refresh(); return; }
    const m = e.target.closest('[data-method]');
    if (m) { pos.method = m.dataset.method; draw(); return; }
    const dt = e.target.closest('[data-disc-type]');
    if (dt) { pos.discType = dt.dataset.discType; pos.discValue = ''; pos.discCode = ''; draw(); return; }
    const dq = e.target.closest('[data-disc-quick]');
    if (dq) { pos.discValue = dq.dataset.discQuick; draw(); return; }
    if (e.target.closest('[data-disc-apply]')) {
      const d = discountInfo(ticketTotal());
      if (d.error) toast(d.error, 'error');
      else if (d.amount) toast(`Kod ${d.label} digunakan`, 'success');
      draw();
      return;
    }
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
        ${r.discount ? `<div><span>Subtotal</span><strong>${money(r.subtotal)}</strong></div><div class="ok"><span>Diskaun (${esc(r.discountLabel)})</span><strong>−${money(r.discount)}</strong></div>` : ''}
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
      const m = Store.menuItem(add.dataset.posAdd);
      if (m && m.available && hasChoices(m)) return openVariantPicker(m.id, () => ctx.refresh());
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
