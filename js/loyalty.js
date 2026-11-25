// ---------------------------------------------------------------------------
// Selagi Coffee loyalty: when staff complete an order, ask the server to add
// 1 stamp + 10 points to the customer's loyalty account (matched by phone).
// The server does all the checks and only awards each order once, so calling
// this twice (or from two staff devices) is harmless.
// ---------------------------------------------------------------------------
import { Store } from './store.js';
import { toast } from './ui.js';

/** Selagi Coffee loyalty app (customers install it from here). Admin can override with settings.loyaltyUrl. */
export const loyaltyUrl = () => Store.settings?.loyaltyUrl || 'https://selagicoffeenew11.vercel.app';

/** '012-345 6789' / '+60123456789' → '0123456789' (loyalty app key format), '' if not a Malaysian mobile. */
export function normalizeLoyaltyPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('60')) d = '0' + d.slice(2);
  return /^01\d{8,9}$/.test(d) ? d : '';
}

/** Latest award result per order, so a screen opened just after the sale can still show it. */
const results = new Map();
export const loyaltyResult = (orderId) => results.get(orderId) || null;
const announce = (detail) => {
  results.set(detail.orderId, detail);
  if (results.size > 30) results.delete(results.keys().next().value);
  try { window.dispatchEvent(new CustomEvent('loyalty:result', { detail })); } catch {}
};

const escHTML = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** "Join Selagi Rewards" card for the order page (QR is drawn into [data-loyalty-qr]). */
export function loyaltyCardHTML(o) {
  if (!o || o.status === 'Cancelled' || o.source === 'pos') return '';
  const phone = String(o.customer?.phone || '').trim();
  const url = loyaltyUrl();
  const status = o.loyalty?.awarded
    ? `<p class="lc-earned">✓ <b>+${o.loyalty.points || 10} pts</b> and 1 stamp added to <b>${escHTML(o.loyalty.phone || phone)}</b></p>`
    : phone
      ? `<p>Earn <b>1 stamp + 10 pts</b> when you collect this order. Points go automatically to <b>${escHTML(phone)}</b> — just log in with this number.</p>`
      : '<p>Add your phone number at checkout next time to earn <b>1 stamp + 10 pts</b> per order.</p>';
  return `<div class="card loyalty-card">
    <div class="lc-body">
      <span class="lc-chip">☕ Selagi Rewards</span>
      <h3>Collect stamps, get free coffee</h3>
      ${status}
      <p class="lc-perks">5th stamp: <b>RM3 off</b> · 10th stamp: <b>1 free coffee</b></p>
      <a class="btn btn-accent btn-sm" href="${escHTML(url)}" target="_blank" rel="noopener">Open & install ↗</a>
    </div>
    <div class="lc-qr"><div data-loyalty-qr></div><small>Scan to join</small></div>
  </div>`;
}

export async function awardLoyalty(order) {
  if (!order || order.status !== 'Completed') return null;
  if (order.source === 'pos' && !order.loyaltyOptIn) return null; // walk-in sale without a Selagi Rewards number
  if (!order.customer?.phone) return null;
  if (Store.mode !== 'firebase') { // demo mode has no real orders / loyalty database
    announce({ orderId: order.id, ok: false, error: 'mod demo — point hanya dihantar dalam mod Firebase' });
    return null;
  }
  try {
    const res = await fetch('/api/loyalty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: order.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 503) { console.warn('loyalty not configured:', data.error); announce({ orderId: order.id, ok: false, error: 'loyalty belum dikonfigurasi di server' }); return null; } // keys not set on Vercel yet
    if (!res.ok) throw new Error(data.error || `Loyalty failed (${res.status})`);
    announce({ orderId: order.id, ...data, ok: !!data.ok, error: data.ok ? '' : (data.reason || '') });
    if (data.ok && !data.already && data.points) {
      const reward = data.rewards?.length ? ` 🎁 ${data.rewards.join(', ')} unlocked!` : '';
      const who = data.newMember ? 'New loyalty member' : 'Loyalty';
      toast(`⭐ ${who}: +${data.points} pts · Stamp ${data.stamp}/10 (${data.phone})${reward}`, 'success', 5000);
    }
    return data;
  } catch (e) {
    console.warn('loyalty', e.message);
    announce({ orderId: order.id, ok: false, error: e.message });
    toast(`Loyalty points not added: ${e.message}`, 'error', 5000);
    return null;
  }
}
