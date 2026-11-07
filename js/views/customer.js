// ---------------------------------------------------------------------------
// Customer-facing views: welcome, home, catalog, item, cart, checkout,
// order confirmation, my orders dashboard, profile, login
// ---------------------------------------------------------------------------
import { Store, ACTIVE_STATUSES } from '../store.js';
import { Cart, unitPrice, defaultVariant, variantText } from '../cart.js';
import { CATEGORIES } from '../sample-data.js';
import { itemVisual, foodArt } from '../food-art.js';
import { $, $$, esc, money, greeting, initials, fmtDate, fmtTime, todayStr, orderId, isValidPhone, isValidEmail, compressImage, debounce } from '../utils.js';
import { icon, toast, modal, confirmDialog, busy, badge, loading } from '../ui.js';
import { slotsForDate, upcomingDates, immediateSlot, assertSlotBookable } from '../pickup.js';
import { waLink, orderToShopMessage, shareMessage, contactShopLink, openWhatsApp, PAY_LABEL, locationName } from '../whatsapp.js';
import { renderQR, orderQRText } from '../qr.js';
import { itemsHTML, totalsHTML, trackerHTML, pickupInfoHTML, customerHTML, paymentHTML, downloadReceipt, viewImage } from './shared.js';
import { installState, promptInstall } from '../pwa.js';
import { notifySupport, permission, savedSubscription, enableNotifications, disableNotifications, sendTestNotification, rememberMyOrder, myOrderIds } from '../push.js';

const catName = (id) => CATEGORIES.find((c) => c.id === id)?.name || id;
const catIcon = (id) => CATEGORIES.find((c) => c.id === id)?.icon || '🍽️';
const isFav = (id) => (Store.user.favourites || []).includes(id);

function myOrders() {
  const u = Store.user;
  const local = new Set(myOrderIds());
  return Store.orders.filter((o) => local.has(o.id) || o.customer?.uid === u.id || (u.role === 'customer' && u.phone && o.customer?.phone === u.phone));
}

// ---------------------------------------------------------------------------
// Reusable pieces
// ---------------------------------------------------------------------------
function foodCard(m, { size = '' } = {}) {
  return `<article class="fcard ${size} ${m.available ? '' : 'soldout'}" data-id="${m.id}">
    <a href="#/item/${m.id}" class="fcard-link" aria-label="${esc(m.name)}">
      <div class="fcard-art">${itemVisual(m)}</div>
      <div class="fcard-panel">
        <h3>${esc(m.name)}</h3>
        <p>${esc(catName(m.category))}</p>
        <div class="fcard-foot">
          <span class="price">${money(m.price)}</span>
          ${m.available ? '' : '<span class="tag-sold">Sold Out</span>'}
        </div>
      </div>
    </a>
    <button class="fav-btn ${isFav(m.id) ? 'on' : ''}" data-fav="${m.id}" aria-label="Favourite">${isFav(m.id) ? icon.heartFill : icon.heart}</button>
    ${m.available ? `<button class="quick-add" data-add="${m.id}" aria-label="Add ${esc(m.name)} to cart">${icon.plus}</button>` : ''}
  </article>`;
}

function rowCard(m) {
  return `<a class="row-card ${m.available ? '' : 'soldout'}" href="#/item/${m.id}">
    <div class="row-art">${itemVisual(m)}</div>
    <div class="row-main">
      <strong>${esc(m.name)}</strong>
      <small>${esc(m.desc)}</small>
      <div class="row-meta"><span class="price">${money(m.price)}</span><span class="rating">${icon.star} ${m.rating ?? '4.5'}</span>${m.available ? '' : '<span class="tag-sold">Sold Out</span>'}</div>
    </div>
  </a>`;
}

function catPills(active, { all = true, link = false } = {}) {
  const pills = (all ? [{ id: '', name: 'All', icon: '✨' }] : []).concat(CATEGORIES);
  return `<div class="pills" role="tablist">${pills
    .map((c) =>
      link
        ? `<a class="pill ${active === c.id ? 'active' : ''}" href="#/menu?cat=${c.id}"><span>${c.icon}</span>${esc(c.name)}</a>`
        : `<button class="pill ${active === c.id ? 'active' : ''}" data-cat="${c.id}" role="tab" aria-selected="${active === c.id}"><span>${c.icon}</span>${esc(c.name)}</button>`
    )
    .join('')}</div>`;
}

/** Shared handlers for quick-add + favourite buttons in any card list. */
function bindCards(root, ctx) {
  root.addEventListener('click', async (e) => {
    const add = e.target.closest('[data-add]');
    const fav = e.target.closest('[data-fav]');
    if (add) {
      e.preventDefault();
      const m = Store.menuItem(add.dataset.add);
      if (!m?.available) return toast('Sorry, this item is sold out.', 'error');
      Cart.add(m, 1, defaultVariant(m));
      add.classList.add('pop');
      setTimeout(() => add.classList.remove('pop'), 400);
      toast(`${m.name} added to cart`, 'success');
    } else if (fav) {
      e.preventDefault();
      const on = await Store.toggleFavourite(fav.dataset.fav);
      fav.classList.toggle('on', on);
      fav.innerHTML = on ? icon.heartFill : icon.heart;
      toast(on ? 'Saved to favourites' : 'Removed from favourites');
    }
  });
  void ctx;
}

const sectionHead = (title, link, linkText = 'See all') =>
  `<div class="sec-head"><h2>${esc(title)}</h2>${link ? `<a href="${link}">${linkText} ${icon.chevronRight}</a>` : ''}</div>`;

const emptyState = (emoji, title, text, action = '') =>
  `<div class="empty"><div class="empty-emoji">${emoji}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;

// ---------------------------------------------------------------------------
// Notification opt-in card (order page + profile)
// ---------------------------------------------------------------------------
function notifyCardHTML({ compact = false } = {}) {
  const sup = notifySupport();
  const perm = permission();
  const push = !!savedSubscription();
  let body;
  if (sup.needsInstall) {
    body = `<p>Di iPhone/iPad, notifikasi hanya berfungsi selepas app dipasang: tekan <b>Share</b> → <b>Add to Home Screen</b>, kemudian buka PICK UP N GO dari Home Screen.</p>`;
  } else if (!sup.supported) {
    body = `<p>Browser ini tidak menyokong notifikasi. Anda masih boleh semak status di <b>My Orders</b>.</p>`;
  } else if (perm === 'denied') {
    body = `<p>Notifikasi disekat. Benarkan notifikasi untuk laman ini dalam tetapan browser / telefon, kemudian muat semula.</p>`;
  } else if (perm === 'granted') {
    body = `<p class="ok">✓ Notifikasi aktif${push ? ' — anda akan dimaklumkan walaupun app ditutup.' : ' (dalam app sahaja — push server tidak tersedia).'}</p>
      <div class="btn-row"><button class="btn btn-ghost btn-sm" data-notify-test>Hantar ujian</button>${compact ? '' : '<button class="btn btn-ghost btn-sm" data-notify-off>Matikan</button>'}</div>`;
  } else {
    body = `<p>Kami akan beritahu bila pesanan anda disahkan, sedang disediakan dan <b>sedia untuk diambil</b>.</p>
      <button class="btn btn-primary btn-block" data-notify-on>🔔 Hidupkan Notifikasi</button>`;
  }
  if (compact && perm === 'granted') return '';
  return `<div class="card notify-card"><div class="notify-head"><span class="notify-ico">🔔</span><h3>Notifikasi Pesanan</h3></div>${body}</div>`;
}

function bindNotify(root, ctx) {
  root.addEventListener('click', (e) => {
    const on = e.target.closest('[data-notify-on]');
    const off = e.target.closest('[data-notify-off]');
    const test = e.target.closest('[data-notify-test]');
    if (on) {
      busy(on, async () => {
        const r = await enableNotifications();
        toast(r.push ? 'Notifikasi push diaktifkan 🔔' : 'Notifikasi dalam app diaktifkan', 'success');
        ctx.refresh();
      });
    } else if (off) {
      busy(off, async () => { await disableNotifications(); toast('Notifikasi dimatikan'); ctx.refresh(); });
    } else if (test) {
      busy(test, async () => {
        const via = await sendTestNotification();
        toast(via === 'push' ? 'Push ujian dihantar — semak notifikasi anda' : 'Notifikasi ujian dipaparkan', 'success');
      });
    }
  });
}

// ---------------------------------------------------------------------------
// WELCOME (onboarding)
// ---------------------------------------------------------------------------
export const welcome = {
  chrome: 'none',
  render() {
    return `<section class="welcome">
      <div class="welcome-top">
        <span class="logo-mark sm">${logoSVG()}</span>
        <span class="welcome-skip"><a href="#/home" data-start>Skip</a></span>
      </div>
      <h1 class="welcome-title">Pick Up<br>N Go</h1>
      <p class="welcome-time">${icon.clock} Ready in as fast as 15 min</p>
      <div class="welcome-hero">
        <div class="blob"></div>
        <div class="welcome-art">${foodArt('nasi-lemak-ayam')}</div>
      </div>
      <p class="welcome-text">Pre-order your favourite Malaysian food, choose your pickup date &amp; time, and just grab it at the counter — <strong>no more long queues.</strong></p>
      <ul class="welcome-steps">
        <li><b>1</b> Browse &amp; add to cart</li>
        <li><b>2</b> Pick date &amp; time</li>
        <li><b>3</b> Show QR &amp; collect</li>
      </ul>
      <button class="btn btn-dark btn-block btn-lg" data-start>Get Started</button>
    </section>`;
  },
  mount(root, ctx) {
    $$('[data-start]', root).forEach((b) =>
      b.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.setItem('png_welcomed', '1');
        ctx.go('#/home');
      })
    );
  },
};

export function logoSVG() {
  return `<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="14" fill="#244B38"/><path d="M14 18h20l-1.6 17.5a2 2 0 0 1-2 1.8H17.6a2 2 0 0 1-2-1.8L14 18Z" fill="#F4A340"/><path d="M19 18v-2.5a5 5 0 0 1 10 0V18" stroke="#FFF9F0" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="m20 27 3 3 6-6" stroke="#244B38" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// ---------------------------------------------------------------------------
