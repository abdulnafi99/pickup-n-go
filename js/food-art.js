// ---------------------------------------------------------------------------
// Illustrated food artwork (inline SVG) — works fully offline and keeps the
// playful "plated food" look. Admin-uploaded photos override these.
// ---------------------------------------------------------------------------

function rng(seedStr) {
  let h = 2166136261;
  for (const c of seedStr) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}

const C = {
  plate: '#1e1e1e', plateIn: '#2b2b2b', rim: '#3a3a3a',
  rice: '#fbf6ea', riceDot: '#e9dfc8',
  sambal: '#c4321c', sambalDark: '#8c1f10',
  yolk: '#f7b21c', white: '#fffdf6',
  cucumber: '#4c8a39', cucumberIn: '#d4eab0',
  peanut: '#b8743a', fried: '#b4621f', friedLight: '#d68a3c', bone: '#f3e6cc',
  leaf: '#3d8b3d', leafLight: '#6dbb4a',
};

const plate = (cx = 120, cy = 146, rx = 104, ry = 38) => `
  <ellipse cx="${cx}" cy="${cy + 14}" rx="${rx - 4}" ry="${ry - 12}" fill="rgba(0,0,0,.16)"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${C.plate}"/>
  <ellipse cx="${cx}" cy="${cy - 3}" rx="${rx - 14}" ry="${ry - 9}" fill="${C.plateIn}"/>
  <path d="M${cx - rx + 10} ${cy - 8} Q${cx - rx / 2} ${cy - ry - 2} ${cx} ${cy - ry + 1}" stroke="${C.rim}" stroke-width="3" fill="none" stroke-linecap="round"/>`;

const dome = (cx, cy, w, h) => `M${cx - w / 2} ${cy} C${cx - w / 2} ${cy - h * 1.33} ${cx + w / 2} ${cy - h * 1.33} ${cx + w / 2} ${cy} Z`;

function mound(cx, cy, w, h, color, dot, r) {
  let s = `<path d="${dome(cx, cy, w, h)}" fill="${color}"/>`;
  for (let i = 0; i < 26; i++) {
    const x = cx + (r() - 0.5) * w * 0.8;
    const yMax = h * Math.sqrt(Math.max(0, 1 - ((x - cx) / (w / 2)) ** 2));
    const y = cy - r() * yMax * 0.9 - 2;
    s += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="2.6" ry="1.5" fill="${dot}" transform="rotate(${(r() * 180) | 0} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  }
  return s;
}

const sambal = (x, y, s = 1) => `
  <path d="M${x - 22 * s} ${y} q${4 * s} ${-18 * s} ${22 * s} ${-16 * s} q${20 * s} ${2 * s} ${22 * s} ${14 * s} q${-6 * s} ${12 * s} ${-22 * s} ${10 * s} q${-18 * s} ${2 * s} ${-22 * s} ${-8 * s}z" fill="${C.sambal}"/>
  <circle cx="${x - 8 * s}" cy="${y - 6 * s}" r="${2.4 * s}" fill="${C.sambalDark}"/><circle cx="${x + 6 * s}" cy="${y - 9 * s}" r="${2 * s}" fill="${C.sambalDark}"/>
  <circle cx="${x + 10 * s}" cy="${y}" r="${1.8 * s}" fill="${C.sambalDark}"/><ellipse cx="${x - 3 * s}" cy="${y - 11 * s}" rx="${5 * s}" ry="${2 * s}" fill="rgba(255,255,255,.25)"/>`;

const egg = (x, y, s = 1) => `
  <ellipse cx="${x}" cy="${y}" rx="${17 * s}" ry="${11 * s}" fill="${C.white}"/>
  <ellipse cx="${x + 1}" cy="${y - 1}" rx="${8 * s}" ry="${6 * s}" fill="${C.yolk}"/>
  <ellipse cx="${x - 2}" cy="${y - 3}" rx="${3 * s}" ry="${1.6 * s}" fill="rgba(255,255,255,.6)"/>`;

const friedEgg = (x, y, s = 1) => `
  <path d="M${x - 24 * s} ${y} q${-2 * s} ${-14 * s} ${14 * s} ${-14 * s} q${10 * s} ${-8 * s} ${22 * s} ${0} q${14 * s} ${4 * s} ${8 * s} ${14 * s} q${-8 * s} ${10 * s} ${-24 * s} ${6 * s} q${-16 * s} ${4 * s} ${-20 * s} ${-6 * s}z" fill="${C.white}"/>
  <ellipse cx="${x}" cy="${y - 4 * s}" rx="${9 * s}" ry="${7 * s}" fill="${C.yolk}"/>
  <ellipse cx="${x - 3 * s}" cy="${y - 7 * s}" rx="${3 * s}" ry="${2 * s}" fill="rgba(255,255,255,.55)"/>`;

const cucumber = (x, y, s = 1) => `
  <ellipse cx="${x}" cy="${y}" rx="${10 * s}" ry="${7 * s}" fill="${C.cucumber}"/>
  <ellipse cx="${x}" cy="${y - 1}" rx="${8 * s}" ry="${5.3 * s}" fill="${C.cucumberIn}"/>
  <circle cx="${x - 2 * s}" cy="${y - 1}" r="${1 * s}" fill="#9bc46a"/><circle cx="${x + 2 * s}" cy="${y}" r="${1 * s}" fill="#9bc46a"/>`;

function peanuts(x, y, r, n = 9) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const px = x + (r() - 0.5) * 30, py = y + (r() - 0.5) * 12;
    s += `<ellipse cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" rx="3.6" ry="2.6" fill="${C.peanut}" transform="rotate(${(r() * 90) | 0} ${px.toFixed(1)} ${py.toFixed(1)})"/>`;
  }
  return s;
}

