// Send an order email (customer confirmation or admin notification) via Gmail
// SMTP. Templates and the emailLogs write live in api/_emails.js so the webhook
// and the checkout pipeline send exactly the same thing.
const { sendOne } = require('./_emails');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { type, order } = req.body || {};
    if (!type || !order) return res.status(400).json({ error: 'Missing type or order' });

    const result = await sendOne(type, order);
    if (!result.ok) return res.status(500).json({ error: result.error });
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('send-email error', err);
    res.status(500).json({ error: err.message });
  }
};
