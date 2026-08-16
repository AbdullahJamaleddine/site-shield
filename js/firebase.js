// Firebase initialization — uses the v9 compat SDK (loaded via <script> tags
// from the gstatic CDN in each page) so plain firebase.firestore() /
// firebase.auth() calls work without a bundler.

let _ready;

async function initFirebase() {
  if (_ready) return _ready;
  _ready = (async () => {
    const res = await fetch('/api/config?type=firebase');
    if (!res.ok) throw new Error('Failed to fetch Firebase config');
    const cfg = await res.json();
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(cfg);
    }
    return {
      app: firebase.app(),
      db: firebase.firestore(),
      // Some public pages only load Firestore. Do not call firebase.auth()
      // unless the auth compat SDK is present, otherwise review links hang.
      auth: typeof firebase.auth === 'function' ? firebase.auth() : null,
    };
  })();
  return _ready;
}

window.initFirebase = initFirebase;

// Lightweight event log — writes to Firestore `logs` collection.
window.logEvent = async function (event, data = {}) {
  try {
    const { db } = await initFirebase();
    await db.collection('logs').add({
      event,
      data,
      path: location.pathname,
      referrer: document.referrer || null,
      userAgent: navigator.userAgent,
      createdAt: new Date().toISOString(),
    });
  } catch (e) { /* swallow */ }
};

// ---------------------------------------------------------------------------
// Data helpers — resilient to documents that are missing a `createdAt` field.
// Older Firestore data (migrated / seeded by hand) often lacks createdAt, and
// a raw `.orderBy('createdAt')` query silently DROPS those docs. These helpers
// fetch everything and sort in JS instead, so nothing ever disappears.
// ---------------------------------------------------------------------------

function _ts(v) {
  if (!v) return 0;
  if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate().getTime();
  if (typeof v === 'object' && typeof v.seconds === 'number') return v.seconds * 1000;
  const t = new Date(v).getTime();
  return isNaN(t) ? 0 : t;
}
window.docTime = _ts;

function _sortDesc(list, field) {
  return list.slice().sort((a, b) => _ts(b[field]) - _ts(a[field]));
}
window.sortByCreatedDesc = (list, field = 'createdAt') => _sortDesc(list, field);

// One-shot fetch, sorted client-side (never drops docs without the field).
window.fetchCollection = async function (name, { field = 'createdAt', limit = 0 } = {}) {
  const { db } = await initFirebase();
  const snap = await db.collection(name).get();
  let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  list = _sortDesc(list, field);
  if (limit > 0) list = list.slice(0, limit);
  return list;
};

// Real-time subscription — callback fires immediately and on every change.
// Returns an unsubscribe function.
window.watchCollection = function (name, cb, { field = 'createdAt', limit = 0 } = {}) {
  let unsub = () => {};
  initFirebase().then(({ db }) => {
    unsub = db.collection(name).onSnapshot(
      snap => {
        let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list = _sortDesc(list, field);
        if (limit > 0) list = list.slice(0, limit);
        cb(list, null);
      },
      err => { console.error('watch ' + name, err); cb([], err); }
    );
  }).catch(err => cb([], err));
  return () => unsub();
};

// Real-time subscription to a single document.
window.watchDoc = function (name, id, cb) {
  let unsub = () => {};
  initFirebase().then(({ db }) => {
    unsub = db.collection(name).doc(id).onSnapshot(
      doc => cb(doc.exists ? { id: doc.id, ...doc.data() } : null, null),
      err => { console.error('watchDoc ' + name, err); cb(null, err); }
    );
  }).catch(err => cb(null, err));
  return () => unsub();
};

// ---------------------------------------------------------------------------
// Order totals — historical orders were written by several checkout versions,
// so the payable amount lives under different keys. Always resolve it here.
// ---------------------------------------------------------------------------
window.resolveOrderTotal = function (o) {
  if (!o) return 0;
  const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
  if (n(o.total) > 0) return n(o.total);
  if (n(o.customerTotal) > 0) return n(o.customerTotal);
  if (n(o.amount) > 0) return n(o.amount);
  const sub = n(o.subtotal) || n(o.originalSubtotal);
  return Math.max(0, sub - n(o.couponDiscount)) + n(o.fee) + n(o.delivery);
};