// HOME
// ---------------------------------------------------------------------------
export const home = {
  chrome: 'customer',
  live: true,
  render() {
    const u = Store.user;
    const menu = Store.menu;
    const featured = menu.filter((m) => m.featured);
    const recommended = menu.filter((m) => m.recommended).slice(0, 6);
    const popular = menu.filter((m) => m.popular).slice(0, 8);
    const latest = [...menu].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 5);
    const active = myOrders().filter((o) => ACTIVE_STATUSES.includes(o.status));
    const promo = (Store.settings.promos || []).find((p) => p.active);
    const inst = installState();

    return `<section class="page home">
      <div class="brandbar">
        <span class="logo-mark">${logoSVG()}</span>
        <span class="brand-name">PICK UP <em>N</em> GO</span>
        <a href="#/profile" class="avatar" aria-label="Profile">${esc(initials(u.name))}</a>
      </div>
      <div class="hello">
        <p>${greeting()} 👋</p>
        <h1>${esc(u.name ? u.name.split(' ')[0] : 'Food Lover')}</h1>
      </div>

      <form class="search" data-search role="search">
        ${icon.search}
        <input type="search" name="q" placeholder="What are you craving?" aria-label="Search food" autocomplete="off">
      </form>

      ${active.length ? `<a class="active-order" href="#/order/${active[0].id}">
          <span class="ao-pulse"></span>
          <div><small>Active order • ${esc(active[0].id)}</small><strong>${esc(active[0].status)}</strong><small>Pickup ${fmtDate(active[0].pickupDate, false)} • ${fmtTime(active[0].pickupTime)}</small></div>
          ${icon.chevronRight}
        </a>` : ''}

      <div class="promo">
        <div class="promo-text">
          <span class="promo-chip">Skip the queue</span>
          <h2>Pre-order now,<br>pick up on time!</h2>
          ${promo ? `<p>Use code <b>${esc(promo.code)}</b> — ${promo.type === 'percent' ? promo.value + '% off' : money(promo.value) + ' off'}${promo.minSpend ? ` (min ${money(promo.minSpend)})` : ''}</p>` : '<p>Fresh food, ready when you arrive.</p>'}
          <a href="#/menu" class="btn btn-accent btn-sm">Order Now</a>
        </div>
        <div class="promo-art">${foodArt('mee-goreng')}</div>
      </div>

      ${sectionHead('Categories')}
      ${catPills(null, { all: false, link: true })}

      ${featured.length ? sectionHead('Featured Menu', '#/menu') + `<div class="h-scroll">${featured.map((m) => foodCard(m, { size: 'lg' })).join('')}</div>` : ''}

      ${sectionHead('Recommended', '#/menu?sort=recommended')}
      <div class="grid">${recommended.map((m) => foodCard(m)).join('')}</div>

      ${sectionHead('Popular Menu', '#/menu?sort=popular')}
      <div class="h-scroll">${popular.map((m) => foodCard(m)).join('')}</div>

      ${sectionHead('Latest Menu', '#/menu?sort=latest')}
      <div class="rows">${latest.map(rowCard).join('')}</div>

      ${inst.canInstall || inst.ios ? `<div class="install-card">
          <span class="install-ico">${icon.install}</span>
          <div><strong>Install PICK UP N GO</strong><small>${inst.ios ? 'Tap Share → “Add to Home Screen”' : 'Add to your home screen for faster ordering'}</small></div>
          ${inst.canInstall ? '<button class="btn btn-primary btn-sm" data-install>Install</button>' : ''}
        </div>` : ''}

      <a href="#/menu" class="btn btn-primary btn-block btn-lg order-now">Order Now ${icon.chevronRight}</a>
      <a class="contact-link" href="${contactShopLink()}" target="_blank" rel="noopener">${icon.whatsapp} Questions? WhatsApp the shop</a>
    </section>`;
  },
  mount(root, ctx) {
    bindCards(root, ctx);
    $('[data-search]', root).addEventListener('submit', (e) => {
      e.preventDefault();
      const q = new FormData(e.target).get('q').trim();
      ctx.go(`#/menu${q ? '?q=' + encodeURIComponent(q) : ''}`);
    });
    $('[data-install]', root)?.addEventListener('click', promptInstall);
  },
};

// ---------------------------------------------------------------------------
// CATALOG
// ---------------------------------------------------------------------------
const catalogState = { q: '', cat: '', sort: 'recommended', avail: false };

function filteredMenu() {
  const { q, cat, sort, avail } = catalogState;
  const needle = q.trim().toLowerCase();
  let list = Store.menu.filter(
    (m) =>
      (!cat || m.category === cat) &&
      (!avail || m.available) &&
      (!needle || `${m.name} ${m.desc} ${catName(m.category)}`.toLowerCase().includes(needle))
  );
  const sorters = {
    recommended: (a, b) => (b.recommended - a.recommended) || (b.featured - a.featured) || (b.available - a.available),
    popular: (a, b) => (b.popular - a.popular) || (b.rating || 0) - (a.rating || 0),
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    name: (a, b) => a.name.localeCompare(b.name),
    latest: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
  };
  list = [...list].sort(sorters[sort] || sorters.recommended);
  return list;
}

