// ---------------------------------------------------------------------------
// Monthly sales report (admin): every sale in a calendar month — online
// pre-orders and POS walk-ins — by pickup date. Totals are net of discounts;
// cancelled orders are counted separately and excluded from sales.
// ---------------------------------------------------------------------------
import { Store } from '../store.js';
import { esc, money, todayStr, fmtDate, fmtDateTime, parseDate } from '../utils.js';
import { icon } from '../ui.js';
import { catName } from '../categories.js';

const PAY = { cash: 'Tunai', duitnow: 'DuitNow QR', online: 'Online' };
const SOURCES = [['all', 'Semua'], ['preorder', 'Pre-order'], ['pos', 'POS walk-in']];
const MONTHS_MS = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];
const WEEKDAYS = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');

export const thisMonth = () => todayStr().slice(0, 7);
export function shiftMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export const monthLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return `${MONTHS_MS[m - 1]} ${y}`; };
const daysIn = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const isPOS = (o) => o.source === 'pos';
const matches = (src) => (o) => src === 'all' || (src === 'pos' ? isPOS(o) : !isPOS(o));
const pct = (now, prev) => (prev ? Math.round(((now - prev) / prev) * 100) : null);

function monthOrders(ym, src) {
  return Store.orders.filter((o) => o.pickupDate?.startsWith(ym + '-') && matches(src)(o));
}

/** Every figure the monthly report shows. */
export function monthReport(ym, src = 'all') {
  const all = monthOrders(ym, src);
  const sales = all.filter((o) => o.status !== 'Cancelled');
  const cancelled = all.filter((o) => o.status === 'Cancelled');
  const sum = (list, f) => r2(list.reduce((s, o) => s + (Number(f(o)) || 0), 0));
  const net = sum(sales, (o) => o.total);
  const today = todayStr();
  const isCurrent = ym === thisMonth();
  const elapsed = isCurrent ? Number(today.slice(8, 10)) : daysIn(ym);

  const days = [...Array(daysIn(ym))].map((_, i) => {
    const d = `${ym}-${pad(i + 1)}`;
    const l = sales.filter((o) => o.pickupDate === d);
    const pos = l.filter(isPOS);
    return { d, n: l.length, v: sum(l, (o) => o.total), pos: sum(pos, (o) => o.total), pre: sum(l.filter((o) => !isPOS(o)), (o) => o.total), disc: sum(l, (o) => o.discount), future: d > today };
  });
  const active = days.filter((x) => x.n);
  const best = active.slice().sort((a, b) => b.v - a.v)[0] || null;

  const prevYm = shiftMonth(ym, -1);
  const prev = monthOrders(prevYm, src).filter((o) => o.status !== 'Cancelled');
  const prevNet = sum(prev, (o) => o.total);
  // Fair comparison while the month is still running: same number of days of last month.
  const prevSameDays = isCurrent ? sum(prev.filter((o) => Number(o.pickupDate.slice(8, 10)) <= elapsed), (o) => o.total) : prevNet;

  const bySource = [['preorder', 'Pre-order online', (o) => !isPOS(o)], ['pos', 'POS walk-in', isPOS]].map(([k, label, f]) => {
    const l = sales.filter(f);
    return { k, label, n: l.length, v: sum(l, (o) => o.total) };
  });
  const pay = Object.keys(PAY).map((k) => {
    const l = sales.filter((o) => o.payment?.method === k);
    return { k, label: PAY[k], n: l.length, v: sum(l, (o) => o.total) };
  });

  const items = {};
  const cats = {};
  sales.forEach((o) => o.items.forEach((it) => {
    const key = it.menuId || it.name;
    const line = r2(it.unitPrice * it.qty);
    items[key] ||= { name: it.name, qty: 0, v: 0 };
    items[key].qty += it.qty;
    items[key].v = r2(items[key].v + line);
    const cat = Store.menuItem(it.menuId)?.category || '';
    const cn = cat ? catName(cat) : 'Lain-lain';
    cats[cn] ||= { name: cn, qty: 0, v: 0 };
    cats[cn].qty += it.qty;
    cats[cn].v = r2(cats[cn].v + line);
  }));

  const weekdays = WEEKDAYS.map((name, i) => {
    const l = days.filter((x) => parseDate(x.d).getDay() === i && !x.future);
    const v = r2(l.reduce((s, x) => s + x.v, 0));
    return { name, v, avg: l.length ? r2(v / l.length) : 0 };
  });

  const customers = new Set(sales.filter((o) => !isPOS(o) && o.customer?.phone).map((o) => o.customer.phone));

  return {
    ym, src, all, sales, cancelled, net, isCurrent, elapsed,
    gross: sum(sales, (o) => o.subtotal ?? o.total),
    discount: sum(sales, (o) => o.discount),
    count: sales.length,
    avg: sales.length ? r2(net / sales.length) : 0,
    perDay: elapsed ? r2(net / elapsed) : 0,
    itemsSold: sales.reduce((s, o) => s + o.items.reduce((x, i) => x + i.qty, 0), 0),
    cancelledValue: sum(cancelled, (o) => o.total),
    customers: customers.size,
    days, active, best, prevYm, prevNet, prevSameDays,
    change: pct(net, prevSameDays),
    bySource, pay,
    topItems: Object.values(items).sort((a, b) => b.qty - a.qty || b.v - a.v),
    cats: Object.values(cats).sort((a, b) => b.v - a.v),
    weekdays,
  };
}