// ---------------------------------------------------------------------------
// Stock helpers
// Products have been written by a few different admin versions, so the stock
// count can live under `stock` OR `quantity`. Always resolve BOTH so reads and
// writes stay consistent (this is why checkout used to appear not to decrement:
// it read `stock`, got 0 on a `quantity`-only doc, and wrote stock: 0).
// ---------------------------------------------------------------------------
window.stockFields = function (data) {
  const d = data || {};
  const fields = [];
  if (Object.prototype.hasOwnProperty.call(d, 'stock')) fields.push('stock');
  if (Object.prototype.hasOwnProperty.call(d, 'quantity')) fields.push('quantity');
  return fields.length ? fields : ['stock'];
};

window.readStock = function (data) {
  const d = data || {};
  const raw = d.stock ?? d.quantity ?? 0;
  const n = Number(raw);
  return isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

window.isSellable = function (data) {
  return !!data && data.active !== false && window.readStock(data) > 0;
};

// Expand a cart into { productId: qtyNeeded }. Combos consume one unit of every
// product they contain, per combo purchased.
window.expandCartToUnits = async function (items) {
  const { db } = await initFirebase();
  const need = {};
  const labels = {};
  for (const item of items || []) {
    const rawId = String(item.id || '');
    const qty = Math.max(1, Number(item.qty || 1) || 1);
    if (rawId.startsWith('combo:')) {
      const comboId = rawId.slice(6);
      let ids = Array.isArray(item.comboItems) ? item.comboItems.map(x => x.id) : [];
      if (!ids.length) {
        try {
          const c = await db.collection('combos').doc(comboId).get();
          ids = (c.exists && Array.isArray(c.data().productIds)) ? c.data().productIds : [];
        } catch { ids = []; }
      }
      ids.filter(Boolean).forEach(pid => {
        need[pid] = (need[pid] || 0) + qty;
        labels[pid] = labels[pid] || item.name;
      });
    } else if (rawId) {
      need[rawId] = (need[rawId] || 0) + qty;
      labels[rawId] = labels[rawId] || item.name;
    }
  }
  return { need, labels };
};

// Read-only availability check. Returns { ok, problems: [{ id, name, need, have }] }
window.checkStockAvailability = async function (items) {
  const { db } = await initFirebase();
  const { need, labels } = await window.expandCartToUnits(items);
  const ids = Object.keys(need);
  if (!ids.length) return { ok: false, problems: [{ id: null, name: 'Cart', need: 0, have: 0 }] };

  const problems = [];
  await Promise.all(ids.map(async (id) => {
    let snap;
    try { snap = await db.collection('products').doc(id).get(); }
    catch { problems.push({ id, name: labels[id] || 'Item', need: need[id], have: 0, reason: 'unreadable' }); return; }
    if (!snap.exists) { problems.push({ id, name: labels[id] || 'Item', need: need[id], have: 0, reason: 'missing' }); return; }
    const data = snap.data();
    const have = window.readStock(data);
    if (data.active === false) { problems.push({ id, name: data.name || labels[id], need: need[id], have, reason: 'inactive' }); return; }
    if (have < need[id]) problems.push({ id, name: data.name || labels[id], need: need[id], have, reason: 'insufficient' });
  }));
  return { ok: problems.length === 0, problems };
};

// Atomic decrement. Runs inside a Firestore transaction so two shoppers can
// never oversell the same unit. Returns { ok, problems }.
window.decrementStock = async function (items) {
  const { db } = await initFirebase();
  const { need, labels } = await window.expandCartToUnits(items);
  const ids = Object.keys(need);
  if (!ids.length) return { ok: true, problems: [] };

  const problems = [];
  try {
    await db.runTransaction(async (tx) => {
      const refs = ids.map(id => db.collection('products').doc(id));
      const snaps = await Promise.all(refs.map(r => tx.get(r)));
      const writes = [];
      snaps.forEach((snap, i) => {
        const id = ids[i];
        if (!snap.exists) { problems.push({ id, name: labels[id] || 'Item', need: need[id], have: 0, reason: 'missing' }); return; }
        const data = snap.data();
        const have = window.readStock(data);
        if (have < need[id]) problems.push({ id, name: data.name || labels[id], need: need[id], have, reason: 'insufficient' });
        const next = Math.max(0, have - need[id]);
        const payload = { updatedAt: new Date().toISOString() };
        window.stockFields(data).forEach(f => { payload[f] = next; });
        // Auto-retire a product once it hits zero so it stops being orderable.
        if (next === 0) payload.soldOutAt = new Date().toISOString();
        writes.push([refs[i], payload]);
      });
      writes.forEach(([ref, payload]) => tx.update(ref, payload));
    });
  } catch (err) {
    console.error('stock decrement failed', err);
    return { ok: false, problems: problems.length ? problems : [{ id: null, name: 'Stock', reason: 'error' }] };
  }
  return { ok: problems.length === 0, problems };
};