export const catalog = {
  chrome: 'customer',
  live: true,
  enter(ctx) {
    catalogState.q = ctx.query.q || '';
    catalogState.cat = ctx.query.cat || '';
    if (ctx.query.sort) catalogState.sort = ctx.query.sort;
  },
  render() {
    const list = filteredMenu();
    const { q, cat, sort, avail } = catalogState;
    const showRec = !q && !cat;
    const rec = Store.menu.filter((m) => m.recommended && m.available).slice(0, 6);
    return `<section class="page catalog">
      <div class="page-head">
        <a href="#/home" class="icon-btn" aria-label="Back">${icon.back}</a>
        <h1>Food Catalog</h1>
        <a href="#/cart" class="icon-btn" aria-label="Cart">${icon.bag}</a>
      </div>
      <form class="search" data-search role="search">
        ${icon.search}
        <input type="search" name="q" value="${esc(q)}" placeholder="Search nasi lemak, teh tarik…" aria-label="Search menu" autocomplete="off">
      </form>
      ${catPills(cat)}
      <div class="toolbar">
        <label class="select-wrap"><span class="sr-only">Sort</span>
          <select data-sort>
            ${[['recommended', 'Recommended'], ['popular', 'Most Popular'], ['price-asc', 'Price: Low → High'], ['price-desc', 'Price: High → Low'], ['name', 'Name A–Z'], ['latest', 'Latest']]
              .map(([v, l]) => `<option value="${v}" ${sort === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </label>
        <label class="switch"><input type="checkbox" data-avail ${avail ? 'checked' : ''}><span></span> Available only</label>
      </div>

      ${showRec && rec.length ? `${sectionHead('Recommended for you')}<div class="h-scroll">${rec.map((m) => foodCard(m)).join('')}</div>${sectionHead('All Menu')}` : ''}

      <p class="count" data-count>${list.length} item${list.length === 1 ? '' : 's'}${cat ? ` in ${esc(catName(cat))}` : ''}${q ? ` for “${esc(q)}”` : ''}</p>
      <div class="grid" data-grid>${list.length ? list.map((m) => foodCard(m)).join('') : ''}</div>
      ${list.length ? '' : emptyState('🔍', 'No food found', 'Try another keyword or category.', '<button class="btn btn-ghost" data-clear>Clear filters</button>')}
    </section>`;
  },
  mount(root, ctx) {
    bindCards(root, ctx);
    const input = $('[data-search] input', root);
    $('[data-search]', root).addEventListener('submit', (e) => { e.preventDefault(); input.blur(); });
    input.addEventListener('input', debounce(() => {
      catalogState.q = input.value;
      ctx.refresh({ keepFocus: '[data-search] input' });
    }, 250));
    root.addEventListener('click', (e) => {
      const pill = e.target.closest('[data-cat]');
      if (pill) { catalogState.cat = pill.dataset.cat; ctx.refresh(); }
      if (e.target.closest('[data-clear]')) { Object.assign(catalogState, { q: '', cat: '', avail: false }); ctx.refresh(); }
    });
    $('[data-sort]', root).addEventListener('change', (e) => { catalogState.sort = e.target.value; ctx.refresh(); });
    $('[data-avail]', root).addEventListener('change', (e) => { catalogState.avail = e.target.checked; ctx.refresh(); });
  },
};

// ---------------------------------------------------------------------------
// ITEM DETAIL
// ---------------------------------------------------------------------------
const itemState = { id: null, variant: {}, qty: 1, note: '' };

export const item = {
  chrome: 'none',
  live: true,
  enter(ctx) {
    const m = Store.menuItem(ctx.params[0]);
    Object.assign(itemState, { id: ctx.params[0], variant: m ? defaultVariant(m) : {}, qty: 1, note: '' });
  },
  render() {
    const m = Store.menuItem(itemState.id);
    if (!m) return `<section class="page">${emptyState('🍽️', 'Menu not found', 'This item may have been removed.', '<a class="btn btn-primary" href="#/menu">Back to menu</a>')}</section>`;
    const price = unitPrice(m, itemState.variant);
    const related = Store.menu.filter((x) => x.category === m.category && x.id !== m.id).slice(0, 6);
    return `<section class="detail ${m.available ? '' : 'soldout'}">
      <div class="detail-top">
        <button class="icon-btn" data-back aria-label="Back">${icon.back}</button>
        <div class="detail-actions">
          <button class="icon-btn ${isFav(m.id) ? 'on' : ''}" data-fav="${m.id}" aria-label="Favourite">${isFav(m.id) ? icon.heartFill : icon.heart}</button>
          <button class="icon-btn" data-share aria-label="Share">${icon.share}</button>
        </div>
      </div>
      <div class="detail-hero">${itemVisual(m, 'hero')}</div>
      <div class="detail-panel">
        <span class="panel-chevron">${icon.chevronDown}</span>
        <div class="detail-title">
          <h1>${esc(m.name)}</h1>
          <span class="rating-chip">${icon.star} ${m.rating ?? '4.5'}</span>
        </div>
        <p class="detail-cat">${catIcon(m.category)} ${esc(catName(m.category))} ${m.available ? '<span class="avail ok">● Available</span>' : '<span class="avail no">● Sold Out</span>'}</p>

        <h3>Details</h3>
        <div class="chips-round">
          <div class="chip-round"><span>${icon.clock}</span><b>${m.prepMin || 10}</b><small>min</small></div>
          <div class="chip-round"><span>${icon.people}</span><b>${String(m.serves || 1).padStart(2, '0')}</b><small>Serves</small></div>
          <div class="chip-round"><span>${icon.fire}</span><b>${m.kcal || '-'}</b><small>kcal</small></div>
          <div class="chip-round"><span>${icon.wallet}</span><b>${Number(m.price).toFixed(0)}</b><small>RM</small></div>
        </div>

        <h3>Description</h3>
        <p class="detail-desc">${esc(m.desc)}</p>

        ${(m.variants || []).map((g) => `<h3>${esc(g.name)}</h3>
          <div class="opt-row" data-group="${esc(g.name)}">${g.options
            .map((o) => `<button class="opt ${itemState.variant[g.name] === o.label ? 'on' : ''}" data-opt="${esc(o.label)}">${esc(o.label)}${o.price ? `<small>${o.price > 0 ? '+' : '−'}${money(Math.abs(o.price))}</small>` : ''}</button>`)
            .join('')}</div>`).join('')}

        <h3>Quantity</h3>
        <div class="qty-row">
          <div class="stepper big">
            <button data-qty="-1" aria-label="Decrease">${icon.minus}</button>
            <output data-qty-out>${itemState.qty}</output>
            <button data-qty="1" aria-label="Increase">${icon.plus}</button>
          </div>
          <div class="line-total"><small>Total</small><strong data-total>${money(price * itemState.qty)}</strong></div>
        </div>

        <h3>Special note <small>(optional)</small></h3>
        <textarea class="input dark" data-note rows="2" maxlength="140" placeholder="e.g. No peanuts, sambal separate">${esc(itemState.note)}</textarea>

        ${m.available
          ? `<div class="swipe" data-swipe role="group" aria-label="Add to cart">
              <div class="swipe-fill"></div>
              <button class="swipe-thumb" data-swipe-thumb aria-label="Add to cart">${icon.chevronRight}${icon.chevronRight}</button>
              <span class="swipe-text">Slide to add • <b data-total>${money(price * itemState.qty)}</b></span>
            </div>
            <button class="btn btn-accent btn-block" data-add-now>Add to Cart</button>`
          : `<div class="soldout-box">This item is sold out today. Check back soon!</div>`}

        ${related.length ? `<h3>You may also like</h3><div class="h-scroll on-dark">${related.map((x) => foodCard(x)).join('')}</div>` : ''}
      </div>
    </section>`;
  },
  mount(root, ctx) {
    const m = Store.menuItem(itemState.id);
    if (!m) return;
    bindCards($('.h-scroll', root) || document.createElement('div'), ctx);
    const updateTotals = () => {
      const p = unitPrice(m, itemState.variant) * itemState.qty;
      $$('[data-total]', root).forEach((el) => (el.textContent = money(p)));
      $('[data-qty-out]', root).textContent = itemState.qty;
    };
    $('[data-back]', root).addEventListener('click', () => (history.length > 1 ? history.back() : ctx.go('#/menu')));
    root.addEventListener('click', async (e) => {
      const opt = e.target.closest('[data-opt]');
      if (opt) {
        const g = opt.closest('[data-group]');
        itemState.variant[g.dataset.group] = opt.dataset.opt;
        $$('.opt', g).forEach((b) => b.classList.toggle('on', b === opt));
        updateTotals();
      }
      const q = e.target.closest('[data-qty]');
      if (q) {
        itemState.qty = Math.max(1, Math.min(99, itemState.qty + Number(q.dataset.qty)));
        updateTotals();
      }
      const fav = e.target.closest('.detail-actions [data-fav]');
      if (fav) {
        const on = await Store.toggleFavourite(m.id);
        fav.innerHTML = on ? icon.heartFill : icon.heart;
        toast(on ? 'Saved to favourites' : 'Removed from favourites');
      }
      if (e.target.closest('[data-share]')) {
        const text = `Jom cuba *${m.name}* (${money(m.price)}) di ${Store.settings.shopName}! 😋\n${location.origin}${location.pathname}#/item/${m.id}`;
        if (navigator.share) navigator.share({ title: m.name, text }).catch(() => {});
        else openWhatsApp(waLink('', text));
      }
      if (e.target.closest('[data-add-now]')) addToCart();
    });
    $('[data-note]', root)?.addEventListener('input', (e) => (itemState.note = e.target.value));

    const addToCart = () => {
      const fresh = Store.menuItem(m.id);
      if (!fresh?.available) return toast('Sorry, this item just sold out.', 'error');
      Cart.add(fresh, itemState.qty, { ...itemState.variant }, itemState.note);
      toast(`${itemState.qty}× ${fresh.name} added to cart`, 'success');
      itemState.qty = 1;
      itemState.note = '';
      const note = $('[data-note]', root);
      if (note) note.value = '';
      updateTotals();
    };

    // Slide-to-add interaction (tap also works for accessibility)
    const swipe = $('[data-swipe]', root);
    if (swipe) {
      const thumb = $('[data-swipe-thumb]', swipe);
      const fill = $('.swipe-fill', swipe);
      let startX = 0, x = 0, dragging = false, moved = false;
      const max = () => swipe.clientWidth - thumb.offsetWidth - 8;
      const set = (v, anim) => {
        thumb.style.transition = fill.style.transition = anim ? 'transform .3s, width .3s' : 'none';
        thumb.style.transform = `translateX(${v}px)`;
        fill.style.width = `${v + thumb.offsetWidth + 4}px`;
      };
      thumb.addEventListener('pointerdown', (e) => {
        dragging = true; moved = false; startX = e.clientX - x;
        thumb.setPointerCapture(e.pointerId);
      });
      thumb.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        x = Math.max(0, Math.min(max(), e.clientX - startX));
        if (x > 4) moved = true;
        set(x);
      });
      const end = () => {
        if (!dragging) return;
        dragging = false;
        if (x > max() * 0.7) {
          set(max(), true);
          swipe.classList.add('done');
          addToCart();
          setTimeout(() => { swipe.classList.remove('done'); x = 0; set(0, true); }, 700);
        } else {
          x = 0; set(0, true);
        }
      };
      thumb.addEventListener('pointerup', end);
      thumb.addEventListener('pointercancel', end);
      thumb.addEventListener('click', (e) => {
        if (moved) { e.preventDefault(); return; }
        addToCart();
      });
      $('.swipe-text', swipe).addEventListener('click', addToCart);
    }
  },
};

