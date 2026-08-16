// Unified public-config endpoint. Everything returned here is safe to expose
// to the browser (no secret keys). Usage: GET /api/config?type=firebase|cloudinary|paystack
module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const type = (req.query && req.query.type) || '';
  res.setHeader('Cache-Control', 'public, max-age=300');

  switch (type) {
    case 'firebase':
      return res.status(200).json({
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID,
      });
    case 'cloudinary':
      return res.status(200).json({
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET,
      });
    case 'paystack':
      if (!process.env.PAYSTACK_PUBLIC_KEY) return res.status(500).json({ error: 'Paystack key not configured' });
      return res.status(200).json({ publicKey: process.env.PAYSTACK_PUBLIC_KEY });
    default:
      return res.status(400).json({ error: 'Unknown config type. Use ?type=firebase|cloudinary|paystack' });
  }
};
