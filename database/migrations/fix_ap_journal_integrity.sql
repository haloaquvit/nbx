-- Migration: Fix Accounts Payable Deletion and PO Deletion Logic (Journal Integrity)

-- 1. Create delete_accounts_payable_atomic function
CREATE OR REPLACE FUNCTION delete_accounts_payable_atomic(
  p_payable_id TEXT,
  p_branch_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  journals_voided INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_payable RECORD;
  v_journals_voided INTEGER := 0;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;

  IF p_payable_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Payable ID is required'::TEXT;
    RETURN;
  END IF;

  -- Get Payable info
  SELECT * INTO v_payable
  FROM accounts_payable
  WHERE id = p_payable_id AND branch_id = p_branch_id;

  IF v_payable.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Accounts Payable not found in this branch'::TEXT;
    RETURN;
  END IF;

  -- Check if Paid > 0
  IF v_payable.paid_amount > 0 THEN
    RETURN QUERY SELECT FALSE, 0, 'Tidak dapat menghapus Hutang yang sudah ada pembayaran. Harap hapus pembayaran terlebih dahulu.'::TEXT;
    RETURN;
  END IF;

  -- ==================== VOID JOURNAL ====================

  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = 'Accounts Payable deleted',
    updated_at = NOW()
  WHERE reference_id = p_payable_id
    AND reference_type = 'accounts_payable'
    AND branch_id = p_branch_id
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_journals_voided = ROW_COUNT;

  -- ==================== DELETE PAYABLE ====================

  DELETE FROM accounts_payable WHERE id = p_payable_id;

  RETURN QUERY SELECT TRUE, v_journals_voided, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Update delete_po_atomic to properly cleanup linked AP Journals
CREATE OR REPLACE FUNCTION delete_po_atomic(
  p_po_id UUID,
  p_branch_id UUID,           -- WAJIB: identitas cabang
  p_skip_validation BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  success BOOLEAN,
  batches_deleted INTEGER,
  stock_rolled_back INTEGER,
  journals_voided INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_po RECORD;
  v_batch RECORD;
  v_ap RECORD;
  v_batches_deleted INTEGER := 0;
  v_stock_rolled_back INTEGER := 0;
  v_journals_voided INTEGER := 0;
  v_current_stock NUMERIC;
  v_rows_affected INTEGER;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_po_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0,
      'Purchase Order ID is required'::TEXT;
    RETURN;
  END IF;

  -- Get PO info
  SELECT id, status INTO v_po
  FROM purchase_orders
  WHERE id = p_po_id AND branch_id = p_branch_id;

  IF v_po.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0,
      'Purchase Order not found in this branch'::TEXT;
    RETURN;
  END IF;

  -- ==================== CHECK IF BATCHES USED ====================
  IF NOT p_skip_validation THEN
    -- Check if any batch has been used (remaining < initial)
    IF EXISTS (
      SELECT 1 FROM inventory_batches
      WHERE purchase_order_id = p_po_id
        AND remaining_quantity < initial_quantity
    ) THEN
      RETURN QUERY SELECT FALSE, 0, 0, 0,
        'Tidak dapat menghapus PO karena batch inventory sudah terpakai (FIFO)'::TEXT;
      RETURN;
    END IF;

    -- Check if any payable has been paid
    IF EXISTS (
      SELECT 1 FROM accounts_payable
      WHERE purchase_order_id = p_po_id
        AND paid_amount > 0
    ) THEN
      RETURN QUERY SELECT FALSE, 0, 0, 0,
        'Tidak dapat menghapus PO karena hutang sudah ada pembayaran'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- ==================== VOID RELATED AP JOURNALS ====================
  -- Fix: Find APs linked to this PO and void their journals
  FOR v_ap IN SELECT id FROM accounts_payable WHERE purchase_order_id = p_po_id AND branch_id = p_branch_id LOOP
    UPDATE journal_entries
    SET
      is_voided = TRUE,
      voided_at = NOW(),
      voided_reason = format('Linked PO %s deleted', p_po_id),
      updated_at = NOW()
    WHERE reference_id = v_ap.id
      AND reference_type = 'accounts_payable'
      AND branch_id = p_branch_id
      AND is_voided = FALSE;
      
    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    v_journals_voided := v_journals_voided + v_rows_affected;
  END LOOP;

  -- ==================== VOID DIRECT PO JOURNALS ====================

  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = format('PO %s dihapus', p_po_id),
    updated_at = NOW()
  WHERE reference_id = p_po_id::TEXT
    AND branch_id = p_branch_id
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  v_journals_voided := v_journals_voided + v_rows_affected;

  -- ==================== ROLLBACK STOCK FROM BATCHES ====================

  FOR v_batch IN
    SELECT id, material_id, product_id, remaining_quantity
    FROM inventory_batches
    WHERE purchase_order_id = p_po_id
  LOOP
    -- Rollback material stock
    IF v_batch.material_id IS NOT NULL THEN
      SELECT stock INTO v_current_stock
      FROM materials
      WHERE id = v_batch.material_id;

      UPDATE materials
      SET stock = GREATEST(0, COALESCE(v_current_stock, 0) - v_batch.remaining_quantity),
          updated_at = NOW()
      WHERE id = v_batch.material_id;

      v_stock_rolled_back := v_stock_rolled_back + 1;
    END IF;

    -- products.current_stock is DEPRECATED - deleting batch auto-updates via VIEW
    IF v_batch.product_id IS NOT NULL THEN
      v_stock_rolled_back := v_stock_rolled_back + 1;
    END IF;

    v_batches_deleted := v_batches_deleted + 1;
  END LOOP;

  -- ==================== DELETE RELATED RECORDS ====================

  -- Delete inventory batches
  DELETE FROM inventory_batches WHERE purchase_order_id = p_po_id;

  -- Delete material movements
  DELETE FROM material_stock_movements
  WHERE reference_id = p_po_id::TEXT
    AND reference_type = 'purchase_order';

  -- Delete accounts payable
  DELETE FROM accounts_payable WHERE purchase_order_id = p_po_id;

  -- Delete PO items
  DELETE FROM purchase_order_items WHERE purchase_order_id = p_po_id;

  -- Delete PO
  DELETE FROM purchase_orders WHERE id = p_po_id;

  RETURN QUERY SELECT
    TRUE,
    v_batches_deleted,
    v_stock_rolled_back,
    v_journals_voided,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, 0, 0, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- GRANT PERMISSION
GRANT EXECUTE ON FUNCTION delete_accounts_payable_atomic(TEXT, UUID) TO authenticated;
