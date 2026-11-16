// ---------------------------------------------------------------------------
// PICK UP N GO — Web Push endpoint (Vercel Serverless Function)
//
//   GET  /api/push  -> { publicKey }            (VAPID public key for subscribing)
//   POST /api/push  -> sends notifications
//        { subscription, kind: 'status'|'reminder'|'test', orderId?, status?, pickupTime?, url? }
//        { kind: 'new-order', orderId }          -> alerts every staff/admin device
//
// The message text is built here from fixed templates, so the endpoint cannot be
// used to send arbitrary content. Only well-known browser push services are
// accepted as subscription endpoints.
//
// 'new-order' reads the order from Firestore itself (it never trusts the text a
// client sends), only for a recent order that is still "Pending Confirmation",
// and only ONCE per order (marked with `staffNotified: true`).
//
// Required environment variables (Vercel → Project → Settings → Environment Variables):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:owner@example.com)
//   FIREBASE_SERVICE_ACCOUNT  — only for staff new-order alerts: the whole JSON of
//                               Firebase Console → Project settings → Service accounts
//                               → Generate new private key
// Dependencies (package.json): web-push, firebase-admin
// Generate VAPID keys with:  npx web-push generate-vapid-keys
// ---------------------------------------------------------------------------
const webpush = require('web-push');

