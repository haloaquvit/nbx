-- ============================================================================
-- RPC 07: Void Operations Atomic
-- Purpose: Void transaksi/delivery dengan:
-- - Restore inventory
-- - Void journal entries
-- - Update status
-- PENTING: Semua operasi WAJIB filter by branch_id
-- ============================================================================

-- Drop existing functions (multiple signatures)
DROP FUNCTION IF EXISTS void_transaction_atomic(UUID, UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS void_transaction_atomic(TEXT, UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS void_delivery_atomic(UUID, UUID, TEXT, UUID);

-- ============================================================================
-- 1. VOID TRANSACTION ATOMIC
-- Void transaksi: void journals + update status
-- Stock restore handled per-delivery via void_delivery_atomic
-- NOTE: transactions table tidak punya kolom is_voided - hanya update status
-- NOTE: items disimpan dalam JSONB transactions.items, bukan transaction_items table
-- ============================================================================

-- void_transaction_atomic MOVED TO 09_transaction.sql
-- Function definition removed to prevent conflicts



-- ============================================================================
-- 2. VOID DELIVERY ATOMIC
-- Void pengiriman saja (transaksi tetap valid)
-- PERBAIKAN: Restore dari delivery_items, bukan transaction_items
-- NOTE: deliveries table tidak punya kolom status/voided - hanya update timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION void_delivery_atomic(
  p_delivery_id UUID,
  p_branch_id UUID,           -- WAJIB: identitas cabang
  p_reason TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  items_restored INTEGER,
  journals_voided INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_delivery RECORD;
  v_transaction RECORD;
  v_item RECORD;
  v_restore_result RECORD;
  v_items_restored INTEGER := 0;
  v_journals_voided INTEGER := 0;
  v_total_ordered NUMERIC;
  v_total_delivered NUMERIC;
  v_new_status TEXT;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_delivery_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0,
      'Delivery ID is required'::TEXT;
    RETURN;
  END IF;

  -- Get delivery info (deliveries table tidak punya kolom status)
  SELECT
    d.id,
    d.transaction_id,
    d.branch_id,
    d.delivery_number
  INTO v_delivery
  FROM deliveries d
  WHERE d.id = p_delivery_id AND d.branch_id = p_branch_id;

  IF v_delivery.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0,
      'Delivery not found in this branch'::TEXT;
    RETURN;
  END IF;

  -- Get transaction info (transaction_id is TEXT in deliveries table)
  SELECT * INTO v_transaction
  FROM transactions
  WHERE id::TEXT = v_delivery.transaction_id;

  IF v_transaction.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0,
      'Transaction not found for this delivery'::TEXT;
    RETURN;
  END IF;

  -- ==================== RESTORE INVENTORY ====================
  -- Restore dari delivery_items (yang benar-benar dikirim)

  FOR v_item IN
    SELECT
      di.product_id,
      di.quantity_delivered as quantity,
      di.product_name,
      COALESCE(p.cost_price, p.base_price, 0) as unit_cost
    FROM delivery_items di
    LEFT JOIN products p ON p.id = di.product_id
    WHERE di.delivery_id = p_delivery_id
      AND di.quantity_delivered > 0
  LOOP
    SELECT * INTO v_restore_result
    FROM restore_inventory_fifo(
      v_item.product_id,
      p_branch_id,
      v_item.quantity,
      v_item.unit_cost,
      format('void_delivery_%s', p_delivery_id)
    );

    IF v_restore_result.success THEN
      v_items_restored := v_items_restored + 1;
    END IF;
  END LOOP;

  -- ==================== VOID JOURNALS ====================

  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = COALESCE(p_reason, 'Delivery voided')
  WHERE reference_id = p_delivery_id::TEXT
    AND branch_id = p_branch_id
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_journals_voided = ROW_COUNT;

  -- ==================== DELETE COMMISSIONS ====================

  DELETE FROM commission_entries
  WHERE delivery_id = p_delivery_id;

  -- ==================== UPDATE TRANSACTION STATUS ====================
  -- Hitung ulang status berdasarkan sisa delivery yang masih valid

  -- Get total ordered from transaction items
  SELECT
    COALESCE(SUM(
      CASE WHEN (item->>'_isSalesMeta')::BOOLEAN THEN 0
      ELSE (item->>'quantity')::NUMERIC END
    ), 0)
  INTO v_total_ordered
  FROM jsonb_array_elements(v_transaction.items) item;

  -- Get total delivered from remaining deliveries (exclude current one being voided)
  SELECT
    COALESCE(SUM(di.quantity_delivered), 0)
  INTO v_total_delivered
  FROM delivery_items di
  JOIN deliveries d ON d.id = di.delivery_id
  WHERE d.transaction_id = v_delivery.transaction_id
    AND d.id != p_delivery_id;  -- Exclude current delivery being voided

  -- Determine new status
  IF v_total_delivered >= v_total_ordered AND v_total_delivered > 0 THEN
    v_new_status := 'Selesai';
  ELSIF v_total_delivered > 0 THEN
    v_new_status := 'Diantar Sebagian';
  ELSE
    v_new_status := 'Pesanan Masuk';
  END IF;

  UPDATE transactions
  SET
    status = v_new_status
  WHERE id = v_transaction.id;

  -- Note: Delivery record deletion will be handled by frontend after RPC returns success
  -- This RPC only handles: restore inventory + void journals + update transaction status

  RETURN QUERY SELECT
    TRUE,
    v_items_restored,
    v_journals_voided,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, 0, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 3. VOID PRODUCTION ATOMIC
-- Void produksi dan kembalikan material
-- NOTE: Tabel production adalah 'production_records', bukan 'production_batches'
-- NOTE: Material yang dikonsumsi disimpan dalam bom_snapshot JSONB
-- ============================================================================

CREATE OR REPLACE FUNCTION void_production_atomic(
  p_production_id UUID,
  p_branch_id UUID,           -- WAJIB: identitas cabang
  p_reason TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  materials_restored INTEGER,
  products_consumed INTEGER,
  journals_voided INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_production RECORD;
  v_material JSONB;
  v_restore_result RECORD;
  v_consume_result RECORD;
  v_materials_restored INTEGER := 0;
  v_products_consumed INTEGER := 0;
  v_journals_voided INTEGER := 0;
  v_material_id UUID;
  v_material_qty NUMERIC;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_production_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0,
      'Production ID is required'::TEXT;
    RETURN;
  END IF;

  -- Get production info from production_records (actual table name)
  SELECT
    pr.id,
    pr.product_id,
    pr.branch_id,
    pr.quantity,
    pr.bom_snapshot,
    pr.consume_bom
  INTO v_production
  FROM production_records pr
  WHERE pr.id = p_production_id AND pr.branch_id = p_branch_id;

  IF v_production.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0,
      'Production not found in this branch'::TEXT;
    RETURN;
  END IF;

  -- ==================== CONSUME PRODUCED PRODUCTS ====================
  -- Reverse: consume the products that were produced

  SELECT * INTO v_consume_result
  FROM consume_inventory_fifo(
    v_production.product_id,
    p_branch_id,
    v_production.quantity,
    format('void_prod_%s', p_production_id)
  );

  IF v_consume_result.success THEN
    v_products_consumed := 1;
  END IF;

  -- ==================== RESTORE MATERIALS ====================
  -- Get materials from bom_snapshot JSONB and restore them

  IF v_production.bom_snapshot IS NOT NULL AND v_production.consume_bom = TRUE THEN
    FOR v_material IN SELECT * FROM jsonb_array_elements(v_production.bom_snapshot)
    LOOP
      v_material_id := (v_material->>'material_id')::UUID;
      v_material_qty := (v_material->>'quantity')::NUMERIC * v_production.quantity;

      IF v_material_id IS NOT NULL AND v_material_qty > 0 THEN
        SELECT * INTO v_restore_result
        FROM restore_material_fifo(
          v_material_id,
          p_branch_id,
          v_material_qty,
          0, -- Unit cost (will be estimated)
          format('void_prod_%s', p_production_id),
          'void_production'
        );

        IF v_restore_result.success THEN
          v_materials_restored := v_materials_restored + 1;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- ==================== VOID JOURNALS ====================

  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = COALESCE(p_reason, 'Production voided')
  WHERE reference_id = p_production_id::TEXT
    AND branch_id = p_branch_id
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_journals_voided = ROW_COUNT;

  -- ==================== DELETE PRODUCTION RECORD ====================
  -- production_records tidak punya status column - langsung delete

  DELETE FROM production_records
  WHERE id = p_production_id;

  RETURN QUERY SELECT
    TRUE,
    v_materials_restored,
    v_products_consumed,
    v_journals_voided,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, 0, 0, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION void_transaction_atomic(TEXT, UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION void_delivery_atomic(UUID, UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION void_production_atomic(UUID, UUID, TEXT, UUID) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION void_transaction_atomic IS
  'Atomic void transaction: restore inventory + void journals. WAJIB branch_id.';
COMMENT ON FUNCTION void_delivery_atomic IS
  'Atomic void delivery: restore inventory + void journals. WAJIB branch_id.';
COMMENT ON FUNCTION void_production_atomic IS
  'Atomic void production: consume product + restore materials + void journals. WAJIB branch_id.';
