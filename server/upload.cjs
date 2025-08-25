// Express server untuk upload foto dengan Service Account
const express = require('express');
const { google } = require('googleapis');
const { IncomingForm } = require('formidable');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const fetch = require('node-fetch');

// Environment variables
require('dotenv').config();

const app = express();
const PORT = process.env.UPLOAD_SERVER_PORT || 3001;

// CORS middleware
app.use(cors({
  origin: 'http://localhost:8080', // Vite dev server
  credentials: true
}));

// JSON body parser for API endpoints
app.use(express.json());

// Konfigurasi Service Account
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

// Validasi environment variables
if (!SERVICE_ACCOUNT_JSON) {
  console.error('❌ GOOGLE_SERVICE_ACCOUNT_JSON environment variable not set');
  process.exit(1);
}

if (!FOLDER_ID) {
  console.error('❌ GOOGLE_DRIVE_FOLDER_ID environment variable not set');  
  process.exit(1);
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

// Get access token untuk raw multipart upload
async function getAccessToken() {
  const auth = getGoogleAuth();
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  return token;
}

// Upload file ke Google Drive dengan googleapis resmi (paling stabil)
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
  const check = await drive.files.get({
    fileId: cleanFolderId,
    fields: 'id,name,permissions',
  });
  console.log(`✅ Folder access OK: ${check.data.name} (${check.data.id})`);

  // 4) Upload—perhatikan parents WAJIB di requestBody
  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [cleanFolderId], // ✅ WAJIB - googleapis handle multipart dengan benar
    },
    media: {
      mimeType,
      body: fs.createReadStream(filePath),
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

// Test folder access sebelum upload  
async function testFolderAccess() {
  console.log('🔍 Testing folder access...');
  
  // Pastikan FOLDER_ID "bersih"
  const cleanFolderId = String(FOLDER_ID).trim()
    .replace(/^https?:\/\/drive\.google\.com\/drive\/folders\//, '')
    .replace(/\?.*$/, '');
  
  try {
    const auth = getGoogleAuth();
    const drive = google.drive({ version: 'v3', auth });
    
    // Diagnose Service Account user
    try {
      const aboutResult = await drive.about.get({ fields: 'user' });
      console.log(`📧 SA user: ${aboutResult.data.user?.emailAddress}`);
    } catch (e) {
      console.warn('⚠️ Cannot get SA user info:', e.message);
    }
    
    const result = await drive.files.get({
      fileId: cleanFolderId,
      fields: 'id,name,parents,permissions',
    });
    
    console.log(`✅ Folder access OK: ${result.data.name} (${result.data.id})`);
    return true;
  } catch (error) {
    console.error('❌ Folder access test failed:', error.message);
    if (error.code === 404) {
      throw new Error(`Folder ID tidak ditemukan: ${cleanFolderId}. Pastikan folder ID benar dan sudah di-share ke Service Account.`);
    } else if (error.code === 403) {
      throw new Error(`Tidak ada akses ke folder ${cleanFolderId}. Pastikan folder sudah di-share ke gelasapp@aquvit-app.iam.gserviceaccount.com dengan permission Editor.`);
    }
    throw error;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Upload server is running',
    folderId: FOLDER_ID 
  });
});

// Service Account info endpoint (aman - tidak expose private key)
app.get('/api/gdrive/info', async (req, res) => {
  try {
    const auth = getGoogleAuth();
    const drive = google.drive({ version: 'v3', auth });
    const about = await drive.about.get({ fields: 'user' });

    res.json({
      ok: true,
      serviceAccountEmail: about.data.user?.emailAddress,
    });
  } catch (error) {
    console.error('Service Account info error:', error);
    res.status(500).json({ 
      ok: false, 
      error: error.message || 'Failed to get Service Account info' 
    });
  }
});

// Debug endpoint untuk list files yang bisa diakses Service Account
app.get('/api/gdrive/debug-list', async (req, res) => {
  try {
    const auth = getGoogleAuth();
    const drive = google.drive({ version: 'v3', auth });

    // List files yang bisa diakses Service Account
    const response = await drive.files.list({
      pageSize: 20,
      fields: 'files(id,name,mimeType,parents)',
      q: "mimeType='application/vnd.google-apps.folder'"
    });

    console.log('📁 Folders accessible by Service Account:');
    response.data.files?.forEach(file => {
      console.log(`  - ${file.name} (${file.id})`);
    });

    res.json({
      ok: true,
      folders: response.data.files || []
    });
  } catch (error) {
    console.error('Debug list error:', error);
    res.status(500).json({ 
      ok: false, 
      error: error.message 
    });
  }
});

