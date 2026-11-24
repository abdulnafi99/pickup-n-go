// ---------------------------------------------------------------------------
// Illustrated menu artwork (inline SVG) — works fully offline.
// Cafe set only: Coffee, Matcha, Donut, Mojito. Admin-uploaded photos override these.
// ---------------------------------------------------------------------------

function rng(seedStr) {
  let h = 2166136261;
  for (const c of seedStr) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}

const C = { plate: '#1e1e1e', plateIn: '#2b2b2b', rim: '#3a3a3a' };

const plate = (cx = 120, cy = 146, rx = 104, ry = 38) => `
  <ellipse cx="${cx}" cy="${cy + 14}" rx="${rx - 4}" ry="${ry - 12}" fill="rgba(0,0,0,.16)"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${C.plate}"/>
  <ellipse cx="${cx}" cy="${cy - 3}" rx="${rx - 14}" ry="${ry - 9}" fill="${C.plateIn}"/>
  <path d="M${cx - rx + 10} ${cy - 8} Q${cx - rx / 2} ${cy - ry - 2} ${cx} ${cy - ry + 1}" stroke="${C.rim}" stroke-width="3" fill="none" stroke-linecap="round"/>`;

/** Tall iced glass with liquid layers (bottom → top) and optional ice, mint, citrus and straw. */
function glass(cx, top, h, layers, opts = {}) {
  const tw = opts.tw || 84, bw = opts.bw || 64;
  const bottom = top + h;
  const half = (y) => bw / 2 + ((tw - bw) / 2) * ((bottom - y) / h);
  let s = `<ellipse cx="${cx}" cy="${bottom + 4}" rx="${tw / 2 + 6}" ry="9" fill="rgba(0,0,0,.16)"/>`;
  s += `<path d="M${cx - tw / 2} ${top} L${cx - bw / 2} ${bottom} Q${cx} ${bottom + 8} ${cx + bw / 2} ${bottom} L${cx + tw / 2} ${top}Z" fill="rgba(255,255,255,.55)" stroke="rgba(0,0,0,.08)" stroke-width="2"/>`;
  const fillTop = top + (opts.gap ?? 10);
  const total = bottom - fillTop;
  let y = bottom;
  layers.forEach(([color, frac]) => {
    const y2 = y - total * frac;
    s += `<path d="M${cx - half(y)} ${y} L${cx - half(y2)} ${y2} L${cx + half(y2)} ${y2} L${cx + half(y)} ${y}Z" fill="${color}"/>`;
    y = y2;
  });
  if (opts.mint) {
    const r = rng(opts.mint);
    for (let i = 0; i < 9; i++) {
      const yy = bottom - 14 - r() * total * 0.62;
      const xx = cx + (r() - 0.5) * half(yy) * 1.3;
      const rot = Math.round((r() - 0.5) * 120);
      s += `<ellipse cx="${xx.toFixed(1)}" cy="${yy.toFixed(1)}" rx="9" ry="4.6" fill="${i % 3 ? '#3f9a3f' : '#5cb85c'}" transform="rotate(${rot} ${xx.toFixed(1)} ${yy.toFixed(1)})"/>`;
    }
  }
  if (opts.ice) {
    [[-16, 22, -12], [10, 30, 14], [-4, 46, 4]].forEach(([dx, dy, rot]) => {
      s += `<rect x="${cx + dx - 11}" y="${fillTop + dy - 11}" width="22" height="22" rx="5" fill="rgba(255,255,255,.55)" stroke="rgba(255,255,255,.85)" stroke-width="1.5" transform="rotate(${rot} ${cx + dx} ${fillTop + dy})"/>`;
    });
  }
  if (opts.bubbles) {
    [[-20, 0.35, 3], [14, 0.55, 2.4], [-6, 0.72, 2], [22, 0.82, 1.8]].forEach(([dx, f, rad]) => {
      s += `<circle cx="${cx + dx}" cy="${(bottom - total * f).toFixed(1)}" r="${rad}" fill="rgba(255,255,255,.85)"/>`;
    });
  }
  if (opts.foam) s += `<ellipse cx="${cx}" cy="${fillTop + 3}" rx="${half(fillTop) - 1}" ry="6" fill="${opts.foam}"/>`;
  if (opts.lime) s += `<circle cx="${cx + tw / 2 - 6}" cy="${top + 4}" r="15" fill="#d9f0a3" stroke="#7cb342" stroke-width="3"/><path d="M${cx + tw / 2 - 6} ${top - 9} v26 M${cx + tw / 2 - 19} ${top + 4} h26 M${cx + tw / 2 - 15} ${top - 5} l18 18 M${cx + tw / 2 + 3} ${top - 5} l-18 18" stroke="#b5dc6e" stroke-width="1.6"/>`;
  if (opts.straw) s += `<path d="M${cx + 10} ${bottom - 20} L${cx + 26} ${top - 26} l12 -6" stroke="${opts.straw}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  s += `<path d="M${cx - tw / 2 + 9} ${top + 12} L${cx - bw / 2 + 7} ${bottom - 10}" stroke="rgba(255,255,255,.7)" stroke-width="5" stroke-linecap="round"/>`;
  return s;
}

/** Glazed donut with sprinkles, seen from a slight angle. */
function donut(cx, cy, r) {
  const rx = 64, ry = 50, top = cy - 6;
  let s = `<ellipse cx="${cx}" cy="${cy + 6}" rx="${rx}" ry="${ry}" fill="#b8712f"/>`;
  s += `<ellipse cx="${cx}" cy="${top}" rx="${rx}" ry="${ry - 2}" fill="#dc9d55"/>`;
  // wavy pink glaze with small drips
  const pts = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const f = 0.86 + (i % 2 ? 0.05 : -0.02) + (Math.sin(a) > 0.2 && i % 4 === 1 ? 0.07 : 0) + (r() - 0.5) * 0.04;
    pts.push(`${(cx + Math.cos(a) * rx * f).toFixed(1)} ${(top + Math.sin(a) * (ry - 2) * f).toFixed(1)}`);
  }
  s += `<path d="M${pts.join(' L')}Z" fill="#f08fb2" stroke="#e2779f" stroke-width="2" stroke-linejoin="round"/>`;
  s += `<path d="M${cx - rx * 0.62} ${top - 14} Q${cx - rx * 0.3} ${top - ry * 0.78} ${cx + rx * 0.05} ${top - ry * 0.8}" stroke="rgba(255,255,255,.55)" stroke-width="6" fill="none" stroke-linecap="round"/>`;
  // sprinkles on the glaze ring
  const colors = ['#fff6d8', '#7fc8f8', '#f6d33c', '#5bbf6a', '#ffffff', '#8e5bd6'];
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2;
    const d = 0.42 + r() * 0.36;
    const x = cx + Math.cos(a) * rx * d, y = top + Math.sin(a) * (ry - 2) * d;
    const rot = Math.round(r() * 180);
    s += `<rect x="${(x - 5).toFixed(1)}" y="${(y - 1.6).toFixed(1)}" width="10" height="3.2" rx="1.6" fill="${colors[i % colors.length]}" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  }
  // hole shows the plate through
  s += `<ellipse cx="${cx}" cy="${top + 2}" rx="${rx * 0.27}" ry="${ry * 0.24}" fill="${C.plateIn}" stroke="#b06f2c" stroke-width="3"/>`;
  return s;
}

