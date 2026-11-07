// ---------------------------------------------------------------------------
// Navigation drawer shared by the Admin and Staff panels.
// On screens < 960px the `.admin-side` sidebar slides in/out; on desktop it is
// a static sidebar. Markup contract (see admin.js / staff.js):
//   .admin[.drawer-open] > .admin-scrim[data-drawer-close]
//                        > aside.admin-side (… [data-drawer-close] button …)
//                        > … button[data-drawer-toggle]
// `state` is a small object ({ open: false }) owned by the view so the open
// state survives live re-renders.
// ---------------------------------------------------------------------------
const MOBILE = '(max-width: 959px)';

export function bindDrawer(root, state) {
  const shell = root.querySelector('.admin');
  const side = root.querySelector('.admin-side');
  const btn = root.querySelector('[data-drawer-toggle]');
  if (!shell || !side || !btn) return;
  const mobile = () => window.matchMedia(MOBILE).matches;

  const set = (open, { focus = true } = {}) => {
    state.open = open && mobile();
    shell.classList.toggle('drawer-open', state.open);
    btn.setAttribute('aria-expanded', String(state.open));
    document.body.classList.toggle('no-scroll', state.open);
    if (state.open && focus) side.querySelector('.admin-nav .on, .admin-nav a, .admin-nav button')?.focus({ preventScroll: true });
  };

  btn.addEventListener('click', () => set(!state.open));
  root.querySelectorAll('[data-drawer-close]').forEach((el) => el.addEventListener('click', () => { set(false); btn.focus({ preventScroll: true }); }));
  // Choosing a destination (link or [data-nav] button) closes the drawer.
  side.addEventListener('click', (e) => { if (e.target.closest('a, [data-nav]')) set(false, { focus: false }); });

  // Swipe left on the drawer to close it.
  let x0 = null;
  side.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  side.addEventListener('touchmove', (e) => {
    if (x0 === null || !state.open) return;
    const dx = e.touches[0].clientX - x0;
    if (dx < 0) side.style.transform = `translateX(${dx}px)`;
  }, { passive: true });
  side.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? x0) - x0;
    side.style.transform = '';
    x0 = null;
    if (dx < -70) set(false);
  });

  // Swipe right from the left screen edge to open it.
  let edge = null;
  shell.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    edge = !state.open && t.clientX < 24 ? t.clientX : null;
  }, { passive: true });
  shell.addEventListener('touchend', (e) => {
    if (edge !== null && (e.changedTouches[0]?.clientX ?? 0) - edge > 60) set(true);
    edge = null;
  });
}

/** Markup for the drawer toggle button used in the sticky app bar. */
export function drawerButton(state, badge = 0) {
  return `<button class="drawer-btn" data-drawer-toggle aria-controls="admin-drawer" aria-expanded="${state.open}" aria-label="Buka menu navigasi">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
    ${badge ? `<i class="drawer-dot">${badge > 99 ? '99+' : badge}</i>` : ''}
  </button>`;
}

// Global: Escape closes an open drawer (unless a modal is on top), and the
// drawer resets when the screen grows to desktop width.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || document.querySelector('.modal-wrap')) return;
  document.querySelector('.admin.drawer-open .admin-scrim')?.click();
});
window.addEventListener('resize', () => {
  if (!window.matchMedia(MOBILE).matches) document.querySelector('.admin.drawer-open .admin-scrim')?.click();
});
