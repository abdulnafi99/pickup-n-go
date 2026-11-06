// ---------------------------------------------------------------------------
// Shared order components: item list, totals, status tracker, receipts
// ---------------------------------------------------------------------------
import { Store, ORDER_STATUSES } from '../store.js';
import { esc, money, fmtDate, fmtTime, fmtDateTime } from '../utils.js';
import { foodArt } from '../food-art.js';
import { variantText } from '../cart.js';
import { badge, icon } from '../ui.js';
import { PAY_LABEL, locationName } from '../whatsapp.js';
import { qrDataURL, orderQRText } from '../qr.js';

export function thumb(it) {
  const m = Store.menuItem(it.menuId);
  if (m?.image) return `<img src="${esc(m.image)}" alt="" class="thumb-img">`;
  return `<div class="thumb-art">${foodArt(it.art || m?.art)}</div>`;
}

export function itemsHTML(order) {
  return `<ul class="line-list">${order.items
    .map(
      (it) => `<li class="line">
        <div class="line-thumb">${thumb(it)}</div>
        <div class="line-main">
          <strong>${esc(it.name)}</strong>
          ${variantText(it.variant) ? `<small>${esc(variantText(it.variant))}</small>` : ''}
          ${it.note ? `<small class="note">📝 ${esc(it.note)}</small>` : ''}
          <small class="muted">${it.qty} × ${money(it.unitPrice)}</small>
        </div>
        <div class="line-price">${money(it.unitPrice * it.qty)}</div>
      </li>`
    )
    .join('')}</ul>`;
}

export function totalsHTML(t, { promo = '' } = {}) {
  return `<div class="totals">
    <div><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
    ${t.discount ? `<div class="discount"><span>Discount${promo ? ` (${esc(promo)})` : ''}</span><span>− ${money(t.discount)}</span></div>` : ''}
    <div class="grand"><span>Grand Total</span><span>${money(t.total)}</span></div>
  </div>`;
}

export function trackerHTML(order) {
  if (order.status === 'Cancelled') {
    return `<div class="tracker cancelled"><span class="tracker-x">${icon.x}</span> This order was cancelled.</div>`;
  }
  const steps = ORDER_STATUSES.slice(0, 5);
  const idx = steps.indexOf(order.status);
  const labels = ['Pending', 'Accepted', 'Preparing', 'Ready', 'Completed'];
  return `<ol class="tracker">${steps
    .map((s, i) => {
      const h = (order.history || []).find((x) => x.status === s);
      return `<li class="${i < idx ? 'done' : i === idx ? 'current' : ''}">
        <span class="dot">${i <= idx ? icon.check : ''}</span>
        <span class="lbl">${labels[i]}</span>
        ${h ? `<small>${fmtTime(new Date(h.at).toTimeString().slice(0, 5))}</small>` : ''}
      </li>`;
    })
    .join('')}</ol>`;
}

export function pickupInfoHTML(o) {
  return `<div class="info-grid">
    <div class="info"><span class="info-ico">${icon.calendar}</span><div><small>Pickup Date</small><strong>${fmtDate(o.pickupDate)}</strong></div></div>
    <div class="info"><span class="info-ico">${icon.clock}</span><div><small>Pickup Time</small><strong>${fmtTime(o.pickupTime)}</strong></div></div>
    <div class="info wide"><span class="info-ico">${icon.pin}</span><div><small>Pickup Location</small><strong>${esc(locationName(o.location))}</strong></div></div>
    <div class="info"><span class="info-ico">${icon.bag}</span><div><small>Order Type</small><strong>${o.orderType === 'immediate' ? 'Immediate' : 'Scheduled'}</strong></div></div>
    <div class="info"><span class="info-ico">${icon.wallet}</span><div><small>Payment</small><strong>${PAY_LABEL[o.payment.method]}</strong></div></div>
  </div>`;
}

