let dbRef;
let items = [];

function render() {
  const grid = document.getElementById('lbGrid');
  document.getElementById('lbCount').textContent = items.length;
  if (!items.length) { grid.innerHTML = '<div class="manual-empty" style="grid-column:1/-1;">No images yet — upload above.</div>'; return; }
  grid.innerHTML = items.map(x => `
    <div class="lb-item">
      <img src="${cldOpt(x.imageUrl, 500)}" alt="" loading="lazy" />
      <button class="lb-del" data-id="${x.id}" title="Delete">&times;</button>
    </div>
  `).join('');
  grid.querySelectorAll('.lb-del').forEach(b => b.addEventListener('click', () => {
    confirmModal({
      title: 'Delete image?', danger: true, confirmText: 'Delete',
      onConfirm: async () => {
        try { await dbRef.collection('lookbook').doc(b.dataset.id).delete(); showToast('Deleted'); }
        catch { showToast('Could not delete', 'error'); }
      }
    });
  }));
}

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
  const zone = document.getElementById('lbUploadZone');
  const fi = document.getElementById('lbFileInput');
  zone.addEventListener('click', () => fi.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', async e => {
    e.preventDefault(); zone.classList.remove('dragover');
    await handleFiles(e.dataTransfer.files);
  });
  fi.addEventListener('change', () => handleFiles(fi.files));

  async function handleFiles(files) {
    if (!files || !files.length) return;
    zone.textContent = 'Uploading…';
    try {
      for (const f of files) {
        const url = await uploadToCloudinary(f);
        await dbRef.collection('lookbook').add({ imageUrl: url, createdAt: new Date().toISOString() });
      }
      showToast('Uploaded');
    } catch (e) { console.error(e); showToast('Upload failed', 'error'); }
    finally { zone.textContent = 'Click or drop images to upload'; fi.value = ''; }
  }

  (async () => {
    const { db } = await initFirebase(); dbRef = db;
    watchCollection('lookbook', (list) => { items = list; render(); });
  })();
});