function anchovies(x, y, r, n = 7) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const px = x + (r() - 0.5) * 30, py = y + (r() - 0.5) * 12;
    s += `<path d="M${px.toFixed(1)} ${py.toFixed(1)} q5 -4 11 0" stroke="#a7783f" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
  }
  return s;
}

function chicken(x, y, s = 1, rot = 0, r) {
  let spots = '';
  for (let i = 0; i < 10; i++) {
    spots += `<circle cx="${(x + (r() - 0.6) * 34 * s).toFixed(1)}" cy="${(y + (r() - 0.5) * 18 * s).toFixed(1)}" r="${(1.5 + r() * 2.2) * s}" fill="${C.friedLight}"/>`;
  }
  return `<g transform="rotate(${rot} ${x} ${y})">
    <rect x="${x + 14 * s}" y="${y - 3 * s}" width="${22 * s}" height="${6 * s}" rx="${3 * s}" fill="${C.bone}"/>
    <circle cx="${x + 36 * s}" cy="${y - 4 * s}" r="${4.5 * s}" fill="${C.bone}"/><circle cx="${x + 36 * s}" cy="${y + 4 * s}" r="${4.5 * s}" fill="${C.bone}"/>
    <path d="M${x - 26 * s} ${y} C${x - 28 * s} ${y - 20 * s} ${x + 4 * s} ${y - 22 * s} ${x + 18 * s} ${y - 6 * s} L${x + 18 * s} ${y + 6 * s} C${x + 4 * s} ${y + 22 * s} ${x - 28 * s} ${y + 18 * s} ${x - 26 * s} ${y}Z" fill="${C.fried}"/>
    ${spots}
    <path d="M${x - 18 * s} ${y - 8 * s} q10 -8 22 -4" stroke="rgba(255,255,255,.3)" stroke-width="${3 * s}" fill="none" stroke-linecap="round"/>
  </g>`;
}

function leaves(x, y, r, n = 4, spread = 40) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const px = x + (r() - 0.5) * spread, py = y + (r() - 0.5) * spread * 0.35;
    s += `<ellipse cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" rx="6" ry="3" fill="${i % 2 ? C.leaf : C.leafLight}" transform="rotate(${(r() * 180) | 0} ${px.toFixed(1)} ${py.toFixed(1)})"/>`;
  }
  return s;
}

