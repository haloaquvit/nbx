-- ============================================================================
-- RPC 08: Purchase Order Atomic
-- Purpose: Proses penerimaan PO dengan:
-- - Add inventory batches (FIFO tracking)
-- - Update material/product stock
-- - Create material movements
-- PENTING: Semua operasi WAJIB filter by branch_id
-- ============================================================================

-- Drop existing functions
DROP FUNCTION IF EXISTS receive_po_atomic(UUID, UUID, DATE, UUID, TEXT);

-- ============================================================================
-- 1. RECEIVE PO ATOMIC
-- Terima barang dari PO, tambahkan ke inventory batch untuk FIFO tracking
-- ============================================================================

CREATE OR REPLACE FUNCTION receive_po_atomic(
  p_po_id UUID,
  p_branch_id UUID,           -- WAJIB: identitas cabang
  p_received_date DATE DEFAULT CURRENT_DATE,
  p_user_id UUID DEFAULT NULL,
  p_user_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  materials_received INTEGER,
  products_received INTEGER,
  batches_created INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_po RECORD;
  v_item RECORD;
  v_material RECORD;
  v_materials_received INTEGER := 0;
  v_products_received INTEGER := 0;
  v_batches_created INTEGER := 0;
  v_previous_stock NUMERIC;
  v_new_stock NUMERIC;
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
  SELECT
    po.id,
    po.status,
    po.supplier_id,
    po.supplier_name,
    po.material_id,
    po.material_name,
    po.quantity,
    po.unit_price,
    po.branch_id
  INTO v_po
  FROM purchase_orders po
  WHERE po.id = p_po_id AND po.branch_id = p_branch_id;

  IF v_po.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0,
      'Purchase Order not found in this branch'::TEXT;
    RETURN;
  END IF;

  IF v_po.status = 'Diterima' THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0,
      'Purchase Order sudah diterima sebelumnya'::TEXT;
    RETURN;
  END IF;

  IF v_po.status NOT IN ('Approved', 'Pending') THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0,
      format('Status PO harus Approved atau Pending, status saat ini: %s', v_po.status)::TEXT;
    RETURN;
  END IF;

  -- ==================== PROCESS MULTI-ITEM PO ====================

  FOR v_item IN
    SELECT
      poi.id,
      poi.material_id,
      poi.product_id,
      poi.item_type,
      poi.quantity,
      poi.unit_price,
      poi.unit,
      poi.material_name,
      poi.product_name,
      m.name as material_name_from_rel,
      m.stock as material_current_stock,
      p.name as product_name_from_rel
    FROM purchase_order_items poi
    LEFT JOIN materials m ON m.id = poi.material_id
    LEFT JOIN products p ON p.id = poi.product_id
    WHERE poi.purchase_order_id = p_po_id
  LOOP
    IF v_item.material_id IS NOT NULL THEN
      -- ==================== PROCESS MATERIAL ====================
      v_previous_stock := COALESCE(v_item.material_current_stock, 0);
      v_new_stock := v_previous_stock + v_item.quantity;

      -- Update material stock
      UPDATE materials
      SET stock = v_new_stock,
          updated_at = NOW()
      WHERE id = v_item.material_id;

      -- Create material movement record
      INSERT INTO material_stock_movements (
        material_id,
        material_name,
        movement_type,
        reason,
        quantity,
        previous_stock,
        new_stock,
        reference_id,
        reference_type,
        notes,
        user_id,
        user_name,
        branch_id,
        created_at
      ) VALUES (
        v_item.material_id,
        COALESCE(v_item.material_name_from_rel, v_item.material_name, 'Unknown'),
        'IN',
        'PURCHASE',
        v_item.quantity,
        v_previous_stock,
        v_new_stock,
        p_po_id::TEXT,
        'purchase_order',
        format('PO %s - Stock received', p_po_id),
        p_user_id,
        p_user_name,
        p_branch_id,
        NOW()
      );

      -- Create inventory batch for FIFO tracking
      INSERT INTO inventory_batches (
        material_id,
        branch_id,
        purchase_order_id,
        supplier_id,
        initial_quantity,
        remaining_quantity,
        unit_cost,
        batch_date,
        notes,
        created_at
      ) VALUES (
        v_item.material_id,
        p_branch_id,
        p_po_id,
        v_po.supplier_id,
        v_item.quantity,
        v_item.quantity,
        COALESCE(v_item.unit_price, 0),
        p_received_date,
        format('PO %s - %s', p_po_id, COALESCE(v_item.material_name_from_rel, v_item.material_name, 'Unknown')),
        NOW()
      );

      v_materials_received := v_materials_received + 1;
      v_batches_created := v_batches_created + 1;

    ELSIF v_item.product_id IS NOT NULL THEN
      -- ==================== PROCESS PRODUCT ====================
      -- products.current_stock is DEPRECATED - stock derived from inventory_batches
      -- Only create inventory_batches, stock will be calculated via v_product_current_stock VIEW

      -- Create inventory batch for FIFO tracking - this IS the stock
      INSERT INTO inventory_batches (
        product_id,
        branch_id,
        purchase_order_id,
        supplier_id,
        initial_quantity,
        remaining_quantity,
        unit_cost,
        batch_date,
        notes,
        created_at
      ) VALUES (
        v_item.product_id,
        p_branch_id,
        p_po_id,
        v_po.supplier_id,
        v_item.quantity,
        v_item.quantity,
        COALESCE(v_item.unit_price, 0),
        p_received_date,
        format('PO %s - %s', p_po_id, COALESCE(v_item.product_name_from_rel, v_item.product_name, 'Unknown')),
        NOW()
      );

      v_products_received := v_products_received + 1;
      v_batches_created := v_batches_created + 1;
    END IF;
  END LOOP;

  -- ==================== PROCESS LEGACY SINGLE-ITEM PO ====================
  -- For backward compatibility with old PO format (material_id on PO table)

  IF v_materials_received = 0 AND v_products_received = 0 AND v_po.material_id IS NOT NULL THEN
    -- Get current material stock
    SELECT stock INTO v_previous_stock
    FROM materials
    WHERE id = v_po.material_id;

    v_previous_stock := COALESCE(v_previous_stock, 0);
    v_new_stock := v_previous_stock + v_po.quantity;

    -- Update material stock
    UPDATE materials
    SET stock = v_new_stock,
        updated_at = NOW()
    WHERE id = v_po.material_id;

    -- Create material movement record
    INSERT INTO material_stock_movements (
      material_id,
      material_name,
      movement_type,
      reason,
      quantity,
      previous_stock,
      new_stock,
      reference_id,
      reference_type,
      notes,
      user_id,
      user_name,
      branch_id,
      created_at
    ) VALUES (
      v_po.material_id,
      v_po.material_name,
      'IN',
      'PURCHASE',
      v_po.quantity,
      v_previous_stock,
      v_new_stock,
      p_po_id::TEXT,
      'purchase_order',
      format('PO %s - Stock received (legacy)', p_po_id),
      p_user_id,
      p_user_name,
      p_branch_id,
      NOW()
    );

    -- Create inventory batch
    INSERT INTO inventory_batches (
      material_id,
      branch_id,
      purchase_order_id,
      supplier_id,
      initial_quantity,
      remaining_quantity,
      unit_cost,
      batch_date,
      notes,
      created_at
    ) VALUES (
      v_po.material_id,
      p_branch_id,
      p_po_id,
      v_po.supplier_id,
      v_po.quantity,
      v_po.quantity,
      COALESCE(v_po.unit_price, 0),
      p_received_date,
      format('PO %s - %s (legacy)', p_po_id, v_po.material_name),
      NOW()
    );

    v_materials_received := 1;
    v_batches_created := 1;
  END IF;

  -- ==================== UPDATE PO STATUS ====================

  UPDATE purchase_orders
  SET
    status = 'Diterima',
    received_date = p_received_date,
    updated_at = NOW()
  WHERE id = p_po_id;

  RETURN QUERY SELECT
    TRUE,
    v_materials_received,
    v_products_received,
    v_batches_created,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, 0, 0, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. DELETE PO ATOMIC
-- Hapus PO dengan validasi dan rollback
-- ============================================================================

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
  v_batches_deleted INTEGER := 0;
  v_stock_rolled_back INTEGER := 0;
  v_journals_voided INTEGER := 0;
  v_current_stock NUMERIC;
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

  -- ==================== VOID JOURNALS ====================

  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = format('PO %s dihapus', p_po_id),
    updated_at = NOW()
  WHERE reference_id = p_po_id::TEXT
    AND branch_id = p_branch_id
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_journals_voided = ROW_COUNT;

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


-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION receive_po_atomic(UUID, UUID, DATE, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_po_atomic(UUID, UUID, BOOLEAN) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION receive_po_atomic IS
  'Atomic PO receive: add inventory batches + update stock + create movements. WAJIB branch_id.';
COMMENT ON FUNCTION delete_po_atomic IS
  'Atomic PO delete: validate + rollback stock + void journals + delete records. WAJIB branch_id.';
