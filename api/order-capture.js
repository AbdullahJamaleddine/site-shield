// Called by the checkout page right after Paystack's inline callback fires.
// Does the exact same work as the webhook (verify → save → reduce stock →
// emails) and is idempotent, so whichever arrives first wins and the second
// call is a no-op.
const { captureOrder } = require('./_order-service');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const payload = req.body || {};
    if (!payload.reference) return res.status(400).json({ error: 'Reference required' });

    const isFree = payload.paymentMethod === 'free-order' && Number(payload.total) <= 0;
    const result = await captureOrder(payload, {
      source: 'client',
      alreadyVerified: isFree,
    });

    if (!result.ok) return res.status(400).json({ success: false, reason: result.reason });
    return res.status(200).json({
      success: true,
      orderId: result.orderId,
      problems: result.problems,
    });
  } catch (err) {
    console.error('order-capture error', err);
    return res.status(500).json({ error: err.message });
  }
};
