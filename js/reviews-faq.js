/* Customer reviews + FAQ page. Both collections stream live from Firestore. */

let reviews = [];
let faqs = [];
let rvFilter = 'all';
let faqCat = 'all';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const overallOf = (r) => Number(r.overallRating || r.rating || 0);
const stars = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(Math.max(0, 5 - Math.round(n)));
const bodyOf = (r) => r.text || r.review || r.comment || '';

// ---------- Reviews ----------
function renderSummary() {
  const rated = reviews.filter(r => overallOf(r) > 0);
  const avg = rated.length ? rated.reduce((s, r) => s + overallOf(r), 0) / rated.length : 0;
  document.getElementById('rvAvg').textContent = rated.length ? avg.toFixed(1) : '—';
  document.getElementById('rvAvgStars').textContent = stars(avg);
  document.getElementById('rvCount').textContent = reviews.length
    ? `${reviews.length} ${reviews.length === 1 ? 'review' : 'reviews'}`
    : 'No reviews yet';

  document.getElementById('rvBars').innerHTML = [5, 4, 3, 2, 1].map(n => {
    const c = rated.filter(r => Math.round(overallOf(r)) === n).length;
    const pct = rated.length ? (c / rated.length) * 100 : 0;
    return `<div class="rf-bar">
      <span>${n} star</span>
      <span class="rf-bar__track"><span class="rf-bar__fill" style="width:${pct}%"></span></span>
      <span>${c}</span>
    </div>`;
  }).join('');
}

function renderFilters() {
  const counts = { all: reviews.length };
  [5, 4, 3, 2, 1].forEach(n => { counts[n] = reviews.filter(r => Math.round(overallOf(r)) === n).length; });
  const opts = [{ k: 'all', l: 'All reviews' }, ...[5, 4, 3, 2, 1].filter(n => counts[n]).map(n => ({ k: String(n), l: `${n} star` }))];
  const bar = document.getElementById('rvFilters');
  bar.innerHTML = opts.map(o => `<button class="price-chip ${rvFilter === o.k ? 'active' : ''}" data-rv="${o.k}">${o.l} (${counts[o.k]})</button>`).join('');
  bar.querySelectorAll('[data-rv]').forEach(b => b.addEventListener('click', () => { rvFilter = b.dataset.rv; renderFilters(); renderReviews(); }));
}

function renderReviews() {
  const grid = document.getElementById('rvGrid');
  let rows = [...reviews];
  if (rvFilter !== 'all') rows = rows.filter(r => Math.round(overallOf(r)) === Number(rvFilter));
  rows.sort((a, b) => (docTime(b.createdAt) || 0) - (docTime(a.createdAt) || 0));

  if (!rows.length) { grid.innerHTML = '<div class="empty-state">No reviews to show here yet.</div>'; return; }

  grid.innerHTML = rows.map(r => {
    const pq = Number(r.productRating || 0);
    const dl = Number(r.deliveryRating || 0);
    const when = r.createdAt ? new Date(docTime(r.createdAt)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    return `<article class="rf-review">
      <div class="rf-review__top">
        <span class="rf-review__stars" aria-label="${overallOf(r)} out of 5">${stars(overallOf(r))}</span>
        <span class="rf-review__date">${when}</span>
      </div>
      ${bodyOf(r) ? `<p class="rf-review__text">${esc(bodyOf(r))}</p>` : ''}
      ${(pq || dl) ? `<div class="rf-review__sub">
        ${pq ? `<span class="rf-chip">Quality ${pq}/5</span>` : ''}
        ${dl ? `<span class="rf-chip">Delivery ${dl}/5</span>` : ''}
      </div>` : ''}
      <div class="rf-review__author">
        ${esc(r.author || r.name || 'Verified customer')}
        <small>${r.productName ? esc(r.productName) : 'Verified order'}</small>
      </div>
    </article>`;
  }).join('');
}

// ---------- FAQs ----------
function renderFaqCats() {
  const cats = Array.from(new Set(faqs.map(f => (f.category || 'General').trim()).filter(Boolean)));
  const bar = document.getElementById('faqCats');
  if (cats.length < 2) { bar.innerHTML = ''; return; }
  const opts = ['all', ...cats];
  bar.innerHTML = opts.map(c => `<button class="price-chip ${faqCat === c ? 'active' : ''}" data-fc="${esc(c)}">${c === 'all' ? 'All questions' : esc(c)}</button>`).join('');
  bar.querySelectorAll('[data-fc]').forEach(b => b.addEventListener('click', () => { faqCat = b.dataset.fc; renderFaqCats(); renderFaqs(); }));
}

function renderFaqs() {
  const list = document.getElementById('faqList');
  let rows = faqs.filter(f => f.active !== false);
  if (faqCat !== 'all') rows = rows.filter(f => (f.category || 'General').trim() === faqCat);
  rows.sort((a, b) => (Number(a.order ?? 999) - Number(b.order ?? 999)) || ((docTime(a.createdAt) || 0) - (docTime(b.createdAt) || 0)));

  if (!rows.length) { list.innerHTML = '<div class="empty-state">No questions published yet.</div>'; return; }

  list.innerHTML = rows.map((f, i) => `
    <div class="rf-faq" data-faq="${i}">
      <button class="rf-faq__q" type="button">
        <span>${esc(f.question || 'Question')}</span>
        <i data-lucide="plus"></i>
      </button>
      <div class="rf-faq__a"><p>${esc(f.answer || '')}</p></div>
    </div>`).join('');

  list.querySelectorAll('.rf-faq__q').forEach(btn => btn.addEventListener('click', () => {
    btn.parentElement.classList.toggle('open');
  }));
  if (window.lucide) window.lucide.createIcons();
}

// ---------- Tabs ----------
document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.querySelectorAll('.rf-tab');
  const show = (name) => {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.getElementById('panelReviews').hidden = name !== 'reviews';
    document.getElementById('panelFaqs').hidden = name !== 'faqs';
    history.replaceState(null, '', name === 'faqs' ? '#faqs' : location.pathname);
  };
  tabs.forEach(t => t.addEventListener('click', () => show(t.dataset.tab)));
  if (location.hash === '#faqs') show('faqs');

  watchCollection('reviews', (list, err) => {
    if (err) { document.getElementById('rvGrid').innerHTML = '<div class="empty-state">Could not load reviews.</div>'; return; }
    reviews = list;
    renderSummary(); renderFilters(); renderReviews();
  });

  watchCollection('faqs', (list, err) => {
    if (err) { document.getElementById('faqList').innerHTML = '<div class="empty-state">Could not load questions.</div>'; return; }
    faqs = list;
    renderFaqCats(); renderFaqs();
  });
});
