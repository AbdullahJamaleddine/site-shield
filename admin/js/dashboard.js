// Live admin dashboard — auto-refreshes as orders/products change.
let orders = [];
let products = [];
let extra = { customers: 0, newsletter: 0, reviews: [] };

function renderDashboard() {
  const paidOrders = orders.filter(o => o.status !== 'cancelled');
  const revenue = paidOrders.reduce((sum, o) => sum + resolveOrderTotal(o), 0);
  const aov = paidOrders.length ? Math.round(revenue / paidOrders.length) : 0;

  const now = new Date();
  const last30Cutoff = new Date(now.getTime() - 30 * 86400000);
  const last30Rev = paidOrders
    .filter(o => o.createdAt && new Date(docTime(o.createdAt)) >= last30Cutoff)
    .reduce((s, o) => s + resolveOrderTotal(o), 0);

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  set('statRevenue', Cart.money(revenue));
  set('statRevenueSub', `Last 30d: ${Cart.money(last30Rev)}`);
  set('statOrders', orders.length);
  set('statOrdersSub', `${paidOrders.length} paid · ${orders.filter(o => o.status === 'delivered').length} delivered`);
  set('statProducts', products.length);

  const lowStock = products.filter(p => (p.stock || 0) > 0 && (p.stock || 0) < 5).length;
  const outStock = products.filter(p => (p.stock || 0) <= 0).length;
  set('statProductsSub', `${outStock} sold out`);
  set('statLowStock', lowStock);

  set('statCustomers', extra.customers);
  set('statCustomersSub', extra.customers ? 'Unique buyers' : 'No data yet');
  set('statNewsletter', extra.newsletter);
  set('statReviews', extra.reviews.length);
  const avgRating = extra.reviews.length ? (extra.reviews.reduce((s, r) => s + (r.rating || 0), 0) / extra.reviews.length).toFixed(1) : '—';
  set('statReviewsSub', `Avg ${avgRating} ★`);
  set('statAOV', Cart.money(aov));

  // 14-day revenue chart
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    days.push({ key: d.toISOString().slice(0, 10), label: d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }), total: 0 });
  }
  paidOrders.forEach(o => {
    if (!o.createdAt) return;
    const key = new Date(docTime(o.createdAt)).toISOString().slice(0, 10);
    const day = days.find(d => d.key === key);
    if (day) day.total += resolveOrderTotal(o);
  });
  const maxRev = Math.max(1, ...days.map(d => d.total));
  const chart = document.getElementById('revChart');
  if (chart) chart.innerHTML = days.map(d => {
    const h = Math.max(2, Math.round((d.total / maxRev) * 160));
    return `<div class="bar-chart__bar" style="height:${h}px;" title="${d.label}: ${Cart.money(d.total)}"></div>`;
  }).join('');
  const labels = document.getElementById('revChartLabels');
  if (labels) labels.innerHTML = days.filter((_, i) => i % 2 === 0).map(d => `<span>${d.label}</span>`).join('');

  // Recent orders
  const recentBody = document.getElementById('recentOrders');
  if (recentBody) {
    const recent = orders.slice(0, 10);
    recentBody.innerHTML = recent.length ? recent.map(o => `
      <tr>
        <td><a href="/admin/orders?id=${o.id}">${o.reference || o.id}</a></td>
        <td>${o.name || ''}<br><span style="color:var(--fg-faint); font-size:11px;">${o.email || ''}</span></td>
        <td>${(o.items || []).reduce((s, i) => s + (i.qty || 0), 0)}</td>
        <td>${Cart.money(resolveOrderTotal(o))}</td>
        <td><span class="status-pill ${o.status || ''}">${o.status || 'pending'}</span></td>
        <td>${o.createdAt ? new Date(docTime(o.createdAt)).toLocaleDateString('en-GB') : ''}</td>
      </tr>`).join('') : '<tr><td colspan="6">No orders yet.</td></tr>';
  }
}

watchCollection('orders', (list) => { orders = list; renderDashboard(); });
watchCollection('products', (list) => { products = list; renderDashboard(); });

// One-shot counts for secondary collections (resilient).
(async () => {
  try {
    const [customers, newsletter, reviews] = await Promise.all([
      fetchCollection('customers').catch(() => []),
      fetchCollection('newsletter').catch(() => []),
      fetchCollection('reviews').catch(() => []),
    ]);
    extra = { customers: customers.length, newsletter: newsletter.length, reviews };
    renderDashboard();
  } catch (e) { console.error(e); }
})();
