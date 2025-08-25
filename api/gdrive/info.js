// API endpoint untuk mendapatkan info Service Account (tanpa expose private key)
const { google } = require('googleapis');

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    
    if (!serviceAccountJson) {
      return res.status(500).json({ 
        ok: false, 
        error: 'GOOGLE_SERVICE_ACCOUNT_JSON environment variable not set' 
      });
    }

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(serviceAccountJson),
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    
    const client = await auth.getClient();
    const drive = google.drive({ version: 'v3', auth });
    const about = await drive.about.get({ fields: 'user' });

    res.status(200).json({
      ok: true,
      serviceAccountEmail: about.data.user?.emailAddress, // aman ditampilkan
    });
  } catch (error) {
    console.error('Service Account info error:', error);
    res.status(500).json({ 
      ok: false, 
      error: error.message || 'Failed to get Service Account info' 
    });
  }
}