// ---------------------------------------------------------------------------
// CART
// ---------------------------------------------------------------------------
export const cart = {
  chrome: 'customer',
  live: true,
  render() {
    const lines = Cart.lines();
    if (!lines.length) {
      return `<section class="page">
        <div class="page-head"><a href="#/menu" class="icon-btn" aria-label="Back">${icon.back}</a><h1>My Cart</h1><span></span></div>
        ${emptyState('🛒', 'Your cart is empty', 'Add some delicious food from the catalog.', '<a href="#/menu" class="btn btn-primary">Browse Menu</a>')}
      </section>`;
    }
    const t = Cart.totals();
    const hasUnavailable = lines.some((l) => l.unavailable);
    return `<section class="page cart">
      <div class="page-head"><a href="#/menu" class="icon-btn" aria-label="Back">${icon.back}</a><h1>My Cart</h1><button class="icon-btn" data-clear-cart aria-label="Clear cart">${icon.trash}</button></div>
      ${hasUnavailable ? '<div class="alert alert-warn">Some items are no longer available and will not be included. Please remove them.</div>' : ''}
      <ul class="cart-list">
        ${lines.map((l) => `<li class="cart-line ${l.unavailable ? 'unavailable' : ''}" data-key="${esc(l.key)}">
          <a class="cart-thumb" href="#/item/${l.menuId}">${l.item ? itemVisual(l.item) : ''}</a>
          <div class="cart-main">
            <div class="cart-row1">
              <strong>${esc(l.item?.name || 'Removed item')}</strong>
              <button class="icon-btn sm" data-remove aria-label="Remove">${icon.x}</button>
            </div>
            ${variantText(l.variant) ? `<small>${esc(variantText(l.variant))}</small>` : ''}
            ${l.unavailable ? '<small class="danger">Sold out / unavailable</small>' : `<small class="muted">${money(l.unitPrice)} each</small>`}
            <div class="cart-row2">
              <div class="stepper">
                <button data-dec aria-label="Decrease">${icon.minus}</button>
                <output>${l.qty}</output>
                <button data-inc aria-label="Increase">${icon.plus}</button>
              </div>
              <strong class="price">${money(l.lineTotal)}</strong>
            </div>
            <input class="input sm" data-line-note value="${esc(l.note)}" maxlength="140" placeholder="📝 Add note for this item">
          </div>
        </li>`).join('')}
      </ul>

      <div class="card">
        <label class="label" for="special">Special request <small>(optional)</small></label>
        <textarea id="special" class="input" data-special rows="2" maxlength="300" placeholder="e.g. Please pack separately, extra cutlery">${esc(Cart.specialRequest)}</textarea>
      </div>

      <div class="card">
        <label class="label" for="promo">Promo code</label>
        <div class="promo-row">
          <input id="promo" class="input" data-promo value="${esc(Cart.promoCode)}" placeholder="e.g. PNG10" autocapitalize="characters">
          ${Cart.promoCode ? '<button class="btn btn-ghost" data-promo-remove>Remove</button>' : '<button class="btn btn-dark" data-promo-apply>Apply</button>'}
        </div>
        ${t.promoError ? `<small class="danger">${esc(t.promoError)}</small>` : t.promo ? `<small class="ok">✓ ${esc(t.promo.code)} applied</small>` : ''}
      </div>

      <div class="card summary">
        <div class="totals">
          <div><span>Items</span><span>${t.count}</span></div>
        </div>
        ${totalsHTML(t, { promo: t.promo?.code })}
      </div>
      <div class="sticky-cta">
        <div><small>Grand Total</small><strong>${money(t.total)}</strong></div>
        <a href="#/checkout" class="btn btn-primary btn-lg ${t.count ? '' : 'disabled'}">Checkout ${icon.chevronRight}</a>
      </div>
    </section>`;
  },
  mount(root, ctx) {
    root.addEventListener('click', async (e) => {
      const line = e.target.closest('[data-key]');
      const key = line?.dataset.key;
      const l = key && Cart.items.find((x) => x.key === key);
      if (e.target.closest('[data-inc]') && l) Cart.setQty(key, l.qty + 1);
      else if (e.target.closest('[data-dec]') && l) {
        if (l.qty === 1 && !(await confirmDialog('Remove this item from your cart?', { ok: 'Remove', danger: true }))) return;
        Cart.setQty(key, l.qty - 1);
      } else if (e.target.closest('[data-remove]') && l) {
        Cart.remove(key);
        toast('Item removed');
      } else if (e.target.closest('[data-clear-cart]')) {
        if (await confirmDialog('Remove all items from your cart?', { ok: 'Clear cart', danger: true })) Cart.clear();
      } else if (e.target.closest('[data-promo-apply]')) {
        const code = $('[data-promo]', root).value.trim();
        if (!code) return toast('Enter a promo code', 'error');
        if (!Cart.findPromo(code)) return toast('Promo code is not valid.', 'error');
        Cart.promoCode = code;
        toast('Promo code applied', 'success');
      } else if (e.target.closest('[data-promo-remove]')) {
        Cart.promoCode = '';
      } else return;
      ctx.refresh();
    });
    $$('[data-line-note]', root).forEach((inp) =>
      inp.addEventListener('change', () => Cart.setNote(inp.closest('[data-key]').dataset.key, inp.value.trim()))
    );
    $('[data-special]', root)?.addEventListener('input', (e) => (Cart.specialRequest = e.target.value));
    $('.sticky-cta .btn', root)?.addEventListener('click', (e) => {
      if (Cart.lines().some((l) => l.unavailable)) {
        e.preventDefault();
        toast('Please remove unavailable items first.', 'error');
      }
    });
  },
};

// ---------------------------------------------------------------------------
// CHECKOUT (4-step wizard)
// ---------------------------------------------------------------------------
const DRAFT_KEY = 'png_checkout';
let draft = null;

function loadDraft() {
  const u = Store.user;
  let saved = {};
  try { saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY)) || {}; } catch { /* ignore */ }
  const s = Store.settings;
  const firstPay = Object.keys(s.payments).find((k) => s.payments[k]) || 'cash';
  draft = {
    step: 1, name: u.name || '', phone: u.phone || '', email: u.email || '', saveProfile: true,
    orderType: 'scheduled', date: '', time: '', location: s.locations[0]?.id || '',
    payment: firstPay, receipt: '', ...saved,
  };
  if (!s.payments[draft.payment]) draft.payment = firstPay;
  if (!s.locations.find((l) => l.id === draft.location)) draft.location = s.locations[0]?.id || '';
}
function saveDraft() {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* receipt too large for session — ignore */ }
}

const STEPS = ['Review', 'Details', 'Pickup', 'Payment'];

function stepReview() {
  const lines = Cart.lines().filter((l) => !l.unavailable);
  const t = Cart.totals();
  return `<div class="card">
      <div class="card-head"><h3>Order Summary</h3><a href="#/cart" class="link">Edit cart</a></div>
      ${itemsHTML({ items: lines.map((l) => ({ menuId: l.menuId, art: l.item.art, name: l.item.name, qty: l.qty, unitPrice: l.unitPrice, variant: l.variant, note: l.note })) })}
      ${Cart.specialRequest ? `<p class="special">🗒️ ${esc(Cart.specialRequest)}</p>` : ''}
    </div>
    <div class="card">${totalsHTML(t, { promo: t.promo?.code })}</div>`;
}

