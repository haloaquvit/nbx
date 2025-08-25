// API endpoint untuk test koneksi Google Drive dengan folder ID
const { google } = require('googleapis');
const { Readable } = require('stream');

export const config = { 
  api: { 
    bodyParser: true 
  } 
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { folderId } = req.body;
    
    if (!folderId) {
      return res.status(400).json({ ok: false, error: 'folderId required' });
    }

    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    
    if (!serviceAccountJson) {
      return res.status(500).json({ 
        ok: false, 
        error: 'GOOGLE_SERVICE_ACCOUNT_JSON environment variable not set' 
      });
    }

    // Clean folder ID (remove URL parts if present)
    const cleanFolderId = String(folderId).trim()
      .replace(/^https?:\/\/drive\.google\.com\/drive\/folders\//, '')
      .replace(/\?.*$/, '');

    console.log(`🔍 Testing folder access: ${cleanFolderId}`);

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(serviceAccountJson),
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    
    const drive = google.drive({ version: 'v3', auth });

    // 1) Cek akses folder
    try {
      const folderInfo = await drive.files.get({ 
        fileId: cleanFolderId, 
        fields: 'id,name,permissions' 
      });
      console.log(`✅ Folder access OK: ${folderInfo.data.name} (${folderInfo.data.id})`);
    } catch (folderError) {
      console.error(`❌ Folder access failed: ${folderError.message}`);
      if (folderError.code === 404) {
        throw new Error(`Folder ID tidak ditemukan: ${cleanFolderId}. Pastikan folder ID benar dan sudah di-share ke Service Account.`);
      } else if (folderError.code === 403) {
        throw new Error(`Tidak ada akses ke folder ${cleanFolderId}. Pastikan folder sudah di-share ke Service Account dengan permission Editor.`);
      }
      throw folderError;
    }

    // 2) Buat file test dari buffer
    const content = Buffer.from('Service Account test OK ' + new Date().toISOString(), 'utf8');
    const testFileName = `test-${Date.now()}.txt`;

    console.log(`📤 Uploading test file: ${testFileName}`);

    const upload = await drive.files.create({
      requestBody: { 
        name: testFileName, 
        parents: [cleanFolderId] // WAJIB - mencegah 403 "no storage quota"
      }, 
      media: { 
        mimeType: 'text/plain', 
        body: Readable.from(content)
      },
      fields: 'id,name,parents,webViewLink',
    });

    console.log(`✅ Test file uploaded: ${upload.data.id}`);

    // 3) Set public permissions (opsional)
    try {
      await drive.permissions.create({
        fileId: upload.data.id,
        requestBody: { role: 'reader', type: 'anyone' },
      });
      console.log(`🔓 Test file made public: ${upload.data.webViewLink}`);
    } catch (permError) {
      console.warn('⚠️ Failed to make test file public:', permError.message);
    }

    // 4) Delete test file (cleanup)
    try {
      await drive.files.delete({ fileId: upload.data.id });
      console.log('🗑️ Test file deleted');
    } catch (deleteError) {
      console.warn('⚠️ Failed to delete test file:', deleteError.message);
    }

    res.status(200).json({ 
      ok: true, 
      message: 'Test upload berhasil!',
      folderAccess: true
    });

  } catch (error) {
    console.error('Google Drive test error:', error);
    res.status(500).json({ 
      ok: false, 
      error: error.message || 'Test gagal' 
    });
  }
}