const PUSH_HOSTS = [
  /(^|\.)fcm\.googleapis\.com$/,
  /(^|\.)android\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

const STATUSES = ['Pending Confirmation', 'Order Accepted', 'Preparing', 'Ready for Pickup', 'Completed', 'Cancelled'];
const ORDER_ID = /^PNG-\d{6}-[A-Z0-9]{4}$/;

const STATUS_TEXT = {
  'Pending Confirmation': ['Pesanan diterima 🧾', 'Pesanan anda sedang menunggu pengesahan kedai.'],
  'Order Accepted': ['Pesanan disahkan ✅', 'Kedai telah menerima pesanan anda.'],
  Preparing: ['Sedang disediakan 👨‍🍳', 'Makanan anda sedang dimasak sekarang.'],
  'Ready for Pickup': ['Sedia untuk diambil! 🎉', 'Pesanan anda sudah siap. Sila datang ke kaunter dan tunjukkan QR.'],
  Completed: ['Terima kasih! 💚', 'Pesanan telah diambil. Selamat menjamu selera!'],
  Cancelled: ['Pesanan dibatalkan', 'Pesanan anda telah dibatalkan. Hubungi kedai untuk maklumat lanjut.'],
};

function fmtTime(t) {
  if (!/^\d{2}:\d{2}$/.test(t || '')) return '';
  let [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}

function fmtDay(d) {
  // 'YYYY-MM-DD' -> 'Today' (Malaysia time) or 'DD/MM'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return '';
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  if (d === today) return 'Today';
  const [, mm, dd] = d.split('-');
  return `${dd}/${mm}`;
}

function validSubscription(sub) {
  if (!sub || typeof sub !== 'object' || typeof sub.endpoint !== 'string') return false;
  if (!sub.keys || typeof sub.keys.p256dh !== 'string' || typeof sub.keys.auth !== 'string') return false;
  try {
    const u = new URL(sub.endpoint);
    return u.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

function safeUrl(url, fallback = '/index.html#/orders') {
  // Only same-app relative paths (no scheme / host) are allowed.
  return typeof url === 'string' && /^\/[A-Za-z0-9/_\-.#?=&]*$/.test(url) && !url.startsWith('//') ? url : fallback;
}

function buildPayload(body) {
  const orderId = typeof body.orderId === 'string' && ORDER_ID.test(body.orderId) ? body.orderId : '';
  const url = safeUrl(body.url);
  if (body.kind === 'test') {
    return { title: 'PICK UP N GO 🔔', body: 'Notifikasi push berfungsi! Kami akan maklumkan bila pesanan anda siap.', tag: 'png-test', url };
  }
  if (!orderId) return null;
  if (body.kind === 'reminder') {
    const t = fmtTime(body.pickupTime);
    return { title: 'Peringatan pickup ⏰', body: `Jangan lupa ambil pesanan ${orderId}${t ? ` pada ${t}` : ''}. Tunjukkan QR di kaunter.`, tag: `${orderId}-reminder`, url, requireInteraction: true };
  }
  if (body.kind === 'status' && STATUSES.includes(body.status)) {
    const [title, text] = STATUS_TEXT[body.status];
    return { title, body: `${text}\n${orderId}`, tag: `${orderId}-${body.status}`, url, requireInteraction: body.status === 'Ready for Pickup' };
  }
  return null;
}

async function send(subscription, payload) {
  await webpush.sendNotification(
    { endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } },
    JSON.stringify(payload),
    { TTL: 60 * 60 * 6, urgency: payload.requireInteraction ? 'high' : 'normal' }
  );
}

// ---------------------------------------------------------------------------
// Firebase Admin (loaded only for staff new-order alerts, so customer pushes
// keep working even if it isn't set up yet)
// ---------------------------------------------------------------------------
let firebase = null;
function getFirebase() {
  if (firebase) return firebase;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw Object.assign(new Error('Staff alerts are not configured (FIREBASE_SERVICE_ACCOUNT missing).'), { status: 503 });
  let admin;
  try {
    admin = require('firebase-admin');
  } catch {
    throw Object.assign(new Error('Staff alerts are not configured (firebase-admin not installed).'), { status: 503 });
  }
  const cred = JSON.parse(raw);
  if (typeof cred.private_key === 'string') cred.private_key = cred.private_key.replace(/\\n/g, '\n');
  const app = admin.apps.length ? admin.app() : admin.initializeApp({ credential: admin.credential.cert(cred) });
  firebase = { admin, db: app.firestore() };
  return firebase;
}

async function notifyStaff(orderId, url) {
  const { admin, db } = getFirebase();
  const ref = db.collection('orders').doc(orderId);

  // Claim the order once, so repeated calls can't spam staff phones.
  const order = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const o = snap.data();
    if (o.staffNotified || o.source === 'pos' || o.status !== 'Pending Confirmation') return null;
    if (Date.now() - (Number(o.createdAt) || 0) > 15 * 60 * 1000) return null;
    tx.update(ref, { staffNotified: true });
    return o;
  });
  if (!order) return { sent: 0, skipped: true };

  const name = String(order.customer?.name || 'Customer').slice(0, 40);
  const total = `RM ${(Number(order.total) || 0).toFixed(2)}`;
  const table = order.table ? String(order.table).slice(0, 10) : '';
  const when = table ? 'Dine-in' : `Pickup ${[fmtDay(order.pickupDate), fmtTime(order.pickupTime)].filter(Boolean).join(' ')}`;
  const payload = {
    title: table ? `Table ${table} order! 🍽️` : 'New order! 🛍️',
    body: `${name} • ${total}\n${when} • ${orderId}`,
    tag: `new-${orderId}`,
    url: safeUrl(url, '/index.html#/staff'),
    requireInteraction: true,
  };

  const users = await db.collection('users').where('role', 'in', ['staff', 'admin']).get();
  const targets = new Map(); // endpoint -> { uid, sub }  (one push per device)
  users.forEach((d) => {
    const sub = d.get('pushSub');
    if (validSubscription(sub)) targets.set(sub.endpoint, { uid: d.id, sub });
  });

  let sent = 0;
  await Promise.all([...targets.values()].map(async ({ uid, sub }) => {
    try {
      await send(sub, payload);
      sent++;
    } catch (err) {
      const code = err && err.statusCode;
      if (code === 404 || code === 410) {
        // Device unsubscribed / app removed — forget it.
        await db.collection('users').doc(uid).update({ pushSub: admin.firestore.FieldValue.delete() }).catch(() => {});
      } else {
        console.error('staff push failed', code, err && err.body);
      }
    }
  }));
  return { sent, devices: targets.size };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@pickupngo.my';

  if (req.method === 'GET') {
    return res.status(publicKey ? 200 : 503).json({ publicKey: publicKey || null });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!publicKey || !privateKey) {
    return res.status(503).json({ error: 'Push is not configured on the server.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body) return res.status(400).json({ error: 'Invalid request.' });
  webpush.setVapidDetails(subject, publicKey, privateKey);

  // Staff/admin: a customer just placed an order.
  if (body.kind === 'new-order') {
    if (typeof body.orderId !== 'string' || !ORDER_ID.test(body.orderId)) {
      return res.status(400).json({ error: 'Invalid order id.' });
    }
    try {
      const result = await notifyStaff(body.orderId, body.url);
      return res.status(200).json({ ok: true, ...result });
    } catch (err) {
      console.error('new-order push failed', err && err.message);
      return res.status(err.status || 500).json({ error: err.status ? err.message : 'Could not alert staff.' });
    }
  }

  // Customer: status / reminder / test
  if (!validSubscription(body.subscription)) {
    return res.status(400).json({ error: 'Invalid push subscription.' });
  }
  const payload = buildPayload(body);
  if (!payload) return res.status(400).json({ error: 'Invalid notification request.' });

  try {
    await send(body.subscription, payload);
    return res.status(200).json({ ok: true });
  } catch (err) {
    const code = err && err.statusCode;
    if (code === 404 || code === 410) return res.status(410).json({ error: 'Subscription expired.' });
    console.error('push failed', code, err && err.body);
    return res.status(502).json({ error: 'Push service rejected the notification.' });
  }
};
