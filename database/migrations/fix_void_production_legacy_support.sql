-- Fix void production for legacy data (pre-RPC/pre-batches)
-- This ensures stock is reduced even if no specific batch exists for the production record.

CREATE OR REPLACE FUNCTION void_production_atomic(
  p_production_id UUID,
  p_branch_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  error_message TEXT
) AS $$
DECLARE
  v_record RECORD;
  v_consumption RECORD;
  v_movement RECORD;
  v_journal_id UUID;
  v_deleted_count INTEGER;
BEGIN
  -- 1. Get Production Record
  SELECT * INTO v_record FROM production_records 
  WHERE id = p_production_id AND branch_id = p_branch_id;
  
  IF v_record.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Data produksi tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- 2. Handle BOM Stock Rollback (Return Materials to Stock)
  -- Cari semua konsumsi batch yang terkait dengan produksi ini (via reference_id/ref)
  FOR v_consumption IN 
    SELECT * FROM inventory_batch_consumptions 
    WHERE reference_id = v_record.ref AND reference_type IN ('production', 'production_error')
  LOOP
    -- Kembalikan kuantitas ke batch asal
    UPDATE inventory_batches 
    SET remaining_quantity = remaining_quantity + v_consumption.quantity_consumed,
        updated_at = NOW()
    WHERE id = v_consumption.batch_id;
  END LOOP;

  -- Hapus log konsumsi material
  DELETE FROM inventory_batch_consumptions 
  WHERE reference_id = v_record.ref AND reference_type IN ('production', 'production_error');

  -- 3. Rollback Legacy Material Stock (materials.stock)
  -- Meskipun deprecated, kita tetap sync untuk menjaga kompatibilitas UI lama
  IF v_record.consume_bom THEN
    -- Restore materials stock based on movements
    FOR v_movement IN 
      SELECT material_id, quantity FROM material_stock_movements 
      WHERE reference_id = v_record.id::TEXT AND reference_type = 'production' AND type = 'OUT'
    LOOP
      UPDATE materials 
      SET stock = stock + v_movement.quantity, 
          updated_at = NOW()
      WHERE id = v_movement.material_id;
    END LOOP;
  ELSIF v_record.quantity < 0 AND v_record.product_id IS NULL THEN
    -- Case Spoilage/Error Input: restore material from notes or movement
    FOR v_movement IN 
      SELECT material_id, quantity FROM material_stock_movements 
      WHERE reference_id = v_record.id::TEXT AND reference_type = 'production' AND type = 'OUT'
    LOOP
      UPDATE materials 
      SET stock = stock + v_movement.quantity, 
          updated_at = NOW()
      WHERE id = v_movement.material_id;
    END LOOP;
  END IF;

  -- 4. Delete Material Stock Movements
  DELETE FROM material_stock_movements 
  WHERE reference_id = v_record.id::TEXT AND reference_type = 'production';

  -- 5. Void Related Journals
  -- Cari jurnal yang mereferensikan produksi ini
  FOR v_journal_id IN 
    SELECT id FROM journal_entries 
    WHERE reference_id = v_record.id::TEXT AND reference_type = 'adjustment' AND is_voided = FALSE
  LOOP
    -- Mark as voided
    UPDATE journal_entries 
    SET is_voided = TRUE, 
        voided_reason = 'Production deleted: ' || v_record.ref,
        updated_at = NOW()
    WHERE id = v_journal_id;
  END LOOP;

  -- 6. Product Stock Reversal (Hybrid Approach)
  IF v_record.quantity > 0 AND v_record.product_id IS NOT NULL THEN
    -- A. Try to delete specific batch (New RPC Data)
    DELETE FROM inventory_batches 
    WHERE product_id = v_record.product_id 
      AND (production_id = v_record.id OR notes = 'Produksi ' || v_record.ref);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- B. If no specific batch found, it must be Legacy/Migrated data
    -- Consume from general stock (FIFO) to reduce total count
    IF v_deleted_count = 0 THEN
       -- Consume FIFO will pick oldest batches (e.g. Initial Stock)
       PERFORM consume_inventory_fifo(
         v_record.product_id,
         p_branch_id,
         v_record.quantity,
         NULL, -- No Transaction ID
         NULL  -- No Material ID
       );

       -- C. Also update legacy product column if it exists/is used
       UPDATE products
       SET current_stock = current_stock - v_record.quantity
       WHERE id = v_record.product_id;
    END IF;
  END IF;

  -- 7. Finally Delete Production Record
  DELETE FROM production_records WHERE id = p_production_id;

  RETURN QUERY SELECT TRUE, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
