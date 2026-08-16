// Returns the signed-in customer's orders. The customer proves ownership of the
// email with the session token issued by /api/auth-code (action: verify).
// Orders stay admin-only in Firestore rules — this endpoint is the only way a
// customer can read their own orders.
const crypto = require('crypto');

let adminInited = false;
function admin() {
  const a = require('firebase-admin');
  if (!adminInited && !a.apps.length) {
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
  adminInited = true;
  return a;
}

function secret() {
  return process.env.AUTH_SECRET || process.env.FIREBASE_PRIVATE_KEY || 'dd-dev-secret';
}

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('hex');
}

// token format: base64url(email)|expiresMs|hmac
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('|');
  if (parts.length !== 3) return null;
  const [b64, exp, sig] = parts;
  const expected = sign(`${b64}|${exp}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  try { return Buffer.from(b64, 'base64url').toString('utf8'); } catch { return null; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { token } = req.body || {};
    const email = verifyToken(token);
    if (!email) return res.status(401).json({ error: 'Session expired. Please sign in again.', expired: true });

    const db = admin().firestore();
    const snap = await db.collection('orders').where('email', '==', email).get();
    const orders = snap.docs.map(d => {
      const o = d.data() || {};
      // Only fields the customer needs — no internal cost/profit data.
      return {
        id: d.id,
        reference: o.reference || '',
        status: o.status || 'pending',
        createdAt: o.createdAt || null,
        paidAt: o.paidAt || null,
        items: (o.items || []).map(i => ({
          name: i.name, price: i.price, qty: i.qty, size: i.size || '',
          color: i.color || '', image: i.image || (i.images && i.images[0]) || '',
        })),
        subtotal: o.subtotal || 0,
        couponDiscount: o.couponDiscount || 0,
        appliedCoupon: o.appliedCoupon ? { code: o.appliedCoupon.code } : null,
        fee: o.fee || 0,
        total: o.total || 0,
        name: o.name || '', email: o.email || '', phone: o.phone || '',
        address: o.address || '', city: o.city || '', state: o.state || '',
        paymentMethod: o.paymentMethod || '',
        trackingNote: o.trackingNote || '',
      };
    }).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    return res.status(200).json({ success: true, orders });
  } catch (err) {
    console.error('my-orders error', err);
    return res.status(500).json({ error: 'Could not load orders right now.' });
  }
};
