let cartSnapshot = Cart.get().items;
let appliedCoupon = null;

function computeCouponDiscount(coupon, subtotal) {
  if (!coupon) return 0;
  const type = coupon.type || (coupon.percent ? 'percent' : 'fixed');
  let d = 0;
  if (type === 'percent') d = Math.round(subtotal * (Number(coupon.value || coupon.percent || 0) / 100));
  else d = Number(coupon.value || coupon.amount || 0);
  return Math.max(0, Math.min(d, subtotal));
}

function renderSummary() {
  const itemsEl = document.getElementById('checkoutItems');
  if (!cartSnapshot.length) {
    document.getElementById('checkoutPage').innerHTML =
      `<div class="empty-state" style="grid-column:1/-1;padding:60px 0;">Your cart is empty. <a href="/shop" style="text-decoration:underline;">Go shop the drop →</a></div>`;
    return false;
  }
  itemsEl.innerHTML = cartSnapshot.map(item => `
    <div class="checkout-item">
      <div>
        <div>${item.name} × ${item.qty}</div>
        <div class="checkout-item__meta">${[item.size ? 'Size: ' + item.size : '', item.color ? 'Color: ' + item.color : ''].filter(Boolean).join(' · ')}</div>
      </div>
      <div>${Cart.money(item.price * item.qty)}</div>
    </div>
  `).join('');
  const subtotal = cartSnapshot.reduce((s, i) => s + i.price * i.qty, 0);
  const discount = computeCouponDiscount(appliedCoupon, subtotal);
  const discounted = subtotal - discount;
  const fee = Cart.fee(discounted);
  const total = discounted + fee;
  document.getElementById('sumSubtotal').textContent = Cart.money(subtotal);
  const dLine = document.getElementById('sumDiscountLine');
  if (dLine) {
    if (discount > 0 && appliedCoupon) {
      dLine.style.display = '';
      document.getElementById('sumDiscountLabel').textContent = `Discount (${appliedCoupon.code})`;
      document.getElementById('sumDiscount').textContent = '−' + Cart.money(discount);
    } else { dLine.style.display = 'none'; }
  }
  document.getElementById('sumFee').textContent = Cart.money(fee);
  document.getElementById('sumTotal').textContent = Cart.money(total);
  return true;
}

function stockProblemMessage(problems) {
  const first = (problems || [])[0];
  if (!first) return 'Some items in your bag are no longer available.';
  if (first.reason === 'missing') return `"${first.name}" is no longer available. Please remove it from your bag.`;
  if (first.reason === 'inactive') return `"${first.name}" has been taken down. Please remove it from your bag.`;
  if (first.have <= 0) return `"${first.name}" just sold out. Please remove it from your bag.`;
  return `Only ${first.have} left of "${first.name}" — please reduce the quantity.`;
}

// Blocks checkout whenever the bag asks for more units than actually exist.
async function guardStock(payBtn) {
  const original = payBtn.textContent;
  payBtn.disabled = true;
  payBtn.textContent = 'Checking stock…';
  try {
    const { ok, problems } = await checkStockAvailability(cartSnapshot);
    if (!ok) {
      showToast(stockProblemMessage(problems), 'error');
      renderStockNotice(problems);
      payBtn.disabled = false;
      payBtn.textContent = original;
      return false;
    }
    renderStockNotice([]);
    return true;
  } catch (err) {
    console.error('stock check failed', err);
    showToast('Could not confirm stock right now. Please try again.', 'error');
    payBtn.disabled = false;
    payBtn.textContent = original;
    return false;
  }
}

