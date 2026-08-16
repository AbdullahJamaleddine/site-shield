/* Admin calendar — create, edit and delete brand events. Realtime via
   watchCollection so the table (and the storefront) update instantly. */

let dbRef = null;
let events = [];
let currentEventId = null;
let coverImage = '';

function startTs(e) {
  if (e.startAt) return new Date(e.startAt).getTime() || 0;
  if (e.date && e.time) return new Date(`${e.date}T${e.time}`).getTime() || 0;
  if (e.date) return new Date(e.date).getTime() || 0;
  return 0;
}
function endTs(e) {
  if (e.endAt) return new Date(e.endAt).getTime() || 0;
  const s = startTs(e);
  return s ? s + (Number(e.durationHours) || 2) * 3600000 : 0;
}
function fmt(ts) {
  return ts ? new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function renderPreview() {
  const el = document.getElementById('evPreview');
  el.innerHTML = coverImage
    ? `<div class="image-preview"><img src="${cldOpt(coverImage, 400)}" alt="" /><button type="button" id="evRemoveImg">&times;</button></div>`
    : '';
  document.getElementById('evRemoveImg')?.addEventListener('click', () => { coverImage = ''; renderPreview(); });
}

function dateBadge(ts) {
  if (!ts) return '<b>--</b><span>—</span>';
  const d = new Date(ts);
  return `<b>${String(d.getDate()).padStart(2, '0')}</b><span>${d.toLocaleDateString('en-GB', { month: 'short' })}</span>`;
}
function timeLabel(ts) {
  return ts ? new Date(ts).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
}

function card(e) {
  const ended = endTs(e) < Date.now();
  return `<article class="cal-admin-card ${ended ? 'is-past' : ''}">
    <div class="cal-admin-card__media">
      <img src="${cldOpt(e.imageUrl || '/images/placeholder.svg', 600)}" alt="" loading="lazy" />
      <div class="cal-admin-card__date">${dateBadge(startTs(e))}</div>
    </div>
    <div class="cal-admin-card__body">
      <div class="cal-admin-card__title">${esc(e.name || 'Untitled event')}</div>
      <div class="cal-admin-card__meta">
        <span class="status-pill ${ended ? 'status-pill--cancelled' : 'status-pill--paid'}">${ended ? 'Ended' : 'Upcoming'}</span>
        ${e.active === false ? '<span class="status-pill status-pill--pending">Hidden</span>' : ''}
        <span>${timeLabel(startTs(e))}</span>
      </div>
      ${e.location ? `<div class="cal-admin-card__meta">${esc(e.location)}</div>` : ''}
      ${e.description ? `<div class="cal-admin-card__desc">${esc(String(e.description).slice(0, 130))}${String(e.description).length > 130 ? '…' : ''}</div>` : ''}
      <div class="cal-admin-card__foot">
        <button class="btn btn--sm" onclick="editEvent('${e.id}')">Edit</button>
        <button class="btn btn--danger btn--sm" onclick="deleteEvent('${e.id}')">Delete</button>
      </div>
    </div>
  </article>`;
}

function render() {
  const upWrap = document.getElementById('eventsUpcoming');
  const pastWrap = document.getElementById('eventsPast');
  const upcoming = [...events].filter(e => endTs(e) >= Date.now()).sort((a, b) => startTs(a) - startTs(b));
  const past = [...events].filter(e => endTs(e) < Date.now()).sort((a, b) => startTs(b) - startTs(a));

  document.getElementById('evTotal').textContent = events.length;
  document.getElementById('evUpcoming').textContent = upcoming.length;
  document.getElementById('evPast').textContent = past.length;
  document.getElementById('evHidden').textContent = events.filter(e => e.active === false).length;

  upWrap.innerHTML = upcoming.length ? upcoming.map(card).join('') : '<div class="admin-empty">No upcoming events — add your first one.</div>';
  pastWrap.innerHTML = past.length ? past.map(card).join('') : '<div class="admin-empty">Nothing in the archive yet.</div>';
}

function resetForm() {
  currentEventId = null;
  coverImage = '';
  document.getElementById('eventForm').reset();
  document.getElementById('evDuration').value = 2;
  document.getElementById('evTime').value = '12:00';
  document.getElementById('evActive').value = 'true';
  document.getElementById('evFormTitle').textContent = 'Add event';
  renderPreview();
}

window.editEvent = (id) => {
  const e = events.find(x => x.id === id);
  if (!e) return;
  currentEventId = id;
  const ts = startTs(e);
  const d = ts ? new Date(ts) : new Date();
  document.getElementById('evName').value = e.name || '';
  document.getElementById('evDate').value = ts ? d.toISOString().slice(0, 10) : '';
  document.getElementById('evTime').value = ts ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '12:00';
  document.getElementById('evDuration').value = Number(e.durationHours) || 2;
  document.getElementById('evLocation').value = e.location || '';
  document.getElementById('evDescription').value = e.description || '';
  document.getElementById('evActive').value = e.active === false ? 'false' : 'true';
  coverImage = e.imageUrl || '';
  renderPreview();
  document.getElementById('evFormTitle').textContent = 'Edit event';
  document.getElementById('eventFormPanel').classList.add('open');
};

window.deleteEvent = (id) => {
  confirmModal({
    title: 'Delete this event?',
    message: 'It disappears from the storefront calendar immediately.',
    confirmText: 'Delete', danger: true,
    onConfirm: async () => {
      try { await dbRef.collection('events').doc(id).delete(); showToast('Event deleted'); }
      catch { showToast('Could not delete event', 'error'); }
    },
  });
};

async function uploadToCloudinary(file) {
  const cfgRes = await fetch('/api/config?type=cloudinary');
  const cfg = await cfgRes.json();
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', cfg.uploadPreset);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`, { method: 'POST', body: fd });
  const data = await res.json();
  if (!data.secure_url) throw new Error('Upload failed');
  return data.secure_url;
}

document.addEventListener('DOMContentLoaded', () => {
  const panel = document.getElementById('eventFormPanel');
  document.getElementById('newEventBtn').addEventListener('click', () => { resetForm(); panel.classList.add('open'); });
  document.getElementById('closeEventForm').addEventListener('click', () => panel.classList.remove('open'));

  const zone = document.getElementById('evUploadZone');
  const fi = document.getElementById('evFileInput');
  zone.addEventListener('click', () => fi.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); handleFile(e.dataTransfer.files?.[0]); });
  fi.addEventListener('change', () => handleFile(fi.files?.[0]));

  async function handleFile(file) {
    if (!file) return;
    zone.textContent = 'Uploading…';
    try { coverImage = await uploadToCloudinary(file); renderPreview(); showToast('Image uploaded'); }
    catch { showToast('Upload failed', 'error'); }
    finally { zone.textContent = 'Click or drop an image to upload'; fi.value = ''; }
  }

  document.getElementById('eventForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = document.getElementById('saveEventBtn');
    const date = document.getElementById('evDate').value;
    const time = document.getElementById('evTime').value || '12:00';
    const startAt = new Date(`${date}T${time}`);
    if (!date || isNaN(startAt.getTime())) return showToast('Pick a valid date and time', 'error');
    const durationHours = Number(document.getElementById('evDuration').value) || 2;

    const data = {
      name: document.getElementById('evName').value.trim(),
      date, time,
      startAt: startAt.toISOString(),
      endAt: new Date(startAt.getTime() + durationHours * 3600000).toISOString(),
      durationHours,
      location: document.getElementById('evLocation').value.trim(),
      description: document.getElementById('evDescription').value.trim(),
      imageUrl: coverImage,
      active: document.getElementById('evActive').value === 'true',
      updatedAt: new Date().toISOString(),
    };

    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      if (currentEventId) await dbRef.collection('events').doc(currentEventId).update(data);
      else await dbRef.collection('events').add({ ...data, createdAt: new Date().toISOString() });
      panel.classList.remove('open');
      resetForm();
      showToast('Event saved');
    } catch (err) { console.error(err); showToast('Could not save event', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Save event'; }
  });

  (async () => {
    const { db } = await initFirebase();
    dbRef = db;
    watchCollection('events', (list) => { events = list; render(); });
  })();
});
