/* Shared UI: fonts, injected navbar/footer, cart drawer, email-code auth (used on /account),
   toast, confirm, lucide icons, WhatsApp floating button, mobile nav.
   Skips navbar/footer/wa-float injection on /admin routes. */

const IS_ADMIN = location.pathname.startsWith('/admin');
const LOGO_BLACK = '/images/logo_icon_black.png';
const LOGO_WHITE = '/images/logo_icon_white.png';

// ---------- Cloudinary URL optimizer ----------
window.cldOpt = function (url, w = 800) {
  if (!url || typeof url !== 'string') return url;
  if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) return url;
  if (url.includes('/upload/f_auto') || url.includes('/upload/q_auto')) return url;
  return url.replace('/upload/', `/upload/f_auto,q_auto,w_${w}/`);
};

// ---------- Font & icon loader ----------
(function injectHead() {
  if (document.querySelector('link[data-dd-fonts]')) return;
  const links = [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: '' },
    { rel: 'stylesheet', href: 'https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@400,500,700,800&display=swap' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' },
  ];
  links.forEach(a => {
    const l = document.createElement('link');
    Object.entries(a).forEach(([k, v]) => v === '' ? l.setAttribute(k, '') : l.setAttribute(k.replace(/([A-Z])/g, '-$1').toLowerCase(), v));
    l.setAttribute('data-dd-fonts', '1');
    document.head.appendChild(l);
  });
  if (!window.lucide) {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/lucide@latest';
    s.onload = () => { try { window.lucide.createIcons(); } catch (e) {} };
    document.head.appendChild(s);
  }
})();

// ---------- Brand SVG icons ----------
const SVG = {
  whatsapp: `<svg viewBox="0 0 24 24"><path d="M20.52 3.48A11.9 11.9 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.9c0 2.1.55 4.14 1.6 5.94L0 24l6.3-1.65a11.87 11.87 0 0 0 5.74 1.46h.01c6.55 0 11.89-5.34 11.89-11.9 0-3.18-1.24-6.17-3.42-8.43ZM12.05 21.8c-1.8 0-3.55-.48-5.09-1.4l-.36-.22-3.74.98 1-3.64-.24-.37a9.87 9.87 0 0 1-1.52-5.25c0-5.45 4.44-9.88 9.9-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.9 7c0 5.45-4.44 9.88-9.9 9.88Zm5.44-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37s-1.04 1.02-1.04 2.48 1.06 2.87 1.21 3.07c.15.2 2.08 3.18 5.05 4.46.71.31 1.26.5 1.69.63.71.23 1.35.2 1.86.12.57-.08 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35Z"/></svg>`,
  instagram: `<svg viewBox="0 0 24 24"><path d="M12 2.16c3.2 0 3.58.02 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.05 1.27.07 1.65.07 4.85s-.02 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.05-1.65.07-4.85.07s-3.58-.02-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.73 3.73 0 0 1-1.38-.9 3.72 3.72 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.18 15.58 2.16 15.2 2.16 12s.02-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.18 8.8 2.16 12 2.16M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.91.33 4.15.63a5.9 5.9 0 0 0-2.13 1.39A5.9 5.9 0 0 0 .63 4.15c-.3.76-.5 1.63-.56 2.9C.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.14.56 2.9a5.9 5.9 0 0 0 1.39 2.13 5.9 5.9 0 0 0 2.13 1.39c.76.3 1.63.5 2.9.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.14-.26 2.9-.56a5.9 5.9 0 0 0 2.13-1.39 5.9 5.9 0 0 0 1.39-2.13c.3-.76.5-1.63.56-2.9C23.99 15.67 24 15.26 24 12s-.01-3.67-.07-4.95c-.06-1.27-.26-2.14-.56-2.9a5.9 5.9 0 0 0-1.39-2.13A5.9 5.9 0 0 0 19.85.63c-.76-.3-1.63-.5-2.9-.56C15.67.01 15.26 0 12 0Zm0 5.84A6.16 6.16 0 1 0 12 18.16 6.16 6.16 0 0 0 12 5.84ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.41-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88Z"/></svg>`,
  tiktok: `<svg viewBox="0 0 24 24"><path d="M19.32 5.56A6.28 6.28 0 0 1 15.79 4v10.24a3.65 3.65 0 1 1-3.66-3.65c.2 0 .4.02.59.05v-2.6a6.24 6.24 0 0 0-.59-.03A6.25 6.25 0 1 0 18.39 14.24V8.85a8.86 8.86 0 0 0 5.14 1.65V7.9a5.85 5.85 0 0 1-4.21-2.34Z"/></svg>`,
};