function renderStockNotice(problems) {
  let box = document.getElementById('stockNotice');
  if (!problems || !problems.length) { if (box) box.remove(); return; }
  if (!box) {
    box = document.createElement('div');
    box.id = 'stockNotice';
    box.className = 'coupon-msg err';
    box.style.cssText = 'margin:12px 0;padding:12px 14px;border-radius:12px;background:rgba(230,57,70,0.08);border:1px solid rgba(230,57,70,0.24);font-size:13px;line-height:1.5;';
    const items = document.getElementById('checkoutItems');
    items?.parentNode?.insertBefore(box, items.nextSibling);
  }
  box.innerHTML = '<b>Stock changed while you were shopping:</b><ul style="margin:8px 0 0;padding-left:18px;">' +
    problems.map(p => `<li>${p.name} — ${p.have > 0 ? `only ${p.have} left (you asked for ${p.need})` : 'sold out'}</li>`).join('') +
    '</ul><div style="margin-top:8px;">Update your bag to continue.</div>';
}

async function loadPaystackScript() {
  if (window.PaystackPop) return;
  await new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = 'https://js.paystack.co/v1/inline.js';
    tag.onload = resolve; tag.onerror = reject;
    document.head.appendChild(tag);
  });
}

async function applyCouponCode(rawCode) {
  const code = (rawCode || '').trim().toUpperCase();
  const msg = document.getElementById('couponMsg');
  if (!code) { msg.textContent = ''; return; }
  msg.textContent = 'Checking…';
  const { db } = await initFirebase();
  const snap = await db.collection('coupons').where('code', '==', code).limit(1).get();
  if (snap.empty) { msg.textContent = 'Invalid coupon code'; msg.className = 'coupon-msg err'; appliedCoupon = null; renderSummary(); return; }
  const doc = snap.docs[0]; const c = { id: doc.id, ...doc.data() };
  if (c.isActive === false || c.active === false) { msg.textContent = 'This coupon is not active'; msg.className = 'coupon-msg err'; appliedCoupon = null; renderSummary(); return; }
  if (c.expiryDate && new Date(c.expiryDate) < new Date()) { msg.textContent = 'This coupon has expired'; msg.className = 'coupon-msg err'; appliedCoupon = null; renderSummary(); return; }
  const usedCount = Array.isArray(c.usageLog) ? c.usageLog.length : (c.uses || c.usedCount || 0);
  if (c.maxUses && usedCount >= Number(c.maxUses)) { msg.textContent = 'Coupon usage limit reached'; msg.className = 'coupon-msg err'; appliedCoupon = null; renderSummary(); return; }
  const subtotal = cartSnapshot.reduce((s, i) => s + i.price * i.qty, 0);
  if (c.minOrderAmount && subtotal < Number(c.minOrderAmount)) { msg.textContent = `Minimum order ₦${Number(c.minOrderAmount).toLocaleString()}`; msg.className = 'coupon-msg err'; appliedCoupon = null; renderSummary(); return; }
  if (Array.isArray(c.productIds) && c.productIds.length) {
    const cartIds = cartSnapshot.map(i => String(i.id).replace(/^combo:/, ''));
    if (!cartIds.some(id => c.productIds.includes(id))) { msg.textContent = 'Coupon not valid for these items'; msg.className = 'coupon-msg err'; appliedCoupon = null; renderSummary(); return; }
  }
  appliedCoupon = c;
  const discount = computeCouponDiscount(c, subtotal);
  msg.textContent = `Applied — you saved ${Cart.money(discount)}`;
  msg.className = 'coupon-msg ok';
  renderSummary();
}

