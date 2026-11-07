// ---------------------------------------------------------------------------
// Data layer. One API, two backends:
//   • LocalBackend    — LocalStorage (demo mode, live cross-tab sync)
//   • FirebaseBackend — Firebase Auth + Firestore + Storage
// Views only talk to `Store`, never to a backend directly.
// ---------------------------------------------------------------------------
import { FIREBASE_CONFIG, FIREBASE_SDK_VERSION } from './config.js';
import { SAMPLE_MENU, DEFAULT_SETTINGS, DEMO_USERS } from './sample-data.js';
import { uid, todayStr, addDays, orderId, loadScript, dataUrlToBlob } from './utils.js';

export const ORDER_STATUSES = [
  'Pending Confirmation',
  'Order Accepted',
  'Preparing',
  'Ready for Pickup',
  'Completed',
  'Cancelled',
];
export const ACTIVE_STATUSES = ORDER_STATUSES.slice(0, 4);
export const PAYMENT_STATUSES = ['Pending', 'Verified', 'Rejected'];

const listeners = new Set();
function emit(topic) {
  listeners.forEach((fn) => {
    try { fn(topic); } catch (e) { console.error(e); }
  });
}

const PROFILE_KEY = 'png_profile';
const GUEST_KEY = 'png_guest_id';

function readJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    throw new Error(
      e && e.name === 'QuotaExceededError'
        ? 'Device storage is full. Try a smaller image or clear old demo data.'
        : 'Could not save data on this device.'
    );
  }
}

const mergeSettings = (s) => ({
  ...DEFAULT_SETTINGS,
  ...(s || {}),
  businessHours: { ...DEFAULT_SETTINGS.businessHours, ...(s?.businessHours || {}) },
  payments: { ...DEFAULT_SETTINGS.payments, ...(s?.payments || {}) },
});

// ---------------------------------------------------------------------------
// Demo seed orders so the admin dashboard has something to show.
// ---------------------------------------------------------------------------
function seedOrders(menu) {
  const names = [
    ['Aisyah Rahman', '0123456701'], ['Daniel Lim', '0167788990'], ['Siti Nurhaliza', '0139988776'],
    ['Ravi Kumar', '0172233445'], ['Farah Aziz', '0145566778'], ['Hafiz Ismail', '0191122334'],
    ['Mei Ling', '0118899001'], ['Amirul Hakim', '0126677889'],
  ];
  const slots = ['09:30', '10:00', '11:00', '11:30', '12:00', '12:30', '13:00', '14:00', '15:30', '16:00'];
  const orders = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const avail = menu.filter((m) => m.available);

  for (let day = -6; day <= 1; day++) {
    const date = addDays(todayStr(), day);
    const n = day === 0 ? 7 : day === 1 ? 3 : 3 + Math.floor(rand() * 5);
    for (let i = 0; i < n; i++) {
      const [name, phone] = pick(names);
      const items = [];
      const count = 1 + Math.floor(rand() * 3);
      for (let k = 0; k < count; k++) {
        const m = pick(avail);
        const qty = 1 + Math.floor(rand() * 2);
        const variant = {};
        (m.variants || []).forEach((g) => (variant[g.name] = g.options[0].label));
        items.push({ menuId: m.id, name: m.name, art: m.art, unitPrice: m.price, qty, variant, note: '' });
      }
      const subtotal = items.reduce((s, it) => s + it.unitPrice * it.qty, 0);
      let status = 'Completed';
      if (day === 0) status = ['Pending Confirmation', 'Order Accepted', 'Preparing', 'Ready for Pickup', 'Completed', 'Preparing', 'Pending Confirmation'][i];
      if (day === 1) status = 'Order Accepted';
      if (day < 0 && rand() < 0.08) status = 'Cancelled';
      const method = rand() < 0.5 ? 'cash' : 'duitnow';
      const paid = status === 'Completed' || (method === 'duitnow' && status !== 'Pending Confirmation');
      const created = Math.min(new Date(date + 'T08:00:00').getTime() - 3600 * 1000 * (2 + rand() * 10), Date.now() - 60000 * (5 + i * 7));
      const time = slots[(i * 3 + day + 20) % slots.length];
      orders.push({
        id: orderId(new Date(created)),
        createdAt: created,
        updatedAt: created,
        customer: { uid: 'seed_' + phone, name, phone, email: '' },
        items,
        specialRequest: rand() < 0.2 ? 'Please pack sambal separately' : '',
        subtotal: +subtotal.toFixed(2),
        discount: 0,
        promoCode: '',
        total: +subtotal.toFixed(2),
        pickupDate: date,
        pickupTime: time,
        location: 'main',
        orderType: 'scheduled',
        payment: { method, status: paid ? 'Verified' : 'Pending', receipt: '' },
        status,
        history: [{ status: 'Pending Confirmation', at: created }],
      });
    }
  }
  return orders.sort((a, b) => b.createdAt - a.createdAt);
}

