// ---------------------------------------------------------------------------
// Selagi Coffee loyalty: when staff complete an order, ask the server to add
// 1 stamp + 10 points to the customer's loyalty account (matched by phone).
// The server does all the checks and only awards each order once, so calling
// this twice (or from two staff devices) is harmless.
// ---------------------------------------------------------------------------
import { Store } from './store.js';
import { toast } from './ui.js';

export async function awardLoyalty(order) {
  if (Store.mode !== 'firebase') return null; // demo mode has no real orders
  if (!order || order.status !== 'Completed' || order.source === 'pos') return null;
  if (!order.customer?.phone) return null;
  try {
    const res = await fetch('/api/loyalty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: order.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 503) { console.warn('loyalty not configured:', data.error); return null; } // keys not set on Vercel yet
    if (!res.ok) throw new Error(data.error || `Loyalty failed (${res.status})`);
    if (data.ok && !data.already && data.points) {
      const reward = data.rewards?.length ? ` 🎁 ${data.rewards.join(', ')} unlocked!` : '';
      const who = data.newMember ? 'New loyalty member' : 'Loyalty';
      toast(`⭐ ${who}: +${data.points} pts · Stamp ${data.stamp}/10 (${data.phone})${reward}`, 'success', 5000);
    }
    return data;
  } catch (e) {
    console.warn('loyalty', e.message);
    toast(`Loyalty points not added: ${e.message}`, 'error', 5000);
    return null;
  }
}