document.addEventListener('DOMContentLoaded', () => {
  const hasItems = renderSummary();
  if (!hasItems) return;

  const applyBtn = document.getElementById('applyCouponBtn');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => applyCouponCode(document.getElementById('couponCode').value));
    document.getElementById('couponCode').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); applyCouponCode(document.getElementById('couponCode').value); }
    });
    document.getElementById('couponCode').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });
  }

  document.getElementById('payBtn').addEventListener('click', async () => {
    const form = document.getElementById('checkoutForm');
    const payBtn = document.getElementById('payBtn');
    const customer = {
      name: document.getElementById('cName').value.trim(),
      phone: document.getElementById('cPhone').value.trim(),
      email: document.getElementById('cEmail').value.trim(),
      address: document.getElementById('cAddress').value.trim(),
      city: document.getElementById('cCity').value.trim(),
      state: document.getElementById('cState').value.trim(),
    };
    if (Object.values(customer).some(v => !v) || !/\S+@\S+\.\S+/.test(customer.email)) {
      showToast('Please fill in every delivery field', 'error');
      form.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    const subtotal = cartSnapshot.reduce((s, i) => s + i.price * i.qty, 0);
    const discount = computeCouponDiscount(appliedCoupon, subtotal);
    const discounted = subtotal - discount;
    const fee = Cart.fee(discounted);
    const total = discounted + fee;
    const reference = 'ORD-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();

    // Never let a customer pay for units we don't have.
    if (!(await guardStock(payBtn))) return;

    if (total <= 0) {
      payBtn.disabled = true;
      payBtn.textContent = 'Processing free order…';
      await finishOrder(customer, subtotal, discount, fee, total, reference, reference, payBtn, 'free-order');
      return;
    }

    payBtn.disabled = true;
    payBtn.textContent = 'Loading…';

    let paystackPublicKey;
    try {
      const cfgRes = await fetch('/api/config?type=paystack');
      const cfg = await cfgRes.json();
      paystackPublicKey = cfg.publicKey;
      await loadPaystackScript();
    } catch {
      showToast('Could not load payment gateway', 'error');
      payBtn.disabled = false; payBtn.textContent = 'Pay now';
      return;
    }

    payBtn.textContent = 'Opening payment…';
    const handler = window.PaystackPop.setup({
      key: paystackPublicKey,
      email: customer.email,
      amount: Math.round(total * 100),
      currency: 'NGN',
      ref: reference,
      metadata: {
        custom_fields: [
          { display_name: 'Customer Name', variable_name: 'customer_name', value: customer.name },
          { display_name: 'Phone', variable_name: 'phone', value: customer.phone },
          { display_name: 'Delivery Address', variable_name: 'address', value: `${customer.address}, ${customer.city}, ${customer.state}` },
        ],
        // The whole order travels with the payment, so the Paystack webhook can
        // confirm it, reduce stock and email the receipt even if this browser
        // tab is closed the second the payment goes through.
        dd_order: JSON.stringify(buildOrderPayload(customer, subtotal, discount, fee, total, reference, reference)),
      },
      onClose: () => { payBtn.disabled = false; payBtn.textContent = 'Pay now'; },
      callback: (response) => {
        payBtn.textContent = 'Verifying payment…';
        finishOrder(customer, subtotal, discount, fee, total, reference, response.reference, payBtn);
      },
    });
    handler.openIframe();
  });
});

// Compact, server-verifiable description of the order. Used both as Paystack
// metadata (for the webhook) and as the body of /api/order-capture.
function buildOrderPayload(customer, subtotal, couponDiscount, fee, total, reference, paystackRef, paymentMethod = 'paystack', items = null) {
  return {
    ...customer,
    items: (items || cartSnapshot).map(i => ({
      id: i.id,
      name: i.name,
      price: Number(i.price) || 0,
      qty: Number(i.qty) || 1,
      size: i.size || null,
      color: i.color || null,
      image: i.image || '',
      costPrice: Number(i.costPrice) || 0,
      comboItems: Array.isArray(i.comboItems) ? i.comboItems.map(c => ({ id: c.id, name: c.name })) : null,
    })),
    subtotal, originalSubtotal: subtotal,
    couponDiscount, fee, total,
    appliedCoupon: appliedCoupon
      ? { code: appliedCoupon.code, id: appliedCoupon.id, type: appliedCoupon.type, value: appliedCoupon.value, discount: couponDiscount }
      : null,
    reference, paystackRef, paymentMethod,
  };
}

