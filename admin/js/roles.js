/* Admin → Roles.
   Build a role (casting call / job) with a fully custom application form, and
   read the applications that come in. Collections: `roles`, `roleApplications`. */

let dbRef = null;
let roles = [];
let apps = [];
let editingId = null;
let fields = [];
let coverUrl = '';

const $ = (id) => document.getElementById(id);
const uid = () => 'f' + Math.random().toString(36).slice(2, 9);

const TYPE_LABELS = {
  text: 'Short text', textarea: 'Long text', email: 'Email', tel: 'Phone',
  number: 'Number', url: 'Link', date: 'Date', select: 'Dropdown',
  checkbox: 'Checkbox', images: 'Image upload', social: 'Social handle',
};

const MODEL_PRESET = [
  { type: 'text', label: 'Full name', required: true },
  { type: 'email', label: 'Email', required: true },
  { type: 'tel', label: 'Phone number', required: true },
  { type: 'text', label: 'Location / city', required: true },
  { type: 'number', label: 'Age' },
  { type: 'text', label: 'Height (cm)' },
  { type: 'text', label: 'Bust / chest (cm)' },
  { type: 'text', label: 'Waist (cm)' },
  { type: 'text', label: 'Hips (cm)' },
  { type: 'text', label: 'Shoe size' },
  { type: 'select', label: 'Experience', options: ['New face', '1–2 years', '3–5 years', '5+ years'] },
  { type: 'number', label: 'Rate per day (₦)' },
  { type: 'social', label: 'Instagram' },
  { type: 'social', label: 'TikTok' },
  { type: 'images', label: 'Portfolio photos (headshot + full body)', required: true, max: 8 },
  { type: 'textarea', label: 'Anything else we should know' },
];

const CREATIVE_PRESET = [
  { type: 'text', label: 'Full name', required: true },
  { type: 'email', label: 'Email', required: true },
  { type: 'tel', label: 'Phone number' },
  { type: 'text', label: 'Location / city' },
  { type: 'select', label: 'Discipline', options: ['Graphic design', 'Photography', 'Videography', 'Styling', 'Other'] },
  { type: 'url', label: 'Portfolio link' },
  { type: 'number', label: 'Rate per project (₦)' },
  { type: 'social', label: 'Instagram' },
  { type: 'social', label: 'Behance / Dribbble' },
  { type: 'images', label: 'Work samples', max: 6 },
  { type: 'textarea', label: 'Tell us about your work', required: true },
];

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// --------------------------------------------------------------- field editor
function renderFields() {
  const wrap = $('rlFields');
  if (!fields.length) {
    wrap.innerHTML = '<div class="manual-empty">No fields yet — add some below, or start from a preset.</div>';
    return;
  }
  wrap.innerHTML = fields.map((f, i) => `
    <div class="rl-field" data-i="${i}">
      <div class="rl-field__top">
        <span class="rl-field__type">${TYPE_LABELS[f.type] || f.type}</span>
        <span class="rl-field__spacer"></span>
        <button type="button" class="rl-field__btn" data-act="up" ${i === 0 ? 'disabled' : ''}>&uarr;</button>
        <button type="button" class="rl-field__btn" data-act="down" ${i === fields.length - 1 ? 'disabled' : ''}>&darr;</button>
        <button type="button" class="rl-field__btn" data-act="del">&times;</button>
      </div>
      <div class="field"><label>Label</label><input type="text" data-k="label" value="${esc(f.label || '')}" placeholder="What the applicant sees" /></div>
      <div class="field"><label>Help text (optional)</label><input type="text" data-k="hint" value="${esc(f.hint || '')}" /></div>
      ${f.type === 'select' ? `<div class="field"><label>Options (comma separated)</label><input type="text" data-k="options" value="${esc((f.options || []).join(', '))}" /></div>` : ''}
      ${f.type === 'images' ? `<div class="field"><label>Max images</label><input type="number" min="1" max="12" data-k="max" value="${Number(f.max) || 5}" /></div>` : ''}
      <label class="lk-check" style="display:flex;align-items:center;gap:8px;font-size:13px;">
        <input type="checkbox" data-k="required" ${f.required ? 'checked' : ''} /> Required
      </label>
    </div>`).join('');

  wrap.querySelectorAll('.rl-field').forEach(card => {
    const i = Number(card.dataset.i);
    card.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', () => {
      const act = btn.dataset.act;
      if (act === 'del') fields.splice(i, 1);
      if (act === 'up' && i > 0) fields.splice(i - 1, 0, fields.splice(i, 1)[0]);
      if (act === 'down' && i < fields.length - 1) fields.splice(i + 1, 0, fields.splice(i, 1)[0]);
      renderFields();
    }));
    card.querySelectorAll('[data-k]').forEach(input => {
      const k = input.dataset.k;
      input.addEventListener('input', () => {
        if (k === 'required') fields[i].required = input.checked;
        else if (k === 'options') fields[i].options = input.value.split(',').map(s => s.trim()).filter(Boolean);
        else if (k === 'max') fields[i].max = Math.min(12, Math.max(1, Number(input.value) || 5));
        else fields[i][k] = input.value;
      });
      input.addEventListener('change', () => { if (k === 'required') fields[i].required = input.checked; });
    });
  });
}

