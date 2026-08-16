/* Home page: hero slider (single rolling outline ring, no inner dot),
   arrivals hscroll with peek + arrows, featured section, lookbook preview,
   combos, reviews, newsletter. */

// ---------- Hero slider ----------
(function initHeroSlider() {
  const slides = document.querySelectorAll('#heroSlides .hero__slide');
  const indicators = document.getElementById('heroIndicators');
  if (!slides.length || !indicators) return;

  const DURATION = 5000;

  const captions = [
    { title: `Shop the <span class="outline">summer</span>.`, sub: `Breathable pieces built for the sunniest days.` },
    { title: `<span class="outline">Basic</span> drop.`, sub: `Elevated basics for the days you want to keep it simple.` },
    { title: `Fits that <span class="outline">move</span> with you.`, sub: `Off-duty pieces that hold their shape from morning to night.` },
  ];

  indicators.innerHTML = `
    <button class="hero__arrow" data-nav="prev" aria-label="Previous slide"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
    ${Array.from(slides).map((_, i) => `<button class="hero__ring ${i === 0 ? 'active' : ''}" data-idx="${i}" aria-label="Slide ${i + 1}"></button>`).join('')}
    <button class="hero__arrow" data-nav="next" aria-label="Next slide"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></button>`;

  const rings = indicators.querySelectorAll('.hero__ring');
  const titleEl = document.getElementById('heroTitle');
  const subEl = document.getElementById('heroSub');
  if (titleEl) titleEl.innerHTML = captions[0].title;
  if (subEl) subEl.innerHTML = captions[0].sub;

  let idx = 0, start = performance.now(), paused = false;

  function setActive(i, reset = true) {
    slides.forEach((s, j) => s.classList.toggle('active', j === i));
    rings.forEach((r, j) => { r.classList.toggle('active', j === i); r.style.setProperty('--p', '0deg'); });
    if (titleEl) titleEl.innerHTML = captions[i]?.title || '';
    if (subEl) subEl.innerHTML = captions[i]?.sub || '';
    idx = i;
    if (reset) start = performance.now();
  }
  function tick(now) {
    if (!paused && !document.hidden) {
      const pct = Math.min((now - start) / DURATION, 1);
      const ring = rings[idx];
      if (ring) ring.style.setProperty('--p', `${pct * 360}deg`);
      if (pct >= 1) setActive((idx + 1) % slides.length);
    } else {
      // keep the timer honest while paused/hidden so it never jumps a slide
      start = now - 0;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // Navigation always restarts the autoplay clock — never stops it.
  const go = (i) => { paused = false; setActive((i + slides.length) % slides.length); };
  rings.forEach(r => r.addEventListener('click', () => go(Number(r.dataset.idx))));
  indicators.querySelector('[data-nav="prev"]').addEventListener('click', () => go(idx - 1));
  indicators.querySelector('[data-nav="next"]').addEventListener('click', () => go(idx + 1));

  // Pause on hover only for real mouse pointers (a tap on touch used to freeze it).
  const hero = document.getElementById('hero');
  if (hero && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    hero.addEventListener('mouseenter', () => { paused = true; });
    hero.addEventListener('mouseleave', () => { paused = false; start = performance.now(); });
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) start = performance.now(); });
})();

