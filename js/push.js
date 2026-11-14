// ---------------------------------------------------------------------------
// Notifications
//
// 1. Web Push (real push, works when the app is closed):
//    - The browser subscribes with the VAPID public key served by /api/push.
//    - The subscription is saved on the customer's profile and on each order
//      they place (`order.pushSub`).
//    - When staff/admin change an order's status, the app calls POST /api/push,
//      which sends the notification through the browser's push service.
//
// 2. Local notifications (fallback, and new-order alerts for staff):
//    - While the app is open (any tab, including background tabs), changes to
//      the customer's orders and new incoming orders for staff are shown with
//      ServiceWorkerRegistration.showNotification().
//    - Notifications use a tag of `<orderId>-<status>` so a push and a local
//      notification for the same event replace each other instead of doubling.
// ---------------------------------------------------------------------------
import { Store, ACTIVE_STATUSES } from './store.js';
import { toast } from './ui.js';
import { money, fmtTime, fmtDate } from './utils.js';

const API = '/api/push';
const SUB_KEY = 'png_push_sub';
const MY_ORDERS_KEY = 'png_my_orders';

const readJSON = (k, f) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; }
};

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export function notifySupport() {
  const hasNotification = 'Notification' in window;
  const hasSW = 'serviceWorker' in navigator;
  const hasPush = hasSW && 'PushManager' in window;
  // iOS/iPadOS only allow notifications for apps added to the Home Screen (16.4+).
  const needsInstall = isIOS() && !isStandalone();
  return { supported: hasNotification && hasSW, push: hasPush, needsInstall };
}

export const permission = () => ('Notification' in window ? Notification.permission : 'unsupported');
export const savedSubscription = () => readJSON(SUB_KEY, null);

// ---------------------------------------------------------------------------
// Orders placed on this device (so notifications follow the customer even if
// a staff account is logged in on the same browser during a demo).
// ---------------------------------------------------------------------------
export function rememberMyOrder(id) {
  const ids = readJSON(MY_ORDERS_KEY, []);
  if (!ids.includes(id)) {
    ids.unshift(id);
    localStorage.setItem(MY_ORDERS_KEY, JSON.stringify(ids.slice(0, 200)));
  }
}
export const myOrderIds = () => readJSON(MY_ORDERS_KEY, []);

// ---------------------------------------------------------------------------
// Subscribe / unsubscribe
// ---------------------------------------------------------------------------
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function vapidKey() {
  const res = await fetch(API, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Push server not available');
  const { publicKey } = await res.json();
  if (!publicKey) throw new Error('Push server not configured');
  return publicKey;
}

/**
 * Ask for permission (must be called from a tap) and subscribe to Web Push.
 * Returns { permission, push: boolean }.
 */
export async function enableNotifications() {
  const sup = notifySupport();
  if (sup.needsInstall) throw new Error('On iPhone/iPad, add PICK UP N GO to your Home Screen first, then enable notifications from the installed app.');
  if (!sup.supported) throw new Error('This browser does not support notifications.');

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    throw new Error(perm === 'denied'
      ? 'Notifications are blocked. Allow them in your browser/app settings, then try again.'
      : 'Notification permission was not granted.');
  }

  let pushOk = false;
  if (sup.push) {
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(await vapidKey()) });
      }
      const json = sub.toJSON();
      localStorage.setItem(SUB_KEY, JSON.stringify(json));
      await attachSubscription(json);
      pushOk = true;
    } catch (e) {
      console.warn('Web Push unavailable, using in-app notifications only:', e.message);
    }
  }
  window.dispatchEvent(new CustomEvent('notify:change'));
  return { permission: perm, push: pushOk };
}

export async function disableNotifications() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager?.getSubscription();
    await sub?.unsubscribe();
  } catch { /* ignore */ }
  localStorage.removeItem(SUB_KEY);
  await attachSubscription(null);
  window.dispatchEvent(new CustomEvent('notify:change'));
}

/** Save the subscription to the profile and to this device's active orders. */
async function attachSubscription(sub) {
  try { await Store.saveProfile({ pushSub: sub }); } catch { /* staff accounts etc. */ }
  const mine = new Set(myOrderIds());
  const targets = Store.orders.filter((o) => mine.has(o.id) && ACTIVE_STATUSES.includes(o.status));
  await Promise.all(targets.map((o) => Store.updateOrder(o.id, { pushSub: sub }).catch(() => {})));
}

