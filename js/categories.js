// ---------------------------------------------------------------------------
// Food categories — editable by the admin (stored in settings.categories).
// Falls back to the built-in list until the shop saves its own.
// ---------------------------------------------------------------------------
import { Store } from './store.js';
import { CATEGORIES as DEFAULT_CATEGORIES } from './sample-data.js';

export function categories() {
  const c = Store.settings?.categories;
  return Array.isArray(c) && c.length ? c : DEFAULT_CATEGORIES;
}
export const catName = (id) => categories().find((c) => c.id === id)?.name || id || '-';
export const catIcon = (id) => categories().find((c) => c.id === id)?.icon || '🍽️';
export { DEFAULT_CATEGORIES };
