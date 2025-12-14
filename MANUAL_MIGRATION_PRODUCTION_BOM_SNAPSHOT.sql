-- ============================================
-- MANUAL MIGRATION: Add BOM Snapshot to Production Records
-- ============================================
--
-- Instructions:
-- 1. Open Supabase Dashboard > SQL Editor
-- 2. Copy and paste this entire SQL script
-- 3. Click "Run" to execute
--
-- This migration adds BOM snapshot storage to production records
-- so we can display which materials were consumed in production reports
--
-- ============================================

-- Add bom_snapshot column to production_records table
ALTER TABLE production_records
ADD COLUMN IF NOT EXISTS bom_snapshot jsonb;

-- Add user_input_name column if not exists (for display purposes)
ALTER TABLE production_records
ADD COLUMN IF NOT EXISTS user_input_name text;

-- Add comments to explain the purpose
COMMENT ON COLUMN production_records.bom_snapshot IS
  'Snapshot of BOM (Bill of Materials) at time of production - stores which materials were consumed';

COMMENT ON COLUMN production_records.user_input_name IS
  'Name of user who created this production record (for display in reports)';

-- Create index for better query performance on JSONB
CREATE INDEX IF NOT EXISTS idx_production_records_bom_snapshot
ON production_records USING gin(bom_snapshot);

-- Verify the migration
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'production_records'
  AND column_name IN ('bom_snapshot', 'user_input_name')
ORDER BY column_name;

-- Check for existing records
SELECT
  COUNT(*) as total_records,
  COUNT(bom_snapshot) as records_with_bom_snapshot,
  COUNT(user_input_name) as records_with_user_name
FROM production_records;

-- ============================================
-- Migration completed successfully!
-- ============================================