function addField(type) {
  fields.push({ id: uid(), type, label: '', required: false, ...(type === 'select' ? { options: [] } : {}), ...(type === 'images' ? { max: 5 } : {}) });
  renderFields();
}
function applyPreset(preset) {
  fields = preset.map(f => ({ id: uid(), required: false, ...f }));
  renderFields();
}

// ------------------------------------------------------------ cloudinary
async function uploadToCloudinary(file) {
  const cfg = await (await fetch('/api/config?type=cloudinary')).json();
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', cfg.uploadPreset);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`, { method: 'POST', body: fd });
  const data = await res.json();
  if (!data.secure_url) throw new Error('Upload failed');
  return data.secure_url;
}

// ------------------------------------------------------------------ panel
function openPanel(role) {
  editingId = role ? role.id : null;
  fields = role && Array.isArray(role.fields) ? role.fields.map(f => ({ ...f })) : [];
  coverUrl = (role && role.cover) || '';
  $('rlFormTitle').textContent = role ? 'Edit role' : 'New role';
  $('rlTitle').value = (role && role.title) || '';
  $('rlDesc').value = (role && role.description) || '';
  $('rlCategory').value = (role && role.category) || '';
  $('rlLocation').value = (role && role.location) || '';
  $('rlStatus').value = (role && role.status) || 'open';
  $('rlDeadline').value = (role && role.deadline) || '';
  renderCover();
  renderFields();
  $('roleFormPanel').classList.add('open');
}
function closePanel() { $('roleFormPanel').classList.remove('open'); }

function renderCover() {
  $('rlCoverPreview').innerHTML = coverUrl
    ? `<div style="position:relative;width:140px;"><img src="${cldOpt(coverUrl, 400)}" style="width:140px;border-radius:8px;" />
       <button type="button" class="rl-field__btn" id="rlCoverDel" style="position:absolute;top:6px;right:6px;background:#000;">&times;</button></div>`
    : '';
  const del = $('rlCoverDel');
  if (del) del.addEventListener('click', () => { coverUrl = ''; renderCover(); });
}

async function saveRole(e) {
  e.preventDefault();
  const title = $('rlTitle').value.trim();
  if (!title) { showToast('Give the role a title', 'error'); return; }
  const clean = fields
    .filter(f => (f.label || '').trim())
    .map((f, i) => ({ ...f, id: f.id || uid(), label: f.label.trim(), order: i }));
  if (!clean.length) { showToast('Add at least one form field', 'error'); return; }

  const payload = {
    title,
    description: $('rlDesc').value.trim(),
    category: $('rlCategory').value.trim(),
    location: $('rlLocation').value.trim(),
    status: $('rlStatus').value,
    deadline: $('rlDeadline').value || '',
    cover: coverUrl,
    fields: clean,
    updatedAt: new Date().toISOString(),
  };
  const btn = $('saveRoleBtn');
  btn.disabled = true;
  try {
    if (editingId) await dbRef.collection('roles').doc(editingId).set(payload, { merge: true });
    else await dbRef.collection('roles').add({ ...payload, createdAt: new Date().toISOString() });
    showToast('Role saved');
    closePanel();
  } catch (err) {
    console.error(err);
    showToast('Could not save the role', 'error');
  } finally {
    btn.disabled = false;
  }
}

