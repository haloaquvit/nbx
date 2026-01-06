-- ============================================================================
-- RPC 16: Purchase Order Management Atomic (FIXED - Prevent Duplicates)
-- Purpose: Pembuatan dan Persetujuan PO secara atomik
-- CHANGE: Added duplicate check to prevent double journal/AP creation
-- ============================================================================

-- 1. CREATE PURCHASE ORDER ATOMIC (No changes)
CREATE OR REPLACE FUNCTION create_purchase_order_atomic(
  p_po_header JSONB,
  p_po_items JSONB,
  p_branch_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  po_id TEXT,
  error_message TEXT
) AS $$
DECLARE
  v_po_id TEXT;
  v_item JSONB;
BEGIN
  -- Validate required fields
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 'Branch ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_po_header->>'supplier_id' IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 'Supplier ID is required'::TEXT;
    RETURN;
  END IF;

  -- Generate PO ID if not provided
  v_po_id := p_po_header->>'id';
  IF v_po_id IS NULL THEN
    v_po_id := 'PO-' || EXTRACT(EPOCH FROM NOW())::TEXT;
  END IF;

  -- Insert Header
  INSERT INTO purchase_orders (
    id,
    po_number,
    status,
    requested_by,
    supplier_id,
    supplier_name,
    total_cost,
    subtotal,
    include_ppn,
    ppn_mode,
    ppn_amount,
    expedition,
    order_date,
    expected_delivery_date,
    notes,
    branch_id,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_po_id,
    p_po_header->>'po_number',
    'Pending',
    COALESCE(p_po_header->>'requested_by', 'System'),
    (p_po_header->>'supplier_id')::UUID,
    p_po_header->>'supplier_name',
    (p_po_header->>'total_cost')::NUMERIC,
    (p_po_header->>'subtotal')::NUMERIC,
    COALESCE((p_po_header->>'include_ppn')::BOOLEAN, FALSE),
    COALESCE(p_po_header->>'ppn_mode', 'exclude'),
    COALESCE((p_po_header->>'ppn_amount')::NUMERIC, 0),
    p_po_header->>'expedition',
    COALESCE((p_po_header->>'order_date')::TIMESTAMP, NOW()),
    (p_po_header->>'expected_delivery_date')::TIMESTAMP,
    p_po_header->>'notes',
    p_branch_id,
    auth.uid(),
    NOW(),
    NOW()
  );

  -- Insert Items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_po_items)
  LOOP
    INSERT INTO purchase_order_items (
      purchase_order_id,
      material_id,
      product_id,
      material_name,
      product_name,
      item_type,
      quantity,
      unit_price,
      unit,
      subtotal,
      notes
    ) VALUES (
      v_po_id,
      (v_item->>'material_id')::UUID,
      (v_item->>'product_id')::UUID,
      v_item->>'material_name',
      v_item->>'product_name',
      COALESCE(v_item->>'item_type', CASE WHEN v_item->>'material_id' IS NOT NULL THEN 'material' ELSE 'product' END),
      (v_item->>'quantity')::NUMERIC,
      (v_item->>'unit_price')::NUMERIC,
      v_item->>'unit',
      COALESCE((v_item->>'subtotal')::NUMERIC, (v_item->>'quantity')::NUMERIC * (v_item->>'unit_price')::NUMERIC),
      v_item->>'notes'
    );
  END LOOP;

  RETURN QUERY SELECT TRUE, v_po_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::TEXT, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. APPROVE PURCHASE ORDER ATOMIC (FIXED - Added Duplicate Check)
-- Set status Approved, buat Jurnal (Persediaan vs Hutang), dan buat Accounts Payable
CREATE OR REPLACE FUNCTION approve_purchase_order_atomic(
  p_po_id TEXT,
  p_branch_id UUID,
  p_user_id UUID,
  p_user_name TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  journal_ids UUID[],
  ap_id TEXT,
  error_message TEXT
) AS $$
DECLARE
  v_po RECORD;
  v_item RECORD;
  v_journal_id UUID;
  v_journal_ids UUID[] := ARRAY[]::UUID[];
  v_ap_id TEXT;
  v_entry_number TEXT;
  v_acc_persediaan_bahan UUID;
  v_acc_persediaan_produk UUID;
  v_acc_hutang_usaha UUID;
  v_acc_piutang_pajak UUID;
  v_total_material NUMERIC := 0;
  v_total_product NUMERIC := 0;
  v_material_ppn NUMERIC := 0;
  v_product_ppn NUMERIC := 0;
  v_material_names TEXT := '';
  v_product_names TEXT := '';
  v_subtotal_all NUMERIC := 0;
  v_days INTEGER;
  v_due_date DATE;
  v_supplier_terms TEXT;
  v_existing_journal_count INTEGER;
  v_existing_ap_count INTEGER;
