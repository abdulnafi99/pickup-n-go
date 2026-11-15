// ---------------------------------------------------------------------------
// Admin → Table QR: set up tables for dine-in ordering and print QR cards.
// ---------------------------------------------------------------------------
import { Store } from '../store.js';
import { tableUrl } from '../table.js';
import { esc } from '../utils.js';
import { icon, toast, busy } from '../ui.js';
import { renderQR, qrDataURL } from '../qr.js';

export const cloneTables = () => {
  const t = Store.settings.tables || {};
  return { enabled: t.enabled !== false && !!(t.list || []).length, list: [...(t.list || [])].map(String), serve: t.serve === 'counter' ? 'counter' : 'table', draftText: (t.list || []).join('\n') };
};

const parseList = (text) => [...new Set(String(text).split(/[\n,]+/).map((x) => x.trim().replace(/[/#?]/g, '')).filter(Boolean))].slice(0, 100);

export function tablesTabHTML(w) {
  const list = parseList(w.draftText);
  const savedList = (Store.settings.tables?.list || []).map(String);
  const dirty = JSON.stringify(list) !== JSON.stringify(savedList) || w.enabled !== (Store.settings.tables?.enabled !== false && savedList.length > 0) || w.serve !== (Store.settings.tables?.serve === 'counter' ? 'counter' : 'table');
  return `
    <div class="settings-grid tq-grid">
      <div class="card">
        <div class="card-head"><h3>🍽️ Table ordering</h3>
          <label class="switch"><input type="checkbox" data-tq-enabled ${w.enabled ? 'checked' : ''}><span></span><em>${w.enabled ? 'On' : 'Off'}</em></label>
        </div>
        <p class="small muted">Customers scan the QR on their table, order from their phone and pay at the counter or by DuitNow. No pickup slot needed — the order goes straight to the staff counter marked <b>MEJA</b>.</p>
        <p class="side-label">Serve</p>
        <div class="seg sm tq-serve">
          <button class="${w.serve === 'table' ? 'on' : ''}" data-tq-serve="table">Hantar ke meja</button>
          <button class="${w.serve === 'counter' ? 'on' : ''}" data-tq-serve="counter">Ambil di kaunter</button>
        </div>
        <p class="side-label">Tables</p>
        <div class="tq-gen">
          <label>Number of tables <input class="input sm" type="number" min="1" max="100" value="${list.length || 8}" data-tq-count></label>
          <button class="btn btn-ghost btn-sm" data-tq-gen>Create 1–N</button>
        </div>
        <label class="label">Table names <small>— one per line (e.g. 1, 2, 3 or A1, A2, Outdoor 1)</small></label>
        <textarea class="input mono" rows="6" data-tq-list placeholder="1&#10;2&#10;3">${esc(w.draftText)}</textarea>
        <p class="small muted">${list.length} table(s)</p>
        <div class="btn-row">
          <button class="btn btn-ghost" data-tq-reset ${dirty ? '' : 'disabled'}>Reset</button>
          <button class="btn btn-primary" data-tq-save ${dirty ? '' : 'disabled'}>Save tables</button>
        </div>
      </div>
      <div class="card tq-qr-card">
        <div class="card-head"><h3>QR cards</h3>
          <div class="tq-actions">
            <button class="btn btn-ghost btn-sm" data-tq-print ${savedList.length ? '' : 'disabled'}>${icon.print} Print all (A4)</button>
          </div>
        </div>
        ${!savedList.length ? '<p class="muted">Save your tables first — the QR cards appear here.</p>' : `
        ${dirty ? '<div class="alert alert-warn">You have unsaved changes. Save to update the QR cards.</div>' : ''}
        ${Store.settings.tables?.enabled === false ? '<div class="alert alert-warn">Table ordering is OFF — scanning shows “table not active”.</div>' : ''}
        <div class="tq-cards">${savedList.map((n) => `<figure class="tq-card">
          <div class="tq-card-top"><strong>${esc(Store.settings.shopName)}</strong><small>Scan to order</small></div>
          <div class="tq-qr" data-tq-qr="${esc(n)}"></div>
          <figcaption><small>MEJA</small><b>${esc(n)}</b></figcaption>
          <div class="tq-card-btns">
            <button class="btn btn-ghost btn-xs" data-tq-png="${esc(n)}">${icon.download} PNG</button>
            <a class="btn btn-ghost btn-xs" href="${esc(tableUrl(n))}" target="_blank" rel="noopener">Test</a>
          </div>
        </figure>`).join('')}</div>`}
      </div>
    </div>`;
}

/** Draw QR previews after render. */
export function mountTables(root) {
  root.querySelectorAll('[data-tq-qr]').forEach((el) => renderQR(el, tableUrl(el.dataset.tqQr), 220));
}

const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

/** Printable / shareable card as a PNG (1200×1600). */
async function cardPNG(name) {
  const W = 1200, H = 1600;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const s = Store.settings;
  await document.fonts?.ready;
  g.fillStyle = '#FFF9F0'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#244B38'; g.beginPath(); g.roundRect(60, 60, W - 120, 300, 48); g.fill();
  const logo = await loadImg('icons/logo-256.png');
  if (logo) { g.save(); g.beginPath(); g.roundRect(110, 110, 200, 200, 40); g.clip(); g.drawImage(logo, 110, 110, 200, 200); g.restore(); }
  g.fillStyle = '#fff'; g.font = '800 64px Poppins, Arial'; g.textBaseline = 'middle';
  g.fillText(s.shopName, 350, 175, W - 470);
  g.fillStyle = '#F4A340'; g.font = '700 46px Poppins, Arial'; g.fillText('SCAN TO ORDER', 350, 260);
  const qr = await loadImg(await qrDataURL(tableUrl(name), 760));
  g.fillStyle = '#fff'; g.beginPath(); g.roundRect(190, 420, 820, 820, 40); g.fill();
  if (qr) g.drawImage(qr, 220, 450, 760, 760);
  g.textAlign = 'center'; g.fillStyle = '#7a756c'; g.font = '600 44px Poppins, Arial'; g.fillText('MEJA', W / 2, 1310);
  g.fillStyle = '#292929'; g.font = '900 150px Poppins, Arial'; g.fillText(name, W / 2, 1420, W - 160);
  g.fillStyle = '#244B38'; g.font = '600 34px Poppins, Arial'; g.fillText('1 Scan  •  2 Order  •  3 Enjoy ☕', W / 2, 1530);
  return c.toDataURL('image/png');
}

async function printAll(names) {
  let root = document.getElementById('print-root');
  if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
  const imgs = [];
  for (const n of names) imgs.push(await cardPNG(n));
  root.innerHTML = `<div class="tq-print">${imgs.map((src, i) => `<img src="${src}" alt="Meja ${esc(names[i])}">`).join('')}</div>`;
  await Promise.all([...root.querySelectorAll('img')].map((i) => i.decode().catch(() => {})));
  setTimeout(() => window.print(), 100);
}

export async function tablesClick(t, st, rerender) {
  const w = st.tables;
  const sv = t.closest('[data-tq-serve]');
  if (sv) { w.serve = sv.dataset.tqServe; rerender(); return true; }
  if (t.closest('[data-tq-gen]')) {
    const n = Math.max(1, Math.min(100, Number(document.querySelector('[data-tq-count]')?.value) || 8));
    w.draftText = Array.from({ length: n }, (_, i) => String(i + 1)).join('\n');
    rerender(); return true;
  }
  if (t.closest('[data-tq-reset]')) { st.tables = cloneTables(); rerender(); return true; }
  const save = t.closest('[data-tq-save]');
  if (save) {
    const list = parseList(w.draftText);
    if (w.enabled && !list.length) { toast('Add at least one table', 'error'); return true; }
    await busy(save, async () => {
      await Store.saveSettings({ tables: { enabled: w.enabled, list, serve: w.serve } });
      st.tables = cloneTables();
      toast('Tables saved', 'success');
    });
    rerender(); return true;
  }
  const png = t.closest('[data-tq-png]');
  if (png) {
    const a = document.createElement('a');
    a.href = await cardPNG(png.dataset.tqPng);
    a.download = `table-qr-meja-${png.dataset.tqPng}.png`;
    a.click();
    return true;
  }
  const pr = t.closest('[data-tq-print]');
  if (pr) { await busy(pr, () => printAll((Store.settings.tables?.list || []).map(String))); return true; }
  return false;
}

export function tablesInput(t, st) {
  if (t.matches('[data-tq-list]')) { st.tables.draftText = t.value; return true; }
  return false;
}

export function tablesChange(t, st, rerender) {
  if (t.matches('[data-tq-enabled]')) { st.tables.enabled = t.checked; rerender(); return true; }
  if (t.matches('[data-tq-list]')) { rerender({ keepFocus: '[data-tq-list]' }); return true; }
  return false;
}
