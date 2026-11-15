// ---------------------------------------------------------------------------
// Admin → Add-on: manage the shared add-on library and link it to menu items.
// Works on a working copy; nothing is saved until "Simpan".
// ---------------------------------------------------------------------------
import { Store } from '../store.js';
import { categories } from '../categories.js';
import { isLinked, sampleAddonGroups, addonHint } from '../addons.js';
import { esc, uid } from '../utils.js';
import { icon, toast, confirmDialog, busy } from '../ui.js';

export const cloneAddons = () => JSON.parse(JSON.stringify(Store.settings.addonGroups || []));

const newGroup = () => ({ id: uid('ag_'), name: '', type: 'multi', max: 0, categories: [], items: [], exclude: [], options: [{ name: '', price: 0, available: true }] });
const linkedMenu = (g) => Store.menu.filter((m) => isLinked(g, m));
const drinkCategory = () => categories().find((c) => /drink|minum|air|kopi|coffee|beverage/i.test(`${c.id} ${c.name}`))?.id || '';

export function addonsTabHTML(work) {
  const cats = categories();
  const byCat = cats.map((c) => ({ c, items: Store.menu.filter((m) => m.category === c.id) })).filter((x) => x.items.length);
  return `
    <div class="filters ag-bar">
      <p class="muted small ag-intro">Senarai add-on dikongsi untuk <b>special request</b> (cth. Kurang Manis, Extra Shot). Sambungkan setiap kumpulan ke kategori (semua air) atau menu tertentu — pelanggan &amp; POS akan nampak pilihan ini bila tekan menu.</p>
      <div class="ag-actions">
        ${!work.length ? `<button class="btn btn-ghost btn-sm" data-ag-sample>☕ Guna contoh minuman</button>` : ''}
        <button class="btn btn-ghost btn-sm" data-ag-add>${icon.plus} Kumpulan add-on</button>
      </div>
    </div>
    ${!work.length ? `<div class="card empty-rep"><span class="empty-ico">${icon.plus}</span><h3>Belum ada add-on</h3><p class="muted">Tekan <b>Guna contoh minuman</b> untuk mula dengan Add-on kopi, Topping dan Ais, atau buat kumpulan sendiri (cth. Tahap Manis).</p></div>` : ''}
    <div class="ag-list">${work.map((g, i) => {
      const linked = linkedMenu(g);
      return `<div class="card ag-card">
        <div class="ag-head">
          <input class="input ag-name" data-ag="${i}" data-k="name" value="${esc(g.name)}" placeholder="Nama kumpulan, cth: Tahap Manis" maxlength="40" aria-label="Nama kumpulan">
          <div class="ag-move">
            <button class="icon-btn" data-ag-move="${i}:-1" ${i === 0 ? 'disabled' : ''} aria-label="Naik">${icon.back}</button>
            <button class="icon-btn" data-ag-move="${i}:1" ${i === work.length - 1 ? 'disabled' : ''} aria-label="Turun">${icon.chevronRight}</button>
            <button class="icon-btn danger" data-ag-del="${i}" aria-label="Padam kumpulan">${icon.trash}</button>
          </div>
        </div>
        <div class="ag-type">
          <div class="seg sm"><button class="${g.type !== 'single' ? 'on' : ''}" data-ag-type="${i}:multi">Pilih beberapa</button><button class="${g.type === 'single' ? 'on' : ''}" data-ag-type="${i}:single">Pilih satu</button></div>
          ${g.type !== 'single' ? `<label class="ag-max">Maks <input class="input sm" type="number" min="0" max="20" data-ag="${i}" data-k="max" value="${g.max || 0}" aria-label="Maksimum pilihan"><small>0 = tiada had</small></label>` : ''}
        </div>
        <p class="side-label">Pilihan</p>
        <div class="ag-opts">${(g.options || []).map((o, j) => `<div class="ag-opt ${o.available === false ? 'off' : ''}">
          <input class="input sm" data-ao="${i}:${j}" data-k="name" value="${esc(o.name)}" placeholder="Nama pilihan" maxlength="30" aria-label="Nama pilihan">
          <label class="ag-price"><span>+RM</span><input class="input sm" type="number" step="0.10" data-ao="${i}:${j}" data-k="price" value="${Number(o.price) || 0}" aria-label="Harga tambahan"></label>
          <label class="switch sm" title="Ada / Habis"><input type="checkbox" data-ao-avail="${i}:${j}" ${o.available === false ? '' : 'checked'}><span></span><em>${o.available === false ? 'Habis' : 'Ada'}</em></label>
          <button class="icon-btn danger" data-ao-del="${i}:${j}" aria-label="Padam pilihan">${icon.x}</button>
        </div>`).join('')}</div>
        <button class="btn btn-ghost btn-sm" data-ao-add="${i}">${icon.plus} Tambah pilihan</button>

        <p class="side-label">Sambung ke kategori</p>
        <div class="ag-chips">${cats.map((c) => `<button class="fchip ${(g.categories || []).includes(c.id) ? 'on' : ''}" data-ag-cat="${i}:${esc(c.id)}">${esc(c.icon)} ${esc(c.name)}</button>`).join('')}</div>
        <details class="ag-items">
          <summary>Sambung ke menu tertentu <small>• disambung ke <b>${linked.length}</b> menu</small></summary>
          ${byCat.map(({ c, items }) => `<p class="ag-cat-label">${esc(c.icon)} ${esc(c.name)}${(g.categories || []).includes(c.id) ? ' <small>(semua — tekan untuk kecualikan)</small>' : ''}</p>
            <div class="ag-chips">${items.map((m) => `<button class="fchip sm ${isLinked(g, m) ? 'on' : ''}" data-ag-item="${i}:${esc(m.id)}">${esc(m.name)}</button>`).join('')}</div>`).join('') || '<p class="muted small">Tiada menu.</p>'}
        </details>
        <p class="small muted ag-sum">${addonHint(g)} • ${(g.options || []).filter((o) => o.available !== false).length} pilihan aktif • ${linked.length ? `Muncul pada: ${linked.slice(0, 4).map((m) => esc(m.name)).join(', ')}${linked.length > 4 ? ` +${linked.length - 4} lagi` : ''}` : '<b class="warn-text">Belum disambung ke mana-mana menu</b>'}</p>
      </div>`;
    }).join('')}</div>
    ${work.length || (Store.settings.addonGroups || []).length ? `<div class="btn-row sticky-save"><button class="btn btn-ghost" data-ag-reset>Batal perubahan</button><button class="btn btn-primary" data-ag-save>Simpan add-on</button></div>` : ''}`;
}

