const https = require('https');

https.get('https://upload.aquvit.id/files/customers/', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const files = json.files || [];

    // Filter hanya 'Foto Lokasi' (bukan KTP)
    const fotoLokasi = files.filter(f => f.filename.includes('.Foto Lokasi.'));

    // Extract nama dari filename: {8char-uuid}{NamaPelanggan}.Foto Lokasi.{timestamp}.jpg
    const mapping = fotoLokasi.map(f => {
      const match = f.filename.match(/^[a-f0-9]{8}(.+?)\.Foto Lokasi\./i);
      if (match) {
        return {
          customerName: match[1].trim(),
          filename: f.filename
        };
      }
      return null;
    }).filter(Boolean);

    console.log('-- SQL UPDATE untuk sync foto pelanggan');
    console.log('-- Total foto: ' + mapping.length);
    console.log('-- Run this on your database\n');
    console.log('BEGIN;');
    console.log('');

    mapping.forEach(m => {
      // Escape single quotes in customer name
      const safeName = m.customerName.replace(/'/g, "''");
      const safeFilename = m.filename.replace(/'/g, "''");
      console.log(`UPDATE customers SET store_photo_url = '${safeFilename}' WHERE LOWER(name) = LOWER('${safeName}') AND (store_photo_url IS NULL OR store_photo_url = '');`);
    });

    console.log('');
    console.log('COMMIT;');
    console.log('');
    console.log('-- Verifikasi hasil:');
    console.log("-- SELECT name, store_photo_url FROM customers WHERE store_photo_url IS NOT NULL AND store_photo_url != '' LIMIT 20;");
  });
}).on('error', err => console.error('Error:', err.message));