export function customerHTML(o, { admin = false } = {}) {
  return `<div class="kv">
    <div><span>Name</span><strong>${esc(o.customer.name)}</strong></div>
    <div><span>Phone</span><strong>${admin ? `<a href="tel:${esc(o.customer.phone)}">${esc(o.customer.phone)}</a>` : esc(o.customer.phone)}</strong></div>
    ${o.customer.email ? `<div><span>Email</span><strong>${esc(o.customer.email)}</strong></div>` : ''}
    <div><span>Ordered</span><strong>${fmtDateTime(o.createdAt)}</strong></div>
  </div>`;
}

export function paymentHTML(o) {
  return `<div class="kv">
    <div><span>Method</span><strong>${PAY_LABEL[o.payment.method]}</strong></div>
    <div><span>Payment Status</span>${badge(o.payment.status)}</div>
    <div><span>Order Status</span>${badge(o.status)}</div>
    ${o.payment.receipt ? `<div><span>Receipt</span><button class="link-btn" data-view-receipt>View uploaded receipt</button></div>` : ''}
  </div>`;
}

// ---------------------------------------------------------------------------
// Downloadable PNG receipt (drawn on canvas)
// ---------------------------------------------------------------------------
export async function downloadReceipt(o) {
  const s = Store.settings;
  const W = 640;
  const pad = 36;
  const lines = [];
  o.items.forEach((it) => {
    lines.push({ left: `${it.qty} × ${it.name}`, right: money(it.unitPrice * it.qty), bold: true });
    const v = variantText(it.variant);
    if (v) lines.push({ left: `   ${v}`, small: true });
    if (it.note) lines.push({ left: `   Note: ${it.note}`, small: true });
  });
  const H = 520 + lines.length * 30 + (o.specialRequest ? 40 : 0) + 280;
  const c = document.createElement('canvas');
  c.width = W * 2;
  c.height = H * 2;
  const ctx = c.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = '#FFF9F0';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#244B38';
  ctx.fillRect(0, 0, W, 130);
  ctx.fillStyle = '#F4A340';
  ctx.beginPath();
  ctx.arc(W - 60, 30, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '800 30px Poppins, Arial, sans-serif';
  ctx.fillText(s.shopName, pad, 58);
  ctx.font = '400 15px Poppins, Arial, sans-serif';
  ctx.fillText('Order Receipt • Smart Food Pre-Order & Pickup', pad, 88);
  ctx.fillText(fmtDateTime(o.createdAt), pad, 110);

  let y = 170;
  const text = (t, x, yy, font = '400 15px Poppins, Arial', color = '#292929', align = 'left') => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(t, x, yy);
    ctx.textAlign = 'left';
  };
  text('ORDER ID', pad, y, '600 12px Poppins, Arial', '#7a756c');
  text(o.id, pad, y + 30, '800 26px Poppins, Arial', '#244B38');
  text(o.status, W - pad, y + 28, '600 15px Poppins, Arial', '#F4A340', 'right');
  y += 70;
  const kv = [
    ['Customer', o.customer.name],
    ['Phone', o.customer.phone],
    ['Pickup', `${fmtDate(o.pickupDate)} • ${fmtTime(o.pickupTime)}`],
    ['Location', locationName(o.location)],
    ['Payment', `${PAY_LABEL[o.payment.method]} (${o.payment.status})`],
  ];
  kv.forEach(([k, v]) => {
    text(k, pad, y, '400 14px Poppins, Arial', '#7a756c');
    text(String(v).slice(0, 52), W - pad, y, '600 14px Poppins, Arial', '#292929', 'right');
    y += 28;
  });
  y += 8;
  ctx.strokeStyle = '#e6dccb';
  ctx.setLineDash([6, 6]);
  ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
  y += 32;
  lines.forEach((l) => {
    text(l.left.slice(0, 56), pad, y, l.small ? '400 13px Poppins, Arial' : '600 15px Poppins, Arial', l.small ? '#7a756c' : '#292929');
    if (l.right) text(l.right, W - pad, y, '600 15px Poppins, Arial', '#292929', 'right');
    y += 30;
  });
  if (o.specialRequest) {
    text(`Special request: ${o.specialRequest}`.slice(0, 70), pad, y, 'italic 400 13px Poppins, Arial', '#7a756c');
    y += 40;
  }
  ctx.beginPath(); ctx.moveTo(pad, y - 10); ctx.lineTo(W - pad, y - 10); ctx.stroke();
  ctx.setLineDash([]);
  y += 16;
  text('Subtotal', pad, y); text(money(o.subtotal), W - pad, y, '400 15px Poppins, Arial', '#292929', 'right'); y += 28;
  if (o.discount) { text(`Discount ${o.promoCode || ''}`, pad, y, '400 15px Poppins, Arial', '#2e7d4f'); text('- ' + money(o.discount), W - pad, y, '400 15px Poppins, Arial', '#2e7d4f', 'right'); y += 28; }
  text('GRAND TOTAL', pad, y + 6, '800 18px Poppins, Arial');
  text(money(o.total), W - pad, y + 6, '800 22px Poppins, Arial', '#244B38', 'right');
  y += 40;

  const qr = await qrDataURL(orderQRText(o.id), 220);
  if (qr) {
    const img = new Image();
    await new Promise((r) => { img.onload = r; img.onerror = r; img.src = qr; });
    ctx.fillStyle = '#fff';
    ctx.fillRect(W / 2 - 100, y, 200, 200);
    ctx.drawImage(img, W / 2 - 90, y + 10, 180, 180);
  }
  y += 222;
  text('Show this QR at the counter when collecting your order.', W / 2, y, '400 13px Poppins, Arial', '#7a756c', 'center');
  text(`Thank you! • WhatsApp ${s.phone}`, W / 2, y + 22, '600 13px Poppins, Arial', '#244B38', 'center');

  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = `Receipt-${o.id}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ---------------------------------------------------------------------------
// Printable receipt (thermal-printer friendly)
// ---------------------------------------------------------------------------
export async function printReceipt(o) {
  const s = Store.settings;
  const qr = await qrDataURL(orderQRText(o.id), 180);
  let root = document.getElementById('print-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'print-root';
    document.body.appendChild(root);
  }
  root.innerHTML = `<div class="print-receipt">
    <h2>${esc(s.shopName)}</h2>
    <p class="c">${esc(locationName(o.location))}<br>Tel/WhatsApp: ${esc(s.phone)}</p>
    <hr>
    <p><b>Order:</b> ${esc(o.id)}<br><b>Date:</b> ${fmtDateTime(o.createdAt)}<br>
    <b>Customer:</b> ${esc(o.customer.name)} (${esc(o.customer.phone)})<br>
    <b>Pickup:</b> ${fmtDate(o.pickupDate)} ${fmtTime(o.pickupTime)}<br>
    <b>Payment:</b> ${PAY_LABEL[o.payment.method]} — ${esc(o.payment.status)}<br>
    <b>Status:</b> ${esc(o.status)}</p>
    <hr>
    <table>${o.items
      .map((it) => `<tr><td>${it.qty}× ${esc(it.name)}${variantText(it.variant) ? `<br><small>${esc(variantText(it.variant))}</small>` : ''}${it.note ? `<br><small>Note: ${esc(it.note)}</small>` : ''}</td><td class="r">${money(it.unitPrice * it.qty)}</td></tr>`)
      .join('')}</table>
    ${o.specialRequest ? `<p><i>Special: ${esc(o.specialRequest)}</i></p>` : ''}
    <hr>
    <table><tr><td>Subtotal</td><td class="r">${money(o.subtotal)}</td></tr>
    ${o.discount ? `<tr><td>Discount</td><td class="r">-${money(o.discount)}</td></tr>` : ''}
    <tr><td><b>TOTAL</b></td><td class="r"><b>${money(o.total)}</b></td></tr></table>
    ${qr ? `<p class="c"><img src="${qr}" width="140" height="140" alt="Order QR"></p>` : ''}
    <p class="c">Terima kasih!</p>
  </div>`;
  setTimeout(() => window.print(), 150);
}

export function viewImage(src, title = 'Payment Receipt') {
  return `<div class="img-viewer"><img src="${esc(src)}" alt="${esc(title)}"></div>`;
}