function noodles(cx, cy, w, h, color, dark, r, thick = 4) {
  let s = `<path d="${dome(cx, cy, w, h)}" fill="${dark}"/>`;
  for (let y = cy - 4; y > cy - h; y -= thick + 1.5) {
    const hw = (w / 2) * Math.sqrt(Math.max(0, 1 - ((cy - y) / h) ** 2)) - 4;
    if (hw < 6) continue;
    let d = `M${(cx - hw).toFixed(1)} ${y.toFixed(1)}`;
    const steps = Math.max(2, Math.round(hw / 9));
    for (let i = 1; i <= steps; i++) {
      const x = cx - hw + (2 * hw * i) / steps;
      d += ` Q${(x - hw / steps).toFixed(1)} ${(y + (i % 2 ? -5 : 5) * (0.6 + r() * 0.6)).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    s += `<path d="${d}" stroke="${color}" stroke-width="${thick}" fill="none" stroke-linecap="round"/>`;
  }
  return s;
}

const prawn = (x, y, rot = 0) => `<g transform="rotate(${rot} ${x} ${y})">
  <path d="M${x - 12} ${y} a12 12 0 1 1 18 10" stroke="#f0743a" stroke-width="7" fill="none" stroke-linecap="round"/>
  <path d="M${x - 12} ${y} a12 12 0 1 1 18 10" stroke="#ffb27a" stroke-width="2" fill="none" stroke-dasharray="3 4"/>
  <path d="M${x + 6} ${y + 10} l6 5 l-1 -7z" fill="#e2582a"/></g>`;

function bowl(cx, cy, rx, ry, body, sauce) {
  return `
  <ellipse cx="${cx}" cy="${cy + ry * 2.2}" rx="${rx * 0.9}" ry="${ry * 0.5}" fill="rgba(0,0,0,.16)"/>
  <path d="M${cx - rx} ${cy} Q${cx - rx * 0.92} ${cy + ry * 2.3} ${cx} ${cy + ry * 2.3} Q${cx + rx * 0.92} ${cy + ry * 2.3} ${cx + rx} ${cy}Z" fill="${body}"/>
  <path d="M${cx - rx * 0.7} ${cy + ry * 0.9} Q${cx - rx * 0.6} ${cy + ry * 1.7} ${cx - rx * 0.25} ${cy + ry * 1.95}" stroke="rgba(255,255,255,.18)" stroke-width="5" fill="none" stroke-linecap="round"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${body}"/>
  <ellipse cx="${cx}" cy="${cy + 1}" rx="${rx - 6}" ry="${ry - 4}" fill="${sauce}"/>`;
}

function chunks(cx, cy, r, color, light, n = 6, spread = 50) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = cx + (r() - 0.5) * spread, y = cy + (r() - 0.5) * spread * 0.3;
    s += `<rect x="${(x - 9).toFixed(1)}" y="${(y - 7).toFixed(1)}" width="18" height="13" rx="5" fill="${color}" transform="rotate(${((r() - 0.5) * 50) | 0} ${x.toFixed(1)} ${y.toFixed(1)})"/>
          <ellipse cx="${(x - 2).toFixed(1)}" cy="${(y - 3).toFixed(1)}" rx="4" ry="2" fill="${light}"/>`;
  }
  return s;
}

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
  if (opts.specks) {
    const r = rng(opts.specks);
    for (let i = 0; i < 26; i++) {
      const yy = bottom - 8 - r() * total * 0.55;
      const xx = cx + (r() - 0.5) * half(yy) * 1.6;
      s += `<path d="M${xx.toFixed(1)} ${yy.toFixed(1)} q3 -3 7 0" stroke="#3f9a3f" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    }
  }
  if (opts.ice) {
    [[-16, 22, -12], [10, 30, 14], [-4, 46, 4]].forEach(([dx, dy, rot]) => {
      s += `<rect x="${cx + dx - 11}" y="${fillTop + dy - 11}" width="22" height="22" rx="5" fill="rgba(255,255,255,.55)" stroke="rgba(255,255,255,.85)" stroke-width="1.5" transform="rotate(${rot} ${cx + dx} ${fillTop + dy})"/>`;
    });
  }
  if (opts.foam) s += `<ellipse cx="${cx}" cy="${fillTop + 3}" rx="${half(fillTop) - 1}" ry="6" fill="${opts.foam}"/>`;
  if (opts.lemon) s += `<circle cx="${cx + tw / 2 - 6}" cy="${top + 4}" r="15" fill="#f6d33c" stroke="#f0b81c" stroke-width="3"/><path d="M${cx + tw / 2 - 6} ${top - 9} v26 M${cx + tw / 2 - 19} ${top + 4} h26" stroke="#fff3b0" stroke-width="2"/>`;
  if (opts.straw) s += `<path d="M${cx + 10} ${bottom - 20} L${cx + 26} ${top - 26} l12 -6" stroke="${opts.straw}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  s += `<path d="M${cx - tw / 2 + 9} ${top + 12} L${cx - bw / 2 + 7} ${bottom - 10}" stroke="rgba(255,255,255,.7)" stroke-width="5" stroke-linecap="round"/>`;
  return s;
}

function skewers(cx, cy, n, r) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = -28 + (i * 56) / Math.max(1, n - 1);
    let meat = '';
    for (let j = 0; j < 4; j++) {
      const mx = cx - 40 + j * 16;
      meat += `<rect x="${mx}" y="${cy - 8}" width="15" height="16" rx="5" fill="${j % 2 ? '#a24a17' : '#8b3a10'}"/><ellipse cx="${mx + 5}" cy="${cy - 3}" rx="3" ry="2" fill="#d1782f"/>`;
    }
    s += `<g transform="rotate(${a.toFixed(1)} ${cx + 40} ${cy + 6})">
      <line x1="${cx - 50}" y1="${cy}" x2="${cx + 54}" y2="${cy}" stroke="#d8b27a" stroke-width="3.5" stroke-linecap="round"/>${meat}</g>`;
  }
  void r;
  return s;
}

function rotiCanai(cx, cy, r) {
  let s = `<ellipse cx="${cx}" cy="${cy}" rx="62" ry="22" fill="#d9a24c"/>
    <path d="M${cx - 60} ${cy - 2} Q${cx - 10} ${cy - 38} ${cx + 58} ${cy - 6} Q${cx + 10} ${cy + 4} ${cx - 60} ${cy - 2}Z" fill="#e8bd6a"/>
    <path d="M${cx - 50} ${cy - 10} Q${cx} ${cy - 30} ${cx + 44} ${cy - 10}" stroke="#f6dc9a" stroke-width="3" fill="none"/>`;
  for (let i = 0; i < 12; i++) {
    const x = cx + (r() - 0.5) * 100, y = cy + (r() - 0.6) * 22;
    s += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${3 + r() * 4}" ry="2" fill="#b77a2c" opacity=".8"/>`;
  }
  return s;
}