export function monthlyReportHTML(ym, src) {
  const R = monthReport(ym, src);
  const cur = thisMonth();
  const dMax = Math.max(1, ...R.days.map((x) => x.v));
  const iMax = Math.max(1, ...R.topItems.map((x) => x.qty));
  const cMax = Math.max(1, ...R.cats.map((x) => x.v));
  const wMax = Math.max(1, ...R.weekdays.map((x) => x.avg));
  const stat = (label, value, cls, ico, sub = '') => `<div class="kpi ${cls}"><span class="kpi-ico">${ico}</span><small>${label}</small><b>${value}</b>${sub ? `<em class="kpi-sub">${sub}</em>` : ''}</div>`;
  const change = R.change === null ? '' : `<span class="mr-chg ${R.change >= 0 ? 'up' : 'down'}">${R.change >= 0 ? '▲' : '▼'} ${Math.abs(R.change)}%</span> vs ${monthLabel(R.prevYm).split(' ')[0].slice(0, 3)}${R.isCurrent ? ` (hari 1–${R.elapsed})` : ''}`;
  const share = (v) => (R.net ? Math.round((v / R.net) * 100) : 0);

  return `
    <div class="filters rep-bar">
      <div class="rep-nav">
        <button class="btn btn-ghost btn-sm" data-mday="-1" aria-label="Bulan sebelum">${icon.back}</button>
        <input type="month" class="input sm" data-mmonth value="${ym}" max="${cur}" aria-label="Bulan laporan">
        <button class="btn btn-ghost btn-sm" data-mday="1" aria-label="Bulan seterusnya" ${ym >= cur ? 'disabled' : ''}>${icon.chevronRight}</button>
        ${ym !== cur ? '<button class="btn btn-ghost btn-sm" data-mday="0">Bulan ini</button>' : ''}
      </div>
      <div class="rep-actions">
        <button class="btn btn-ghost btn-sm" data-mrep-print ${R.all.length ? '' : 'disabled'}>${icon.print} Cetak</button>
        <button class="btn btn-ghost btn-sm" data-mrep-csv ${R.all.length ? '' : 'disabled'}>${icon.download} CSV</button>
      </div>
    </div>
    <div class="seg sm mr-src" role="tablist" aria-label="Jenis jualan">${SOURCES.map(([k, l]) => `<button role="tab" class="${src === k ? 'on' : ''}" data-msrc="${k}" aria-selected="${src === k}">${l}</button>`).join('')}</div>
    <p class="rep-date"><b>${monthLabel(ym)}</b>${R.isCurrent ? ` <span class="rep-live">● Bulan semasa (hari ${R.elapsed}/${R.days.length})</span>` : ''}</p>

    <div class="kpis rep-kpis">
      ${stat('Jualan bersih', money(R.net), 'k-green', icon.wallet, change || (R.discount ? `Kasar ${money(R.gross)}` : ''))}
      ${stat('Transaksi', R.count, 'k-orange', icon.receipt, `${R.active.length} hari ada jualan`)}
      ${stat('Purata / transaksi', money(R.avg), 'k-done', icon.chart)}
      ${stat('Purata / hari', money(R.perDay), 'k-prep', icon.calendar, R.isCurrent ? `${R.elapsed} hari setakat ini` : `${R.days.length} hari`)}
      ${stat('Diskaun diberi', money(R.discount), 'k-pending', icon.star, `${R.itemsSold} item dijual`)}
      ${stat('Dibatalkan', R.cancelled.length, 'k-ready', icon.x, R.cancelled.length ? money(R.cancelledValue) : '')}
    </div>

    <div class="card">
      <div class="card-head mr-head"><h3>Jualan harian</h3><small class="muted">${R.best ? `Hari terbaik: <b>${fmtDate(R.best.d, false)}</b> • ${money(R.best.v)}` : 'Tiada jualan'}</small></div>
      <div class="mr-days" role="img" aria-label="Jualan harian ${monthLabel(ym)}">
        ${R.days.map((x) => `<button class="mr-day ${x.d === todayStr() ? 'today' : ''} ${x.future ? 'future' : ''} ${R.best && x.d === R.best.d ? 'best' : ''}" data-mgo="${x.d}" title="${fmtDate(x.d)}: ${money(x.v)} (${x.n} transaksi)${src === 'all' && x.n ? ` • Pre-order ${money(x.pre)} • POS ${money(x.pos)}` : ''}" ${x.n ? '' : 'tabindex="-1"'}>
          <span class="mr-bar" style="height:${Math.max(x.v ? 4 : 1.5, (x.v / dMax) * 100)}%">${src === 'all' && x.v ? `<i class="mr-pos" style="height:${(x.pos / x.v) * 100}%"></i>` : ''}</span>
          <span class="mr-lbl">${Number(x.d.slice(8))}</span>
        </button>`).join('')}
      </div>
      ${src === 'all' ? '<p class="small muted mr-legend"><span><i class="lg lg-pre"></i>Pre-order</span><span><i class="lg lg-pos"></i>POS walk-in</span><span class="mr-hint">Tekan hari untuk lihat pesanan</span></p>' : '<p class="small muted mr-legend">Tekan hari untuk lihat pesanan</p>'}
    </div>

    ${!R.sales.length ? `<div class="card empty-rep"><span class="empty-ico">${icon.chart}</span><h3>Tiada jualan pada ${monthLabel(ym)}</h3><p class="muted">Pilih bulan lain atau tukar jenis jualan.</p></div>` : `
    <div class="dash-grid rep-grid">
      <div class="card">
        <div class="card-head"><h3>Sumber &amp; bayaran</h3></div>
        ${src === 'all' ? `<ul class="rep-list">${R.bySource.map((s) => `<li><span>${s.label}<small>${s.n} transaksi • ${share(s.v)}%</small></span><b>${money(s.v)}</b></li>`).join('')}</ul>
        <div class="mr-split" aria-hidden="true"><i style="width:${share(R.bySource[0].v)}%"></i></div>` : ''}
        <p class="side-label rep-sub">Kaedah bayaran</p>
        <ul class="rep-list">${R.pay.map((p) => `<li class="${p.n ? '' : 'dim'}"><span>${p.label}<small>${p.n} transaksi</small></span><b>${money(p.v)}</b></li>`).join('')}
          <li class="rep-total"><span>Jumlah</span><b>${money(R.net)}</b></li></ul>
      </div>
      <div class="card">
        <div class="card-head"><h3>Perbandingan</h3></div>
        <ul class="rep-list">
          <li><span>${monthLabel(ym)}<small>${R.isCurrent ? `Hari 1–${R.elapsed}` : 'Sebulan penuh'}</small></span><b>${money(R.net)}</b></li>
          <li><span>${monthLabel(R.prevYm)}<small>${R.isCurrent ? `Hari 1–${R.elapsed} (sebulan penuh ${money(R.prevNet)})` : 'Sebulan penuh'}</small></span><b>${money(R.prevSameDays)}</b></li>
          <li class="rep-total"><span>Perubahan</span><b class="${R.change === null ? '' : R.change >= 0 ? 'mr-up' : 'mr-down'}">${R.change === null ? '—' : `${R.change >= 0 ? '+' : ''}${R.change}%`}</b></li>
        </ul>
        ${src !== 'pos' ? `<p class="small muted rep-note">👥 ${R.customers} pelanggan pre-order unik bulan ini.</p>` : ''}
        <p class="side-label rep-sub">Purata ikut hari dalam minggu</p>
        <ul class="rep-hours mr-wd">${R.weekdays.map((w) => `<li><span>${w.name.slice(0, 3)}</span><span class="pop-bar"><i style="width:${(w.avg / wMax) * 100}%"></i></span><b>${money(w.avg)}</b><small></small></li>`).join('')}</ul>
      </div>
      <div class="card">
        <div class="card-head"><h3>Item terlaris</h3><small class="muted">Harga sebelum diskaun</small></div>
        <ul class="rep-items">${R.topItems.slice(0, 10).map((x, i) => `<li><span class="pop-rank">${i + 1}</span><span class="pop-main"><strong>${esc(x.name)}</strong><span class="pop-bar"><i style="width:${(x.qty / iMax) * 100}%"></i></span></span><span class="rep-iv"><b>${x.qty}×</b><small>${money(x.v)}</small></span></li>`).join('')}</ul>
      </div>
      <div class="card">
        <div class="card-head"><h3>Ikut kategori</h3><small class="muted">Harga sebelum diskaun</small></div>
        <ul class="rep-items">${R.cats.map((c) => `<li><span class="pop-rank">${c.qty}</span><span class="pop-main"><strong>${esc(c.name)}</strong><span class="pop-bar"><i style="width:${(c.v / cMax) * 100}%"></i></span></span><span class="rep-iv"><b>${money(c.v)}</b><small>${R.gross ? Math.round((c.v / R.gross) * 100) : 0}%</small></span></li>`).join('')}</ul>
      </div>
    </div>

    <div class="card rep-tx">
      <div class="card-head"><h3>Ringkasan harian</h3><small class="muted">${R.active.length} hari ada jualan</small></div>
      <div class="table-wrap">
        <table class="table mr-table">
          <thead><tr><th>Tarikh</th><th>Transaksi</th>${src === 'all' ? '<th>Pre-order</th><th>POS</th>' : ''}<th>Diskaun</th><th>Jualan bersih</th></tr></thead>
          <tbody>${R.active.slice().reverse().map((x) => `<tr data-mgo="${x.d}">
            <td data-l="Tarikh"><strong>${fmtDate(x.d, false)}</strong></td>
            <td data-l="Transaksi">${x.n}</td>
            ${src === 'all' ? `<td data-l="Pre-order">${money(x.pre)}</td><td data-l="POS">${money(x.pos)}</td>` : ''}
            <td data-l="Diskaun">${x.disc ? `−${money(x.disc)}` : '—'}</td>
            <td data-l="Jualan bersih"><strong>${money(x.v)}</strong></td>
          </tr>`).join('')}</tbody>
          <tfoot><tr><td data-l="Jumlah"><strong>Jumlah</strong></td><td data-l="Transaksi"><strong>${R.count}</strong></td>${src === 'all' ? `<td data-l="Pre-order"><strong>${money(R.bySource[0].v)}</strong></td><td data-l="POS"><strong>${money(R.bySource[1].v)}</strong></td>` : ''}<td data-l="Diskaun"><strong>${R.discount ? `−${money(R.discount)}` : '—'}</strong></td><td data-l="Jualan bersih"><strong>${money(R.net)}</strong></td></tr></tfoot>
        </table>
      </div>
    </div>`}`;
}

