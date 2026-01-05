-- ============================================================================
-- FIX VOID PRODUCTION REFERENCE ID
-- Mengoreksi logika void produksi agar mencari material_stock_movements
-- menggunakan 'ref' (misal: PRD-XXX) bukan 'id' (UUID), karena saat produksi
-- dicatat, referensi yang digunakan adalah string Ref.
-- ============================================================================

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
BEGIN
  -- 1. Get Production Record
  SELECT * INTO v_record FROM production_records 
  WHERE id = p_production_id AND branch_id = p_branch_id;
  
  IF v_record.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Data produksi tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- 2. Handle Stock Rollback (FIFO)
  FOR v_consumption IN 
    SELECT * FROM inventory_batch_consumptions 
    WHERE reference_id = v_record.ref AND reference_type IN ('production', 'production_error')
  LOOP
    UPDATE inventory_batches 
    SET remaining_quantity = remaining_quantity + v_consumption.quantity_consumed,
        updated_at = NOW()
    WHERE id = v_consumption.batch_id;
  END LOOP;

  DELETE FROM inventory_batch_consumptions 
  WHERE reference_id = v_record.ref AND reference_type IN ('production', 'production_error');

  -- 3. Rollback Legacy Stock (materials.stock)
  IF v_record.consume_bom THEN
    -- [FIX] Use v_record.ref instead of v_record.id
    FOR v_movement IN 
      SELECT material_id, quantity FROM material_stock_movements 
      WHERE (reference_id = v_record.ref OR reference_id = v_record.id::TEXT) -- Support both just in case
        AND reference_type = 'production' 
        AND type = 'OUT'
    LOOP
      UPDATE materials 
      SET stock = stock + v_movement.quantity, 
          updated_at = NOW()
      WHERE id = v_movement.material_id;
    END LOOP;
  ELSIF v_record.quantity < 0 AND v_record.product_id IS NULL THEN
    -- Case Spoilage: usually uses ref too? Let's assume ref or ID.
    FOR v_movement IN 
      SELECT material_id, quantity FROM material_stock_movements 
      WHERE (reference_id = v_record.ref OR reference_id = v_record.id::TEXT)
        AND reference_type IN ('production', 'spoilage', 'production_error') 
        AND type = 'OUT'
    LOOP
      UPDATE materials 
      SET stock = stock + v_movement.quantity, 
          updated_at = NOW()
      WHERE id = v_movement.material_id;
    END LOOP;
  END IF;

  -- 4. Delete Material Stock Movements
  DELETE FROM material_stock_movements 
  WHERE (reference_id = v_record.ref OR reference_id = v_record.id::TEXT)
    AND reference_type IN ('production', 'spoilage', 'production_error');

  -- 5. Void Related Journals
  -- Journals usually use ID as reference_id for 'adjustment' type mapping
  FOR v_journal_id IN 
    SELECT id FROM journal_entries 
    WHERE reference_id = v_record.id::TEXT AND reference_type = 'adjustment' AND is_voided = FALSE
  LOOP
    UPDATE journal_entries 
    SET is_voided = TRUE, 
        voided_reason = 'Production deleted: ' || v_record.ref,
        updated_at = NOW()
    WHERE id = v_journal_id;
  END LOOP;

  -- 6. Delete Inventory Batch for Product (Hasil Produksi)
  IF v_record.quantity > 0 AND v_record.product_id IS NOT NULL THEN
    DELETE FROM inventory_batches 
    WHERE product_id = v_record.product_id 
      AND (production_id = v_record.id OR notes = 'Produksi ' || v_record.ref);
  END IF;

  -- 7. Finally Delete Production Record
  DELETE FROM production_records WHERE id = p_production_id;

  RETURN QUERY SELECT TRUE, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION void_production_atomic(UUID, UUID) TO authenticated;