// ---------------------------------------------------------------------------
// LocalStorage backend (demo mode)
// ---------------------------------------------------------------------------
const DB_KEY = 'png_db_v1';
const SESSION_KEY = 'png_session';

class LocalBackend {
  constructor() {
    this.mode = 'demo';
  }

  async init(state) {
    this.state = state;
    this.load();
    window.addEventListener('storage', (e) => {
      if (e.key === DB_KEY || e.key === SESSION_KEY || e.key === PROFILE_KEY) {
        this.load();
        emit('sync');
      }
    });
  }

  load() {
    let db = readJSON(DB_KEY, null);
    if (!db || !Array.isArray(db.menu)) {
      db = { menu: SAMPLE_MENU, orders: seedOrders(SAMPLE_MENU), settings: DEFAULT_SETTINGS, users: DEMO_USERS };
      writeJSON(DB_KEY, db);
    }
    this.db = db;
    this.state.menu = db.menu;
    this.state.orders = db.orders;
    this.state.settings = mergeSettings(db.settings);
    this.state.user = this.resolveUser();
  }

  persist() {
    writeJSON(DB_KEY, this.db);
  }

  resolveUser() {
    const session = readJSON(SESSION_KEY, null);
    if (session) {
      const u = this.db.users.find((x) => x.id === session.id);
      if (u) {
        const { password, ...safe } = u;
        void password;
        return { ...safe, favourites: readJSON(PROFILE_KEY, {}).favourites || [] };
      }
    }
    let gid = localStorage.getItem(GUEST_KEY);
    if (!gid) {
      gid = uid('guest_');
      localStorage.setItem(GUEST_KEY, gid);
    }
    const p = readJSON(PROFILE_KEY, {});
    return { id: gid, role: 'customer', name: p.name || '', phone: p.phone || '', email: p.email || '', favourites: p.favourites || [], guest: true };
  }

  async login(email, password) {
    const u = this.db.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase() && x.password === password);
    if (!u) throw new Error('Incorrect email or password.');
    writeJSON(SESSION_KEY, { id: u.id });
    this.state.user = this.resolveUser();
  }

  async logout() {
    localStorage.removeItem(SESSION_KEY);
    this.state.user = this.resolveUser();
  }

  async saveProfile(patch) {
    const p = { ...readJSON(PROFILE_KEY, {}), ...patch };
    writeJSON(PROFILE_KEY, p);
    this.state.user = this.resolveUser();
  }

  async saveMenuItem(item) {
    const i = this.db.menu.findIndex((m) => m.id === item.id);
    if (i >= 0) this.db.menu[i] = item;
    else this.db.menu.unshift(item);
    this.persist();
  }

  async deleteMenuItem(id) {
    this.db.menu = this.db.menu.filter((m) => m.id !== id);
    this.state.menu = this.db.menu;
    this.persist();
  }

  async createOrder(order, check) {
    // Re-read the latest data to avoid two tabs over-booking a slot.
    this.load();
    check();
    this.db.orders.unshift(order);
    this.state.orders = this.db.orders;
    this.persist();
    return order;
  }

  async updateOrder(id, patch) {
    const i = this.db.orders.findIndex((o) => o.id === id);
    if (i < 0) throw new Error('Order not found.');
    this.db.orders[i] = { ...this.db.orders[i], ...patch, updatedAt: Date.now() };
    this.persist();
    return this.db.orders[i];
  }

  async saveSettings(settings) {
    this.db.settings = settings;
    this.state.settings = mergeSettings(settings);
    this.persist();
  }

  async uploadImage(dataUrl) {
    return dataUrl; // stored inline (already compressed)
  }

  slotCount(date, time) {
    return this.state.orders.filter((o) => o.pickupDate === date && o.pickupTime === time && o.status !== 'Cancelled').length;
  }

  async resetDemo() {
    localStorage.removeItem(DB_KEY);
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('png_cart');
    this.load();
  }

  async seedMenu() {}
}

