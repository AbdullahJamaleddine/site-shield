let allCoupons = [];
let allProds = [];
let currentId = null;
let dbRef;

function render() {
  document.getElementById('cpCount').textContent = allCoupons.length;
  const tbody = document.getElementById('cpTableBody');
  if (!allCoupons.length) { tbody.innerHTML = '<tr><td colspan="8">No coupons yet.</td></tr>'; return; }
  tbody.innerHTML = allCoupons.map(c => {
    const uses = Array.isArray(c.usageLog) ? c.usageLog.length : (c.uses || 0);
    const type = c.type || (c.percent ? 'percent' : 'fixed');
    const val = type === 'percent' ? (c.value || c.percent || 0) + '%' : Cart.money(c.value || c.amount || 0);
    const scope = Array.isArray(c.productIds) && c.productIds.length ? `${c.productIds.length} product(s)` : 'All products';
    return `<tr>
      <td><strong>${c.code || '—'}</strong></td>
      <td>${type}</td>
      <td>${val}</td>
      <td>${scope}</td>
      <td>${uses}/${c.maxUses || '∞'}</td>
      <td>${c.expiryDate ? new Date(c.expiryDate).toLocaleDateString('en-GB') : '—'}</td>
      <td>${c.isActive === false ? '<span class="status-pill cancelled">off</span>' : '<span class="status-pill paid">on</span>'}</td>
      <td>
        <div class="td-actions">
          <button data-act="edit" data-id="${c.id}">Edit</button>
          <button data-act="del" data-id="${c.id}">Delete</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('button[data-act="edit"]').forEach(b => b.addEventListener('click', () => openForm(b.dataset.id)));
  tbody.querySelectorAll('button[data-act="del"]').forEach(b => b.addEventListener('click', () => {
    confirmModal({
      title: 'Delete coupon?', message: 'This cannot be undone.', danger: true, confirmText: 'Delete',
      onConfirm: async () => {
        try { await dbRef.collection('coupons').doc(b.dataset.id).delete(); showToast('Coupon deleted'); }
        catch { showToast('Could not delete', 'error'); }
      }
    });
  }));
}

function openForm(id) {
  currentId = id || null;
  const c = id ? allCoupons.find(x => x.id === id) : null;
  document.getElementById('cpFormTitle').textContent = id ? 'Edit coupon' : 'Add coupon';
  document.getElementById('fCode').value = c?.code || '';
  document.getElementById('fType').value = c?.type || 'fixed';
  document.getElementById('fValue').value = c?.value || c?.amount || c?.percent || 0;
  document.getElementById('fMax').value = c?.maxUses || '';
  document.getElementById('fMin').value = c?.minOrderAmount || 0;
  document.getElementById('fExpiry').value = c?.expiryDate ? c.expiryDate.slice(0, 10) : '';
  document.getElementById('fActive').checked = c?.isActive !== false;

  // product picker
  const scope = c && Array.isArray(c.productIds) && c.productIds.length ? 'some' : 'all';
  document.querySelector(`input[name="fScope"][value="${scope}"]`).checked = true;
  document.getElementById('fProdList').style.display = scope === 'some' ? '' : 'none';
  renderProdList(c?.productIds || []);

  document.getElementById('cpFormPanel').classList.add('open');
}

function renderProdList(selected) {
  const wrap = document.getElementById('fProdList');
  wrap.innerHTML = allProds.map(p => `
    <label>
      <input type="checkbox" value="${p.id}" ${selected.includes(p.id) ? 'checked' : ''} />
      <img src="${p.images?.[0] || '/images/placeholder.svg'}" alt="" />
      <span>${p.name}</span>
    </label>`).join('') || '<div class="manual-empty">No products.</div>';
}

document.getElementById('addCpBtn').addEventListener('click', () => openForm(null));
document.getElementById('closeCpBtn').addEventListener('click', () => document.getElementById('cpFormPanel').classList.remove('open'));

document.querySelectorAll('input[name="fScope"]').forEach(r => r.addEventListener('change', () => {
  document.getElementById('fProdList').style.display = document.querySelector('input[name="fScope"]:checked').value === 'some' ? '' : 'none';
}));

document.getElementById('cpForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = document.getElementById('fCode').value.trim().toUpperCase();
  if (!code) { showToast('Enter a code', 'error'); return; }
  const scope = document.querySelector('input[name="fScope"]:checked').value;
  const selectedIds = scope === 'some' ? Array.from(document.querySelectorAll('#fProdList input:checked')).map(i => i.value) : [];
  const data = {
    code,
    type: document.getElementById('fType').value,
    value: Number(document.getElementById('fValue').value) || 0,
    maxUses: Number(document.getElementById('fMax').value) || 0,
    minOrderAmount: Number(document.getElementById('fMin').value) || 0,
    expiryDate: document.getElementById('fExpiry').value ? new Date(document.getElementById('fExpiry').value).toISOString() : null,
    isActive: document.getElementById('fActive').checked,
    productIds: selectedIds,
    updatedAt: new Date().toISOString(),
  };
  try {
    if (currentId) {
      await dbRef.collection('coupons').doc(currentId).update(data);
    } else {
      data.createdAt = new Date().toISOString();
      data.usageLog = [];
      await dbRef.collection('coupons').add(data);
    }
    document.getElementById('cpFormPanel').classList.remove('open');
    showToast('Coupon saved');
  } catch (err) { console.error(err); showToast('Could not save coupon', 'error'); }
});

(async () => {
  const { db } = await initFirebase(); dbRef = db;
  watchCollection('coupons', (list) => { allCoupons = list; render(); });
  watchCollection('products', (list) => { allProds = list; });
})();
