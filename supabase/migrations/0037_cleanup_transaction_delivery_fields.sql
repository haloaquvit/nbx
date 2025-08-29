-- Cleanup any legacy delivery-related fields in transactions table
-- This migration ensures old delivery note data is properly cleaned up

-- Check and remove any legacy delivery_note columns if they exist
DO $$
BEGIN
  -- Remove delivery_note column if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' 
    AND column_name = 'delivery_note'
  ) THEN
    ALTER TABLE transactions DROP COLUMN delivery_note;
    RAISE NOTICE 'Removed delivery_note column from transactions table';
  END IF;
  
  -- Remove delivery_notes column if it exists (plural form)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' 
    AND column_name = 'delivery_notes'
  ) THEN
    ALTER TABLE transactions DROP COLUMN delivery_notes;
    RAISE NOTICE 'Removed delivery_notes column from transactions table';
  END IF;
  
  -- Remove surat_jalan column if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' 
    AND column_name = 'surat_jalan'
  ) THEN
    ALTER TABLE transactions DROP COLUMN surat_jalan;
    RAISE NOTICE 'Removed surat_jalan column from transactions table';
  END IF;
  
  -- Remove any other legacy delivery fields
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' 
    AND column_name = 'delivery_info'
  ) THEN
    ALTER TABLE transactions DROP COLUMN delivery_info;
    RAISE NOTICE 'Removed delivery_info column from transactions table';
  END IF;
END $$;

-- Ensure transactions table has proper structure for new delivery system
-- The delivery information is now properly handled by:
-- 1. deliveries table - for delivery metadata
-- 2. delivery_items table - for specific items delivered
-- 3. Transaction status 'Siap Antar', 'Diantar Sebagian', 'Selesai' for tracking

-- Add comment to document the change
COMMENT ON TABLE transactions IS 'Transaction data. Delivery information is now handled separately in deliveries and delivery_items tables as of migration 0034.';

-- Verify cleanup
DO $$
DECLARE
  col_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO col_count 
  FROM information_schema.columns 
  WHERE table_name = 'transactions' 
  AND column_name LIKE '%delivery%';
  
  IF col_count = 0 THEN
    RAISE NOTICE 'Cleanup successful: No delivery-related columns found in transactions table';
  ELSE
    RAISE NOTICE 'Warning: % delivery-related columns still exist in transactions table', col_count;
  END IF;
END $$;