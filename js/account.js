/* Dedicated /account page. Signed out → 6-digit email code sign-in.
   Signed in → orders + wishlist tabs. Orders come from /api/my-orders (signed
   session token) so Firestore orders stay admin-only. Live-refreshed by polling
   every 8s plus on tab focus, so status changes appear without a reload. */

const ROOT = () => document.getElementById('acctRoot');
let activeTab = new URLSearchParams(location.search).get('tab') || 'orders';
let openOrderId = null;
let ordersTimer = null;
let ordersCache = [];
let ordersLoaded = false;

function fmtDate(v) {
  const t = window.docTime ? window.docTime(v) : new Date(v).getTime();
  return t ? new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}
function statusPill(s) {
  const cls = /paid|success/.test(s) ? 'status-pill--paid'
    : /ship/.test(s) ? 'status-pill--shipped'
    : /deliv/.test(s) ? 'status-pill--delivered'
    : /cancel/.test(s) ? 'status-pill--cancelled'
    : 'status-pill--pending';
  return `<span class="status-pill ${cls}">${s || 'pending'}</span>`;
}
function stopOrdersPolling() { if (ordersTimer) { clearInterval(ordersTimer); ordersTimer = null; } if (typeof ordersUnsub === 'function') { try { ordersUnsub(); } catch (e) {} ordersUnsub = null; } }

function renderSignIn() {
  stopOrdersPolling();
  ordersLoaded = false; ordersCache = [];
  ROOT().innerHTML = `
    <div class="auth-card">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="font-family:var(--font-display);font-weight:800;letter-spacing:0.08em;font-size:13px;">DRIPS &amp; DROPS</div>
        <h2 style="margin:10px 0 4px;font-size:22px;">Sign in to your account</h2>
        <p style="color:var(--muted);font-size:14px;margin:0;">Enter your email and we'll send you a 6-digit code.</p>
      </div>
      <div id="signStep1">
        <div class="field">
          <label>Email</label>
          <input type="email" id="authEmail" placeholder="you@email.com" autocomplete="email" />
        </div>
        <button class="btn btn--solid btn--block mt-4" id="sendCodeBtn">Send code</button>
      </div>
      <div id="signStep2" style="display:none;">
        <p style="text-align:center;color:var(--muted);font-size:14px;">Enter the 6-digit code we sent to <b id="shownEmail"></b>.</p>
        <div class="code-inputs" id="codeInputs">
          ${[0,1,2,3,4,5].map(i => `<input type="text" inputmode="numeric" maxlength="1" data-i="${i}" />`).join('')}
        </div>
        <button class="btn btn--solid btn--block mt-4" id="verifyCodeBtn">Verify &amp; sign in</button>
        <div class="text-center mt-2" style="font-size:12.5px;">
          <a href="#" id="resendCode" style="color:var(--muted);text-decoration:underline;">Resend</a>
          &nbsp;·&nbsp;
          <a href="#" id="backCode" style="color:var(--muted);text-decoration:underline;">Use another email</a>
        </div>
      </div>
    </div>`;

  const emailInput = document.getElementById('authEmail');
  const sendBtn = document.getElementById('sendCodeBtn');
  const verifyBtn = document.getElementById('verifyCodeBtn');
  const inputs = Array.from(document.querySelectorAll('#codeInputs input'));
  let pending = '';

  async function send() {
    const email = emailInput.value.trim().toLowerCase();
    if (!email || !/\S+@\S+\.\S+/.test(email)) return showToast('Enter a valid email', 'error');
    sendBtn.disabled = true; sendBtn.textContent = 'Sending…';
    try {
      const res = await fetch('/api/auth-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', email }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Send failed');
      pending = email;
      document.getElementById('shownEmail').textContent = email;
      document.getElementById('signStep1').style.display = 'none';
      document.getElementById('signStep2').style.display = '';
      inputs[0]?.focus();
      showToast('Code sent to your email');
    } catch (e) { showToast(e.message || 'Could not send code', 'error'); }
    finally { sendBtn.disabled = false; sendBtn.textContent = 'Send code'; }
  }
  sendBtn.addEventListener('click', send);
  emailInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); send(); } });

  inputs.forEach((inp, i) => {
    inp.addEventListener('input', () => {
      inp.value = inp.value.replace(/\D/g, '').slice(0, 1);
      if (inp.value && inputs[i + 1]) inputs[i + 1].focus();
      if (i === inputs.length - 1 && inputs.every(x => x.value)) verify();
    });
    inp.addEventListener('keydown', e => { if (e.key === 'Backspace' && !inp.value && inputs[i - 1]) inputs[i - 1].focus(); });
    inp.addEventListener('paste', e => {
      const t = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
      if (t.length === 6) { e.preventDefault(); t.split('').forEach((c, j) => inputs[j] && (inputs[j].value = c)); verify(); }
    });
  });

  async function verify() {
    const code = inputs.map(i => i.value).join('');
    if (code.length !== 6) return;
    verifyBtn.disabled = true; verifyBtn.textContent = 'Verifying…';
    try {
      const res = await fetch('/api/auth-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', email: pending, code }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Invalid code');
      window._saveCustomer(pending, j.token);
      showToast('Signed in — welcome!');
      renderDashboard();
    } catch (e) {
      showToast(e.message || 'Invalid code', 'error');
      verifyBtn.disabled = false; verifyBtn.textContent = 'Verify & sign in';
      inputs.forEach(i => i.value = ''); inputs[0]?.focus();
    }
  }
  verifyBtn.addEventListener('click', verify);
  document.getElementById('resendCode').addEventListener('click', e => { e.preventDefault(); emailInput.value = pending; send(); });
  document.getElementById('backCode').addEventListener('click', e => { e.preventDefault(); document.getElementById('signStep2').style.display = 'none'; document.getElementById('signStep1').style.display = ''; emailInput.focus(); });
}

