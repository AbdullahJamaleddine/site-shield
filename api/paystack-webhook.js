// ---------------------------------------------------------------------------
// Paystack webhook — POST https://YOURDOMAIN/api/paystack-webhook
//
// Add that URL in your Paystack dashboard under Settings → API Keys & Webhooks
// → Webhook URL (Live and Test). Paystack signs every event with your secret
// key; we verify the signature before trusting anything.
//
// On charge.success we confirm the order immediately — even if the customer
// closed the tab right after paying — which saves the order, reduces stock and
// sends both emails exactly once.
// ---------------------------------------------------------------------------
const crypto = require('crypto');
const { captureOrder } = require('./_order-service');

// Vercel parses JSON bodies for us, but signature checks need the exact raw
// bytes, so read the stream ourselves (config is exported at the bottom).

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function validSignature(raw, signature) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha512', secret).update(raw, 'utf8').digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const handler = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let raw = '';
  try { raw = await readRawBody(req); }
  catch { return res.status(400).json({ error: 'Could not read body' }); }

  if (!validSignature(raw, req.headers['x-paystack-signature'])) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try { event = JSON.parse(raw); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  // Always ack fast — Paystack retries on anything that is not a 2xx.
  if (event.event !== 'charge.success') return res.status(200).json({ received: true, ignored: event.event });

  const data = event.data || {};
  const reference = data.reference;
  const meta = data.metadata || {};

  // The checkout page stuffs the full order into metadata.dd_order so the
  // webhook can rebuild it without the browser.
  let payload = null;
  try {
    payload = typeof meta.dd_order === 'string' ? JSON.parse(meta.dd_order) : meta.dd_order;
  } catch { payload = null; }

  if (!payload) {
    console.warn('paystack webhook: no dd_order metadata on', reference);
    return res.status(200).json({ received: true, skipped: 'no order metadata' });
  }

  try {
    const result = await captureOrder(
      { ...payload, reference: payload.reference || reference, paystackRef: reference, paymentMethod: 'paystack' },
      { source: 'webhook', alreadyVerified: true }
    );
    return res.status(200).json({ received: true, orderId: result.orderId, decremented: result.decremented });
  } catch (err) {
    console.error('paystack webhook capture failed', err);
    // 200 keeps Paystack from hammering us; the browser callback is the backup.
    return res.status(200).json({ received: true, error: err.message });
  }
};

module.exports = handler;
// Give us the untouched request body for the HMAC check.
module.exports.config = { api: { bodyParser: false } };