function stepDetails() {
  return `<div class="card form">
    <h3>Customer Information</h3>
    <label class="label" for="c-name">Full name *</label>
    <input id="c-name" class="input" data-f="name" value="${esc(draft.name)}" autocomplete="name" placeholder="e.g. Aisyah Rahman" required>
    <label class="label" for="c-phone">Phone number (WhatsApp) *</label>
    <input id="c-phone" class="input" data-f="phone" value="${esc(draft.phone)}" inputmode="tel" autocomplete="tel" placeholder="e.g. 012-345 6789" required>
    <label class="label" for="c-email">Email <small>(optional)</small></label>
    <input id="c-email" class="input" data-f="email" value="${esc(draft.email)}" type="email" autocomplete="email" placeholder="you@email.com">
    <label class="check"><input type="checkbox" data-f="saveProfile" ${draft.saveProfile ? 'checked' : ''}> Save my details for next time</label>
  </div>`;
}

function stepPickup() {
  const s = Store.settings;
  let body = '';
  if (draft.orderType === 'immediate') {
    const slot = immediateSlot();
    if (slot) {
      draft.date = slot.date;
      draft.time = slot.time;
      body = `<div class="immediate">
        <span class="imm-ico">${icon.clock}</span>
        <div><small>Earliest pickup today</small><strong>${fmtTime(slot.time)}</strong><small>Includes ~${s.prepTime} min preparation time</small></div>
      </div>`;
    } else {
      draft.date = draft.time = '';
      body = `<div class="alert alert-warn">No more pickup slots available today. Please choose <b>Scheduled Pickup</b>.</div>`;
    }
  } else {
    const dates = upcomingDates();
    if (!draft.date || !dates.find((d) => d.date === draft.date && !d.closed)) {
      draft.date = (dates.find((d) => !d.closed && !d.full) || {}).date || '';
    }
    const slots = draft.date ? slotsForDate(draft.date) : [];
    if (draft.time && !slots.find((x) => x.time === draft.time && x.state === 'available')) draft.time = '';
    body = `<label class="label">Pickup date</label>
      <div class="date-strip">${dates.map((d) => {
        const dt = new Date(d.date + 'T00:00:00');
        const dis = d.closed || d.full;
        return `<button class="date-chip ${draft.date === d.date ? 'on' : ''}" data-date="${d.date}" ${dis ? 'disabled' : ''}>
          <small>${d.date === todayStr() ? 'Today' : dt.toLocaleDateString('en-MY', { weekday: 'short' })}</small>
          <b>${dt.getDate()}</b>
          <small>${d.closed ? d.reason : d.full ? 'Full' : dt.toLocaleDateString('en-MY', { month: 'short' })}</small>
        </button>`;
      }).join('')}</div>
      <label class="label">Pickup time ${draft.date ? `<small>— ${fmtDate(draft.date)}</small>` : ''}</label>
      ${slots.length ? `<div class="slot-grid">${slots.map((sl) => `<button class="slot ${sl.state} ${draft.time === sl.time ? 'on' : ''}" data-time="${sl.time}" ${sl.state !== 'available' ? 'disabled' : ''} aria-label="${sl.label} ${sl.note}">
          <b>${sl.label}</b><small>${sl.note}</small></button>`).join('')}</div>
        <div class="legend"><span class="lg-dot available"></span>Available <span class="lg-dot full"></span>Full <span class="lg-dot closed"></span>Unavailable</div>`
        : '<div class="alert alert-warn">No pickup dates are open right now. Please contact the shop.</div>'}`;
  }
  return `<div class="card form">
      <h3>Order Type</h3>
      <div class="seg">
        <button class="${draft.orderType === 'immediate' ? 'on' : ''}" data-type="immediate">⚡ Immediate</button>
        <button class="${draft.orderType === 'scheduled' ? 'on' : ''}" data-type="scheduled">📅 Scheduled Pickup</button>
      </div>
      ${body}
    </div>
    <div class="card form">
      <h3>Pickup Location</h3>
      ${s.locations.map((l) => `<label class="radio-card ${draft.location === l.id ? 'on' : ''}">
        <input type="radio" name="loc" value="${esc(l.id)}" data-loc ${draft.location === l.id ? 'checked' : ''}>
        <span class="rc-ico">${icon.pin}</span><span><strong>${esc(l.name)}</strong><small>${esc(l.address)}</small></span>
      </label>`).join('')}
    </div>`;
}

function duitnowBox(total, { upload = true, receipt = '' } = {}) {
  const s = Store.settings;
  return `<div class="duitnow">
    <div class="dn-head"><span class="dn-logo">DuitNow</span><span>QR Payment</span></div>
    <div class="dn-qr">${s.duitnowQR ? `<img src="${esc(s.duitnowQR)}" alt="DuitNow QR">` : '<div data-demo-qr class="dn-demo"></div><small class="muted">Demo QR — admin can upload the real one</small>'}</div>
    <div class="dn-info">
      <div><span>Account</span><strong>${esc(s.duitnowName)}</strong></div>
      ${s.duitnowId ? `<div><span>DuitNow ID</span><strong>${esc(s.duitnowId)}</strong></div>` : ''}
      <div><span>Amount</span><strong class="amt">${money(total)}</strong></div>
    </div>
    <p class="dn-instr">${esc(s.paymentInstructions)}</p>
    ${upload ? `<label class="upload ${receipt ? 'has' : ''}">
        <input type="file" accept="image/*" data-receipt hidden>
        ${receipt ? `<img src="${esc(receipt)}" alt="Receipt preview"><span>Change receipt</span>` : `${icon.upload}<span><b>Upload payment receipt</b><small>JPG/PNG screenshot • you can also upload later</small></span>`}
      </label>` : ''}
  </div>`;
}

function stepPayment() {
  const s = Store.settings;
  const t = Cart.totals();
  const methods = [
    ['cash', '💵', 'Cash on Pickup', 'Pay at the counter when you collect'],
    ['duitnow', '📱', 'DuitNow QR', 'Scan & pay with any bank / e-wallet'],
    ['online', '💳', 'Online Payment', Store.mode === 'demo' ? 'FPX / Card (demo simulation)' : 'FPX / Card — awaiting gateway confirmation'],
  ].filter(([k]) => s.payments[k]);
  return `<div class="card form">
      <h3>Payment Method</h3>
      ${methods.map(([k, ico, name, sub]) => `<label class="radio-card ${draft.payment === k ? 'on' : ''}">
        <input type="radio" name="pay" value="${k}" data-pay ${draft.payment === k ? 'checked' : ''}>
        <span class="rc-ico emoji">${ico}</span><span><strong>${name}</strong><small>${sub}</small></span>
      </label>`).join('')}
      ${draft.payment === 'duitnow' ? duitnowBox(t.total, { receipt: draft.receipt }) : ''}
    </div>
    <div class="card confirm-card">
      <h3>Confirm your order</h3>
      <div class="kv">
        <div><span>Name</span><strong>${esc(draft.name)}</strong></div>
        <div><span>Phone</span><strong>${esc(draft.phone)}</strong></div>
        <div><span>Pickup</span><strong>${draft.date ? `${fmtDate(draft.date, false)} • ${fmtTime(draft.time)}` : '-'}</strong></div>
        <div><span>Location</span><strong>${esc(locationName(draft.location))}</strong></div>
        <div><span>Items</span><strong>${t.count}</strong></div>
      </div>
      ${totalsHTML(t, { promo: t.promo?.code })}
      ${Store.settings.autoWhatsApp ? `<p class="wa-note">${icon.whatsapp} Your order will be sent to the shop via WhatsApp after you confirm.</p>` : ''}
    </div>`;
}

function validateStep(step) {
  if (step === 1) {
    const lines = Cart.lines();
    if (!lines.length) throw new Error('Your cart is empty.');
    if (lines.some((l) => l.unavailable)) throw new Error('Please remove unavailable items from your cart.');
  }
  if (step === 2) {
    if (draft.name.trim().length < 2) throw new Error('Please enter your name.');
    if (!isValidPhone(draft.phone)) throw new Error('Please enter a valid Malaysian phone number (e.g. 012-3456789).');
    if (!isValidEmail(draft.email.trim())) throw new Error('Please enter a valid email or leave it empty.');
  }
  if (step === 3) {
    if (!draft.location) throw new Error('Please choose a pickup location.');
    assertSlotBookable(draft.date, draft.time);
  }
  if (step === 4) {
    if (!Store.settings.payments[draft.payment]) throw new Error('Please choose a payment method.');
  }
}

