let all = [];
async function load() {
  const { db } = await initFirebase();
  const snap = await db.collection('newsletter').get().catch(() => ({ docs: [] }));
  all = window.sortByCreatedDesc(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  document.getElementById('nlCount').textContent = all.length;
  const tbody = document.getElementById('nlTableBody');
  if (!all.length) { tbody.innerHTML = '<tr><td colspan="3">No subscribers.</td></tr>'; return; }
  tbody.innerHTML = all.map(n => `<tr>
    <td>${n.email || '—'}</td>
    <td>${n.createdAt ? new Date(n.createdAt).toLocaleString('en-GB') : (n.subscribedAt ? new Date(n.subscribedAt).toLocaleString('en-GB') : '—')}</td>
    <td>${n.unsubscribed ? '<span class="status-pill cancelled">unsubscribed</span>' : '<span class="status-pill paid">active</span>'}</td>
  </tr>`).join('');
}
document.getElementById('exportNl').addEventListener('click', () => {
  const csv = 'email,subscribed_at,status\n' + all.map(n => `${n.email || ''},${n.createdAt || n.subscribedAt || ''},${n.unsubscribed ? 'unsubscribed' : 'active'}`).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'newsletter.csv'; a.click();
});
load();