function renderDashboard() {
  const u = window.Auth.user;
  if (!u) return renderSignIn();
  ROOT().innerHTML = `
    <div class="account-page__hero">
      <div class="account-page__who">
        <div style="font-family:var(--font-display);font-weight:700;font-size:20px;">Welcome back</div>
        <div style="color:var(--muted);font-size:14px;">${u.email}</div>
      </div>
      <button class="btn" id="signOutBtn"><i data-lucide="log-out" style="width:16px;height:16px;"></i> Sign out</button>
    </div>
    <div class="account-tabs">
      <button data-tab="orders" class="${activeTab === 'orders' ? 'active' : ''}">Orders</button>
      <button data-tab="wishlist" class="${activeTab === 'wishlist' ? 'active' : ''}">Wishlist</button>
    </div>
    <div id="acctPanel"></div>`;
  window.lucide?.createIcons();
  document.getElementById('signOutBtn').addEventListener('click', () => {
    confirmModal({ title: 'Sign out?', danger: true, confirmText: 'Sign out', onConfirm: () => { stopOrdersPolling(); window.Auth.signOut(); openOrderId = null; renderSignIn(); } });
  });
  document.querySelectorAll('.account-tabs button').forEach(b => b.addEventListener('click', () => {
    activeTab = b.dataset.tab; openOrderId = null;
    document.querySelectorAll('.account-tabs button').forEach(x => x.classList.toggle('active', x.dataset.tab === activeTab));
    renderPanel();
  }));
  renderPanel();
}

function renderPanel() {
  const panel = document.getElementById('acctPanel');
  if (!panel) return;

  if (activeTab === 'wishlist') {
    stopOrdersPolling();
    const wish = JSON.parse(localStorage.getItem('dd_wishlist') || '[]');
    if (!wish.length) { panel.innerHTML = `<div class="empty-state">Wishlist is empty. Tap the heart on any product.</div>`; return; }
    panel.innerHTML = `<div class="grid">${wish.map(w => `
      <div class="card">
        <a class="card__media" href="/product?id=${w.id}"><img src="${cldOpt(w.image || '/images/placeholder.svg', 500)}" alt="${w.name}" loading="lazy"></a>
        <div class="card__body">
          <a class="card__title" href="/product?id=${w.id}">${w.name}</a>
          <div class="card__price">${Cart.money(w.price || 0)}</div>
          <a href="/product?id=${w.id}" class="card__cta">View</a>
        </div>
      </div>`).join('')}</div>`;
    return;
  }

  if (!ordersLoaded) panel.innerHTML = `<div class="empty-state"><span class="spinner"></span> Loading your orders…</div>`;
  loadOrders(true);
  stopOrdersPolling();
  ordersTimer = setInterval(() => loadOrders(false), 8000);
  watchMyOrders();
}

/* Live Firestore listener so status changes land instantly (no refresh).
   Falls back silently to the polling above if the rules block the read. */
var ordersUnsub = null;
async function watchMyOrders() {
  const u = window.Auth.user;
  if (!u || !u.email || ordersUnsub) return;
  try {
    const { db } = await initFirebase();
    ordersUnsub = db.collection('orders').where('email', '==', u.email).onSnapshot(
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => docTime(b.createdAt) - docTime(a.createdAt));
        if (!list.length && ordersCache.length) return;
        ordersCache = list; ordersLoaded = true;
        paintOrders();
      },
      () => { ordersUnsub = null; }
    );
  } catch (e) { ordersUnsub = null; }
}

