// Vercel API route untuk upload foto dengan Service Account
const { google } = require('googleapis');
const formidable = require('formidable');

// Disable default body parser untuk handle multipart form
export const config = {
  api: {
    bodyParser: false,
  },
};

// Environment variables
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

// Validasi environment variables
if (!SERVICE_ACCOUNT_JSON) {
  console.error('❌ GOOGLE_SERVICE_ACCOUNT_JSON environment variable not set');
}

if (!FOLDER_ID) {
  console.error('❌ GOOGLE_DRIVE_FOLDER_ID environment variable not set');
}

// Google Auth setup
const getGoogleAuth = () => {
  try {
    const credentials = JSON.parse(SERVICE_ACCOUNT_JSON);
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
  } catch (error) {
    console.error('❌ Invalid GOOGLE_SERVICE_ACCOUNT_JSON:', error.message);
    throw error;
  }
};

// Upload file ke Google Drive dengan googleapis (sama seperti server/upload.cjs)
async function uploadToGoogleDrive(filePath, fileName, mimeType) {
  console.log(`📤 Uploading ${fileName} to Google Drive...`);

  // 1) Pastikan FOLDER_ID "bersih"
  const cleanFolderId = String(FOLDER_ID).trim()
    .replace(/^https?:\/\/drive\.google\.com\/drive\/folders\//, '')
    .replace(/\?.*$/, '');

  // 2) Auth & client
  const auth = getGoogleAuth();
  const drive = google.drive({ version: 'v3', auth });

  // 3) Cek akses folder (debug)
  try {
    const check = await drive.files.get({
      fileId: cleanFolderId,
      fields: 'id,name,permissions',
    });
    console.log(`✅ Folder access OK: ${check.data.name} (${check.data.id})`);
  } catch (error) {
    console.error(`❌ Folder access failed: ${error.message}`);
    if (error.code === 404) {
      throw new Error(`Folder ID tidak ditemukan: ${cleanFolderId}. Pastikan folder ID benar dan sudah di-share ke Service Account.`);
    } else if (error.code === 403) {
      throw new Error(`Tidak ada akses ke folder ${cleanFolderId}. Pastikan folder sudah di-share ke Service Account dengan permission Editor.`);
    }
    throw error;
  }

  // 4) Upload—perhatikan parents WAJIB di requestBody
  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [cleanFolderId], // ✅ WAJIB - googleapis handle multipart dengan benar
    },
    media: {
      mimeType,
      body: require('fs').createReadStream(filePath),
    },
    fields: 'id,name,parents,webViewLink',
  });

  console.log(`✅ File uploaded successfully: ${res.data.id}`);

  // 5) Opsional: buat public
  try {
    await drive.permissions.create({
      fileId: res.data.id,
      requestBody: { role: 'reader', type: 'anyone' },
    });
    console.log(`🔓 File made public: ${res.data.webViewLink}`);
  } catch (e) {
    console.warn('⚠️ Set public permission failed:', e.message);
  }

  // 6) Hasil
  return {
    id: res.data.id,
    name: res.data.name,
    webViewLink: res.data.webViewLink || `https://drive.google.com/file/d/${res.data.id}/view`,
    parents: res.data.parents,
  };
}

// API Handler
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    // Parse multipart form data
    const form = formidable({
      uploadDir: '/tmp',
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
    });

    const [fields, files] = await form.parse(req);
    const file = Array.isArray(files.photo) ? files.photo[0] : files.photo;

    if (!file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No photo file provided' 
      });
    }

    console.log(`📂 File received: ${file.originalFilename} (${file.size} bytes)`);

    // Generate unique filename
    const timestamp = Date.now();
    const transactionId = fields.transactionId ? 
      (Array.isArray(fields.transactionId) ? fields.transactionId[0] : fields.transactionId) : 
      'unknown';
    const fileName = `delivery-${transactionId}-${timestamp}.jpg`;

    // Upload ke Google Drive
    const result = await uploadToGoogleDrive(
      file.filepath,
      fileName,
      file.mimetype || 'image/jpeg'
    );

    // Cleanup temporary file
    try {
      require('fs').unlinkSync(file.filepath);
      console.log('🗑️  Temporary file cleaned up');
    } catch (cleanupError) {
      console.warn('⚠️  Failed to cleanup temp file:', cleanupError.message);
    }

    // Return result
    res.status(200).json({
      success: true,
      data: result,
    });

    console.log('✅ Photo upload completed successfully');

  } catch (error) {
    console.error('❌ Photo upload API error:', error);
    res.status(500).json({
      success: false,
      error: 'Upload failed',
      message: error.message,
    });
  }
}