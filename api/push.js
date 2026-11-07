// ---------------------------------------------------------------------------
// PICK UP N GO — Web Push endpoint (Vercel Serverless Function)
//
//   GET  /api/push  -> { publicKey }            (VAPID public key for subscribing)
//   POST /api/push  -> sends one notification
//        { subscription, kind: 'status'|'reminder'|'test', orderId?, status?, pickupTime?, url? }
//
// The message text is built here from fixed templates, so the endpoint cannot be
// used to send arbitrary content. Only well-known browser push services are
// accepted as subscription endpoints.
//
// Required environment variables (Vercel → Project → Settings → Environment Variables):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:owner@example.com)
// Generate keys with:  npx web-push generate-vapid-keys
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

function safeUrl(url) {
  // Only same-app relative paths (no scheme / host) are allowed.
  return typeof url === 'string' && /^\/[A-Za-z0-9/_\-.#?=&]*$/.test(url) && !url.startsWith('//') ? url : '/index.html#/orders';
}

function buildPayload(body) {
  const orderId = typeof body.orderId === 'string' && /^PNG-\d{6}-[A-Z0-9]{4}$/.test(body.orderId) ? body.orderId : '';
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
  if (!body || !validSubscription(body.subscription)) {
    return res.status(400).json({ error: 'Invalid push subscription.' });
  }
  const payload = buildPayload(body);
  if (!payload) return res.status(400).json({ error: 'Invalid notification request.' });

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    await webpush.sendNotification(
      { endpoint: body.subscription.endpoint, keys: { p256dh: body.subscription.keys.p256dh, auth: body.subscription.keys.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 6, urgency: payload.requireInteraction ? 'high' : 'normal' }
    );
    return res.status(200).json({ ok: true });
  } catch (err) {
    const code = err && err.statusCode;
    if (code === 404 || code === 410) return res.status(410).json({ error: 'Subscription expired.' });
    console.error('push failed', code, err && err.body);
    return res.status(502).json({ error: 'Push service rejected the notification.' });
  }
};
