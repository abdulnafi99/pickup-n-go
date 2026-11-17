// ---------------------------------------------------------------------------
// PICK UP N GO → Selagi Coffee loyalty (Vercel Serverless Function)
//
//   POST /api/loyalty  { orderId }
//
// When staff mark an order "Completed", the staff app calls this endpoint. The
// server (never the browser) then:
//   1. reads the order from PICK UP N GO's Firestore and checks it really is
//      Completed, not a POS sale, and has a Malaysian mobile number;
//   2. claims the order once in the loyalty database (pickupngo/awards/<id>),
//      so the same order can never earn twice;
//   3. adds 1 stamp (cap) + 10 points to customers/<phone> in the loyalty
//      Realtime Database — exactly like the staff-PIN "add stamp" button in the
//      loyalty app: points expiry kept/renewed for 1 year, 5th/10th stamp
//      creates a stampClaims reward, a full card resets to 0 and starts a new
//      cycle. Expired points are reset to 0 first (as the loyalty app does);
//   4. if the number isn't a member yet, registers them (name from the order,
//      1 stamp, 10 points — same as signing up in the loyalty app). They can log
//      in to the loyalty app later with that phone number and set a password;
//   5. logs the award under customers/<phone>/pickupngoHistory/<orderId>.
//
// Environment variables (Vercel → Settings → Environment Variables):
//   FIREBASE_SERVICE_ACCOUNT   PICK UP N GO project key (already used by /api/push)
//   LOYALTY_SERVICE_ACCOUNT    loyalty project ("upgradeui") key — whole JSON
//   LOYALTY_DB_URL             optional, defaults to the upgradeui database
// ---------------------------------------------------------------------------
const POINTS_PER_ORDER = 10;
const ORDER_ID = /^PNG-\d{6}-[A-Z0-9]{4}$/;
const DEFAULT_DB_URL = 'https://upgradeui-default-rtdb.firebaseio.com';
const MILESTONES = { 5: 'Diskaun RM3', 10: '1 Kopi Percuma' };

let apps = null;
function getApps() {
  if (apps) return apps;
  let admin;
  try {
    admin = require('firebase-admin');
  } catch {
    throw Object.assign(new Error('firebase-admin is not installed.'), { status: 503 });
  }
  const parse = (name) => {
    const raw = process.env[name] || process.env[`${name}2`]; // accept e.g. FIREBASE_SERVICE_ACCOUNT2 too
    if (!raw) throw Object.assign(new Error(`Loyalty is not configured (${name} missing).`), { status: 503 });
    const cred = JSON.parse(raw);
    if (typeof cred.private_key === 'string') cred.private_key = cred.private_key.replace(/\\n/g, '\n');
    return cred;
  };
  const shop = admin.apps.find((a) => a.name === '[DEFAULT]')
    || admin.initializeApp({ credential: admin.credential.cert(parse('FIREBASE_SERVICE_ACCOUNT')) });
  const loyalty = admin.apps.find((a) => a.name === 'loyalty')
    || admin.initializeApp({
      credential: admin.credential.cert(parse('LOYALTY_SERVICE_ACCOUNT')),
      databaseURL: process.env.LOYALTY_DB_URL || DEFAULT_DB_URL,
    }, 'loyalty');
  apps = { admin, firestore: shop.firestore(), rtdb: loyalty.database() };
  return apps;
}

/** '012-345 6789' / '+60123456789' / '60123456789' → '0123456789' (the loyalty app's key format). */
function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('60')) d = '0' + d.slice(2);
  return /^01\d{8,9}$/.test(d) ? d : '';
}

function expiryFrom(existing) {
  // Same rule as the loyalty app's getExpiryDateString(): keep a future expiry, else +1 year.
  if (existing && new Date(existing) > new Date()) return existing;
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}