async function loadOrders(showErrors) {
  const u = window.Auth.user;
  if (!u) return renderSignIn();
  try {
    let orders = null;
    if (u.token) {
      const res = await fetch('/api/my-orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: u.token }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.success) orders = j.orders || [];
      else if (j.expired) {
        stopOrdersPolling();
        showToast('Session expired — please sign in again');
        window.Auth.signOut(); return renderSignIn();
      }
    }
    // Fallback for older sessions (no token yet): read straight from Firestore.
    if (!orders) {
      const { db } = await initFirebase();
      const snap = await db.collection('orders').where('email', '==', u.email).get();
      orders = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => docTime(b.createdAt) - docTime(a.createdAt));
    }
    ordersCache = orders; ordersLoaded = true;
    paintOrders();
  } catch (e) {
    if (!ordersLoaded) {
      const panel = document.getElementById('acctPanel');
      if (panel && activeTab === 'orders') {
        panel.innerHTML = `<div class="empty-state">We couldn't reach your orders. <a href="#" id="retryOrders" style="text-decoration:underline;">Try again</a></div>`;
        document.getElementById('retryOrders')?.addEventListener('click', ev => { ev.preventDefault(); loadOrders(true); });
      }
    }
  }
}

function paintOrders() {
  const panel = document.getElementById('acctPanel');
  if (!panel || activeTab !== 'orders') return;
  if (openOrderId) {
    const o = ordersCache.find(x => x.id === openOrderId);
    if (o) return renderOrderDetail(o);
    openOrderId = null;
  }
  if (!ordersCache.length) {
    panel.innerHTML = `<div class="empty-state">No orders yet. <a href="/shop" style="text-decoration:underline;">Shop the drop →</a></div>`;
    return;
  }
  panel.innerHTML = `<div class="account-list">${ordersCache.map(o => `
    <div class="account-order" data-id="${o.id}">
      <div>
        <div class="account-order__ref">${o.reference || o.id}</div>
        <small>${fmtDate(o.createdAt)} · ${(o.items || []).length} item(s)</small>
        <div style="margin-top:6px;">${statusPill(o.status || 'pending')}</div>
      </div>
      <div class="account-order__total">${Cart.money(resolveOrderTotal(o))}</div>
    </div>`).join('')}</div>`;
  panel.querySelectorAll('.account-order').forEach(el => el.addEventListener('click', () => {
    openOrderId = el.dataset.id;
    const o = ordersCache.find(x => x.id === openOrderId);
    if (o) renderOrderDetail(o);
  }));
}

function renderOrderDetail(o) {
  const panel = document.getElementById('acctPanel');
  if (!panel) return;
  const items = (o.items || []).map(i => `
    <div class="order-detail-view__item">
      <img src="${cldOpt(i.image || i.images?.[0] || '/images/placeholder.svg', 200)}" alt="${i.name}" loading="lazy">
      <div>
        <div style="font-weight:600;">${i.name}</div>
        <div class="order-detail-view__item__meta">${[i.size ? 'Size: ' + i.size : '', i.color ? 'Color: ' + i.color : '', 'Qty: ' + (i.qty || 1)].filter(Boolean).join(' · ')}</div>
      </div>
      <div style="font-weight:700;">${Cart.money((Number(i.price) || 0) * (i.qty || 1))}</div>
    </div>`).join('');
  panel.innerHTML = `
    <div class="order-detail-view">
      <a class="back" id="backToOrders"><i data-lucide="arrow-left" style="width:14px;height:14px;"></i> Back to orders</a>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
        <div style="min-width:0;">
          <h3 style="overflow-wrap:anywhere;">Order ${o.reference || o.id}</h3>
          <div style="color:var(--muted);font-size:13px;">Placed ${fmtDate(o.createdAt)}</div>
        </div>
        ${statusPill(o.status || 'pending')}
      </div>
      <div class="order-detail-view__grid">
        <dl>
          <dt>Customer</dt><dd>${o.name || '—'}</dd>
          <dt>Email</dt><dd>${o.email || '—'}</dd>
          <dt>Phone</dt><dd>${o.phone || '—'}</dd>
        </dl>
        <dl>
          <dt>Delivery address</dt><dd>${o.address || '—'}</dd>
          <dt>City / State</dt><dd>${[o.city, o.state].filter(Boolean).join(', ') || '—'}</dd>
          <dt>Payment</dt><dd>${o.paymentMethod || '—'}</dd>
        </dl>
      </div>
      <div class="order-detail-view__items">${items || '<div class="empty-state">No items recorded.</div>'}</div>
      <div style="margin-top:14px;">
        <div class="summary-line"><span>Subtotal</span><span>${Cart.money(o.subtotal || 0)}</span></div>
        ${o.couponDiscount ? `<div class="summary-line"><span>Coupon ${o.appliedCoupon?.code ? '(' + o.appliedCoupon.code + ')' : ''}</span><span>−${Cart.money(o.couponDiscount)}</span></div>` : ''}
        ${o.fee ? `<div class="summary-line"><span>Payment fee</span><span>${Cart.money(o.fee)}</span></div>` : ''}
        <div class="summary-line total"><span>Total</span><span>${Cart.money(resolveOrderTotal(o))}</span></div>
      </div>
    </div>`;
  window.lucide?.createIcons();
  document.getElementById('backToOrders').addEventListener('click', () => { openOrderId = null; paintOrders(); });
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => { window.Auth.user ? renderDashboard() : renderSignIn(); }, 60);
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && window.Auth?.user && activeTab === 'orders') loadOrders(false);
});
