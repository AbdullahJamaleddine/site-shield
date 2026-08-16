/* Admin FAQs — realtime create / edit / delete for the customer FAQ page. */

let dbRef = null;
let faqs = [];
let currentFaqId = null;

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function render() {
  const body = document.getElementById('faqBody');
  const sorted = [...faqs].sort((a, b) => (Number(a.order ?? 999) - Number(b.order ?? 999)) || String(a.question || '').localeCompare(String(b.question || '')));
  document.getElementById('fqTotal').textContent = faqs.length;
  document.getElementById('fqLive').textContent = faqs.filter(f => f.active !== false).length;
  document.getElementById('fqHidden').textContent = faqs.filter(f => f.active === false).length;

  if (!sorted.length) { body.innerHTML = '<tr><td colspan="5">No questions yet — add your first one.</td></tr>'; return; }
  body.innerHTML = sorted.map(f => `<tr>
    <td style="max-width:460px;white-space:normal;">
      <strong>${esc(f.question || 'Untitled')}</strong>
      <div style="color:var(--fg-muted);font-size:12px;margin-top:4px;">${esc(String(f.answer || '').slice(0, 110))}${String(f.answer || '').length > 110 ? '…' : ''}</div>
    </td>
    <td>${esc(f.category || 'General')}</td>
    <td>${Number(f.order ?? 0)}</td>
    <td><span class="status-pill ${f.active === false ? 'status-pill--pending' : 'status-pill--paid'}">${f.active === false ? 'Hidden' : 'Published'}</span></td>
    <td><div class="td-actions">
      <button class="btn btn--sm" data-edit="${f.id}">Edit</button>
      <button class="btn btn--sm" data-toggle="${f.id}">${f.active === false ? 'Publish' : 'Hide'}</button>
      <button class="btn btn--danger btn--sm" data-del="${f.id}">Delete</button>
    </div></td>
  </tr>`).join('');

  body.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => editFaq(b.dataset.edit)));
  body.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', async () => {
    const f = faqs.find(x => x.id === b.dataset.toggle);
    if (!f) return;
    b.disabled = true;
    try { await dbRef.collection('faqs').doc(f.id).update({ active: f.active === false, updatedAt: new Date().toISOString() }); }
    catch { showToast('Could not update', 'error'); b.disabled = false; }
  }));
  body.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    confirmModal({
      title: 'Delete this question?',
      message: 'It disappears from the customer FAQ page immediately.',
      confirmText: 'Delete', danger: true,
      onConfirm: async () => {
        try { await dbRef.collection('faqs').doc(b.dataset.del).delete(); showToast('Question deleted'); }
        catch { showToast('Could not delete', 'error'); }
      },
    });
  }));
}

function resetForm() {
  currentFaqId = null;
  document.getElementById('faqForm').reset();
  document.getElementById('fqCategory').value = 'General';
  document.getElementById('fqOrder').value = faqs.length;
  document.getElementById('fqActive').value = 'true';
  document.getElementById('fqFormTitle').textContent = 'Add question';
}

function editFaq(id) {
  const f = faqs.find(x => x.id === id);
  if (!f) return;
  currentFaqId = id;
  document.getElementById('fqQuestion').value = f.question || '';
  document.getElementById('fqAnswer').value = f.answer || '';
  document.getElementById('fqCategory').value = f.category || 'General';
  document.getElementById('fqOrder').value = Number(f.order ?? 0);
  document.getElementById('fqActive').value = f.active === false ? 'false' : 'true';
  document.getElementById('fqFormTitle').textContent = 'Edit question';
  document.getElementById('faqFormPanel').classList.add('open');
}

document.addEventListener('DOMContentLoaded', () => {
  const panel = document.getElementById('faqFormPanel');
  document.getElementById('newFaqBtn').addEventListener('click', () => { resetForm(); panel.classList.add('open'); });
  document.getElementById('closeFaqForm').addEventListener('click', () => panel.classList.remove('open'));

  document.getElementById('faqForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = document.getElementById('saveFaqBtn');
    const data = {
      question: document.getElementById('fqQuestion').value.trim(),
      answer: document.getElementById('fqAnswer').value.trim(),
      category: document.getElementById('fqCategory').value.trim() || 'General',
      order: Number(document.getElementById('fqOrder').value) || 0,
      active: document.getElementById('fqActive').value === 'true',
      updatedAt: new Date().toISOString(),
    };
    if (!data.question || !data.answer) return showToast('Question and answer are required', 'error');

    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      if (currentFaqId) await dbRef.collection('faqs').doc(currentFaqId).update(data);
      else await dbRef.collection('faqs').add({ ...data, createdAt: new Date().toISOString() });
      panel.classList.remove('open');
      resetForm();
      showToast('Question saved');
    } catch (err) { console.error(err); showToast('Could not save question', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Save question'; }
  });

  (async () => {
    const { db } = await initFirebase();
    dbRef = db;
    watchCollection('faqs', (list) => { faqs = list; render(); });
  })();
});