function withTimeout(promise, ms, code) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, reject) => { t = setTimeout(() => reject(Object.assign(new Error(code), { code })), ms); }),
  ]).finally(() => clearTimeout(t));
}

/** Fast check that Firestore exists, is enabled and has our rules deployed. */
async function probeFirestore(config) {
  if (!navigator.onLine) return;
  const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/settings/main?key=${config.apiKey}`;
  let res;
  try {
    res = await withTimeout(fetch(url, { cache: 'no-store' }), 6000, 'probe-timeout');
  } catch {
    return; // offline / flaky network: let the SDK and its cache handle it
  }
  if (res.ok) return;
  const body = await res.json().catch(() => ({}));
  const msg = body?.error?.message || '';
  if (res.status === 404 && !/does not exist|database/i.test(msg)) return; // settings doc not created yet — fine
  let text = `Firestore error ${res.status}: ${msg}`;
  if (/has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) text = 'Cloud Firestore belum diaktifkan. Firebase Console → Firestore Database → Create database.';
  else if (res.status === 404) text = 'Pangkalan data Firestore (default) belum dicipta. Firebase Console → Firestore Database → Create database.';
  else if (res.status === 403) text = 'Firestore menolak akses — security rules app ini belum dipasang. Firebase Console → Firestore → Rules → tampal kandungan firestore.rules → Publish.';
  throw Object.assign(new Error(text), { code: `firestore/${res.status}` });
}

/** Turn Firebase setup errors into actionable messages for the shop owner. */
function friendlyFirebaseError(e, stage) {
  const code = String(e?.code || '');
  const msg = String(e?.message || '');
  let text;
  if (code === 'auth/configuration-not-found' || msg.includes('CONFIGURATION_NOT_FOUND')) {
    text = 'Firebase Authentication belum disediakan. Buka Firebase Console → Authentication → Get started, kemudian aktifkan Anonymous dan Email/Password.';
  } else if (code === 'auth/admin-restricted-operation' || code === 'auth/operation-not-allowed') {
    text = 'Log masuk Anonymous belum diaktifkan. Firebase Console → Authentication → Sign-in method → Anonymous → Enable.';
  } else if (code === 'auth/unauthorized-domain') {
    text = 'Domain ini belum dibenarkan. Firebase Console → Authentication → Settings → Authorized domains → tambah domain app.';
  } else if (stage === 'firestore' && (code === 'permission-denied' || /has not been used|disabled|not found|NOT_FOUND/i.test(msg))) {
    text = /permission/i.test(code) && !/disabled|not been used/i.test(msg)
      ? 'Firestore menolak akses. Deploy firestore.rules dari repo ini (Firebase Console → Firestore → Rules).'
      : 'Cloud Firestore belum diaktifkan. Firebase Console → Firestore Database → Create database.';
  } else if (/timeout/.test(code) || code === 'unavailable') {
    text = stage === 'firestore'
      ? 'Tidak dapat menghubungi Cloud Firestore (belum diaktifkan atau tiada internet).'
      : 'Tidak dapat log masuk ke Firebase (tiada internet atau Authentication belum diaktifkan).';
  } else {
    text = `Firebase error: ${code || msg}`;
  }
  const err = new Error(text);
  err.code = code;
  err.cause = e;
  return err;
}

// ---------------------------------------------------------------------------
// Firebase backend (Auth + Firestore + Storage, compat SDK, loaded on demand)
// ---------------------------------------------------------------------------
class FirebaseBackend {
  constructor(config) {
    this.mode = 'firebase';
    this.config = config;
    this.unsubs = [];
    this.slotCounts = {};
  }

  async init(state) {
    this.state = state;
    // Firebase compat SDK v${FIREBASE_SDK_VERSION}, bundled locally (Apache-2.0) so the app
    // works offline and doesn't depend on a third-party CDN.
    const base = 'js/vendor/firebase';
    void FIREBASE_SDK_VERSION;
    await loadScript(`${base}/firebase-app-compat.js`);
    await Promise.all([
      loadScript(`${base}/firebase-auth-compat.js`),
      loadScript(`${base}/firebase-firestore-compat.js`),
      loadScript(`${base}/firebase-storage-compat.js`),
    ]);
    const fb = window.firebase;
    if (!fb.apps.length) fb.initializeApp(this.config);
    this.fb = fb;
    this.auth = fb.auth();
    this.db = fb.firestore();
    this.storage = fb.storage();

    // Local development against the Firebase Emulator Suite:
    //   localStorage.setItem('png_emulator', '1') on http://localhost, then reload.
    //   Start emulators with: firebase emulators:start --only auth,firestore
    this.emulator = ['localhost', '127.0.0.1'].includes(location.hostname) && localStorage.getItem('png_emulator') === '1';
    if (this.emulator) {
      this.auth.useEmulator('http://127.0.0.1:9099', { disableWarnings: true });
      this.db.useEmulator('127.0.0.1', 8085);
      this.storage.useEmulator('127.0.0.1', 9199);
    }
    try {
      await this.db.enablePersistence({ synchronizeTabs: true });
    } catch { /* offline persistence unavailable — fine */ }

    // 1) Is Cloud Firestore ready? Quick REST probe of the public settings doc.
    //    Network failures are ignored (offline launch uses the Firestore cache).
    if (!this.emulator) await probeFirestore(this.config);

    // 2) Sign in (anonymous for customers) and load the profile
    await withTimeout(new Promise((resolve, reject) => {
      let first = true;
      this.auth.onAuthStateChanged(async (u) => {
        if (this.dead) return; // init failed and the app fell back to demo mode
        try {
          if (!u) {
            await this.auth.signInAnonymously();
            return;
          }
          await this.loadUser(u);
          this.subscribe();
          if (first) { first = false; resolve(); } else emit('auth');
        } catch (e) {
          if (first) reject(friendlyFirebaseError(e, 'auth'));
          else console.error(e);
        }
      });
    }), 15000, 'auth-timeout');
  }

  async loadUser(u) {
    const ref = this.db.collection('users').doc(u.uid);
    const snap = await ref.get();
    let data = snap.exists ? snap.data() : null;
    if (!data) {
      data = { name: '', phone: '', email: u.email || '', role: 'customer', favourites: [], createdAt: Date.now() };
      await ref.set(data);
    }
    const local = readJSON(PROFILE_KEY, {});
    this.state.user = {
      id: u.uid,
      role: data.role || 'customer',
      name: data.name || local.name || '',
      phone: data.phone || local.phone || '',
      email: data.email || u.email || '',
      favourites: data.favourites || [],
      guest: u.isAnonymous,
    };
  }

  subscribe() {
    this.unsubs.forEach((fn) => fn());
    this.unsubs = [];
    const staff = ['staff', 'admin'].includes(this.state.user.role);

    this.unsubs.push(
      this.db.collection('menu').onSnapshot((s) => {
        this.state.menu = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        emit('menu');
      }, (e) => console.error('menu', e))
    );
    this.unsubs.push(
      this.db.collection('settings').doc('main').onSnapshot((d) => {
        this.state.settings = mergeSettings(d.exists ? d.data() : null);
        emit('settings');
      }, (e) => console.error('settings', e))
    );
    const ordersQuery = staff
      ? this.db.collection('orders').orderBy('createdAt', 'desc').limit(1000)
      : this.db.collection('orders').where('customer.uid', '==', this.state.user.id);
    this.unsubs.push(
      ordersQuery.onSnapshot((s) => {
        this.state.orders = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.createdAt - a.createdAt);
        emit('orders');
      }, (e) => console.error('orders', e))
    );
    const FieldPath = this.fb.firestore.FieldPath;
    this.unsubs.push(
      this.db.collection('slotCounts').where(FieldPath.documentId(), '>=', todayStr()).onSnapshot((s) => {
        this.slotCounts = {};
        s.docs.forEach((d) => (this.slotCounts[d.id] = d.data()));
        emit('slots');
      }, (e) => console.error('slots', e))
    );
  }

  async login(email, password) {
    try {
      await this.auth.signInWithEmailAndPassword(email.trim(), password);
    } catch (e) {
      throw new Error(e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' ? 'Incorrect email or password.' : e.message);
    }
    await this.loadUser(this.auth.currentUser);
    this.subscribe();
  }

  async logout() {
    await this.auth.signOut(); // onAuthStateChanged signs in anonymously again
  }

  async saveProfile(patch) {
    const local = { ...readJSON(PROFILE_KEY, {}), ...patch };
    writeJSON(PROFILE_KEY, local);
    await this.db.collection('users').doc(this.state.user.id).set(patch, { merge: true });
    Object.assign(this.state.user, patch);
  }

  async saveMenuItem(item) {
    const { id, ...data } = item;
    await this.db.collection('menu').doc(id).set(data);
  }

  async deleteMenuItem(id) {
    await this.db.collection('menu').doc(id).delete();
  }

  async createOrder(order, check) {
    const countRef = this.db.collection('slotCounts').doc(order.pickupDate);
    const orderRef = this.db.collection('orders').doc(order.id);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(countRef);
      const counts = snap.exists ? snap.data() : {};
      this.slotCounts[order.pickupDate] = counts;
      check();
      tx.set(countRef, { [order.pickupTime]: (counts[order.pickupTime] || 0) + 1 }, { merge: true });
      const { id, ...data } = order;
      void id;
      tx.set(orderRef, data);
    });
    return order;
  }

  async updateOrder(id, patch) {
    const ref = this.db.collection('orders').doc(id);
    let before = this.state.orders.find((o) => o.id === id);
    if (!before) {
      // Not in the local snapshot yet (e.g. just created) — read it directly.
      const snap = await ref.get().catch(() => null);
      if (snap?.exists) before = { id, ...snap.data() };
    }
    await ref.update({ ...patch, updatedAt: Date.now() });
    if (before && patch.status === 'Cancelled' && before.status !== 'Cancelled') {
      const countRef = this.db.collection('slotCounts').doc(before.pickupDate);
      await countRef.set({ [before.pickupTime]: this.fb.firestore.FieldValue.increment(-1) }, { merge: true })
        .catch((e) => console.warn('Could not release pickup slot', e.code || e.message));
    }
    return { ...before, ...patch };
  }

  async saveSettings(settings) {
    await this.db.collection('settings').doc('main').set(settings);
  }

  async uploadImage(dataUrl, path) {
    try {
      const ref = this.storage.ref().child(path);
      await withTimeout(ref.put(dataUrlToBlob(dataUrl), { contentType: 'image/jpeg' }), 30000, 'storage-timeout');
      return await ref.getDownloadURL();
    } catch (e) {
      // Storage not set up (or not on the Blaze plan): keep the compressed image
      // inline in Firestore instead, as long as it fits well under the 1 MB doc limit.
      console.warn('Firebase Storage upload failed, storing image inline:', e.code || e.message);
      if (dataUrl.length < 700000) return dataUrl;
      throw new Error('Image is too large to save. Please use a smaller photo.');
    }
  }

  slotCount(date, time) {
    if (['staff', 'admin'].includes(this.state.user.role)) {
      return this.state.orders.filter((o) => o.pickupDate === date && o.pickupTime === time && o.status !== 'Cancelled').length;
    }
    return (this.slotCounts[date] || {})[time] || 0;
  }

  async resetDemo() {
    localStorage.removeItem('png_cart');
  }

  /** Admin helper: seed sample menu + default settings into an empty project. */
  async seedMenu() {
    const batch = this.db.batch();
    SAMPLE_MENU.forEach(({ id, ...m }) => batch.set(this.db.collection('menu').doc(id), m));
    batch.set(this.db.collection('settings').doc('main'), DEFAULT_SETTINGS, { merge: true });
    await batch.commit();
  }
}

// ---------------------------------------------------------------------------
// Public Store facade
// ---------------------------------------------------------------------------
export const Store = {
  state: { menu: [], orders: [], settings: mergeSettings(null), user: null },
  backend: null,

  get mode() {
    return this.backend?.mode || 'demo';
  },

  async init() {
    this.backend = FIREBASE_CONFIG ? new FirebaseBackend(FIREBASE_CONFIG) : new LocalBackend();
    try {
      await this.backend.init(this.state);
    } catch (e) {
      console.error('Backend init failed, falling back to demo mode', e);
      this.backend.dead = true;
      this.backend.unsubs?.forEach((fn) => fn());
      this.backend = new LocalBackend();
      await this.backend.init(this.state);
      this.initError = e;
    }
  },

  on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  get user() { return this.state.user; },
  get settings() { return this.state.settings; },
  get menu() { return this.state.menu; },
  get orders() { return this.state.orders; },

  isStaff() { return ['staff', 'admin'].includes(this.state.user?.role); },
  isAdmin() { return this.state.user?.role === 'admin'; },

  menuItem(id) { return this.state.menu.find((m) => m.id === id); },
  order(id) { return this.state.orders.find((o) => o.id === id); },

  async login(email, password) { await this.backend.login(email, password); emit('auth'); },
  async logout() { await this.backend.logout(); emit('auth'); },
  async saveProfile(patch) { await this.backend.saveProfile(patch); emit('profile'); },

  async toggleFavourite(menuId) {
    const fav = new Set(this.state.user.favourites || []);
    fav.has(menuId) ? fav.delete(menuId) : fav.add(menuId);
    await this.saveProfile({ favourites: [...fav] });
    return fav.has(menuId);
  },

  async saveMenuItem(item) { await this.backend.saveMenuItem(item); emit('menu'); },
  async deleteMenuItem(id) { await this.backend.deleteMenuItem(id); emit('menu'); },

  async createOrder(order, check) {
    const saved = await this.backend.createOrder(order, check);
    emit('orders');
    return saved;
  },

  async updateOrder(id, patch) {
    const o = this.order(id);
    if (patch.status && o && patch.status !== o.status) {
      patch.history = [...(o.history || []), { status: patch.status, at: Date.now() }];
    }
    const prevStatus = o?.status;
    const res = await this.backend.updateOrder(id, patch);
    emit('orders');
    if (patch.status && patch.status !== prevStatus) {
      try { this.onStatusChanged?.(res, prevStatus); } catch (e) { console.error(e); }
    }
    return res;
  },

  async saveSettings(patch) {
    const next = { ...this.state.settings, ...patch };
    await this.backend.saveSettings(next);
    emit('settings');
  },

  uploadImage(dataUrl, path) { return this.backend.uploadImage(dataUrl, path); },
  slotCount(date, time) { return this.backend.slotCount(date, time); },
  async resetDemo() { await this.backend.resetDemo(); emit('reset'); },
  async seedMenu() { await this.backend.seedMenu(); emit('menu'); },
};
