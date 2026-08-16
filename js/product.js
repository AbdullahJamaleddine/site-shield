let product = null;
let selectedSize = null;
let selectedColor = null;
let qty = 1;
let activeImg = 0;
let viewBumped = false;
let isCombo = false;

function isAvailableFlag(v) { return v !== false && v !== 'false' && v !== 'unavailable' && v !== 'out'; }
function productStockValue(p) { return Number(p?.stock ?? p?.quantity ?? 0) || 0; }
function sizeAvailable(size) {
  const map = product.sizeAvailability || product.availableSizes || {};
  return isAvailableFlag(map[size]);
}
function normalizeColors(p) {
  if (Array.isArray(p.colors)) {
    return p.colors.map((c) => typeof c === 'string'
      ? { name: c, hex: '#cccccc', available: true, image: '' }
      : { name: c.name || c.label || c.hex || 'Color', hex: c.hex || c.value || '#cccccc', available: isAvailableFlag(c.available), image: c.image || c.imageUrl || '' });
  }
  if (p.colorOptions && typeof p.colorOptions === 'object') {
    return Object.entries(p.colorOptions).map(([name, val]) => ({ name, hex: '#cccccc', available: isAvailableFlag(val), image: '' }));
  }
  return [];
}
function comboAvailability(c) {
  if (!isCombo) return { out: false, stock: productStockValue(c) };
  const items = c._items || [];
  if (!items.length) return { out: true, stock: 0 };
  const missing = items.filter(p => productStockValue(p) <= 0 || p.active === false);
  if (missing.length) return { out: true, stock: 0, missing };
  return { out: false, stock: Math.min(...items.map(productStockValue)) };
}
function getGalleryImages() {
  return product.images?.length ? product.images.slice() : (product.image ? [product.image] : ['/images/placeholder.svg']);
}

