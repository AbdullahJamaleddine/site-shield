let allProds = [];
let allCombos = [];
let selected = new Set();
let dbRef;

function updateCount() {
  document.getElementById('ftCount').textContent = selected.size;
}

function render() {
  const wrap = document.getElementById('ftList');
  const items = [
    ...allProds.map(p => ({ type: 'product', key: p.id, name: p.name, price: p.price, image: p.images?.[0] || '/images/placeholder.svg' })),
    ...allCombos.filter(c => c.active !== false).map(c => ({ type: 'combo', key: `combo:${c.id}`, name: c.name, price: c.price, image: c.image || c.images?.[0] || '/images/placeholder.svg' })),
  ];
  if (!items.length) { wrap.innerHTML = '<div class="manual-empty">No products or combos yet.</div>'; return; }
  wrap.innerHTML = items.map(p => `
    <label>
      <input type="checkbox" value="${p.key}" ${selected.has(p.key) ? 'checked' : ''} />
      <img src="${p.image}" alt="" />
      <span>${p.name} — ${Cart.money(p.price || 0)}<small>${p.type}</small></span>
    </label>`).join('');
  wrap.querySelectorAll('input').forEach(i => i.addEventListener('change', () => {
    if (i.checked) selected.add(i.value); else selected.delete(i.value);
    updateCount();
  }));
  updateCount();
}

document.getElementById('saveFtBtn').addEventListener('click', async () => {
  const btn = document.getElementById('saveFtBtn');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await dbRef.collection('featured').doc('list').set({
      productIds: Array.from(selected),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    showToast('Featured list saved');
  } catch (err) { console.error(err); showToast('Could not save', 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Save changes'; }
});

(async () => {
  const { db } = await initFirebase(); dbRef = db;
  const doc = await db.collection('featured').doc('list').get().catch(() => null);
  if (doc && doc.exists && Array.isArray(doc.data().productIds)) selected = new Set(doc.data().productIds);
  watchCollection('products', (list) => { allProds = list; render(); });
  watchCollection('combos', (list) => { allCombos = list; render(); });
})();
