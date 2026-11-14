// ---------------------------------------------------------------------------
// Daily POS sales report (admin): walk-in sales rung up at the staff counter.
// Totals are net of discounts; cancelled sales are listed but not counted.
// ---------------------------------------------------------------------------
import { Store } from '../store.js';
import { esc, money, todayStr, addDays, fmtDate, fmtDateTime, parseDate } from '../utils.js';
import { icon, badge } from '../ui.js';
import { variantText } from '../cart.js';

export const POS_PAY = { cash: 'Tunai', duitnow: 'DuitNow QR', online: 'Online' };
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const timeOf = (o) => new Date(o.createdAt).toTimeString().slice(0, 5);

export const posOrdersOn = (date) => Store.orders
  .filter((o) => o.source === 'pos' && o.pickupDate === date)
  .sort((a, b) => a.createdAt - b.createdAt);

/** Every figure the report shows, for one day. */
export function posReport(date) {
  const all = posOrdersOn(date);
  const sales = all.filter((o) => o.status !== 'Cancelled');
  const cancelled = all.filter((o) => o.status === 'Cancelled');
  const sum = (list, f) => r2(list.reduce((s, o) => s + (Number(f(o)) || 0), 0));
  const net = sum(sales, (o) => o.total);
  const gross = sum(sales, (o) => o.subtotal ?? o.total);
  const discount = sum(sales, (o) => o.discount);

  const pay = Object.keys(POS_PAY).map((k) => {
    const l = sales.filter((o) => o.payment?.method === k);
    return { k, label: POS_PAY[k], n: l.length, v: sum(l, (o) => o.total) };
  });

  const items = {};
  sales.forEach((o) => o.items.forEach((it) => {
    const key = it.menuId || it.name;
    items[key] ||= { name: it.name, qty: 0, v: 0 };
    items[key].qty += it.qty;
    items[key].v = r2(items[key].v + it.unitPrice * it.qty);
  }));
  const topItems = Object.values(items).sort((a, b) => b.qty - a.qty || b.v - a.v);

  const hours = {};
  sales.forEach((o) => {
    const h = new Date(o.createdAt).getHours();
    hours[h] ||= { h, n: 0, v: 0 };
    hours[h].n += 1;
    hours[h].v = r2(hours[h].v + o.total);
  });
  const hourly = Object.values(hours).sort((a, b) => a.h - b.h);

  const staff = {};
  sales.forEach((o) => {
    const name = o.staff?.name || 'Staff';
    staff[name] ||= { name, n: 0, v: 0 };
    staff[name].n += 1;
    staff[name].v = r2(staff[name].v + o.total);
  });

  const discounts = {};
  sales.filter((o) => o.discount).forEach((o) => {
    const label = o.promoCode || 'Diskaun';
    discounts[label] ||= { label, n: 0, v: 0 };
    discounts[label].n += 1;
    discounts[label].v = r2(discounts[label].v + o.discount);
  });

  return {
    date, all, sales, cancelled, net, gross, discount,
    count: sales.length,
    avg: sales.length ? r2(net / sales.length) : 0,
    itemsSold: sales.reduce((s, o) => s + o.items.reduce((x, i) => x + i.qty, 0), 0),
    cancelledValue: sum(cancelled, (o) => o.total),
    pay, topItems, hourly,
    staff: Object.values(staff).sort((a, b) => b.v - a.v),
    discounts: Object.values(discounts).sort((a, b) => b.v - a.v),
  };
}