function render() {
  const view = document.getElementById('productView');
  if (!view || !product) return;
  const baseImages = getGalleryImages();
  const colors = normalizeColors(product);
  const colorObj = colors.find(c => c.name === selectedColor);
  let images = baseImages.slice();
  if (colorObj?.image) {
    const idx = images.indexOf(colorObj.image);
    if (idx >= 0) images.splice(idx, 1);
    images.unshift(colorObj.image);
  }
  if (!images.length) images = ['/images/placeholder.svg'];
  activeImg = Math.max(0, Math.min(activeImg, images.length - 1));

  const comboState = comboAvailability(product);
  const stock = isCombo ? comboState.stock : productStockValue(product);
  const availableSizes = (product.sizes || []).filter(sizeAvailable);
  const availableColors = colors.filter(c => c.available !== false);
  const needsSize = !isCombo && !!product.sizes?.length;
  const needsColor = !isCombo && !!colors.length;
  const out = isCombo ? comboState.out : (stock <= 0 || (needsSize && !availableSizes.length) || (needsColor && !availableColors.length));
  // Always show the exact stock count; tone shifts when it's low or gone.
  const lowStock = !out && stock > 0 && stock <= 5;
  const stockStatus = out
    ? 'Sold out'
    : `${stock} left${isCombo ? ' \u00b7 limited by lowest-stock item' : ''}`;
  const stockTone = out ? 'is-out' : lowStock ? 'is-low' : 'is-ok';

  const price = Number(product.price || 0);
  const original = Number(product.originalPrice || 0);
  const hasSale = original > price && price > 0;
  const priceHtml = hasSale
    ? `<small>${Cart.money(original)}</small><span class="sale">${Cart.money(price)}</span>`
    : `${Cart.money(price)}`;

  view.innerHTML = `
    <div class="product-gallery">
      <div class="product-gallery__main"><img id="mainImg" src="${cldOpt(images[activeImg] || '/images/placeholder.svg', 900)}" alt="${product.name}" /></div>
      ${images.length > 1 ? `<div class="product-gallery__thumbs">
        ${images.map((img, i) => `<img data-i="${i}" class="${i === activeImg ? 'active' : ''}" src="${cldOpt(img, 200)}" alt="" />`).join('')}
      </div>` : ''}
    </div>
    <div class="product-info">
      <div class="product-info__cat">${isCombo ? 'Combo' : (product.category || 'Drips & Drops')}</div>
      <h1>${product.name}</h1>
      <div class="product-info__price">${priceHtml}</div>
      ${stockStatus ? `<div class="product-info__stock ${stockTone}">${stockStatus}</div>` : ''}
      ${product.description ? `<p class="product-info__desc">${product.description}</p>` : ''}

      ${(!isCombo && product.sizes?.length) ? `
        <div class="product-section">
          <span class="product-section__label">Size ${selectedSize ? `<span>· ${selectedSize}</span>` : ''}</span>
          <div class="product-sizes" id="sizeSelector">
            ${product.sizes.map(s => `<button type="button" class="product-size-btn ${!sizeAvailable(s) ? 'is-unavailable' : ''}" data-size="${s}" ${!sizeAvailable(s) ? 'disabled' : ''}>${s}</button>`).join('')}
          </div>
        </div>` : ''}

      ${(!isCombo && colors.length) ? `
        <div class="product-section">
          <span class="product-section__label">Color ${selectedColor ? `<span>· ${selectedColor}</span>` : ''}</span>
          <div class="product-color-swatches" id="colorSelector">
            ${colors.map(c => `<button type="button" class="color-swatch ${c.available === false ? 'is-unavailable' : ''}" data-color="${c.name}" data-hex="${c.hex}" aria-label="${c.name}" ${c.available === false ? 'disabled' : ''}>
              <span class="color-swatch__dot" style="background:${c.hex}"></span>
              <span class="color-swatch__label">${c.name}</span>
            </button>`).join('')}
          </div>
        </div>` : ''}

      ${isCombo && product.productIds?.length ? `
        <div class="product-section">
          <span class="product-section__label">This combo includes</span>
          <ul class="combo-includes">
            ${(product._items || []).map(p => {
              const n = productStockValue(p);
              const ok = n > 0 && p.active !== false;
              return `<li class="${ok ? '' : 'unavailable'}">${p.name}<span class="stock-n">${ok ? n + ' left' : 'Sold out'}</span></li>`;
            }).join('')}
          </ul>
        </div>` : ''}

      <div class="product-actions">
        <div class="product-qty">
          <button id="qtyMinus" type="button" aria-label="Decrease">−</button>
          <span id="qtyVal">1</span>
          <button id="qtyPlus" type="button" aria-label="Increase">+</button>
        </div>
      </div>

      <div class="product-info__actions">
        <button class="btn btn--solid" id="addToCartBtn" ${out ? 'disabled' : ''}>${out ? 'Sold out' : 'Add to cart'}</button>
        <button class="btn" id="copyLinkBtn" type="button">Copy link</button>
      </div>
    </div>`;

  view.querySelectorAll('.product-gallery__thumbs img').forEach(img => {
    img.addEventListener('click', () => { activeImg = Number(img.dataset.i); render(); });
  });

  const sizeSelector = document.getElementById('sizeSelector');
  if (sizeSelector) {
    if (!selectedSize || !availableSizes.includes(selectedSize)) selectedSize = availableSizes[0] || null;
    sizeSelector.querySelectorAll('.product-size-btn').forEach(btn => {
      if (btn.dataset.size === selectedSize) btn.classList.add('active');
      if (btn.disabled) return;
      btn.addEventListener('click', () => { selectedSize = btn.dataset.size; render(); });
    });
  }
  const colorSelector = document.getElementById('colorSelector');
  if (colorSelector) {
    if (!selectedColor || !availableColors.some(c => c.name === selectedColor)) selectedColor = availableColors[0]?.name || null;
    colorSelector.querySelectorAll('.color-swatch').forEach(btn => {
      if (btn.dataset.color === selectedColor) btn.classList.add('active');
      if (btn.disabled) return;
      btn.addEventListener('click', () => { selectedColor = btn.dataset.color; activeImg = 0; render(); });
    });
  }

  // How many units of this product are already sitting in the bag?
  const cartKey = (isCombo ? 'combo:' : '') + product.id;
  const inBag = (Cart.get().items || [])
    .filter(i => String(i.id) === cartKey)
    .reduce((sum, i) => sum + (Number(i.qty) || 0), 0);
  const maxAddable = Math.max(0, stock - inBag);

  qty = Math.max(1, Math.min(qty, maxAddable || 1));
  const qtyVal = document.getElementById('qtyVal');
  qtyVal.textContent = qty;
  document.getElementById('qtyMinus').addEventListener('click', () => {
    qty = Math.max(1, qty - 1); qtyVal.textContent = qty;
  });
  document.getElementById('qtyPlus').addEventListener('click', () => {
    if (qty >= maxAddable) {
      showToast(inBag ? `You already have ${inBag} in your bag — only ${stock} in stock` : `Only ${stock} in stock`, 'error');
      return;
    }
    qty = qty + 1; qtyVal.textContent = qty;
  });

  const addBtn = document.getElementById('addToCartBtn');
  if (addBtn && !out && maxAddable <= 0) {
    addBtn.disabled = true;
    addBtn.textContent = `All ${stock} in stock are in your bag`;
  }
  if (addBtn && !out && maxAddable > 0) {
    addBtn.addEventListener('click', () => {
      if (qty > maxAddable) {
        showToast(`Only ${stock} in stock`, 'error');
        return;
      }
      const cObj = normalizeColors(product).find(c => c.name === selectedColor);
      const cartItem = {
        id: (isCombo ? 'combo:' : '') + product.id,
        name: product.name,
        price: product.price,
        images: images,
      };
      Cart.add(cartItem, isCombo ? { comboItems: (product._items || []).map(p => ({ id: p.id, name: p.name, qty: 1 })) } : {
        size: selectedSize, color: selectedColor, colorHex: cObj?.hex || null,
      }, qty);
      showToast(`Added ${product.name} to bag`);
      if (window.openCartDrawer) openCartDrawer();
    });
  }

  document.getElementById('copyLinkBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); showToast('Link copied'); }
    catch { showToast('Could not copy', 'error'); }
  });
}

