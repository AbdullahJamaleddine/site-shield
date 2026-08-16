let allOrders = [];
let allProducts = [];
let manualCart = [];   // { id, name, price, image, sizes, size, qty }
let dbRef;

const STATUSES = ['processing', 'paid', 'shipped', 'delivered', 'cancelled'];

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function itemQty(i) { return Number(i.qty ?? i.quantity ?? 1) || 1; }
function itemImage(i) { return i.image || i.images?.[0] || '/images/placeholder.svg'; }
function orderItems(o) { return Array.isArray(o.items) ? o.items : []; }
function orderSubtotal(o) { return Number(o.subtotal ?? o.originalSubtotal ?? orderItems(o).reduce((s, i) => s + (Number(i.price) || 0) * itemQty(i), 0)) || 0; }
function orderDiscount(o) { return Number(o.couponDiscount ?? o.discount ?? o.appliedCoupon?.discount ?? 0) || 0; }
function orderDelivery(o) { return Number(o.deliveryCost ?? o.deliveryFee ?? o.shippingFee ?? 0) || 0; }
function orderFee(o) { return Number(o.fee ?? o.paystackFee ?? 0) || 0; }
function orderTotal(o) { return Number(o.total ?? o.customerTotal ?? o.amount ?? (orderSubtotal(o) - orderDiscount(o) + orderDelivery(o) + orderFee(o))) || 0; }
function formatDate(v) { const t = docTime(v); return t ? new Date(t).toLocaleString('en-GB') : '—'; }

function currentFilters() {
  return {
    q: (document.getElementById('orderSearch').value || '').toLowerCase().trim(),
    status: document.getElementById('orderStatusFilter').value,
  };
}

function renderTable() {
  const { q, status } = currentFilters();
  const tbody = document.getElementById('ordersTableBody');
  const list = allOrders.filter(o => {
    if (status && o.status !== status) return false;
    if (!q) return true;
    const hay = `${o.reference || ''} ${o.name || ''} ${o.email || ''} ${o.phone || ''} ${o.id}`.toLowerCase();
    return hay.includes(q);
  });
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="6">No orders match.</td></tr>'; return; }
  tbody.innerHTML = list.map(o => `
    <tr class="click-row" data-order-id="${o.id}">
      <td><a href="#" onclick="viewOrder('${o.id}'); return false;">${o.reference || o.id}</a>${o.source === 'manual' ? ' <span class="status-pill" style="margin-left:4px;">manual</span>' : ''}</td>
      <td>${o.name || ''}<br><span style="color:var(--fg-faint); font-size:11px;">${o.phone || ''} · ${o.email || ''}</span></td>
      <td>${orderItems(o).reduce((s, i) => s + itemQty(i), 0)} items</td>
      <td>${Cart.money(orderTotal(o))}</td>
      <td><span class="status-pill ${o.status || ''}">${o.status || 'pending'}</span></td>
      <td>${formatDate(o.createdAt || o.paidAt || o.updatedAt)}</td>
    </tr>
  `).join('');
  tbody.querySelectorAll('.click-row').forEach(row => row.addEventListener('click', (e) => {
    if (e.target.closest('a,button,select,input')) return;
    viewOrder(row.dataset.orderId);
  }));
}

