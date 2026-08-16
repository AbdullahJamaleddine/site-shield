let allCombos = [];
let allProds = [];
let currentId = null;
let comboImage = '';
let dbRef;

function productStockValue(p) {
  return Number(p?.stock ?? p?.quantity ?? 0) || 0;
}

function comboAvailable(c) {
  const items = c._items || [];
  return c.active !== false && items.length > 0 && items.every(p => p && p.active !== false && productStockValue(p) > 0);
}

function render() {
  document.getElementById('cbCount').textContent = allCombos.length;
  const tbody = document.getElementById('cbTableBody');
  if (!allCombos.length) { tbody.innerHTML = '<tr><td colspan="6">No combos yet.</td></tr>'; return; }
  tbody.innerHTML = allCombos.map(c => `
    <tr>
      <td><div class="td-product">
        <img src="${c.image || '/images/placeholder.svg'}" alt="" />
        <div>${c.name || '—'}<br><span style="color:var(--fg-faint); font-size:11px; font-family:var(--font-mono);">${comboAvailable(c) ? 'Available' : 'Unavailable'}</span></div>
      </div></td>
      <td>${(c.productIds || []).length} item(s)</td>
      <td>${Cart.money(c.price || 0)}</td>
      <td>${c.active === false ? '<span class="status-pill cancelled">off</span>' : (comboAvailable(c) ? '<span class="status-pill paid">on</span>' : '<span class="status-pill cancelled">unavailable</span>')}</td>
      <td>${c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-GB') : '—'}</td>
      <td><div class="td-actions">
        <button data-act="edit" data-id="${c.id}">Edit</button>
        <button data-act="del" data-id="${c.id}">Delete</button>
      </div></td>
    </tr>`).join('');
  tbody.querySelectorAll('button[data-act="edit"]').forEach(b => b.addEventListener('click', () => openForm(b.dataset.id)));
  tbody.querySelectorAll('button[data-act="del"]').forEach(b => b.addEventListener('click', () => {
    confirmModal({
      title: 'Delete combo?', message: 'This cannot be undone.', danger: true, confirmText: 'Delete',
      onConfirm: async () => {
        try { await dbRef.collection('combos').doc(b.dataset.id).delete(); showToast('Combo deleted'); }
        catch { showToast('Could not delete', 'error'); }
      }
    });
  }));
}

function openForm(id) {
  currentId = id || null;
  const c = id ? allCombos.find(x => x.id === id) : null;
  document.getElementById('cbFormTitle').textContent = id ? 'Edit combo' : 'Add combo';
  document.getElementById('gName').value = c?.name || '';
  document.getElementById('gPrice').value = c?.price || 0;
  document.getElementById('gDesc').value = c?.description || '';
  document.getElementById('gActive').checked = c?.active !== false;
  comboImage = c?.image || '';
  renderThumb();
  renderProdList(c?.productIds || []);
  document.getElementById('cbFormPanel').classList.add('open');
}

function renderThumb() {
  const wrap = document.getElementById('gImagePrev');
  wrap.innerHTML = comboImage ? `<div class="thumb"><img src="${comboImage}" /><div class="rm">&times;</div></div>` : '';
  wrap.querySelector('.rm')?.addEventListener('click', () => { comboImage = ''; renderThumb(); });
}

function renderProdList(selected) {
  const wrap = document.getElementById('gProdList');
  wrap.innerHTML = allProds.map(p => `
    <label>
      <input type="checkbox" value="${p.id}" ${selected.includes(p.id) ? 'checked' : ''} />
      <img src="${p.images?.[0] || '/images/placeholder.svg'}" alt="" />
      <span>${p.name} — ${Cart.money(p.price || 0)}<small>${productStockValue(p) > 0 && p.active !== false ? `${productStockValue(p)} available` : 'Unavailable'}</small></span>
    </label>`).join('') || '<div class="manual-empty">Add products first.</div>';
}

document.getElementById('addCbBtn').addEventListener('click', () => openForm(null));
document.getElementById('closeCbBtn').addEventListener('click', () => document.getElementById('cbFormPanel').classList.remove('open'));

async function uploadToCloudinary(file) {
  const cfgRes = await fetch('/api/config?type=cloudinary');
  const cfg = await cfgRes.json();
  const fd = new FormData(); fd.append('file', file); fd.append('upload_preset', cfg.uploadPreset);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`, { method: 'POST', body: fd });
  const data = await res.json();
  if (!data.secure_url) throw new Error('Upload failed');
  return data.secure_url;
}

const upZone = document.getElementById('gUploadZone');
const upInput = document.getElementById('gFileInput');
upZone.addEventListener('click', () => upInput.click());
upInput.addEventListener('change', async () => {
  if (!upInput.files.length) return;
  upZone.textContent = 'Uploading…';
  try { comboImage = await uploadToCloudinary(upInput.files[0]); renderThumb(); }
  catch { showToast('Upload failed', 'error'); }
  finally { upZone.textContent = 'Click to upload combo image'; upInput.value = ''; }
});

document.getElementById('cbForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('gName').value.trim();
  const price = Number(document.getElementById('gPrice').value);
  const productIds = Array.from(document.querySelectorAll('#gProdList input:checked')).map(i => i.value);
  if (!name || !price) { showToast('Enter a name and price', 'error'); return; }
  if (!productIds.length) { showToast('Select at least one product', 'error'); return; }
  const data = {
    name, price,
    description: document.getElementById('gDesc').value.trim(),
    active: document.getElementById('gActive').checked,
    image: comboImage,
    productIds,
    updatedAt: new Date().toISOString(),
  };
  try {
    if (currentId) await dbRef.collection('combos').doc(currentId).update(data);
    else { data.createdAt = new Date().toISOString(); await dbRef.collection('combos').add(data); }
    document.getElementById('cbFormPanel').classList.remove('open');
    showToast('Combo saved');
  } catch (err) { console.error(err); showToast('Could not save', 'error'); }
});

(async () => {
  const { db } = await initFirebase(); dbRef = db;
  function hydrateCombos() {
    allCombos.forEach(c => { c._items = (c.productIds || []).map(id => allProds.find(p => p.id === id)).filter(Boolean); });
    render();
  }
  watchCollection('combos', (list) => { allCombos = list; hydrateCombos(); });
  watchCollection('products', (list) => { allProds = list; hydrateCombos(); if (document.getElementById('cbFormPanel').classList.contains('open')) renderProdList(Array.from(document.querySelectorAll('#gProdList input:checked')).map(i => i.value)); });
})();