export function posReportHTML(date) {
  const R = posReport(date);
  const today = todayStr();
  const week = [...Array(7)].map((_, i) => addDays(date, i - 6)).map((d) => {
    const l = posOrdersOn(d).filter((o) => o.status !== 'Cancelled');
    return { d, n: l.length, v: r2(l.reduce((s, o) => s + o.total, 0)) };
  });
  const wMax = Math.max(1, ...week.map((x) => x.v));
  const hMax = Math.max(1, ...R.hourly.map((x) => x.v));
  const iMax = Math.max(1, ...R.topItems.map((x) => x.qty));
  const stat = (label, value, cls, ico, sub = '') => `<div class="kpi ${cls}"><span class="kpi-ico">${ico}</span><small>${label}</small><b>${value}</b>${sub ? `<em class="kpi-sub">${sub}</em>` : ''}</div>`;

  return `
    <div class="filters rep-bar">
      <div class="rep-nav">
        <button class="btn btn-ghost btn-sm" data-rday="-1" aria-label="Hari sebelum">${icon.back}</button>
        <input type="date" class="input sm" data-rdate value="${date}" max="${today}" aria-label="Tarikh laporan">
        <button class="btn btn-ghost btn-sm" data-rday="1" aria-label="Hari seterusnya" ${date >= today ? 'disabled' : ''}>${icon.chevronRight}</button>
        ${date !== today ? '<button class="btn btn-ghost btn-sm" data-rday="0">Hari ini</button>' : ''}
      </div>
      <div class="rep-actions">
        <button class="btn btn-ghost btn-sm" data-rep-print ${R.all.length ? '' : 'disabled'}>${icon.print} Cetak laporan</button>
        <button class="btn btn-ghost btn-sm" data-rep-csv ${R.all.length ? '' : 'disabled'}>${icon.download} CSV</button>
      </div>
    </div>
    <p class="rep-date"><b>${fmtDate(date)}</b>${date === today ? ' <span class="rep-live">● Hari ini (langsung)</span>' : ''}</p>

    <div class="kpis rep-kpis">
      ${stat('Jualan bersih', money(R.net), 'k-green', icon.wallet, R.discount ? `Kasar ${money(R.gross)}` : '')}
      ${stat('Transaksi', R.count, 'k-orange', icon.receipt)}
      ${stat('Purata / transaksi', money(R.avg), 'k-done', icon.chart)}
      ${stat('Item dijual', R.itemsSold, 'k-prep', icon.bag)}
      ${stat('Diskaun diberi', money(R.discount), 'k-pending', icon.star, `${R.discounts.reduce((s, x) => s + x.n, 0)} transaksi`)}
      ${stat('Dibatalkan', R.cancelled.length, 'k-ready', icon.x, R.cancelled.length ? money(R.cancelledValue) : '')}
    </div>

    ${!R.all.length ? `<div class="card empty-rep"><span class="empty-ico">${icon.chart}</span><h3>Tiada jualan POS pada tarikh ini</h3><p class="muted">Jualan walk-in yang dibuat di Kaunter Staff → POS akan muncul di sini.</p><a class="btn btn-primary btn-sm" href="#/staff">Buka Kaunter Staff</a></div>` : `
    <div class="dash-grid rep-grid">
      <div class="card">
        <div class="card-head"><h3>Kaedah bayaran</h3><small class="muted">Untuk tutup kaunter</small></div>
        <ul class="rep-list">${R.pay.map((p) => `<li class="${p.n ? '' : 'dim'}"><span>${p.label}<small>${p.n} transaksi</small></span><b>${money(p.v)}</b></li>`).join('')}
          <li class="rep-total"><span>Jumlah</span><b>${money(R.net)}</b></li></ul>
        ${R.pay[0].n ? `<p class="small muted rep-note">💵 Tunai yang patut ada dalam laci: <b>${money(R.pay[0].v)}</b> (selepas baki dipulangkan).</p>` : ''}
      </div>
      <div class="card">
        <div class="card-head"><h3>Jualan ikut jam</h3><small class="muted">${R.hourly.length} jam aktif</small></div>
        <ul class="rep-hours">${R.hourly.map((x) => `<li><span>${String(x.h).padStart(2, '0')}:00</span><span class="pop-bar"><i style="width:${(x.v / hMax) * 100}%"></i></span><b>${money(x.v)}</b><small>${x.n}×</small></li>`).join('')}</ul>
      </div>
      <div class="card">
        <div class="card-head"><h3>Item terlaris</h3><small class="muted">Harga sebelum diskaun</small></div>
        <ul class="rep-items">${R.topItems.slice(0, 10).map((x, i) => `<li><span class="pop-rank">${i + 1}</span><span class="pop-main"><strong>${esc(x.name)}</strong><span class="pop-bar"><i style="width:${(x.qty / iMax) * 100}%"></i></span></span><span class="rep-iv"><b>${x.qty}×</b><small>${money(x.v)}</small></span></li>`).join('')}</ul>
      </div>
      <div class="card">
        <div class="card-head"><h3>Staff &amp; diskaun</h3></div>
        <ul class="rep-list">${R.staff.map((s) => `<li><span>${esc(s.name)}<small>${s.n} transaksi</small></span><b>${money(s.v)}</b></li>`).join('')}</ul>
        ${R.discounts.length ? `<p class="side-label rep-sub">Diskaun</p><ul class="rep-list">${R.discounts.map((d) => `<li><span>${esc(d.label)}<small>${d.n}×</small></span><b>−${money(d.v)}</b></li>`).join('')}</ul>` : '<p class="small muted">Tiada diskaun diberi.</p>'}
      </div>
    </div>

    <div class="card rep-tx">
      <div class="card-head"><h3>Transaksi</h3><small class="muted">${R.all.length} jualan • tekan untuk butiran</small></div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Masa</th><th>Order</th><th>Item</th><th>Diskaun</th><th>Jumlah</th><th>Bayaran</th><th>Status</th></tr></thead>
          <tbody>${R.all.slice().reverse().map((o) => `<tr data-open="${o.id}" class="${o.status === 'Cancelled' ? 'row-void' : ''}">
            <td data-l="Masa"><strong>${timeOf(o)}</strong><small>${esc(o.staff?.name || '')}</small></td>
            <td data-l="Order">${esc(o.id)}<small>${esc(o.customer?.name || 'Walk-in')}</small></td>
            <td data-l="Item">${o.items.map((i) => `${i.qty}× ${esc(i.name)}${variantText(i.variant) ? ` <small class="vt">(${esc(variantText(i.variant))})</small>` : ''}`).join('<br>')}</td>
            <td data-l="Diskaun">${o.discount ? `−${money(o.discount)}<small>${esc(o.promoCode || '')}</small>` : '—'}</td>
            <td data-l="Jumlah"><strong>${money(o.total)}</strong></td>
            <td data-l="Bayaran">${POS_PAY[o.payment?.method] || '-'}</td>
            <td data-l="Status">${badge(o.status)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`}

    <div class="card">
      <div class="card-head"><h3>7 hari terakhir</h3><small class="muted">Jualan POS bersih • tekan hari untuk lihat</small></div>
      <div class="bars rep-week" role="img" aria-label="Jualan POS 7 hari">
        ${week.map((x) => `<button class="bar-col ${x.d === date ? 'today' : ''}" data-rgo="${x.d}" title="${fmtDate(x.d)}: ${money(x.v)} (${x.n} transaksi)">
          <span class="bar-val">${x.v ? 'RM' + Math.round(x.v) : ''}</span>
          <span class="bar" style="height:${Math.max(2, (x.v / wMax) * 100)}%"></span>
          <span class="bar-lbl">${x.d === today ? 'Hari ini' : parseDate(x.d).toLocaleDateString('ms-MY', { weekday: 'short', day: 'numeric' })}</span>
        </button>`).join('')}
      </div>
      <p class="muted small">Jumlah 7 hari: <b>${money(week.reduce((s, x) => s + x.v, 0))}</b> daripada ${week.reduce((s, x) => s + x.n, 0)} transaksi</p>
    </div>`;
}

export function exportPosCSV(date) {
  const rows = [['Masa', 'Order ID', 'Staff', 'Pelanggan', 'Item', 'Subtotal', 'Diskaun', 'Kod/Jenis diskaun', 'Jumlah', 'Bayaran', 'Tunai diterima', 'Baki', 'Status']];
  posOrdersOn(date).forEach((o) => rows.push([
    fmtDateTime(o.createdAt), o.id, o.staff?.name || '', o.customer?.name || '',
    o.items.map((i) => `${i.qty}x ${i.name}${variantText(i.variant) ? ` (${variantText(i.variant)})` : ''}`).join('; '),
    o.subtotal ?? o.total, o.discount || 0, o.promoCode || '', o.total,
    POS_PAY[o.payment?.method] || '', o.payment?.cashReceived ?? '', o.payment?.change ?? '', o.status,
  ]));
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
  a.download = `laporan-pos-${date}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** End-of-day summary for an 80mm thermal printer (same print root as receipts). */
export function printPosReport(date) {
  const R = posReport(date);
  const s = Store.settings;
  let root = document.getElementById('print-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'print-root';
    document.body.appendChild(root);
  }
  const row = (l, v, b = false) => `<tr><td>${b ? `<b>${l}</b>` : l}</td><td class="r">${b ? `<b>${v}</b>` : v}</td></tr>`;
  root.innerHTML = `<div class="print-receipt">
    <h2>${esc(s.shopName)}</h2>
    <p class="c"><b>LAPORAN JUALAN POS</b><br>${fmtDate(date)}<br><small>Dicetak ${fmtDateTime(Date.now())}</small></p>
    <hr>
    <table>
      ${row('Transaksi', R.count)}
      ${row('Item dijual', R.itemsSold)}
      ${row('Jualan kasar', money(R.gross))}
      ${row('Diskaun', `-${money(R.discount)}`)}
      ${row('JUALAN BERSIH', money(R.net), true)}
      ${row('Purata / transaksi', money(R.avg))}
      ${R.cancelled.length ? row(`Dibatalkan (${R.cancelled.length})`, money(R.cancelledValue)) : ''}
    </table>
    <hr><p><b>Bayaran</b></p>
    <table>${R.pay.map((p) => row(`${p.label} (${p.n})`, money(p.v))).join('')}</table>
    ${R.discounts.length ? `<hr><p><b>Diskaun</b></p><table>${R.discounts.map((d) => row(`${esc(d.label)} (${d.n})`, `-${money(d.v)}`)).join('')}</table>` : ''}
    <hr><p><b>Item</b></p>
    <table>${R.topItems.map((x) => row(`${x.qty}× ${esc(x.name)}`, money(x.v))).join('')}</table>
    ${R.staff.length ? `<hr><p><b>Staff</b></p><table>${R.staff.map((x) => row(`${esc(x.name)} (${x.n})`, money(x.v))).join('')}</table>` : ''}
    <hr><p class="c">— Tamat laporan —</p>
  </div>`;
  setTimeout(() => window.print(), 150);
}
