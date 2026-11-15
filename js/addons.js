// ---------------------------------------------------------------------------
// Shared add-on library (settings.addonGroups), managed in Admin → Add-on.
//
// A group (e.g. "Add-on Kopi", "Tahap Manis", "Ais") holds options with an
// optional extra price and is linked to menu items either by category
// (all Drinks) or one by one; `exclude` unlinks single items from a
// category link.
//
//   { id, name, type: 'multi' | 'single', max: 0, categories: [], items: [],
//     exclude: [], options: [{ name, price, available }] }
//
// A customer's picks are stored in the line's `variant` map under the group
// name, as a comma-separated string ("Extra Shot, Oat Milk"). Every screen
// that already shows variations (cart, receipts, WhatsApp, POS, admin) shows
// add-ons too, and identical picks merge into one cart line.
// ---------------------------------------------------------------------------
import { Store } from './store.js';

const SEP = ', ';

export const addonGroups = () => Store.settings.addonGroups || [];

export const isLinked = (g, m) => !!m && !(g.exclude || []).includes(m.id) && ((g.items || []).includes(m.id) || (g.categories || []).includes(m.category));

/** Groups linked to a menu item, skipping those whose options are all unavailable. */
export const addonsFor = (m) => addonGroups().filter((g) => isLinked(g, m) && (g.options || []).some((o) => o.available !== false));

/** Names picked in one group. */
export const picked = (variant, g) => String(variant?.[g.name] || '').split(SEP).filter(Boolean);

/** Extra price from the add-ons in a variant map. */
export function addonPrice(m, variant = {}) {
  let p = 0;
  addonGroups().forEach((g) => {
    if (!isLinked(g, m)) return;
    picked(variant, g).forEach((n) => {
      const o = (g.options || []).find((x) => x.name === n);
      if (o) p += Number(o.price) || 0;
    });
  });
  return p;
}

/**
 * Tap an option. Returns an error message when the pick is not allowed
 * (sold out, or the group's maximum is reached), otherwise updates `variant`.
 */
export function toggleAddon(variant, g, name) {
  const o = (g.options || []).find((x) => x.name === name);
  if (!o || o.available === false) return 'Pilihan ini habis.';
  let list = picked(variant, g);
  if (list.includes(name)) list = list.filter((n) => n !== name);
  else if (g.type === 'single') list = [name];
  else {
    if (g.max && list.length >= g.max) return `Maksimum ${g.max} pilihan untuk ${g.name}.`;
    list = (g.options || []).map((x) => x.name).filter((n) => n === name || list.includes(n)); // keep menu order
  }
  if (list.length) variant[g.name] = list.join(SEP);
  else delete variant[g.name];
  return '';
}

const priceTag = (p, money) => (Number(p) ? `<small>${p > 0 ? '+' : '−'}${money(Math.abs(p))}</small>` : '');
export const addonHint = (g) => (g.type === 'single' ? 'Pilih satu (pilihan)' : g.max ? `Pilih sehingga ${g.max}` : 'Pilih beberapa (pilihan)');

/** Option buttons for the customer item page and the POS picker. */
export function addonsHTML(m, variant, { esc, money, btnClass = 'opt', groupClass = 'opt-row', titleTag = 'h3' }) {
  return addonsFor(m).map((g) => {
    const sel = picked(variant, g);
    return `<${titleTag} class="addon-title">${esc(g.name)} <small>${addonHint(g)}</small></${titleTag}>
      <div class="${groupClass} addon-row" data-addon-group="${esc(g.id)}">${(g.options || []).map((o) => {
        const off = o.available === false;
        const on = sel.includes(o.name);
        return `<button type="button" class="${btnClass} addon-opt ${on ? 'on' : ''} ${off ? 'off' : ''}" data-addon="${esc(o.name)}" aria-pressed="${on}" ${off ? 'disabled' : ''}>
          ${g.type === 'single' ? '' : `<i class="addon-tick" aria-hidden="true"></i>`}<span>${esc(o.name)}</span>${off ? '<small>Habis</small>' : priceTag(o.price, money)}</button>`;
      }).join('')}</div>`;
  }).join('');
}

/** Sample groups for a café: coffee add-ons, toppings, ice level. */
export function sampleAddonGroups(drinkCat) {
  const cats = drinkCat ? [drinkCat] : [];
  const id = () => 'ag_' + Math.random().toString(36).slice(2, 8);
  const opt = (name, price = 0) => ({ name, price, available: true });
  return [
    { id: id(), name: 'Add-on', type: 'multi', max: 0, categories: cats, items: [], exclude: [], options: [opt('Extra Shot', 2), opt('Oat Milk', 2.5), opt('Susu Lebih', 1), opt('Whipped Cream', 1.5)] },
    { id: id(), name: 'Topping', type: 'multi', max: 2, categories: cats, items: [], exclude: [], options: [opt('Nata de Coco', 1), opt('Boba', 1.5), opt('Cincau', 1)] },
    { id: id(), name: 'Ais', type: 'single', max: 0, categories: cats, items: [], exclude: [], options: [opt('Kurang Ais'), opt('Tanpa Ais'), opt('Ais Asing')] },
  ];
}
