// Customer sign-in: send/verify a 6-digit code via Gmail SMTP.
// Codes live in Firestore `authCodes` collection with a 10-minute expiry.
const nodemailer = require('nodemailer');
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

const transporter = () => nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

function hash(str) { return crypto.createHash('sha256').update(str).digest('hex'); }
function sessionSecret() { return process.env.AUTH_SECRET || process.env.FIREBASE_PRIVATE_KEY || 'dd-dev-secret'; }
// Signed session token: base64url(email)|expiresMs|hmac — read by /api/my-orders.
function issueToken(email) {
  const b64 = Buffer.from(email.toLowerCase().trim(), 'utf8').toString('base64url');
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const sig = crypto.createHmac('sha256', sessionSecret()).update(`${b64}|${exp}`).digest('hex');
  return `${b64}|${exp}|${sig}`;
}
function docId(email) { return hash(email.toLowerCase().trim()).slice(0, 40); }

function codeEmailHtml(code) {
  return `<!doctype html><html><body style="margin:0;background:#FAF7F2;font-family:Inter,Arial,sans-serif;color:#141414;">
    <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
      <div style="text-align:center;margin-bottom:18px;font-family:'Cabinet Grotesk',Arial,sans-serif;font-weight:800;letter-spacing:0.08em;font-size:16px;">DRIPS &amp; DROPS</div>
      <div style="background:#fff;border-radius:20px;padding:32px 28px;box-shadow:0 12px 28px rgba(20,20,20,0.06);text-align:center;">
        <h2 style="margin:0 0 8px;font-family:'Cabinet Grotesk',Arial,sans-serif;">Your sign-in code</h2>
        <p style="color:#6b6b6b;font-size:14px;margin:0 0 24px;">Enter this 6-digit code on the sign-in page. It expires in 10 minutes.</p>
        <div style="display:inline-block;background:#141414;color:#C6FF3D;padding:18px 28px;border-radius:14px;font-size:28px;font-weight:800;letter-spacing:8px;font-family:'Cabinet Grotesk',Arial,sans-serif;">${code}</div>
        <p style="color:#8f8a80;font-size:12px;margin:24px 0 0;">If you didn't request this, just ignore this email — nothing will happen.</p>
      </div>
      <div style="text-align:center;color:#8f8a80;font-size:12px;margin-top:20px;">© Drips &amp; Drops</div>
    </div></body></html>`;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { action, email, code } = req.body || {};
    if (!action || !email) return res.status(400).json({ error: 'Missing action or email' });
    if (!/\S+@\S+\.\S+/.test(email)) return res.status(400).json({ error: 'Invalid email' });

    const db = admin().firestore();
    const docRef = db.collection('authCodes').doc(docId(email));

    if (action === 'send') {
      // Simple rate limit: don't allow re-send within 30s
      const prev = await docRef.get();
      if (prev.exists) {
        const p = prev.data();
        if (p.createdAt && (Date.now() - new Date(p.createdAt).getTime()) < 30 * 1000) {
          return res.status(429).json({ error: 'Please wait a moment before requesting another code.' });
        }
      }
      const generated = String(Math.floor(100000 + Math.random() * 900000));
      await docRef.set({
        email: email.toLowerCase().trim(),
        codeHash: hash(generated),
        attempts: 0,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      try {
        await transporter().sendMail({
          from: `Drips and Drops <${process.env.EMAIL_USER}>`,
          to: email,
          subject: `Your sign-in code: ${generated}`,
          html: codeEmailHtml(generated),
        });
      } catch (e) {
        console.error('email send failed', e.message);
        return res.status(500).json({ error: 'Could not send email. Try again shortly.' });
      }
      return res.status(200).json({ success: true });
    }

    if (action === 'verify') {
      if (!code || !/^\d{6}$/.test(String(code))) return res.status(400).json({ error: 'Enter the 6-digit code.' });
      const snap = await docRef.get();
      if (!snap.exists) return res.status(400).json({ error: 'No code found. Request a new one.' });
      const data = snap.data();
      if (data.expiresAt && new Date(data.expiresAt).getTime() < Date.now()) {
        await docRef.delete().catch(() => {});
        return res.status(400).json({ error: 'Code expired. Request a new one.' });
      }
      const attempts = Number(data.attempts || 0);
      if (attempts >= 6) {
        await docRef.delete().catch(() => {});
        return res.status(429).json({ error: 'Too many attempts. Request a new code.' });
      }
      if (hash(String(code)) !== data.codeHash) {
        await docRef.update({ attempts: attempts + 1 });
        return res.status(400).json({ error: 'Wrong code. Try again.' });
      }
      await docRef.delete().catch(() => {});
      return res.status(200).json({ success: true, token: issueToken(email) });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('auth-code error', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