function fritter(x, y, w, h, color, light, rot, r) {
  let s = `<g transform="rotate(${rot} ${x} ${y})"><rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="${color}"/>`;
  for (let i = 0; i < 6; i++) s += `<circle cx="${(x + (r() - 0.5) * w * 0.8).toFixed(1)}" cy="${(y + (r() - 0.5) * h * 0.6).toFixed(1)}" r="${1.5 + r() * 2}" fill="${light}"/>`;
  return s + `<path d="M${x - w / 2 + 6} ${y - h / 4} H${x + w / 2 - 8}" stroke="rgba(255,255,255,.3)" stroke-width="3" stroke-linecap="round"/></g>`;
}

const puff = (x, y, rot = 0) => `<g transform="rotate(${rot} ${x} ${y})">
  <path d="M${x - 26} ${y + 6} Q${x} ${y - 34} ${x + 26} ${y + 6}Z" fill="#e2a447"/>
  <path d="M${x - 26} ${y + 6} Q${x} ${y - 34} ${x + 26} ${y + 6}" stroke="#c07d25" stroke-width="5" stroke-dasharray="4 4" fill="none"/>
  <path d="M${x - 12} ${y - 6} q10 -10 22 -2" stroke="#f5d18c" stroke-width="3" fill="none" stroke-linecap="round"/></g>`;

function layered(x, y, colors, w = 40, layerH = 5, rot = 0) {
  let s = `<g transform="rotate(${rot} ${x} ${y})">`;
  colors.forEach((c, i) => {
    s += `<rect x="${x - w / 2}" y="${y - (i + 1) * layerH}" width="${w}" height="${layerH + 0.5}" fill="${c}"/>`;
  });
  s += `<path d="M${x - w / 2} ${y - colors.length * layerH} l10 -8 h${w} l-10 8z" fill="${colors[colors.length - 1]}" opacity=".85"/>
        <path d="M${x + w / 2} ${y} l10 -8 v${-colors.length * layerH} l-10 8z" fill="rgba(0,0,0,.18)"/></g>`;
  return s;
}

function balls(cx, cy, r, n = 5) {
  let s = '';
  const pos = [[-30, 4], [0, 8], [30, 4], [-15, -14], [15, -14], [0, -30]].slice(0, n);
  pos.forEach(([dx, dy]) => {
    const x = cx + dx, y = cy + dy;
    s += `<circle cx="${x}" cy="${y}" r="17" fill="#3f9b47"/><circle cx="${x - 5}" cy="${y - 6}" r="5" fill="rgba(255,255,255,.25)"/>`;
    for (let i = 0; i < 9; i++) s += `<rect x="${(x + (r() - 0.5) * 26).toFixed(1)}" y="${(y + (r() - 0.5) * 26).toFixed(1)}" width="4" height="1.6" fill="#fffbe9" transform="rotate(${(r() * 180) | 0} ${x} ${y})"/>`;
  });
  return s;
}

