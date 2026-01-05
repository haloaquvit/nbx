-- ============================================================================
-- RPC: Delivery Atomic NO STOCK
-- Purpose: Proses pengiriman TANPA MENGURANGI STOCK DAN TANPA KOMISI
-- Digunakan untuk migrasi data lama
-- ============================================================================

CREATE OR REPLACE FUNCTION process_delivery_atomic_no_stock(
  p_transaction_id TEXT,
  p_items JSONB,              -- Array: [{product_id, quantity, notes, unit, is_bonus, width, height, product_name}]
  p_branch_id UUID,           -- WAJIB: identitas cabang
  p_driver_id UUID DEFAULT NULL,
  p_helper_id UUID DEFAULT NULL,
  p_delivery_date TIMESTAMPTZ DEFAULT NOW(),
  p_notes TEXT DEFAULT NULL,
  p_photo_url TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  delivery_id UUID,
  delivery_number INTEGER,
  total_hpp NUMERIC,
  journal_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_delivery_id UUID;
  v_delivery_number INTEGER;
  v_transaction RECORD;
  v_item JSONB;
  v_total_hpp NUMERIC := 0;
  v_product_id UUID;
  v_qty NUMERIC;
  v_product_name TEXT;
  v_is_bonus BOOLEAN;
  v_item_notes TEXT;
  v_unit TEXT;
  v_width NUMERIC;
  v_height NUMERIC;
  v_total_ordered NUMERIC;
  v_total_delivered NUMERIC;
  v_new_status TEXT;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_transaction_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID,
      'Transaction ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID,
      'No items to deliver'::TEXT;
    RETURN;
  END IF;

  -- Get transaction info
  SELECT
    t.id,
    t.ref,
    t.branch_id,
    t.customer_id,
    t.customer_name,
    t.items,
    t.status,
    t.is_office_sale,
    c.address as customer_address,
    c.phone as customer_phone
  INTO v_transaction
  FROM transactions t
  LEFT JOIN customers c ON c.id = t.customer_id
  WHERE t.id = p_transaction_id AND t.branch_id = p_branch_id;

  IF v_transaction.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID,
      'Transaction not found in this branch'::TEXT;
    RETURN;
  END IF;

  -- ==================== CREATE DELIVERY HEADER ====================

  -- Calculate next delivery number
  SELECT COALESCE(MAX(d.delivery_number), 0) + 1 INTO v_delivery_number
  FROM deliveries d
  WHERE d.transaction_id = p_transaction_id;

  INSERT INTO deliveries (
    transaction_id,
    delivery_number,
    branch_id,
    customer_name,
    customer_address,
    customer_phone,
    driver_id,
    helper_id,
    delivery_date,
    status,
    hpp_total,
    notes,
    photo_url,
    created_at,
    updated_at
  ) VALUES (
    p_transaction_id,
    v_delivery_number,
    p_branch_id,
    v_transaction.customer_name,
    v_transaction.customer_address,
    v_transaction.customer_phone,
    p_driver_id,
    p_helper_id,
    p_delivery_date,
    'delivered',
    0, -- HPP is 0 for legacy data migration
    COALESCE(p_notes, format('Pengiriman ke-%s (Migrasi)', v_delivery_number)),
    p_photo_url,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_delivery_id;

  -- ==================== PROCESS ITEMS (NO STOCK DEDUCTION) ====================

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_product_name := v_item->>'product_name';
    v_is_bonus := COALESCE((v_item->>'is_bonus')::BOOLEAN, FALSE);
    v_item_notes := v_item->>'notes';
    v_unit := v_item->>'unit';
    v_width := (v_item->>'width')::NUMERIC;
    v_height := (v_item->>'height')::NUMERIC;

    IF v_qty > 0 THEN
       -- Insert Delivery Item ONLY
       INSERT INTO delivery_items (
         delivery_id,
         product_id,
         product_name,
         quantity_delivered,
         unit,
         is_bonus,
         width,
         height,
         notes,
         created_at
       ) VALUES (
         v_delivery_id,
         v_product_id,
         v_product_name,
         v_qty,
         COALESCE(v_unit, 'pcs'),
         v_is_bonus,
         v_width,
         v_height,
         v_item_notes,
         NOW()
       );
    END IF;
  END LOOP;

  -- ==================== UPDATE TRANSACTION STATUS ====================

  -- Check total ordered vs total delivered
  SELECT
    COALESCE(SUM(
      CASE WHEN (item->>'_isSalesMeta')::BOOLEAN THEN 0
      ELSE (item->>'quantity')::NUMERIC END
    ), 0)
  INTO v_total_ordered
  FROM jsonb_array_elements(v_transaction.items) item;

  SELECT
    COALESCE(SUM(di.quantity_delivered), 0)
  INTO v_total_delivered
  FROM delivery_items di
  JOIN deliveries d ON d.id = di.delivery_id
  WHERE d.transaction_id = p_transaction_id;

  IF v_total_delivered >= v_total_ordered THEN
    v_new_status := 'Selesai';
  ELSE
    v_new_status := 'Diantar Sebagian';
  END IF;

  UPDATE transactions
  SET
    status = v_new_status,
    delivery_status = 'delivered', -- Legacy field
    delivered_at = NOW(),
    updated_at = NOW()
  WHERE id = p_transaction_id;

  -- NOTE: NO JOURNAL ENTRY CREATED
  -- NOTE: NO COMMISSION ENTRY CREATED

  RETURN QUERY SELECT
    TRUE,
    v_delivery_id,
    v_delivery_number,
    0::NUMERIC, -- Total HPP is 0
    NULL::UUID, -- No Journal
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION process_delivery_atomic_no_stock(TEXT, JSONB, UUID, UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;
