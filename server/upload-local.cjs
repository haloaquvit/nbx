const express = require('express');
const cors = require('cors');
const formidable = require('formidable');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;

// Direktori untuk menyimpan file upload
const UPLOAD_DIR = '/var/www/aquvit-uploads';
const BASE_URL = 'http://erp.aquvit.id/uploads';

// Buat direktori jika belum ada
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

app.use(cors());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Aquvit Upload Server',
    storage: 'Local VPS Storage',
    uploadDir: UPLOAD_DIR
  });
});

// Upload endpoint
app.post('/upload', async (req, res) => {
  const form = formidable({
    uploadDir: UPLOAD_DIR,
    keepExtensions: true,
    maxFileSize: 50 * 1024 * 1024, // 50MB max
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Upload error:', err);
      return res.status(500).json({
        success: false,
        error: 'Upload failed',
        message: err.message
      });
    }

    try {
      const file = files.file[0];
      const originalFilename = file.originalFilename;
      const timestamp = Date.now();
      const extension = path.extname(originalFilename);
      const newFilename = `${timestamp}${extension}`;
      const newPath = path.join(UPLOAD_DIR, newFilename);

      // Rename file dengan timestamp
      fs.renameSync(file.filepath, newPath);

      // Set permissions agar bisa diakses Nginx
      fs.chmodSync(newPath, 0o644);

      const fileUrl = `${BASE_URL}/${newFilename}`;

      console.log(`✅ File uploaded: ${originalFilename} -> ${fileUrl}`);

      res.json({
        success: true,
        url: fileUrl,
        filename: newFilename,
        originalName: originalFilename,
        size: file.size,
        mimetype: file.mimetype
      });

    } catch (error) {
      console.error('File processing error:', error);
      res.status(500).json({
        success: false,
        error: 'File processing failed',
        message: error.message
      });
    }
  });
});

// Delete endpoint
app.delete('/delete/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(UPLOAD_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      error: 'File not found'
    });
  }

  try {
    fs.unlinkSync(filePath);
    console.log(`🗑️ File deleted: ${filename}`);
    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      success: false,
      error: 'Delete failed',
      message: error.message
    });
  }
});

// List files endpoint (untuk debugging)
app.get('/files', (req, res) => {
  try {
    const files = fs.readdirSync(UPLOAD_DIR);
    res.json({
      success: true,
      count: files.length,
      files: files.map(f => ({
        name: f,
        url: `${BASE_URL}/${f}`,
        size: fs.statSync(path.join(UPLOAD_DIR, f)).size
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Upload server running on port ${PORT}`);
  console.log(`📁 Upload directory: ${UPLOAD_DIR}`);
  console.log(`🌐 Base URL: ${BASE_URL}`);
  console.log(`✅ Ready to accept uploads!`);
});
