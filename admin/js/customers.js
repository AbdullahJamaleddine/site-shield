let all = [];
async function load() {
  const { db } = await initFirebase();
  const snap = await db.collection('customers').get().catch(() => ({ docs: [] }));
  all = window.sortByCreatedDesc(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  document.getElementById('custCount').textContent = all.length;
  render();
}
function render() {
  const q = (document.getElementById('custSearch').value || '').toLowerCase().trim();
  const list = all.filter(c => !q || `${c.name || ''} ${c.email || ''} ${c.phone || ''}`.toLowerCase().includes(q));
  const tbody = document.getElementById('custTableBody');
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="7">No customers.</td></tr>'; return; }
  tbody.innerHTML = list.map(c => `
    <tr>
      <td>${c.name || '—'}</td>
      <td>${c.email || '—'}</td>
      <td>${c.phone || '—'}</td>
      <td>${[c.city, c.state].filter(Boolean).join(', ') || '—'}</td>
      <td>${c.orderCount || 0}</td>
      <td>${Cart.money(c.totalSpent || 0)}</td>
      <td>${c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-GB') : '—'}</td>
    </tr>`).join('');
}
document.getElementById('custSearch').addEventListener('input', render);
load();
