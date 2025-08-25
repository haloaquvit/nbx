// Backend API untuk upload foto delivery dengan Service Account
import { google } from 'googleapis';
import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';

// Konfigurasi Service Account (dari environment variables)
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '1zFhEWdnh7aG7O602nzBYoAg1r2JIsEWj';
const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

// Disable default body parser untuk handle multipart form
export const config = {
  api: {
    bodyParser: false,
  },
};

// Autentikasi Service Account
const getGoogleAuth = () => {
  if (!SERVICE_ACCOUNT_JSON) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON environment variable not set');
  }

  return new google.auth.GoogleAuth({
    credentials: JSON.parse(SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
};

// Upload file ke Google Drive dengan Service Account
async function uploadToGoogleDrive(filePath: string, fileName: string, mimeType: string) {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: 'v3', auth });

  try {
    // Upload file dengan parents (WAJIB untuk Service Account)
    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [FOLDER_ID], // WAJIB - upload ke folder yang sudah di-share
      },
      media: {
        mimeType: mimeType,
        body: fs.createReadStream(filePath),
      },
      fields: 'id,name,parents,webViewLink',
    });

    // Buat file bisa diakses publik
    await drive.permissions.create({
      fileId: res.data.id!,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    return {
      id: res.data.id,
      name: res.data.name,
      webViewLink: res.data.webViewLink || `https://drive.google.com/file/d/${res.data.id}/view`,
      parents: res.data.parents,
    };
  } catch (error) {
    console.error('Google Drive upload error:', error);
    throw error;
  }
}

// API Handler
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
      return res.status(400).json({ error: 'No photo file provided' });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const transactionId = fields.transactionId ? Array.isArray(fields.transactionId) ? fields.transactionId[0] : fields.transactionId : 'unknown';
    const fileName = `delivery-${transactionId}-${timestamp}.jpg`;

    // Upload ke Google Drive
    const result = await uploadToGoogleDrive(
      file.filepath,
      fileName,
      file.mimetype || 'image/jpeg'
    );

    // Cleanup temporary file
    fs.unlinkSync(file.filepath);

    // Return result
    res.status(200).json({
      success: true,
      data: result,
    });

  } catch (error: any) {
    console.error('Photo upload API error:', error);
    res.status(500).json({
      error: 'Upload failed',
      message: error.message,
    });
  }
}