/** Keep the browser subscription and our saved copy in sync (keys can rotate). */
export async function refreshSubscription() {
  if (!('serviceWorker' in navigator) || permission() !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager?.getSubscription();
    const saved = savedSubscription();
    if (sub && JSON.stringify(sub.toJSON()) !== JSON.stringify(saved)) {
      localStorage.setItem(SUB_KEY, JSON.stringify(sub.toJSON()));
    } else if (!sub && saved) {
      localStorage.removeItem(SUB_KEY);
    }
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------
async function postPush(body) {
  const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Push failed (${res.status})`);
    err.expired = res.status === 410;
    throw err;
  }
  return data;
}

const orderUrl = (id) => `${location.pathname}#/order/${id}`;

/** Called after staff/admin change an order's status. Fire-and-forget. */
export async function pushOrderStatus(order) {
  if (!order?.pushSub) return false;
  try {
    await postPush({ subscription: order.pushSub, kind: 'status', orderId: order.id, status: order.status, pickupTime: order.pickupTime, url: orderUrl(order.id) });
    return true;
  } catch (e) {
    if (e.expired) Store.updateOrder(order.id, { pushSub: null }).catch(() => {});
    console.warn('push status', e.message);
    return false;
  }
}

export async function pushReminder(order) {
  if (!order?.pushSub) throw new Error('This customer has not enabled notifications.');
  try {
    await postPush({ subscription: order.pushSub, kind: 'reminder', orderId: order.id, status: order.status, pickupTime: order.pickupTime, url: orderUrl(order.id) });
  } catch (e) {
    if (e.expired) Store.updateOrder(order.id, { pushSub: null }).catch(() => {});
    throw e;
  }
}

/** Test from the profile page: tries a real push, falls back to a local one. */
export async function sendTestNotification() {
  const sub = savedSubscription();
  if (sub) {
    try {
      await postPush({ subscription: sub, kind: 'test', url: `${location.pathname}#/profile` });
      return 'push';
    } catch (e) {
      console.warn('test push failed, showing local', e.message);
    }
  }
  await showLocal('PICK UP N GO 🔔', 'Notifikasi berfungsi! Kami akan maklumkan bila pesanan anda siap.', `${location.pathname}#/profile`, 'png-test');
  return 'local';
}

// ---------------------------------------------------------------------------
// Local notifications
// ---------------------------------------------------------------------------
export async function showLocal(title, body, url, tag) {
  if (permission() !== 'granted') return false;
  const opts = { body, tag, renotify: true, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', data: { url }, vibrate: [120, 60, 120] };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.showNotification(title, opts); return true; }
  } catch { /* fall through */ }
  try {
    const n = new Notification(title, opts);
    n.onclick = () => { window.focus(); if (url) location.href = url; n.close(); };
    return true;
  } catch { return false; }
}

export const STATUS_TEXT = {
  'Pending Confirmation': ['Pesanan diterima 🧾', 'Pesanan anda sedang menunggu pengesahan kedai.'],
  'Order Accepted': ['Pesanan disahkan ✅', 'Kedai telah menerima pesanan anda.'],
  Preparing: ['Sedang disediakan 👨‍🍳', 'Makanan anda sedang dimasak sekarang.'],
  'Ready for Pickup': ['Sedia untuk diambil! 🎉', 'Pesanan anda sudah siap. Sila datang ke kaunter dan tunjukkan QR.'],
  Completed: ['Terima kasih! 💚', 'Pesanan telah diambil. Selamat menjamu selera!'],
  Cancelled: ['Pesanan dibatalkan', 'Pesanan anda telah dibatalkan. Hubungi kedai untuk maklumat lanjut.'],
};

let known = null; // Map orderId -> status (customer side)
let knownAll = null; // Set of all order ids (staff side)

function snapshotMine() {
  const ids = new Set(myOrderIds());
  const u = Store.user;
  const map = new Map();
  Store.orders.forEach((o) => {
    if (o.source === 'pos') return; // counter sales rung up by staff are not the staff's own orders
    if (ids.has(o.id) || o.customer?.uid === u?.id) map.set(o.id, o.status);
  });
  return map;
}

/** Watch store changes and raise local notifications for relevant events. */
export function startOrderWatcher() {
  known = snapshotMine();
  knownAll = new Set(Store.orders.map((o) => o.id));

  Store.on((topic) => {
    if (!['orders', 'sync'].includes(topic)) return;

    // Customer: status changes on my orders
    const now = snapshotMine();
    now.forEach((status, id) => {
      const prev = known.get(id);
      if (prev && prev !== status) {
        const [title, body] = STATUS_TEXT[status] || ['Status dikemas kini', status];
        const o = Store.order(id);
        const extra = o && status === 'Ready for Pickup' ? ` (${fmtTime(o.pickupTime)})` : '';
        if (document.visibilityState === 'visible') toast(`${id}: ${status}`, 'success', 4000);
        showLocal(title, `${body}${extra}\n${id}`, orderUrl(id), `${id}-${status}`);
      }
    });
    known = now;

    // Staff/admin: brand-new orders
    if (Store.isStaff()) {
      Store.orders.forEach((o) => {
        if (!knownAll.has(o.id) && o.status === 'Pending Confirmation' && o.source !== 'pos' && !myOrderIds().includes(o.id)) {
          const title = 'Pesanan baru! 🛍️';
          const body = `${o.customer.name} • ${money(o.total)}\nPickup ${fmtDate(o.pickupDate, false)} ${fmtTime(o.pickupTime)} • ${o.id}`;
          if (document.visibilityState === 'visible') toast(`Pesanan baru: ${o.id}`, 'success', 5000);
          showLocal(title, body, `${location.pathname}#/staff`, `new-${o.id}`);
        }
      });
    }
    knownAll = new Set(Store.orders.map((o) => o.id));
  });
}
