/* Shop page: filter drawer (categories mosaic + price + sort), product grid,
   combos, live via Firestore. */

let allProducts = [];
let allCombos = [];

const state = {
  category: 'all',
  price: null,          // { min, max } preset
  min: '',              // custom
  max: '',
  inStockOnly: false,
  onSaleOnly: false,
  sort: 'newest',
};

const PRICE_PRESETS = [
  { key: 'u10', label: 'Under ₦10,000', min: 0, max: 10000 },
  { key: '10-25', label: '₦10k – ₦25k', min: 10000, max: 25000 },
  { key: '25-50', label: '₦25k – ₦50k', min: 25000, max: 50000 },
  { key: '50+', label: '₦50k +', min: 50000, max: Infinity },
];

function productStockValue(p) { return Number(p?.stock ?? p?.quantity ?? 0) || 0; }
function comboAvailable(c) {
  const items = c._items || [];
  return c.active !== false && items.length > 0 && items.every(p => p && p.active !== false && productStockValue(p) > 0);
}
function priceOf(x) { return Number(x.price || 0); }
function isOnSale(p) { return Number(p.originalPrice || 0) > priceOf(p) && priceOf(p) > 0; }

function comboCard(c) {
  const soldOut = !comboAvailable(c);
  return `
    <a class="card ${soldOut ? 'is-sold' : ''}" href="/product?combo=${c.id}">
      <div class="card__media">
        <img src="${cldOpt(c.image || (c.images && c.images[0]) || '/images/placeholder.svg', 500)}" alt="${c.name}" loading="lazy" />
        <div class="card__badges"><span class="badge-pill">Combo</span>${soldOut ? '<span class="badge-pill badge-pill--sold">Unavailable</span>' : ''}</div>
      </div>
      <div class="card__body">
        <div class="card__title">${c.name}</div>
        <div class="card__meta">${(c.productIds || []).length} pieces</div>
        <div class="card__price">${Cart.money(c.price)}</div>
        ${soldOut ? '<button class="card__cta is-sold" disabled>Unavailable</button>' : '<span class="card__cta is-options">View combo</span>'}
      </div>
    </a>`;
}

// ---------- Filtering ----------
function priceBounds() {
  const min = state.min !== '' ? Number(state.min) : (state.price ? state.price.min : 0);
  const max = state.max !== '' ? Number(state.max) : (state.price ? state.price.max : Infinity);
  return { min: isNaN(min) ? 0 : min, max: isNaN(max) ? Infinity : max };
}

function visibleProducts() {
  const { min, max } = priceBounds();
  let rows = allProducts.filter(p => p.active !== false);
  if (state.category !== 'all' && state.category !== 'combos') {
    rows = rows.filter(p => (p.category || 'uncategorized').toLowerCase() === state.category);
  }
  rows = rows.filter(p => priceOf(p) >= min && priceOf(p) <= max);
  if (state.inStockOnly) rows = rows.filter(p => productStockValue(p) > 0);
  if (state.onSaleOnly) rows = rows.filter(isOnSale);
  return rows;
}

function visibleCombos() {
  const { min, max } = priceBounds();
  if (state.category !== 'all' && state.category !== 'combos') return [];
  if (state.onSaleOnly) return [];
  let rows = allCombos.filter(c => c.active !== false);
  rows = rows.filter(c => priceOf(c) >= min && priceOf(c) <= max);
  if (state.inStockOnly) rows = rows.filter(comboAvailable);
  return rows;
}

function sortItems(items) {
  const s = state.sort;
  return items.sort((a, b) => {
    if (s === 'price-asc') return priceOf(a.it) - priceOf(b.it);
    if (s === 'price-desc') return priceOf(b.it) - priceOf(a.it);
    if (s === 'name') return String(a.it.name || '').localeCompare(String(b.it.name || ''));
    return (docTime(b.it.createdAt) || 0) - (docTime(a.it.createdAt) || 0);
  });
}

function activeFilterCount() {
  let n = 0;
  if (state.category !== 'all') n++;
  if (state.price || state.min !== '' || state.max !== '') n++;
  if (state.inStockOnly) n++;
  if (state.onSaleOnly) n++;
  return n;
}

function render() {
  const grid = document.getElementById('shopGrid');
  if (!grid) return;
  const items = sortItems([
    ...visibleCombos().map(c => ({ __t: 'combo', it: c })),
    ...visibleProducts().map(p => ({ __t: 'product', it: p })),
  ]);

  const count = document.getElementById('shopCount');
  if (count) count.textContent = `${items.length} ${items.length === 1 ? 'item' : 'items'}`;

  const dot = document.getElementById('filterCount');
  if (dot) {
    const n = activeFilterCount();
    dot.textContent = n;
    dot.style.display = n ? 'inline-flex' : 'none';
  }

  if (!items.length) {
    grid.innerHTML = '<div class="empty-state">Nothing matches these filters. Try clearing a few.</div>';
    return;
  }
  grid.innerHTML = items.map(x => x.__t === 'combo' ? comboCard(x.it) : window.renderProductCard(x.it)).join('');
}

// ---------- Filter panel ----------
function categoryCounts() {
  const map = {};
  allProducts.filter(p => p.active !== false).forEach(p => {
    const c = (p.category || 'uncategorized').toLowerCase();
    map[c] = (map[c] || 0) + 1;
  });
  return map;
}