function shavedIce(cx, cy, r) {
  let s = `<path d="${dome(cx, cy, 96, 56)}" fill="#fff"/>`;
  s += `<path d="M${cx - 44} ${cy - 20} Q${cx - 10} ${cy - 70} ${cx + 10} ${cy - 30} Q${cx + 30} ${cy - 70} ${cx + 44} ${cy - 18}" stroke="#e84a6f" stroke-width="12" fill="none" stroke-linecap="round" opacity=".9"/>
        <path d="M${cx - 30} ${cy - 8} Q${cx} ${cy - 40} ${cx + 34} ${cy - 6}" stroke="#7a3b16" stroke-width="8" fill="none" stroke-linecap="round" opacity=".85"/>`;
  for (let i = 0; i < 10; i++) {
    const x = cx + (r() - 0.5) * 70, y = cy - 10 - r() * 40;
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${['#f5c542', '#3fae5a', '#e2582a', '#fff3c4'][i % 4]}"/>`;
  }
  return s;
}

const ART = {
  'nasi-lemak-ayam': (r) => plate() + mound(96, 140, 86, 50, C.rice, C.riceDot, r) + sambal(132, 126, 1.05) + egg(150, 140) + cucumber(74, 146) + cucumber(90, 150) + peanuts(112, 152, r) + chicken(160, 112, 0.95, -18, r) + leaves(96, 90, r, 3, 16),
  'nasi-lemak': (r) => plate() + mound(110, 140, 96, 54, C.rice, C.riceDot, r) + sambal(140, 128, 1.15) + egg(84, 144) + cucumber(150, 150) + cucumber(166, 144) + peanuts(112, 152, r, 10) + anchovies(150, 112, r) + leaves(110, 86, r, 3, 16),
  'nasi-goreng': (r) => plate() + mound(118, 142, 120, 58, '#d4924a', '#b5702d', r) + leaves(118, 120, r, 7, 80) + friedEgg(118, 98) + cucumber(64, 148) + `<circle cx="174" cy="142" r="9" fill="#e2582a"/><circle cx="160" cy="150" r="6" fill="#c4321c"/>`,
  'mee-goreng': (r) => plate() + noodles(118, 146, 150, 64, '#e08a35', '#9d4f19', r) + leaves(118, 118, r, 6, 90) + egg(150, 108, 0.9) + `<circle cx="78" cy="104" r="10" fill="#78b043"/><circle cx="78" cy="104" r="7" fill="#c8e68e"/>`,
  'char-kuey-teow': (r) => plate() + noodles(118, 146, 150, 62, '#8c5a2e', '#5b3414', r, 6) + prawn(90, 110, -20) + prawn(146, 112, 30) + leaves(118, 120, r, 6, 90) + `<path d="M100 96 q8 -6 18 0 M126 92 q6 -5 14 0" stroke="#f3ecd2" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  'rendang': (r) => bowl(120, 98, 86, 28, '#2a2a2a', '#5a2a10') + chunks(120, 100, r, '#3d1a07', '#7a3b14', 8, 110) + leaves(118, 92, r, 5, 80),
  'ayam-goreng': (r) => plate() + chicken(90, 128, 1.05, -10, r) + chicken(146, 136, 1, 15, r) + chicken(118, 104, 0.95, 0, r) + `<path d="M58 150 q8 -10 18 -2" stroke="#78b043" stroke-width="7" fill="none" stroke-linecap="round"/>`,
  'roti-canai': (r) => plate() + rotiCanai(104, 140, r) + bowl(170, 108, 30, 11, '#2b2b2b', '#e8b33a') + `<circle cx="164" cy="108" r="3" fill="#c4321c"/><circle cx="174" cy="110" r="2.5" fill="#7a9a2a"/>`,
  'satay': (r) => plate() + skewers(108, 132, 5, r) + bowl(172, 112, 28, 10, '#2b2b2b', '#a8581f') + `<ellipse cx="66" cy="152" rx="14" ry="6" fill="#f2efe2"/><ellipse cx="166" cy="110" rx="10" ry="3" fill="#c7743a"/>`,
  'karipap': () => plate() + puff(84, 140, -8) + puff(150, 142, 10) + puff(118, 118, 0) + puff(110, 152, 4),
  'popia': (r) => plate() + fritter(96, 136, 82, 22, '#d99a43', '#f0c36d', -14, r) + fritter(140, 140, 82, 22, '#cf8d36', '#f0c36d', 10, r) + fritter(118, 116, 82, 22, '#dfa34c', '#f5cf80', -2, r) + bowl(178, 104, 20, 8, '#2b2b2b', '#c4321c'),
  'pisang-goreng': (r) => plate() + fritter(92, 138, 74, 28, '#d9902f', '#f2c76a', -24, r) + fritter(146, 140, 74, 28, '#cf8526', '#f2c76a', 18, r) + fritter(118, 114, 74, 28, '#e09c38', '#f5d082', -4, r),
  'cendol': () => glass(120, 40, 132, [['#6b3415', 0.18], ['#f4efe2', 0.42], ['#d8cfb8', 0.3]], { tw: 96, bw: 70, specks: 'cendol', gap: 4 }) + `<path d="M84 48 q36 18 72 0" stroke="#5a2a0f" stroke-width="7" fill="none" stroke-linecap="round" opacity=".85"/>`,
  'abc': (r) => bowl(120, 120, 74, 22, '#2a2a2a', '#e9e4da') + shavedIce(120, 122, r),
  'teh-tarik': () => glass(120, 34, 138, [['#b8743c', 0.8], ['#d9a46a', 0.12]], { foam: '#f6e3c3' }),
  'lemon-tea': () => glass(120, 38, 136, [['#c76a1a', 0.55], ['#e48b2c', 0.38]], { ice: true, lemon: true, straw: '#244B38' }),
  'bandung': () => glass(120, 38, 136, [['#e05d8a', 0.6], ['#f39ab8', 0.32]], { ice: true, straw: '#F4A340' }),
  'kopi': () => glass(120, 38, 136, [['#3b2414', 0.62], ['#6b4226', 0.3]], { ice: true, straw: '#ffffff' }),
  'kuih-lapis': () => plate() + layered(86, 150, ['#e2366a', '#fff3e0', '#e2366a', '#fff3e0', '#e2366a', '#fff3e0', '#e2366a'], 40, 5, -6) + layered(142, 152, ['#e2366a', '#fff3e0', '#e2366a', '#fff3e0', '#e2366a', '#fff3e0', '#e2366a'], 40, 5, 8) + layered(116, 128, ['#e2366a', '#fff3e0', '#e2366a', '#fff3e0', '#e2366a', '#fff3e0', '#e2366a'], 40, 5, 0),
  'onde-onde': (r) => plate() + balls(118, 138, r, 6),
  'seri-muka': () => plate() + layered(88, 152, ['#fbf6ea', '#fbf6ea', '#fbf6ea', '#fbf6ea', '#2f9a52', '#3fae5a'], 46, 6, -6) + layered(146, 152, ['#fbf6ea', '#fbf6ea', '#fbf6ea', '#fbf6ea', '#2f9a52', '#3fae5a'], 46, 6, 8),
  'combo-nasi-lemak': (r) => `<g transform="translate(-30 10) scale(.92)">${ART['nasi-lemak-ayam'](r)}</g><g transform="translate(118 40) scale(.62)">${ART['teh-tarik']()}</g>`,
  'combo-mee': (r) => `<g transform="translate(-30 10) scale(.92)">${ART['mee-goreng'](r)}</g><g transform="translate(118 40) scale(.62)">${ART['lemon-tea']()}</g>`,
  'combo-satay': (r) => plate(120, 146, 110, 40) + skewers(104, 130, 6, r) + layered(170, 150, ['#e9f0c9', '#e9f0c9', '#e9f0c9', '#f4f6e4'], 24, 5, 0) + layered(186, 136, ['#e9f0c9', '#e9f0c9', '#e9f0c9', '#f4f6e4'], 24, 5, 0) + bowl(66, 104, 26, 10, '#2b2b2b', '#a8581f'),
};

export const ART_KEYS = Object.keys(ART);

export function foodArt(key) {
  const fn = ART[key] || ART['nasi-lemak'];
  return `<svg class="food-svg" viewBox="0 0 240 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">${fn(rng(key))}</svg>`;
}

/** Image element (uploaded photo) or SVG illustration for a menu item. */
export function itemVisual(item, cls = '') {
  if (item.image) {
    return `<img class="food-photo ${cls}" src="${item.image}" alt="${String(item.name).replace(/"/g, '&quot;')}" loading="lazy" decoding="async">`;
  }
  return `<div class="food-art ${cls}">${foodArt(item.art)}</div>`;
}