// ---------- Product card renderer ----------
window.renderProductCard = function (p) {
  const stockCount = Number(p.stock ?? p.quantity ?? 0) || 0;
  const soldOut = stockCount <= 0;
  const wish = JSON.parse(localStorage.getItem('dd_wishlist') || '[]');
  const isWished = wish.some(w => w.id === p.id);
  const isNew = p.createdAt && (Date.now() - (docTime ? docTime(p.createdAt) : new Date(p.createdAt).getTime())) < 21 * 24 * 60 * 60 * 1000;
  const price = Number(p.price || 0);
  const original = Number(p.originalPrice || 0);
  const hasSale = original > price && price > 0;
  const hasOpts = !soldOut && ((p.sizes && p.sizes.length) || (Array.isArray(p.colors) && p.colors.length));
  const gallery = (Array.isArray(p.images) ? p.images : []).filter(Boolean);
  if (!gallery.length && p.image) gallery.push(p.image);
  if (!gallery.length) gallery.push('/images/placeholder.svg');
  const img = cldOpt(gallery[0], 500);
  // Products with more than one photo cycle through them. Every card on the
  // page advances on the SAME global tick (see js/ui.js) so they stay in sync.
  const mediaImgs = gallery.slice(0, 6).map((src, i) =>
    `<img src="${cldOpt(src, 500)}" alt="${p.name}" loading="${i === 0 ? 'eager' : 'lazy'}" class="card__img${i === 0 ? ' is-active' : ''}" data-slide="${i}" />`
  ).join('');
  const wishData = encodeURIComponent(JSON.stringify({ id: p.id, name: p.name, price, image: (p.images && p.images[0]) || p.image }));
  const productData = encodeURIComponent(JSON.stringify({ id: p.id, name: p.name, price, image: (p.images && p.images[0]) || p.image, sizes: p.sizes || [], colors: p.colors || [] }));
  // Show the exact count for every product; badge only flags sold out / low.
  const lowStock = !soldOut && stockCount <= 5;
  const stockBadge = soldOut
    ? '<span class="badge-pill badge-pill--sold">Sold out</span>'
    : lowStock
      ? '<span class="badge-pill badge-pill--sold">Low stock</span>'
      : '';
  const stockLabel = soldOut ? 'Sold out' : `${stockCount} left`;
  return `
    <div class="card ${soldOut ? 'is-sold' : ''}">
      <a href="/product?id=${p.id}" class="card__media${gallery.length > 1 ? ' has-slides' : ''}" aria-label="${p.name}" data-slides="${gallery.length > 1 ? Math.min(gallery.length, 6) : 1}">
        ${mediaImgs}
        <div class="card__badges">
          ${!soldOut && isNew ? '<span class="badge-pill badge-pill--new">New</span>' : ''}
          ${hasSale ? '<span class="badge-pill badge-pill--sale">Sale</span>' : ''}
          ${stockBadge}
        </div>
        <button class="card__wish ${isWished ? 'active' : ''}" data-wish="${p.id}" aria-label="Wishlist" onclick="event.preventDefault();event.stopPropagation();toggleWishlist(decodeURIComponent('${wishData}'))">
          <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
      </a>
      <div class="card__body">
        <a href="/product?id=${p.id}" class="card__title">${p.name}</a>
        <div class="card__meta">${[p.category || '', stockLabel].filter(Boolean).join(' · ')}</div>
        <div class="card__price">${hasSale ? `<small>${Cart.money(original)}</small><span class="sale">${Cart.money(price)}</span>` : Cart.money(price)}</div>
        ${soldOut
          ? `<button class="card__cta is-sold" disabled>Sold out</button>`
          : hasOpts
            ? `<a class="card__cta is-options" href="/product?id=${p.id}">Select options</a>`
            : `<button class="card__cta" onclick="event.preventDefault();quickAdd(decodeURIComponent('${productData}'))">Add to cart</button>`
        }
      </div>
    </div>`;
};

window.quickAdd = async function (pJson) {
  const p = typeof pJson === 'string' ? JSON.parse(pJson) : pJson;
  if ((p.sizes && p.sizes.length) || (Array.isArray(p.colors) && p.colors.length)) {
    location.href = '/product?id=' + p.id;
    return;
  }
  // Confirm live stock before the item ever reaches the bag.
  const inBag = (Cart.get().items || [])
    .filter(i => String(i.id) === String(p.id))
    .reduce((sum, i) => sum + (Number(i.qty) || 0), 0);
  try {
    const { ok, problems } = await checkStockAvailability([{ id: p.id, name: p.name, qty: inBag + 1 }]);
    if (!ok) {
      const prob = problems[0] || {};
      showToast(prob.have > 0 ? `Only ${prob.have} left of ${p.name}` : `${p.name} is sold out`, 'error');
      return;
    }
  } catch { /* checkout re-validates before payment */ }
  Cart.add({ id: p.id, name: p.name, price: p.price, image: p.image }, {}, 1);
  showToast('Added to bag');
  openCartDrawer();
};