async function finishOrder(customer, subtotal, couponDiscount, fee, total, reference, paystackRef, payBtn, paymentMethod = 'paystack') {
  // ------------------------------------------------------------------
  // Everything after payment now runs on the server (/api/order-capture),
  // with the Firebase Admin SDK: verify with Paystack, save the order,
  // reduce stock inside a transaction, log the coupon, upsert the customer
  // and send both emails. It is keyed on the order reference and idempotent,
  // so the Paystack webhook doing the same job never double-counts stock.
  // ------------------------------------------------------------------
  payBtn.textContent = 'Confirming payment…';

  // Snapshot cost prices so profit reporting stays accurate if prices change.
  let itemsWithCost = cartSnapshot.map(i => ({ ...i }));
  let costTotal = 0;
  try {
    const { db } = await initFirebase();
    itemsWithCost = await Promise.all(cartSnapshot.map(async (i) => {
      const productId = String(i.id).replace(/^combo:/, '');
      let costPrice = Number(i.costPrice) || 0;
      if (!costPrice) {
        try {
          const d = await db.collection('products').doc(productId).get();
          if (d.exists) costPrice = Number(d.data().costPrice) || 0;
        } catch {}
      }
      costTotal += costPrice * (i.qty || 1);
      return { ...i, costPrice };
    }));
  } catch {}

  const payload = {
    ...buildOrderPayload(customer, subtotal, couponDiscount, fee, total, reference, paystackRef, paymentMethod, itemsWithCost),
    costTotal,
  };

  let orderId = null;
  let captured = false;
  try {
    const res = await fetch('/api/order-capture', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.success) {
      captured = true;
      orderId = json.orderId || null;
    } else if (json.reason === 'payment_not_verified') {
      showToast('Payment could not be verified. Contact support with ref ' + reference, 'error');
      payBtn.disabled = false; payBtn.textContent = 'Pay now';
      return;
    } else {
      console.error('order capture failed', json);
    }
  } catch (err) {
    console.error('order capture request failed', err);
  }

  // Fallback: if the server pipeline is unreachable, write the order from the
  // browser so nothing is lost. The webhook will still reconcile stock.
  if (!captured) {
    orderId = await saveOrderFromBrowser(payload);
  }

  if (window.logEvent) window.logEvent('order_placed', { reference, total, orderId });

  Cart.clear();
  document.getElementById('successRef').textContent = reference;
  document.getElementById('successModal').classList.add('open');
  payBtn.disabled = false; payBtn.textContent = 'Pay now';
}

// Last-resort client write. Only runs when /api/order-capture could not be
// reached at all — the order still lands in Firestore and stock is reduced.
async function saveOrderFromBrowser(payload) {
  const now = new Date().toISOString();
  const orderData = {
    ...payload,
    profit: Math.max(0, (payload.subtotal - payload.couponDiscount) - (payload.costTotal || 0)),
    customerTotal: payload.total,
    status: 'paid',
    confirmedBy: 'browser-fallback',
    paidAt: now, createdAt: now, updatedAt: now,
  };
  try {
    const { db } = await initFirebase();
    const ref = db.collection('orders').doc(String(payload.reference).replace(/[^\w.-]/g, '_'));
    const existing = await ref.get();
    if (existing.exists && existing.data().stockDecremented) return ref.id;
    await ref.set({ ...orderData, stockDecremented: true }, { merge: true });
    try {
      const result = await decrementStock(payload.items);
      if (!result.ok) {
        await ref.update({ stockWarning: true, stockProblems: result.problems, updatedAt: now }).catch(() => {});
      }
    } catch (err) { console.error('stock decrement failed', err); }

    fetch('/api/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'customer_confirmation', order: { ...orderData, id: ref.id } }) }).catch(() => {});
    fetch('/api/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'admin_notification', order: { ...orderData, id: ref.id } }) }).catch(() => {});
    return ref.id;
  } catch (err) {
    console.error('order save failed', err);
    showToast('Payment went through but we could not save the order. Contact support with ref ' + payload.reference, 'error');
    return null;
  }
}