async function award(orderId) {
  const { admin, firestore, rtdb } = getApps();
  const orderRef = firestore.collection('orders').doc(orderId);
  const snap = await orderRef.get();
  if (!snap.exists) return { ok: false, reason: 'order-not-found' };
  const order = snap.data();
  if (order.status !== 'Completed') return { ok: false, reason: 'not-completed' };
  if (order.source === 'pos') return { ok: false, reason: 'pos-order' };
  if (order.loyalty?.awarded) return { ok: true, already: true, phone: order.loyalty.phone, points: order.loyalty.points };

  const phone = normalizePhone(order.customer?.phone);
  if (!phone) {
    await orderRef.update({ loyalty: { awarded: false, reason: 'no-valid-phone' } }).catch(() => {});
    return { ok: false, reason: 'no-valid-phone' };
  }

  // 1) Claim this order once in the loyalty DB.
  const nowIso = new Date().toISOString();
  const claimRef = rtdb.ref(`pickupngo/awards/${orderId}`);
  const claim = await claimRef.transaction((cur) => (cur ? undefined : { phone, at: nowIso, total: Number(order.total) || 0 }));
  if (!claim.committed) return { ok: true, already: true, phone };

  try {
    // 2) Add the stamp + points (or register a new member).
    const custRef = rtdb.ref(`customers/${phone}`);
    let created = false;
    let newClaims = [];
    let result = null;
    const tx = await custRef.transaction((cur) => {
      newClaims = [];
      if (!cur) {
        created = true;
        result = { stamps: 1, points: POINTS_PER_ORDER };
        return {
          name: String(order.customer?.name || 'Pelanggan').slice(0, 60),
          birthdate: '',
          phone,
          stamps: 1,
          points: POINTS_PER_ORDER,
          pointsExpiry: expiryFrom(null),
          createdAt: nowIso,
          source: 'pickupngo',
        };
      }
      created = false;
      const expired = cur.pointsExpiry && new Date() > new Date(cur.pointsExpiry);
      let stamps = Number(cur.stamps) || 0;
      let cycle = Number(cur.cardCycle) || 0;
      let points = expired ? 0 : Number(cur.points) || 0;
      if (stamps >= 10) { // card was already full: make sure its reward exists, start a new card
        newClaims.push({ cycle, milestone: 10 });
        stamps = 0;
        cycle += 1;
      }
      stamps += 1;
      points += POINTS_PER_ORDER;
      if (stamps === 5 || stamps === 10) newClaims.push({ cycle, milestone: stamps });
      const shownStamp = stamps;
      if (stamps >= 10) { stamps = 0; cycle += 1; }
      result = { stamps: shownStamp, points };
      return { ...cur, stamps, cardCycle: cycle, points, pointsExpiry: expiryFrom(expired ? null : cur.pointsExpiry) };
    });
    if (!tx.committed) throw new Error('Loyalty update was not saved.');

    // 3) 5th / 10th stamp rewards — same deterministic keys as the loyalty app.
    for (const c of newClaims) {
      const ref = rtdb.ref(`customers/${phone}/stampClaims/c${c.cycle}_m${c.milestone}`);
      await ref.transaction((cur) => (cur ? undefined : {
        milestone: c.milestone, cycle: c.cycle, reward: MILESTONES[c.milestone], status: 'pending', createdAt: nowIso,
      }));
    }

    // 4) Log it (loyalty DB) and mark the order (shop DB).
    await rtdb.ref(`customers/${phone}/pickupngoHistory/${orderId}`).set({
      orderId, points: POINTS_PER_ORDER, stamp: result.stamps, total: Number(order.total) || 0, at: nowIso,
    });
    await orderRef.update({
      loyalty: { awarded: true, phone, points: POINTS_PER_ORDER, stamp: result.stamps, newMember: created, at: Date.now() },
    });
    void admin;
    return { ok: true, phone, points: POINTS_PER_ORDER, balance: result.points, stamp: result.stamps, newMember: created, rewards: newClaims.map((c) => MILESTONES[c.milestone]) };
  } catch (err) {
    await claimRef.remove().catch(() => {}); // let staff retry
    throw err;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const orderId = body && typeof body.orderId === 'string' ? body.orderId : '';
  if (!ORDER_ID.test(orderId)) return res.status(400).json({ error: 'Invalid order id.' });
  try {
    const result = await award(orderId);
    return res.status(200).json(result);
  } catch (err) {
    console.error('loyalty award failed', err && err.message);
    return res.status(err.status || 500).json({ error: err.status ? err.message : 'Could not add loyalty points.' });
  }
};