window.viewOrder = (id) => {
  const o = allOrders.find(x => x.id === id);
  if (!o) return;

  document.getElementById('orderDetailTitle').textContent = `Order ${o.reference || o.id}`;

  const itemsHtml = orderItems(o).map(i => `
    <div class="order-item">
      <img src="${itemImage(i)}" alt="${escapeHtml(i.name)}" />
      <div>
        <div class="order-item__name">${escapeHtml(i.name || 'Item')}</div>
        <div class="order-item__meta">${[i.size ? 'Size: ' + i.size : '', i.color ? 'Color: ' + i.color : '', 'Qty: ' + itemQty(i), 'Unit: ' + Cart.money(i.price)].filter(Boolean).join(' · ')}</div>
        <div class="order-item__meta">Product ID: ${escapeHtml(i.id || '—')}</div>
      </div>
      <div class="order-item__price">${Cart.money((Number(i.price) || 0) * itemQty(i))}</div>
    </div>
  `).join('') || '<div style="color:var(--fg-muted); font-family:var(--font-mono); font-size:12px;">No items recorded.</div>';

  const statusSelect = `<select id="detailStatus" style="background:var(--bg-elevated); color:var(--fg); border:1px solid var(--border-strong); padding:6px 10px; font-family:var(--font-mono); font-size:12px;">
    ${STATUSES.map(s => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}
  </select>`;

  document.getElementById('orderDetailBody').innerHTML = `
    <div class="order-detail">
      <div class="order-detail__sec">
        <h4>Status</h4>
        <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
          ${statusSelect}
          <button class="btn" id="saveStatusBtn" style="padding:8px 16px;">Save</button>
          <span class="status-pill ${o.status || ''}">${o.status || 'pending'}</span>
        </div>
      </div>

      <div class="order-detail__sec">
        <h4>Customer</h4>
        <dl class="order-detail__kv">
          <dt>Name</dt><dd>${o.name || '—'}</dd>
          <dt>Email</dt><dd>${o.email || '—'}</dd>
          <dt>Phone</dt><dd>${o.phone || '—'}</dd>
          <dt>Customer total</dt><dd>${Cart.money(orderTotal(o))}</dd>
        </dl>
      </div>

      <div class="order-detail__sec">
        <h4>Delivery</h4>
        <dl class="order-detail__kv">
          <dt>Address</dt><dd>${o.address || '—'}</dd>
          <dt>City</dt><dd>${o.city || '—'}</dd>
          <dt>State</dt><dd>${o.state || '—'}</dd>
          <dt>Notes</dt><dd>${o.notes || o.additionalInfo || '—'}</dd>
        </dl>
      </div>

      <div class="order-detail__sec">
        <h4>Items</h4>
        ${itemsHtml}
        <div class="summary-line" style="margin-top:14px;"><span>Subtotal</span><span>${Cart.money(orderSubtotal(o))}</span></div>
        ${orderDiscount(o) ? `<div class="summary-line"><span>Coupon ${o.appliedCoupon?.code ? '(' + o.appliedCoupon.code + ')' : ''}</span><span>−${Cart.money(orderDiscount(o))}</span></div>` : ''}
        ${orderDelivery(o) ? `<div class="summary-line"><span>Delivery</span><span>${Cart.money(orderDelivery(o))}</span></div>` : ''}
        ${orderFee(o) ? `<div class="summary-line"><span>Paystack fee</span><span>${Cart.money(orderFee(o))}</span></div>` : ''}
        ${o.costTotal !== undefined ? `<div class="summary-line"><span>Cost total</span><span>${Cart.money(o.costTotal)}</span></div>` : ''}
        ${o.profit !== undefined ? `<div class="summary-line"><span>Profit</span><span>${Cart.money(o.profit)}</span></div>` : ''}
        <div class="summary-line total"><span>Total</span><span>${Cart.money(orderTotal(o))}</span></div>
      </div>

      <div class="order-detail__sec">
        <h4>Payment</h4>
        <dl class="order-detail__kv">
          <dt>Method</dt><dd>${o.paymentMethod || (o.source === 'manual' ? 'Manual' : '—')}</dd>
          <dt>Reference</dt><dd>${o.reference || '—'}</dd>
          <dt>Paystack ref</dt><dd>${o.paystackRef || '—'}</dd>
          <dt>Source</dt><dd>${o.source || 'website'}</dd>
          <dt>Coupon</dt><dd>${o.appliedCoupon?.code || '—'}</dd>
        </dl>
      </div>

      <div class="order-detail__sec">
        <h4>Timeline</h4>
        <dl class="order-detail__kv">
          <dt>Order ID</dt><dd>${o.id}</dd>
          <dt>Paid</dt><dd>${formatDate(o.paidAt)}</dd>
          <dt>Created</dt><dd>${formatDate(o.createdAt)}</dd>
          <dt>Updated</dt><dd>${formatDate(o.updatedAt)}</dd>
        </dl>
      </div>

      <div class="order-detail__sec">
        <h4>Actions</h4>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          ${o.phone ? `<a class="btn" target="_blank" rel="noopener" href="https://wa.me/${(o.phone || '').replace(/[^0-9]/g,'').replace(/^0/, '234')}?text=Hi%20${encodeURIComponent(o.name || '')}%2C%20about%20your%20order%20${encodeURIComponent(o.reference || '')}">WhatsApp customer</a>` : ''}
          ${o.email ? `<a class="btn" href="mailto:${o.email}?subject=Order%20${encodeURIComponent(o.reference || '')}">Email customer</a>` : ''}
          ${o.email ? `<button class="btn" id="resendReceiptBtn" type="button">Resend receipt</button>` : ''}
          <button class="btn btn--danger" id="deleteOrderBtn" style="padding:12px 18px;">Delete order</button>
        </div>
      </div>
    </div>
  `;

  const resendBtn = document.getElementById('resendReceiptBtn');
  if (resendBtn) {
    resendBtn.addEventListener('click', async () => {
      resendBtn.disabled = true; resendBtn.textContent = 'Sending…';
      try {
        const res = await fetch('/api/send-email', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'customer_confirmation', order: o }),
        });
        if (res.ok) showToast('Receipt resent'); else showToast('Could not send email', 'error');
      } catch { showToast('Could not send email', 'error'); }
      finally { resendBtn.disabled = false; resendBtn.textContent = 'Resend receipt'; }
    });
  }

  document.getElementById('saveStatusBtn').addEventListener('click', async () => {
    const newStatus = document.getElementById('detailStatus').value;
    try {
      await dbRef.collection('orders').doc(o.id).update({ status: newStatus, updatedAt: new Date().toISOString() });
      showToast('Order status updated');
    } catch (err) { console.error(err); showToast('Could not update status', 'error'); }
  });

  document.getElementById('deleteOrderBtn').addEventListener('click', () => {
    confirmModal({
      title: 'Delete this order?',
      message: 'This permanently removes the order. This cannot be undone.',
      confirmText: 'Delete', danger: true,
      onConfirm: async () => {
        try {
          await dbRef.collection('orders').doc(o.id).delete();
          showToast('Order deleted');
          document.getElementById('orderDetailPanel').classList.remove('open');
        } catch (err) { console.error(err); showToast('Could not delete order', 'error'); }
      }
    });
  });

  document.getElementById('orderDetailPanel').classList.add('open');
};

