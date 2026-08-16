/* Admin analytics — detailed, real-time reporting across the whole store. */

(function () {
  if (window.__dripsAnalyticsBootstrapped) return;
  window.__dripsAnalyticsBootstrapped = true;

const A = {
  orders: [], products: [], logs: [], customers: [], coupons: [], expenses: [],
  reviews: [], newsletter: [], emailLogs: [],
};
let rangeDays = 30;
let painted = false;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const money = (n) => (window.Cart ? Cart.money(Math.round(n)) : '₦' + Math.round(n).toLocaleString());
const pct = (n) => (isFinite(n) ? n.toFixed(1) : '0.0') + '%';

/* Orders in this store were written by several versions of the checkout, so the
   payable total lives under different keys. Resolve it defensively. */
function orderTotal(o) {
  if (num(o.total) > 0) return num(o.total);
  if (num(o.customerTotal) > 0) return num(o.customerTotal);
  const sub = num(o.subtotal) || num(o.originalSubtotal);
  return Math.max(0, sub - num(o.couponDiscount)) + num(o.fee);
}
function orderNet(o) { return Math.max(0, (num(o.subtotal) || num(o.originalSubtotal)) - num(o.couponDiscount)); }
function orderTime(o) { return window.docTime ? docTime(o.paidAt || o.createdAt) : new Date(o.createdAt || 0).getTime(); }
function logTime(l) { return window.docTime ? docTime(l.createdAt || l.timestamp) : 0; }
function logEventName(l) { return l.event || l.action || ''; }
function isCancelled(o) { return String(o.status || '').toLowerCase() === 'cancelled'; }

const productById = {};
function orderCost(o) {
  if (num(o.costTotal) > 0) return num(o.costTotal);
  return (o.items || []).reduce((s, i) => {
    const pid = String(i.id || '').replace(/^combo:/, '');
    const cost = num(i.costPrice) || num(productById[pid]?.costPrice);
    return s + cost * (num(i.quantity) || num(i.qty) || 1);
  }, 0);
}
function orderProfit(o) { return orderTotal(o) - num(o.fee) - orderCost(o); }
function itemQty(i) { return num(i.quantity) || num(i.qty) || 1; }

function kpi(label, value, sub) {
  return `<div class="stat-card">
    <div class="stat-card__label">${esc(label)}</div>
    <div class="stat-card__value">${value}</div>
    ${sub ? `<div class="stat-card__sub">${sub}</div>` : ''}
  </div>`;
}
function kv(label, value, tone) {
  return `<div class="an-kv ${tone ? 'an-kv--' + tone : ''}"><span>${esc(label)}</span><b>${value}</b></div>`;
}
function barRows(rows, fmt) {
  if (!rows.length) return '<div class="an-kv"><span>No data yet</span><b>—</b></div>';
  const max = Math.max(1, ...rows.map(r => r.value));
  return rows.map(r => `<div class="an-row">
      <div class="an-row__name">${esc(r.name)}</div>
      <div class="an-row__val">${fmt ? fmt(r.value, r) : r.value.toLocaleString()}</div>
      <div class="an-row__bar"><span style="width:${Math.max(3, (r.value / max) * 100)}%"></span></div>
    </div>`).join('');
}
function chart(elId, labelId, buckets, fmt) {
  const el = document.getElementById(elId);
  if (!el) return;
  const max = Math.max(1, ...buckets.map(b => b.value));
  el.innerHTML = buckets.map(b => {
    const h = Math.max(2, Math.round((b.value / max) * 160));
    return `<div class="bar-chart__bar" style="height:${h}px;" title="${esc(b.label)}: ${fmt ? fmt(b.value) : b.value}"></div>`;
  }).join('');
  const step = Math.max(1, Math.ceil(buckets.length / 6));
  document.getElementById(labelId).innerHTML = buckets.filter((_, i) => i % step === 0).map(b => `<span>${esc(b.label)}</span>`).join('');
}
const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

function render() {
  const now = Date.now();
  const cutoff = rangeDays ? now - rangeDays * 86400000 : 0;
  const label = rangeDays ? `Last ${rangeDays} days` : 'All time';

  Object.keys(productById).forEach(k => delete productById[k]);
  A.products.forEach(p => { productById[p.id] = p; });

  const live = A.orders.filter(o => !isCancelled(o));
  const inRange = live.filter(o => orderTime(o) >= cutoff);
  const cancelledRange = A.orders.filter(o => isCancelled(o) && orderTime(o) >= cutoff);
  const prevRange = rangeDays
    ? live.filter(o => orderTime(o) >= cutoff - rangeDays * 86400000 && orderTime(o) < cutoff)
    : [];

  const logs = A.logs.filter(l => logTime(l) >= cutoff);
  const views = logs.filter(l => logEventName(l) === 'pageview');

  const revenue = inRange.reduce((s, o) => s + orderTotal(o), 0);
  const prevRevenue = prevRange.reduce((s, o) => s + orderTotal(o), 0);
  const cost = inRange.reduce((s, o) => s + orderCost(o), 0);
  const fees = inRange.reduce((s, o) => s + num(o.fee), 0);
  const discounts = inRange.reduce((s, o) => s + num(o.couponDiscount), 0);
  const profit = revenue - fees - cost;
  const units = inRange.reduce((s, o) => s + (o.items || []).reduce((t, i) => t + itemQty(i), 0), 0);
  const buyers = new Set(inRange.map(o => (o.email || '').toLowerCase()).filter(Boolean));
  const allBuyersBefore = new Set(live.filter(o => orderTime(o) < cutoff).map(o => (o.email || '').toLowerCase()));
  const newBuyers = [...buyers].filter(e => !allBuyersBefore.has(e)).length;
  const delta = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : null;

  document.getElementById('ovTitle').textContent = `Overview — ${label.toLowerCase()}`;

  set('kpiOverview', [
    kpi('Revenue', money(revenue), delta === null ? label : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% vs previous period`),
    kpi('Orders', inRange.length.toLocaleString(), `${cancelledRange.length} cancelled`),
    kpi('Profit', money(profit), revenue > 0 ? pct((profit / revenue) * 100) + ' margin' : '—'),
    kpi('Average order value', inRange.length ? money(revenue / inRange.length) : money(0), `${units} units sold`),
    kpi('Items per order', inRange.length ? (units / inRange.length).toFixed(2) : '0', 'Average basket size'),
    kpi('Customers', buyers.size.toLocaleString(), `${newBuyers} first-time`),
    kpi('Pageviews', views.length.toLocaleString(), `${logs.length.toLocaleString()} total events`),
    kpi('Conversion rate', views.length ? pct((inRange.length / views.length) * 100) : '—', 'Orders ÷ pageviews'),
  ].join(''));

  // ---------- charts ----------
  const bucketCount = rangeDays ? Math.min(rangeDays, 90) : 30;
  const monthly = !rangeDays || rangeDays > 120;
  const buckets = [];
  if (monthly) {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      buckets.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString('en-GB', { month: 'short' }), value: 0, views: 0 });
    }
  } else {
    for (let i = bucketCount - 1; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      buckets.push({ key: d.toISOString().slice(0, 10), label: d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }), value: 0, views: 0 });
    }
  }
  const bucketKey = (ts) => new Date(ts).toISOString().slice(0, monthly ? 7 : 10);
  inRange.forEach(o => { const b = buckets.find(x => x.key === bucketKey(orderTime(o))); if (b) b.value += orderTotal(o); });
  views.forEach(l => { const b = buckets.find(x => x.key === bucketKey(logTime(l))); if (b) b.views++; });
  chart('revChart', 'revChartLabels', buckets, money);
  chart('pvChart', 'pvChartLabels', buckets.map(b => ({ label: b.label, value: b.views })));

  // ---------- all-time financials ----------
  const allRevenue = live.reduce((s, o) => s + orderTotal(o), 0);
  const allCost = live.reduce((s, o) => s + orderCost(o), 0);
  const allFees = live.reduce((s, o) => s + num(o.fee), 0);
  const allDiscounts = live.reduce((s, o) => s + num(o.couponDiscount), 0);
  const allExpenses = A.expenses.reduce((s, e) => s + num(e.amount), 0);
  const grossProfit = allRevenue - allCost;
  const netProfit = grossProfit - allFees - allExpenses;
  const cancelledValue = A.orders.filter(isCancelled).reduce((s, o) => s + orderTotal(o), 0);
  const shipped = live.reduce((s, o) => s + (o.items || []).reduce((t, i) => t + itemQty(i), 0), 0);

  set('finIn', [
    kv('Gross revenue', money(allRevenue)),
    kv('Product subtotal', money(live.reduce((s, o) => s + orderNet(o), 0))),
    kv('Paystack / transfer fees collected', money(allFees)),
    kv('Average order value', live.length ? money(allRevenue / live.length) : money(0)),
    kv('Revenue per customer', A.customers.length ? money(allRevenue / A.customers.length) : money(0)),
    kv('Paid orders', live.length.toLocaleString()),
    kv('Units shipped', shipped.toLocaleString()),
  ].join(''));

  set('finOut', [
    kv('Cost of goods sold', money(allCost)),
    kv('Coupon discounts given', money(allDiscounts)),
    kv('Business expenses', money(allExpenses)),
    kv('Payment fees', money(allFees)),
    kv('Gross profit', money(grossProfit), grossProfit >= 0 ? 'good' : 'bad'),
    kv('Net profit', money(netProfit), netProfit >= 0 ? 'good' : 'bad'),
    kv('Net margin', allRevenue > 0 ? pct((netProfit / allRevenue) * 100) : '—', netProfit >= 0 ? 'good' : 'bad'),
    kv('Lost to cancelled orders', money(cancelledValue), 'bad'),
  ].join(''));

  // ---------- inventory ----------
  const stockUnits = A.products.reduce((s, p) => s + num(p.stock), 0);
  const stockCost = A.products.reduce((s, p) => s + num(p.costPrice) * num(p.stock), 0);
  const stockRetail = A.products.reduce((s, p) => s + (num(p.discountPrice) || num(p.price)) * num(p.stock), 0);
  const soldOut = A.products.filter(p => num(p.stock) <= 0).length;
  set('invPanel', [
    kv('Products live', A.products.length.toLocaleString()),
    kv('Units in stock', stockUnits.toLocaleString()),
    kv('Stock value at cost', money(stockCost)),
    kv('Stock value at retail', money(stockRetail)),
    kv('Potential profit in stock', money(stockRetail - stockCost), 'good'),
    kv('Sold out products', soldOut.toLocaleString(), soldOut ? 'bad' : ''),
  ].join(''));

  // ---------- customers ----------
  const spendByEmail = {};
  live.forEach(o => {
    const e = (o.email || '').toLowerCase() || 'unknown';
    if (!spendByEmail[e]) spendByEmail[e] = { name: o.name || e, total: 0, orders: 0 };
    spendByEmail[e].total += orderTotal(o);
    spendByEmail[e].orders++;
  });
  const buyerList = Object.values(spendByEmail);
  const repeat = buyerList.filter(b => b.orders > 1).length;
  set('custPanel', [
    kv('Customer records', A.customers.length.toLocaleString()),
    kv('Customers who ordered', buyerList.length.toLocaleString()),
    kv('Repeat customers', repeat.toLocaleString(), repeat ? 'good' : ''),
    kv('Repeat rate', buyerList.length ? pct((repeat / buyerList.length) * 100) : '—'),
    kv('Lifetime value (avg)', buyerList.length ? money(allRevenue / buyerList.length) : money(0)),
    kv('Newsletter subscribers', A.newsletter.length.toLocaleString()),
    kv('Reviews collected', A.reviews.length.toLocaleString()),
    kv('Average rating', A.reviews.length
      ? (A.reviews.reduce((s, r) => s + num(r.overallRating || r.rating), 0) / A.reviews.length).toFixed(1) + ' / 5'
      : '—'),
    kv('Emails sent', A.emailLogs.length.toLocaleString()),
  ].join(''));

  set('topCustomers', barRows(
    buyerList.sort((a, b) => b.total - a.total).slice(0, 8)
      .map(b => ({ name: `${b.name} · ${b.orders} order${b.orders > 1 ? 's' : ''}`, value: b.total })),
    money));

  // ---------- product performance ----------
  const prodStats = {};
  inRange.forEach(o => (o.items || []).forEach(i => {
    const key = i.name || i.id || 'Unknown';
    if (!prodStats[key]) prodStats[key] = { revenue: 0, units: 0, id: i.id };
    prodStats[key].revenue += num(i.price) * itemQty(i);
    prodStats[key].units += itemQty(i);
  }));
  const prodRows = Object.entries(prodStats).map(([name, v]) => ({ name, ...v }));
  set('topRevenue', barRows(prodRows.sort((a, b) => b.revenue - a.revenue).slice(0, 8).map(p => ({ name: p.name, value: p.revenue })), money));
  set('topUnits', barRows(prodRows.sort((a, b) => b.units - a.units).slice(0, 8).map(p => ({ name: p.name, value: p.units })), v => v + ' sold'));

  const catStats = {};
  inRange.forEach(o => (o.items || []).forEach(i => {
    const pid = String(i.id || '').replace(/^combo:/, '');
    const cat = productById[pid]?.category || 'Uncategorised';
    catStats[cat] = (catStats[cat] || 0) + num(i.price) * itemQty(i);
  }));
  set('byCategory', barRows(Object.entries(catStats).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8), money));

  const stateStats = {};
  inRange.forEach(o => { const s = o.state || 'Unknown'; stateStats[s] = (stateStats[s] || 0) + orderTotal(o); });
  set('byState', barRows(Object.entries(stateStats).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8), money));

  const sizeStats = {}; const colorStats = {};
  inRange.forEach(o => (o.items || []).forEach(i => {
    if (i.size) sizeStats[i.size] = (sizeStats[i.size] || 0) + itemQty(i);
    if (i.color) colorStats[i.color] = (colorStats[i.color] || 0) + itemQty(i);
  }));
  const sizeRows = Object.entries(sizeStats).map(([name, value]) => ({ name: 'Size ' + name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
  const colorRows = Object.entries(colorStats).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
  set('bySizeColor', barRows([...sizeRows, ...colorRows], v => v + ' sold'));

  // ---------- traffic ----------
  const pathCounts = {};
  views.forEach(l => { const p = l.path || (l.url ? String(l.url).replace(/^https?:\/\/[^/]+/, '') : '/'); pathCounts[p] = (pathCounts[p] || 0) + 1; });
  set('topPages', barRows(Object.entries(pathCounts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8), v => v + ' views'));

  let mobile = 0, desktop = 0;
  const refs = {};
  logs.forEach(l => {
    const ua = l.userAgent || '';
    if (/Mobi|Android|iPhone|iPad/i.test(ua)) mobile++; else if (ua) desktop++;
    const r = l.referrer ? (() => { try { return new URL(l.referrer).hostname; } catch { return 'direct'; } })() : 'Direct / none';
    refs[r] = (refs[r] || 0) + 1;
  });
  set('trafficMix', barRows([
    { name: 'Mobile visits', value: mobile },
    { name: 'Desktop visits', value: desktop },
    ...Object.entries(refs).map(([name, value]) => ({ name: 'From ' + name, value })).sort((a, b) => b.value - a.value).slice(0, 5),
  ], v => v.toLocaleString()));

  // ---------- status + timing ----------
  const statuses = {};
  A.orders.filter(o => orderTime(o) >= cutoff).forEach(o => {
    const s = o.status || 'pending';
    if (!statuses[s]) statuses[s] = { count: 0, revenue: 0 };
    statuses[s].count++; statuses[s].revenue += orderTotal(o);
  });
  set('statusBreakdown', barRows(
    Object.entries(statuses).map(([name, v]) => ({ name: `${name} · ${v.count} order${v.count > 1 ? 's' : ''}`, value: v.revenue }))
      .sort((a, b) => b.value - a.value), money));

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const byDay = {}; const byHour = {};
  inRange.forEach(o => {
    const d = new Date(orderTime(o));
    byDay[dayNames[d.getDay()]] = (byDay[dayNames[d.getDay()]] || 0) + 1;
    const h = d.getHours();
    byHour[h] = (byHour[h] || 0) + 1;
  });
  const hourRows = Object.entries(byHour).map(([h, v]) => ({ name: `${String(h).padStart(2, '0')}:00 – ${String(h).padStart(2, '0')}:59`, value: v }))
    .sort((a, b) => b.value - a.value).slice(0, 4);
  set('busiest', barRows([
    ...Object.entries(byDay).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 4),
    ...hourRows,
  ], v => v + ' orders'));

  // ---------- coupons ----------
  const couponRows = A.coupons.map(c => {
    const uses = Array.isArray(c.usageLog) ? c.usageLog.length : num(c.uses);
    const saved = Array.isArray(c.usageLog) ? c.usageLog.reduce((s, u) => s + num(u.discount), 0) : 0;
    return { name: `${c.code || 'code'} · ${uses} use${uses === 1 ? '' : 's'}${c.isActive === false ? ' (off)' : ''}`, value: saved };
  }).sort((a, b) => b.value - a.value);
  set('couponPanel', couponRows.length
    ? barRows(couponRows.slice(0, 8), money)
    : kv('No coupons created yet', '—'));

  // ---------- stock + views ----------
  const lowStock = A.products.filter(p => num(p.stock) <= 3)
    .sort((a, b) => num(a.stock) - num(b.stock)).slice(0, 5)
    .map(p => kv(p.name || 'Product', num(p.stock) <= 0 ? 'Sold out' : num(p.stock) + ' left', num(p.stock) <= 0 ? 'bad' : ''));
  const viewed = [...A.products].sort((a, b) => num(b.views) - num(a.views)).slice(0, 5)
    .map(p => ({ name: p.name || 'Product', value: num(p.views) }));
  set('stockPanel', (lowStock.length ? lowStock.join('') : kv('Stock levels healthy', '✓', 'good')) + barRows(viewed, v => v + ' views'));

  // ---------- expenses ----------
  const expCats = {};
  A.expenses.forEach(e => {
    const c = e.category || 'other';
    if (!expCats[c]) expCats[c] = { count: 0, total: 0 };
    expCats[c].count++; expCats[c].total += num(e.amount);
  });
  const expRows = Object.entries(expCats).sort((a, b) => b[1].total - a[1].total);
  document.getElementById('expenseBody').innerHTML = expRows.length
    ? expRows.map(([c, v]) => `<tr><td>${esc(c)}</td><td>${v.count}</td><td>${money(v.total)}</td></tr>`).join('')
      + `<tr><td><strong>Total</strong></td><td>${A.expenses.length}</td><td><strong>${money(allExpenses)}</strong></td></tr>`
    : '<tr><td colspan="3">No expenses recorded yet.</td></tr>';

  painted = true;
}

document.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('rangeSel');
  sel.addEventListener('change', () => { rangeDays = Number(sel.value); render(); });

  (async () => {
    await initFirebase();
    const feeds = [
      ['orders', 'orders'], ['products', 'products'], ['logs', 'logs'], ['customers', 'customers'],
      ['coupons', 'coupons'], ['expenses', 'expenses'], ['reviews', 'reviews'],
      ['newsletter', 'newsletter'], ['emailLogs', 'emailLogs'],
    ];
    feeds.forEach(([coll, key]) => {
      try {
        watchCollection(coll, (list) => { A[key] = list || []; render(); });
      } catch (e) { /* collection may not exist yet */ }
    });
    setTimeout(() => { if (!painted) render(); }, 2500);
  })();
});
})();
