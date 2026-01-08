-- ============================================================================
-- RPC 21: Retasi Management Atomic
-- Purpose: Atomic operations for truck loading (retasi) and returns
-- ============================================================================

-- ============================================================================
-- 1. CREATE RETASI ATOMIC
-- ============================================================================

CREATE OR REPLACE FUNCTION create_retasi_atomic(
  p_branch_id UUID,
  p_driver_name TEXT,
  p_helper_name TEXT DEFAULT NULL,
  p_truck_number TEXT DEFAULT NULL,
  p_route TEXT DEFAULT NULL,
  p_departure_date DATE DEFAULT CURRENT_DATE,
  p_departure_time TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::JSONB, -- Array of {product_id, product_name, quantity, weight, notes}
  p_created_by UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  retasi_id UUID,
  retasi_number TEXT,
  retasi_ke INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_retasi_id UUID := gen_random_uuid();
  v_retasi_number TEXT;
  v_retasi_ke INTEGER;
  v_item RECORD;
BEGIN
  -- ==================== VALIDASI ====================
  
  -- Check if driver has active retasi
  IF EXISTS (
    SELECT 1 FROM retasi 
    WHERE driver_name = p_driver_name 
      AND is_returned = FALSE
      AND (branch_id = p_branch_id OR branch_id IS NULL)
  ) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::INTEGER, 
      format('Supir %s masih memiliki retasi yang belum dikembalikan', p_driver_name)::TEXT;
    RETURN;
  END IF;

  -- Generate Retasi Number: RET-YYYYMMDD-HHMISS
  v_retasi_number := 'RET-' || TO_CHAR(p_departure_date, 'YYYYMMDD') || '-' || TO_CHAR(NOW(), 'HH24MISS');

  -- Count retasi_ke for today
  SELECT COALESCE(COUNT(*), 0) + 1 INTO v_retasi_ke
  FROM retasi
  WHERE driver_name = p_driver_name
    AND departure_date = p_departure_date
    AND (branch_id = p_branch_id OR branch_id IS NULL);

  -- ==================== INSERT RETASI ====================
  
  INSERT INTO retasi (
    id,
    branch_id,
    retasi_number,
    truck_number,
    driver_name,
    helper_name,
    departure_date,
    departure_time,
    route,
    total_items,
    notes,
    retasi_ke,
    is_returned,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_retasi_id,
    p_branch_id,
    v_retasi_number,
    p_truck_number,
    p_driver_name,
    p_helper_name,
    p_departure_date,
    CASE WHEN p_departure_time IS NOT NULL AND p_departure_time != ''
         THEN p_departure_time::TIME
         ELSE NULL
    END,
    p_route,
    (SELECT COALESCE(SUM((item->>'quantity')::NUMERIC), 0) FROM jsonb_array_elements(p_items) AS item),
    p_notes,
    v_retasi_ke,
    FALSE,
    p_created_by,
    NOW(),
    NOW()
  );

  -- ==================== INSERT ITEMS ====================
  
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
    product_id UUID, 
    product_name TEXT, 
    quantity NUMERIC, 
    weight NUMERIC, 
    notes TEXT
  ) LOOP
    INSERT INTO retasi_items (
      retasi_id,
      product_id,
      product_name,
      quantity,
      weight,
      notes,
      created_at
    ) VALUES (
      v_retasi_id,
      v_item.product_id,
      v_item.product_name,
      v_item.quantity,
      v_item.weight,
      v_item.notes,
      NOW()
    );
  END LOOP;

  RETURN QUERY SELECT TRUE, v_retasi_id, v_retasi_number, v_retasi_ke, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::INTEGER, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. MARK RETASI RETURNED ATOMIC
-- ============================================================================
-- Perhitungan HANYA di RPC ini (Single Source of Truth)
-- Frontend cukup kirim data per-item, RPC yang hitung total
-- Untuk data lama tanpa items, frontend kirim manual_totals

