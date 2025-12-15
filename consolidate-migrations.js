import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const migrationsDir = './supabase/migrations';
const outputFile = './vps-database-setup.sql';

// Read all SQL files
const files = readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

console.log(`Found ${files.length} migration files\n`);

let consolidatedSQL = `-- ============================================
-- AQUAVIT DATABASE SCHEMA - CONSOLIDATED
-- Generated: ${new Date().toISOString().split('T')[0]}
-- Total Migrations: ${files.length}
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Set timezone
SET timezone = 'Asia/Jakarta';

`;

files.forEach((file, index) => {
  console.log(`${index + 1}. ${file}`);

  const filePath = join(migrationsDir, file);
  const content = readFileSync(filePath, 'utf8');

  consolidatedSQL += `\n-- ============================================\n`;
  consolidatedSQL += `-- Migration ${index + 1}: ${file}\n`;
  consolidatedSQL += `-- ============================================\n\n`;
  consolidatedSQL += content;
  consolidatedSQL += `\n\n`;
});

writeFileSync(outputFile, consolidatedSQL);

console.log(`\n✓ Consolidated schema saved to: ${outputFile}`);
console.log(`File size: ${(Buffer.byteLength(consolidatedSQL) / 1024).toFixed(2)} KB`);