BEGIN
  -- 1. Get PO Header
  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id AND branch_id = p_branch_id;
  IF v_po.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID[], NULL::TEXT, 'Purchase Order tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  IF v_po.status <> 'Pending' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID[], NULL::TEXT, 'Hanya PO status Pending yang bisa disetujui'::TEXT;
    RETURN;
  END IF;

  -- 🔥 NEW: Check if journal already exists for this PO
  SELECT COUNT(*) INTO v_existing_journal_count
  FROM journal_entries
  WHERE reference_id = p_po_id
    AND reference_type = 'purchase_order'
    AND is_voided = FALSE;

  IF v_existing_journal_count > 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID[], NULL::TEXT, 
      format('Journal sudah ada untuk PO ini (%s entries). Tidak dapat approve lagi.', v_existing_journal_count)::TEXT;
    RETURN;
  END IF;

  -- 🔥 NEW: Check if AP already exists for this PO
  SELECT COUNT(*) INTO v_existing_ap_count
  FROM accounts_payable
  WHERE purchase_order_id = p_po_id;

  IF v_existing_ap_count > 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID[], NULL::TEXT, 
      'Accounts Payable sudah ada untuk PO ini. Tidak dapat approve lagi.'::TEXT;
    RETURN;
  END IF;

  -- 2. Get Accounts
  SELECT id INTO v_acc_persediaan_bahan FROM accounts WHERE code = '1320' AND branch_id = p_branch_id LIMIT 1;
  SELECT id INTO v_acc_persediaan_produk FROM accounts WHERE code = '1310' AND branch_id = p_branch_id LIMIT 1;
  SELECT id INTO v_acc_hutang_usaha FROM accounts WHERE code = '2110' AND branch_id = p_branch_id LIMIT 1;
  SELECT id INTO v_acc_piutang_pajak FROM accounts WHERE code = '1230' AND branch_id = p_branch_id LIMIT 1;

  IF v_acc_hutang_usaha IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID[], NULL::TEXT, 'Akun Hutang Usaha (2110) tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- 3. Calculate Totals and Names
  FOR v_item IN SELECT * FROM purchase_order_items WHERE purchase_order_id = p_po_id LOOP
    v_subtotal_all := v_subtotal_all + COALESCE(v_item.subtotal, 0);
    IF v_item.item_type = 'material' OR v_item.material_id IS NOT NULL THEN
      v_total_material := v_total_material + COALESCE(v_item.subtotal, 0);
      v_material_names := v_material_names || v_item.material_name || ' x' || v_item.quantity || ', ';
    ELSE
      v_total_product := v_total_product + COALESCE(v_item.subtotal, 0);
      v_product_names := v_product_names || v_item.product_name || ' x' || v_item.quantity || ', ';
    END IF;
  END LOOP;

  v_material_names := RTRIM(v_material_names, ', ');
  v_product_names := RTRIM(v_product_names, ', ');

  -- Proportional PPN
  IF v_po.include_ppn AND v_po.ppn_amount > 0 AND v_subtotal_all > 0 THEN
    v_material_ppn := ROUND(v_po.ppn_amount * (v_total_material / v_subtotal_all));
    v_product_ppn := v_po.ppn_amount - v_material_ppn;
  END IF;

  -- 4. Create Material Journal
  IF v_total_material > 0 THEN
    IF v_acc_persediaan_bahan IS NULL THEN
      RETURN QUERY SELECT FALSE, NULL::UUID[], NULL::TEXT, 'Akun Persediaan Bahan Baku (1320) tidak ditemukan'::TEXT;
      RETURN;
    END IF;

    v_entry_number := 'JE-PO-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM()*10000)::TEXT, 4, '0');
    
    INSERT INTO journal_entries(entry_number, entry_date, description, reference_type, reference_id, branch_id, status, total_debit, total_credit)
    VALUES (v_entry_number, NOW(), 'Pembelian Bahan Baku: ' || v_po.supplier_name || ' (' || p_po_id || ')', 'purchase_order', p_po_id, p_branch_id, 'posted', v_total_material + v_material_ppn, v_total_material + v_material_ppn)
    RETURNING id INTO v_journal_id;
    
    v_journal_ids := array_append(v_journal_ids, v_journal_id);

    -- Dr. Persediaan Bahan Baku
    INSERT INTO journal_entry_lines(journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
    VALUES (v_journal_id, 1, v_acc_persediaan_bahan, 'Persediaan: ' || v_material_names, v_total_material, 0);
    
    -- Dr. Piutang Pajak (PPN Masukan) jika ada
    IF v_material_ppn > 0 AND v_acc_piutang_pajak IS NOT NULL THEN
      INSERT INTO journal_entry_lines(journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
      VALUES (v_journal_id, 2, v_acc_piutang_pajak, 'PPN Masukan (PO ' || p_po_id || ')', v_material_ppn, 0);
    END IF;

    -- Cr. Hutang Usaha
    INSERT INTO journal_entry_lines(journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
    VALUES (v_journal_id, 3, v_acc_hutang_usaha, 'Hutang: ' || v_po.supplier_name, 0, v_total_material + v_material_ppn);
  END IF;

  -- 5. Create Product Journal
  IF v_total_product > 0 THEN
    IF v_acc_persediaan_produk IS NULL THEN
      RETURN QUERY SELECT FALSE, NULL::UUID[], NULL::TEXT, 'Akun Persediaan Barang Dagang (1310) tidak ditemukan'::TEXT;
      RETURN;
    END IF;

    v_entry_number := 'JE-PO-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM()*10000)::TEXT, 4, '1');
    
    INSERT INTO journal_entries(entry_number, entry_date, description, reference_type, reference_id, branch_id, status, total_debit, total_credit)
    VALUES (v_entry_number, NOW(), 'Pembelian Produk Jadi: ' || v_po.supplier_name || ' (' || p_po_id || ')', 'purchase_order', p_po_id, p_branch_id, 'posted', v_total_product + v_product_ppn, v_total_product + v_product_ppn)
    RETURNING id INTO v_journal_id;
    
    v_journal_ids := array_append(v_journal_ids, v_journal_id);

    -- Dr. Persediaan Produk Jadi
    INSERT INTO journal_entry_lines(journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
    VALUES (v_journal_id, 1, v_acc_persediaan_produk, 'Persediaan: ' || v_product_names, v_total_product, 0);
    
    -- Dr. Piutang Pajak (PPN Masukan) jika ada
    IF v_product_ppn > 0 AND v_acc_piutang_pajak IS NOT NULL THEN
      INSERT INTO journal_entry_lines(journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
      VALUES (v_journal_id, 2, v_acc_piutang_pajak, 'PPN Masukan (PO ' || p_po_id || ')', v_product_ppn, 0);
    END IF;

    -- Cr. Hutang Usaha
    INSERT INTO journal_entry_lines(journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
    VALUES (v_journal_id, 3, v_acc_hutang_usaha, 'Hutang: ' || v_po.supplier_name, 0, v_total_product + v_product_ppn);
  END IF;

  -- 6. Create Accounts Payable (AP)
  v_due_date := NOW()::DATE + INTERVAL '30 days'; -- Default
  SELECT payment_terms INTO v_supplier_terms FROM suppliers WHERE id = v_po.supplier_id;
  IF v_supplier_terms ILIKE '%net%' THEN
    v_days := (regexp_matches(v_supplier_terms, '\\d+'))[1]::INTEGER;
    v_due_date := NOW()::DATE + (v_days || ' days')::INTERVAL;
  ELSIF v_supplier_terms ILIKE '%cash%' THEN
    v_due_date := NOW()::DATE;
  END IF;

  v_ap_id := 'AP-PO-' || p_po_id;

  INSERT INTO accounts_payable (
    id, purchase_order_id, supplier_id, supplier_name, amount, due_date,
    description, status, paid_amount, branch_id, created_at
  ) VALUES (
    v_ap_id, p_po_id, v_po.supplier_id, v_po.supplier_name, v_po.total_cost, v_due_date,
    'Purchase Order ' || p_po_id || ' - ' || COALESCE(v_material_names, '') || COALESCE(v_product_names, ''), 
    'Outstanding', 0, p_branch_id, NOW()
  );

  -- 7. Update PO Status
  UPDATE purchase_orders
  SET
    status = 'Approved',
    approved_at = NOW(),
    approved_by = p_user_name,
    updated_at = NOW()
  WHERE id = p_po_id;

  RETURN QUERY SELECT TRUE, v_journal_ids, v_ap_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID[], NULL::TEXT, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- GRANTS
GRANT EXECUTE ON FUNCTION create_purchase_order_atomic(JSONB, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_purchase_order_atomic(TEXT, UUID, UUID, TEXT) TO authenticated;

-- COMMENTS
COMMENT ON FUNCTION approve_purchase_order_atomic IS
  'FIXED: Added duplicate check to prevent double journal/AP creation. Creates journal (Dr. Persediaan, Cr. Hutang) and AP record.';