export const checkout = {
  chrome: 'none',
  live: (topic) => ['orders', 'slots', 'settings', 'sync'].includes(topic) && draft?.step === 3,
  enter() {
    loadDraft();
    if (!Cart.items.length) draft.step = 1;
  },
  render() {
    if (!Cart.items.length) {
      return `<section class="page">
        <div class="page-head"><a href="#/cart" class="icon-btn" aria-label="Back">${icon.back}</a><h1>Checkout</h1><span></span></div>
        ${emptyState('🛒', 'Nothing to checkout', 'Your cart is empty.', '<a href="#/menu" class="btn btn-primary">Browse Menu</a>')}
      </section>`;
    }
    const t = Cart.totals();
    const body = [stepReview, stepDetails, stepPickup, stepPayment][draft.step - 1]();
    return `<section class="page checkout">
      <div class="page-head"><button class="icon-btn" data-prev aria-label="Back">${icon.back}</button><h1>Checkout</h1><span class="step-count">${draft.step}/4</span></div>
      <ol class="stepper-bar">${STEPS.map((s, i) => `<li class="${i + 1 < draft.step ? 'done' : i + 1 === draft.step ? 'current' : ''}"><span>${i + 1 < draft.step ? icon.check : i + 1}</span>${s}</li>`).join('')}</ol>
      <div class="step-body">${body}</div>
      <div class="sticky-cta">
        <div><small>Grand Total</small><strong>${money(t.total)}</strong></div>
        ${draft.step < 4
          ? `<button class="btn btn-primary btn-lg" data-next>Continue ${icon.chevronRight}</button>`
          : `<button class="btn btn-accent btn-lg" data-confirm>Confirm Order ${icon.check}</button>`}
      </div>
    </section>`;
  },
  mount(root, ctx) {
    if (!Cart.items.length) return;
    const demoQR = $('[data-demo-qr]', root);
    if (demoQR) renderQR(demoQR, 'DUITNOW-DEMO|PICK UP N GO|' + Cart.totals().total.toFixed(2), 180);

    root.addEventListener('input', (e) => {
      const f = e.target.dataset.f;
      if (f) {
        draft[f] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        saveDraft();
      }
    });
    root.addEventListener('change', async (e) => {
      if (e.target.matches('[data-loc]')) { draft.location = e.target.value; saveDraft(); ctx.refresh(); }
      if (e.target.matches('[data-pay]')) { draft.payment = e.target.value; saveDraft(); ctx.refresh(); }
      if (e.target.matches('[data-receipt]')) {
        const file = e.target.files[0];
        if (!file) return;
        try {
          draft.receipt = await compressImage(file, 1000, 0.75);
          saveDraft();
          toast('Receipt attached', 'success');
          ctx.refresh();
        } catch (err) { toast(err.message, 'error'); }
      }
    });
    root.addEventListener('click', async (e) => {
      const ty = e.target.closest('[data-type]');
      if (ty) { draft.orderType = ty.dataset.type; draft.time = ''; saveDraft(); return ctx.refresh(); }
      const d = e.target.closest('[data-date]');
      if (d) { draft.date = d.dataset.date; draft.time = ''; saveDraft(); return ctx.refresh(); }
      const tm = e.target.closest('[data-time]');
      if (tm) { draft.time = tm.dataset.time; saveDraft(); return ctx.refresh(); }
      if (e.target.closest('[data-prev]')) {
        if (draft.step > 1) { draft.step--; saveDraft(); ctx.refresh(); window.scrollTo(0, 0); }
        else ctx.go('#/cart');
        return;
      }
      if (e.target.closest('[data-next]')) {
        try {
          validateStep(draft.step);
          draft.step++;
          saveDraft();
          ctx.refresh();
          window.scrollTo(0, 0);
        } catch (err) { toast(err.message, 'error', 4000); }
        return;
      }
      const confirmBtn = e.target.closest('[data-confirm]');
      if (confirmBtn) busy(confirmBtn, () => placeOrder(ctx));
    });
  },
};

async function placeOrder(ctx) {
  for (let s = 1; s <= 4; s++) {
    try { validateStep(s); } catch (err) {
      draft.step = s; saveDraft(); ctx.refresh();
      throw err;
    }
  }
  const u = Store.user;
  const lines = Cart.lines().filter((l) => !l.unavailable);
  const t = Cart.totals();
  const id = orderId();
  const now = Date.now();

  // Simulated online payment gateway (demo)
  let payStatus = 'Pending';
  if (draft.payment === 'online') {
    const ok = await fakeGateway(t.total);
    if (!ok) throw new Error('Payment was cancelled.');
    if (Store.mode === 'demo') payStatus = 'Verified';
  }

  let receipt = '';
  if (draft.payment === 'duitnow' && draft.receipt) {
    receipt = await Store.uploadImage(draft.receipt, `receipts/${u.id}/${id}.jpg`);
  }

  const order = {
    id,
    createdAt: now,
    updatedAt: now,
    customer: { uid: u.id, name: draft.name.trim(), phone: draft.phone.trim(), email: draft.email.trim() },
    items: lines.map((l) => ({ menuId: l.menuId, name: l.item.name, art: l.item.art || '', unitPrice: l.unitPrice, qty: l.qty, variant: l.variant, note: l.note || '' })),
    specialRequest: Cart.specialRequest.trim(),
    subtotal: t.subtotal,
    discount: t.discount,
    promoCode: t.promo?.code || '',
    total: t.total,
    pickupDate: draft.date,
    pickupTime: draft.time,
    location: draft.location,
    orderType: draft.orderType,
    payment: { method: draft.payment, status: payStatus, receipt },
    status: 'Pending Confirmation',
    history: [{ status: 'Pending Confirmation', at: now }],
    pushSub: permission() === 'granted' ? savedSubscription() : null,
  };

  await Store.createOrder(order, () => assertSlotBookable(order.pickupDate, order.pickupTime));
  rememberMyOrder(order.id);

  if (draft.saveProfile) {
    Store.saveProfile({ name: order.customer.name, phone: order.customer.phone, email: order.customer.email }).catch(() => {});
  }
  Cart.clear();
  sessionStorage.removeItem(DRAFT_KEY);
  toast('Order placed successfully!', 'success');
  if (Store.settings.autoWhatsApp) {
    // Opens WhatsApp with the auto-generated order message to the shop.
    const w = window.open(waLink(Store.settings.whatsapp, orderToShopMessage(order)), '_blank');
    if (w) w.opener = null;
  }
  ctx.go(`#/order/${order.id}?new=1`);
}

function fakeGateway(amount) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal(`<div class="gateway">
      <div class="gw-head">${icon.wallet} Secure Payment <small>(demo)</small></div>
      <p>Amount to pay</p><h2>${money(amount)}</h2>
      <div class="gw-banks">${['Maybank2u', 'CIMB Clicks', 'Bank Islam', 'RHB', 'Touch ’n Go', 'Visa/Master'].map((b, i) => `<button class="gw-bank ${i === 0 ? 'on' : ''}">${b}</button>`).join('')}</div>
      <button class="btn btn-primary btn-block" data-pay-now>Pay ${money(amount)}</button>
      <button class="btn btn-ghost btn-block" data-close>Cancel</button>
    </div>`, { title: 'Online Payment', onClose: () => { if (!done) resolve(false); } });
    m.el.addEventListener('click', (e) => {
      const b = e.target.closest('.gw-bank');
      if (b) $$('.gw-bank', m.el).forEach((x) => x.classList.toggle('on', x === b));
    });
    $('[data-pay-now]', m.el).addEventListener('click', () => {
      loading(true, 'Processing payment…');
      setTimeout(() => {
        loading(false);
        done = true;
        resolve(true);
        m.close();
      }, 1200);
    });
  });
}

