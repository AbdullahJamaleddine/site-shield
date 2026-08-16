let all = [];
async function load() {
  const { db } = await initFirebase();
  const snap = await db.collection('logs').orderBy('createdAt', 'desc').limit(1000).get().catch(() => ({ docs: [] }));
  all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const events = Array.from(new Set(all.map(l => l.event).filter(Boolean)));
  const sel = document.getElementById('lgEventFilter');
  sel.innerHTML = '<option value="">All events</option>' + events.map(e => `<option value="${e}">${e}</option>`).join('');
  sel.addEventListener('change', render);
  render();
}
function render() {
  const ev = document.getElementById('lgEventFilter').value;
  const list = all.filter(l => !ev || l.event === ev);
  document.getElementById('lgCount').textContent = list.length;
  const tbody = document.getElementById('lgTableBody');
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="5">No events.</td></tr>'; return; }
  tbody.innerHTML = list.map(l => `<tr>
    <td>${l.createdAt ? new Date(l.createdAt).toLocaleString('en-GB') : '—'}</td>
    <td><strong>${l.event || '—'}</strong></td>
    <td>${l.path || '—'}</td>
    <td style="max-width:280px; font-family:var(--font-mono); font-size:11px; color:var(--fg-muted);">${l.data ? JSON.stringify(l.data).slice(0, 200) : '—'}</td>
    <td style="font-size:11px; color:var(--fg-faint);">${l.referrer || '—'}</td>
  </tr>`).join('');
}
load();
