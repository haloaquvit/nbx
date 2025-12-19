// Script untuk generate SQL update statements
// untuk mencocokkan foto dengan customer berdasarkan nama

const fs = require('fs');
const path = require('path');

// Baca file list foto
const photosFile = path.join(__dirname, '..', 'customer_photos.txt');
const photos = fs.readFileSync(photosFile, 'utf-8')
  .split('\n')
  .filter(line => line.trim())
  .map(filename => {
    // Parse filename: [hash][NAME].Foto Lokasi.[timestamp].jpg
    // Example: 000d24a1KIOS EVAN.Foto Lokasi.020505.jpg
    const match = filename.match(/^[a-f0-9]{8}(.+)\.Foto Lokasi\.\d+\.jpg$/i);
    if (match) {
      return {
        filename: filename,
        customerName: match[1].trim()
      };
    }
    return null;
  })
  .filter(Boolean);

console.log(`Found ${photos.length} photos with customer names\n`);

// Generate SQL statements
let sql = `-- SQL to update store_photo_url for customers
-- Run this in Supabase SQL Editor
-- Generated on ${new Date().toISOString()}

BEGIN;

`;

photos.forEach(photo => {
  // Escape single quotes in customer name
  const escapedName = photo.customerName.replace(/'/g, "''");
  const escapedFilename = photo.filename.replace(/'/g, "''");

  sql += `-- Customer: ${photo.customerName}
UPDATE customers
SET store_photo_url = '${escapedFilename}'
WHERE UPPER(name) = UPPER('${escapedName}')
  AND (store_photo_url IS NULL OR store_photo_url = '');

`;
});

sql += `
-- Check how many were updated
SELECT name, store_photo_url
FROM customers
WHERE store_photo_url IS NOT NULL AND store_photo_url != ''
ORDER BY name;

COMMIT;
`;

// Save SQL file
const sqlFile = path.join(__dirname, '..', 'update_customer_photos.sql');
fs.writeFileSync(sqlFile, sql);
console.log(`SQL file saved to: ${sqlFile}`);

// Also generate a simpler version with just filenames for manual matching
let manualSql = `-- Alternative: Manual matching SQL
-- Use this to see all customers and manually assign photos

-- List all customers without photos
SELECT id, name, store_photo_url
FROM customers
WHERE store_photo_url IS NULL OR store_photo_url = ''
ORDER BY name;

-- Available photo files (copy-paste the filename you want to assign):
/*
${photos.map(p => `${p.customerName} => ${p.filename}`).join('\n')}
*/

-- Example update:
-- UPDATE customers SET store_photo_url = 'filename.jpg' WHERE id = 'customer-uuid';
`;

const manualSqlFile = path.join(__dirname, '..', 'manual_photo_matching.sql');
fs.writeFileSync(manualSqlFile, manualSql);
console.log(`Manual SQL file saved to: ${manualSqlFile}`);

// Print summary
console.log('\n--- Photo to Customer Mapping ---');
photos.slice(0, 20).forEach(p => {
  console.log(`${p.customerName} => ${p.filename}`);
});
console.log(`... and ${photos.length - 20} more`);