// ---------------------------------------------------------------------------
// ORDER CONFIRMATION / DETAILS
// ---------------------------------------------------------------------------
export const order = {
  chrome: 'none',
  live: true,
  render(ctx) {
    const o = Store.order(ctx.params[0]);
    if (!o) {
      return `<section class="page">
        <div class="page-head"><a href="#/orders" class="icon-btn" aria-label="Back">${icon.back}</a><h1>Order</h1><span></span></div>
        ${emptyState('🧾', 'Order not found', 'This order is not available on this device.', '<a href="#/orders" class="btn btn-primary">My Orders</a>')}
      </section>`;
    }
    const isNew = ctx.query.new === '1';
    const canCancel = o.status === 'Pending Confirmation';
    const needsReceipt = o.payment.method === 'duitnow' && o.payment.status !== 'Verified' && o.status !== 'Cancelled';
    return `<section class="page order-page">
      <div class="page-head"><a href="#/orders" class="icon-btn" aria-label="Back">${icon.back}</a><h1>My Order</h1><a class="icon-btn" href="#/home" aria-label="Home">${icon.home}</a></div>

      ${isNew ? `<div class="success-hero">
          <div class="success-check">${icon.check}</div>
          <h2>Order Placed!</h2>
          <p>Thank you, ${esc(o.customer.name.split(' ')[0])}. We’ll have it ready for pickup.</p>
          <a class="btn btn-wa btn-block btn-lg" href="${waLink(Store.settings.whatsapp, orderToShopMessage(o))}" target="_blank" rel="noopener">${icon.whatsapp} Send Order to Shop via WhatsApp</a>
        </div>` : ''}

      <div class="ticket">
        <div class="ticket-top">
          <div><small>Order ID</small><h2 class="oid">${esc(o.id)}</h2>${badge(o.status)}</div>
          <button class="ticket-qr" data-qr-big aria-label="Show QR"><div data-qr></div></button>
        </div>
        <p class="ticket-hint">${icon.qr} Show this QR at the counter when you pick up.</p>
        <div class="ticket-cut"></div>
        ${trackerHTML(o)}
      </div>

      ${['Completed', 'Cancelled'].includes(o.status) ? '' : notifyCardHTML({ compact: true })}

      <div class="card"><h3>Pickup Details</h3>${pickupInfoHTML(o)}</div>

      <div class="card"><h3>Ordered Items</h3>${itemsHTML(o)}
        ${o.specialRequest ? `<p class="special">🗒️ ${esc(o.specialRequest)}</p>` : ''}
        ${totalsHTML(o, { promo: o.promoCode })}
      </div>

      <div class="card"><h3>Payment</h3>${paymentHTML(o)}
        ${o.payment.status === 'Rejected' ? '<div class="alert alert-danger">Your payment receipt was rejected. Please upload a valid receipt or contact the shop.</div>' : ''}
        ${needsReceipt ? duitnowBox(o.total, { receipt: o.payment.receipt }) : ''}
      </div>

      <div class="card"><h3>Customer Details</h3>${customerHTML(o)}</div>

      <div class="action-grid">
        <button class="act" data-download>${icon.download}<span>Download Receipt</span></button>
        <a class="act wa" href="${waLink('', shareMessage(o))}" target="_blank" rel="noopener">${icon.whatsapp}<span>Share via WhatsApp</span></a>
        <a class="act" href="${waLink(Store.settings.whatsapp, orderToShopMessage(o))}" target="_blank" rel="noopener">${icon.store}<span>Send to Shop</span></a>
        <a class="act" href="${contactShopLink(o.id)}" target="_blank" rel="noopener">${icon.whatsapp}<span>Contact Shop</span></a>
        <button class="act" data-repeat>${icon.repeat}<span>Repeat Order</span></button>
        ${canCancel ? `<button class="act danger" data-cancel>${icon.x}<span>Cancel Order</span></button>` : `<a class="act" href="#/orders">${icon.receipt}<span>All Orders</span></a>`}
      </div>
    </section>`;
  },
  mount(root, ctx) {
    const o = Store.order(ctx.params[0]);
    if (!o) return;
    bindNotify(root, ctx);
    renderQR($('[data-qr]', root), orderQRText(o.id), 160);
    const demoQR = $('[data-demo-qr]', root);
    if (demoQR) renderQR(demoQR, 'DUITNOW-DEMO|PICK UP N GO|' + o.total.toFixed(2), 180);

    root.addEventListener('click', async (e) => {
      if (e.target.closest('[data-qr-big]')) {
        const m = modal(`<div class="qr-big"><div data-qr2></div><h2>${esc(o.id)}</h2><p>${fmtDate(o.pickupDate)} • ${fmtTime(o.pickupTime)}</p></div>`, { title: 'Pickup QR' });
        renderQR($('[data-qr2]', m.el), orderQRText(o.id), 260);
      }
      if (e.target.closest('[data-download]')) {
        busy(e.target.closest('[data-download]'), async () => { await downloadReceipt(Store.order(o.id)); toast('Receipt downloaded', 'success'); });
      }
      if (e.target.closest('[data-repeat]')) repeatOrder(o, ctx);
      if (e.target.closest('[data-cancel]')) {
        if (!(await confirmDialog('Cancel this order? This cannot be undone.', { ok: 'Cancel Order', danger: true }))) return;
        busy(e.target.closest('[data-cancel]'), async () => {
          const fresh = Store.order(o.id);
          if (fresh.status !== 'Pending Confirmation') throw new Error('This order has already been accepted by the shop. Please contact them to cancel.');
          await Store.updateOrder(o.id, { status: 'Cancelled' });
          toast('Order cancelled');
        });
      }
      if (e.target.closest('[data-view-receipt]')) modal(viewImage(Store.order(o.id).payment.receipt), { title: 'Payment Receipt' });
    });
    root.addEventListener('change', async (e) => {
      if (!e.target.matches('[data-receipt]')) return;
      const file = e.target.files[0];
      if (!file) return;
      try {
        loading(true, 'Uploading receipt…');
        const dataUrl = await compressImage(file, 1000, 0.75);
        const url = await Store.uploadImage(dataUrl, `receipts/${Store.user.id}/${o.id}.jpg`);
        const fresh = Store.order(o.id);
        await Store.updateOrder(o.id, { payment: { ...fresh.payment, receipt: url, status: 'Pending' } });
        toast('Receipt uploaded — awaiting verification', 'success');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        loading(false);
      }
    });
  },
};

function repeatOrder(o, ctx) {
  let added = 0, skipped = 0;
  o.items.forEach((it) => {
    const m = Store.menuItem(it.menuId);
    if (m && m.available) { Cart.add(m, it.qty, it.variant || defaultVariant(m), it.note || ''); added++; }
    else skipped++;
  });
  if (added) toast(`${added} item(s) added to cart${skipped ? `, ${skipped} unavailable` : ''}`, 'success');
  else toast('Sorry, these items are no longer available.', 'error');
  if (added) ctx.go('#/cart');
}

// ---------------------------------------------------------------------------
// MY ORDERS (customer dashboard)
// ---------------------------------------------------------------------------
let ordersTab = 'active';

function orderCard(o) {
  const count = o.items.reduce((s, i) => s + i.qty, 0);
  return `<div class="order-card">
    <a href="#/order/${o.id}" class="oc-link">
      <div class="oc-art">${thumbArt(o)}</div>
      <div class="oc-main">
        <div class="oc-top"><strong>${esc(o.id)}</strong>${badge(o.status)}</div>
        <small>${count} item${count > 1 ? 's' : ''} • ${esc(o.items.map((i) => i.name).slice(0, 2).join(', '))}${o.items.length > 2 ? '…' : ''}</small>
        <div class="oc-bottom"><span>${icon.calendar} ${fmtDate(o.pickupDate, false)} • ${fmtTime(o.pickupTime)}</span><strong>${money(o.total)}</strong></div>
      </div>
    </a>
    ${['Completed', 'Cancelled'].includes(o.status) ? `<button class="btn btn-ghost btn-sm" data-repeat="${o.id}">${icon.repeat} Repeat Order</button>` : ''}
  </div>`;
}
const thumbArt = (o) => {
  const m = Store.menuItem(o.items[0]?.menuId);
  return m ? itemVisual(m) : foodArt(o.items[0]?.art);
};

export const orders = {
  chrome: 'customer',
  live: true,
  render() {
    const mine = myOrders();
    const active = mine.filter((o) => ACTIVE_STATUSES.includes(o.status)).sort((a, b) => (a.pickupDate + a.pickupTime).localeCompare(b.pickupDate + b.pickupTime));
    const history = mine.filter((o) => !ACTIVE_STATUSES.includes(o.status));
    let body = '';
    if (ordersTab === 'active') {
      body = active.length ? active.map(orderCard).join('') : emptyState('🍱', 'No active orders', 'Your current orders will appear here.', '<a href="#/menu" class="btn btn-primary">Order Now</a>');
    } else if (ordersTab === 'schedule') {
      const byDate = {};
      active.forEach((o) => (byDate[o.pickupDate] ||= []).push(o));
      body = Object.keys(byDate).length
        ? Object.keys(byDate).sort().map((d) => `<div class="sched-day"><h3>${d === todayStr() ? 'Today • ' : ''}${fmtDate(d)}</h3>
            ${byDate[d].map((o) => `<a class="sched-item" href="#/order/${o.id}"><span class="sched-time">${fmtTime(o.pickupTime)}</span><span class="sched-main"><strong>${esc(o.id)}</strong><small>${esc(locationName(o.location))}</small></span>${badge(o.status)}</a>`).join('')}
          </div>`).join('')
        : emptyState('📅', 'No upcoming pickups', 'Scheduled pickups will show here.');
    } else {
      body = history.length ? history.map(orderCard).join('') : emptyState('🧾', 'No order history yet', 'Completed and cancelled orders appear here.');
    }
    return `<section class="page orders">
      <div class="page-head"><a href="#/home" class="icon-btn" aria-label="Back">${icon.back}</a><h1>My Orders</h1><span></span></div>
      <div class="stats-row">
        <div class="stat"><b>${active.length}</b><small>Active</small></div>
        <div class="stat"><b>${mine.filter((o) => o.status === 'Completed').length}</b><small>Completed</small></div>
        <div class="stat"><b>${money(mine.filter((o) => o.status === 'Completed').reduce((s, o) => s + o.total, 0)).replace('RM ', 'RM')}</b><small>Spent</small></div>
      </div>
      <div class="seg tabs">
        <button class="${ordersTab === 'active' ? 'on' : ''}" data-tab="active">Active</button>
        <button class="${ordersTab === 'schedule' ? 'on' : ''}" data-tab="schedule">Pickup Schedule</button>
        <button class="${ordersTab === 'history' ? 'on' : ''}" data-tab="history">History</button>
      </div>
      <div class="order-list">${body}</div>
    </section>`;
  },
  mount(root, ctx) {
    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]');
      if (t) { ordersTab = t.dataset.tab; ctx.refresh(); }
      const r = e.target.closest('[data-repeat]');
      if (r) repeatOrder(Store.order(r.dataset.repeat), ctx);
    });
  },
};

