-- ============================================================================
-- RPC 04: Production Atomic
-- Purpose: Proses produksi atomic dengan:
-- - Consume materials (FIFO) - auto-fetch dari BOM
-- - Create production record
-- - Create product inventory batch
-- - Create journal entry
-- PENTING: Semua operasi WAJIB filter by branch_id
-- ============================================================================

-- Drop existing functions (all signatures)
DROP FUNCTION IF EXISTS process_production_atomic(UUID, UUID, NUMERIC, JSONB, UUID, TEXT);
DROP FUNCTION IF EXISTS process_production_atomic(UUID, NUMERIC, BOOLEAN, TEXT, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS process_spoilage_atomic(UUID, UUID, NUMERIC, TEXT, UUID);
DROP FUNCTION IF EXISTS process_spoilage_atomic(UUID, NUMERIC, TEXT, UUID, UUID, TEXT);

-- ============================================================================
-- 1. PROCESS PRODUCTION ATOMIC
-- Proses produksi lengkap dalam satu transaksi
-- Auto-fetch BOM dari product_materials jika p_consume_bom = true
-- ============================================================================

CREATE OR REPLACE FUNCTION process_production_atomic(
  p_product_id UUID,
  p_quantity NUMERIC,
  p_consume_bom BOOLEAN DEFAULT TRUE,
  p_note TEXT DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,        -- WAJIB: identitas cabang
  p_user_id UUID DEFAULT NULL,
  p_user_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  production_id UUID,
  production_ref TEXT,
  total_material_cost NUMERIC,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_production_id UUID;
  v_ref TEXT;
  v_bom_item RECORD;
  v_consume_result RECORD;
  v_total_material_cost NUMERIC := 0;
  v_material_details TEXT := '';
  v_bom_snapshot JSONB := '[]'::JSONB;
  v_product RECORD;
  v_journal_id UUID;
  v_entry_number TEXT;
  v_persediaan_barang_id TEXT;  -- accounts.id is TEXT not UUID
  v_persediaan_bahan_id TEXT;   -- accounts.id is TEXT not UUID
  v_unit_cost NUMERIC;
  v_required_qty NUMERIC;
  v_available_stock NUMERIC;
  v_material_name TEXT;
  v_seq INTEGER;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_product_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID,
      'Product ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID,
      'Quantity must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get product info
  SELECT id, name INTO v_product
  FROM products WHERE id = p_product_id;

  IF v_product.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID,
      'Product not found'::TEXT;
    RETURN;
  END IF;

  -- ==================== GENERATE REFERENCE ====================

  v_ref := 'PRD-' || TO_CHAR(NOW(), 'YYMMDD') || '-' ||
    LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');

  -- ==================== CONSUME MATERIALS (FIFO) ====================

  IF p_consume_bom THEN
    -- Fetch BOM from product_materials
    FOR v_bom_item IN
      SELECT
        pm.material_id,
        pm.quantity as bom_qty,
        m.name as material_name,
        m.unit as material_unit
      FROM product_materials pm
      JOIN materials m ON m.id = pm.material_id
      WHERE pm.product_id = p_product_id
    LOOP
      v_required_qty := v_bom_item.bom_qty * p_quantity;

      -- Check stock availability first
      SELECT COALESCE(SUM(remaining_quantity), 0)
      INTO v_available_stock
      FROM inventory_batches
      WHERE material_id = v_bom_item.material_id
        AND (branch_id = p_branch_id OR branch_id IS NULL)
        AND remaining_quantity > 0;

      IF v_available_stock < v_required_qty THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID,
          format('Stok %s tidak cukup: butuh %s, tersedia %s',
            v_bom_item.material_name, v_required_qty, v_available_stock)::TEXT;
        RETURN;
      END IF;

      -- Call consume_material_fifo
      -- Note: using 6th arg default NULL
      SELECT * INTO v_consume_result
      FROM consume_material_fifo(
        v_bom_item.material_id,
        p_branch_id,
        v_required_qty,
        v_ref,
        'production'
      );

      IF NOT v_consume_result.success THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID,
          v_consume_result.error_message;
        RETURN;
      END IF;

      v_total_material_cost := v_total_material_cost + v_consume_result.total_cost;

      -- Build material details for journal notes
      v_material_details := v_material_details ||
        v_bom_item.material_name || ' x' || v_required_qty ||
        ' (Rp' || ROUND(v_consume_result.total_cost) || '), ';

      -- Build BOM snapshot for record
      v_bom_snapshot := v_bom_snapshot || jsonb_build_object(
        'id', gen_random_uuid(),
        'materialId', v_bom_item.material_id,
        'materialName', v_bom_item.material_name,
        'quantity', v_bom_item.bom_qty,
        'unit', v_bom_item.material_unit,
        'consumed', v_required_qty,
        'cost', v_consume_result.total_cost
      );
    END LOOP;
  END IF;

  -- Calculate unit cost for produced product
  v_unit_cost := CASE WHEN p_quantity > 0 AND v_total_material_cost > 0
    THEN v_total_material_cost / p_quantity ELSE 0 END;

  -- ==================== CREATE PRODUCTION RECORD ====================

  INSERT INTO production_records (
    ref,
    product_id,
    quantity,
    note,
    consume_bom,
    bom_snapshot,
    created_by,
    user_input_id,
    user_input_name,
    branch_id,
    created_at,
    updated_at
  ) VALUES (
    v_ref,
    p_product_id,
    p_quantity,
    p_note,
    p_consume_bom,
    CASE WHEN jsonb_array_length(v_bom_snapshot) > 0 THEN v_bom_snapshot ELSE NULL END,
    COALESCE(p_user_id, '00000000-0000-0000-0000-000000000000'::UUID),  -- Required NOT NULL
    p_user_id,
    COALESCE(p_user_name, 'System'),
    p_branch_id,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_production_id;

  -- ==================== CREATE PRODUCT INVENTORY BATCH ====================

  IF p_consume_bom AND v_total_material_cost > 0 THEN
    INSERT INTO inventory_batches (
      product_id,
      branch_id,
      initial_quantity,
      remaining_quantity,
      unit_cost,
      batch_date,
      notes,
      production_id
    ) VALUES (
      p_product_id,
      p_branch_id,
      p_quantity,
      p_quantity,
      v_unit_cost,
      NOW(),
      format('Produksi %s', v_ref),
      v_production_id
    );
  END IF;

  -- ==================== CREATE JOURNAL ENTRY ====================

  IF p_consume_bom AND v_total_material_cost > 0 THEN
    -- Get account IDs
    SELECT id INTO v_persediaan_barang_id
    FROM accounts
    WHERE code = '1310' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;

    SELECT id INTO v_persediaan_bahan_id
    FROM accounts
    WHERE code = '1320' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;

    IF v_persediaan_barang_id IS NOT NULL AND v_persediaan_bahan_id IS NOT NULL THEN
      -- Generate entry number
      -- Fix: Use MAX sequence instead of COUNT to prevent duplicates
      SELECT COALESCE(MAX(NULLIF(regexp_replace(entry_number, '.*-', ''), '')::INTEGER), 0) + 1
      INTO v_seq
      FROM journal_entries
      WHERE branch_id = p_branch_id
        AND entry_number LIKE 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-%';

      v_entry_number := 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
        LPAD(v_seq::TEXT, 4, '0');

      -- Create journal header as draft
      INSERT INTO journal_entries (
        entry_number,
        entry_date,
        description,
        reference_type,
        reference_id,
        branch_id,
        status,
        total_debit,
        total_credit
      ) VALUES (
        v_entry_number,
        NOW(),
        format('Produksi %s: %s x%s', v_ref, v_product.name, p_quantity),
        'production',
        v_production_id::TEXT,
        p_branch_id,
        'draft',
        v_total_material_cost,
        v_total_material_cost
      )
      RETURNING id INTO v_journal_id;

      -- Dr. Persediaan Barang Dagang (1310)
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        line_number,
        account_id,
        description,
        debit_amount,
        credit_amount
      ) VALUES (
        v_journal_id,
        1,
        v_persediaan_barang_id,
        format('Hasil produksi: %s x%s', v_product.name, p_quantity),
        v_total_material_cost,
        0
      );

      -- Cr. Persediaan Bahan Baku (1320)
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        line_number,
        account_id,
        description,
        debit_amount,
        credit_amount
      ) VALUES (
        v_journal_id,
        2,
        v_persediaan_bahan_id,
        format('Bahan terpakai: %s', RTRIM(v_material_details, ', ')),
        0,
        v_total_material_cost
      );

      -- Post the journal
      UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
    END IF;
  END IF;

  -- Note: Stok produk sekarang di-track via inventory_batches (FIFO)
  -- Tidak perlu log ke stock_movements karena inventory_batches sudah dibuat di atas

  RETURN QUERY SELECT
    TRUE,
    v_production_id,
    v_ref,
    v_total_material_cost,
    v_journal_id,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. PROCESS SPOILAGE ATOMIC
-- Catat material rusak dengan journal entry
-- ============================================================================

CREATE OR REPLACE FUNCTION process_spoilage_atomic(
  p_material_id UUID,
  p_quantity NUMERIC,
  p_note TEXT DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,        -- WAJIB: identitas cabang
  p_user_id UUID DEFAULT NULL,
  p_user_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  record_id UUID,
  record_ref TEXT,
  spoilage_cost NUMERIC,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_record_id UUID;
  v_ref TEXT;
  v_consume_result RECORD;
  v_spoilage_cost NUMERIC := 0;
  v_material RECORD;
  v_journal_id UUID;
  v_entry_number TEXT;
  v_beban_lain_id TEXT;         -- accounts.id is TEXT not UUID
  v_persediaan_bahan_id TEXT;   -- accounts.id is TEXT not UUID
  v_seq INTEGER;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_material_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID,
      'Material ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID,
      'Quantity must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get material info
  SELECT id, name, unit, stock INTO v_material
  FROM materials WHERE id = p_material_id;

  IF v_material.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID,
      'Material not found'::TEXT;
    RETURN;
  END IF;

  -- ==================== GENERATE REFERENCE ====================

  v_ref := 'ERR-' || TO_CHAR(NOW(), 'YYMMDD') || '-' ||
    LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');

  -- ==================== CONSUME MATERIAL (FIFO) ====================
  -- This will deduct stock from batches and log to material_stock_movements

  SELECT * INTO v_consume_result
  FROM consume_material_fifo(
    p_material_id,
    p_branch_id,
    p_quantity,
    v_ref,
    'spoilage',
    format('Bahan rusak: %s', COALESCE(p_note, 'Tidak ada catatan'))  -- 6th arg: Custom note
  );

  IF NOT v_consume_result.success THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID,
      v_consume_result.error_message;
    RETURN;
  END IF;

  v_spoilage_cost := v_consume_result.total_cost;

  -- ==================== UPDATE MATERIALS.STOCK (backward compat) ====================
  -- REMOVED: consume_material_fifo already updates the legacy stock column.
  --          Keeping it here would cause double deduction.

  -- ==================== CREATE PRODUCTION RECORD (as error) ====================

  INSERT INTO production_records (
    ref,
    product_id,
    quantity,
    note,
    consume_bom,
    created_by,
    user_input_id,
    user_input_name,
    branch_id,
    created_at,
    updated_at
  ) VALUES (
    v_ref,
    NULL,  -- No product for spoilage
    -p_quantity,  -- Negative quantity indicates error/spoilage
    format('BAHAN RUSAK: %s - %s', v_material.name, COALESCE(p_note, 'Tidak ada catatan')),
    FALSE,
    p_user_id,
    p_user_id,
    COALESCE(p_user_name, 'System'),
    p_branch_id,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_record_id;

  -- ==================== LOG MATERIAL MOVEMENT ====================
  -- REMOVED: consume_material_fifo already logs to material_stock_movements with correct Reason.
  --          Double logging caused constraint errors and redundant data.

  -- ==================== CREATE JOURNAL ENTRY ====================

  IF v_spoilage_cost > 0 THEN
    SELECT id INTO v_beban_lain_id
    FROM accounts
    WHERE code = '8100' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;

    SELECT id INTO v_persediaan_bahan_id
    FROM accounts
    WHERE code = '1320' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;

    IF v_beban_lain_id IS NOT NULL AND v_persediaan_bahan_id IS NOT NULL THEN
      -- Fix sequence
      SELECT COALESCE(MAX(NULLIF(regexp_replace(entry_number, '.*-', ''), '')::INTEGER), 0) + 1
      INTO v_seq
      FROM journal_entries
      WHERE branch_id = p_branch_id
        AND entry_number LIKE 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-%';

      v_entry_number := 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
        LPAD(v_seq::TEXT, 4, '0');

      INSERT INTO journal_entries (
        entry_number,
        entry_date,
        description,
        reference_type,
        reference_id,
        branch_id,
        status,
        total_debit,
        total_credit
      ) VALUES (
        v_entry_number,
        NOW(),
        format('Bahan Rusak %s: %s x%s %s', v_ref, v_material.name, p_quantity, COALESCE(v_material.unit, 'pcs')),
        'adjustment',
        v_record_id::TEXT,
        p_branch_id,
        'draft',
        v_spoilage_cost,
        v_spoilage_cost
      )
      RETURNING id INTO v_journal_id;

      -- Dr. Beban Lain-lain (8100)
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        line_number,
        account_id,
        description,
        debit_amount,
        credit_amount
      ) VALUES (
        v_journal_id,
        1,
        v_beban_lain_id,
        format('Bahan rusak: %s x%s', v_material.name, p_quantity),
        v_spoilage_cost,
        0
      );

      -- Cr. Persediaan Bahan Baku (1320)
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        line_number,
        account_id,
        description,
        debit_amount,
        credit_amount
      ) VALUES (
        v_journal_id,
        2,
        v_persediaan_bahan_id,
        format('Bahan keluar: %s x%s', v_material.name, p_quantity),
        0,
        v_spoilage_cost
      );

      UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
    END IF;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    v_record_id,
    v_ref,
    v_spoilage_cost,
    v_journal_id,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT EXECUTE ON FUNCTION process_production_atomic(UUID, NUMERIC, BOOLEAN, TEXT, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION process_spoilage_atomic(UUID, NUMERIC, TEXT, UUID, UUID, TEXT) TO authenticated;
