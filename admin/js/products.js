let allProducts = [];
let currentProductId = null;
let uploadedImages = [];
let sizeRows = [];
let colorRows = [];
let dbRef;

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function normalizeColors(p) {
  if (Array.isArray(p.colors)) return p.colors.map(c => typeof c === 'string' ? { name: c, hex: '#f2f2f0', available: true, image: '' } : { name: c.name || c.label || '', hex: c.hex || c.value || '#f2f2f0', available: c.available !== false, image: c.image || c.imageUrl || '' });
  if (p.colorOptions && typeof p.colorOptions === 'object') return Object.entries(p.colorOptions).map(([name, available]) => ({ name, hex: '#f2f2f0', available: available !== false, image: '' }));
  return [];
}

function normalizeSizeRows(p) {
  const map = p.sizeAvailability || p.availableSizes || {};
  return (p.sizes || []).map(name => ({ name, available: map[name] !== false }));
}

async function loadProducts() {
  // Data is kept live via watchCollection below; this just re-renders.
  renderTable();
}

function renderTable() {
  const q = (document.getElementById('productSearch')?.value || '').toLowerCase().trim();
  const list = allProducts.filter(p => !q || (`${p.name} ${p.category || ''}`).toLowerCase().includes(q));
  const tbody = document.getElementById('productsTableBody');
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="7">No products.</td></tr>'; return; }
  tbody.innerHTML = list.map(p => `
    <tr>
      <td>
        <div class="td-product">
          <img src="${p.images?.[0] || '/images/placeholder.svg'}" alt="${p.name}" />
          <div>${p.name}</div>
        </div>
      </td>
      <td>₦${Number(p.price || 0).toLocaleString()}</td>
      <td>${p.category || '—'}</td>
      <td>${p.stock ?? 0}</td>
      <td>${(p.sizes || []).length ? `${(p.sizes || []).length} sizes` : '—'}${normalizeColors(p).length ? `<br><span style="color:var(--fg-faint); font-size:11px;">${normalizeColors(p).length} colors</span>` : ''}</td>
      <td>${p.views || 0}</td>
      <td>
        <div class="td-actions">
          <button onclick="editProduct('${p.id}')">Edit</button>
          <button onclick="deleteProduct('${p.id}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderImagePreviews() {
  const wrap = document.getElementById('imagePreviews');
  wrap.innerHTML = uploadedImages.map((url, i) => `
    <div class="thumb"><img src="${url}" /><div class="rm" data-i="${i}">&times;</div></div>
  `).join('');
  wrap.querySelectorAll('.rm').forEach(el => el.addEventListener('click', () => {
    uploadedImages.splice(Number(el.dataset.i), 1); renderImagePreviews();
  }));
}

function renderSizeBuilder() {
  const wrap = document.getElementById('sizeBuilder');
  if (!wrap) return;
  wrap.innerHTML = sizeRows.map((row, i) => `
    <div class="variant-row">
      <input type="text" class="vSizeName" data-i="${i}" value="${escapeHtml(row.name)}" placeholder="M" />
      <button type="button" class="pill-toggle ${row.available !== false ? 'on' : ''}" data-size-toggle="${i}">${row.available !== false ? 'Available' : 'Unavailable'}</button>
      <button type="button" class="mini-btn danger" data-size-remove="${i}">Remove</button>
    </div>
  `).join('') || '<div class="manual-empty">No sizes added. Leave empty if size is not needed.</div>';
  wrap.querySelectorAll('.vSizeName').forEach(input => input.addEventListener('input', () => { sizeRows[+input.dataset.i].name = input.value; }));
  wrap.querySelectorAll('[data-size-toggle]').forEach(btn => btn.addEventListener('click', () => { const i = +btn.dataset.sizeToggle; sizeRows[i].available = sizeRows[i].available === false; renderSizeBuilder(); }));
  wrap.querySelectorAll('[data-size-remove]').forEach(btn => btn.addEventListener('click', () => { sizeRows.splice(+btn.dataset.sizeRemove, 1); renderSizeBuilder(); }));
}

function renderColorBuilder() {
  const wrap = document.getElementById('colorBuilder');
  if (!wrap) return;
  const imageOptions = ['<option value="">— None —</option>'].concat(
    uploadedImages.map((url, idx) => `<option value="${escapeHtml(url)}">Image ${idx + 1}</option>`)
  ).join('');
  wrap.innerHTML = colorRows.map((row, i) => `
    <div class="variant-row variant-row--color" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;">
      <input type="color" class="vColorHex" data-i="${i}" value="${escapeHtml(row.hex || '#f2f2f0')}" style="width:44px;height:36px;border:1px solid var(--border-strong);border-radius:6px;background:var(--bg);" />
      <input type="text" class="vColorName" data-i="${i}" value="${escapeHtml(row.name)}" placeholder="Grey" style="flex:1;min-width:100px;" />
      <select class="color-image-select vColorImage" data-i="${i}" title="Dedicated image for this color (optional)">
        ${imageOptions.replace(`value="${escapeHtml(row.image || '')}"`, `value="${escapeHtml(row.image || '')}" selected`)}
      </select>
      <button type="button" class="pill-toggle ${row.available !== false ? 'on' : ''}" data-color-toggle="${i}">${row.available !== false ? 'Available' : 'Unavailable'}</button>
      <button type="button" class="mini-btn danger" data-color-remove="${i}">Remove</button>
    </div>
  `).join('') || '<div class="manual-empty">No colors added. Leave empty if color is not needed.</div>';
  wrap.querySelectorAll('.vColorName').forEach(input => input.addEventListener('input', () => { colorRows[+input.dataset.i].name = input.value; }));
  wrap.querySelectorAll('.vColorHex').forEach(input => input.addEventListener('input', () => { colorRows[+input.dataset.i].hex = input.value; }));
  wrap.querySelectorAll('.vColorImage').forEach(sel => sel.addEventListener('change', () => { colorRows[+sel.dataset.i].image = sel.value; }));
  wrap.querySelectorAll('[data-color-toggle]').forEach(btn => btn.addEventListener('click', () => { const i = +btn.dataset.colorToggle; colorRows[i].available = colorRows[i].available === false; renderColorBuilder(); }));
  wrap.querySelectorAll('[data-color-remove]').forEach(btn => btn.addEventListener('click', () => { colorRows.splice(+btn.dataset.colorRemove, 1); renderColorBuilder(); }));
}

window.editProduct = (id) => {
  currentProductId = id;
  const p = allProducts.find(x => x.id === id);
  document.getElementById('productName').value = p.name || '';
  document.getElementById('productPrice').value = p.price || 0;
  document.getElementById('productStock').value = p.stock ?? 0;
  document.getElementById('productCostPrice').value = p.costPrice || '';
  document.getElementById('productOriginalPrice').value = p.originalPrice || '';
  document.getElementById('productCategory').value = p.category || '';
  document.getElementById('productDescription').value = p.description || '';
  sizeRows = normalizeSizeRows(p);
  colorRows = normalizeColors(p);
  uploadedImages = [...(p.images || [])];
  renderSizeBuilder();
  renderColorBuilder();
  renderImagePreviews();
  document.getElementById('formTitle').textContent = 'Edit product';
  document.getElementById('productFormPanel').classList.add('open');
};

window.deleteProduct = (id) => {
  confirmModal({
    title: 'Delete this product?',
    message: 'This permanently removes the product. This cannot be undone.',
    confirmText: 'Delete', danger: true,
    onConfirm: async () => {
      try { await dbRef.collection('products').doc(id).delete(); showToast('Product deleted'); }
      catch (err) { console.error(err); showToast('Could not delete product', 'error'); }
    }
  });
};

document.getElementById('productSearch').addEventListener('input', renderTable);
document.getElementById('addProductBtn').addEventListener('click', () => {
  currentProductId = null;
  document.getElementById('productForm').reset();
  uploadedImages = [];
  sizeRows = [];
  colorRows = [];
  renderSizeBuilder();
  renderColorBuilder();
  renderImagePreviews();
  document.getElementById('formTitle').textContent = 'Add product';
  document.getElementById('productFormPanel').classList.add('open');
});
document.getElementById('closeFormBtn').addEventListener('click', () => {
  document.getElementById('productFormPanel').classList.remove('open');
});

document.getElementById('addSizeBtn')?.addEventListener('click', () => { sizeRows.push({ name: '', available: true }); renderSizeBuilder(); });
document.getElementById('addColorBtn')?.addEventListener('click', () => { colorRows.push({ name: '', hex: '#f2f2f0', available: true }); renderColorBuilder(); });

document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('saveProductBtn');
  btn.disabled = true; btn.textContent = 'Saving…';

  const cleanSizes = sizeRows.map(s => ({ name: (s.name || '').trim(), available: s.available !== false })).filter(s => s.name);
  const cleanColors = colorRows.map(c => ({ name: (c.name || '').trim(), hex: c.hex || '#f2f2f0', available: c.available !== false, image: c.image || '' })).filter(c => c.name);
  const sizeAvailability = {};
  cleanSizes.forEach(s => { sizeAvailability[s.name] = s.available; });
  const productData = {
    name: document.getElementById('productName').value.trim(),
    price: Number(document.getElementById('productPrice').value),
    stock: Number(document.getElementById('productStock').value),
    costPrice: Number(document.getElementById('productCostPrice').value) || 0,
    originalPrice: Number(document.getElementById('productOriginalPrice').value) || 0,
    category: document.getElementById('productCategory').value.trim(),
    sizes: cleanSizes.map(s => s.name),
    sizeAvailability,
    colors: cleanColors,
    description: document.getElementById('productDescription').value.trim(),
    images: uploadedImages,
    updatedAt: new Date().toISOString(),
  };

  try {
    if (currentProductId) {
      await dbRef.collection('products').doc(currentProductId).update(productData);
    } else {
      productData.createdAt = new Date().toISOString();
      productData.views = 0;
      await dbRef.collection('products').add(productData);
    }
    document.getElementById('productFormPanel').classList.remove('open');
    await loadProducts();
    showToast('Product saved');
  } catch (err) {
    console.error(err); showToast('Could not save product', 'error');
  } finally { btn.disabled = false; btn.textContent = 'Save product'; }
});

async function uploadToCloudinary(file) {
  const cfgRes = await fetch('/api/config?type=cloudinary');
  const cfg = await cfgRes.json();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', cfg.uploadPreset);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`, { method: 'POST', body: formData });
  const data = await res.json();
  if (!data.secure_url) throw new Error('Upload failed');
  return data.secure_url;
}

const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault(); uploadZone.classList.remove('dragover');
  handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', () => handleFiles(fileInput.files));

async function handleFiles(files) {
  uploadZone.textContent = 'Uploading…';
  try {
    for (const file of files) { const url = await uploadToCloudinary(file); uploadedImages.push(url); }
    renderImagePreviews();
  } catch (err) { console.error(err); showToast('Image upload failed', 'error'); }
  finally { uploadZone.textContent = 'Click or drop images to upload'; fileInput.value = ''; }
}

(async () => {
  const { db } = await initFirebase();
  dbRef = db;
  watchCollection('products', (list) => { allProducts = list; renderTable(); });
})();
