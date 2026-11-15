// ---------------------------------------------------------------------------
// Table ordering (dine-in).
//
// Each table has a QR code that opens  …/#/table/<name>.  The table is
// remembered on the device for a few hours; while it is set, checkout skips
// the pickup date/slot step and the order is sent as a dine-in order:
//   { source: 'table', orderType: 'dine-in', table: '<name>' }
// Table orders never use a pickup slot (like POS walk-in sales).
//
// settings.tables = { enabled: bool, list: ['1', '2', …], serve: 'table'|'counter' }
// ---------------------------------------------------------------------------
import { Store } from './store.js';
import { esc } from './utils.js';

const KEY = 'png_table';
const TTL = 4 * 3600 * 1000; // a table visit lasts at most 4 hours

export function tableSettings() {
  const t = Store.settings.tables || {};
  const list = (t.list || []).map(String).filter(Boolean);
  return { enabled: t.enabled !== false && list.length > 0, list, serve: t.serve === 'counter' ? 'counter' : 'table' };
}

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
}

/** Remember the table scanned on this device (validated later against settings). */
export function setTable(name) {
  try { localStorage.setItem(KEY, JSON.stringify({ name: String(name).trim(), at: Date.now() })); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('table:change'));
}

export function clearTable() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('table:change'));
}

/** Raw scanned name (may not be valid yet while settings load). */
export const scannedTable = () => { const t = read(); return t && Date.now() - t.at < TTL ? t.name : ''; };

/** The active, valid table for this device — or '' when ordering for pickup. */
export function currentTable() {
  const name = scannedTable();
  if (!name) return '';
  const s = tableSettings();
  return s.enabled && s.list.includes(name) ? name : '';
}

export const tableUrl = (name) => `${location.origin}${location.pathname}#/table/${encodeURIComponent(name)}`;
export const isTableOrder = (o) => o?.source === 'table' || o?.orderType === 'dine-in';
export const tableName = (o) => (o?.table ? `Meja ${o.table}` : 'Dine-in');

/** Is the shop open right now (business hours for today)? */
export function openNow() {
  const s = Store.settings;
  const now = new Date();
  const h = s.businessHours?.[now.getDay()];
  if (!h || h.closed) return false;
  const hm = now.toTimeString().slice(0, 5);
  return hm >= h.open && hm < h.close;
}

/** Banner shown on customer pages while a table is active. */
export function tableBarHTML() {
  const t = currentTable();
  if (!t) return '';
  const serve = tableSettings().serve;
  return `<div class="table-bar" role="status">
    <span class="tb-ico">🍽️</span>
    <span class="tb-main"><strong>Meja ${esc(t)}</strong><small>Dine-in • ${serve === 'counter' ? 'ambil di kaunter bila dipanggil' : 'dihantar ke meja anda'}</small></span>
    <button type="button" class="tb-x" data-table-clear aria-label="Bukan di meja — tukar ke pickup">Tukar</button>
  </div>`;
}

// One global listener for every "Tukar" (leave table) button.
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-table-clear]')) clearTable();
});