// Test folder access endpoint
app.post('/api/gdrive/test', async (req, res) => {
  try {
    const { folderId } = req.body;
    
    if (!folderId) {
      return res.status(400).json({ ok: false, error: 'folderId required' });
    }

    // Clean folder ID
    const cleanFolderId = String(folderId).trim()
      .replace(/^https?:\/\/drive\.google\.com\/drive\/folders\//, '')
      .replace(/\?.*$/, '');

    console.log(`🔍 Testing folder access: ${cleanFolderId}`);

    const auth = getGoogleAuth();
    const drive = google.drive({ version: 'v3', auth });

    // Test folder access
    try {
      const folderInfo = await drive.files.get({ 
        fileId: cleanFolderId, 
        fields: 'id,name,permissions' 
      });
      console.log(`✅ Folder access OK: ${folderInfo.data.name} (${folderInfo.data.id})`);
    } catch (folderError) {
      console.error(`❌ Folder access failed: ${folderError.message}`);
      console.log(`🔍 Let's check what folders Service Account can access...`);
      
      // List accessible folders for debugging
      try {
        const listResponse = await drive.files.list({
          pageSize: 10,
          fields: 'files(id,name,mimeType)',
          q: "mimeType='application/vnd.google-apps.folder'"
        });
        console.log('📁 Accessible folders:');
        listResponse.data.files?.forEach(file => {
          console.log(`  - ${file.name} (${file.id})`);
        });
      } catch (listError) {
        console.log('❌ Cannot list folders:', listError.message);
      }
      
      if (folderError.code === 404) {
        throw new Error(`Folder ID tidak ditemukan: ${cleanFolderId}. Pastikan folder ID benar dan sudah di-share ke Service Account gelasapp@aquvit-app.iam.gserviceaccount.com dengan permission Editor.`);
      } else if (folderError.code === 403) {
        throw new Error(`Tidak ada akses ke folder ${cleanFolderId}. Pastikan folder sudah di-share ke Service Account gelasapp@aquvit-app.iam.gserviceaccount.com dengan permission Editor.`);
      }
      throw folderError;
    }

    // Create test file
    const content = Buffer.from('Service Account test OK ' + new Date().toISOString(), 'utf8');
    const testFileName = `test-${Date.now()}.txt`;

    console.log(`📤 Uploading test file: ${testFileName}`);

    // Use temporary file approach
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const tempFilePath = path.join(tempDir, testFileName);
    fs.writeFileSync(tempFilePath, content);

    try {
      const upload = await uploadToGoogleDrive(tempFilePath, testFileName, 'text/plain');
      console.log(`✅ Test file uploaded: ${upload.id}`);

      // Delete test file from Google Drive (cleanup)
      try {
        await drive.files.delete({ fileId: upload.id });
        console.log('🗑️ Test file deleted from Google Drive');
      } catch (deleteError) {
        console.warn('⚠️ Failed to delete test file from Google Drive:', deleteError.message);
      }

      res.json({ 
        ok: true, 
        message: 'Test upload berhasil!',
        folderAccess: true
      });
    } finally {
      // Delete temp file
      try {
        fs.unlinkSync(tempFilePath);
        console.log('🗑️ Temp file cleaned up');
      } catch (cleanupError) {
        console.warn('⚠️ Failed to cleanup temp file:', cleanupError.message);
      }
    }

  } catch (error) {
    console.error('Google Drive test error:', error);
    res.status(500).json({ 
      ok: false, 
      error: error.message || 'Test gagal' 
    });
  }
});

// Upload endpoint
app.post('/upload-photo', async (req, res) => {
  console.log('📸 Received photo upload request');

  try {
    // Parse multipart form data
    const form = new IncomingForm({
      uploadDir: path.join(__dirname, '../temp'),
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
    });

    // Ensure temp directory exists
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

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
      fs.unlinkSync(file.filepath);
      console.log('🗑️  Temporary file cleaned up');
    } catch (cleanupError) {
      console.warn('⚠️  Failed to cleanup temp file:', cleanupError.message);
    }

    // Return result
    res.json({
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
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Upload server running on http://localhost:${PORT}`);
  console.log(`📁 Using Google Drive Folder ID: ${FOLDER_ID}`);
  console.log(`📧 Service Account: ${JSON.parse(SERVICE_ACCOUNT_JSON).client_email}`);
});

module.exports = app;