window.toggleWishlist = function (pJson) {
  const p = typeof pJson === 'string' ? JSON.parse(pJson) : pJson;
  const wish = JSON.parse(localStorage.getItem('dd_wishlist') || '[]');
  const i = wish.findIndex(w => w.id === p.id);
  if (i >= 0) { wish.splice(i, 1); showToast('Removed from wishlist'); }
  else { wish.push({ id: p.id, name: p.name, price: p.price, image: p.image }); showToast('Saved to wishlist'); }
  localStorage.setItem('dd_wishlist', JSON.stringify(wish));
  document.querySelectorAll(`[data-wish="${p.id}"]`).forEach(b => b.classList.toggle('active', i < 0));
};

// ---------- Hscroll arrows ----------
window.wireHscroll = function (scrollerId, prevId, nextId) {
  const el = document.getElementById(scrollerId);
  const prev = document.getElementById(prevId);
  const next = document.getElementById(nextId);
  if (!el || !prev || !next) return;
  const step = () => Math.max(240, el.clientWidth * 0.6);
  prev.addEventListener('click', () => el.scrollBy({ left: -step(), behavior: 'smooth' }));
  next.addEventListener('click', () => el.scrollBy({ left: step(), behavior: 'smooth' }));
};

// ---------- Arrivals ----------
(function loadArrivals() {
  const grid = document.getElementById('arrivalsGrid');
  if (!grid) return;
  watchCollection('products', (list) => {
    let rows = list.filter(p => p.active !== false && Number(p.stock ?? p.quantity ?? 0) > 0);
    rows.sort((a, b) => (docTime(b.createdAt) - docTime(a.createdAt)));
    rows = rows.slice(0, 4);
    if (!rows.length) { grid.innerHTML = `<div class="empty-state">No products yet.</div>`; return; }
    grid.innerHTML = rows.map(renderProductCard).join('');
  });
  wireHscroll('arrivalsGrid', 'arrivalsPrev', 'arrivalsNext');
})();

// ---------- Featured (from featured/list doc) ----------
(function loadFeatured() {
  const section = document.getElementById('featured-section');
  const grid = document.getElementById('featuredGrid');
  if (!section || !grid) return;

  let productList = [], comboList = [], featuredIds = [];

  function render() {
    if (!featuredIds.length) { section.style.display = 'none'; return; }
    const cards = [];
    featuredIds.forEach(key => {
      if (String(key).startsWith('combo:')) {
        const c = comboList.find(x => x.id === key.slice(6));
        if (c) cards.push(comboCardHtml(c));
      } else {
        const p = productList.find(x => x.id === key);
        if (p) cards.push(renderProductCard(p));
      }
    });
    if (!cards.length) { section.style.display = 'none'; return; }
    section.style.display = '';
    grid.innerHTML = cards.join('');
  }
  function comboCardHtml(c) {
    return `<a class="card" href="/product?combo=${c.id}">
      <div class="card__media"><img src="${cldOpt(c.image || (c.images && c.images[0]) || '/images/placeholder.svg', 500)}" alt="${c.name}" loading="lazy" /><div class="card__badges"><span class="badge-pill">Combo</span></div></div>
      <div class="card__body">
        <div class="card__title">${c.name}</div>
        <div class="card__meta">${(c.productIds || []).length} pieces</div>
        <div class="card__price">${Cart.money(c.price || 0)}</div>
        <span class="card__cta is-options">View combo</span>
      </div>
    </a>`;
  }
  wireHscroll('featuredGrid', 'featuredPrev', 'featuredNext');
  watchCollection('products', l => { productList = l; render(); });
  watchCollection('combos', l => { comboList = l; render(); });
  initFirebase().then(({ db }) => {
    db.collection('featured').doc('list').onSnapshot(doc => {
      featuredIds = (doc.exists && Array.isArray(doc.data().productIds)) ? doc.data().productIds : [];
      render();
    }, () => {});
  });
})();

// ---------- Lookbook preview ----------
(function loadLookbookPreview() {
  const grid = document.getElementById('lookbookGrid');
  if (!grid) return;
  watchCollection('lookbook', (list) => {
    const rows = list.filter(x => x.imageUrl).slice(0, 4);
    if (!rows.length) {
      grid.innerHTML = ['/images/hero_section_1.jpg','/images/summer_section.jpg','/images/hero_section_2.jpg','/images/hero_section_3.jpg']
        .map(src => `<a class="lookbook__cell" href="/lookbook"><img src="${src}" alt="" loading="lazy" /></a>`).join('');
      return;
    }
    grid.innerHTML = rows.map(x => `<a class="lookbook__cell" href="/lookbook"><img src="${cldOpt(x.imageUrl, 600)}" alt="${x.caption || ''}" loading="lazy" /></a>`).join('');
  });
})();