const pair = (v) => { const k = v.lastIndexOf(':'); return [Number(v.slice(0, k)), v.slice(k + 1)]; };
const toggleIn = (arr = [], v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

/** Link/unlink one menu item, respecting category links. */
export function setItemLink(g, m, on) {
  g.items = (g.items || []).filter((x) => x !== m.id);
  g.exclude = (g.exclude || []).filter((x) => x !== m.id);
  const viaCat = (g.categories || []).includes(m.category);
  if (on && !viaCat) g.items.push(m.id);
  if (!on && viaCat) g.exclude.push(m.id);
}

/** Clean + validate before saving. Returns { groups } or { error }. */
export function validateAddons(work) {
  const names = new Set();
  const groups = [];
  for (const g of work) {
    const name = String(g.name || '').replace(/,/g, ' ').trim();
    if (!name) return { error: 'Setiap kumpulan add-on perlu nama.' };
    if (names.has(name.toLowerCase())) return { error: `Nama kumpulan "${name}" berulang.` };
    names.add(name.toLowerCase());
    const clash = Store.menu.find((m) => isLinked(g, m) && (m.variants || []).some((v) => v.name.toLowerCase() === name.toLowerCase()));
    if (clash) return { error: `"${name}" sama dengan nama variasi pada ${clash.name}. Guna nama lain.` };
    const seen = new Set();
    const options = [];
    for (const o of g.options || []) {
      const on = String(o.name || '').replace(/,/g, ' ').trim();
      if (!on) continue;
      if (seen.has(on.toLowerCase())) return { error: `Pilihan "${on}" berulang dalam ${name}.` };
      seen.add(on.toLowerCase());
      options.push({ name: on, price: +(Number(o.price) || 0).toFixed(2), available: o.available !== false });
    }
    if (!options.length) return { error: `${name}: tambah sekurang-kurangnya satu pilihan.` };
    const menuIds = new Set(Store.menu.map((m) => m.id));
    groups.push({
      id: g.id || uid('ag_'), name, type: g.type === 'single' ? 'single' : 'multi',
      max: g.type === 'single' ? 0 : Math.max(0, Math.min(20, Number(g.max) || 0)),
      categories: [...new Set(g.categories || [])],
      items: [...new Set(g.items || [])].filter((x) => menuIds.has(x)),
      exclude: [...new Set(g.exclude || [])].filter((x) => menuIds.has(x)),
      options,
    });
  }
  return { groups };
}

/** Click handling for the tab. Returns true when it handled the event. */
export async function addonsClick(t, st, rerender) {
  const w = st.addons;
  if (t.closest('[data-ag-sample]')) { st.addons = sampleAddonGroups(drinkCategory()); toast('Contoh ditambah — semak & tekan Simpan'); rerender(); return true; }
  if (t.closest('[data-ag-add]')) { w.push(newGroup()); rerender(); return true; }
  const del = t.closest('[data-ag-del]');
  if (del) {
    const g = w[Number(del.dataset.agDel)];
    if (await confirmDialog(`Padam kumpulan add-on “${g.name || 'tanpa nama'}”?`, { ok: 'Padam', danger: true })) { w.splice(Number(del.dataset.agDel), 1); rerender(); }
    return true;
  }
  const mv = t.closest('[data-ag-move]');
  if (mv) { const [i, d] = pair(mv.dataset.agMove); const j = i + Number(d); if (w[j]) { [w[i], w[j]] = [w[j], w[i]]; rerender(); } return true; }
  const ty = t.closest('[data-ag-type]');
  if (ty) { const [i, v] = pair(ty.dataset.agType); w[i].type = v; rerender(); return true; }
  const oa = t.closest('[data-ao-add]');
  if (oa) { w[Number(oa.dataset.aoAdd)].options.push({ name: '', price: 0, available: true }); rerender(); return true; }
  const od = t.closest('[data-ao-del]');
  if (od) { const [i, j] = od.dataset.aoDel.split(':').map(Number); w[i].options.splice(j, 1); rerender(); return true; }
  const ac = t.closest('[data-ag-cat]');
  if (ac) {
    const [i, c] = pair(ac.dataset.agCat);
    const g = w[i];
    g.categories = toggleIn(g.categories, c);
    // a category link supersedes single-item links/exclusions in that category
    const inCat = new Set(Store.menu.filter((m) => m.category === c).map((m) => m.id));
    g.items = (g.items || []).filter((x) => !inCat.has(x));
    g.exclude = (g.exclude || []).filter((x) => !inCat.has(x));
    rerender(); return true;
  }
  const ai = t.closest('[data-ag-item]');
  if (ai) {
    const [i, id] = pair(ai.dataset.agItem);
    const m = Store.menuItem(id);
    if (m) setItemLink(w[i], m, !isLinked(w[i], m));
    rerender(); return true;
  }
  if (t.closest('[data-ag-reset]')) { st.addons = cloneAddons(); rerender(); return true; }
  const save = t.closest('[data-ag-save]');
  if (save) {
    const r = validateAddons(w);
    if (r.error) { toast(r.error, 'error'); return true; }
    await busy(save, async () => {
      await Store.saveSettings({ addonGroups: r.groups });
      st.addons = JSON.parse(JSON.stringify(r.groups));
      toast('Add-on disimpan', 'success');
    });
    rerender();
    return true;
  }
  return false;
}

export function addonsInput(t, st) {
  if (t.matches('[data-ag]')) { const g = st.addons[Number(t.dataset.ag)]; g[t.dataset.k] = t.dataset.k === 'max' ? Math.max(0, Number(t.value) || 0) : t.value; return true; }
  if (t.matches('[data-ao]')) { const [i, j] = t.dataset.ao.split(':').map(Number); st.addons[i].options[j][t.dataset.k] = t.value; return true; }
  return false;
}

export function addonsChange(t, st, rerender) {
  if (t.matches('[data-ao-avail]')) { const [i, j] = t.dataset.aoAvail.split(':').map(Number); st.addons[i].options[j].available = t.checked; rerender(); return true; }
  return false;
}

/** Menu form: checkboxes for linking this item to each group. */
export function menuFormAddonsHTML(m) {
  const groups = Store.settings.addonGroups || [];
  return `<label class="label">Add-on <small>— pilihan special request yang dikongsi (urus di <a href="#/admin/addons" data-close>Add-on</a>)</small></label>
    ${groups.length ? `<div class="checks mf-addons">${groups.map((g) => `<label class="check"><input type="checkbox" name="addon" value="${esc(g.id)}" ${isLinked(g, m) ? 'checked' : ''}> ${esc(g.name)} <small class="muted">(${g.options.length})${(g.categories || []).includes(m.category) ? ' • ikut kategori' : ''}</small></label>`).join('')}</div>`
      : '<p class="small muted">Belum ada add-on. Buat di Admin → Add-on.</p>'}`;
}

/** After saving a menu item: apply the checkbox choices to the shared groups. */
export async function saveMenuAddonLinks(item, checkedIds) {
  const groups = JSON.parse(JSON.stringify(Store.settings.addonGroups || []));
  let changed = false;
  groups.forEach((g) => {
    const want = checkedIds.includes(g.id);
    if (isLinked(g, item) !== want) { setItemLink(g, item, want); changed = true; }
  });
  if (changed) await Store.saveSettings({ addonGroups: groups });
  return changed;
}