document.getElementById('closeOrderBtn').addEventListener('click', () => {
  document.getElementById('orderDetailPanel').classList.remove('open');
});
document.getElementById('orderSearch').addEventListener('input', renderTable);
document.getElementById('orderStatusFilter').addEventListener('change', renderTable);

/* ---------------- Manual order logging ---------------- */
function renderManualPicker() {
  const q = (document.getElementById('manualProductSearch').value || '').toLowerCase().trim();
  const list = allProducts.filter(p => !q || (`${p.name} ${p.category || ''}`).toLowerCase().includes(q)).slice(0, 40);
  const wrap = document.getElementById('manualProductList');
  wrap.innerHTML = list.length ? list.map(p => `
    <button type="button" class="manual-prod" data-id="${p.id}">
      <img src="${p.images?.[0] || '/images/placeholder.svg'}" alt="" />
      <span class="manual-prod__name">${p.name}</span>
      <span class="manual-prod__price">${Cart.money(p.price)} · ${p.stock ?? 0} left</span>
    </button>`).join('') : '<div class="manual-empty">No products found.</div>';
  wrap.querySelectorAll('.manual-prod').forEach(b => b.addEventListener('click', () => addManualItem(b.dataset.id)));
}

function addManualItem(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  const existing = manualCart.find(i => i.id === id);
  if (existing) { existing.qty += 1; }
  else manualCart.push({ id: p.id, name: p.name, price: Number(p.price) || 0, image: p.images?.[0] || '', sizes: p.sizes || [], size: (p.sizes || [])[0] || '', qty: 1 });
  renderManualSelected();
}

