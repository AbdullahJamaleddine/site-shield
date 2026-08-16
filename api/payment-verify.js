// Thin wrapper around the shared Paystack verification used by the order
// pipeline. Kept for anything that just needs a yes/no on a reference.
const { verifyWithPaystack } = require('./_order-service');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { reference } = req.body || {};
    if (!reference) return res.status(400).json({ error: 'Reference required' });

    const { ok, data } = await verifyWithPaystack(reference);
    if (ok) return res.status(200).json({ success: true, data });
    return res.status(400).json({ success: false, message: 'Payment not successful' });
  } catch (error) {
    console.error('Payment verify error:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Verification failed' });
  }
};