// ---------- Toast ----------
function showToast(message, type = 'success') {
  let toast = document.getElementById('toast');
  if (!toast) { toast = document.createElement('div'); toast.id = 'toast'; toast.className = 'toast'; document.body.appendChild(toast); }
  toast.textContent = message;
  toast.className = 'toast show' + (type === 'error' ? ' error' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('show'), 3200);
}
window.showToast = showToast;

// ---------- Confirm modal ----------
window.confirmModal = function ({ title = 'Are you sure?', message = '', confirmText = 'Confirm', cancelText = 'Cancel', danger = false, onConfirm } = {}) {
  let overlay = document.getElementById('confirmModal');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'confirmModal';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box" role="dialog" aria-modal="true">
      <h3>${title}</h3>
      ${message ? `<p>${message}</p>` : ''}
      <div class="confirm-actions">
        <button class="btn" data-act="cancel">${cancelText}</button>
        <button class="btn ${danger ? 'btn--danger' : 'btn--solid'}" data-act="ok">${confirmText}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  const close = () => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 200); };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-act="cancel"]').addEventListener('click', close);
  overlay.querySelector('[data-act="ok"]').addEventListener('click', () => { close(); onConfirm && onConfirm(); });
};

// ---------- Injected navbar / footer ----------
const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/shop', label: 'Shop' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/lookbook', label: 'Lookbook' },
  { href: '/reviews', label: 'Reviews' },
  { href: '/roles', label: 'Roles' },
  { href: '/contact', label: 'Contact' },
];

function currentPath() { return (location.pathname.replace(/\.html$/, '').replace(/\/$/, '')) || '/'; }

function injectNavbar() {
  const existing = document.querySelector('.navbar');
  const path = currentPath();
  const linksHtml = NAV_LINKS.map(l => {
    const active = (l.href === '/' ? path === '/' : path.startsWith(l.href)) ? ' class="active"' : '';
    return `<a href="${l.href}"${active}>${l.label}</a>`;
  }).join('');
  const html = `
    <nav class="navbar">
      <div class="wrap navbar__inner">
        <a href="/" class="navbar__logo" aria-label="Drips and Drops home">
          <img src="${LOGO_BLACK}" alt="" onerror="this.onerror=null;this.src='${LOGO_WHITE}'" />
          <span class="brand">DRIPS &amp; DROPS</span>
        </a>
        <div class="navbar__links" id="navLinks">${linksHtml}</div>
        <div class="navbar__actions">
          <a class="nav-btn" id="navAccount" href="/account" aria-label="Account"><i data-lucide="user-round"></i></a>
          <button class="nav-btn" data-cart-open aria-label="Open cart">
            <i data-lucide="shopping-bag"></i>
            <span class="badge navbar__cart-count" data-count="0">0</span>
          </button>
          <button class="navbar__burger" id="navBurger" aria-label="Menu"><span></span><span></span><span></span></button>
        </div>
      </div>
    </nav>`;
  if (existing) existing.outerHTML = html;
  else document.body.insertAdjacentHTML('afterbegin', html);
}

