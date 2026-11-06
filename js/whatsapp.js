// ---------------------------------------------------------------------------
// WhatsApp deep links with auto-generated messages (Bahasa Melayu)
// ---------------------------------------------------------------------------
import { Store } from './store.js';
import { money, fmtDate, fmtTime, waNumber } from './utils.js';
import { variantText } from './cart.js';

export const PAY_LABEL = { cash: 'Cash on Pickup', duitnow: 'DuitNow QR', online: 'Online Payment' };

export function waLink(number, text) {
  const n = number ? waNumber(number) : '';
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

export function locationName(id) {
  const loc = (Store.settings.locations || []).find((l) => l.id === id);
  return loc ? loc.name : id || '-';
}

const orderUrl = (o) => `${location.origin}${location.pathname}#/order/${o.id}`;

function itemLines(o) {
  return o.items
    .map((it, i) => {
      const v = variantText(it.variant);
      let line = `${i + 1}. ${it.qty}x ${it.name}${v ? ` (${v})` : ''} — ${money(it.unitPrice * it.qty)}`;
      if (it.note) line += `\n    📝 ${it.note}`;
      return line;
    })
    .join('\n');
}

/** Sent by the customer to the shop right after checkout. */
export function orderToShopMessage(o) {
  const s = Store.settings;
  return [
    `🛍️ *PESANAN BARU — ${s.shopName}*`,
    ``,
    `No. Pesanan: *${o.id}*`,
    `Nama: ${o.customer.name}`,
    `Telefon: ${o.customer.phone}`,
    o.customer.email ? `Emel: ${o.customer.email}` : null,
    ``,
    `📅 Pickup: *${fmtDate(o.pickupDate)} • ${fmtTime(o.pickupTime)}*`,
    `📍 Lokasi: ${locationName(o.location)}`,
    `⏱️ Jenis: ${o.orderType === 'immediate' ? 'Segera (Immediate)' : 'Berjadual (Scheduled)'}`,
    ``,
    `*Item:*`,
    itemLines(o),
    ``,
    `Subtotal: ${money(o.subtotal)}`,
    o.discount ? `Diskaun${o.promoCode ? ` (${o.promoCode})` : ''}: -${money(o.discount)}` : null,
    `*Jumlah: ${money(o.total)}*`,
    `💳 Bayaran: ${PAY_LABEL[o.payment.method]} (${o.payment.status})`,
    o.specialRequest ? `\n🗒️ Permintaan khas: ${o.specialRequest}` : null,
    ``,
    `Semak pesanan: ${orderUrl(o)}`,
  ].filter((l) => l !== null).join('\n');
}

/** Generic share (to friends/family). */
export function shareMessage(o) {
  return [
    `🍽️ Pesanan saya di *${Store.settings.shopName}*`,
    `No. Pesanan: *${o.id}*`,
    `Pickup: ${fmtDate(o.pickupDate)} • ${fmtTime(o.pickupTime)}`,
    `Lokasi: ${locationName(o.location)}`,
    ``,
    itemLines(o),
    ``,
    `*Jumlah: ${money(o.total)}*`,
    `Status: ${o.status}`,
    ``,
    orderUrl(o),
  ].join('\n');
}

/** Staff/admin -> customer pickup reminder. */
export function reminderMessage(o) {
  return [
    `Hai ${o.customer.name} 👋`,
    ``,
    `Peringatan pickup dari *${Store.settings.shopName}*:`,
    `No. Pesanan: *${o.id}*`,
    `📅 ${fmtDate(o.pickupDate)} • *${fmtTime(o.pickupTime)}*`,
    `📍 ${locationName(o.location)}`,
    `Jumlah: ${money(o.total)} (${PAY_LABEL[o.payment.method]} — ${o.payment.status})`,
    ``,
    `Sila tunjukkan QR pesanan anda di kaunter. Terima kasih! 🙏`,
    orderUrl(o),
  ].join('\n');
}

/** Staff/admin -> customer status update. */
export function statusMessage(o) {
  const lines = {
    'Pending Confirmation': 'Pesanan anda telah diterima dan sedang menunggu pengesahan.',
    'Order Accepted': 'Pesanan anda telah *DISAHKAN* ✅',
    Preparing: 'Pesanan anda sedang *DISEDIAKAN* 👨‍🍳',
    'Ready for Pickup': 'Pesanan anda *SEDIA UNTUK DIAMBIL* 🎉 Sila datang ke kaunter.',
    Completed: 'Pesanan anda telah *SELESAI*. Terima kasih kerana memilih kami! 💚',
    Cancelled: 'Maaf, pesanan anda telah *DIBATALKAN*. Sila hubungi kami untuk maklumat lanjut.',
  };
  return [
    `Hai ${o.customer.name},`,
    ``,
    lines[o.status] || `Status: ${o.status}`,
    ``,
    `No. Pesanan: *${o.id}*`,
    `Pickup: ${fmtDate(o.pickupDate)} • ${fmtTime(o.pickupTime)}`,
    `📍 ${locationName(o.location)}`,
    ``,
    `— ${Store.settings.shopName}`,
  ].join('\n');
}

export function contactShopLink(orderIdText = '') {
  const text = orderIdText
    ? `Hai ${Store.settings.shopName}, saya ingin bertanya tentang pesanan ${orderIdText}.`
    : `Hai ${Store.settings.shopName}, saya ingin bertanya tentang menu & pickup.`;
  return waLink(Store.settings.whatsapp, text);
}

export function openWhatsApp(url) {
  // Note: passing 'noopener' makes window.open return null, so clear opener manually.
  const w = window.open(url, '_blank');
  if (w) w.opener = null;
  else location.href = url;
}