const ART = {
  coffee: () => glass(120, 38, 136, [['#3b2414', 0.62], ['#6b4226', 0.3]], { ice: true, straw: '#ffffff' }),
  matcha: () => glass(120, 38, 136, [['#f4efe2', 0.4], ['#bcd39a', 0.08], ['#78a64a', 0.44]], { ice: true, straw: '#244B38' }),
  donut: (r) => plate(120, 150, 104, 38) + donut(120, 108, r),
  mojito: () => glass(120, 38, 136, [['#cfe8b0', 0.52], ['#e6f4d4', 0.4]], { ice: true, mint: 'mojito', bubbles: true, lime: true, straw: '#F4A340' }),
};

const ART_LABELS = { coffee: 'Coffee', matcha: 'Matcha', donut: 'Donut', mojito: 'Mojito' };

/** Older illustration keys saved on existing menu items → closest cafe illustration. */
const LEGACY = {
  kopi: 'coffee', 'teh-tarik': 'coffee',
  'lemon-tea': 'mojito', bandung: 'mojito', abc: 'mojito',
  cendol: 'matcha',
  karipap: 'donut', popia: 'donut', 'pisang-goreng': 'donut', 'kuih-lapis': 'donut', 'onde-onde': 'donut', 'seri-muka': 'donut',
};

export const ART_KEYS = Object.keys(ART);
export const ART_OPTIONS = ART_KEYS.map((key) => ({ key, label: ART_LABELS[key] }));

/** Any stored key (new or legacy) → one of the four cafe illustrations. */
export function normalizeArt(key) {
  if (ART[key]) return key;
  return LEGACY[key] || 'coffee';
}

/** Default illustration for a category, guessed from its id/name. */
export function artForCategory(cat) {
  const t = `${cat?.id || ''} ${cat?.name || ''}`.toLowerCase();
  if (/matcha|green tea|teh hijau/.test(t)) return 'matcha';
  if (/mojito|soda|sparkl|fizz|juice|\bjus\b|lime|limau|lemon|bandung|mocktail|refresh/.test(t)) return 'mojito';
  if (/donut|doughnut|dessert|pencuci|snack|kuih|pastry|pastri|cake|\bkek\b|bakery|roti|bread|sweet|manis/.test(t)) return 'donut';
  return 'coffee';
}

export function foodArt(key) {
  const k = normalizeArt(key);
  return `<svg class="food-svg" viewBox="0 0 240 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">${ART[k](rng(k))}</svg>`;
}

/** Image element (uploaded photo) or SVG illustration for a menu item. */
export function itemVisual(item, cls = '') {
  if (item.image) {
    return `<img class="food-photo ${cls}" src="${item.image}" alt="${String(item.name).replace(/"/g, '&quot;')}" loading="lazy" decoding="async">`;
  }
  return `<div class="food-art ${cls}">${foodArt(item.art)}</div>`;
}