// Mixed tile widths, deterministic by index so the mosaic is stable.
const TILE_SIZES = ['cat-tile--wide', 'cat-tile--mid', 'cat-tile--slim', '', 'cat-tile--slim', 'cat-tile--mid'];

function renderFilterPanel() {
  const body = document.getElementById('filterBody');
  if (!body) return;
  const counts = categoryCounts();
  const cats = Object.keys(counts).sort();
  const combosCount = allCombos.filter(c => c.active !== false).length;

  const tiles = [
    { key: 'all', label: 'Everything', n: allProducts.filter(p => p.active !== false).length + combosCount, cls: 'cat-tile--wide' },
    ...cats.map((c, i) => ({ key: c, label: c, n: counts[c], cls: TILE_SIZES[i % TILE_SIZES.length] })),
  ];
  if (combosCount) tiles.push({ key: 'combos', label: 'Combos', n: combosCount, cls: 'cat-tile--mid' });

  body.innerHTML = `
    <div class="filter-group">
      <div class="filter-group__title">Categories</div>
      <div class="cat-mosaic">
        ${tiles.map(t => `
          <button class="cat-tile ${t.cls} ${state.category === t.key ? 'active' : ''}" data-cat="${t.key}">
            <span class="cat-tile__label">${t.label}</span>
            <span class="cat-tile__n">${t.n} ${t.n === 1 ? 'item' : 'items'}</span>
          </button>`).join('')}
      </div>
    </div>

    <div class="filter-group">
      <div class="filter-group__title">Price</div>
      <div class="price-chips">
        ${PRICE_PRESETS.map(p => `<button class="price-chip ${state.price && state.price.key === p.key ? 'active' : ''}" data-price="${p.key}">${p.label}</button>`).join('')}
      </div>
      <div class="price-range">
        <input type="number" inputmode="numeric" id="fMin" placeholder="Min ₦" value="${state.min}" />
        <span style="color:var(--muted);">to</span>
        <input type="number" inputmode="numeric" id="fMax" placeholder="Max ₦" value="${state.max}" />
      </div>
    </div>

    <div class="filter-group">
      <div class="filter-group__title">Availability</div>
      <div class="filter-toggles">
        <label class="filter-toggle"><input type="checkbox" id="fStock" ${state.inStockOnly ? 'checked' : ''} /> In stock only</label>
        <label class="filter-toggle"><input type="checkbox" id="fSale" ${state.onSaleOnly ? 'checked' : ''} /> On sale only</label>
      </div>
    </div>
  `;

  body.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => {
    state.category = b.dataset.cat; renderFilterPanel(); render();
  }));
  body.querySelectorAll('[data-price]').forEach(b => b.addEventListener('click', () => {
    const preset = PRICE_PRESETS.find(p => p.key === b.dataset.price);
    state.price = (state.price && state.price.key === preset.key) ? null : preset;
    state.min = ''; state.max = '';
    renderFilterPanel(); render();
  }));
  const min = document.getElementById('fMin'), max = document.getElementById('fMax');
  min.addEventListener('input', () => { state.min = min.value; state.price = null; render(); });
  max.addEventListener('input', () => { state.max = max.value; state.price = null; render(); });
  document.getElementById('fStock').addEventListener('change', e => { state.inStockOnly = e.target.checked; render(); });
  document.getElementById('fSale').addEventListener('change', e => { state.onSaleOnly = e.target.checked; render(); });
}

function openFilters() {
  document.getElementById('filterPanel')?.classList.add('open');
  document.getElementById('filterBackdrop')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeFilters() {
  document.getElementById('filterPanel')?.classList.remove('open');
  document.getElementById('filterBackdrop')?.classList.remove('open');
  document.body.style.overflow = '';
}

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(location.search);
  if (urlParams.get('category')) state.category = urlParams.get('category').toLowerCase();

  document.getElementById('filterToggle')?.addEventListener('click', () => { renderFilterPanel(); openFilters(); });
  document.getElementById('filterClose')?.addEventListener('click', closeFilters);
  document.getElementById('filterBackdrop')?.addEventListener('click', closeFilters);
  document.getElementById('filterApply')?.addEventListener('click', closeFilters);
  document.getElementById('filterReset')?.addEventListener('click', () => {
    state.category = 'all'; state.price = null; state.min = ''; state.max = '';
    state.inStockOnly = false; state.onSaleOnly = false;
    renderFilterPanel(); render();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeFilters(); });
  document.getElementById('shopSort')?.addEventListener('change', e => { state.sort = e.target.value; render(); });

  watchCollection('products', (products, err) => {
    const grid = document.getElementById('shopGrid');
    if (err) { if (grid) grid.innerHTML = '<div class="empty-state">Could not load products.</div>'; return; }
    allProducts = products;
    renderFilterPanel(); render();
  });

  initFirebase().then(({ db }) => {
    db.collection('combos').onSnapshot(snap => {
      allCombos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      Promise.all(allCombos.map(async c => {
        const docs = await Promise.all((c.productIds || []).map(pid => db.collection('products').doc(pid).get().catch(() => null)));
        c._items = docs.filter(d => d && d.exists).map(d => ({ id: d.id, ...d.data() }));
      })).then(() => { renderFilterPanel(); render(); });
      renderFilterPanel(); render();
    }, () => {});
  });
});