(async () => {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const comboId = params.get('combo');
  const view = document.getElementById('productView');
  if (!id && !comboId) { view.innerHTML = '<div class="empty-state">Product not found.</div>'; return; }

  if (comboId) {
    isCombo = true;
    const { db } = await initFirebase();
    let comboMembers = [];
    // Realtime: the combo doc and every product inside it stay live.
    watchDoc('combos', comboId, (data, err) => {
      if (err) { view.innerHTML = '<div class="empty-state">Could not load combo.</div>'; return; }
      if (!data) { view.innerHTML = '<div class="empty-state">Combo not found.</div>'; return; }
      product = { ...data };
      product._items = (product.productIds || []).map(pid => comboMembers.find(p => p.id === pid)).filter(Boolean);
      render();
    });
    watchCollection('products', (list) => {
      comboMembers = list;
      if (product && product.productIds) {
        product._items = (product.productIds || []).map(pid => list.find(p => p.id === pid)).filter(Boolean);
        render();
      }
    });
    return;
  }


  watchDoc('products', id, (data, err) => {
    if (err) { view.innerHTML = '<div class="empty-state">Could not load this product.</div>'; return; }
    if (!data) { view.innerHTML = '<div class="empty-state">Product not found.</div>'; return; }
    product = data;
    render();
    if (!viewBumped) {
      viewBumped = true;
      initFirebase().then(({ db }) =>
        db.collection('products').doc(id).update({ views: (product.views || 0) + 1 }).catch(() => {})
      );
    }
  });
})();

// Keep the quantity ceiling honest when the bag changes in another tab or drawer.
window.addEventListener('cart:changed', () => { if (product) render(); });
