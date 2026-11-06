// ---------------------------------------------------------------------------
// Shopping cart (persisted in LocalStorage so it survives refresh/offline)
// ---------------------------------------------------------------------------
import { Store } from './store.js';

const KEY = 'png_cart';
const PROMO_KEY = 'png_promo';
const SPECIAL_KEY = 'png_special';

const read = (k, f) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; }
};
const write = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ }
};

export function defaultVariant(item) {
  const v = {};
  (item.variants || []).forEach((g) => { if (g.options?.length) v[g.name] = g.options[0].label; });
  return v;
}

export function unitPrice(item, variant = {}) {
  let p = Number(item.price) || 0;
  (item.variants || []).forEach((g) => {
    const opt = g.options.find((o) => o.label === variant[g.name]);
    if (opt) p += Number(opt.price) || 0;
  });
  return Math.max(0, +p.toFixed(2));
}

export const variantText = (variant = {}) => Object.values(variant).filter(Boolean).join(', ');

export const Cart = {
  items: read(KEY, []),

  save() {
    write(KEY, this.items);
    window.dispatchEvent(new CustomEvent('cart:change'));
  },

  reload() {
    this.items = read(KEY, []);
  },

  add(item, qty = 1, variant = defaultVariant(item), note = '') {
    const key = item.id + '|' + JSON.stringify(variant) + '|' + note.trim();
    const existing = this.items.find((l) => l.key === key);
    if (existing) existing.qty = Math.min(99, existing.qty + qty);
    else this.items.push({ key, menuId: item.id, qty, variant, note: note.trim() });
    this.save();
  },

  setQty(key, qty) {
    const l = this.items.find((x) => x.key === key);
    if (!l) return;
    if (qty <= 0) return this.remove(key);
    l.qty = Math.min(99, qty);
    this.save();
  },

  setNote(key, note) {
    const l = this.items.find((x) => x.key === key);
    if (l) { l.note = note; this.save(); }
  },

  remove(key) {
    this.items = this.items.filter((x) => x.key !== key);
    this.save();
  },

  clear() {
    this.items = [];
    localStorage.removeItem(PROMO_KEY);
    localStorage.removeItem(SPECIAL_KEY);
    this.save();
  },

  get count() {
    return this.items.reduce((s, l) => s + l.qty, 0);
  },

  /** Cart lines enriched with live menu data. */
  lines() {
    return this.items.map((l) => {
      const item = Store.menuItem(l.menuId);
      const price = item ? unitPrice(item, l.variant) : 0;
      return { ...l, item, unitPrice: price, lineTotal: +(price * l.qty).toFixed(2), unavailable: !item || !item.available };
    });
  },

  get promoCode() { return localStorage.getItem(PROMO_KEY) || ''; },
  set promoCode(code) {
    if (code) localStorage.setItem(PROMO_KEY, code.toUpperCase());
    else localStorage.removeItem(PROMO_KEY);
    window.dispatchEvent(new CustomEvent('cart:change'));
  },

  get specialRequest() { return localStorage.getItem(SPECIAL_KEY) || ''; },
  set specialRequest(v) { localStorage.setItem(SPECIAL_KEY, v); },

  findPromo(code) {
    return (Store.settings.promos || []).find((p) => p.active && p.code.toUpperCase() === String(code).toUpperCase());
  },

  totals() {
    const lines = this.lines().filter((l) => !l.unavailable);
    const subtotal = +lines.reduce((s, l) => s + l.lineTotal, 0).toFixed(2);
    let discount = 0;
    let promoError = '';
    const code = this.promoCode;
    const promo = code ? this.findPromo(code) : null;
    if (code && !promo) promoError = 'Promo code is not valid.';
    else if (promo && subtotal < (promo.minSpend || 0)) promoError = `Min. spend RM ${Number(promo.minSpend).toFixed(2)} for ${promo.code}.`;
    else if (promo) discount = promo.type === 'percent' ? (subtotal * promo.value) / 100 : promo.value;
    discount = +Math.min(discount, subtotal).toFixed(2);
    return { subtotal, discount, total: +(subtotal - discount).toFixed(2), promo: promoError ? null : promo, promoError, count: lines.reduce((s, l) => s + l.qty, 0) };
  },
};

window.addEventListener('storage', (e) => {
  if (e.key === KEY) {
    Cart.reload();
    window.dispatchEvent(new CustomEvent('cart:change'));
  }
});