const srcLabel = (src) => (SOURCES.find((s) => s[0] === src) || SOURCES[0])[1];

export function exportMonthCSV(ym, src) {
  const R = monthReport(ym, src);
  const q = (r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
  const rows = [
    [`Laporan jualan bulanan — ${monthLabel(ym)} (${srcLabel(src)})`],
    [],
    ['Tarikh', 'Transaksi', 'Pre-order (RM)', 'POS (RM)', 'Diskaun (RM)', 'Jualan bersih (RM)'],
    ...R.days.filter((x) => !x.future).map((x) => [x.d, x.n, x.pre.toFixed(2), x.pos.toFixed(2), x.disc.toFixed(2), x.v.toFixed(2)]),
    ['JUMLAH', R.count, R.bySource[0].v.toFixed(2), R.bySource[1].v.toFixed(2), R.discount.toFixed(2), R.net.toFixed(2)],
    [],
    ['Item', 'Kuantiti', 'Nilai sebelum diskaun (RM)'],
    ...R.topItems.map((x) => [x.name, x.qty, x.v.toFixed(2)]),
    [],
    ['Kaedah bayaran', 'Transaksi', 'Jumlah (RM)'],
    ...R.pay.map((p) => [p.label, p.n, p.v.toFixed(2)]),
  ];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + rows.map(q).join('\n')], { type: 'text/csv' }));
  a.download = `laporan-bulanan-${ym}${src === 'all' ? '' : '-' + src}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** One-page monthly summary (A4 or thermal — uses the shared print root). */
export function printMonthReport(ym, src) {
  const R = monthReport(ym, src);
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
    <p class="c"><b>LAPORAN JUALAN BULANAN</b><br>${monthLabel(ym)} • ${srcLabel(src)}<br><small>Dicetak ${fmtDateTime(Date.now())}</small></p>
    <hr>
    <table>
      ${row('Transaksi', R.count)}
      ${row('Item dijual', R.itemsSold)}
      ${row('Jualan kasar', money(R.gross))}
      ${row('Diskaun', `-${money(R.discount)}`)}
      ${row('JUALAN BERSIH', money(R.net), true)}
      ${row('Purata / transaksi', money(R.avg))}
      ${row('Purata / hari', money(R.perDay))}
      ${R.change !== null ? row(`vs ${monthLabel(R.prevYm)}`, `${R.change >= 0 ? '+' : ''}${R.change}%`) : ''}
      ${R.cancelled.length ? row(`Dibatalkan (${R.cancelled.length})`, money(R.cancelledValue)) : ''}
    </table>
    ${src === 'all' ? `<hr><p><b>Sumber</b></p><table>${R.bySource.map((x) => row(`${x.label} (${x.n})`, money(x.v))).join('')}</table>` : ''}
    <hr><p><b>Bayaran</b></p>
    <table>${R.pay.map((p) => row(`${p.label} (${p.n})`, money(p.v))).join('')}</table>
    <hr><p><b>Harian</b></p>
    <table>${R.active.map((x) => row(`${x.d.slice(8)} ${WEEKDAYS[parseDate(x.d).getDay()].slice(0, 3)} (${x.n})`, money(x.v))).join('')}</table>
    <hr><p><b>Item terlaris</b></p>
    <table>${R.topItems.slice(0, 15).map((x) => row(`${x.qty}× ${esc(x.name)}`, money(x.v))).join('')}</table>
    <hr><p class="c">— Tamat laporan —</p>
  </div>`;
  setTimeout(() => window.print(), 150);
}