function renderManualSelected() {
  const wrap = document.getElementById('manualSelected');
  if (!manualCart.length) { wrap.innerHTML = '<div class="manual-empty">No items added yet.</div>'; }
  else {
    wrap.innerHTML = manualCart.map((i, idx) => `
      <div class="manual-row">
        <img src="${i.image || '/images/placeholder.svg'}" alt="" />
        <div class="manual-row__info">
          <div class="manual-row__name">${i.name}</div>
          <div class="manual-row__ctrls">
            ${i.sizes.length ? `<select data-idx="${idx}" class="mSize">${i.sizes.map(s => `<option ${s === i.size ? 'selected' : ''}>${s}</option>`).join('')}</select>` : ''}
            <div class="qty-control">
              <button type="button" data-idx="${idx}" class="mMinus">−</button>
              <span>${i.qty}</span>
              <button type="button" data-idx="${idx}" class="mPlus">+</button>
            </div>
            <span class="manual-row__price">${Cart.money(i.price * i.qty)}</span>
            <button type="button" data-idx="${idx}" class="mRemove">Remove</button>
          </div>
        </div>
      </div>`).join('');
  }
  const total = manualCart.reduce((s, i) => s + i.price * i.qty, 0);
  document.getElementById('manualTotal').textContent = Cart.money(total);

  wrap.querySelectorAll('.mPlus').forEach(b => b.addEventListener('click', () => { manualCart[+b.dataset.idx].qty++; renderManualSelected(); }));
  wrap.querySelectorAll('.mMinus').forEach(b => b.addEventListener('click', () => { const i = +b.dataset.idx; manualCart[i].qty = Math.max(1, manualCart[i].qty - 1); renderManualSelected(); }));
  wrap.querySelectorAll('.mRemove').forEach(b => b.addEventListener('click', () => { manualCart.splice(+b.dataset.idx, 1); renderManualSelected(); }));
  wrap.querySelectorAll('.mSize').forEach(sel => sel.addEventListener('change', () => { manualCart[+sel.dataset.idx].size = sel.value; }));
}

function openManual() {
  manualCart = [];
  ['mName','mPhone','mEmail','mAddress','mCity','mState'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  document.getElementById('manualProductSearch').value = '';
  renderManualPicker();
  renderManualSelected();
  document.getElementById('manualOrderPanel').classList.add('open');
}

document.getElementById('logOrderBtn').addEventListener('click', openManual);
document.getElementById('closeManualBtn').addEventListener('click', () => document.getElementById('manualOrderPanel').classList.remove('open'));
document.getElementById('manualProductSearch').addEventListener('input', renderManualPicker);

document.getElementById('saveManualBtn').addEventListener('click', async () => {
  const name = document.getElementById('mName').value.trim();
  if (!manualCart.length) { showToast('Add at least one item', 'error'); return; }
  if (!name) { showToast('Enter the customer name', 'error'); return; }

  const btn = document.getElementById('saveManualBtn');
  btn.disabled = true; btn.textContent = 'Saving…';

  const subtotal = manualCart.reduce((s, i) => s + i.price * i.qty, 0);
  const order = {
    reference: 'DDM' + Date.now(),
    name,
    phone: document.getElementById('mPhone').value.trim(),
    email: document.getElementById('mEmail').value.trim(),
    address: document.getElementById('mAddress').value.trim(),
    city: document.getElementById('mCity').value.trim(),
    state: document.getElementById('mState').value.trim(),
    items: manualCart.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty, size: i.size, image: i.image })),
    subtotal, fee: 0, total: subtotal,
    status: document.getElementById('mStatus').value,
    paymentMethod: 'Manual (direct payment)',
    source: 'manual',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    const savedRef = await dbRef.collection('orders').add(order);
    if (document.getElementById('mReduceStock').checked) {
      await Promise.all(manualCart.map(async (i) => {
        const p = allProducts.find(x => x.id === i.id);
        if (!p) return;
        const newStock = Math.max(0, (Number(p.stock) || 0) - i.qty);
        try { await dbRef.collection('products').doc(i.id).update({ stock: newStock }); } catch {}
      }));
    }
    // Email is optional — send receipt only when provided
    if (order.email) {
      fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'customer_confirmation', order: { ...order, id: savedRef.id } }),
      }).catch(() => {});
      showToast('Manual order logged — receipt emailed');
    } else {
      showToast('Manual order logged');
    }
    document.getElementById('manualOrderPanel').classList.remove('open');
  } catch (err) {
    console.error(err); showToast('Could not save order', 'error');
  } finally { btn.disabled = false; btn.textContent = 'Save order'; }
});

/* ---------------- Live data ---------------- */
(async () => {
  const { db } = await initFirebase();
  dbRef = db;

  watchCollection('orders', (list) => {
    allOrders = list;
    renderTable();
    // Keep an open detail panel in sync.
    if (document.getElementById('orderDetailPanel').classList.contains('open')) {
      const openId = allOrders.find(o => document.getElementById('orderDetailTitle').textContent.includes(o.reference || o.id));
      if (openId) viewOrder(openId.id);
    }
    const id = new URLSearchParams(location.search).get('id');
    if (id && !window._deepLinked) { window._deepLinked = true; viewOrder(id); }
  });

  watchCollection('products', (list) => {
    allProducts = list;
    if (document.getElementById('manualOrderPanel').classList.contains('open')) renderManualPicker();
  });
})();