// ---------------------------------------------------------------------------
// PROFILE
// ---------------------------------------------------------------------------
export const profile = {
  chrome: 'customer',
  live: (topic) => topic !== 'profile',
  render() {
    const u = Store.user;
    const favs = Store.menu.filter((m) => (u.favourites || []).includes(m.id));
    const inst = installState();
    return `<section class="page profile">
      <div class="page-head"><a href="#/home" class="icon-btn" aria-label="Back">${icon.back}</a><h1>Profile</h1><span></span></div>
      <div class="profile-card">
        <div class="avatar xl">${esc(initials(u.name))}</div>
        <div><h2>${esc(u.name || 'Guest')}</h2><small>${esc(u.phone || 'No phone saved')}</small>
        ${u.role !== 'customer' ? `<span class="role-chip">${esc(u.role)}</span>` : ''}</div>
      </div>

      ${Store.isStaff() ? `<div class="card staff-links">
          <h3>Staff Area</h3>
          ${Store.isAdmin() ? `<a class="menu-link" href="#/admin">${icon.chart} Admin Dashboard ${icon.chevronRight}</a>` : ''}
          <a class="menu-link" href="#/staff">${icon.scan} Staff Pickup Counter ${icon.chevronRight}</a>
          <button class="menu-link" data-logout>${icon.logout} Log out (${esc(u.email)})</button>
        </div>` : ''}

      <form class="card form" data-profile>
        <h3>My Details</h3>
        <label class="label" for="p-name">Name</label>
        <input id="p-name" class="input" name="name" value="${esc(u.role === 'customer' ? u.name : readProfile().name || '')}" placeholder="Your name">
        <label class="label" for="p-phone">Phone (WhatsApp)</label>
        <input id="p-phone" class="input" name="phone" value="${esc(u.role === 'customer' ? u.phone : readProfile().phone || '')}" inputmode="tel" placeholder="012-345 6789">
        <label class="label" for="p-email">Email</label>
        <input id="p-email" class="input" name="email" type="email" value="${esc(u.role === 'customer' ? u.email : readProfile().email || '')}" placeholder="you@email.com">
        <button class="btn btn-primary btn-block" type="submit">Save Profile</button>
      </form>

      <div class="card">
        <h3>Favourite Menu ${icon.heartFill}</h3>
        ${favs.length ? `<div class="grid">${favs.map((m) => foodCard(m)).join('')}</div>` : '<p class="muted">Tap the ♥ on any menu to save it here.</p>'}
      </div>

      ${notifyCardHTML()}

      <div class="card">
        <a class="menu-link" href="#/orders">${icon.receipt} My Orders ${icon.chevronRight}</a>
        <a class="menu-link" href="${contactShopLink()}" target="_blank" rel="noopener">${icon.whatsapp} Contact Shop on WhatsApp ${icon.chevronRight}</a>
        ${inst.canInstall ? `<button class="menu-link" data-install>${icon.install} Install App ${icon.chevronRight}</button>` : ''}
        ${inst.ios ? `<div class="menu-link static">${icon.install} iPhone: tap Share → Add to Home Screen</div>` : ''}
        ${!Store.isStaff() ? `<a class="menu-link" href="#/login">${icon.store} Staff / Admin Login ${icon.chevronRight}</a>` : ''}
      </div>

      ${Store.mode === 'demo' ? `<div class="card demo-card">
          <h3>Demo Mode</h3>
          ${Store.initError ? `<div class="alert alert-warn"><b>Firebase belum aktif:</b> ${esc(Store.initError.message)}</div>` : ''}
          <p class="muted">Data is stored on this device (LocalStorage). Open <b>#/admin</b> or <b>#/staff</b> in another tab to see orders update live.</p>
          <button class="btn btn-ghost btn-block" data-reset>Reset demo data</button>
        </div>` : ''}
      <p class="version">PICK UP N GO • v1.0 • ${Store.mode === 'demo' ? 'Demo mode' : 'Firebase'}</p>
    </section>`;
  },
  mount(root, ctx) {
    bindCards(root, ctx);
    bindNotify(root, ctx);
    $('[data-profile]', root).addEventListener('submit', (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      if (f.phone && !isValidPhone(f.phone)) return toast('Please enter a valid phone number.', 'error');
      if (!isValidEmail(f.email)) return toast('Please enter a valid email.', 'error');
      busy(e.target.querySelector('button'), async () => {
        await Store.saveProfile({ name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim() });
        toast('Profile saved', 'success');
        ctx.refresh();
      });
    });
    $('[data-install]', root)?.addEventListener('click', promptInstall);
    $('[data-logout]', root)?.addEventListener('click', async () => {
      await Store.logout();
      toast('Logged out');
      ctx.refresh();
    });
    $('[data-reset]', root)?.addEventListener('click', async () => {
      if (!(await confirmDialog('Reset all demo menu, orders and settings on this device?', { ok: 'Reset', danger: true }))) return;
      await Store.resetDemo();
      Cart.reload();
      toast('Demo data reset', 'success');
      ctx.go('#/home');
    });
  },
};

function readProfile() {
  try { return JSON.parse(localStorage.getItem('png_profile')) || {}; } catch { return {}; }
}

// ---------------------------------------------------------------------------
// LOGIN (staff / admin)
// ---------------------------------------------------------------------------
export const login = {
  chrome: 'none',
  render(ctx) {
    return `<section class="page login">
      <div class="page-head"><a href="#/profile" class="icon-btn" aria-label="Back">${icon.back}</a><h1>Staff Login</h1><span></span></div>
      <div class="login-hero"><span class="logo-mark lg">${logoSVG()}</span><h2>PICK UP N GO</h2><p>Admin & staff access</p></div>
      <form class="card form" data-login>
        <label class="label" for="l-email">Email</label>
        <input id="l-email" class="input" name="email" type="email" autocomplete="username" required>
        <label class="label" for="l-pass">Password</label>
        <input id="l-pass" class="input" name="password" type="password" autocomplete="current-password" required minlength="6">
        <button class="btn btn-primary btn-block btn-lg" type="submit">Log In</button>
      </form>
      ${Store.mode === 'demo' ? `<div class="card demo-card">
          <h3>Demo accounts</h3>
          <button class="menu-link" data-fill="admin">${icon.chart} Admin — admin@pickupngo.my / admin123</button>
          <button class="menu-link" data-fill="staff">${icon.scan} Staff — staff@pickupngo.my / staff123</button>
        </div>` : '<p class="muted center">Accounts are managed in Firebase Authentication. Ask the shop owner for access.</p>'}
      <input type="hidden" data-next value="${esc(ctx.query.next || '')}">
    </section>`;
  },
  mount(root, ctx) {
    const form = $('[data-login]', root);
    root.addEventListener('click', (e) => {
      const f = e.target.closest('[data-fill]');
      if (!f) return;
      form.email.value = f.dataset.fill === 'admin' ? 'admin@pickupngo.my' : 'staff@pickupngo.my';
      form.password.value = f.dataset.fill === 'admin' ? 'admin123' : 'staff123';
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      busy(form.querySelector('button'), async () => {
        await Store.login(form.email.value, form.password.value);
        if (!Store.isStaff()) {
          toast('This account has no staff access.', 'error');
          return;
        }
        toast(`Welcome, ${Store.user.name || Store.user.email}`, 'success');
        const next = ctx.query.next;
        ctx.go(next ? decodeURIComponent(next) : Store.isAdmin() ? '#/admin' : '#/staff');
      });
    });
  },
};
