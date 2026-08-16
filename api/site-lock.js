// ---------------------------------------------------------------------------
// Website lock — password endpoint.
//
// The lock password never reaches the browser. It is stored as a salted
// SHA-256 hash in the private `settingsPrivate/siteLock` document (Firestore
// rules deny all client access to it) and only ever compared here, server-side.
//
//   POST { action: 'verify',       password }               -> { ok, sessionMinutes }
//   POST { action: 'set-password', password, idToken }      -> { ok, passwordVersion }
//   POST { action: 'clear-password', idToken }              -> { ok }
//   GET  ?action=has-password                               -> { hasPassword }
// ---------------------------------------------------------------------------
const crypto = require('crypto');

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

const PRIVATE_DOC = () => fbAdmin().firestore().collection('settingsPrivate').doc('siteLock');
const PUBLIC_DOC = () => fbAdmin().firestore().collection('settings').doc('siteLock');

function hash(password, salt) {
  return crypto.createHash('sha256').update(salt + ':' + password, 'utf8').digest('hex');
}
function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Very small in-memory throttle (per warm lambda instance) to slow brute force.
const attempts = new Map();
function throttled(ip) {
  const now = Date.now();
  const rec = attempts.get(ip) || { n: 0, at: now };
  if (now - rec.at > 60000) { rec.n = 0; rec.at = now; }
  rec.n += 1;
  attempts.set(ip, rec);
  return rec.n > 12;
}

async function requireAdmin(idToken) {
  if (!idToken) throw new Error('Not signed in');
  const decoded = await fbAdmin().auth().verifyIdToken(String(idToken));
  if (!decoded || !decoded.uid) throw new Error('Not signed in');
  return decoded;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'GET') {
      const action = (req.query && req.query.action) || '';
      if (action !== 'has-password') return res.status(400).json({ error: 'Unknown action' });
      const snap = await PRIVATE_DOC().get();
      return res.status(200).json({ hasPassword: !!(snap.exists && snap.data().passwordHash) });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = body.action;

    // ---------------------------------------------------------------- verify
    if (action === 'verify') {
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
      if (throttled(ip)) return res.status(429).json({ ok: false, error: 'Too many attempts. Wait a minute.' });

      const password = String(body.password || '');
      if (!password || password.length > 200) return res.status(400).json({ ok: false, error: 'Password required' });

      const [priv, pub] = await Promise.all([PRIVATE_DOC().get(), PUBLIC_DOC().get()]);
      const data = priv.exists ? priv.data() : null;
      if (!data || !data.passwordHash || !data.salt) {
        return res.status(400).json({ ok: false, error: 'No password has been set for this lock.' });
      }
      if (!safeEqual(hash(password, data.salt), data.passwordHash)) {
        return res.status(401).json({ ok: false, error: 'That password is not right.' });
      }
      const cfg = pub.exists ? pub.data() : {};
      return res.status(200).json({ ok: true, sessionMinutes: Number(cfg.sessionMinutes) || 30 });
    }

    // ---------------------------------------------------------- set password
    if (action === 'set-password') {
      await requireAdmin(body.idToken);
      const password = String(body.password || '');
      if (password.length < 4 || password.length > 200) {
        return res.status(400).json({ ok: false, error: 'Password must be at least 4 characters.' });
      }
      const salt = crypto.randomBytes(16).toString('hex');
      const version = Date.now();
      await PRIVATE_DOC().set({
        passwordHash: hash(password, salt),
        salt,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      // Bumping the version invalidates every unlock ticket already handed out.
      await PUBLIC_DOC().set({ passwordVersion: version, hasPassword: true }, { merge: true });
      return res.status(200).json({ ok: true, passwordVersion: version });
    }

    // -------------------------------------------------------- clear password
    if (action === 'clear-password') {
      await requireAdmin(body.idToken);
      await PRIVATE_DOC().set({ passwordHash: null, salt: null, updatedAt: new Date().toISOString() }, { merge: true });
      await PUBLIC_DOC().set({ passwordVersion: Date.now(), hasPassword: false }, { merge: true });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    const msg = err && err.message ? err.message : 'Unexpected error';
    const auth = /signed in|token/i.test(msg);
    return res.status(auth ? 401 : 500).json({ ok: false, error: auth ? 'Not authorised' : msg });
  }
};