function injectFooter() {
  const existing = document.querySelector('.footer');
  const html = `
    <footer class="footer">
      <div class="wrap footer__grid">
        <div class="footer__brand">
          <div class="footer__logo">
            <img src="${LOGO_WHITE}" alt="" />
            <b>DRIPS &amp; DROPS</b>
          </div>
          <p>Elevated basics for the days you want to keep it simple. Small runs, big energy.</p>
          <div class="footer__socials">
            <a href="https://wa.me/2347075826790" target="_blank" rel="noopener" aria-label="WhatsApp">${SVG.whatsapp}</a>
            <a href="https://instagram.com/dripsanddrops" target="_blank" rel="noopener" aria-label="Instagram">${SVG.instagram}</a>
            <a href="https://tiktok.com/@dripsanddrops" target="_blank" rel="noopener" aria-label="TikTok">${SVG.tiktok}</a>
          </div>
        </div>
        <div class="footer__col">
          <h4>Shop</h4>
          <a href="/">Home</a>
          <a href="/shop">All products</a>
          <a href="/lookbook">Lookbook</a>
          <a href="/calendar">Calendar</a>
        </div>
        <div class="footer__col">
          <h4>Support</h4>
          <a href="/reviews#faqs">FAQs</a>
          <a href="/reviews">Reviews</a>
          <a href="/contact">Contact us</a>
          <a href="https://wa.me/2347075826790" target="_blank" rel="noopener">WhatsApp</a>
          <a href="mailto:dripsanddrops.shop@gmail.com">Email</a>
        </div>
        <div class="footer__col">
          <h4>Account</h4>
          <a href="/account">Sign in</a>
          <a href="/account">My orders</a>
          <a href="/account?tab=wishlist">Wishlist</a>
        </div>
      </div>
      <div class="wrap footer__bottom">
        <div>© <span id="year"></span> Drips &amp; Drops</div>
        <div class="footer__credit">Made by <a href="https://madebyabdullah.com" target="_blank" rel="noopener">AJ</a></div>
      </div>
    </footer>`;
  if (existing) existing.outerHTML = html;
  else document.body.insertAdjacentHTML('beforeend', html);
  const y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
}

