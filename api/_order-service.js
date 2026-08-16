// ---------------------------------------------------------------------------
// Shared server-side order pipeline.
//
// Everything that must happen exactly once after a successful payment lives
// here: save the order, decrement stock, log coupon usage, upsert the customer
// and send the two emails.
//
// It runs with the Firebase Admin SDK (which bypasses Firestore rules), inside
// a transaction, and it is idempotent — keyed on the order reference. That means
// the browser callback AND the Paystack webhook can both call it and the stock
// is still only ever reduced once.
// ---------------------------------------------------------------------------
const axios = require('axios');

let inited = false;
function fbAdmin() {
  const a = require('firebase-admin');
  if (!inited && !a.apps.length) {
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
      throw new Error('Firebase admin credentials not configured');
    }
    a.initializeApp({
      credential: a.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });
  }
  inited = true;
  return a;
}

function db() { return fbAdmin().firestore(); }

// Firestore doc ids cannot contain "/" — references are ORD-… so this is a no-op
// in practice, but stay safe.
function orderDocId(reference) {
  return String(reference || '').replace(/[^\w.-]/g, '_').slice(0, 120);
}

function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }

// Products have been written by several admin versions, so the count can live
// under `stock` OR `quantity`. Read and write both consistently.
function readStock(data) {
  const raw = (data || {}).stock ?? (data || {}).quantity ?? 0;
  const n = Number(raw);
  return isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function stockFields(data) {
  const d = data || {};
  const fields = [];
  if (Object.prototype.hasOwnProperty.call(d, 'stock')) fields.push('stock');
  if (Object.prototype.hasOwnProperty.call(d, 'quantity')) fields.push('quantity');
  return fields.length ? fields : ['stock'];
}

// Turn a cart into { productId: unitsNeeded }. A combo consumes one unit of
// every product inside it, per combo bought.
async function expandCartToUnits(items) {
  const need = {};
  const labels = {};
  for (const item of items || []) {
    const rawId = String(item.id || '');
    const qty = Math.max(1, num(item.qty) || 1);
    if (rawId.startsWith('combo:')) {
      let ids = Array.isArray(item.comboItems) ? item.comboItems.map(x => x && x.id).filter(Boolean) : [];
      if (!ids.length) {
        try {
          const c = await db().collection('combos').doc(rawId.slice(6)).get();
          ids = (c.exists && Array.isArray(c.data().productIds)) ? c.data().productIds : [];
        } catch { ids = []; }
      }
      ids.forEach(pid => {
        need[pid] = (need[pid] || 0) + qty;
        labels[pid] = labels[pid] || item.name;
      });
    } else if (rawId) {
      need[rawId] = (need[rawId] || 0) + qty;
      labels[rawId] = labels[rawId] || item.name;
    }
  }
  return { need, labels };
}

async function verifyWithPaystack(reference) {
  const res = await axios.get(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
  );
  const ok = !!(res.data && res.data.status && res.data.data && res.data.data.status === 'success');
  return { ok, data: (res.data && res.data.data) || null };
}

// ---------------------------------------------------------------------------
// captureOrder — the single entry point. Safe to call twice.
// ---------------------------------------------------------------------------
async function captureOrder(payload, { source = 'client', alreadyVerified = false } = {}) {
  const reference = String(payload.reference || payload.paystackRef || '').trim();
  if (!reference) throw new Error('Missing order reference');

  const paymentMethod = payload.paymentMethod || 'paystack';
  const paystackRef = payload.paystackRef || reference;

  // 1. Confirm the money actually arrived (skipped for webhook events, which are
  //    already signature-verified, and for zero-total free orders).
  let verified = null;
  if (paymentMethod === 'paystack' && !alreadyVerified) {
    const v = await verifyWithPaystack(paystackRef);
    if (!v.ok) return { ok: false, reason: 'payment_not_verified' };
    verified = v.data;
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  const { need, labels } = await expandCartToUnits(items);
  const ids = Object.keys(need);

  const docRef = db().collection('orders').doc(orderDocId(reference));
  const now = new Date().toISOString();

  const baseOrder = {
    name: payload.name || '',
    phone: payload.phone || '',
    email: payload.email || '',
    address: payload.address || '',
    city: payload.city || '',
    state: payload.state || '',
    items,
    subtotal: num(payload.subtotal),
    originalSubtotal: num(payload.originalSubtotal || payload.subtotal),
    couponDiscount: num(payload.couponDiscount),
    appliedCoupon: payload.appliedCoupon || null,
    fee: num(payload.fee),
    total: num(payload.total) || (verified ? num(verified.amount) / 100 : 0),
    customerTotal: num(payload.total),
    costTotal: num(payload.costTotal),
    profit: Math.max(0, (num(payload.subtotal) - num(payload.couponDiscount)) - num(payload.costTotal)),
    reference,
    paystackRef,
    paymentMethod,
    status: 'paid',
    confirmedBy: source,
    paidAt: payload.paidAt || now,
    updatedAt: now,
  };

  // 2. Write the order and reduce stock in ONE transaction, guarded by the
  //    stockDecremented flag so a webhook + browser double-call cannot double
  //    reduce the same units.
  const problems = [];
  let created = false;
  let decremented = false;

  await db().runTransaction(async (tx) => {
    const orderSnap = await tx.get(docRef);
    const existing = orderSnap.exists ? orderSnap.data() : null;
    const needsStock = !(existing && existing.stockDecremented === true);

    // All reads before any write — Firestore transaction requirement.
    const productRefs = needsStock ? ids.map(id => db().collection('products').doc(id)) : [];
    const productSnaps = productRefs.length ? await tx.getAll(...productRefs) : [];

    if (!orderSnap.exists) {
      created = true;
      tx.set(docRef, { ...baseOrder, createdAt: payload.createdAt || now, stockDecremented: needsStock });
    } else {
      tx.set(docRef, {
        ...baseOrder,
        createdAt: existing.createdAt || now,
        stockDecremented: existing.stockDecremented === true ? true : needsStock,
      }, { merge: true });
    }

    if (needsStock) {
      productSnaps.forEach((snap, i) => {
        const id = ids[i];
        if (!snap.exists) {
          problems.push({ id, name: labels[id] || 'Item', need: need[id], have: 0, reason: 'missing' });
          return;
        }
        const data = snap.data();
        const have = readStock(data);
        if (have < need[id]) {
          problems.push({ id, name: data.name || labels[id] || 'Item', need: need[id], have, reason: 'insufficient' });
        }
        const next = Math.max(0, have - need[id]);
        const update = { updatedAt: now };
        stockFields(data).forEach(f => { update[f] = next; });
        if (next === 0) update.soldOutAt = now;
        tx.update(productRefs[i], update);
      });
      decremented = true;
    }
  });

  if (problems.length) {
    await docRef.update({ stockWarning: true, stockProblems: problems, updatedAt: now }).catch(() => {});
  }

  // 3. One-off side effects, each guarded by its own flag.
  const snap = await docRef.get();
  const order = { id: docRef.id, ...(snap.data() || {}) };

  if (order.appliedCoupon && order.appliedCoupon.id && !order.couponLogged) {
    try {
      await db().collection('coupons').doc(order.appliedCoupon.id).update({
        usageLog: fbAdmin().firestore.FieldValue.arrayUnion({
          customerEmail: order.email, customerName: order.name,
          date: now, discount: num(order.couponDiscount),
          orderId: docRef.id, orderRef: reference,
        }),
        updatedAt: now,
      });
      await docRef.update({ couponLogged: true });
    } catch (e) { console.warn('coupon log failed', e.message); }
  }

  if (!order.customerLogged && order.email) {
    try {
      const q = await db().collection('customers').where('email', '==', order.email).limit(1).get();
      if (q.empty) {
        await db().collection('customers').add({
          name: order.name, phone: order.phone, email: order.email,
          address: order.address, city: order.city, state: order.state,
          totalSpent: num(order.total), orderCount: 1,
          firstOrderAt: now, lastOrderAt: now, createdAt: now, updatedAt: now,
        });
      } else {
        const c = q.docs[0]; const prev = c.data() || {};
        await c.ref.update({
          totalSpent: num(prev.totalSpent) + num(order.total),
          orderCount: num(prev.orderCount) + 1,
          lastOrderAt: now, updatedAt: now,
        });
      }
      await docRef.update({ customerLogged: true });
    } catch (e) { console.warn('customer upsert failed', e.message); }
  }

  if (!order.emailsSent) {
    try {
      const { sendOrderEmails } = require('./_emails');
      await sendOrderEmails(order);
      await docRef.update({ emailsSent: true });
    } catch (e) { console.warn('order emails failed', e.message); }
  }

  return { ok: true, orderId: docRef.id, order, created, decremented, problems };
}

module.exports = {
  fbAdmin, db, captureOrder, verifyWithPaystack,
  readStock, stockFields, expandCartToUnits, orderDocId,
};
