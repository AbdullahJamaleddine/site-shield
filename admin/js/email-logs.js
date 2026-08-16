let all = [];
async function load() {
  const { db } = await initFirebase();
  const snap = await db.collection('emailLogs').orderBy('createdAt', 'desc').limit(500).get().catch(() => ({ docs: [] }));
  all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  render();
}
function render() {
  const status = document.getElementById('elStatusFilter').value;
  const list = all.filter(e => !status || e.status === status);
  document.getElementById('elCount').textContent = list.length;
  const tbody = document.getElementById('elTableBody');
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="6">No emails logged.</td></tr>'; return; }
  tbody.innerHTML = list.map(e => `<tr>
    <td>${e.createdAt ? new Date(e.createdAt).toLocaleString('en-GB') : '—'}</td>
    <td>${e.type || '—'}</td>
    <td>${e.to || '—'}</td>
    <td>${e.subject || '—'}</td>
    <td>${e.orderRef || '—'}</td>
    <td><span class="status-pill ${e.status === 'sent' ? 'paid' : 'cancelled'}">${e.status || 'unknown'}</span>${e.error ? `<br><small style="color:var(--fg-faint);">${e.error}</small>` : ''}</td>
  </tr>`).join('');
}
document.getElementById('elStatusFilter').addEventListener('change', render);
load();