// ---------- Cart drawer ----------
function ensureCartDrawer() {
  if (document.getElementById('cartDrawer')) return;
  const bd = document.createElement('div');
  bd.className = 'drawer-backdrop'; bd.id = 'cartBackdrop';
  const dr = document.createElement('aside');
  dr.className = 'drawer'; dr.id = 'cartDrawer';
  dr.innerHTML = `
    <div class="drawer__head">
      <h3>Your bag</h3>
      <button class="drawer__close" id="cartClose" aria-label="Close">&times;</button>
    </div>
    <div class="drawer__body" id="cartDrawerBody"></div>
    <div class="drawer__foot" id="cartDrawerFoot"></div>`;
  document.body.appendChild(bd); document.body.appendChild(dr);
  bd.addEventListener('click', closeCartDrawer);
  dr.querySelector('#cartClose').addEventListener('click', closeCartDrawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && dr.classList.contains('open')) closeCartDrawer(); });
}
function trashSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>`;
}
function renderCartDrawer() {
  const cart = Cart.get();
  const body = document.getElementById('cartDrawerBody');
  const foot = document.getElementById('cartDrawerFoot');
  if (!body || !foot) return;
  if (!cart.items.length) {
    body.innerHTML = `<div class="empty-state" style="padding:80px 0;">
      <div><i data-lucide="shopping-bag" style="width:36px;height:36px;"></i></div>
      <div style="margin-top:8px;">Your bag is empty.</div></div>`;
    foot.innerHTML = `<a href="/shop" class="btn btn--solid btn--block" onclick="closeCartDrawer()">Shop the drop</a>`;
    if (window.lucide) window.lucide.createIcons();
    return;
  }
  body.innerHTML = cart.items.map((item, i) => `
    <div class="cart-row">
      <img src="${cldOpt(item.image || '/images/placeholder.svg', 200)}" alt="${item.name}" />
      <div>
        <div class="cart-row__name">${item.name}</div>
        <div class="cart-row__meta">${[item.size ? 'Size: ' + item.size : '', item.color ? 'Color: ' + item.color : ''].filter(Boolean).join(' · ')}</div>
        <div class="cart-row__actions">
          <div class="qty-control">
            <button data-i="${i}" class="qtyMinus" aria-label="Decrease">−</button>
            <span>${item.qty}</span>
            <button data-i="${i}" class="qtyPlus" aria-label="Increase">+</button>
          </div>
          <button class="cart-row__remove" data-i="${i}" data-remove aria-label="Remove item">${trashSvg()}</button>
        </div>
      </div>
      <div class="cart-row__price">${Cart.money(item.price * item.qty)}</div>
    </div>`).join('');
  const subtotal = Cart.total();
  foot.innerHTML = `
    <div class="summary-line"><span>Subtotal</span><span>${Cart.money(subtotal)}</span></div>
    <div class="summary-line"><span>Delivery</span><span>Calculated at checkout</span></div>
    <div class="summary-line total"><span>Total</span><span>${Cart.money(subtotal)}</span></div>
    <a href="/checkout" class="btn btn--solid btn--block" style="margin-top:14px;">Checkout</a>`;
  body.querySelectorAll('.qtyMinus').forEach(b => b.addEventListener('click', () => { const i = Number(b.dataset.i); Cart.updateQty(i, Cart.get().items[i].qty - 1); renderCartDrawer(); }));
  body.querySelectorAll('.qtyPlus').forEach(b => b.addEventListener('click', async () => {
    const i = Number(b.dataset.i);
    const item = Cart.get().items[i];
    if (!item) return;
    // Never let the bag exceed what is actually in stock.
    if (window.checkStockAvailability) {
      b.disabled = true;
      try {
        const { ok, problems } = await window.checkStockAvailability([{ ...item, qty: item.qty + 1 }]);
        if (!ok) {
          const p = problems[0] || {};
          showToast(p.have > 0 ? `Only ${p.have} left of ${p.name}` : `${item.name} is sold out`, 'error');
          b.disabled = false;
          return;
        }
      } catch { /* fall through — checkout re-validates anyway */ }
      b.disabled = false;
    }
    Cart.updateQty(i, item.qty + 1);
    renderCartDrawer();
  }));
  body.querySelectorAll('[data-remove]').forEach(el => el.addEventListener('click', () => { Cart.remove(Number(el.dataset.i)); renderCartDrawer(); }));
}
function openCartDrawer() {
  ensureCartDrawer(); renderCartDrawer();
  document.getElementById('cartBackdrop').classList.add('open');
  document.getElementById('cartDrawer').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeCartDrawer() {
  document.getElementById('cartBackdrop')?.classList.remove('open');
  document.getElementById('cartDrawer')?.classList.remove('open');
  document.body.style.overflow = '';
}
window.openCartDrawer = openCartDrawer;
window.closeCartDrawer = closeCartDrawer;
window.addEventListener('cart:changed', () => {
  if (document.getElementById('cartDrawer')?.classList.contains('open')) renderCartDrawer();
  document.querySelectorAll('.navbar__cart-count').forEach(b => {
    const n = Cart.get().items.reduce((s, i) => s + i.qty, 0);
    b.textContent = n; b.setAttribute('data-count', String(n));
  });
});

// ---------- Auth (6-digit code, stored in localStorage) ----------
const CUSTOMER_KEY = 'dd_customer';
window.Auth = {
  user: null,
  _listeners: new Set(),
  onChange(fn) { this._listeners.add(fn); fn(this.user); return () => this._listeners.delete(fn); },
  _emit() { this._listeners.forEach(fn => { try { fn(this.user); } catch (e) {} }); },
  signOut() {
    try { localStorage.removeItem(CUSTOMER_KEY); } catch {}
    this.user = null; this._emit();
  },
};
function _loadCustomer() {
  try {
    const raw = localStorage.getItem(CUSTOMER_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!c || !c.email || !c.expires) return null;
    if (Date.now() > c.expires) { localStorage.removeItem(CUSTOMER_KEY); return null; }
    return c;
  } catch { return null; }
}
window._loadCustomer = _loadCustomer;
window._saveCustomer = function (email, token) {
  const c = { email, token: token || null, expires: Date.now() + 30 * 24 * 60 * 60 * 1000 };
  localStorage.setItem(CUSTOMER_KEY, JSON.stringify(c));
  Auth.user = c; Auth._emit();
  return c;
};
function _authInit() { Auth.user = _loadCustomer(); Auth._emit(); }

// ---------- Mobile nav ----------
function closeMobileNav() {
  document.getElementById('navBurger')?.classList.remove('active');
  document.getElementById('navLinks')?.classList.remove('open');
  document.body.classList.remove('nav-open');
}
window.closeMobileNav = closeMobileNav;

// ---------- WhatsApp floating button ----------
function ensureWhatsAppButton() {
  if (document.getElementById('waFloat')) return;
  const a = document.createElement('a');
  a.id = 'waFloat'; a.className = 'wa-float';
  a.href = 'https://wa.me/2347075826790'; a.target = '_blank'; a.rel = 'noopener';
  a.setAttribute('aria-label', 'Chat on WhatsApp');
  a.innerHTML = SVG.whatsapp;
  document.body.appendChild(a);
}

// ---------- FAQ accordion ----------
document.addEventListener('click', (e) => {
  const q = e.target.closest('.faq__q');
  if (!q) return;
  q.parentElement.classList.toggle('open');
});

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
  if (!IS_ADMIN) {
    injectNavbar();
    injectFooter();

    const burger = document.getElementById('navBurger');
    const links = document.getElementById('navLinks');
    if (burger && links) {
      burger.addEventListener('click', () => {
        const open = links.classList.toggle('open');
        burger.classList.toggle('active', open);
        document.body.classList.toggle('nav-open', open);
      });
      links.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMobileNav));
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMobileNav(); });
      document.addEventListener('click', (e) => {
        if (!links.classList.contains('open')) return;
        if (e.target.closest('.navbar')) return;
        closeMobileNav();
      });
    }
    document.querySelectorAll('[data-cart-open]').forEach(el => {
      el.addEventListener('click', (e) => { e.preventDefault(); closeMobileNav(); openCartDrawer(); });
    });

    ensureWhatsAppButton();
  }

  if (window.Cart) window.dispatchEvent(new Event('cart:changed'));

  const tryLucide = () => { if (window.lucide) window.lucide.createIcons(); else setTimeout(tryLucide, 120); };
  tryLucide();

  _authInit();

  if (window.logEvent && !IS_ADMIN) {
    window.logEvent('pageview', { title: document.title });
  }
});


// ---------------------------------------------------------------------------
// Product-card image rotation.
// One global ticker drives EVERY card on the page, so all products with more
// than one photo change at exactly the same moment.
// ---------------------------------------------------------------------------
(function cardSlideshow() {
  var INTERVAL = 3000;
  var step = 0;
  function tick() {
    step++;
    document.querySelectorAll('.card__media.has-slides').forEach(function (media) {
      var imgs = media.querySelectorAll('.card__img');
      if (imgs.length < 2) return;
      var idx = step % imgs.length;
      imgs.forEach(function (img, i) { img.classList.toggle('is-active', i === idx); });
    });
  }
  function start() {
    if (window.__ddCardTimer) return;
    window.__ddCardTimer = setInterval(function () {
      if (document.visibilityState === 'visible') tick();
    }, INTERVAL);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
