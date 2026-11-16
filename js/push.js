// ---------------------------------------------------------------------------
// Notifications
//
// 1. Web Push (real push, works when the app is closed):
//    - The browser subscribes with the VAPID public key served by /api/push.
//    - The subscription is saved on the user's profile (users/{uid}.pushSub)
//      and, for customers, on each order they place (`order.pushSub`).
//    - Customers: when staff/admin change an order's status, the app calls
//      POST /api/push, which sends the notification to the customer.
//    - Staff/admin: when a customer places an order, the customer's app calls
//      POST /api/push { kind: 'new-order', orderId }. The server looks the order
//      up in Firestore and pushes a "New order" alert to every staff/admin
//      device that turned alerts on — even if their app is closed.
//
// 2. Local notifications (while the app is open, incl. background tabs):
//    - Changes to the customer's orders, and new incoming orders for staff,
//      are shown with ServiceWorkerRegistration.showNotification(). Staff also
//      hear a short chime.
//    - Notifications use a tag (`<orderId>-<status>` / `new-<orderId>`) so a
//      push and a local notification for the same event replace each other
//      instead of doubling.
// ---------------------------------------------------------------------------
import { Store, ACTIVE_STATUSES } from './store.js';
import { toast } from './ui.js';
import { money, fmtTime, fmtDate } from './utils.js';

const API = '/api/push';
const SUB_KEY = 'png_push_sub';
const MY_ORDERS_KEY = 'png_my_orders';
const STAFF_SUB_KEY = 'png_push_staff'; // "<uid>|<endpoint>" last saved to a staff profile

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
    // Called right after the order is saved — let the shop know.
    notifyStaffNewOrder(id);
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
  unlockSound();

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
  localStorage.removeItem(STAFF_SUB_KEY);
  await attachSubscription(null);
  window.dispatchEvent(new CustomEvent('notify:change'));
}

/** Save the subscription to the profile and to this device's active orders. */
async function attachSubscription(sub) {
  try {
    await Store.saveProfile({ pushSub: sub });
    if (Store.isStaff() && sub) localStorage.setItem(STAFF_SUB_KEY, `${Store.user.id}|${sub.endpoint}`);
  } catch { /* offline etc. */ }
  const mine = new Set(myOrderIds());
  const targets = Store.orders.filter((o) => mine.has(o.id) && ACTIVE_STATUSES.includes(o.status));
  await Promise.all(targets.map((o) => Store.updateOrder(o.id, { pushSub: sub }).catch(() => {})));
}

/**
 * Keep the browser subscription and our saved copy in sync (keys can rotate).
 * For staff/admin, also make sure the server knows this device, so new-order
 * pushes reach it (e.g. after logging in on a device that already allowed alerts).
 */
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
    if (sub && Store.isStaff()) {
      const key = `${Store.user.id}|${sub.endpoint}`;
      if (localStorage.getItem(STAFF_SUB_KEY) !== key) {
        await Store.saveProfile({ pushSub: sub.toJSON() });
        localStorage.setItem(STAFF_SUB_KEY, key);
      }
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

/**
 * Called on the customer's device right after an order is placed: asks the
 * server to alert every staff/admin device. The server reads the order from
 * Firestore itself and only alerts once per order. Fire-and-forget.
 */
export async function notifyStaffNewOrder(orderId) {
  if (Store.mode !== 'firebase') return false; // demo mode: staff tabs get local alerts
  try {
    await postPush({ kind: 'new-order', orderId, url: `${location.pathname}#/staff` });
    return true;
  } catch (e) {
    console.warn('staff new-order push', e.message);
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
export async function showLocal(title, body, url, tag, extra = {}) {
  if (permission() !== 'granted') return false;
  const opts = { body, tag, renotify: true, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', data: { url }, vibrate: [120, 60, 120], ...extra };
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

// ---------------------------------------------------------------------------
// New-order chime for staff (Web Audio, no sound file needed). Browsers only
// allow audio after the user has tapped the page once, so we unlock on the
// first tap.
// ---------------------------------------------------------------------------
let audioCtx = null;
function unlockSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx ||= new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* ignore */ }
}
function chime() {
  try {
    unlockSound();
    if (!audioCtx || audioCtx.state !== 'running') return;
    const t0 = audioCtx.currentTime;
    [[880, 0], [1320, 0.18], [1760, 0.36]].forEach(([freq, at]) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.22, t0 + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.4);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + 0.45);
    });
  } catch { /* ignore */ }
}

export const STATUS_TEXT = {
  'Pending Confirmation': ['Pesanan diterima 🧾', 'Pesanan anda sedang menunggu pengesahan kedai.'],
  'Order Accepted': ['Pesanan disahkan ✅', 'Kedai telah menerima pesanan anda.'],
  Preparing: ['Sedang disediakan 👨‍🍳', 'Pesanan anda sedang disediakan sekarang.'],
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
  document.addEventListener('pointerdown', unlockSound, { once: true, capture: true });

  Store.on((topic) => {
    // Staff just logged in: register this device for new-order pushes.
    if (topic === 'auth') {
      refreshSubscription();
      knownAll = null; // the staff order list loads next — take a fresh snapshot, don't alert for old orders
      return;
    }
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
    if (knownAll && Store.isStaff()) {
      let fresh = 0;
      Store.orders.forEach((o) => {
        const recent = Date.now() - (o.createdAt || 0) < 10 * 60 * 1000; // skip old orders that just synced in
        if (!knownAll.has(o.id) && recent && o.status === 'Pending Confirmation' && o.source !== 'pos' && !myOrderIds().includes(o.id)) {
          fresh++;
          const title = o.table ? `Table ${o.table} order! 🍽️` : 'New order! 🛍️';
          const body = o.table
            ? `🍽️ TABLE ${o.table} • ${o.customer.name} • ${money(o.total)}\n${o.id}`
            : `${o.customer.name} • ${money(o.total)}\nPickup ${fmtDate(o.pickupDate, false)} ${fmtTime(o.pickupTime)} • ${o.id}`;
          if (document.visibilityState === 'visible') toast(`New order: ${o.id}`, 'success', 5000);
          showLocal(title, body, `${location.pathname}#/staff`, `new-${o.id}`, { requireInteraction: true, vibrate: [200, 100, 200, 100, 200] });
        }
      });
      if (fresh) chime();
    }
    knownAll = new Set(Store.orders.map((o) => o.id));
  });
}