CREATE OR REPLACE FUNCTION mark_retasi_returned_atomic(
  p_branch_id UUID,
  p_retasi_id UUID,
  p_return_notes TEXT,
  p_item_returns JSONB, -- Array of {item_id, returned_qty, sold_qty, error_qty, unsold_qty}
  -- Optional: untuk data lama tanpa item details
  p_manual_kembali NUMERIC DEFAULT NULL,
  p_manual_laku NUMERIC DEFAULT NULL,
  p_manual_tidak_laku NUMERIC DEFAULT NULL,
  p_manual_error NUMERIC DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  barang_laku NUMERIC,
  barang_tidak_laku NUMERIC,
  returned_items_count NUMERIC,
  error_items_count NUMERIC,
  error_message TEXT
) AS $$
DECLARE
  v_item RECORD;
  v_total_kembali NUMERIC := 0;    -- SUM of returned_qty (barang kembali utuh)
  v_total_laku NUMERIC := 0;       -- SUM of sold_qty (barang terjual)
  v_total_tidak_laku NUMERIC := 0; -- SUM of unsold_qty (barang tidak laku)
  v_total_error NUMERIC := 0;      -- SUM of error_qty (barang rusak/error)
  v_has_items BOOLEAN := FALSE;
BEGIN
  -- ==================== VALIDASI ====================

  IF NOT EXISTS (SELECT 1 FROM retasi WHERE id = p_retasi_id AND is_returned = FALSE) THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
      'Retasi tidak ditemukan atau sudah dikembalikan'::TEXT;
    RETURN;
  END IF;

  -- ==================== CEK APAKAH ADA ITEM DETAILS ====================

  -- Cek apakah p_item_returns memiliki data
  IF p_item_returns IS NOT NULL AND jsonb_array_length(p_item_returns) > 0 THEN
    v_has_items := TRUE;
  END IF;

  -- ==================== UPDATE ITEMS & HITUNG TOTAL ====================

  IF v_has_items THEN
    -- Ada item details: hitung dari item_returns
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_item_returns) AS x(
      item_id UUID,
      returned_qty NUMERIC,
      sold_qty NUMERIC,
      error_qty NUMERIC,
      unsold_qty NUMERIC
    ) LOOP
      -- Update item dengan nilai yang dikirim
      UPDATE retasi_items
      SET
        returned_qty = COALESCE(v_item.returned_qty, 0),
        sold_qty = COALESCE(v_item.sold_qty, 0),
        error_qty = COALESCE(v_item.error_qty, 0),
        unsold_qty = COALESCE(v_item.unsold_qty, 0)
      WHERE id = v_item.item_id AND retasi_id = p_retasi_id;

      -- Hitung total (SUM, bukan COUNT)
      v_total_kembali := v_total_kembali + COALESCE(v_item.returned_qty, 0);
      v_total_laku := v_total_laku + COALESCE(v_item.sold_qty, 0);
      v_total_tidak_laku := v_total_tidak_laku + COALESCE(v_item.unsold_qty, 0);
      v_total_error := v_total_error + COALESCE(v_item.error_qty, 0);
    END LOOP;
  ELSE
    -- Tidak ada item details (data lama): gunakan manual totals
    v_total_kembali := COALESCE(p_manual_kembali, 0);
    v_total_laku := COALESCE(p_manual_laku, 0);
    v_total_tidak_laku := COALESCE(p_manual_tidak_laku, 0);
    v_total_error := COALESCE(p_manual_error, 0);
  END IF;

  -- ==================== UPDATE RETASI ====================
  -- Rumus: Bawa = Kembali + Laku + Tidak Laku + Error + Selisih
  -- returned_items_count = total qty kembali (bukan count produk)
  -- error_items_count = total qty error (bukan count produk)

  UPDATE retasi
  SET
    is_returned = TRUE,
    return_notes = p_return_notes,
    returned_items_count = v_total_kembali,
    barang_laku = v_total_laku,
    barang_tidak_laku = v_total_tidak_laku,
    error_items_count = v_total_error,
    updated_at = NOW()
  WHERE id = p_retasi_id;

  RETURN QUERY SELECT TRUE, v_total_laku, v_total_tidak_laku, v_total_kembali, v_total_error, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS & COMMENTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_retasi_atomic(UUID, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_retasi_returned_atomic(UUID, UUID, TEXT, JSONB, NUMERIC, NUMERIC, NUMERIC, NUMERIC) TO authenticated;

COMMENT ON FUNCTION create_retasi_atomic IS 'Membuat keberangkatan retasi (loading truck) secara atomik.';
COMMENT ON FUNCTION mark_retasi_returned_atomic IS 'Memproses pengembalian retasi secara atomik.';
