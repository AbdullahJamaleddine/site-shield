let allReviews = [];
let allLinks = [];
let allProds = [];
let dbRef;

function stars(n) { n = Number(n || 0); return '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n)); }

function render() {
  const tbody = document.getElementById('rvTableBody');
  document.getElementById('rvCount').textContent = allReviews.length;
  const overallAvg = allReviews.length ? (allReviews.reduce((s, r) => s + Number(r.overallRating || r.rating || 0), 0) / allReviews.length).toFixed(1) : '0';
  document.getElementById('rvAvg').textContent = overallAvg;
  const productMap = {};
  allProds.forEach(p => productMap[p.id] = p.name);
  if (!allReviews.length) { tbody.innerHTML = '<tr><td colspan="7">No reviews yet.</td></tr>'; }
  else {
    tbody.innerHTML = allReviews.map(r => {
      const overall = Number(r.overallRating || r.rating || 0);
      const pq = Number(r.productRating || 0);
      const dl = Number(r.deliveryRating || 0);
      return `<tr>
        <td>${r.productId ? (productMap[r.productId] || r.productId) : '<span style="color:var(--fg-faint);">General</span>'}</td>
        <td>
          <div style="color:#f5c518;">${stars(overall)}</div>
          <div style="font-family:var(--font-mono);font-size:10px;color:var(--fg-muted);margin-top:3px;">
            ${pq ? `PROD ${pq}★ · ` : ''}${dl ? `DEL ${dl}★ · ` : ''}OVERALL ${overall}★
          </div>
        </td>
        <td style="max-width:420px;white-space:normal;">${(r.text || r.review || '').replace(/</g, '&lt;')}</td>
        <td>${(r.author || r.name || '—').replace(/</g, '&lt;')}</td>
        <td>${r.createdAt ? new Date(docTime(r.createdAt)).toLocaleDateString('en-GB') : '—'}</td>
        <td>
          <button class="pill-toggle ${r.featured ? 'on' : ''}" data-feat="${r.id}" data-on="${r.featured ? '1' : '0'}">
            ${r.featured ? 'On homepage' : 'Show on homepage'}
          </button>
        </td>
        <td><div class="td-actions"><button class="btn btn--danger btn--sm" data-del="${r.id}">Delete</button></div></td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('button[data-feat]').forEach(b => b.addEventListener('click', async () => {
      const next = b.dataset.on !== '1';
      b.disabled = true;
      try { await dbRef.collection('reviews').doc(b.dataset.feat).update({ featured: next }); showToast(next ? 'Added to homepage' : 'Removed from homepage'); }
      catch { showToast('Could not update', 'error'); b.disabled = false; }
    }));
    tbody.querySelectorAll('button[data-del]').forEach(b => b.addEventListener('click', () => {
      confirmModal({
        title: 'Delete review?', danger: true, confirmText: 'Delete',
        onConfirm: async () => {
          try { await dbRef.collection('reviews').doc(b.dataset.del).delete(); showToast('Deleted'); }
          catch { showToast('Could not delete', 'error'); }
        }
      });
    }));
  }

  const linksBody = document.getElementById('linksTableBody');
  document.getElementById('rlCount').textContent = allLinks.length;
  if (!allLinks.length) { linksBody.innerHTML = '<tr><td colspan="5">No links yet.</td></tr>'; return; }
  linksBody.innerHTML = allLinks.map(l => {
    const url = `${location.origin}/review?t=${l.token}`;
    return `<tr>
      <td>${l.customerName || '—'}</td>
      <td>${l.orderRef || '—'}</td>
      <td>${l.usedAt ? '<span class="status-pill delivered">used</span>' : '<span class="status-pill paid">open</span>'}</td>
      <td>${l.createdAt ? new Date(docTime(l.createdAt)).toLocaleDateString('en-GB') : '—'}</td>
      <td><div class="td-actions">
        <button class="link-copy-btn" data-copy="${url}">Copy link</button>
        <button data-del-link="${l.id}">Delete</button>
      </div></td>
    </tr>`;
  }).join('');
  linksBody.querySelectorAll('button[data-copy]').forEach(b => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); showToast('Link copied'); }
    catch { showToast('Copy failed', 'error'); }
  }));
  linksBody.querySelectorAll('button[data-del-link]').forEach(b => b.addEventListener('click', () => {
    confirmModal({
      title: 'Delete this link?', danger: true, confirmText: 'Delete',
      onConfirm: async () => { try { await dbRef.collection('reviewLinks').doc(b.dataset.delLink).delete(); showToast('Deleted'); } catch { showToast('Could not delete', 'error'); } }
    });
  }));
}

function genToken() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

document.getElementById('genLinkBtn').addEventListener('click', async () => {
  const name = document.getElementById('genName').value.trim();
  const orderRef = document.getElementById('genOrder').value.trim();
  const token = genToken();
  try {
    await dbRef.collection('reviewLinks').add({
      token,
      customerName: name || null,
      orderRef: orderRef || null,
      usedAt: null,
      createdAt: new Date().toISOString(),
    });
    const url = `${location.origin}/review?t=${token}`;
    try { await navigator.clipboard.writeText(url); } catch {}
    showToast('Link generated and copied');
    document.getElementById('genName').value = '';
    document.getElementById('genOrder').value = '';
  } catch { showToast('Could not generate link', 'error'); }
});

(async () => {
  const { db } = await initFirebase(); dbRef = db;
  watchCollection('reviews', (list) => { allReviews = list; render(); });
  watchCollection('reviewLinks', (list) => { allLinks = list; render(); });
  watchCollection('products', (list) => { allProds = list; render(); });
})();