// ---------- Combos ----------
(function loadCombos() {
  const section = document.getElementById('combos-section');
  const grid = document.getElementById('combosGrid');
  if (!grid || !section) return;
  watchCollection('combos', (rows) => {
    const list = rows.filter(c => c.active !== false);
    if (!list.length) { section.style.display = 'none'; return; }
    section.style.display = '';
    grid.innerHTML = list.map(c => `
      <a class="card" href="/product?combo=${c.id}">
        <div class="card__media"><img src="${cldOpt(c.image || (c.images && c.images[0]) || '/images/placeholder.svg', 500)}" alt="${c.name}" loading="lazy" /><div class="card__badges"><span class="badge-pill">Combo</span></div></div>
        <div class="card__body">
          <div class="card__title">${c.name}</div>
          <div class="card__meta">${(c.productIds || []).length} pieces</div>
          <div class="card__price">${Cart.money(c.price || 0)}</div>
          <span class="card__cta is-options">View combo</span>
        </div>
      </a>`).join('');
  });
})();

// ---------- Reviews ----------
(function loadReviews() {
  const section = document.getElementById('reviews-section');
  const grid = document.getElementById('reviewsGrid');
  if (!grid || !section) return;
  watchCollection('reviews', (list) => {
    const visible = list.filter(r => r.approved !== false);
    // Admin picks which reviews appear here (reviews.featured === true).
    const picked = visible.filter(r => r.featured === true);
    const rows = (picked.length ? picked : visible)
      .sort((a, b) => docTime(b.createdAt) - docTime(a.createdAt))
      .slice(0, 10);
    if (!rows.length) { section.style.display = 'none'; return; }
    section.style.display = '';
    grid.innerHTML = rows.map(r => {
      const rating = Number(r.overallRating || r.rating || 5);
      const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
      return `<div class="review-card" style="background:#1f1e1c;color:#f5f2ec;">
        <div class="review-card__stars">${stars}</div>
        <div class="review-card__text" style="color:rgba(255,255,255,0.85);">"${(r.text || r.comment || '').replace(/</g,'&lt;')}"</div>
        <div class="review-card__author" style="color:#fff;">${(r.name || r.author || 'Anonymous').replace(/</g,'&lt;')} <small style="color:rgba(255,255,255,0.5);">${r.productName || ''}</small></div>
      </div>`;
    }).join('');
  });
})();

// ---------- Newsletter ----------
// Firestore rules only allow anonymous CREATE on `newsletter` — the old code
// ran a `where('email','==',...)` duplicate query first, which is a READ and
// always failed with permission-denied, so every subscribe showed
// "Something went wrong". We now write straight to a deterministic doc id
// (the email itself), so duplicates are impossible and no read is needed.
function newsletterDocId(email) {
  return email.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120);
}

document.getElementById('newsletterForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const input = document.getElementById('newsletterEmail');
  const btn = form.querySelector('button[type="submit"], button:not([type])');
  const email = (input.value || '').trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    input.focus();
    return showToast('Enter a valid email address', 'error');
  }

  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Subscribing…'; }

  try {
    const { db } = await initFirebase();
    await db.collection('newsletter').doc(newsletterDocId(email)).set({
      email,
      source: 'home',
      status: 'subscribed',
      createdAt: new Date().toISOString(),
    });
    input.value = '';
    showToast('Subscribed! Watch your inbox for the next drop.');
    if (window.logEvent) window.logEvent('newsletter_subscribe', { email });
  } catch (err) {
    // A doc at that id already exists: rules allow create but not update, so
    // Firestore rejects the write. That is exactly the "already subscribed" case.
    if (err && (err.code === 'permission-denied' || err.code === 'already-exists')) {
      input.value = '';
      showToast("You're already on the list — thanks!");
    } else {
      console.error('newsletter subscribe failed', err);
      showToast('Could not subscribe right now. Please try again.', 'error');
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
});
