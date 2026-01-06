SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'retasi' 
  AND column_name IN ('total_items', 'returned_items_count', 'error_items_count', 'barang_laku', 'barang_tidak_laku');