// ------------------------------------------------------------------ tables
function renderRoles() {
  const body = $('roleBody');
  $('rlTotal').textContent = roles.length;
  $('rlOpen').textContent = roles.filter(r => r.status !== 'closed').length;
  if (!roles.length) { body.innerHTML = '<tr><td colspan="5">No roles yet — create one.</td></tr>'; return; }

  body.innerHTML = roles.map(r => {
    const count = apps.filter(a => a.roleId === r.id).length;
    return `<tr>
      <td><b>${esc(r.title)}</b><div style="font-size:12px;opacity:.6;">${esc(r.category || '')}${r.location ? ' · ' + esc(r.location) : ''}</div></td>
      <td>${(r.fields || []).length}</td>
      <td>${count}</td>
      <td><span class="pill ${r.status === 'closed' ? 'pill--off' : 'pill--on'}">${r.status === 'closed' ? 'Closed' : 'Open'}</span></td>
      <td>
        <button class="btn btn--sm" data-edit="${r.id}">Edit</button>
        <button class="btn btn--sm btn--danger" data-del="${r.id}">Delete</button>
      </td>
    </tr>`;
  }).join('');

  body.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () =>
    openPanel(roles.find(r => r.id === b.dataset.edit))));
  body.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => confirmModal({
    title: 'Delete this role?',
    message: 'Applications already received are kept.',
    confirmText: 'Delete', danger: true,
    onConfirm: async () => {
      try { await dbRef.collection('roles').doc(b.dataset.del).delete(); showToast('Role deleted'); }
      catch { showToast('Could not delete', 'error'); }
    },
  })));

  const filter = $('appFilter');
  const keep = filter.value;
  filter.innerHTML = '<option value="">All roles</option>' +
    roles.map(r => `<option value="${r.id}">${esc(r.title)}</option>`).join('');
  filter.value = keep;
}

function renderApps() {
  const list = $('appList');
  const filter = $('appFilter').value;
  const rows = apps.filter(a => !filter || a.roleId === filter);
  $('rlApps').textContent = apps.length;
  const week = Date.now() - 7 * 86400000;
  $('rlNew').textContent = apps.filter(a => docTime(a.createdAt) > week).length;

  if (!rows.length) { list.innerHTML = '<div class="manual-empty">No applications yet.</div>'; return; }

  list.innerHTML = rows.map(a => {
    const role = roles.find(r => r.id === a.roleId);
    const answers = a.answers || {};
    const imgs = [];
    const cells = (role ? role.fields : Object.keys(answers).map(k => ({ id: k, label: k, type: 'text' })))
      .map(f => {
        const v = answers[f.id];
        if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '';
        if (f.type === 'images' && Array.isArray(v)) { imgs.push(...v); return ''; }
        const shown = typeof v === 'boolean' ? (v ? 'Yes' : 'No') : Array.isArray(v) ? v.join(', ') : String(v);
        return `<div><span>${esc(f.label)}</span>${esc(shown)}</div>`;
      }).join('');
    return `<div class="app-card">
      <div class="app-card__head">
        <span class="app-card__name">${esc(a.applicantName || 'Applicant')}</span>
        <span class="app-card__meta">${esc(role ? role.title : 'Role removed')} · ${new Date(a.createdAt).toLocaleString()}</span>
        <span class="rl-field__spacer"></span>
        <button class="btn btn--sm btn--danger" data-delapp="${a.id}">Delete</button>
      </div>
      <div class="app-grid">${cells}</div>
      ${imgs.length ? `<div class="app-imgs">${imgs.map(u => `<a href="${u}" target="_blank" rel="noopener"><img src="${cldOpt(u, 300)}" alt="" /></a>`).join('')}</div>` : ''}
    </div>`;
  }).join('');

  list.querySelectorAll('[data-delapp]').forEach(b => b.addEventListener('click', () => confirmModal({
    title: 'Delete this application?', confirmText: 'Delete', danger: true,
    onConfirm: async () => {
      try { await dbRef.collection('roleApplications').doc(b.dataset.delapp).delete(); showToast('Deleted'); }
      catch { showToast('Could not delete', 'error'); }
    },
  })));
}

// -------------------------------------------------------------------- boot
document.addEventListener('DOMContentLoaded', async () => {
  $('newRoleBtn').addEventListener('click', () => openPanel(null));
  $('closeRoleForm').addEventListener('click', closePanel);
  $('roleForm').addEventListener('submit', saveRole);
  $('rlAddField').addEventListener('click', () => addField($('rlNewType').value));
  $('rlPresetModel').addEventListener('click', () => applyPreset(MODEL_PRESET));
  $('rlPresetCreative').addEventListener('click', () => applyPreset(CREATIVE_PRESET));
  $('appFilter').addEventListener('change', renderApps);

  const zone = $('rlCoverZone');
  const input = $('rlCoverInput');
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); handleCover(e.dataTransfer.files); });
  input.addEventListener('change', () => handleCover(input.files));
  async function handleCover(files) {
    if (!files || !files.length) return;
    zone.textContent = 'Uploading…';
    try { coverUrl = await uploadToCloudinary(files[0]); renderCover(); }
    catch { showToast('Upload failed', 'error'); }
    finally { zone.textContent = 'Click or drop an image'; input.value = ''; }
  }

  const { db } = await initFirebase();
  dbRef = db;
  watchCollection('roles', (list) => { roles = list; renderRoles(); renderApps(); });
  watchCollection('roleApplications', (list) => { apps = list; renderRoles(); renderApps(); });
});
