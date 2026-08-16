/* Public lookbook page — realtime list of images from Firestore `lookbook`. */
watchCollection('lookbook', (list) => {
  const grid = document.getElementById('lookbookPage');
  if (!grid) return;
  const rows = list.filter(x => x.imageUrl);
  if (!rows.length) { grid.innerHTML = `<div class="empty-state">No images yet — check back soon.</div>`; return; }
  grid.innerHTML = rows.map(x => `
    <div class="lookbook-page__img" data-full="${x.imageUrl}">
      <img src="${cldOpt(x.imageUrl, 800)}" alt="${(x.caption || '').replace(/"/g,'&quot;')}" loading="lazy" />
    </div>`).join('');
  grid.querySelectorAll('.lookbook-page__img').forEach(cell => {
    cell.addEventListener('click', () => {
      const url = cell.dataset.full;
      const lb = document.getElementById('lightbox');
      document.getElementById('lightboxImg').src = cldOpt(url, 1400);
      lb.classList.add('open');
    });
  });
});

document.getElementById('lightboxClose')?.addEventListener('click', () => document.getElementById('lightbox').classList.remove('open'));
document.getElementById('lightbox')?.addEventListener('click', (e) => { if (e.target.id === 'lightbox') e.currentTarget.classList.remove('open'); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.getElementById('lightbox')?.classList.remove('open'); });
