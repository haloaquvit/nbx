-- =====================================================
-- RPC Functions for table: accounts
-- Generated: 2026-01-08T22:26:17.665Z
-- Total functions: 62
-- =====================================================

-- Function: approve_purchase_order_atomic
CREATE OR REPLACE FUNCTION public.approve_purchase_order_atomic(p_po_id text, p_branch_id uuid, p_user_id uuid, p_user_name text)
 RETURNS TABLE(success boolean, journal_ids uuid[], ap_id text, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

  -- ðŸ”¥ NEW: Check if journal already exists for this PO
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

  -- ðŸ”¥ NEW: Check if AP already exists for this PO
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

    DECLARE
       v_journal_lines JSONB := '[]'::JSONB;
       v_journal_res RECORD;
    BEGIN
       -- Dr. Persediaan Bahan Baku
       v_journal_lines := v_journal_lines || jsonb_build_object(
          'account_id', v_acc_persediaan_bahan,
          'debit_amount', v_total_material,
          'credit_amount', 0,
          'description', 'Persediaan: ' || v_material_names
       );
       
       -- Dr. Piutang Pajak (PPN Masukan) jika ada
       IF v_material_ppn > 0 AND v_acc_piutang_pajak IS NOT NULL THEN
          v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_id', v_acc_piutang_pajak,
            'debit_amount', v_material_ppn,
            'credit_amount', 0,
            'description', 'PPN Masukan (PO ' || p_po_id || ')'
          );
       END IF;

       -- Cr. Hutang Usaha
       v_journal_lines := v_journal_lines || jsonb_build_object(
          'account_id', v_acc_hutang_usaha,
          'debit_amount', 0,
          'credit_amount', v_total_material + v_material_ppn,
          'description', 'Hutang: ' || v_po.supplier_name
       );

       SELECT * INTO v_journal_res FROM create_journal_atomic(
         p_branch_id,
         CURRENT_DATE,
         'Pembelian Bahan Baku: ' || v_po.supplier_name || ' (' || p_po_id || ')',
         'purchase_order',
         p_po_id,
         v_journal_lines,
         TRUE
       );

       IF v_journal_res.success THEN
         v_journal_ids := array_append(v_journal_ids, v_journal_res.journal_id);
       ELSE
         RAISE EXCEPTION 'Gagal membuat jurnal bahan baku PO: %', v_journal_res.error_message;
       END IF;
    END;
  END IF;

  -- 5. Create Product Journal
  IF v_total_product > 0 THEN
    IF v_acc_persediaan_produk IS NULL THEN
      RETURN QUERY SELECT FALSE, NULL::UUID[], NULL::TEXT, 'Akun Persediaan Barang Dagang (1310) tidak ditemukan'::TEXT;
      RETURN;
    END IF;

    DECLARE
       v_journal_lines JSONB := '[]'::JSONB;
       v_journal_res RECORD;
    BEGIN
       -- Dr. Persediaan Produk Jadi
       v_journal_lines := v_journal_lines || jsonb_build_object(
          'account_id', v_acc_persediaan_produk,
          'debit_amount', v_total_product,
          'credit_amount', 0,
          'description', 'Persediaan: ' || v_product_names
       );

       -- Dr. Piutang Pajak (PPN Masukan) jika ada
       IF v_product_ppn > 0 AND v_acc_piutang_pajak IS NOT NULL THEN
           v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_id', v_acc_piutang_pajak,
            'debit_amount', v_product_ppn,
            'credit_amount', 0,
            'description', 'PPN Masukan (PO ' || p_po_id || ')'
           );
       END IF;

       -- Cr. Hutang Usaha
       v_journal_lines := v_journal_lines || jsonb_build_object(
          'account_id', v_acc_hutang_usaha,
          'debit_amount', 0,
          'credit_amount', v_total_product + v_product_ppn,
          'description', 'Hutang: ' || v_po.supplier_name
       );
       
       SELECT * INTO v_journal_res FROM create_journal_atomic(
         p_branch_id,
         CURRENT_DATE,
         'Pembelian Produk Jadi: ' || v_po.supplier_name || ' (' || p_po_id || ')',
         'purchase_order',
         p_po_id,
         v_journal_lines,
         TRUE
       );

       IF v_journal_res.success THEN
         v_journal_ids := array_append(v_journal_ids, v_journal_res.journal_id);
       ELSE
         RAISE EXCEPTION 'Gagal membuat jurnal produk PO: %', v_journal_res.error_message;
       END IF;
    END;
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
$function$
;


-- Function: calculate_balance_delta
CREATE OR REPLACE FUNCTION public.calculate_balance_delta(p_account_id text, p_debit numeric, p_credit numeric)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_type TEXT;
    v_delta NUMERIC;
BEGIN
    SELECT type INTO v_type FROM accounts WHERE id = p_account_id;
    
    -- Default to Aset logic if type not found (safe fallback)
    v_type := COALESCE(v_type, 'Aset');

    IF v_type IN ('Aset', 'Beban') THEN
        v_delta := p_debit - p_credit;
    ELSE
        -- Kewajiban, Modal, Pendapatan: Credit increases balance
        v_delta := p_credit - p_debit;
    END IF;

    RETURN v_delta;
END;
$function$
;


-- Function: create_account
CREATE OR REPLACE FUNCTION public.create_account(p_branch_id text, p_name text, p_code text, p_type text, p_initial_balance numeric DEFAULT 0, p_is_payment_account boolean DEFAULT false, p_parent_id text DEFAULT NULL::text, p_level integer DEFAULT 1, p_is_header boolean DEFAULT false, p_sort_order integer DEFAULT 0, p_employee_id text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, account_id text, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_account_id UUID;
  v_code_exists BOOLEAN;
BEGIN
  -- Validate Branch ID
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 'Branch ID is required';
    RETURN;
  END IF;

  -- Validate Code Uniqueness in Branch
  IF p_code IS NOT NULL AND p_code != '' THEN
    SELECT EXISTS (
      SELECT 1 FROM accounts 
      WHERE branch_id = p_branch_id::UUID 
      AND code = p_code
    ) INTO v_code_exists;
    
    IF v_code_exists THEN
      RETURN QUERY SELECT FALSE, NULL::TEXT, 'Account code already exists in this branch';
      RETURN;
    END IF;
  END IF;

  -- Generate ID Explicitly
  v_account_id := gen_random_uuid();

  -- Insert Account
  INSERT INTO accounts (
    id,
    branch_id,
    name,
    code,
    type,
    initial_balance,
    balance, -- CORRECT FIX: Initialize to 0. Journal Trigger will populate this.
    is_payment_account,
    parent_id,
    level,
    is_header,
    sort_order,
    employee_id,
    is_active
  ) VALUES (
    v_account_id,
    p_branch_id::UUID,
    p_name,
    p_code,
    p_type,
    p_initial_balance,
    0, -- Start at 0. Do NOT double count.
    p_is_payment_account,
    p_parent_id::UUID,
    p_level,
    p_is_header,
    p_sort_order,
    p_employee_id::UUID,
    true
  );

  -- Create Journal for Opening Balance if not zero
  IF p_initial_balance <> 0 THEN
      -- This creates a Journal -> Trigger Fires -> Updates Balance (+1.5M)
      PERFORM update_account_initial_balance_atomic(
          v_account_id::TEXT, 
          p_initial_balance, 
          p_branch_id::UUID
      );
  END IF;

  RETURN QUERY SELECT TRUE, v_account_id::TEXT, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::TEXT, SQLERRM;
END;
$function$
;


-- Function: create_accounts_payable_atomic
CREATE OR REPLACE FUNCTION public.create_accounts_payable_atomic(p_branch_id uuid, p_supplier_name text, p_amount numeric, p_due_date date DEFAULT NULL::date, p_description text DEFAULT NULL::text, p_creditor_type text DEFAULT 'supplier'::text, p_purchase_order_id text DEFAULT NULL::text, p_skip_journal boolean DEFAULT false)
 RETURNS TABLE(success boolean, payable_id text, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_payable_id TEXT;
  v_journal_id UUID;
  v_entry_number TEXT;
  v_hutang_account_id TEXT;
  v_lawan_account_id TEXT; -- Usually Cash or Inventory depending on context
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
      'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
      'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- ðŸ”¥ NEW: Check if AP already exists for this PO
  IF p_purchase_order_id IS NOT NULL THEN
    DECLARE
      v_existing_ap_count INTEGER;
    BEGIN
      SELECT COUNT(*) INTO v_existing_ap_count
      FROM accounts_payable
      WHERE purchase_order_id = p_purchase_order_id;

      IF v_existing_ap_count > 0 THEN
        RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
          'Accounts Payable sudah ada untuk PO ini. Gunakan approve_purchase_order_atomic untuk PO.'::TEXT;
        RETURN;
      END IF;
    END;

    -- ðŸ”¥ FORCE skip_journal for PO (journal should be created by approve_purchase_order_atomic)
    p_skip_journal := TRUE;
  END IF;

  -- Generate Sequential ID
  v_payable_id := 'AP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

  -- ==================== INSERT ACCOUNTS PAYABLE ====================

  INSERT INTO accounts_payable (
    id,
    branch_id,
    supplier_name,
    creditor_type,
    amount,
    due_date,
    description,
    purchase_order_id,
    status,
    paid_amount,
    created_at
  ) VALUES (
    v_payable_id,
    p_branch_id,
    p_supplier_name,
    p_creditor_type,
    p_amount,
    p_due_date,
    p_description,
    p_purchase_order_id,
    'Outstanding',
    0,
    NOW()
  );

  -- ==================== CREATE JOURNAL ENTRY ====================

  IF NOT p_skip_journal THEN
    -- Get Account IDs
    -- Default Hutang Usaha: 2110
    SELECT id INTO v_hutang_account_id FROM accounts WHERE code = '2110' AND branch_id = p_branch_id AND is_active = TRUE LIMIT 1;
    
    -- Lawan: 5110 (Pembelian) as default
    SELECT id INTO v_lawan_account_id FROM accounts WHERE code = '5110' AND branch_id = p_branch_id AND is_active = TRUE LIMIT 1;

    IF v_hutang_account_id IS NOT NULL AND v_lawan_account_id IS NOT NULL THEN
       DECLARE
         v_journal_lines JSONB;
         v_journal_res RECORD;
       BEGIN
         -- Dr. Lawan
         -- Cr. Hutang
         v_journal_lines := jsonb_build_array(
           jsonb_build_object(
             'account_id', v_lawan_account_id,
             'debit_amount', p_amount,
             'credit_amount', 0,
             'description', COALESCE(p_description, 'Hutang Baru')
           ),
           jsonb_build_object(
             'account_id', v_hutang_account_id,
             'debit_amount', 0,
             'credit_amount', p_amount,
             'description', COALESCE(p_description, 'Hutang Baru')
           )
         );

         SELECT * INTO v_journal_res FROM create_journal_atomic(
           p_branch_id,
           CURRENT_DATE,
           COALESCE(p_description, 'Hutang Baru: ' || p_supplier_name),
           'accounts_payable',
           v_payable_id,
           v_journal_lines,
           TRUE -- auto post
         );

         IF v_journal_res.success THEN
           v_journal_id := v_journal_res.journal_id;
         ELSE
           RAISE EXCEPTION 'Gagal membuat jurnal hutang: %', v_journal_res.error_message;
         END IF;
       END;
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, v_payable_id, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


-- Function: create_all_opening_balance_journal_rpc
CREATE OR REPLACE FUNCTION public.create_all_opening_balance_journal_rpc(p_branch_id uuid, p_opening_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(success boolean, journal_id uuid, accounts_processed integer, total_debit numeric, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_laba_ditahan_id UUID;
  v_account RECORD;
  v_total_debit NUMERIC := 0;
  v_total_credit NUMERIC := 0;
  v_line_number INTEGER := 1;
  v_accounts_processed INTEGER := 0;
BEGIN
  -- VALIDASI
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;
  -- GET LABA DITAHAN ACCOUNT
  SELECT id INTO v_laba_ditahan_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '3200' AND is_active = TRUE LIMIT 1;
  IF v_laba_ditahan_id IS NULL THEN
    SELECT id INTO v_laba_ditahan_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '3100' AND is_active = TRUE LIMIT 1;
  END IF;
  IF v_laba_ditahan_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, 'Akun Laba Ditahan tidak ditemukan'::TEXT;
    RETURN;
  END IF;
  -- GENERATE ENTRY NUMBER
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;
  -- CREATE JOURNAL ENTRY
  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_opening_date,
    'Saldo Awal Semua Akun',
    'opening', 'ALL-OPENING', 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;
  -- LOOP THROUGH ALL ACCOUNTS WITH INITIAL BALANCE
  FOR v_account IN
    SELECT id, code, name, type, initial_balance, normal_balance
    FROM accounts
    WHERE branch_id = p_branch_id
      AND initial_balance IS NOT NULL
      AND initial_balance <> 0
      AND code NOT IN ('1310', '1320') -- Exclude inventory (handled separately)
      AND is_active = TRUE
    ORDER BY code
  LOOP
    -- Determine debit/credit based on account type and normal balance
    IF v_account.type IN ('Aset', 'Beban') OR v_account.normal_balance = 'DEBIT' THEN
      -- Debit entry for asset/expense accounts
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, account_code, account_name,
        debit_amount, credit_amount, description, line_number
      ) VALUES (
        v_journal_id, v_account.id, v_account.code, v_account.name,
        ABS(v_account.initial_balance), 0, 'Saldo awal ' || v_account.name, v_line_number
      );
      v_total_debit := v_total_debit + ABS(v_account.initial_balance);
    ELSE
      -- Credit entry for liability/equity/revenue accounts
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, account_code, account_name,
        debit_amount, credit_amount, description, line_number
      ) VALUES (
        v_journal_id, v_account.id, v_account.code, v_account.name,
        0, ABS(v_account.initial_balance), 'Saldo awal ' || v_account.name, v_line_number
      );
      v_total_credit := v_total_credit + ABS(v_account.initial_balance);
    END IF;
    v_line_number := v_line_number + 1;
    v_accounts_processed := v_accounts_processed + 1;
  END LOOP;
  -- ADD BALANCING ENTRY TO LABA DITAHAN
  IF v_total_debit <> v_total_credit THEN
    IF v_total_debit > v_total_credit THEN
      -- Need more credit
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, account_code, account_name,
        debit_amount, credit_amount, description, line_number
      ) VALUES (
        v_journal_id, v_laba_ditahan_id,
        (SELECT code FROM accounts WHERE id = v_laba_ditahan_id),
        (SELECT name FROM accounts WHERE id = v_laba_ditahan_id),
        0, v_total_debit - v_total_credit, 'Penyeimbang saldo awal', v_line_number
      );
    ELSE
      -- Need more debit
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, account_code, account_name,
        debit_amount, credit_amount, description, line_number
      ) VALUES (
        v_journal_id, v_laba_ditahan_id,
        (SELECT code FROM accounts WHERE id = v_laba_ditahan_id),
        (SELECT name FROM accounts WHERE id = v_laba_ditahan_id),
        v_total_credit - v_total_debit, 0, 'Penyeimbang saldo awal', v_line_number
      );
    END IF;
  END IF;
  RETURN QUERY SELECT TRUE, v_journal_id, v_accounts_processed, v_total_debit, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0::NUMERIC, SQLERRM::TEXT;
END;
$function$
;


-- Function: create_asset_atomic
CREATE OR REPLACE FUNCTION public.create_asset_atomic(p_asset jsonb, p_branch_id uuid)
 RETURNS TABLE(success boolean, asset_id uuid, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_asset_id UUID;
  v_name TEXT;
  v_code TEXT;
  v_category TEXT;
  v_purchase_date DATE;
  v_purchase_price NUMERIC;
  v_useful_life_years INTEGER;
  v_salvage_value NUMERIC;
  v_depreciation_method TEXT;
  v_source TEXT;  -- 'cash', 'credit', 'migration'
  v_asset_account_id UUID;
  v_cash_account_id UUID;
  v_hutang_account_id UUID;
  v_journal_id UUID;
  v_journal_lines JSONB := '[]'::JSONB;
  v_category_mapping JSONB;
BEGIN
  -- ==================== VALIDASI ====================
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID,
      'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;
  IF p_asset IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID,
      'Asset data is required'::TEXT;
    RETURN;
  END IF;
  -- ==================== PARSE DATA ====================
  v_name := COALESCE(p_asset->>'name', p_asset->>'asset_name', 'Aset Tetap');
  v_code := COALESCE(p_asset->>'code', p_asset->>'asset_code');
  v_category := COALESCE(p_asset->>'category', 'other');
  v_purchase_date := COALESCE((p_asset->>'purchase_date')::DATE, CURRENT_DATE);
  v_purchase_price := COALESCE((p_asset->>'purchase_price')::NUMERIC, 0);
  v_useful_life_years := COALESCE((p_asset->>'useful_life_years')::INTEGER, 5);
  v_salvage_value := COALESCE((p_asset->>'salvage_value')::NUMERIC, 0);
  v_depreciation_method := COALESCE(p_asset->>'depreciation_method', 'straight_line');
  v_source := COALESCE(p_asset->>'source', 'cash');
  IF v_name IS NULL OR v_name = '' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID,
      'Asset name is required'::TEXT;
    RETURN;
  END IF;
  -- ==================== MAP CATEGORY TO ACCOUNT ====================
  -- Category to account code mapping
  v_category_mapping := '{
    "vehicle": {"codes": ["1410"], "names": ["kendaraan"]},
    "equipment": {"codes": ["1420"], "names": ["peralatan", "mesin"]},
    "building": {"codes": ["1440"], "names": ["bangunan", "gedung"]},
    "furniture": {"codes": ["1450"], "names": ["furniture", "inventaris"]},
    "computer": {"codes": ["1460"], "names": ["komputer", "laptop"]},
    "other": {"codes": ["1490"], "names": ["aset lain"]}
  }'::JSONB;
  -- Find asset account by category
  DECLARE
    v_mapping JSONB := v_category_mapping->v_category;
    v_search_code TEXT;
    v_search_name TEXT;
  BEGIN
    IF v_mapping IS NOT NULL THEN
      -- Try by code first
      FOR v_search_code IN SELECT jsonb_array_elements_text(v_mapping->'codes')
      LOOP
        SELECT id INTO v_asset_account_id
        FROM accounts
        WHERE branch_id = p_branch_id
          AND code = v_search_code
          AND is_active = TRUE
        LIMIT 1;
        EXIT WHEN v_asset_account_id IS NOT NULL;
      END LOOP;
      -- Try by name if not found
      IF v_asset_account_id IS NULL THEN
        FOR v_search_name IN SELECT jsonb_array_elements_text(v_mapping->'names')
        LOOP
          SELECT id INTO v_asset_account_id
          FROM accounts
          WHERE branch_id = p_branch_id
            AND LOWER(name) LIKE '%' || v_search_name || '%'
            AND is_active = TRUE
            AND is_header = FALSE
          LIMIT 1;
          EXIT WHEN v_asset_account_id IS NOT NULL;
        END LOOP;
      END IF;
    END IF;
    -- Fallback to any fixed asset account
    IF v_asset_account_id IS NULL THEN
      SELECT id INTO v_asset_account_id
      FROM accounts
      WHERE branch_id = p_branch_id
        AND code LIKE '14%'
        AND is_active = TRUE
        AND is_header = FALSE
      ORDER BY code
      LIMIT 1;
    END IF;
  END;
  -- Find cash account
  SELECT id INTO v_cash_account_id
  FROM accounts
  WHERE branch_id = p_branch_id
    AND is_active = TRUE
    AND is_payment_account = TRUE
    AND code LIKE '11%'
  ORDER BY code
  LIMIT 1;
  -- Find hutang account (for credit purchases)
  SELECT id INTO v_hutang_account_id
  FROM accounts
  WHERE branch_id = p_branch_id
    AND code IN ('2100', '2110')
    AND is_active = TRUE
  LIMIT 1;
  -- Validate asset account found
  IF v_asset_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID,
      'Akun aset tetap tidak ditemukan. Pastikan ada akun dengan kode 14xx.'::TEXT;
    RETURN;
  END IF;
  -- ==================== GENERATE ASSET ID ====================
  v_asset_id := gen_random_uuid();
  -- Generate code if not provided
  IF v_code IS NULL OR v_code = '' THEN
    v_code := 'AST-' || TO_CHAR(v_purchase_date, 'YYYYMM') || '-' ||
              LPAD((SELECT COUNT(*) + 1 FROM assets WHERE branch_id = p_branch_id)::TEXT, 4, '0');
  END IF;
  -- ==================== CREATE ASSET RECORD ====================
  INSERT INTO assets (
    id,
    name,
    code,
    asset_code,
    category,
    purchase_date,
    purchase_price,
    current_value,
    useful_life_years,
    salvage_value,
    depreciation_method,
    location,
    brand,
    model,
    serial_number,
    supplier_name,
    notes,
    status,
    condition,
    account_id,
    branch_id,
    created_at
  ) VALUES (
    v_asset_id,
    v_name,
    v_code,
    v_code,
    v_category,
    v_purchase_date,
    v_purchase_price,
    v_purchase_price,  -- current_value starts at purchase_price
    v_useful_life_years,
    v_salvage_value,
    v_depreciation_method,
    p_asset->>'location',
    COALESCE(p_asset->>'brand', v_name),
    p_asset->>'model',
    p_asset->>'serial_number',
    p_asset->>'supplier_name',
    p_asset->>'notes',
    COALESCE(p_asset->>'status', 'active'),
    COALESCE(p_asset->>'condition', 'good'),
    v_asset_account_id,
    p_branch_id,
    NOW()
  );
  -- ==================== CREATE JOURNAL (if not migration) ====================
  IF v_purchase_price > 0 AND v_source != 'migration' THEN
    -- Debit: Aset Tetap
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_id', v_asset_account_id,
      'debit_amount', v_purchase_price,
      'credit_amount', 0,
      'description', format('Pembelian %s', v_name)
    );
    -- Credit: Kas atau Hutang
    IF v_source = 'credit' AND v_hutang_account_id IS NOT NULL THEN
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_id', v_hutang_account_id,
        'debit_amount', 0,
        'credit_amount', v_purchase_price,
        'description', 'Hutang pembelian aset'
      );
    ELSIF v_cash_account_id IS NOT NULL THEN
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_id', v_cash_account_id,
        'debit_amount', 0,
        'credit_amount', v_purchase_price,
        'description', 'Pembayaran tunai aset'
      );
    ELSE
      RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID,
        'Akun pembayaran tidak ditemukan'::TEXT;
      RETURN;
    END IF;
    SELECT cja.journal_id INTO v_journal_id FROM create_journal_atomic(
      p_branch_id,
      v_purchase_date,
      format('Pembelian Aset - %s', v_name),
      'asset',
      v_asset_id::TEXT,
      v_journal_lines,
      TRUE
    );
  END IF;
  -- ==================== SUCCESS ====================
  RETURN QUERY SELECT TRUE, v_asset_id, v_journal_id, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


-- Function: create_debt_journal_rpc
CREATE OR REPLACE FUNCTION public.create_debt_journal_rpc(p_branch_id uuid, p_debt_id text, p_debt_date date, p_amount numeric, p_creditor_name text, p_creditor_type text DEFAULT 'other'::text, p_description text DEFAULT NULL::text, p_cash_account_id text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_kas_account_id TEXT;  -- Changed to TEXT
  v_hutang_account_id TEXT; -- Changed to TEXT
  v_hutang_code TEXT;
BEGIN
  -- VALIDASI
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  -- GET KAS ACCOUNT
  IF p_cash_account_id IS NOT NULL THEN
    v_kas_account_id := p_cash_account_id;
  ELSE
    SELECT id INTO v_kas_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '1120' AND is_active = TRUE LIMIT 1;
  END IF;

  -- GET HUTANG ACCOUNT BASED ON CREDITOR TYPE
  CASE p_creditor_type
    WHEN 'bank' THEN v_hutang_code := '2120';
    WHEN 'supplier' THEN v_hutang_code := '2110';
    ELSE v_hutang_code := '2190';
  END CASE;

  SELECT id INTO v_hutang_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = v_hutang_code AND is_active = TRUE LIMIT 1;

  IF v_hutang_account_id IS NULL THEN
    SELECT id INTO v_hutang_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '2110' AND is_active = TRUE LIMIT 1;
    v_hutang_code := '2110';
  END IF;

  IF v_kas_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Kas/Bank tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  IF v_hutang_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Hutang tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- GENERATE ENTRY NUMBER (GLOBAL SEQUENCE)
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- CREATE JOURNAL ENTRY
  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_debt_date,
    COALESCE(p_description, 'Pinjaman dari ' || p_creditor_name),
    'payable', p_debt_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Kas
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_kas_account_id,
    (SELECT code FROM accounts WHERE id = v_kas_account_id),
    (SELECT name FROM accounts WHERE id = v_kas_account_id),
    p_amount, 0, 'Penerimaan pinjaman dari ' || p_creditor_name, 1
  );

  -- Cr. Hutang
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_hutang_account_id, v_hutang_code,
    (SELECT name FROM accounts WHERE id = v_hutang_account_id),
    0, p_amount, 'Hutang kepada ' || p_creditor_name, 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


-- Function: create_employee_advance_atomic
CREATE OR REPLACE FUNCTION public.create_employee_advance_atomic(p_advance jsonb, p_branch_id uuid)
 RETURNS TABLE(success boolean, advance_id uuid, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_advance_id UUID;
  v_journal_id UUID;
  v_employee_id UUID;
  v_employee_name TEXT;
  v_amount NUMERIC;
  v_advance_date DATE;
  v_reason TEXT;
  v_payment_account_id TEXT;

  v_kas_account_id TEXT;
  v_piutang_karyawan_id TEXT;
  v_entry_number TEXT;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  -- Permission check
  IF auth.uid() IS NOT NULL THEN
    IF NOT check_user_permission(auth.uid(), 'advances_manage') THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Tidak memiliki akses untuk membuat kasbon'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- ==================== PARSE DATA ====================

  v_advance_id := COALESCE((p_advance->>'id')::UUID, gen_random_uuid());
  v_employee_id := (p_advance->>'employee_id')::UUID;
  v_employee_name := p_advance->>'employee_name';
  v_amount := COALESCE((p_advance->>'amount')::NUMERIC, 0);
  v_advance_date := COALESCE((p_advance->>'advance_date')::DATE, CURRENT_DATE);
  v_reason := COALESCE(p_advance->>'reason', 'Kasbon karyawan');
  v_payment_account_id := (p_advance->>'payment_account_id'); -- No cast to UUID, it's TEXT

  IF v_employee_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Employee ID is required'::TEXT;
    RETURN;
  END IF;

  IF v_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get employee name if not provided (localhost uses profiles, not employees)
  IF v_employee_name IS NULL THEN
    SELECT full_name INTO v_employee_name FROM profiles WHERE id = v_employee_id;
  END IF;

  -- ==================== GET ACCOUNT IDS ====================

  -- Kas account
  IF v_payment_account_id IS NOT NULL THEN
    v_kas_account_id := v_payment_account_id;
  ELSE
    SELECT id INTO v_kas_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;
  END IF;

  -- Piutang Karyawan (1230 atau sesuai chart of accounts)
  SELECT id INTO v_piutang_karyawan_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1230' AND is_active = TRUE LIMIT 1;

  -- Fallback: cari akun dengan nama mengandung "Piutang Karyawan"
  IF v_piutang_karyawan_id IS NULL THEN
    SELECT id INTO v_piutang_karyawan_id FROM accounts
    WHERE branch_id = p_branch_id AND name ILIKE '%piutang karyawan%' AND is_active = TRUE LIMIT 1;
  END IF;

  IF v_kas_account_id IS NULL OR v_piutang_karyawan_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Akun Kas atau Piutang Karyawan tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- ==================== INSERT ADVANCE RECORD ====================

  INSERT INTO employee_advances (
    id,
    branch_id,
    employee_id,
    employee_name,
    amount,
    remaining_amount,
    date,      -- Correct column name
    notes,     -- Map reason to notes
    status,
    created_at, -- No created_by column in schema output, let's omit or check if it exists differently? schema said no created_by
    account_id  -- Map payment account
  ) VALUES (
    v_advance_id::TEXT, -- Cast to TEXT as ID in table is TEXT
    p_branch_id,
    v_employee_id,
    v_employee_name,
    v_amount,
    v_amount, 
    v_advance_date,
    v_reason,
    'active',
    NOW(),
    v_payment_account_id
  );

  -- ==================== CREATE JOURNAL ENTRY ====================

  -- Generate entry number
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- Create journal header
  INSERT INTO journal_entries (
    id,
    branch_id,
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    status,
    is_voided,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    p_branch_id,
    v_entry_number,
    v_advance_date,
    'Kasbon Karyawan - ' || v_employee_name || ' - ' || v_reason,
    'advance',
    v_advance_id::TEXT,
    'posted',
    FALSE,
    NOW(),
    NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Piutang Karyawan
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_piutang_karyawan_id,
    (SELECT name FROM accounts WHERE id = v_piutang_karyawan_id),
    v_amount, 0, 'Kasbon ' || v_employee_name, 1
  );

  -- Cr. Kas
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_kas_account_id,
    (SELECT name FROM accounts WHERE id = v_kas_account_id),
    0, v_amount, 'Pengeluaran kas untuk kasbon', 2
  );

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_advance_id, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


-- Function: create_expense_atomic
CREATE OR REPLACE FUNCTION public.create_expense_atomic(p_expense jsonb, p_branch_id uuid)
 RETURNS TABLE(success boolean, expense_id text, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_expense_id TEXT;
  v_description TEXT;
  v_amount NUMERIC;
  v_category TEXT;
  v_date TIMESTAMPTZ;
  v_cash_account_id TEXT;  -- accounts.id is TEXT not UUID
  v_expense_account_id TEXT;  -- accounts.id is TEXT not UUID
  v_expense_account_name TEXT;
  v_journal_id UUID;
  v_journal_lines JSONB := '[]'::JSONB;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
      'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_expense IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
      'Expense data is required'::TEXT;
    RETURN;
  END IF;

  -- ==================== PARSE DATA ====================

  v_description := COALESCE(p_expense->>'description', 'Pengeluaran');
  v_amount := COALESCE((p_expense->>'amount')::NUMERIC, 0);
  v_category := COALESCE(p_expense->>'category', 'Beban Umum');
  v_date := COALESCE((p_expense->>'date')::TIMESTAMPTZ, NOW());
  v_cash_account_id := p_expense->>'account_id';  -- TEXT, no cast needed
  v_expense_account_id := p_expense->>'expense_account_id';  -- TEXT, no cast needed
  v_expense_account_name := p_expense->>'expense_account_name';

  IF v_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
      'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  -- ==================== FIND ACCOUNTS ====================

  -- Find expense account by ID or fallback to category-based search
  IF v_expense_account_id IS NULL THEN
    -- Search by category name
    SELECT id INTO v_expense_account_id
    FROM accounts
    WHERE branch_id = p_branch_id
      AND is_active = TRUE
      AND is_header = FALSE
      AND (
        code LIKE '6%'  -- Expense accounts
        OR type IN ('Beban', 'Expense')
      )
      AND (
        LOWER(name) LIKE '%' || LOWER(v_category) || '%'
        OR name ILIKE '%beban umum%'
      )
    ORDER BY
      CASE WHEN LOWER(name) LIKE '%' || LOWER(v_category) || '%' THEN 1 ELSE 2 END,
      code
    LIMIT 1;

    -- Fallback to default expense account (6200 - Beban Operasional or 6100)
    IF v_expense_account_id IS NULL THEN
      SELECT id INTO v_expense_account_id
      FROM accounts
      WHERE branch_id = p_branch_id
        AND is_active = TRUE
        AND is_header = FALSE
        AND code IN ('6200', '6100', '6000')
      ORDER BY code
      LIMIT 1;
    END IF;
  END IF;

  -- Find cash/payment account
  IF v_cash_account_id IS NULL THEN
    SELECT id INTO v_cash_account_id
    FROM accounts
    WHERE branch_id = p_branch_id
      AND is_active = TRUE
      AND is_payment_account = TRUE
      AND code LIKE '11%'
    ORDER BY code
    LIMIT 1;
  END IF;

  -- Validate accounts found
  IF v_expense_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
      'Akun beban tidak ditemukan. Pastikan ada akun dengan kode 6xxx.'::TEXT;
    RETURN;
  END IF;

  IF v_cash_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID,
      'Akun kas tidak ditemukan. Pastikan ada akun payment dengan kode 11xx.'::TEXT;
    RETURN;
  END IF;

  -- ==================== GENERATE EXPENSE ID ====================

  v_expense_id := 'exp-' || EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT ||
                  '-' || LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');

  -- ==================== CREATE EXPENSE RECORD ====================

  INSERT INTO expenses (
    id,
    description,
    amount,
    category,
    date,
    account_id,
    expense_account_id,
    expense_account_name,
    branch_id,
    created_at
  ) VALUES (
    v_expense_id,
    v_description,
    v_amount,
    v_category,
    v_date,
    v_cash_account_id,
    v_expense_account_id,
    v_expense_account_name,
    p_branch_id,
    NOW()
  );

  -- ==================== CREATE JOURNAL ====================

  -- Debit: Beban (expense account)
  v_journal_lines := v_journal_lines || jsonb_build_object(
    'account_id', v_expense_account_id,
    'debit_amount', v_amount,
    'credit_amount', 0,
    'description', v_category || ': ' || v_description
  );

  -- Credit: Kas (payment account)
  v_journal_lines := v_journal_lines || jsonb_build_object(
    'account_id', v_cash_account_id,
    'debit_amount', 0,
    'credit_amount', v_amount,
    'description', 'Pengeluaran kas'
  );

  SELECT cja.journal_id INTO v_journal_id FROM create_journal_atomic(
    p_branch_id,
    v_date::DATE,  -- Journal only needs DATE
    format('Pengeluaran - %s', v_description),
    'expense',
    v_expense_id,
    v_journal_lines,
    TRUE
  ) AS cja;

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_expense_id, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


-- Function: create_inventory_opening_balance_journal_rpc
CREATE OR REPLACE FUNCTION public.create_inventory_opening_balance_journal_rpc(p_branch_id uuid, p_products_value numeric DEFAULT 0, p_materials_value numeric DEFAULT 0, p_opening_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(success boolean, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_persediaan_barang_id UUID;
  v_persediaan_bahan_id UUID;
  v_laba_ditahan_id UUID;
  v_total_amount NUMERIC;
  v_line_number INTEGER := 1;
BEGIN
  -- VALIDASI
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;
  v_total_amount := COALESCE(p_products_value, 0) + COALESCE(p_materials_value, 0);
  IF v_total_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Total value must be greater than 0'::TEXT;
    RETURN;
  END IF;
  -- GET ACCOUNT IDS
  SELECT id INTO v_persediaan_barang_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1310' AND is_active = TRUE LIMIT 1;
  SELECT id INTO v_persediaan_bahan_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1320' AND is_active = TRUE LIMIT 1;
  SELECT id INTO v_laba_ditahan_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '3200' AND is_active = TRUE LIMIT 1;
  IF v_laba_ditahan_id IS NULL THEN
    -- Fallback to Modal Disetor
    SELECT id INTO v_laba_ditahan_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '3100' AND is_active = TRUE LIMIT 1;
  END IF;
  IF v_laba_ditahan_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Laba Ditahan/Modal tidak ditemukan'::TEXT;
    RETURN;
  END IF;
  -- GENERATE ENTRY NUMBER
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;
  -- CREATE JOURNAL ENTRY
  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_opening_date,
    'Saldo Awal Persediaan',
    'opening', 'INVENTORY-OPENING', 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;
  -- Dr. Persediaan Barang Dagang (if > 0)
  IF p_products_value > 0 AND v_persediaan_barang_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_code, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_persediaan_barang_id, '1310',
      (SELECT name FROM accounts WHERE id = v_persediaan_barang_id),
      p_products_value, 0, 'Saldo awal persediaan barang dagang', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;
  -- Dr. Persediaan Bahan Baku (if > 0)
  IF p_materials_value > 0 AND v_persediaan_bahan_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_code, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_persediaan_bahan_id, '1320',
      (SELECT name FROM accounts WHERE id = v_persediaan_bahan_id),
      p_materials_value, 0, 'Saldo awal persediaan bahan baku', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;
  -- Cr. Laba Ditahan (penyeimbang)
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_laba_ditahan_id,
    (SELECT code FROM accounts WHERE id = v_laba_ditahan_id),
    (SELECT name FROM accounts WHERE id = v_laba_ditahan_id),
    0, v_total_amount, 'Penyeimbang saldo awal persediaan', v_line_number
  );
  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


-- Function: create_journal_atomic
CREATE OR REPLACE FUNCTION public.create_journal_atomic(p_branch_id uuid, p_description text, p_reference_type text DEFAULT NULL::text, p_reference_id text DEFAULT NULL::text, p_lines jsonb DEFAULT '[]'::jsonb, p_entry_date date DEFAULT CURRENT_DATE, p_auto_post boolean DEFAULT true, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS TABLE(success boolean, journal_id uuid, entry_number text, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_journal_id UUID := gen_random_uuid();
  v_entry_number TEXT;
  v_total_debit NUMERIC := 0;
  v_total_credit NUMERIC := 0;
  v_line RECORD;
  v_line_number INT := 0;
  v_account_exists BOOLEAN;
BEGIN
  -- Validate branch_id
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Branch ID wajib diisi'::TEXT;
    RETURN;
  END IF;

  -- Validate lines
  IF p_lines IS NULL OR jsonb_array_length(p_lines) < 2 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Minimal 2 baris jurnal diperlukan'::TEXT;
    RETURN;
  END IF;

  -- Calculate totals and validate accounts
  FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    account_id TEXT,
    account_code TEXT,
    debit_amount NUMERIC,
    credit_amount NUMERIC,
    description TEXT
  )
  LOOP
    v_total_debit := v_total_debit + COALESCE(v_line.debit_amount, 0);
    v_total_credit := v_total_credit + COALESCE(v_line.credit_amount, 0);

    -- Validate account exists
    IF v_line.account_id IS NOT NULL THEN
      SELECT EXISTS(SELECT 1 FROM accounts WHERE id = v_line.account_id AND branch_id = p_branch_id) INTO v_account_exists;
    ELSIF v_line.account_code IS NOT NULL THEN
      SELECT EXISTS(SELECT 1 FROM accounts WHERE code = v_line.account_code AND branch_id = p_branch_id) INTO v_account_exists;
    ELSE
      v_account_exists := FALSE;
    END IF;

    IF NOT v_account_exists THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT,
        format('Akun tidak ditemukan: %s', COALESCE(v_line.account_id, v_line.account_code, 'NULL'))::TEXT;
      RETURN;
    END IF;
  END LOOP;

  -- Validate balance
  IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT,
      format('Jurnal tidak balance. Debit: %s, Credit: %s', v_total_debit, v_total_credit)::TEXT;
    RETURN;
  END IF;

  -- Generate entry number
  v_entry_number := 'JE-' || TO_CHAR(p_entry_date, 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM()*10000)::TEXT, 4, '0');

  -- Create journal entry
  INSERT INTO journal_entries (
    id,
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    status,
    total_debit,
    total_credit,
    branch_id,
    created_by,
    created_at,
    is_voided
  ) VALUES (
    v_journal_id,
    v_entry_number,
    p_entry_date,
    p_description,
    p_reference_type,
    p_reference_id,
    CASE WHEN p_auto_post THEN 'posted' ELSE 'draft' END,
    v_total_debit,
    v_total_credit,
    p_branch_id,
    p_created_by,
    NOW(),
    FALSE
  );

  -- Create journal lines with account_code and account_name from accounts table
  FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    account_id TEXT,
    account_code TEXT,
    debit_amount NUMERIC,
    credit_amount NUMERIC,
    description TEXT
  )
  LOOP
    v_line_number := v_line_number + 1;

    INSERT INTO journal_entry_lines (
      journal_entry_id,
      line_number,
      account_id,
      account_code,
      account_name,
      description,
      debit_amount,
      credit_amount
    )
    SELECT
      v_journal_id,
      v_line_number,
      a.id,
      a.code,
      a.name,
      COALESCE(v_line.description, p_description),
      COALESCE(v_line.debit_amount, 0),
      COALESCE(v_line.credit_amount, 0)
    FROM accounts a
    WHERE a.branch_id = p_branch_id
      AND (
        (v_line.account_id IS NOT NULL AND a.id = v_line.account_id)
        OR (v_line.account_id IS NULL AND a.code = v_line.account_code)
      )
    LIMIT 1;
  END LOOP;

  -- Post if auto_post
  IF p_auto_post THEN
    UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
  END IF;

  RETURN QUERY SELECT TRUE, v_journal_id, v_entry_number, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, SQLERRM::TEXT;
END;
$function$
;


-- Function: create_journal_atomic
CREATE OR REPLACE FUNCTION public.create_journal_atomic(p_branch_id uuid, p_entry_date date, p_description text, p_reference_type text DEFAULT NULL::text, p_reference_id text DEFAULT NULL::text, p_lines jsonb DEFAULT '[]'::jsonb, p_auto_post boolean DEFAULT true)
 RETURNS TABLE(success boolean, journal_id uuid, entry_number text, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_total_debit NUMERIC := 0;
  v_total_credit NUMERIC := 0;
  v_line RECORD;
  v_line_number INTEGER := 0;
  v_period_closed BOOLEAN := FALSE;
BEGIN
  -- ==================== VALIDASI ====================

  -- Validasi branch_id WAJIB
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT AS error_message;
    RETURN;
  END IF;

  -- Validasi lines tidak kosong
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number,
      'Journal lines are required'::TEXT AS error_message;
    RETURN;
  END IF;

  -- Validasi minimal 2 lines
  IF jsonb_array_length(p_lines) < 2 THEN
    RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number,
      'Minimal 2 journal lines required (double-entry)'::TEXT AS error_message;
    RETURN;
  END IF;

  -- ==================== CEK PERIOD LOCK ====================

  -- Cek apakah periode sudah ditutup
  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM closing_entries
      WHERE branch_id = p_branch_id
        AND closing_type = 'year_end'
        AND status = 'posted'
        AND closing_date >= p_entry_date
    ) INTO v_period_closed;
  EXCEPTION WHEN undefined_table THEN
    v_period_closed := FALSE;
  END;

  IF v_period_closed THEN
    RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number,
      format('Periode %s sudah ditutup. Tidak dapat membuat jurnal.', p_entry_date)::TEXT AS error_message;
    RETURN;
  END IF;

  -- ==================== VALIDASI LINES ====================

  -- Hitung total dan validasi accounts
  FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    account_id TEXT,
    account_code TEXT,
    debit_amount NUMERIC,
    credit_amount NUMERIC,
    description TEXT
  )
  LOOP
    -- Validasi account exists
    IF v_line.account_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM accounts
        WHERE id = v_line.account_id
          AND branch_id = p_branch_id
          AND is_active = TRUE
      ) THEN
        RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number,
          format('Account ID %s tidak ditemukan di branch ini', v_line.account_id)::TEXT AS error_message;
        RETURN;
      END IF;
    ELSIF v_line.account_code IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM accounts
        WHERE code = v_line.account_code
          AND branch_id = p_branch_id
          AND is_active = TRUE
      ) THEN
        RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number,
          format('Account code %s tidak ditemukan di branch ini', v_line.account_code)::TEXT AS error_message;
        RETURN;
      END IF;
    ELSE
      RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number,
        'Setiap line harus memiliki account_id atau account_code'::TEXT AS error_message;
      RETURN;
    END IF;

    v_total_debit := v_total_debit + COALESCE(v_line.debit_amount, 0);
    v_total_credit := v_total_credit + COALESCE(v_line.credit_amount, 0);
  END LOOP;

  -- ==================== VALIDASI BALANCE ====================

  IF v_total_debit != v_total_credit THEN
    RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number,
      format('Jurnal tidak balance! Debit: %s, Credit: %s', v_total_debit, v_total_credit)::TEXT AS error_message;
    RETURN;
  END IF;

  IF v_total_debit = 0 THEN
    RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number,
      'Total debit/credit tidak boleh 0'::TEXT AS error_message;
    RETURN;
  END IF;

  -- ==================== GENERATE ENTRY NUMBER ====================

  v_entry_number := 'JE-' || TO_CHAR(p_entry_date, 'YYYYMMDD') || '-' ||
    LPAD((SELECT COUNT(*) + 1 FROM journal_entries
          WHERE branch_id = p_branch_id
          AND DATE(created_at) = DATE(p_entry_date))::TEXT, 4, '0') ||
    LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');

  -- ==================== CREATE JOURNAL HEADER ====================

  -- Create as draft first (trigger may block lines on posted)
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
    p_entry_date,
    p_description,
    p_reference_type,
    p_reference_id,
    p_branch_id,
    'draft',
    v_total_debit,
    v_total_credit
  )
  RETURNING id INTO v_journal_id;

  -- ==================== CREATE JOURNAL LINES ====================

  v_line_number := 0;
  FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    account_id TEXT,
    account_code TEXT,
    debit_amount NUMERIC,
    credit_amount NUMERIC,
    description TEXT
  )
  LOOP
    v_line_number := v_line_number + 1;

    INSERT INTO journal_entry_lines (
      journal_entry_id,
      line_number,
      account_id,
      account_code,
      description,
      debit_amount,
      credit_amount
    ) VALUES (
      v_journal_id,
      v_line_number,
      CASE
        WHEN v_line.account_id IS NOT NULL THEN v_line.account_id  -- accounts.id is TEXT
        ELSE (SELECT id FROM accounts WHERE code = v_line.account_code AND branch_id = p_branch_id LIMIT 1)
      END,
      COALESCE(v_line.account_code,
        (SELECT code FROM accounts WHERE id = v_line.account_id LIMIT 1)),
      COALESCE(v_line.description, p_description),
      COALESCE(v_line.debit_amount, 0),
      COALESCE(v_line.credit_amount, 0)
    );
  END LOOP;

  -- ==================== POST JOURNAL ====================

  IF p_auto_post THEN
    UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
  END IF;

  RETURN QUERY SELECT TRUE AS success, v_journal_id AS journal_id, v_entry_number AS entry_number, NULL::TEXT AS error_message;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE AS success, NULL::UUID AS journal_id, NULL::TEXT AS entry_number, SQLERRM::TEXT AS error_message;
END;
$function$
;


-- Function: create_manual_cash_in_journal_rpc
CREATE OR REPLACE FUNCTION public.create_manual_cash_in_journal_rpc(p_branch_id uuid, p_reference_id text, p_transaction_date date, p_amount numeric, p_description text, p_cash_account_id text)
 RETURNS TABLE(success boolean, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_pendapatan_lain_account_id TEXT;  -- Changed to TEXT
BEGIN
  IF p_branch_id IS NULL THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT; RETURN; END IF;
  IF p_amount <= 0 THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'Amount must be greater than 0'::TEXT; RETURN; END IF;
  IF p_cash_account_id IS NULL THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'Cash account is required'::TEXT; RETURN; END IF;

  SELECT id INTO v_pendapatan_lain_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code IN ('4200', '4900') AND is_active = TRUE ORDER BY code LIMIT 1;

  IF v_pendapatan_lain_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Pendapatan Lain-lain tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- GLOBAL SEQUENCE
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE((SELECT COUNT(*) + 1 FROM journal_entries WHERE DATE(created_at) = CURRENT_DATE), 1))::TEXT, 4, '0')
  INTO v_entry_number;

  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_transaction_date,
    'Kas Masuk: ' || p_description, 'manual', p_reference_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, p_cash_account_id,
    (SELECT code FROM accounts WHERE id = p_cash_account_id),
    (SELECT name FROM accounts WHERE id = p_cash_account_id),
    p_amount, 0, 'Kas masuk - ' || p_description, 1
  );

  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_pendapatan_lain_account_id,
    (SELECT code FROM accounts WHERE id = v_pendapatan_lain_account_id),
    (SELECT name FROM accounts WHERE id = v_pendapatan_lain_account_id),
    0, p_amount, 'Pendapatan lain-lain', 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


-- Function: create_manual_cash_out_journal_rpc
CREATE OR REPLACE FUNCTION public.create_manual_cash_out_journal_rpc(p_branch_id uuid, p_reference_id text, p_transaction_date date, p_amount numeric, p_description text, p_cash_account_id text)
 RETURNS TABLE(success boolean, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_beban_lain_account_id TEXT;  -- Changed to TEXT
BEGIN
  IF p_branch_id IS NULL THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT; RETURN; END IF;
  IF p_amount <= 0 THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'Amount must be greater than 0'::TEXT; RETURN; END IF;
  IF p_cash_account_id IS NULL THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'Cash account is required'::TEXT; RETURN; END IF;

  SELECT id INTO v_beban_lain_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code IN ('8100', '6900') AND is_active = TRUE ORDER BY code LIMIT 1;

  IF v_beban_lain_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Beban Lain-lain tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- GLOBAL SEQUENCE
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE((SELECT COUNT(*) + 1 FROM journal_entries WHERE DATE(created_at) = CURRENT_DATE), 1))::TEXT, 4, '0')
  INTO v_entry_number;

  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_transaction_date,
    'Kas Keluar: ' || p_description, 'manual', p_reference_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_beban_lain_account_id,
    (SELECT code FROM accounts WHERE id = v_beban_lain_account_id),
    (SELECT name FROM accounts WHERE id = v_beban_lain_account_id),
    p_amount, 0, 'Beban lain-lain - ' || p_description, 1
  );

  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, p_cash_account_id,
    (SELECT code FROM accounts WHERE id = p_cash_account_id),
    (SELECT name FROM accounts WHERE id = p_cash_account_id),
    0, p_amount, 'Kas keluar - ' || p_description, 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


-- Function: create_material_payment_journal_rpc
CREATE OR REPLACE FUNCTION public.create_material_payment_journal_rpc(p_branch_id uuid, p_reference_id text, p_transaction_date date, p_amount numeric, p_material_id uuid, p_material_name text, p_description text, p_cash_account_id text)
 RETURNS TABLE(success boolean, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_beban_bahan_account_id TEXT;  -- Changed to TEXT
BEGIN
  IF p_branch_id IS NULL THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT; RETURN; END IF;
  IF p_amount <= 0 THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'Amount must be greater than 0'::TEXT; RETURN; END IF;
  IF p_cash_account_id IS NULL THEN RETURN QUERY SELECT FALSE, NULL::UUID, 'Cash account is required'::TEXT; RETURN; END IF;

  SELECT id INTO v_beban_bahan_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code IN ('5300', '6300', '6310') AND is_active = TRUE ORDER BY code LIMIT 1;

  IF v_beban_bahan_account_id IS NULL THEN
    SELECT id INTO v_beban_bahan_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '6100' AND is_active = TRUE LIMIT 1;
  END IF;

  IF v_beban_bahan_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Beban Bahan Baku tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- GLOBAL SEQUENCE
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE((SELECT COUNT(*) + 1 FROM journal_entries WHERE DATE(created_at) = CURRENT_DATE), 1))::TEXT, 4, '0')
  INTO v_entry_number;

  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_transaction_date,
    COALESCE(p_description, 'Pembayaran bahan - ' || p_material_name),
    'expense', p_reference_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_beban_bahan_account_id,
    (SELECT code FROM accounts WHERE id = v_beban_bahan_account_id),
    (SELECT name FROM accounts WHERE id = v_beban_bahan_account_id),
    p_amount, 0, 'Beban bahan - ' || p_material_name, 1
  );

  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, p_cash_account_id,
    (SELECT code FROM accounts WHERE id = p_cash_account_id),
    (SELECT name FROM accounts WHERE id = p_cash_account_id),
    0, p_amount, 'Pembayaran bahan ' || p_material_name, 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


-- Function: create_material_stock_adjustment_atomic
CREATE OR REPLACE FUNCTION public.create_material_stock_adjustment_atomic(p_material_id uuid, p_branch_id uuid, p_quantity_change numeric, p_reason text DEFAULT 'Stock Adjustment'::text, p_unit_cost numeric DEFAULT 0)
 RETURNS TABLE(success boolean, adjustment_id uuid, journal_id uuid, new_stock numeric, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_adjustment_id UUID;
  v_journal_id UUID;
  v_material_name TEXT;
  v_current_stock NUMERIC;
  v_new_stock NUMERIC;
  v_adjustment_value NUMERIC;
  v_bahan_baku_account_id UUID;
  v_selisih_account_id UUID;
  v_entry_number TEXT;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_material_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Material ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_quantity_change = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Quantity change cannot be zero'::TEXT;
    RETURN;
  END IF;

  -- Get material info
  SELECT name, COALESCE(stock, 0) INTO v_material_name, v_current_stock
  FROM materials WHERE id = p_material_id;

  IF v_material_name IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Material tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  v_new_stock := v_current_stock + p_quantity_change;
  IF v_new_stock < 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC,
      format('Stok tidak cukup. Stok saat ini: %s', v_current_stock)::TEXT;
    RETURN;
  END IF;

  v_adjustment_value := ABS(p_quantity_change) * COALESCE(p_unit_cost, 0);

  -- ==================== GET ACCOUNT IDS ====================

  SELECT id INTO v_bahan_baku_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1320' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_selisih_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '8100' AND is_active = TRUE LIMIT 1;

  -- ==================== UPDATE MATERIAL STOCK ====================

  UPDATE materials
  SET stock = v_new_stock, updated_at = NOW()
  WHERE id = p_material_id;

  v_adjustment_id := gen_random_uuid();

  -- ==================== CREATE/CONSUME MATERIAL BATCH ====================

  IF p_quantity_change > 0 THEN
    INSERT INTO material_batches (
      material_id, branch_id, initial_quantity, remaining_quantity,
      unit_cost, batch_date, reference_type, reference_id, notes, created_at
    ) VALUES (
      p_material_id, p_branch_id, p_quantity_change, p_quantity_change,
      COALESCE(p_unit_cost, 0), CURRENT_DATE, 'adjustment', v_adjustment_id::TEXT, p_reason, NOW()
    );
  ELSE
    PERFORM consume_material_fifo(
      p_material_id, p_branch_id, ABS(p_quantity_change),
      'adjustment', 'ADJ-' || v_adjustment_id::TEXT
    );
  END IF;

  -- ==================== CREATE STOCK MOVEMENT RECORD ====================

  INSERT INTO material_stock_movements (
    id, material_id, branch_id, type, quantity,
    reference_type, reference_id, notes, user_id, created_at
  ) VALUES (
    v_adjustment_id, p_material_id, p_branch_id,
    CASE WHEN p_quantity_change > 0 THEN 'adjustment_in' ELSE 'adjustment_out' END,
    ABS(p_quantity_change), 'adjustment', v_adjustment_id::TEXT, p_reason, auth.uid(), NOW()
  );

  -- ==================== CREATE JOURNAL ENTRY ====================

  IF v_adjustment_value > 0 AND v_bahan_baku_account_id IS NOT NULL AND v_selisih_account_id IS NOT NULL THEN
    SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
      (COALESCE((SELECT COUNT(*) + 1 FROM journal_entries WHERE branch_id = p_branch_id AND DATE(created_at) = CURRENT_DATE), 1))::TEXT, 4, '0')
    INTO v_entry_number;

    INSERT INTO journal_entries (id, branch_id, entry_number, entry_date, description, reference_type, reference_id, status, is_voided, created_at, updated_at)
    VALUES (gen_random_uuid(), p_branch_id, v_entry_number, CURRENT_DATE, 'Penyesuaian Stok Bahan - ' || v_material_name || ' - ' || p_reason, 'adjustment', v_adjustment_id::TEXT, 'posted', FALSE, NOW(), NOW())
    RETURNING id INTO v_journal_id;

    IF p_quantity_change > 0 THEN
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
      VALUES (v_journal_id, v_bahan_baku_account_id, (SELECT name FROM accounts WHERE id = v_bahan_baku_account_id), v_adjustment_value, 0, 'Penambahan bahan baku', 1);
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
      VALUES (v_journal_id, v_selisih_account_id, (SELECT name FROM accounts WHERE id = v_selisih_account_id), 0, v_adjustment_value, 'Selisih stok', 2);
    ELSE
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
      VALUES (v_journal_id, v_selisih_account_id, (SELECT name FROM accounts WHERE id = v_selisih_account_id), v_adjustment_value, 0, 'Selisih stok', 1);
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
      VALUES (v_journal_id, v_bahan_baku_account_id, (SELECT name FROM accounts WHERE id = v_bahan_baku_account_id), 0, v_adjustment_value, 'Pengurangan bahan baku', 2);
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, v_adjustment_id, v_journal_id, v_new_stock, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, SQLERRM::TEXT;
END;
$function$
;


-- Function: create_migration_debt_journal_rpc
CREATE OR REPLACE FUNCTION public.create_migration_debt_journal_rpc(p_branch_id uuid, p_debt_id text, p_debt_date date, p_amount numeric, p_creditor_name text, p_creditor_type text DEFAULT 'other'::text, p_description text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_saldo_awal_account_id UUID;
  v_hutang_account_id UUID;
  v_hutang_code TEXT;
BEGIN
  -- VALIDASI
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;
  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;
  -- GET SALDO AWAL ACCOUNT
  SELECT id INTO v_saldo_awal_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '3100' AND is_active = TRUE LIMIT 1;
  -- GET HUTANG ACCOUNT BASED ON CREDITOR TYPE
  CASE p_creditor_type
    WHEN 'bank' THEN v_hutang_code := '2120';
    WHEN 'supplier' THEN v_hutang_code := '2110';
    ELSE v_hutang_code := '2190';
  END CASE;
  SELECT id INTO v_hutang_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = v_hutang_code AND is_active = TRUE LIMIT 1;
  IF v_hutang_account_id IS NULL THEN
    SELECT id INTO v_hutang_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '2110' AND is_active = TRUE LIMIT 1;
    v_hutang_code := '2110';
  END IF;
  IF v_saldo_awal_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Saldo Awal (3100) tidak ditemukan'::TEXT;
    RETURN;
  END IF;
  IF v_hutang_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Hutang tidak ditemukan'::TEXT;
    RETURN;
  END IF;
  -- GENERATE ENTRY NUMBER
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;
  -- CREATE JOURNAL ENTRY
  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_debt_date,
    COALESCE(p_description, 'Migrasi hutang dari ' || p_creditor_name),
    'payable', p_debt_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;
  -- Dr. Saldo Awal (penyeimbang)
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_saldo_awal_account_id, '3100',
    (SELECT name FROM accounts WHERE id = v_saldo_awal_account_id),
    p_amount, 0, 'Saldo awal hutang migrasi', 1
  );
  -- Cr. Hutang
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_hutang_account_id, v_hutang_code,
    (SELECT name FROM accounts WHERE id = v_hutang_account_id),
    0, p_amount, 'Hutang migrasi - ' || p_creditor_name, 2
  );
  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


-- Function: create_migration_receivable_journal_rpc
CREATE OR REPLACE FUNCTION public.create_migration_receivable_journal_rpc(p_branch_id uuid, p_receivable_id text, p_receivable_date date, p_amount numeric, p_customer_name text, p_description text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_piutang_account_id UUID;
  v_saldo_awal_account_id UUID;
BEGIN
  -- VALIDASI
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;
  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;
  -- GET ACCOUNT IDS
  SELECT id INTO v_piutang_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1210' AND is_active = TRUE LIMIT 1;
  SELECT id INTO v_saldo_awal_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '3100' AND is_active = TRUE LIMIT 1;
  IF v_piutang_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Piutang Usaha (1210) tidak ditemukan'::TEXT;
    RETURN;
  END IF;
  IF v_saldo_awal_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Saldo Awal (3100) tidak ditemukan'::TEXT;
    RETURN;
  END IF;
  -- GENERATE ENTRY NUMBER
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;
  -- CREATE JOURNAL ENTRY
  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_receivable_date,
    COALESCE(p_description, 'Piutang Migrasi - ' || p_customer_name),
    'receivable', p_receivable_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;
  -- Dr. Piutang Usaha
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_piutang_account_id, '1210',
    (SELECT name FROM accounts WHERE id = v_piutang_account_id),
    p_amount, 0, 'Piutang migrasi - ' || p_customer_name, 1
  );
  -- Cr. Saldo Awal
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_saldo_awal_account_id, '3100',
    (SELECT name FROM accounts WHERE id = v_saldo_awal_account_id),
    0, p_amount, 'Saldo awal piutang migrasi', 2
  );
  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


-- Function: create_product_stock_adjustment_atomic
CREATE OR REPLACE FUNCTION public.create_product_stock_adjustment_atomic(p_product_id uuid, p_branch_id uuid, p_quantity_change numeric, p_reason text DEFAULT 'Stock Adjustment'::text, p_unit_cost numeric DEFAULT 0)
 RETURNS TABLE(success boolean, adjustment_id uuid, journal_id uuid, new_stock numeric, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_adjustment_id UUID;
  v_journal_id UUID;
  v_product_name TEXT;
  v_current_stock NUMERIC;
  v_new_stock NUMERIC;
  v_adjustment_value NUMERIC;
  v_persediaan_account_id UUID;
  v_selisih_account_id UUID;
  v_entry_number TEXT;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_product_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Product ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_quantity_change = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Quantity change cannot be zero'::TEXT;
    RETURN;
  END IF;

  -- Get product info
  SELECT name, COALESCE(current_stock, 0) INTO v_product_name, v_current_stock
  FROM products WHERE id = p_product_id;

  IF v_product_name IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Produk tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  -- Calculate new stock (cannot go negative)
  v_new_stock := v_current_stock + p_quantity_change;
  IF v_new_stock < 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC,
      format('Stok tidak cukup. Stok saat ini: %s, pengurangan: %s', v_current_stock, ABS(p_quantity_change))::TEXT;
    RETURN;
  END IF;

  -- Calculate adjustment value
  v_adjustment_value := ABS(p_quantity_change) * COALESCE(p_unit_cost, 0);

  -- ==================== GET ACCOUNT IDS ====================

  SELECT id INTO v_persediaan_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1310' AND is_active = TRUE LIMIT 1;

  -- Selisih Stok account (usually 8100 or specific)
  SELECT id INTO v_selisih_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '8100' AND is_active = TRUE LIMIT 1;

  -- ==================== UPDATE PRODUCT STOCK ====================

  UPDATE products
  SET current_stock = v_new_stock, updated_at = NOW()
  WHERE id = p_product_id;

  v_adjustment_id := gen_random_uuid();

  -- ==================== CREATE INVENTORY BATCH (if adding stock) ====================

  IF p_quantity_change > 0 THEN
    INSERT INTO inventory_batches (
      product_id,
      branch_id,
      initial_quantity,
      remaining_quantity,
      unit_cost,
      batch_date,
      reference_type,
      reference_id,
      notes,
      created_at
    ) VALUES (
      p_product_id,
      p_branch_id,
      p_quantity_change,
      p_quantity_change,
      COALESCE(p_unit_cost, 0),
      CURRENT_DATE,
      'adjustment',
      v_adjustment_id::TEXT,
      p_reason,
      NOW()
    );
  ELSE
    -- For reduction, consume from FIFO batches
    PERFORM consume_inventory_fifo(
      p_product_id,
      p_branch_id,
      ABS(p_quantity_change),
      'ADJ-' || v_adjustment_id::TEXT
    );
  END IF;

  -- ==================== CREATE STOCK MOVEMENT RECORD ====================

  INSERT INTO product_stock_movements (
    id,
    product_id,
    branch_id,
    type,
    quantity,
    reference_type,
    reference_id,
    notes,
    user_id,
    created_at
  ) VALUES (
    v_adjustment_id,
    p_product_id,
    p_branch_id,
    CASE WHEN p_quantity_change > 0 THEN 'adjustment_in' ELSE 'adjustment_out' END,
    ABS(p_quantity_change),
    'adjustment',
    v_adjustment_id::TEXT,
    p_reason,
    auth.uid(),
    NOW()
  );

  -- ==================== CREATE JOURNAL ENTRY (if value > 0) ====================

  IF v_adjustment_value > 0 AND v_persediaan_account_id IS NOT NULL AND v_selisih_account_id IS NOT NULL THEN
    SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
      (COALESCE(
        (SELECT COUNT(*) + 1 FROM journal_entries
         WHERE branch_id = p_branch_id
         AND DATE(created_at) = CURRENT_DATE),
        1
      ))::TEXT, 4, '0')
    INTO v_entry_number;

    INSERT INTO journal_entries (
      id, branch_id, entry_number, entry_date, description,
      reference_type, reference_id, status, is_voided, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), p_branch_id, v_entry_number, CURRENT_DATE,
      'Penyesuaian Stok - ' || v_product_name || ' - ' || p_reason,
      'adjustment', v_adjustment_id::TEXT, 'posted', FALSE, NOW(), NOW()
    ) RETURNING id INTO v_journal_id;

    IF p_quantity_change > 0 THEN
      -- Stock IN: Dr. Persediaan, Cr. Selisih
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
      VALUES (v_journal_id, v_persediaan_account_id, (SELECT name FROM accounts WHERE id = v_persediaan_account_id), v_adjustment_value, 0, 'Penambahan persediaan', 1);

      INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
      VALUES (v_journal_id, v_selisih_account_id, (SELECT name FROM accounts WHERE id = v_selisih_account_id), 0, v_adjustment_value, 'Selisih stok', 2);
    ELSE
      -- Stock OUT: Dr. Selisih, Cr. Persediaan
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
      VALUES (v_journal_id, v_selisih_account_id, (SELECT name FROM accounts WHERE id = v_selisih_account_id), v_adjustment_value, 0, 'Selisih stok', 1);

      INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
      VALUES (v_journal_id, v_persediaan_account_id, (SELECT name FROM accounts WHERE id = v_persediaan_account_id), 0, v_adjustment_value, 'Pengurangan persediaan', 2);
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, v_adjustment_id, v_journal_id, v_new_stock, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, SQLERRM::TEXT;
END;
$function$
;


-- Function: create_receivable_payment_journal_rpc
CREATE OR REPLACE FUNCTION public.create_receivable_payment_journal_rpc(p_branch_id uuid, p_transaction_id text, p_payment_date date, p_amount numeric, p_customer_name text DEFAULT 'Pelanggan'::text, p_payment_account_id text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, journal_id uuid, entry_number text, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_kas_account_id TEXT;
  v_piutang_account_id TEXT;
BEGIN
  -- Validate
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Branch ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get account IDs
  IF p_payment_account_id IS NOT NULL THEN
    v_kas_account_id := p_payment_account_id;
  ELSE
    SELECT id INTO v_kas_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;
  END IF;

  SELECT id INTO v_piutang_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1210' AND is_active = TRUE LIMIT 1;

  IF v_kas_account_id IS NULL OR v_piutang_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Required accounts not found'::TEXT;
    RETURN;
  END IF;

  -- Generate entry number (global sequence)
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- Create journal entry header
  INSERT INTO journal_entries (
    branch_id,
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    status,
    is_voided,
    total_debit,
    total_credit,
    created_at,
    updated_at
  ) VALUES (
    p_branch_id,
    v_entry_number,
    p_payment_date,
    'Pembayaran Piutang - ' || p_transaction_id || ' - ' || p_customer_name,
    'receivable_payment', -- FIXED: was 'receivable', now 'receivable_payment'
    p_transaction_id,
    'posted',
    FALSE,
    p_amount,
    p_amount,
    NOW(),
    NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Kas
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_kas_account_id,
    (SELECT name FROM accounts WHERE id = v_kas_account_id),
    p_amount, 0, 'Penerimaan kas pembayaran piutang', 1
  );

  -- Cr. Piutang
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_piutang_account_id,
    (SELECT name FROM accounts WHERE id = v_piutang_account_id),
    0, p_amount, 'Pelunasan piutang usaha', 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, v_entry_number, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, SQLERRM::TEXT;
END;
$function$
;


-- Function: create_sales_journal_rpc
CREATE OR REPLACE FUNCTION public.create_sales_journal_rpc(p_branch_id uuid, p_transaction_id text, p_transaction_date date, p_total_amount numeric, p_paid_amount numeric DEFAULT 0, p_customer_name text DEFAULT 'Umum'::text, p_hpp_amount numeric DEFAULT 0, p_hpp_bonus_amount numeric DEFAULT 0, p_ppn_enabled boolean DEFAULT false, p_ppn_amount numeric DEFAULT 0, p_subtotal numeric DEFAULT 0, p_is_office_sale boolean DEFAULT false, p_payment_account_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(success boolean, journal_id uuid, entry_number text, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_line_number INTEGER := 1;
  v_cash_amount NUMERIC;
  v_credit_amount NUMERIC;
  v_revenue_amount NUMERIC;
  v_total_hpp NUMERIC;
  -- Account IDs
  v_kas_account_id UUID;
  v_piutang_account_id UUID;
  v_pendapatan_account_id UUID;
  v_hpp_account_id UUID;
  v_hpp_bonus_account_id UUID;
  v_persediaan_account_id UUID;
  v_hutang_bd_account_id UUID;
  v_ppn_account_id UUID;
BEGIN
  -- Validate branch
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Branch ID is required'::TEXT;
    RETURN;
  END IF;
  -- Calculate amounts
  v_cash_amount := LEAST(p_paid_amount, p_total_amount);
  v_credit_amount := p_total_amount - v_cash_amount;
  v_revenue_amount := CASE WHEN p_ppn_enabled AND p_subtotal > 0 THEN p_subtotal ELSE p_total_amount END;
  v_total_hpp := p_hpp_amount + p_hpp_bonus_amount;
  -- Get account IDs
  -- Kas account (use payment account if specified, otherwise default 1110)
  IF p_payment_account_id IS NOT NULL THEN
    v_kas_account_id := p_payment_account_id;
  ELSE
    SELECT id INTO v_kas_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;
  END IF;
  SELECT id INTO v_piutang_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1210' AND is_active = TRUE LIMIT 1;
  SELECT id INTO v_pendapatan_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '4100' AND is_active = TRUE LIMIT 1;
  SELECT id INTO v_hpp_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '5100' AND is_active = TRUE LIMIT 1;
  SELECT id INTO v_hpp_bonus_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '5210' AND is_active = TRUE LIMIT 1;
  SELECT id INTO v_persediaan_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1310' AND is_active = TRUE LIMIT 1;
  SELECT id INTO v_hutang_bd_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '2140' AND is_active = TRUE LIMIT 1;
  SELECT id INTO v_ppn_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '2130' AND is_active = TRUE LIMIT 1;
  -- Generate entry number
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;
  -- Create journal entry header
  INSERT INTO journal_entries (
    id,
    branch_id,
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    status,
    is_voided,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    p_branch_id,
    v_entry_number,
    p_transaction_date,
    'Penjualan ' ||
    CASE
      WHEN v_credit_amount > 0 AND v_cash_amount = 0 THEN 'Kredit'
      WHEN v_credit_amount > 0 AND v_cash_amount > 0 THEN 'Sebagian'
      ELSE 'Tunai'
    END || ' - ' || p_transaction_id || ' - ' || p_customer_name,
    'transaction',
    p_transaction_id,
    'posted',
    FALSE,
    NOW(),
    NOW()
  ) RETURNING id INTO v_journal_id;
  -- Insert journal lines
  -- 1. Dr. Kas (if cash payment)
  IF v_cash_amount > 0 AND v_kas_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_kas_account_id,
      (SELECT name FROM accounts WHERE id = v_kas_account_id),
      v_cash_amount, 0, 'Penerimaan kas penjualan', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;
  -- 2. Dr. Piutang (if credit)
  IF v_credit_amount > 0 AND v_piutang_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_piutang_account_id,
      (SELECT name FROM accounts WHERE id = v_piutang_account_id),
      v_credit_amount, 0, 'Piutang usaha', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;
  -- 3. Cr. Pendapatan
  IF v_pendapatan_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_pendapatan_account_id,
      (SELECT name FROM accounts WHERE id = v_pendapatan_account_id),
      0, v_revenue_amount, 'Pendapatan penjualan', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;
  -- 4. Cr. PPN Keluaran (if PPN enabled)
  IF p_ppn_enabled AND p_ppn_amount > 0 AND v_ppn_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_ppn_account_id,
      (SELECT name FROM accounts WHERE id = v_ppn_account_id),
      0, p_ppn_amount, 'PPN Keluaran', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;
  -- 5. Dr. HPP (regular items)
  IF p_hpp_amount > 0 AND v_hpp_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_hpp_account_id,
      (SELECT name FROM accounts WHERE id = v_hpp_account_id),
      p_hpp_amount, 0, 'Harga Pokok Penjualan', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;
  -- 6. Dr. HPP Bonus
  IF p_hpp_bonus_amount > 0 AND v_hpp_bonus_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, account_name,
      debit_amount, credit_amount, description, line_number
    ) VALUES (
      v_journal_id, v_hpp_bonus_account_id,
      (SELECT name FROM accounts WHERE id = v_hpp_bonus_account_id),
      p_hpp_bonus_amount, 0, 'HPP Bonus/Gratis', v_line_number
    );
    v_line_number := v_line_number + 1;
  END IF;
  -- 7. Cr. Persediaan or Hutang Barang Dagang
  IF v_total_hpp > 0 THEN
    IF p_is_office_sale THEN
      -- Office Sale: Cr. Persediaan (stok langsung berkurang)
      IF v_persediaan_account_id IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
          journal_entry_id, account_id, account_name,
          debit_amount, credit_amount, description, line_number
        ) VALUES (
          v_journal_id, v_persediaan_account_id,
          (SELECT name FROM accounts WHERE id = v_persediaan_account_id),
          0, v_total_hpp, 'Pengurangan persediaan', v_line_number
        );
      END IF;
    ELSE
      -- Non-Office Sale: Cr. Hutang Barang Dagang (kewajiban kirim)
      IF v_hutang_bd_account_id IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
          journal_entry_id, account_id, account_name,
          debit_amount, credit_amount, description, line_number
        ) VALUES (
          v_journal_id, v_hutang_bd_account_id,
          (SELECT name FROM accounts WHERE id = v_hutang_bd_account_id),
          0, v_total_hpp, 'Hutang barang dagang', v_line_number
        );
      END IF;
    END IF;
  END IF;
  RETURN QUERY SELECT TRUE, v_journal_id, v_entry_number, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, SQLERRM::TEXT;
END;
$function$
;


-- Function: create_tax_payment_atomic
CREATE OR REPLACE FUNCTION public.create_tax_payment_atomic(p_branch_id uuid, p_period text, p_ppn_masukan_used numeric, p_ppn_keluaran_paid numeric, p_payment_account_id text, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, journal_id uuid, net_payment numeric, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_reference_id TEXT;
  v_ppn_keluaran_account_id TEXT;
  v_ppn_masukan_account_id TEXT;
  v_net_payment NUMERIC;
  v_description TEXT;
  v_payment_date DATE := CURRENT_DATE;
BEGIN
  -- ==================== VALIDASI ====================
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, 'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;
  IF p_ppn_keluaran_paid <= 0 AND p_ppn_masukan_used <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, 'Jumlah PPN harus lebih dari 0'::TEXT;
    RETURN;
  END IF;
  IF p_payment_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, 'Akun pembayaran harus dipilih'::TEXT;
    RETURN;
  END IF;
  -- ==================== LOOKUP ACCOUNTS ====================
  -- Find PPN Keluaran account (2130)
  SELECT id INTO v_ppn_keluaran_account_id
  FROM accounts
  WHERE (
    LOWER(name) LIKE '%ppn%keluaran%' OR
    code = '2130'
  )
  AND is_header = FALSE
  AND branch_id = p_branch_id
  LIMIT 1;
  IF v_ppn_keluaran_account_id IS NULL THEN
    -- Try without branch filter (global accounts)
    SELECT id INTO v_ppn_keluaran_account_id
    FROM accounts
    WHERE (
      LOWER(name) LIKE '%ppn%keluaran%' OR
      code = '2130'
    )
    AND is_header = FALSE
    LIMIT 1;
  END IF;
  IF v_ppn_keluaran_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, 'Akun PPN Keluaran (2130) tidak ditemukan'::TEXT;
    RETURN;
  END IF;
  -- Find PPN Masukan account (1230)
  SELECT id INTO v_ppn_masukan_account_id
  FROM accounts
  WHERE (
    LOWER(name) LIKE '%ppn%masukan%' OR
    code = '1230'
  )
  AND is_header = FALSE
  AND branch_id = p_branch_id
  LIMIT 1;
  IF v_ppn_masukan_account_id IS NULL THEN
    -- Try without branch filter (global accounts)
    SELECT id INTO v_ppn_masukan_account_id
    FROM accounts
    WHERE (
      LOWER(name) LIKE '%ppn%masukan%' OR
      code = '1230'
    )
    AND is_header = FALSE
    LIMIT 1;
  END IF;
  IF v_ppn_masukan_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, 'Akun PPN Masukan (1230) tidak ditemukan'::TEXT;
    RETURN;
  END IF;
  -- ==================== CALCULATE NET PAYMENT ====================
  -- Net payment = PPN Keluaran - PPN Masukan
  -- Jika positif, kita bayar ke negara
  -- Jika negatif, kita punya lebih bayar (kredit)
  v_net_payment := COALESCE(p_ppn_keluaran_paid, 0) - COALESCE(p_ppn_masukan_used, 0);
  -- ==================== BUILD DESCRIPTION & REFERENCE ====================
  v_description := 'Pembayaran PPN';
  IF p_period IS NOT NULL THEN
    v_description := v_description || ' periode ' || p_period;
  END IF;
  -- Create reference_id in format TAX-YYYYMM-xxx for period parsing
  -- Extract YYYYMM from period (handles both "2024-01" and "Januari 2024" formats)
  DECLARE
    v_year_month TEXT;
  BEGIN
    -- Try to match YYYY-MM format
    IF p_period ~ '^\d{4}-\d{2}$' THEN
      v_year_month := REPLACE(p_period, '-', '');
    ELSE
      -- Default to current month
      v_year_month := TO_CHAR(v_payment_date, 'YYYYMM');
    END IF;
    v_reference_id := 'TAX-' || v_year_month || '-' ||
                      LPAD((EXTRACT(EPOCH FROM NOW())::BIGINT % 10000)::TEXT, 4, '0');
  END;
  -- ==================== CREATE JOURNAL ENTRY ====================
  v_entry_number := 'JE-TAX-' || TO_CHAR(v_payment_date, 'YYYYMMDD') || '-' ||
                    LPAD((EXTRACT(EPOCH FROM NOW())::BIGINT % 10000)::TEXT, 4, '0');
  INSERT INTO journal_entries (
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    is_posted,
    status,
    branch_id,
    created_by,
    created_at
  ) VALUES (
    v_entry_number,
    v_payment_date,
    CASE WHEN p_notes IS NOT NULL AND p_notes != ''
      THEN v_description || ' - ' || p_notes
      ELSE v_description
    END,
    'tax_payment',
    v_reference_id,
    TRUE,
    'posted',
    p_branch_id,
    'System',
    NOW()
  )
  RETURNING id INTO v_journal_id;
  -- ==================== JOURNAL LINE ITEMS ====================
  -- Jurnal Pembayaran PPN:
  -- Untuk mengOffset PPN Keluaran (liability) dan PPN Masukan (asset)
  --
  -- Dr PPN Keluaran (2130) - menghapus kewajiban
  -- Cr PPN Masukan (1230) - menghapus hak kredit
  -- Cr Kas - selisihnya (net payment)
  -- 1. Debit PPN Keluaran (mengurangi liability)
  IF p_ppn_keluaran_paid > 0 THEN
    INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_journal_id, v_ppn_keluaran_account_id, p_ppn_keluaran_paid, 0,
      'Offset PPN Keluaran periode ' || COALESCE(p_period, ''));
  END IF;
  -- 2. Credit PPN Masukan (mengurangi asset/hak kredit)
  IF p_ppn_masukan_used > 0 THEN
    INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_journal_id, v_ppn_masukan_account_id, 0, p_ppn_masukan_used,
      'Offset PPN Masukan periode ' || COALESCE(p_period, ''));
  END IF;
  -- 3. Kas - selisih pembayaran
  IF v_net_payment > 0 THEN
    -- Kita bayar ke negara (Credit Kas)
    INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_journal_id, p_payment_account_id, 0, v_net_payment,
      'Pembayaran PPN ke negara periode ' || COALESCE(p_period, ''));
  ELSIF v_net_payment < 0 THEN
    -- Lebih bayar - record as Debit to Kas (refund or carry forward)
    INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_journal_id, p_payment_account_id, ABS(v_net_payment), 0,
      'Lebih bayar PPN periode ' || COALESCE(p_period, ''));
  END IF;
  -- ==================== UPDATE ACCOUNT BALANCES ====================
  -- Update PPN Keluaran balance (liability decreases = subtract from balance)
  IF p_ppn_keluaran_paid > 0 THEN
    UPDATE accounts
    SET balance = COALESCE(balance, 0) - p_ppn_keluaran_paid,
        updated_at = NOW()
    WHERE id = v_ppn_keluaran_account_id;
  END IF;
  -- Update PPN Masukan balance (asset decreases = subtract from balance)
  IF p_ppn_masukan_used > 0 THEN
    UPDATE accounts
    SET balance = COALESCE(balance, 0) - p_ppn_masukan_used,
        updated_at = NOW()
    WHERE id = v_ppn_masukan_account_id;
  END IF;
  -- Update Kas/Bank balance
  IF v_net_payment > 0 THEN
    -- Payment to government: decrease cash
    UPDATE accounts
    SET balance = COALESCE(balance, 0) - v_net_payment,
        updated_at = NOW()
    WHERE id = p_payment_account_id;
  ELSIF v_net_payment < 0 THEN
    -- Overpayment refund: increase cash
    UPDATE accounts
    SET balance = COALESCE(balance, 0) + ABS(v_net_payment),
        updated_at = NOW()
    WHERE id = p_payment_account_id;
  END IF;
  -- ==================== LOG ====================
  RAISE NOTICE '[Tax Payment] Journal % created. PPN Keluaran: %, PPN Masukan: %, Net: %',
    v_entry_number, p_ppn_keluaran_paid, p_ppn_masukan_used, v_net_payment;
  RETURN QUERY SELECT TRUE, v_journal_id, v_net_payment, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, SQLERRM::TEXT;
END;
$function$
;


-- Function: create_tax_payment_atomic
CREATE OR REPLACE FUNCTION public.create_tax_payment_atomic(p_branch_id uuid, p_period text, p_ppn_masukan_used numeric DEFAULT 0, p_ppn_keluaran_paid numeric DEFAULT 0, p_payment_account_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, payment_id uuid, journal_id uuid, net_payment numeric, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_payment_id UUID;
  v_journal_id UUID;
  v_net_payment NUMERIC;
  v_kas_account_id UUID;
  v_ppn_masukan_id UUID;
  v_ppn_keluaran_id UUID;
  v_entry_number TEXT;
  v_line_number INTEGER := 1;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  v_net_payment := p_ppn_keluaran_paid - p_ppn_masukan_used;

  IF v_net_payment <= 0 AND p_ppn_keluaran_paid = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'Tidak ada pajak untuk disetor'::TEXT;
    RETURN;
  END IF;

  -- ==================== GET ACCOUNT IDS ====================

  IF p_payment_account_id IS NOT NULL THEN
    v_kas_account_id := p_payment_account_id;
  ELSE
    SELECT id INTO v_kas_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;
  END IF;

  SELECT id INTO v_ppn_masukan_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1230' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_ppn_keluaran_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '2130' AND is_active = TRUE LIMIT 1;

  v_payment_id := gen_random_uuid();

  -- ==================== INSERT TAX PAYMENT RECORD ====================

  INSERT INTO tax_payments (
    id, branch_id, period, ppn_masukan_used, ppn_keluaran_paid,
    net_payment, payment_account_id, notes, created_by, created_at
  ) VALUES (
    v_payment_id, p_branch_id, p_period, p_ppn_masukan_used, p_ppn_keluaran_paid,
    v_net_payment, p_payment_account_id, p_notes, auth.uid(), NOW()
  );

  -- ==================== CREATE JOURNAL ENTRY ====================

  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE((SELECT COUNT(*) + 1 FROM journal_entries WHERE branch_id = p_branch_id AND DATE(created_at) = CURRENT_DATE), 1))::TEXT, 4, '0')
  INTO v_entry_number;

  INSERT INTO journal_entries (id, branch_id, entry_number, entry_date, description, reference_type, reference_id, status, is_voided, created_at, updated_at)
  VALUES (gen_random_uuid(), p_branch_id, v_entry_number, CURRENT_DATE, 'Setor Pajak Periode ' || p_period, 'tax_payment', v_payment_id::TEXT, 'posted', FALSE, NOW(), NOW())
  RETURNING id INTO v_journal_id;

  -- Dr. PPN Keluaran (mengurangi kewajiban)
  IF p_ppn_keluaran_paid > 0 AND v_ppn_keluaran_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
    VALUES (v_journal_id, v_ppn_keluaran_id, (SELECT name FROM accounts WHERE id = v_ppn_keluaran_id), p_ppn_keluaran_paid, 0, 'Setor PPN Keluaran', v_line_number);
    v_line_number := v_line_number + 1;
  END IF;

  -- Cr. PPN Masukan (menggunakan kredit pajak)
  IF p_ppn_masukan_used > 0 AND v_ppn_masukan_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
    VALUES (v_journal_id, v_ppn_masukan_id, (SELECT name FROM accounts WHERE id = v_ppn_masukan_id), 0, p_ppn_masukan_used, 'Kompensasi PPN Masukan', v_line_number);
    v_line_number := v_line_number + 1;
  END IF;

  -- Cr. Kas (pembayaran netto)
  IF v_net_payment > 0 AND v_kas_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, account_name, debit_amount, credit_amount, description, line_number)
    VALUES (v_journal_id, v_kas_account_id, (SELECT name FROM accounts WHERE id = v_kas_account_id), 0, v_net_payment, 'Pembayaran pajak', v_line_number);
  END IF;

  RETURN QUERY SELECT TRUE, v_payment_id, v_journal_id, v_net_payment, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, SQLERRM::TEXT;
END;
$function$
;


-- Function: create_transaction_atomic
CREATE OR REPLACE FUNCTION public.create_transaction_atomic(p_transaction jsonb, p_items jsonb, p_branch_id uuid, p_cashier_id uuid DEFAULT NULL::uuid, p_cashier_name text DEFAULT NULL::text, p_quotation_id text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, transaction_id text, total_hpp numeric, total_hpp_bonus numeric, journal_id uuid, items_count integer, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_transaction_id TEXT;
  v_customer_id UUID;
  v_customer_name TEXT;
  v_total NUMERIC;
  v_paid_amount NUMERIC;
  v_payment_method TEXT;
  v_payment_account_id TEXT;
  v_is_office_sale BOOLEAN;
  v_date TIMESTAMPTZ;
  v_notes TEXT;
  v_sales_id UUID;
  v_sales_name TEXT;
  v_retasi_id UUID;
  v_retasi_number TEXT;

  v_item JSONB;
  v_product_id UUID;
  v_product_name TEXT;
  v_quantity NUMERIC;
  v_price NUMERIC;
  v_discount NUMERIC;
  v_is_bonus BOOLEAN;
  v_cost_price NUMERIC;
  v_unit TEXT;
  v_width NUMERIC;
  v_height NUMERIC;

  v_total_hpp NUMERIC := 0;
  v_total_hpp_bonus NUMERIC := 0;
  v_fifo_result RECORD;
  v_item_hpp NUMERIC;
  v_items_inserted INTEGER := 0;

  v_journal_id UUID;
  v_kas_account_id TEXT;  -- accounts.id is TEXT not UUID
  v_piutang_account_id TEXT;
  v_pendapatan_account_id TEXT;
  v_hpp_account_id TEXT;
  v_hpp_bonus_account_id TEXT;
  v_persediaan_account_id TEXT;
  v_bahan_baku_account_id TEXT;
  v_item_type TEXT;
  v_material_id UUID;

  v_journal_lines JSONB := '[]'::JSONB;
  v_items_array JSONB := '[]'::JSONB;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 0::NUMERIC, 0::NUMERIC, NULL::UUID, 0,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_transaction IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 0::NUMERIC, 0::NUMERIC, NULL::UUID, 0,
      'Transaction data is required'::TEXT;
    RETURN;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 0::NUMERIC, 0::NUMERIC, NULL::UUID, 0,
      'Items are required'::TEXT;
    RETURN;
  END IF;

  -- ==================== PARSE TRANSACTION DATA ====================

  v_transaction_id := COALESCE(
    p_transaction->>'id',
    'TRX-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 100000)::TEXT, 5, '0')
  );
  v_customer_id := (p_transaction->>'customer_id')::UUID;
  v_customer_name := p_transaction->>'customer_name';
  v_total := COALESCE((p_transaction->>'total')::NUMERIC, 0);
  v_paid_amount := COALESCE((p_transaction->>'paid_amount')::NUMERIC, 0);
  -- Normalize payment_method to valid values: cash, bank_transfer, check, digital_wallet
  v_payment_method := CASE LOWER(COALESCE(p_transaction->>'payment_method', 'cash'))
    WHEN 'tunai' THEN 'cash'
    WHEN 'cash' THEN 'cash'
    WHEN 'transfer' THEN 'bank_transfer'
    WHEN 'bank_transfer' THEN 'bank_transfer'
    WHEN 'bank' THEN 'bank_transfer'
    WHEN 'cek' THEN 'check'
    WHEN 'check' THEN 'check'
    WHEN 'giro' THEN 'check'
    WHEN 'digital' THEN 'digital_wallet'
    WHEN 'digital_wallet' THEN 'digital_wallet'
    WHEN 'e-wallet' THEN 'digital_wallet'
    ELSE 'cash'
  END;
  v_is_office_sale := COALESCE((p_transaction->>'is_office_sale')::BOOLEAN, FALSE);
  v_date := COALESCE((p_transaction->>'date')::TIMESTAMPTZ, NOW());
  v_notes := p_transaction->>'notes';
  v_sales_id := (p_transaction->>'sales_id')::UUID;
  v_sales_name := p_transaction->>'sales_name';
  v_payment_account_id := (p_transaction->>'payment_account_id')::TEXT;
  v_retasi_id := (p_transaction->>'retasi_id')::UUID;
  v_retasi_number := p_transaction->>'retasi_number';

  -- ==================== GET ACCOUNT IDS ====================

  SELECT id INTO v_kas_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_piutang_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1210' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_pendapatan_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '4100' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_hpp_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '5100' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_hpp_bonus_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '5210' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_persediaan_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1310' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_bahan_baku_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1320' AND is_active = TRUE LIMIT 1;

  -- ==================== PROCESS ITEMS & CALCULATE HPP ====================

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Reset for each item
    v_product_id := NULL;
    v_material_id := NULL;
    
    v_product_name := v_item->>'product_name';
    v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
    v_price := COALESCE((v_item->>'price')::NUMERIC, 0);
    v_discount := COALESCE((v_item->>'discount')::NUMERIC, 0);
    v_is_bonus := COALESCE((v_item->>'is_bonus')::BOOLEAN, FALSE);
    v_cost_price := COALESCE((v_item->>'cost_price')::NUMERIC, 0);
    v_unit := v_item->>'unit';
    v_width := (v_item->>'width')::NUMERIC;
    v_height := (v_item->>'height')::NUMERIC;
    v_item_type := v_item->>'product_type';

    -- Determine if this is a material or product based on ID prefix
    IF (v_item->>'product_id') LIKE 'material-%' THEN
      -- This is a material item
      v_material_id := (v_item->>'material_id')::UUID;
    ELSE
      -- This is a regular product
      v_product_id := (v_item->>'product_id')::UUID;
    END IF;

    -- Process based on type
    IF v_material_id IS NOT NULL AND v_quantity > 0 THEN
      -- MATERIAL: Consume material stock immediately (no delivery needed)
      SELECT * INTO v_fifo_result FROM consume_material_fifo(
        v_material_id,
        p_branch_id,
        v_quantity,
        v_transaction_id,
        'sale',
        'Material sold directly'
      );

      IF NOT v_fifo_result.success THEN
        RAISE EXCEPTION 'Gagal potong stok material: %', v_fifo_result.error_message;
      END IF;

      -- For materials, cost comes from material FIFO
      v_item_hpp := COALESCE(v_fifo_result.total_cost, v_cost_price * v_quantity);

      -- Accumulate HPP
      IF v_is_bonus THEN
        v_total_hpp_bonus := v_total_hpp_bonus + v_item_hpp;
      ELSE
        v_total_hpp := v_total_hpp + v_item_hpp;
      END IF;

      -- Build item for storage
      v_items_array := v_items_array || jsonb_build_object(
        'productId', COALESCE(v_product_id, v_material_id),
        'productName', v_product_name,
        'quantity', v_quantity,
        'price', v_price,
        'discount', v_discount,
        'isBonus', v_is_bonus,
        'costPrice', v_cost_price,
        'hppAmount', v_item_hpp,
        'productType', CASE WHEN v_material_id IS NOT NULL THEN 'material' ELSE 'product' END,
        'unit', v_unit,
        'width', v_width,
        'height', v_height
      );

      v_items_inserted := v_items_inserted + 1;

    ELSIF v_product_id IS NOT NULL AND v_quantity > 0 THEN
      -- PRODUCT: Calculate HPP using FIFO
      IF v_is_office_sale THEN
        -- Office Sale: Consume inventory immediately (v3 supports negative stock)
        SELECT * INTO v_fifo_result FROM consume_inventory_fifo(
          v_product_id,
          p_branch_id,
          v_quantity,
          v_transaction_id
        );

        IF NOT v_fifo_result.success THEN
          RAISE EXCEPTION 'Gagal potong stok: %', v_fifo_result.error_message;
        END IF;

        v_item_hpp := v_fifo_result.total_hpp;
      ELSE
        -- Non-Office Sale: Calculate only (consume at delivery)
        SELECT f.total_hpp INTO v_item_hpp FROM calculate_fifo_cost(
          v_product_id,
          p_branch_id,
          v_quantity
        ) f;
        v_item_hpp := COALESCE(v_item_hpp, v_cost_price * v_quantity);
      END IF;

      -- Accumulate HPP
      IF v_is_bonus THEN
        v_total_hpp_bonus := v_total_hpp_bonus + v_item_hpp;
      ELSE
        v_total_hpp := v_total_hpp + v_item_hpp;
      END IF;

      -- Build item for storage
      v_items_array := v_items_array || jsonb_build_object(
        'productId', COALESCE(v_product_id, v_material_id),
        'productName', v_product_name,
        'quantity', v_quantity,
        'price', v_price,
        'discount', v_discount,
        'isBonus', v_is_bonus,
        'costPrice', v_cost_price,
        'hppAmount', v_item_hpp,
        'productType', CASE WHEN v_material_id IS NOT NULL THEN 'material' ELSE 'product' END,
        'unit', v_unit,
        'width', v_width,
        'height', v_height
      );

      v_items_inserted := v_items_inserted + 1;
    END IF;
  END LOOP;

  -- ==================== INSERT TRANSACTION ====================

  INSERT INTO transactions (
    id,
    branch_id,
    customer_id,
    customer_name,
    cashier_id,
    cashier_name,
    sales_id,
    sales_name,
    order_date,
    items,
    total,
    paid_amount,
    payment_status,
    payment_account_id,
    status,
    delivery_status,
    is_office_sale,
    notes,
    retasi_id,
    retasi_number,
    created_at,
    updated_at
  ) VALUES (
    v_transaction_id,
    p_branch_id,
    v_customer_id,
    v_customer_name,
    p_cashier_id,
    p_cashier_name,
    v_sales_id,
    v_sales_name,
    v_date,
    v_items_array,
    v_total,
    v_paid_amount,
    CASE WHEN v_paid_amount >= v_total THEN 'Lunas' ELSE 'Belum Lunas' END,
    v_payment_account_id,
    'Pesanan Masuk',
    CASE WHEN v_is_office_sale THEN 'Completed' ELSE 'Pending' END,
    v_is_office_sale,
    v_notes,
    v_retasi_id,
    v_retasi_number,
    NOW(),
    NOW()
  );

  -- ==================== INSERT PAYMENT RECORD ====================

  IF v_paid_amount > 0 THEN
    INSERT INTO transaction_payments (
      transaction_id,
      branch_id,
      amount,
      payment_method,
      payment_date,
      account_name,
      description,
      notes,
      paid_by_user_name,
      created_by,
      created_at
    ) VALUES (
      v_transaction_id,
      p_branch_id,
      v_paid_amount,
      v_payment_method,
      v_date,
      COALESCE(v_payment_method, 'Tunai'),
      'Pembayaran transaksi ' || v_transaction_id,
      'Initial Payment for ' || v_transaction_id,
      COALESCE(p_cashier_name, 'System'),
      p_cashier_id,
      NOW()
    );
  END IF;

  -- ==================== UPDATE QUOTATION IF EXISTS ====================

  IF p_quotation_id IS NOT NULL THEN
    UPDATE quotations
    SET transaction_id = v_transaction_id, status = 'Disetujui', updated_at = NOW()
    WHERE id = p_quotation_id;
  END IF;

  -- ==================== CREATE SALES JOURNAL ====================

  IF v_total > 0 THEN
    -- Build journal lines
    v_journal_lines := '[]'::JSONB;

    -- Debit: Kas atau Piutang
    IF v_paid_amount >= v_total THEN
      -- Lunas: Debit Kas
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '1110',
        'debit_amount', v_total,
        'credit_amount', 0,
        'description', 'Penerimaan kas dari penjualan'
      );
    ELSIF v_paid_amount > 0 THEN
      -- Bayar sebagian: Debit Kas + Piutang
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '1110',
        'debit_amount', v_paid_amount,
        'credit_amount', 0,
        'description', 'Penerimaan kas dari penjualan'
      );
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '1210',
        'debit_amount', v_total - v_paid_amount,
        'credit_amount', 0,
        'description', 'Piutang usaha'
      );
    ELSE
      -- Belum bayar: Debit Piutang
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '1210',
        'debit_amount', v_total,
        'credit_amount', 0,
        'description', 'Piutang usaha'
      );
    END IF;

    -- Credit: Pendapatan
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_code', '4100',
      'debit_amount', 0,
      'credit_amount', v_total,
      'description', 'Pendapatan penjualan'
    );

    -- Debit: HPP (regular items)
    IF v_total_hpp > 0 THEN
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '5100',
        'debit_amount', v_total_hpp,
        'credit_amount', 0,
        'description', 'Harga Pokok Penjualan'
      );
    END IF;

    -- Debit: HPP Bonus (bonus items)
    IF v_total_hpp_bonus > 0 THEN
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '5210',
        'debit_amount', v_total_hpp_bonus,
        'credit_amount', 0,
        'description', 'HPP Bonus/Gratis'
      );
    END IF;

    -- Credit: Persediaan
    IF (v_total_hpp + v_total_hpp_bonus) > 0 THEN
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '1310',
        'debit_amount', 0,
        'credit_amount', v_total_hpp + v_total_hpp_bonus,
        'description', 'Pengurangan persediaan'
      );
    END IF;

    -- Create journal using existing RPC
    -- Note: Cast v_date::DATE because create_journal_atomic expects DATE, not TIMESTAMPTZ
    SELECT * INTO v_fifo_result FROM create_journal_atomic(
      p_branch_id,
      v_date::DATE,
      'Penjualan ke ' || COALESCE(v_customer_name, 'Umum') || ' - ' || v_transaction_id,
      'transaction',
      v_transaction_id,
      v_journal_lines,
      TRUE
    );

    IF v_fifo_result.success THEN
      v_journal_id := v_fifo_result.journal_id;
    END IF;
  END IF;

  -- ==================== GENERATE SALES COMMISSION ====================

  IF v_sales_id IS NOT NULL AND v_total > 0 THEN
    BEGIN
      INSERT INTO commission_entries (
        employee_id,
        transaction_id,
        delivery_id,
        product_id,
        quantity,
        amount,
        commission_type,
        status,
        branch_id,
        entry_date,
        created_at
      )
      SELECT
        v_sales_id,
        v_transaction_id,
        NULL,
        (item->>'productId')::UUID,
        (item->>'quantity')::NUMERIC,
        COALESCE(
          (SELECT cr.amount FROM commission_rules cr
           WHERE cr.product_id = (item->>'productId')::UUID
           AND cr.role = 'sales'
           AND cr.is_active = TRUE LIMIT 1),
          0
        ) * (item->>'quantity')::NUMERIC,
        'sales',
        'pending',
        p_branch_id,
        v_date,
        NOW()
      FROM jsonb_array_elements(v_items_array) AS item
      WHERE (item->>'isBonus')::BOOLEAN IS NOT TRUE
        AND (item->>'quantity')::NUMERIC > 0;
    EXCEPTION WHEN OTHERS THEN
      -- Commission generation failed, but don't fail the transaction
      NULL;
    END;
  END IF;

  -- ==================== MARK CUSTOMER AS VISITED ====================

  IF v_customer_id IS NOT NULL THEN
    BEGIN
      UPDATE customers
      SET
        last_transaction_date = NOW(),
        last_visited_at = NOW(),
        last_visited_by = p_cashier_id,
        updated_at = NOW()
      WHERE id = v_customer_id;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT
    TRUE,
    v_transaction_id,
    v_total_hpp,
    v_total_hpp_bonus,
    v_journal_id,
    v_items_inserted,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::TEXT, 0::NUMERIC, 0::NUMERIC, NULL::UUID, 0, SQLERRM::TEXT;
END;
$function$
;


-- Function: create_transfer_journal_rpc
CREATE OR REPLACE FUNCTION public.create_transfer_journal_rpc(p_branch_id uuid, p_transfer_id text, p_transfer_date date, p_amount numeric, p_from_account_id text, p_to_account_id text, p_description text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_from_account RECORD;
  v_to_account RECORD;
BEGIN
  -- VALIDASI
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Amount must be greater than 0'::TEXT;
    RETURN;
  END IF;

  IF p_from_account_id IS NULL OR p_to_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'From and To accounts are required'::TEXT;
    RETURN;
  END IF;

  IF p_from_account_id = p_to_account_id THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Cannot transfer to same account'::TEXT;
    RETURN;
  END IF;

  -- GET ACCOUNT INFO
  SELECT id, code, name INTO v_from_account FROM accounts WHERE id = p_from_account_id;
  SELECT id, code, name INTO v_to_account FROM accounts WHERE id = p_to_account_id;

  IF v_from_account.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun asal tidak ditemukan: ' || p_from_account_id::TEXT;
    RETURN;
  END IF;

  IF v_to_account.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun tujuan tidak ditemukan: ' || p_to_account_id::TEXT;
    RETURN;
  END IF;

  -- GENERATE ENTRY NUMBER (GLOBAL SEQUENCE)
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  -- CREATE JOURNAL ENTRY
  INSERT INTO journal_entries (
    id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, status, is_voided, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_branch_id, v_entry_number, p_transfer_date,
    COALESCE(p_description, 'Transfer dari ' || v_from_account.name || ' ke ' || v_to_account.name),
    'transfer', p_transfer_id, 'posted', FALSE, NOW(), NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Akun Tujuan (kas bertambah)
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, p_to_account_id, v_to_account.code, v_to_account.name,
    p_amount, 0, 'Transfer masuk dari ' || v_from_account.name, 1
  );

  -- Cr. Akun Asal (kas berkurang)
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_code, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, p_from_account_id, v_from_account.code, v_from_account.name,
    0, p_amount, 'Transfer keluar ke ' || v_to_account.name, 2
  );

  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


-- Function: create_zakat_cash_entry
CREATE OR REPLACE FUNCTION public.create_zakat_cash_entry()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_account_name TEXT;
    v_cash_history_id TEXT;
BEGIN
    -- Only create cash entry if status is 'paid' and payment account is specified
    IF NEW.status = 'paid' AND NEW.payment_account_id IS NOT NULL AND NEW.cash_history_id IS NULL THEN
        -- Get account name
        SELECT name INTO v_account_name FROM accounts WHERE id = NEW.payment_account_id;
        -- Generate cash history ID
        v_cash_history_id := 'CH-ZAKAT-' || NEW.id || '-' || EXTRACT(EPOCH FROM NOW())::TEXT;
        -- Insert into cash_history
        INSERT INTO cash_history (
            id,
            account_id,
            account_name,
            amount,
            type,
            description,
            reference_type,
            reference_id,
            reference_name,
            created_at
        ) VALUES (
            v_cash_history_id,
            NEW.payment_account_id,
            v_account_name,
            NEW.amount,
            CASE
                WHEN NEW.category = 'zakat' THEN 'zakat'
                ELSE 'sedekah'
            END,
            NEW.title || COALESCE(' - ' || NEW.description, ''),
            CASE
                WHEN NEW.category = 'zakat' THEN 'zakat'
                ELSE 'charity'
            END,
            NEW.id,
            NEW.title,
            NEW.payment_date
        );
        -- Update the zakat record with cash_history_id
        NEW.cash_history_id := v_cash_history_id;
        -- Update account balance
        UPDATE accounts
        SET balance = balance - NEW.amount
        WHERE id = NEW.payment_account_id;
    END IF;
    RETURN NEW;
END;
$function$
;


-- Function: create_zakat_payment_atomic
CREATE OR REPLACE FUNCTION public.create_zakat_payment_atomic(p_zakat jsonb, p_branch_id uuid, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS TABLE(success boolean, zakat_id uuid, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_zakat_id UUID;
  v_journal_id UUID;
  v_amount NUMERIC;
  v_zakat_type TEXT;
  v_payment_date DATE;
  v_recipient TEXT;
  v_notes TEXT;
  v_payment_account_id UUID;
  v_kas_account_id UUID;
  v_beban_zakat_id UUID;
  v_entry_number TEXT;
BEGIN
  -- ==================== VALIDASI ====================
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;
  -- ==================== PARSE DATA ====================
  v_zakat_id := COALESCE((p_zakat->>'id')::UUID, gen_random_uuid());
  v_amount := COALESCE((p_zakat->>'amount')::NUMERIC, 0);
  v_zakat_type := COALESCE(p_zakat->>'zakat_type', 'maal'); -- maal, fitrah, profesi
  v_payment_date := COALESCE((p_zakat->>'payment_date')::DATE, CURRENT_DATE);
  v_recipient := COALESCE(p_zakat->>'recipient', 'Lembaga Amil Zakat');
  v_notes := p_zakat->>'notes';
  v_payment_account_id := (p_zakat->>'payment_account_id')::UUID;
  IF v_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Amount must be positive'::TEXT;
    RETURN;
  END IF;
  -- ==================== GET ACCOUNT IDS ====================
  -- Kas account
  IF v_payment_account_id IS NOT NULL THEN
    v_kas_account_id := v_payment_account_id;
  ELSE
    SELECT id INTO v_kas_account_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;
  END IF;
  -- Beban Zakat (6xxx - Beban Operasional, atau buat khusus 6500)
  SELECT id INTO v_beban_zakat_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '6500' AND is_active = TRUE LIMIT 1;
  -- Fallback: cari akun dengan nama mengandung "Zakat"
  IF v_beban_zakat_id IS NULL THEN
    SELECT id INTO v_beban_zakat_id FROM accounts
    WHERE branch_id = p_branch_id AND name ILIKE '%zakat%' AND is_active = TRUE LIMIT 1;
  END IF;
  -- Fallback: gunakan Beban Lain-lain (8100)
  IF v_beban_zakat_id IS NULL THEN
    SELECT id INTO v_beban_zakat_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '8100' AND is_active = TRUE LIMIT 1;
  END IF;
  IF v_kas_account_id IS NULL OR v_beban_zakat_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Akun Kas atau Beban Zakat tidak ditemukan'::TEXT;
    RETURN;
  END IF;
  -- ==================== INSERT ZAKAT RECORD ====================
  INSERT INTO zakat_payments (
    id,
    branch_id,
    amount,
    zakat_type,
    payment_date,
    recipient,
    notes,
    status,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_zakat_id,
    p_branch_id,
    v_amount,
    v_zakat_type,
    v_payment_date,
    v_recipient,
    v_notes,
    'paid',
    p_created_by,
    NOW(),
    NOW()
  );
  -- ==================== CREATE JOURNAL ENTRY ====================
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;
  INSERT INTO journal_entries (
    id,
    branch_id,
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    status,
    is_voided,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    p_branch_id,
    v_entry_number,
    v_payment_date,
    'Pembayaran Zakat ' || INITCAP(v_zakat_type) || ' - ' || v_recipient,
    'zakat',
    v_zakat_id::TEXT,
    'posted',
    FALSE,
    NOW(),
    NOW()
  ) RETURNING id INTO v_journal_id;
  -- Dr. Beban Zakat
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_beban_zakat_id,
    (SELECT name FROM accounts WHERE id = v_beban_zakat_id),
    v_amount, 0, 'Beban Zakat ' || INITCAP(v_zakat_type), 1
  );
  -- Cr. Kas
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_kas_account_id,
    (SELECT name FROM accounts WHERE id = v_kas_account_id),
    0, v_amount, 'Pengeluaran kas untuk zakat', 2
  );
  -- ==================== SUCCESS ====================
  RETURN QUERY SELECT TRUE, v_zakat_id, v_journal_id, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


-- Function: delete_account
CREATE OR REPLACE FUNCTION public.delete_account(p_account_id text)
 RETURNS TABLE(success boolean, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_has_transactions BOOLEAN;
  v_has_children BOOLEAN;
BEGIN
  -- Cek Transactions
  SELECT EXISTS (
    SELECT 1 FROM journal_entry_lines WHERE account_id = p_account_id
  ) INTO v_has_transactions;

  IF v_has_transactions THEN
    RETURN QUERY SELECT FALSE, 'Cannot delete account with existing transactions. Deactivate it instead.';
    RETURN;
  END IF;

  -- Cek Children
  SELECT EXISTS (
    SELECT 1 FROM accounts WHERE parent_id = p_account_id
  ) INTO v_has_children;

  IF v_has_children THEN
    RETURN QUERY SELECT FALSE, 'Cannot delete account with sub-accounts';
    RETURN;
  END IF;

  DELETE FROM accounts WHERE id = p_account_id;

  RETURN QUERY SELECT TRUE, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, SQLERRM;
END;
$function$
;


-- Function: demo_balance_sheet
CREATE OR REPLACE FUNCTION public.demo_balance_sheet()
 RETURNS TABLE(section text, code character varying, account_name text, amount numeric)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  -- ASET
  SELECT 
    'ASET' as section,
    a.code,
    a.name as account_name,
    a.balance as amount
  FROM public.accounts a
  WHERE a.type = 'ASET' 
    AND a.is_header = false
    AND a.is_active = true
    AND a.code IS NOT NULL
  
  UNION ALL
  
  -- KEWAJIBAN
  SELECT 
    'KEWAJIBAN' as section,
    a.code,
    a.name as account_name, 
    a.balance as amount
  FROM public.accounts a
  WHERE a.type = 'KEWAJIBAN'
    AND a.is_header = false
    AND a.is_active = true
    AND a.code IS NOT NULL
    
  UNION ALL
  
  -- MODAL
  SELECT 
    'MODAL' as section,
    a.code,
    a.name as account_name,
    a.balance as amount  
  FROM public.accounts a
  WHERE a.type = 'MODAL'
    AND a.is_header = false
    AND a.is_active = true
    AND a.code IS NOT NULL
    
  ORDER BY section, code;
END;
$function$
;


-- Function: demo_show_chart_of_accounts
CREATE OR REPLACE FUNCTION public.demo_show_chart_of_accounts()
 RETURNS TABLE(level_indent text, code character varying, account_name text, account_type text, normal_bal character varying, current_balance numeric, is_header_account boolean)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    REPEAT('  ', a.level - 1) || 
    CASE 
      WHEN a.is_header THEN '???? '
      ELSE '???? '
    END as level_indent,
    a.code,
    a.name as account_name,
    a.type as account_type,
    a.normal_balance as normal_bal,
    a.balance as current_balance,
    a.is_header as is_header_account
  FROM public.accounts a
  WHERE a.is_active = true
    AND (a.code IS NOT NULL OR a.id LIKE 'acc-%')
  ORDER BY a.sort_order, a.code;
END;
$function$
;


-- Function: demo_trial_balance
CREATE OR REPLACE FUNCTION public.demo_trial_balance()
 RETURNS TABLE(code character varying, account_name text, debit_balance numeric, credit_balance numeric)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    a.code,
    a.name as account_name,
    CASE 
      WHEN a.normal_balance = 'DEBIT' AND a.balance >= 0 THEN a.balance
      WHEN a.normal_balance = 'DEBIT' AND a.balance < 0 THEN 0
      WHEN a.normal_balance = 'CREDIT' AND a.balance < 0 THEN ABS(a.balance)
      ELSE 0
    END as debit_balance,
    CASE 
      WHEN a.normal_balance = 'CREDIT' AND a.balance >= 0 THEN a.balance  
      WHEN a.normal_balance = 'CREDIT' AND a.balance < 0 THEN 0
      WHEN a.normal_balance = 'DEBIT' AND a.balance < 0 THEN ABS(a.balance)
      ELSE 0
    END as credit_balance
  FROM public.accounts a
  WHERE a.is_active = true 
    AND a.is_header = false
    AND a.code IS NOT NULL
    AND a.balance != 0
  ORDER BY a.code;
END;
$function$
;


-- Function: get_account_balance
CREATE OR REPLACE FUNCTION public.get_account_balance(p_account_id text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_balance NUMERIC;
    v_account_type TEXT;
    v_total_debit NUMERIC;
    v_total_credit NUMERIC;
BEGIN
    SELECT type INTO v_account_type FROM accounts WHERE id = p_account_id;
    IF NOT FOUND THEN RETURN NULL; END IF;

    SELECT
        COALESCE(SUM(jel.debit_amount), 0),
        COALESCE(SUM(jel.credit_amount), 0)
    INTO v_total_debit, v_total_credit
    FROM journal_entry_lines jel
    INNER JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE jel.account_id = p_account_id
      AND je.status = 'posted'
      AND je.is_voided = FALSE;

    IF v_account_type IN ('Aset', 'Beban') THEN
        v_balance := v_total_debit - v_total_credit;
    ELSE
        v_balance := v_total_credit - v_total_debit;
    END IF;

    RETURN v_balance;
END;
$function$
;


-- Function: get_account_balance_at_date
CREATE OR REPLACE FUNCTION public.get_account_balance_at_date(p_account_id text, p_as_of_date date)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_balance NUMERIC;
    v_account_type TEXT;
    v_total_debit NUMERIC;
    v_total_credit NUMERIC;
BEGIN
    SELECT type INTO v_account_type FROM accounts WHERE id = p_account_id;
    IF NOT FOUND THEN RETURN NULL; END IF;

    SELECT
        COALESCE(SUM(jel.debit_amount), 0),
        COALESCE(SUM(jel.credit_amount), 0)
    INTO v_total_debit, v_total_credit
    FROM journal_entry_lines jel
    INNER JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE jel.account_id = p_account_id
      AND je.status = 'posted'
      AND je.is_voided = FALSE
      AND je.entry_date <= p_as_of_date;

    IF v_account_type IN ('Aset', 'Beban') THEN
        v_balance := v_total_debit - v_total_credit;
    ELSE
        v_balance := v_total_credit - v_total_debit;
    END IF;

    RETURN v_balance;
END;
$function$
;


-- Function: get_account_balance_with_children
CREATE OR REPLACE FUNCTION public.get_account_balance_with_children(account_id text)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
DECLARE
  total_balance NUMERIC := 0;
BEGIN
  -- Get sum of all child account balances
  WITH RECURSIVE account_tree AS (
    SELECT id, balance FROM public.accounts WHERE id = account_id
    UNION ALL
    SELECT a.id, a.balance 
    FROM public.accounts a
    JOIN account_tree at ON a.parent_id = at.id
  )
  SELECT COALESCE(SUM(balance), 0) INTO total_balance
  FROM account_tree
  WHERE id != account_id OR NOT EXISTS(
    SELECT 1 FROM public.accounts WHERE parent_id = account_id
  );
  
  RETURN total_balance;
END;
$function$
;


-- Function: get_account_opening_balance
CREATE OR REPLACE FUNCTION public.get_account_opening_balance(p_account_id text, p_branch_id uuid)
 RETURNS TABLE(opening_balance numeric, journal_id uuid, journal_date date, last_updated timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_account RECORD;
  v_journal_balance NUMERIC;
  v_journal_id UUID;
  v_journal_date DATE;
  v_journal_updated TIMESTAMPTZ;
BEGIN
  -- Get account info
  SELECT id, type, initial_balance, updated_at INTO v_account
  FROM accounts
  WHERE id = p_account_id AND branch_id = p_branch_id;

  IF v_account.id IS NULL THEN
    RETURN QUERY SELECT 0::NUMERIC, NULL::UUID, NULL::DATE, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Try to get opening balance from journal first (Single Source of Truth)
  SELECT
    CASE
      WHEN v_account.type IN ('Aset', 'Beban') THEN jel.debit_amount
      ELSE jel.credit_amount
    END,
    je.id,
    je.entry_date,
    je.updated_at
  INTO v_journal_balance, v_journal_id, v_journal_date, v_journal_updated
  FROM journal_entries je
  INNER JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  WHERE je.reference_id = p_account_id
    AND je.reference_type = 'opening_balance'
    AND je.branch_id = p_branch_id
    AND je.is_voided = FALSE
    AND jel.account_id = p_account_id
  ORDER BY je.created_at DESC
  LIMIT 1;

  -- If journal found, return journal data
  IF v_journal_id IS NOT NULL THEN
    RETURN QUERY SELECT v_journal_balance, v_journal_id, v_journal_date, v_journal_updated;
    RETURN;
  END IF;

  -- Fallback: return initial_balance from accounts column (for legacy data)
  IF COALESCE(v_account.initial_balance, 0) != 0 THEN
    RETURN QUERY SELECT v_account.initial_balance, NULL::UUID, NULL::DATE, v_account.updated_at;
    RETURN;
  END IF;

  -- No opening balance found
  RETURN QUERY SELECT 0::NUMERIC, NULL::UUID, NULL::DATE, NULL::TIMESTAMPTZ;
END;
$function$
;


-- Function: get_all_accounts_balance_analysis
CREATE OR REPLACE FUNCTION public.get_all_accounts_balance_analysis()
 RETURNS TABLE(account_id text, account_name text, account_type text, current_balance numeric, calculated_balance numeric, difference numeric, needs_reconciliation boolean, last_updated timestamp with time zone)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    analysis.account_id,
    analysis.account_name,
    analysis.account_type,
    analysis.current_balance,
    analysis.calculated_balance,
    analysis.difference,
    analysis.needs_reconciliation,
    COALESCE(acc.updated_at, acc.created_at, NOW()) as last_updated
  FROM accounts acc,
  LATERAL get_account_balance_analysis(acc.id) analysis
  ORDER BY ABS(analysis.difference) DESC;
END;
$function$
;


-- Function: get_expense_account_for_category
CREATE OR REPLACE FUNCTION public.get_expense_account_for_category(category_name text)
 RETURNS TABLE(account_id text, account_code text, account_name text)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  -- Map category to account
  RETURN QUERY
  SELECT a.id::TEXT, a.code::TEXT, a.name::TEXT
  FROM accounts a
  WHERE a.type = 'Expense'
    AND (
      (category_name ILIKE '%gaji%' AND a.code = '6100') OR
      (category_name ILIKE '%listrik%' AND a.code = '6200') OR
      (category_name ILIKE '%sewa%' AND a.code = '6300') OR
      (category_name ILIKE '%transport%' AND a.code = '6400') OR
      (category_name ILIKE '%perlengkapan%' AND a.code = '6500') OR
      (category_name ILIKE '%pemeliharaan%' AND a.code = '6600') OR
      (category_name ILIKE '%bahan%' AND a.code = '5100') OR
      (a.code = '6900') -- Default: Beban Lain-lain
    )
  ORDER BY 
    CASE 
      WHEN category_name ILIKE '%gaji%' AND a.code = '6100' THEN 1
      WHEN category_name ILIKE '%listrik%' AND a.code = '6200' THEN 1
      WHEN category_name ILIKE '%sewa%' AND a.code = '6300' THEN 1
      WHEN category_name ILIKE '%transport%' AND a.code = '6400' THEN 1
      WHEN category_name ILIKE '%perlengkapan%' AND a.code = '6500' THEN 1
      WHEN category_name ILIKE '%pemeliharaan%' AND a.code = '6600' THEN 1
      WHEN category_name ILIKE '%bahan%' AND a.code = '5100' THEN 1
      ELSE 2
    END
  LIMIT 1;
  
  -- If no match, return default
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT a.id::TEXT, a.code::TEXT, a.name::TEXT
    FROM accounts a
    WHERE a.code = '6900'
    LIMIT 1;
  END IF;
END;
$function$
;


-- Function: import_standard_coa
CREATE OR REPLACE FUNCTION public.import_standard_coa(p_branch_id uuid, p_items jsonb)
 RETURNS TABLE(success boolean, imported_count integer, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_item JSONB;
  v_count INTEGER := 0;
BEGIN
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Branch ID is required';
    RETURN;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Insert or ignore if code exists (or update?)
    -- Logic similar to useAccounts: upsert based on some key, but here we don't have predictable IDs.
    -- We'll check by code.
    
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE branch_id = p_branch_id AND code = (v_item->>'code')) THEN
       INSERT INTO accounts (
         branch_id,
         name,
         code,
         type,
         level,
         is_header,
         sort_order,
         is_active,
         balance,
         initial_balance,
         created_at,
         updated_at
       ) VALUES (
         p_branch_id,
         v_item->>'name',
         v_item->>'code',
         v_item->>'type',
         (v_item->>'level')::INTEGER,
         (v_item->>'isHeader')::BOOLEAN,
         (v_item->>'sortOrder')::INTEGER,
         TRUE,
         0,
         0,
         NOW(),
         NOW()
       );
       v_count := v_count + 1;
    END IF;
  END LOOP;
  
  -- Second pass for parents? 
  -- Simplified: Assumes hierarchy is handled by codes or manual update later if needed.
  -- Or implemented if 'parentCode' provided.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
     IF (v_item->>'parentCode') IS NOT NULL THEN
        UPDATE accounts child
        SET parent_id = parent.id
        FROM accounts parent
        WHERE child.branch_id = p_branch_id AND child.code = (v_item->>'code')
          AND parent.branch_id = p_branch_id AND parent.code = (v_item->>'parentCode');
     END IF;
  END LOOP;

  RETURN QUERY SELECT TRUE, v_count, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, SQLERRM;
END;
$function$
;


-- Function: pay_commission_atomic
CREATE OR REPLACE FUNCTION public.pay_commission_atomic(p_employee_id uuid, p_branch_id uuid, p_amount numeric, p_payment_date date DEFAULT CURRENT_DATE, p_payment_method text DEFAULT 'cash'::text, p_commission_ids uuid[] DEFAULT NULL::uuid[], p_notes text DEFAULT NULL::text, p_paid_by uuid DEFAULT NULL::uuid)
 RETURNS TABLE(success boolean, payment_id uuid, journal_id uuid, commissions_paid integer, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_payment_id UUID;
  v_journal_id UUID;
  v_employee_name TEXT;
  v_kas_account_id UUID;
  v_beban_komisi_id UUID;
  v_entry_number TEXT;
  v_commissions_paid INTEGER := 0;
  v_total_pending NUMERIC;
BEGIN
  -- ==================== VALIDASI ====================
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;
  IF p_employee_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, 'Employee ID is required'::TEXT;
    RETURN;
  END IF;
  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, 'Amount must be positive'::TEXT;
    RETURN;
  END IF;
  -- Get employee name from profiles table (localhost uses profiles, not employees)
  SELECT full_name INTO v_employee_name FROM profiles WHERE id = p_employee_id;
  IF v_employee_name IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, 'Karyawan tidak ditemukan'::TEXT;
    RETURN;
  END IF;
  -- Check total pending commissions
  SELECT COALESCE(SUM(amount), 0) INTO v_total_pending
  FROM commission_entries
  WHERE user_id = p_employee_id
    AND branch_id = p_branch_id
    AND status = 'pending';
  IF v_total_pending < p_amount THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0,
      format('Jumlah pembayaran (%s) melebihi total komisi pending (%s)', p_amount, v_total_pending)::TEXT;
    RETURN;
  END IF;
  -- ==================== GET ACCOUNT IDS ====================
  SELECT id INTO v_kas_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;
  -- Beban Komisi (biasanya 6200 atau sesuai chart of accounts)
  SELECT id INTO v_beban_komisi_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '6200' AND is_active = TRUE LIMIT 1;
  -- Fallback: cari akun dengan nama mengandung "Komisi"
  IF v_beban_komisi_id IS NULL THEN
    SELECT id INTO v_beban_komisi_id FROM accounts
    WHERE branch_id = p_branch_id AND name ILIKE '%komisi%' AND type = 'expense' AND is_active = TRUE LIMIT 1;
  END IF;
  -- Fallback: gunakan Beban Gaji (6100)
  IF v_beban_komisi_id IS NULL THEN
    SELECT id INTO v_beban_komisi_id FROM accounts
    WHERE branch_id = p_branch_id AND code = '6100' AND is_active = TRUE LIMIT 1;
  END IF;
  IF v_kas_account_id IS NULL OR v_beban_komisi_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, 'Akun Kas atau Beban Komisi tidak ditemukan'::TEXT;
    RETURN;
  END IF;
  -- ==================== UPDATE COMMISSION ENTRIES ====================
  v_payment_id := gen_random_uuid();
  IF p_commission_ids IS NOT NULL AND array_length(p_commission_ids, 1) > 0 THEN
    -- Pay specific commission entries
    UPDATE commission_entries
    SET
      status = 'paid',
      paid_at = NOW(),
      payment_id = v_payment_id,
      updated_at = NOW()
    WHERE id = ANY(p_commission_ids)
      AND user_id = p_employee_id
      AND branch_id = p_branch_id
      AND status = 'pending';
    GET DIAGNOSTICS v_commissions_paid = ROW_COUNT;
  ELSE
    -- Pay oldest pending commissions up to amount
    WITH to_pay AS (
      SELECT id, amount,
        SUM(amount) OVER (ORDER BY created_at) as running_total
      FROM commission_entries
      WHERE user_id = p_employee_id
        AND branch_id = p_branch_id
        AND status = 'pending'
      ORDER BY created_at
    )
    UPDATE commission_entries ce
    SET
      status = 'paid',
      paid_at = NOW(),
      payment_id = v_payment_id,
      updated_at = NOW()
    FROM to_pay tp
    WHERE ce.id = tp.id
      AND tp.running_total <= p_amount;
    GET DIAGNOSTICS v_commissions_paid = ROW_COUNT;
  END IF;
  -- ==================== INSERT PAYMENT RECORD ====================
  INSERT INTO commission_payments (
    id,
    employee_id,
    employee_name,
    branch_id,
    amount,
    payment_date,
    payment_method,
    notes,
    paid_by,
    created_at
  ) VALUES (
    v_payment_id,
    p_employee_id,
    v_employee_name,
    p_branch_id,
    p_amount,
    p_payment_date,
    p_payment_method,
    p_notes,
    p_paid_by,
    NOW()
  );
  -- ==================== CREATE JOURNAL ENTRY ====================
  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;
  INSERT INTO journal_entries (
    id,
    branch_id,
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    status,
    is_voided,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    p_branch_id,
    v_entry_number,
    p_payment_date,
    'Pembayaran Komisi - ' || v_employee_name,
    'commission_payment',
    v_payment_id::TEXT,
    'posted',
    FALSE,
    NOW(),
    NOW()
  ) RETURNING id INTO v_journal_id;
  -- Dr. Beban Komisi
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_beban_komisi_id,
    (SELECT name FROM accounts WHERE id = v_beban_komisi_id),
    p_amount, 0, 'Beban komisi ' || v_employee_name, 1
  );
  -- Cr. Kas
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_kas_account_id,
    (SELECT name FROM accounts WHERE id = v_kas_account_id),
    0, p_amount, 'Pengeluaran kas untuk komisi', 2
  );
  -- ==================== SUCCESS ====================
  RETURN QUERY SELECT TRUE, v_payment_id, v_journal_id, v_commissions_paid, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, SQLERRM::TEXT;
END;
$function$
;


-- Function: pay_receivable_complete_rpc
CREATE OR REPLACE FUNCTION public.pay_receivable_complete_rpc(p_branch_id uuid, p_receivable_id uuid, p_amount numeric, p_payment_method text DEFAULT 'cash'::text, p_payment_account_id text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS TABLE(success boolean, payment_id uuid, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_payment_id UUID := gen_random_uuid();
  v_journal_id UUID := gen_random_uuid();
  v_journal_number TEXT;
  v_receivable RECORD;
  v_kas_account_id TEXT;
  v_piutang_account_id TEXT;
BEGIN
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Branch ID wajib diisi'::TEXT;
    RETURN;
  END IF;

  SELECT r.*, c.name as customer_name INTO v_receivable
  FROM receivables r LEFT JOIN customers c ON r.customer_id = c.id
  WHERE r.id = p_receivable_id AND r.branch_id = p_branch_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Piutang tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  IF p_payment_account_id IS NOT NULL THEN
    v_kas_account_id := p_payment_account_id;
  ELSE
    SELECT id INTO v_kas_account_id FROM accounts WHERE code = '1110' AND branch_id = p_branch_id;
  END IF;

  SELECT id INTO v_piutang_account_id FROM accounts WHERE code = '1210' AND branch_id = p_branch_id;

  IF v_kas_account_id IS NULL OR v_piutang_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Akun kas atau piutang tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  v_journal_number := 'JE-PAY-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM()*10000)::TEXT, 4, '0');

  INSERT INTO journal_entries (id, entry_number, entry_date, description, reference_type, reference_id, status, total_debit, total_credit, branch_id, created_by, created_at, is_voided)
  VALUES (v_journal_id, v_journal_number, CURRENT_DATE, format('Pembayaran piutang: %s', COALESCE(v_receivable.customer_name, 'Customer')), 'payment', v_payment_id::TEXT, 'posted', p_amount, p_amount, p_branch_id, p_created_by, NOW(), FALSE);

  INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, account_code, account_name, description, debit_amount, credit_amount)
  SELECT v_journal_id, 1, a.id, a.code, a.name, format('Terima dari %s', COALESCE(v_receivable.customer_name, 'Customer')), p_amount, 0
  FROM accounts a WHERE a.id = v_kas_account_id;

  INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, account_code, account_name, description, debit_amount, credit_amount)
  SELECT v_journal_id, 2, a.id, a.code, a.name, format('Pelunasan piutang: %s', COALESCE(v_receivable.customer_name, 'Customer')), 0, p_amount
  FROM accounts a WHERE a.id = v_piutang_account_id;

  INSERT INTO receivable_payments (id, receivable_id, amount, payment_method, payment_date, notes, journal_id, created_by, created_at)
  VALUES (v_payment_id, p_receivable_id, p_amount, p_payment_method, CURRENT_DATE, p_notes, v_journal_id, p_created_by, NOW());

  UPDATE receivables SET paid_amount = paid_amount + p_amount, status = CASE WHEN paid_amount + p_amount >= total_amount THEN 'paid' ELSE 'partial' END WHERE id = p_receivable_id;

  RETURN QUERY SELECT TRUE, v_payment_id, v_journal_id, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


-- Function: pay_supplier_atomic
CREATE OR REPLACE FUNCTION public.pay_supplier_atomic(p_payable_id text, p_branch_id uuid, p_amount numeric, p_payment_method text DEFAULT 'cash'::text, p_payment_date date DEFAULT CURRENT_DATE, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, payment_id uuid, remaining_amount numeric, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_payment_id UUID;
  v_payable RECORD;
  v_remaining NUMERIC;
  v_new_paid_amount NUMERIC;
  v_journal_id UUID;
  v_entry_number TEXT;
  v_kas_account_id TEXT;      -- accounts.id is TEXT
  v_hutang_account_id TEXT;   -- accounts.id is TEXT
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_payable_id IS NULL OR p_payable_id = '' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Payable ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get payable info (struktur sesuai tabel accounts_payable yang ada)
  SELECT
    ap.id,
    ap.supplier_name,
    ap.amount,              -- Total amount hutang
    COALESCE(ap.paid_amount, 0) as paid_amount,
    ap.status
  INTO v_payable
  FROM accounts_payable ap
  WHERE ap.id = p_payable_id AND ap.branch_id = p_branch_id;

  IF v_payable.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Payable not found in this branch'::TEXT;
    RETURN;
  END IF;

  IF v_payable.status = 'Paid' OR v_payable.status = 'paid' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Hutang sudah lunas'::TEXT;
    RETURN;
  END IF;

  -- Calculate new amounts
  v_new_paid_amount := v_payable.paid_amount + p_amount;
  v_remaining := GREATEST(0, v_payable.amount - v_new_paid_amount);

  -- ==================== UPDATE PAYABLE (langsung, tanpa payment record terpisah) ====================

  UPDATE accounts_payable
  SET
    paid_amount = v_new_paid_amount,
    status = CASE WHEN v_remaining <= 0 THEN 'Paid' ELSE 'Partial' END,
    paid_at = CASE WHEN v_remaining <= 0 THEN NOW() ELSE paid_at END,
    notes = COALESCE(p_notes, notes)
  WHERE id = p_payable_id;

  -- Generate a payment ID for tracking
  v_payment_id := gen_random_uuid();

  -- ==================== CREATE JOURNAL ENTRY ====================

  -- Get account IDs
  IF p_payment_method = 'transfer' THEN
    SELECT id INTO v_kas_account_id
    FROM accounts
    WHERE code = '1120' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;
  ELSE
    SELECT id INTO v_kas_account_id
    FROM accounts
    WHERE code = '1110' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;
  END IF;

  SELECT id INTO v_hutang_account_id
  FROM accounts
  WHERE code = '2110' AND branch_id = p_branch_id AND is_active = TRUE
  LIMIT 1;

  IF v_kas_account_id IS NOT NULL AND v_hutang_account_id IS NOT NULL THEN
    DECLARE
       v_journal_lines JSONB;
       v_journal_res RECORD;
    BEGIN
       -- Dr. Hutang Usaha
       -- Cr. Kas/Bank
       v_journal_lines := jsonb_build_array(
         jsonb_build_object(
           'account_id', v_hutang_account_id,
           'debit_amount', p_amount,
           'credit_amount', 0,
           'description', format('Bayar ke %s', COALESCE(v_payable.supplier_name, 'Supplier'))
         ),
         jsonb_build_object(
           'account_id', v_kas_account_id,
           'debit_amount', 0,
           'credit_amount', p_amount,
           'description', format('Pembayaran hutang: %s', COALESCE(v_payable.supplier_name, 'Supplier'))
         )
       );

       SELECT * INTO v_journal_res FROM create_journal_atomic(
         p_branch_id,
         p_payment_date,
         format('Bayar hutang ke: %s', COALESCE(v_payable.supplier_name, 'Supplier')),
         'payable_payment',
         v_payment_id::TEXT,
         v_journal_lines,
         TRUE
       );

       IF v_journal_res.success THEN
         v_journal_id := v_journal_res.journal_id;
       ELSE
         RAISE EXCEPTION 'Gagal membuat jurnal pembayaran hutang: %', v_journal_res.error_message;
       END IF;
    END;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    v_payment_id,
    v_remaining,
    v_journal_id,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


-- Function: pay_supplier_atomic
CREATE OR REPLACE FUNCTION public.pay_supplier_atomic(p_branch_id uuid, p_payable_id uuid, p_amount numeric, p_payment_method text DEFAULT 'cash'::text, p_payment_account_id text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS TABLE(success boolean, payment_id uuid, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_payment_id UUID := gen_random_uuid();
  v_journal_id UUID := gen_random_uuid();
  v_journal_number TEXT;
  v_payable RECORD;
  v_kas_account_id TEXT;
  v_hutang_account_id TEXT;
BEGIN
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Branch ID wajib diisi'::TEXT;
    RETURN;
  END IF;

  SELECT ap.*, s.name as supplier_name INTO v_payable
  FROM accounts_payable ap LEFT JOIN suppliers s ON ap.supplier_id = s.id
  WHERE ap.id = p_payable_id AND ap.branch_id = p_branch_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Hutang tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  IF p_payment_account_id IS NOT NULL THEN
    v_kas_account_id := p_payment_account_id;
  ELSE
    SELECT id INTO v_kas_account_id FROM accounts WHERE code = '1110' AND branch_id = p_branch_id;
  END IF;

  SELECT id INTO v_hutang_account_id FROM accounts WHERE code = '2110' AND branch_id = p_branch_id;

  IF v_kas_account_id IS NULL OR v_hutang_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'Akun kas atau hutang tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  v_journal_number := 'JE-SUP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM()*10000)::TEXT, 4, '0');

  INSERT INTO journal_entries (id, entry_number, entry_date, description, reference_type, reference_id, status, total_debit, total_credit, branch_id, created_by, created_at, is_voided)
  VALUES (v_journal_id, v_journal_number, CURRENT_DATE, format('Pembayaran hutang: %s', COALESCE(v_payable.supplier_name, 'Supplier')), 'supplier_payment', v_payment_id::TEXT, 'posted', p_amount, p_amount, p_branch_id, p_created_by, NOW(), FALSE);

  INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, account_code, account_name, description, debit_amount, credit_amount)
  SELECT v_journal_id, 1, a.id, a.code, a.name, format('Bayar ke %s', COALESCE(v_payable.supplier_name, 'Supplier')), p_amount, 0
  FROM accounts a WHERE a.id = v_hutang_account_id;

  INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, account_code, account_name, description, debit_amount, credit_amount)
  SELECT v_journal_id, 2, a.id, a.code, a.name, format('Pembayaran hutang: %s', COALESCE(v_payable.supplier_name, 'Supplier')), 0, p_amount
  FROM accounts a WHERE a.id = v_kas_account_id;

  UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;

  INSERT INTO supplier_payments (id, payable_id, amount, payment_method, payment_date, notes, journal_id, created_by, created_at)
  VALUES (v_payment_id, p_payable_id, p_amount, p_payment_method, CURRENT_DATE, p_notes, v_journal_id, p_created_by, NOW());

  UPDATE accounts_payable SET paid_amount = paid_amount + p_amount, status = CASE WHEN paid_amount + p_amount >= total_amount THEN 'paid' ELSE 'partial' END WHERE id = p_payable_id;

  RETURN QUERY SELECT TRUE, v_payment_id, v_journal_id, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


-- Function: preview_closing_entry
CREATE OR REPLACE FUNCTION public.preview_closing_entry(p_branch_id uuid, p_year integer)
 RETURNS TABLE(total_pendapatan numeric, total_beban numeric, laba_rugi_bersih numeric, pendapatan_accounts jsonb, beban_accounts jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_closing_date DATE := (p_year || '-12-31')::DATE;
  v_total_pendapatan NUMERIC := 0;
  v_total_beban NUMERIC := 0;
  v_pendapatan_json JSONB := '[]'::JSONB;
  v_beban_json JSONB := '[]'::JSONB;
  v_acc RECORD;
BEGIN
  -- Pendapatan
  FOR v_acc IN 
    SELECT a.id, a.code, a.name, ABS(SUM(l.debit_amount - l.credit_amount)) as balance
    FROM accounts a
    JOIN journal_entry_lines l ON l.account_id = a.id
    JOIN journal_entries j ON j.id = l.journal_entry_id
    WHERE a.branch_id = p_branch_id 
      AND a.type = 'Pendapatan'
      AND j.status = 'posted' AND j.is_voided = FALSE
      AND j.entry_date BETWEEN (p_year || '-01-01')::DATE AND v_closing_date
    GROUP BY a.id, a.code, a.name
    HAVING SUM(l.debit_amount - l.credit_amount) != 0
  LOOP
    v_total_pendapatan := v_total_pendapatan + v_acc.balance;
    v_pendapatan_json := v_pendapatan_json || jsonb_build_object(
      'id', v_acc.id,
      'code', v_acc.code,
      'name', v_acc.name,
      'balance', v_acc.balance
    );
  END LOOP;
  -- Beban
  FOR v_acc IN 
    SELECT a.id, a.code, a.name, ABS(SUM(l.debit_amount - l.credit_amount)) as balance
    FROM accounts a
    JOIN journal_entry_lines l ON l.account_id = a.id
    JOIN journal_entries j ON j.id = l.journal_entry_id
    WHERE a.branch_id = p_branch_id 
      AND a.type = 'Beban'
      AND j.status = 'posted' AND j.is_voided = FALSE
      AND j.entry_date BETWEEN (p_year || '-01-01')::DATE AND v_closing_date
    GROUP BY a.id, a.code, a.name
    HAVING SUM(l.debit_amount - l.credit_amount) != 0
  LOOP
    v_total_beban := v_total_beban + v_acc.balance;
    v_beban_json := v_beban_json || jsonb_build_object(
      'id', v_acc.id,
      'code', v_acc.code,
      'name', v_acc.name,
      'balance', v_acc.balance
    );
  END LOOP;
  RETURN QUERY SELECT 
    v_total_pendapatan, 
    v_total_beban, 
    v_total_pendapatan - v_total_beban,
    v_pendapatan_json,
    v_beban_json;
END;
$function$
;


-- Function: process_delivery_atomic
CREATE OR REPLACE FUNCTION public.process_delivery_atomic(p_branch_id uuid, p_transaction_id uuid, p_driver_id uuid DEFAULT NULL::uuid, p_delivery_date date DEFAULT CURRENT_DATE, p_notes text DEFAULT NULL::text, p_photo_url text DEFAULT NULL::text, p_items jsonb DEFAULT '[]'::jsonb, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS TABLE(success boolean, delivery_id uuid, delivery_number integer, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_delivery_id UUID := gen_random_uuid();
  v_delivery_number INT;
  v_journal_id UUID;
  v_journal_number TEXT;
  v_total_hpp_real NUMERIC := 0;
  v_item RECORD;
  v_consumed RECORD;
  v_transaction RECORD;
  v_acc_tertahan TEXT;
  v_acc_persediaan TEXT;
  v_product_name TEXT;
BEGIN
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::INT, NULL::UUID, 'Branch ID wajib diisi'::TEXT;
    RETURN;
  END IF;

  SELECT t.*, c.name as customer_name INTO v_transaction
  FROM transactions t LEFT JOIN customers c ON t.customer_id = c.id
  WHERE t.id = p_transaction_id AND t.branch_id = p_branch_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::INT, NULL::UUID, 'Transaksi tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  SELECT COALESCE(MAX(delivery_number), 0) + 1 INTO v_delivery_number FROM deliveries WHERE transaction_id = p_transaction_id;

  SELECT id INTO v_acc_tertahan FROM accounts WHERE code = '2140' AND branch_id = p_branch_id;
  SELECT id INTO v_acc_persediaan FROM accounts WHERE code = '1310' AND branch_id = p_branch_id;

  IF v_acc_tertahan IS NULL OR v_acc_persediaan IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::INT, NULL::UUID, 'Akun 2140 atau 1310 tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  INSERT INTO deliveries (id, transaction_id, delivery_number, driver_id, delivery_date, notes, photo_url, branch_id, created_by, created_at, status)
  VALUES (v_delivery_id, p_transaction_id, v_delivery_number, p_driver_id, p_delivery_date, p_notes, p_photo_url, p_branch_id, p_created_by, NOW(), 'completed');

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity NUMERIC) LOOP
    SELECT name INTO v_product_name FROM products WHERE id = v_item.product_id;

    FOR v_consumed IN SELECT * FROM consume_inventory_fifo_v3(p_branch_id, v_item.product_id, v_item.quantity) LOOP
      IF NOT v_consumed.success THEN RAISE EXCEPTION 'Gagal consume inventory: %', v_consumed.error_message; END IF;
      v_total_hpp_real := v_total_hpp_real + COALESCE(v_consumed.total_cost, 0);
    END LOOP;

    INSERT INTO delivery_items (delivery_id, product_id, quantity, created_at) VALUES (v_delivery_id, v_item.product_id, v_item.quantity, NOW());
  END LOOP;

  IF v_total_hpp_real > 0 THEN
    v_journal_id := gen_random_uuid();
    v_journal_number := 'JE-DEL-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM()*10000)::TEXT, 4, '0');

    INSERT INTO journal_entries (id, entry_number, entry_date, description, reference_type, reference_id, status, total_debit, total_credit, branch_id, created_by, created_at, is_voided)
    VALUES (v_journal_id, v_journal_number, p_delivery_date, format('HPP Pengiriman #%s - %s', v_delivery_number, COALESCE(v_transaction.customer_name, v_transaction.ref)), 'delivery', v_delivery_id::TEXT, 'posted', v_total_hpp_real, v_total_hpp_real, p_branch_id, p_created_by, NOW(), FALSE);

    INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, account_code, account_name, description, debit_amount, credit_amount)
    SELECT v_journal_id, 1, a.id, a.code, a.name, 'Realisasi Pengiriman', v_total_hpp_real, 0 FROM accounts a WHERE a.id = v_acc_tertahan;

    INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, account_code, account_name, description, debit_amount, credit_amount)
    SELECT v_journal_id, 2, a.id, a.code, a.name, 'Barang Keluar Gudang', 0, v_total_hpp_real FROM accounts a WHERE a.id = v_acc_persediaan;

    UPDATE deliveries SET journal_id = v_journal_id WHERE id = v_delivery_id;
  END IF;

  RETURN QUERY SELECT TRUE, v_delivery_id, v_delivery_number, v_journal_id, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::INT, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


-- Function: process_migration_delivery_journal
CREATE OR REPLACE FUNCTION public.process_migration_delivery_journal(p_delivery_id uuid, p_delivery_value numeric, p_branch_id uuid, p_customer_name text, p_transaction_id text)
 RETURNS TABLE(success boolean, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_journal_id UUID;
  v_entry_number TEXT;
  v_modal_tertahan_id TEXT;
  v_pendapatan_id TEXT;
BEGIN
  -- ==================== VALIDASI ====================
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;
  IF p_delivery_value <= 0 THEN
    RETURN QUERY SELECT TRUE, NULL::UUID, 'No journal needed for zero value'::TEXT;
    RETURN;
  END IF;
  -- ==================== LOOKUP ACCOUNTS ====================
  -- Find Modal Barang Dagang Tertahan (2140)
  SELECT id INTO v_modal_tertahan_id
  FROM accounts
  WHERE (
    LOWER(name) LIKE '%modal%barang%tertahan%' OR
    LOWER(name) LIKE '%modal%dagang%tertahan%' OR
    code = '2140'
  )
  AND is_header = FALSE
  LIMIT 1;
  IF v_modal_tertahan_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Modal Barang Dagang Tertahan (2140) tidak ditemukan'::TEXT;
    RETURN;
  END IF;
  -- Find Pendapatan Penjualan (4100)
  SELECT id INTO v_pendapatan_id
  FROM accounts
  WHERE (
    LOWER(name) LIKE '%pendapatan%penjualan%' OR
    LOWER(name) LIKE '%penjualan%' OR
    code = '4100'
  )
  AND is_header = FALSE
  AND type = 'revenue'
  LIMIT 1;
  IF v_pendapatan_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Pendapatan Penjualan tidak ditemukan'::TEXT;
    RETURN;
  END IF;
  -- ==================== CREATE JOURNAL ENTRY ====================
  v_entry_number := 'JE-MIG-DEL-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                    LPAD((EXTRACT(EPOCH FROM NOW())::BIGINT % 10000)::TEXT, 4, '0');
  INSERT INTO journal_entries (
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    is_posted,
    branch_id,
    created_by,
    created_at
  ) VALUES (
    v_entry_number,
    CURRENT_DATE,
    format('[MIGRASI] Pengiriman Barang - %s', p_customer_name),
    'migration_delivery',
    p_delivery_id::TEXT,
    TRUE,
    p_branch_id,
    'System',
    NOW()
  )
  RETURNING id INTO v_journal_id;
  -- ==================== JOURNAL LINE ITEMS ====================
  -- Jurnal pengiriman migrasi:
  -- Dr Modal Barang Dagang Tertahan (2140)
  --    Cr Pendapatan Penjualan (4100)
  --
  -- Ini mengubah "utang sistem" → "penjualan sah"
  -- Debit: Modal Barang Dagang Tertahan
  INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
  VALUES (v_journal_id, v_modal_tertahan_id, p_delivery_value, 0,
    format('Pengiriman migrasi - %s', p_customer_name));
  -- Credit: Pendapatan Penjualan
  INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit, description)
  VALUES (v_journal_id, v_pendapatan_id, 0, p_delivery_value,
    format('Pendapatan penjualan migrasi - %s', p_customer_name));
  -- ==================== LOG ====================
  RAISE NOTICE '[Migration Delivery] Journal created for delivery % (Value: %)',
    p_delivery_id, p_delivery_value;
  RETURN QUERY SELECT TRUE, v_journal_id, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


-- Function: process_payroll_complete
CREATE OR REPLACE FUNCTION public.process_payroll_complete(p_payroll_id uuid, p_branch_id uuid, p_payment_account_id uuid, p_payment_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(success boolean, journal_id uuid, advances_updated integer, commissions_paid integer, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_payroll RECORD;
  v_journal_id UUID;
  v_journal_lines JSONB := '[]'::JSONB;
  v_employee_name TEXT;
  v_gross_salary NUMERIC;
  v_net_salary NUMERIC;
  v_advance_deduction NUMERIC;
  v_salary_deduction NUMERIC;
  v_total_deductions NUMERIC;
  v_advances_updated INTEGER := 0;
  v_commissions_paid INTEGER := 0;
  v_remaining_deduction NUMERIC;
  v_advance RECORD;
  v_amount_to_deduct NUMERIC;
  v_beban_gaji_account UUID;
  v_panjar_account UUID;
  v_period_start DATE;
  v_period_end DATE;
BEGIN
  -- ==================== VALIDASI ====================
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0,
      'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;
  IF p_payroll_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0,
      'Payroll ID is required'::TEXT;
    RETURN;
  END IF;
  IF p_payment_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0,
      'Payment account ID is required'::TEXT;
    RETURN;
  END IF;
  -- ==================== GET PAYROLL DATA ====================
  SELECT
    pr.*,
    p.full_name as employee_name
  INTO v_payroll
  FROM payroll_records pr
  LEFT JOIN profiles p ON p.id = pr.employee_id
  WHERE pr.id = p_payroll_id AND pr.branch_id = p_branch_id;
  IF v_payroll.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0,
      'Payroll record not found in this branch'::TEXT;
    RETURN;
  END IF;
  IF v_payroll.status = 'paid' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0,
      'Payroll sudah dibayar'::TEXT;
    RETURN;
  END IF;
  -- ==================== PREPARE DATA ====================
  v_employee_name := COALESCE(v_payroll.employee_name, 'Karyawan');
  v_advance_deduction := COALESCE(v_payroll.advance_deduction, 0);
  v_salary_deduction := COALESCE(v_payroll.salary_deduction, 0);
  v_total_deductions := COALESCE(v_payroll.total_deductions, v_advance_deduction + v_salary_deduction);
  v_net_salary := v_payroll.net_salary;
  v_gross_salary := COALESCE(v_payroll.base_salary, 0) +
                    COALESCE(v_payroll.total_commission, 0) +
                    COALESCE(v_payroll.total_bonus, 0);
  v_period_start := v_payroll.period_start;
  v_period_end := v_payroll.period_end;
  -- ==================== GET ACCOUNT IDS ====================
  -- Beban Gaji (6110)
  SELECT id INTO v_beban_gaji_account
  FROM accounts
  WHERE branch_id = p_branch_id AND code = '6110' AND is_active = TRUE
  LIMIT 1;
  -- Panjar Karyawan (1260)
  SELECT id INTO v_panjar_account
  FROM accounts
  WHERE branch_id = p_branch_id AND code = '1260' AND is_active = TRUE
  LIMIT 1;
  IF v_beban_gaji_account IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0,
      'Akun Beban Gaji (6110) tidak ditemukan'::TEXT;
    RETURN;
  END IF;
  -- ==================== BUILD JOURNAL LINES ====================
  -- Debit: Beban Gaji (gross salary)
  v_journal_lines := v_journal_lines || jsonb_build_object(
    'account_id', v_beban_gaji_account,
    'debit_amount', v_gross_salary,
    'credit_amount', 0,
    'description', format('Beban gaji %s periode %s-%s',
      v_employee_name,
      EXTRACT(YEAR FROM v_period_start),
      EXTRACT(MONTH FROM v_period_start))
  );
  -- Credit: Kas (net salary)
  v_journal_lines := v_journal_lines || jsonb_build_object(
    'account_id', p_payment_account_id,
    'debit_amount', 0,
    'credit_amount', v_net_salary,
    'description', format('Pembayaran gaji %s', v_employee_name)
  );
  -- Credit: Panjar Karyawan (if any deductions)
  IF v_advance_deduction > 0 AND v_panjar_account IS NOT NULL THEN
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_id', v_panjar_account,
      'debit_amount', 0,
      'credit_amount', v_advance_deduction,
      'description', format('Potongan panjar %s', v_employee_name)
    );
  ELSIF v_advance_deduction > 0 AND v_panjar_account IS NULL THEN
    -- If no panjar account, add to kas credit instead
    v_journal_lines := jsonb_set(
      v_journal_lines,
      '{1,credit_amount}',
      to_jsonb(v_net_salary + v_advance_deduction)
    );
  END IF;
  -- Credit: Other deductions (salary deduction) - goes to company revenue or adjustment
  IF v_salary_deduction > 0 THEN
    -- Could credit to different account if needed, for now add to kas
    NULL; -- Already included in net salary calculation
  END IF;
  -- ==================== CREATE JOURNAL ====================
  SELECT cja.journal_id INTO v_journal_id FROM create_journal_atomic(
    p_branch_id,
    p_payment_date,
    format('Pembayaran Gaji %s - %s/%s',
      v_employee_name,
      EXTRACT(MONTH FROM v_period_start),
      EXTRACT(YEAR FROM v_period_start)),
    'payroll',
    p_payroll_id::TEXT,
    v_journal_lines,
    TRUE
  );
  -- ==================== UPDATE PAYROLL STATUS ====================
  UPDATE payroll_records
  SET
    status = 'paid',
    paid_date = p_payment_date,
    updated_at = NOW()
  WHERE id = p_payroll_id;
  -- ==================== UPDATE EMPLOYEE ADVANCES ====================
  IF v_advance_deduction > 0 AND v_payroll.employee_id IS NOT NULL THEN
    v_remaining_deduction := v_advance_deduction;
    FOR v_advance IN
      SELECT id, remaining_amount
      FROM employee_advances
      WHERE employee_id = v_payroll.employee_id
        AND remaining_amount > 0
      ORDER BY date ASC  -- FIFO: oldest first
    LOOP
      EXIT WHEN v_remaining_deduction <= 0;
      v_amount_to_deduct := LEAST(v_remaining_deduction, v_advance.remaining_amount);
      UPDATE employee_advances
      SET remaining_amount = remaining_amount - v_amount_to_deduct
      WHERE id = v_advance.id;
      v_remaining_deduction := v_remaining_deduction - v_amount_to_deduct;
      v_advances_updated := v_advances_updated + 1;
    END LOOP;
  END IF;
  -- ==================== UPDATE COMMISSION ENTRIES ====================
  IF v_payroll.employee_id IS NOT NULL THEN
    UPDATE commission_entries
    SET status = 'paid'
    WHERE user_id = v_payroll.employee_id
      AND status = 'pending'
      AND created_at >= v_period_start
      AND created_at <= v_period_end + INTERVAL '1 day';
    GET DIAGNOSTICS v_commissions_paid = ROW_COUNT;
  END IF;
  -- ==================== SUCCESS ====================
  RETURN QUERY SELECT TRUE, v_journal_id, v_advances_updated, v_commissions_paid, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0, 0, SQLERRM::TEXT;
END;
$function$
;


-- Function: process_production_atomic
CREATE OR REPLACE FUNCTION public.process_production_atomic(p_product_id uuid, p_quantity numeric, p_consume_bom boolean DEFAULT true, p_note text DEFAULT NULL::text, p_branch_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_user_name text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, production_id uuid, production_ref text, total_material_cost numeric, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
       -- Build Journal Lines for create_journal_atomic
       -- Dr. Persediaan Barang Dagang (1310)
       -- Cr. Persediaan Bahan Baku (1320)
       
       DECLARE
         v_journal_lines JSONB;
         v_journal_res RECORD;
       BEGIN
         v_journal_lines := jsonb_build_array(
           jsonb_build_object(
             'account_id', v_persediaan_barang_id,
             'debit_amount', v_total_material_cost,
             'credit_amount', 0,
             'description', format('Hasil produksi: %s x%s', v_product.name, p_quantity)
           ),
           jsonb_build_object(
             'account_id', v_persediaan_bahan_id,
             'credit_amount', v_total_material_cost,
             'debit_amount', 0,
             'description', format('Bahan terpakai: %s', RTRIM(v_material_details, ', '))
           )
         );

         SELECT * INTO v_journal_res FROM create_journal_atomic(
           p_branch_id,
           CURRENT_DATE,
           format('Produksi %s: %s x%s', v_ref, v_product.name, p_quantity),
           'production',
           v_production_id::TEXT,
           v_journal_lines,
           TRUE -- auto_post
         );

         IF v_journal_res.success THEN
            v_journal_id := v_journal_res.journal_id;
         ELSE
            -- Log error but don't fail transaction? Or fail? 
            -- Better to fail if journal fails.
            RAISE EXCEPTION 'Gagal membuat jurnal: %', v_journal_res.error_message;
         END IF;
       END;
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
$function$
;


-- Function: process_retasi_atomic
CREATE OR REPLACE FUNCTION public.process_retasi_atomic(p_retasi jsonb, p_items jsonb, p_branch_id uuid, p_driver_id uuid, p_driver_name text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, retasi_id uuid, journal_id uuid, items_returned integer, total_amount numeric, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_retasi_id UUID;
  v_journal_id UUID;
  v_transaction_id TEXT;
  v_delivery_id UUID;
  v_customer_name TEXT;
  v_return_date DATE;
  v_reason TEXT;
  v_total_amount NUMERIC := 0;
  v_items_returned INTEGER := 0;
  v_item JSONB;
  v_product_id UUID;
  v_product_name TEXT;
  v_quantity NUMERIC;
  v_price NUMERIC;
  v_item_total NUMERIC;
  v_kas_account_id UUID;
  v_pendapatan_account_id UUID;
  v_persediaan_account_id UUID;
  v_hpp_account_id UUID;
  v_entry_number TEXT;
BEGIN
  -- ==================== VALIDASI ====================
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, 0::NUMERIC, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;
  IF p_driver_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, 0::NUMERIC, 'Driver ID is required'::TEXT;
    RETURN;
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, 0::NUMERIC, 'Items are required'::TEXT;
    RETURN;
  END IF;
  -- ==================== PARSE DATA ====================
  v_retasi_id := COALESCE((p_retasi->>'id')::UUID, gen_random_uuid());
  v_transaction_id := p_retasi->>'transaction_id';
  v_delivery_id := (p_retasi->>'delivery_id')::UUID;
  v_customer_name := COALESCE(p_retasi->>'customer_name', 'Pelanggan');
  v_return_date := COALESCE((p_retasi->>'return_date')::DATE, CURRENT_DATE);
  v_reason := COALESCE(p_retasi->>'reason', 'Barang tidak terjual');
  -- Get driver name if not provided (localhost uses profiles, not employees)
  IF p_driver_name IS NULL THEN
    SELECT full_name INTO p_driver_name FROM profiles WHERE id = p_driver_id;
  END IF;
  -- ==================== GET ACCOUNT IDS ====================
  SELECT id INTO v_kas_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;
  SELECT id INTO v_pendapatan_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '4100' AND is_active = TRUE LIMIT 1;
  SELECT id INTO v_persediaan_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1310' AND is_active = TRUE LIMIT 1;
  SELECT id INTO v_hpp_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '5100' AND is_active = TRUE LIMIT 1;
  -- ==================== PROCESS ITEMS & RESTORE STOCK ====================
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_product_name := v_item->>'product_name';
    v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
    v_price := COALESCE((v_item->>'price')::NUMERIC, 0);
    IF v_product_id IS NOT NULL AND v_quantity > 0 THEN
      v_item_total := v_quantity * v_price;
      v_total_amount := v_total_amount + v_item_total;
      -- Restore stock to inventory batches
      -- Create new batch for returned items
      INSERT INTO inventory_batches (
        product_id,
        branch_id,
        initial_quantity,
        remaining_quantity,
        unit_cost,
        batch_date,
        reference_type,
        reference_id,
        notes,
        created_at
      ) VALUES (
        v_product_id,
        p_branch_id,
        v_quantity,
        v_quantity,
        COALESCE((v_item->>'cost_price')::NUMERIC, 0),
        v_return_date,
        'retasi',
        v_retasi_id::TEXT,
        'Retasi dari ' || p_driver_name || ': ' || v_reason,
        NOW()
      );
      v_items_returned := v_items_returned + 1;
    END IF;
  END LOOP;
  -- ==================== INSERT RETASI RECORD ====================
  INSERT INTO retasi (
    id,
    branch_id,
    transaction_id,
    delivery_id,
    driver_id,
    driver_name,
    customer_name,
    return_date,
    items,
    total_amount,
    reason,
    status,
    created_at,
    updated_at
  ) VALUES (
    v_retasi_id,
    p_branch_id,
    v_transaction_id,
    v_delivery_id,
    p_driver_id,
    p_driver_name,
    v_customer_name,
    v_return_date,
    p_items,
    v_total_amount,
    v_reason,
    'completed',
    NOW(),
    NOW()
  );
  -- ==================== CREATE REVERSAL JOURNAL ====================
  -- Jurnal balik untuk retasi:
  -- Dr. Persediaan (barang kembali)
  -- Dr. Pendapatan (batal pendapatan)
  --   Cr. HPP (batal HPP)
  --   Cr. Kas/Piutang (kembalikan uang/kurangi piutang)
  IF v_total_amount > 0 THEN
    SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
      (COALESCE(
        (SELECT COUNT(*) + 1 FROM journal_entries
         WHERE branch_id = p_branch_id
         AND DATE(created_at) = CURRENT_DATE),
        1
      ))::TEXT, 4, '0')
    INTO v_entry_number;
    INSERT INTO journal_entries (
      id,
      branch_id,
      entry_number,
      entry_date,
      description,
      reference_type,
      reference_id,
      status,
      is_voided,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      p_branch_id,
      v_entry_number,
      v_return_date,
      'Retasi - ' || p_driver_name || ' - ' || v_customer_name || ' - ' || v_reason,
      'retasi',
      v_retasi_id::TEXT,
      'posted',
      FALSE,
      NOW(),
      NOW()
    ) RETURNING id INTO v_journal_id;
    -- Dr. Persediaan (barang kembali ke stok)
    IF v_persediaan_account_id IS NOT NULL THEN
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, account_name,
        debit_amount, credit_amount, description, line_number
      ) VALUES (
        v_journal_id, v_persediaan_account_id,
        (SELECT name FROM accounts WHERE id = v_persediaan_account_id),
        v_total_amount * 0.7, 0, 'Barang retasi kembali ke persediaan', 1
      );
    END IF;
    -- Dr. Pendapatan (batal pendapatan) - reverse credit
    IF v_pendapatan_account_id IS NOT NULL THEN
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, account_name,
        debit_amount, credit_amount, description, line_number
      ) VALUES (
        v_journal_id, v_pendapatan_account_id,
        (SELECT name FROM accounts WHERE id = v_pendapatan_account_id),
        v_total_amount, 0, 'Pembatalan pendapatan retasi', 2
      );
    END IF;
    -- Cr. HPP (batal HPP) - reverse debit
    IF v_hpp_account_id IS NOT NULL THEN
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, account_name,
        debit_amount, credit_amount, description, line_number
      ) VALUES (
        v_journal_id, v_hpp_account_id,
        (SELECT name FROM accounts WHERE id = v_hpp_account_id),
        0, v_total_amount * 0.7, 'Pembatalan HPP retasi', 3
      );
    END IF;
    -- Cr. Kas (kembalikan uang / kurangi piutang)
    IF v_kas_account_id IS NOT NULL THEN
      INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, account_name,
        debit_amount, credit_amount, description, line_number
      ) VALUES (
        v_journal_id, v_kas_account_id,
        (SELECT name FROM accounts WHERE id = v_kas_account_id),
        0, v_total_amount, 'Pengembalian kas retasi', 4
      );
    END IF;
  END IF;
  -- ==================== UPDATE TRANSACTION IF EXISTS ====================
  IF v_transaction_id IS NOT NULL THEN
    -- Update transaction to reflect return
    UPDATE transactions
    SET
      notes = COALESCE(notes, '') || ' | Retasi: ' || v_reason,
      updated_at = NOW()
    WHERE id = v_transaction_id AND branch_id = p_branch_id;
  END IF;
  -- ==================== SUCCESS ====================
  RETURN QUERY SELECT TRUE, v_retasi_id, v_journal_id, v_items_returned, v_total_amount, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0, 0::NUMERIC, SQLERRM::TEXT;
END;
$function$
;


-- Function: process_spoilage_atomic
CREATE OR REPLACE FUNCTION public.process_spoilage_atomic(p_material_id uuid, p_quantity numeric, p_note text DEFAULT NULL::text, p_branch_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_user_name text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, record_id uuid, record_ref text, spoilage_cost numeric, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
       -- Use create_journal_atomic
       DECLARE
         v_journal_lines JSONB;
         v_journal_res RECORD;
       BEGIN
         v_journal_lines := jsonb_build_array(
           jsonb_build_object(
             'account_id', v_beban_lain_id,
             'debit_amount', v_spoilage_cost,
             'credit_amount', 0,
             'description', format('Bahan rusak: %s x%s', v_material.name, p_quantity)
           ),
           jsonb_build_object(
             'account_id', v_persediaan_bahan_id,
             'debit_amount', 0,
             'credit_amount', v_spoilage_cost,
             'description', format('Bahan keluar: %s x%s', v_material.name, p_quantity)
           )
         );

         SELECT * INTO v_journal_res FROM create_journal_atomic(
           p_branch_id,
           CURRENT_DATE,
           format('Bahan Rusak %s: %s x%s %s', v_ref, v_material.name, p_quantity, COALESCE(v_material.unit, 'pcs')),
           'adjustment',
           v_record_id::TEXT,
           v_journal_lines,
           TRUE
         );

         IF v_journal_res.success THEN
            v_journal_id := v_journal_res.journal_id;
         ELSE
            RAISE EXCEPTION 'Gagal membuat jurnal spoilage: %', v_journal_res.error_message;
         END IF;
       END;
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
$function$
;


-- Function: receive_payment_atomic
CREATE OR REPLACE FUNCTION public.receive_payment_atomic(p_receivable_id text, p_branch_id uuid, p_amount numeric, p_payment_method text DEFAULT 'cash'::text, p_payment_date date DEFAULT CURRENT_DATE, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, payment_id uuid, remaining_amount numeric, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_payment_id UUID;
  v_receivable RECORD;
  v_remaining NUMERIC;
  v_journal_id UUID;
  v_entry_number TEXT;
  v_kas_account_id TEXT;      -- accounts.id is TEXT
  v_piutang_account_id TEXT;  -- accounts.id is TEXT
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Branch ID is REQUIRED - tidak boleh lintas cabang!'::TEXT;
    RETURN;
  END IF;

  IF p_receivable_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Receivable ID is required'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get transaction info (acting as receivable)
  SELECT
    t.id,
    t.customer_id,
    t.total,
    COALESCE(t.paid_amount, 0) as paid_amount,
    COALESCE(t.total - COALESCE(t.paid_amount, 0), 0) as remaining_amount,
    t.payment_status as status,
    c.name as customer_name
  INTO v_receivable
  FROM transactions t
  LEFT JOIN customers c ON c.id = t.customer_id
  WHERE t.id = p_receivable_id::TEXT AND t.branch_id = p_branch_id; -- Cast UUID param to TEXT for transactions.id

  IF v_receivable.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Transaction not found in this branch'::TEXT;
    RETURN;
  END IF;

  IF v_receivable.status = 'paid' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID,
      'Transaction already fully paid'::TEXT;
    RETURN;
  END IF;

  -- Calculate new remaining
  v_remaining := GREATEST(0, v_receivable.remaining_amount - p_amount);

  -- ==================== CREATE PAYMENT RECORD ====================
  -- Using transaction_payments table
  
  INSERT INTO transaction_payments (
    transaction_id,
    branch_id,
    amount,
    payment_method,
    payment_date,
    notes,
    created_at
  ) VALUES (
    p_receivable_id::TEXT,
    p_branch_id,
    p_amount,
    p_payment_method,
    p_payment_date,
    COALESCE(p_notes, format('Payment from %s', COALESCE(v_receivable.customer_name, 'Customer'))),
    NOW()
  )
  RETURNING id INTO v_payment_id;

  -- ==================== UPDATE TRANSACTION ====================

  UPDATE transactions
  SET
    paid_amount = COALESCE(paid_amount, 0) + p_amount,
    payment_status = CASE WHEN v_remaining <= 0 THEN 'Lunas' ELSE 'Partial' END,
    updated_at = NOW()
  WHERE id = p_receivable_id::TEXT;

  -- ==================== CREATE JOURNAL ENTRY ====================

  -- Get account IDs based on payment method
  IF p_payment_method = 'transfer' THEN
    SELECT id INTO v_kas_account_id
    FROM accounts
    WHERE code = '1120' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;
  ELSE
    SELECT id INTO v_kas_account_id
    FROM accounts
    WHERE code = '1110' AND branch_id = p_branch_id AND is_active = TRUE
    LIMIT 1;
  END IF;

  SELECT id INTO v_piutang_account_id
  FROM accounts
  WHERE code = '1210' AND branch_id = p_branch_id AND is_active = TRUE
  LIMIT 1;

  IF v_kas_account_id IS NOT NULL AND v_piutang_account_id IS NOT NULL THEN
    DECLARE
      v_journal_lines JSONB;
      v_journal_res RECORD;
    BEGIN
       -- Dr. Kas/Bank
       -- Cr. Piutang Usaha
       v_journal_lines := jsonb_build_array(
         jsonb_build_object(
           'account_id', v_kas_account_id,
           'debit_amount', p_amount,
           'credit_amount', 0,
           'description', format('Terima dari %s', COALESCE(v_receivable.customer_name, 'Customer'))
         ),
         jsonb_build_object(
           'account_id', v_piutang_account_id,
           'debit_amount', 0,
           'credit_amount', p_amount,
           'description', format('Pelunasan piutang: %s', COALESCE(v_receivable.customer_name, 'Customer'))
         )
       );

       SELECT * INTO v_journal_res FROM create_journal_atomic(
         p_branch_id,
         p_payment_date,
         format('Terima pembayaran piutang: %s', COALESCE(v_receivable.customer_name, 'Customer')),
         'receivable_payment',
         v_payment_id::TEXT,
         v_journal_lines,
         TRUE
       );

       IF v_journal_res.success THEN
          v_journal_id := v_journal_res.journal_id;
       ELSE
          RAISE EXCEPTION 'Gagal membuat jurnal penerimaan: %', v_journal_res.error_message;
       END IF;
    END;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    v_payment_id,
    v_remaining,
    v_journal_id,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


-- Function: reconcile_account_balance
CREATE OR REPLACE FUNCTION public.reconcile_account_balance(p_account_id text, p_new_balance numeric, p_reason text, p_user_id uuid, p_user_name text)
 RETURNS TABLE(success boolean, message text, old_balance numeric, new_balance numeric, adjustment_amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_old_balance NUMERIC;
  v_adjustment NUMERIC;
  v_account_name TEXT;
BEGIN
  -- Check if user is owner
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = p_user_id AND role = 'owner'
  ) THEN
    RETURN QUERY SELECT 
      false as success,
      'Access denied. Only owners can reconcile account balances.' as message,
      0::NUMERIC as old_balance,
      0::NUMERIC as new_balance,
      0::NUMERIC as adjustment_amount;
    RETURN;
  END IF;
  -- Get current account info
  SELECT current_balance, name INTO v_old_balance, v_account_name
  FROM accounts 
  WHERE id = p_account_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      false as success,
      'Account not found.' as message,
      0::NUMERIC as old_balance,
      0::NUMERIC as new_balance,
      0::NUMERIC as adjustment_amount;
    RETURN;
  END IF;
  -- Calculate adjustment
  v_adjustment := p_new_balance - v_old_balance;
  -- Update account balance
  UPDATE accounts 
  SET 
    current_balance = p_new_balance,
    updated_at = NOW()
  WHERE id = p_account_id;
  -- Log the reconciliation in cash_history table
  INSERT INTO cash_history (
    account_id,
    transaction_type,
    amount,
    description,
    reference_number,
    created_by,
    created_by_name,
    source_type
  ) VALUES (
    p_account_id,
    CASE WHEN v_adjustment >= 0 THEN 'income'::TEXT ELSE 'expense'::TEXT END,
    ABS(v_adjustment),
    COALESCE(p_reason, 'Balance reconciliation by owner'),
    'RECON-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS'),
    p_user_id,
    p_user_name,
    'reconciliation'
  );
  RETURN QUERY SELECT 
    true as success,
    'Account balance successfully reconciled from ' || v_old_balance::TEXT || ' to ' || p_new_balance::TEXT as message,
    v_old_balance as old_balance,
    p_new_balance as new_balance,
    v_adjustment as adjustment_amount;
END;
$function$
;


-- Function: record_depreciation_atomic
CREATE OR REPLACE FUNCTION public.record_depreciation_atomic(p_asset_id uuid, p_amount numeric, p_period text, p_branch_id uuid)
 RETURNS TABLE(success boolean, journal_id uuid, new_current_value numeric, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_asset RECORD;
  v_journal_id UUID;
  v_journal_lines JSONB := '[]'::JSONB;
  v_beban_penyusutan_account UUID;
  v_akumulasi_account UUID;
  v_new_current_value NUMERIC;
  v_depreciation_date DATE;
BEGIN
  -- ==================== VALIDASI ====================
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC,
      'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;
  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC,
      'Depreciation amount must be greater than 0'::TEXT;
    RETURN;
  END IF;
  -- Get asset
  SELECT * INTO v_asset
  FROM assets
  WHERE id = p_asset_id AND branch_id = p_branch_id;
  IF v_asset.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC,
      'Asset not found'::TEXT;
    RETURN;
  END IF;
  -- ==================== FIND ACCOUNTS ====================
  -- Beban Penyusutan (6240)
  SELECT id INTO v_beban_penyusutan_account
  FROM accounts
  WHERE branch_id = p_branch_id
    AND code IN ('6240', '6250')
    AND is_active = TRUE
  LIMIT 1;
  -- Akumulasi Penyusutan - try to find by category
  SELECT id INTO v_akumulasi_account
  FROM accounts
  WHERE branch_id = p_branch_id
    AND (
      code IN ('1421', '1431', '1451', '1461', '1491')  -- Akumulasi accounts
      OR LOWER(name) LIKE '%akumulasi%'
    )
    AND is_active = TRUE
  ORDER BY code
  LIMIT 1;
  IF v_beban_penyusutan_account IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC,
      'Akun Beban Penyusutan tidak ditemukan'::TEXT;
    RETURN;
  END IF;
  IF v_akumulasi_account IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC,
      'Akun Akumulasi Penyusutan tidak ditemukan'::TEXT;
    RETURN;
  END IF;
  -- ==================== CALCULATE NEW VALUE ====================
  v_new_current_value := GREATEST(
    v_asset.salvage_value,
    COALESCE(v_asset.current_value, v_asset.purchase_price) - p_amount
  );
  -- Parse period to date
  BEGIN
    v_depreciation_date := (p_period || '-01')::DATE;
  EXCEPTION WHEN OTHERS THEN
    v_depreciation_date := CURRENT_DATE;
  END;
  -- ==================== CREATE JOURNAL ====================
  -- Debit: Beban Penyusutan
  v_journal_lines := v_journal_lines || jsonb_build_object(
    'account_id', v_beban_penyusutan_account,
    'debit_amount', p_amount,
    'credit_amount', 0,
    'description', format('Penyusutan %s periode %s', v_asset.name, p_period)
  );
  -- Credit: Akumulasi Penyusutan
  v_journal_lines := v_journal_lines || jsonb_build_object(
    'account_id', v_akumulasi_account,
    'debit_amount', 0,
    'credit_amount', p_amount,
    'description', format('Akumulasi penyusutan %s', v_asset.name)
  );
  SELECT cja.journal_id INTO v_journal_id FROM create_journal_atomic(
    p_branch_id,
    v_depreciation_date,
    format('Penyusutan - %s - %s', v_asset.name, p_period),
    'depreciation',
    p_asset_id::TEXT,
    v_journal_lines,
    TRUE
  );
  -- ==================== UPDATE ASSET CURRENT VALUE ====================
  UPDATE assets
  SET current_value = v_new_current_value, updated_at = NOW()
  WHERE id = p_asset_id;
  -- ==================== SUCCESS ====================
  RETURN QUERY SELECT TRUE, v_journal_id, v_new_current_value, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, SQLERRM::TEXT;
END;
$function$
;


-- Function: repay_employee_advance_atomic
CREATE OR REPLACE FUNCTION public.repay_employee_advance_atomic(p_advance_id uuid, p_branch_id uuid, p_amount numeric, p_payment_date date DEFAULT CURRENT_DATE, p_payment_method text DEFAULT 'cash'::text, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, payment_id uuid, journal_id uuid, remaining_amount numeric, is_fully_paid boolean, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_advance RECORD;
  v_payment_id UUID;
  v_journal_id UUID;
  v_kas_account_id TEXT;
  v_piutang_karyawan_id TEXT;
  v_entry_number TEXT;
  v_new_remaining NUMERIC;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, FALSE, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, FALSE, 'Amount must be positive'::TEXT;
    RETURN;
  END IF;

  -- Get advance record
  SELECT * INTO v_advance
  FROM employee_advances
  WHERE id = p_advance_id AND branch_id = p_branch_id
  FOR UPDATE;

  IF v_advance.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, FALSE, 'Kasbon tidak ditemukan'::TEXT;
    RETURN;
  END IF;

  IF v_advance.status = 'paid' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, FALSE, 'Kasbon sudah lunas'::TEXT;
    RETURN;
  END IF;

  IF p_amount > v_advance.remaining_amount THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, FALSE,
      format('Jumlah pembayaran (%s) melebihi sisa kasbon (%s)', p_amount, v_advance.remaining_amount)::TEXT;
    RETURN;
  END IF;

  -- ==================== GET ACCOUNT IDS ====================

  SELECT id INTO v_kas_account_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1110' AND is_active = TRUE LIMIT 1;

  SELECT id INTO v_piutang_karyawan_id FROM accounts
  WHERE branch_id = p_branch_id AND code = '1230' AND is_active = TRUE LIMIT 1;

  IF v_piutang_karyawan_id IS NULL THEN
    SELECT id INTO v_piutang_karyawan_id FROM accounts
    WHERE branch_id = p_branch_id AND name ILIKE '%piutang karyawan%' AND is_active = TRUE LIMIT 1;
  END IF;

  -- ==================== CALCULATE NEW REMAINING ====================

  v_new_remaining := v_advance.remaining_amount - p_amount;
  v_payment_id := gen_random_uuid();

  -- ==================== UPDATE ADVANCE RECORD ====================

  UPDATE employee_advances
  SET
    remaining_amount = v_new_remaining,
    status = CASE WHEN v_new_remaining <= 0 THEN 'paid' ELSE 'active' END,
    updated_at = NOW()
  WHERE id = p_advance_id;

  -- ==================== INSERT PAYMENT RECORD ====================

  INSERT INTO employee_advance_payments (
    id,
    advance_id,
    branch_id,
    amount,
    payment_date,
    payment_method,
    notes,
    created_by,
    created_at
  ) VALUES (
    v_payment_id,
    p_advance_id,
    p_branch_id,
    p_amount,
    p_payment_date,
    p_payment_method,
    p_notes,
    auth.uid(),
    NOW()
  );

  -- ==================== CREATE JOURNAL ENTRY ====================

  SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
    (COALESCE(
      (SELECT COUNT(*) + 1 FROM journal_entries
       WHERE branch_id = p_branch_id
       AND DATE(created_at) = CURRENT_DATE),
      1
    ))::TEXT, 4, '0')
  INTO v_entry_number;

  INSERT INTO journal_entries (
    id,
    branch_id,
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    status,
    is_voided,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    p_branch_id,
    v_entry_number,
    p_payment_date,
    'Pembayaran Kasbon - ' || v_advance.employee_name,
    'advance_payment',
    v_payment_id::TEXT,
    'posted',
    FALSE,
    NOW(),
    NOW()
  ) RETURNING id INTO v_journal_id;

  -- Dr. Kas
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_kas_account_id,
    (SELECT name FROM accounts WHERE id = v_kas_account_id),
    p_amount, 0, 'Penerimaan pembayaran kasbon', 1
  );

  -- Cr. Piutang Karyawan
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, account_name,
    debit_amount, credit_amount, description, line_number
  ) VALUES (
    v_journal_id, v_piutang_karyawan_id,
    (SELECT name FROM accounts WHERE id = v_piutang_karyawan_id),
    0, p_amount, 'Pelunasan piutang karyawan', 2
  );

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT TRUE, v_payment_id, v_journal_id, v_new_remaining, (v_new_remaining <= 0), NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, FALSE, SQLERRM::TEXT;
END;
$function$
;


-- Function: set_account_initial_balance
CREATE OR REPLACE FUNCTION public.set_account_initial_balance(p_account_id text, p_initial_balance numeric, p_reason text, p_user_id uuid, p_user_name text)
 RETURNS TABLE(success boolean, message text, old_initial_balance numeric, new_initial_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_old_initial NUMERIC;
  v_account_name TEXT;
BEGIN
  -- Check if user is owner
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = p_user_id AND role = 'owner'
  ) THEN
    RETURN QUERY SELECT 
      false as success,
      'Access denied. Only owners can set initial balances.' as message,
      0::NUMERIC as old_initial_balance,
      0::NUMERIC as new_initial_balance;
    RETURN;
  END IF;
  -- Get current initial balance
  SELECT initial_balance, name INTO v_old_initial, v_account_name
  FROM accounts 
  WHERE id = p_account_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      false as success,
      'Account not found.' as message,
      0::NUMERIC as old_initial_balance,
      0::NUMERIC as new_initial_balance;
    RETURN;
  END IF;
  -- Update initial balance
  UPDATE accounts 
  SET 
    initial_balance = p_initial_balance,
    updated_at = NOW()
  WHERE id = p_account_id;
  -- Log the change in cash_history
  INSERT INTO cash_history (
    account_id,
    transaction_type,
    amount,
    description,
    reference_number,
    created_by,
    created_by_name,
    source_type
  ) VALUES (
    p_account_id,
    'income',
    p_initial_balance,
    'Initial balance set: ' || COALESCE(p_reason, 'Initial balance setup'),
    'INIT-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS'),
    p_user_id,
    p_user_name,
    'initial_balance'
  );
  RETURN QUERY SELECT 
    true as success,
    'Initial balance set for ' || v_account_name || ' from ' || COALESCE(v_old_initial::TEXT, 'null') || ' to ' || p_initial_balance::TEXT as message,
    v_old_initial as old_initial_balance,
    p_initial_balance as new_initial_balance;
END;
$function$
;


-- Function: sync_account_balances
CREATE OR REPLACE FUNCTION public.sync_account_balances()
 RETURNS TABLE(account_id text, account_code character varying, account_name text, old_balance numeric, new_balance numeric, difference numeric)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    WITH updated AS (
        UPDATE accounts a
        SET balance = vab.calculated_balance,
            updated_at = NOW()
        FROM v_account_balances vab
        WHERE a.id = vab.account_id
          AND ABS(a.balance - vab.calculated_balance) > 0.01
        RETURNING
            a.id, a.code, a.name,
            vab.stored_balance as old_bal,
            vab.calculated_balance as new_bal
    )
    SELECT u.id, u.code, u.name, u.old_bal, u.new_bal, u.new_bal - u.old_bal as diff
    FROM updated u;
END;
$function$
;


-- Function: tf_update_balance_on_journal_change
CREATE OR REPLACE FUNCTION public.tf_update_balance_on_journal_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    r_line RECORD;
    v_delta NUMERIC;
BEGIN
    IF OLD.is_voided = NEW.is_voided THEN
        RETURN NULL;
    END IF;

    -- If BECOMING VOIDED (False -> True): Remove impact
    IF NEW.is_voided = TRUE THEN
        FOR r_line IN SELECT * FROM journal_entry_lines WHERE journal_entry_id = NEW.id LOOP
            v_delta := calculate_balance_delta(r_line.account_id, r_line.debit_amount, r_line.credit_amount);
            UPDATE accounts SET balance = COALESCE(balance, 0) - v_delta WHERE id = r_line.account_id;
        END LOOP;
    END IF;

    -- If BECOMING ACTIVE (True -> False): Add impact
    IF NEW.is_voided = FALSE THEN
        FOR r_line IN SELECT * FROM journal_entry_lines WHERE journal_entry_id = NEW.id LOOP
            v_delta := calculate_balance_delta(r_line.account_id, r_line.debit_amount, r_line.credit_amount);
            UPDATE accounts SET balance = COALESCE(balance, 0) + v_delta WHERE id = r_line.account_id;
        END LOOP;
    END IF;

    RETURN NULL;
END;
$function$
;


-- Function: tf_update_balance_on_line_change
CREATE OR REPLACE FUNCTION public.tf_update_balance_on_line_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_is_voided BOOLEAN;
    v_delta NUMERIC;
BEGIN
    -- Check parent journal status first
    IF TG_OP = 'DELETE' THEN
        SELECT is_voided INTO v_is_voided FROM journal_entries WHERE id = OLD.journal_entry_id;
    ELSE
        SELECT is_voided INTO v_is_voided FROM journal_entries WHERE id = NEW.journal_entry_id;
    END IF;

    -- If journal is voided, lines don't affect active balance.
    IF v_is_voided THEN
        RETURN NULL;
    END IF;

    IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
        -- Reverse OLD impact
        v_delta := calculate_balance_delta(OLD.account_id, OLD.debit_amount, OLD.credit_amount);
        UPDATE accounts SET balance = COALESCE(balance, 0) - v_delta WHERE id = OLD.account_id;
    END IF;

    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Apply NEW impact
        v_delta := calculate_balance_delta(NEW.account_id, NEW.debit_amount, NEW.credit_amount);
        UPDATE accounts SET balance = COALESCE(balance, 0) + v_delta WHERE id = NEW.account_id;
    END IF;

    RETURN NULL;
END;
$function$
;


-- Function: update_account
CREATE OR REPLACE FUNCTION public.update_account(p_account_id text, p_branch_id text, p_name text, p_code text, p_type text, p_initial_balance numeric, p_is_payment_account boolean, p_parent_id text, p_level integer, p_is_header boolean, p_is_active boolean, p_sort_order integer, p_employee_id text)
 RETURNS TABLE(success boolean, account_id text, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_code_exists BOOLEAN;
  v_current_code TEXT;
BEGIN
  -- Validasi Branch (untuk security check, pastikan akun milik branch yg benar)
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE id = p_account_id AND (branch_id = p_branch_id::UUID OR branch_id IS NULL)) THEN
     RETURN QUERY SELECT FALSE, NULL::TEXT, 'Account not found or access denied';
     RETURN;
  END IF;

  -- Get current code
  SELECT code INTO v_current_code FROM accounts WHERE id = p_account_id;

  -- Validasi Kode Unik (jika berubah)
  IF p_code IS NOT NULL AND p_code != '' AND (v_current_code IS NULL OR p_code != v_current_code) THEN
    SELECT EXISTS (
      SELECT 1 FROM accounts 
      WHERE code = p_code AND branch_id = p_branch_id::UUID AND id != p_account_id AND is_active = TRUE
    ) INTO v_code_exists;
    
    IF v_code_exists THEN
      RETURN QUERY SELECT FALSE, NULL::TEXT, 'Account code already exists in this branch';
      RETURN;
    END IF;
  END IF;

  UPDATE accounts
  SET
    name = COALESCE(p_name, name),
    code = NULLIF(p_code, ''),
    type = COALESCE(p_type, type),
    initial_balance = COALESCE(p_initial_balance, initial_balance),
    is_payment_account = COALESCE(p_is_payment_account, is_payment_account),
    parent_id = p_parent_id, -- No cast
    level = COALESCE(p_level, level),
    is_header = COALESCE(p_is_header, is_header),
    is_active = COALESCE(p_is_active, is_active),
    sort_order = COALESCE(p_sort_order, sort_order),
    employee_id = CASE WHEN p_employee_id = '' THEN NULL ELSE p_employee_id::UUID END,
    updated_at = NOW()
  WHERE id = p_account_id;

  RETURN QUERY SELECT TRUE, p_account_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::TEXT, SQLERRM;
END;
$function$
;


-- Function: update_account_balance_from_journal
CREATE OR REPLACE FUNCTION public.update_account_balance_from_journal()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    line_record RECORD;
    account_record RECORD;
    balance_change NUMERIC;
    is_debit_normal BOOLEAN;
BEGIN
    -- Hanya proses jika status berubah ke 'posted'
    IF NEW.status = 'posted' AND (OLD.status IS NULL OR OLD.status != 'posted') THEN
        FOR line_record IN
            SELECT * FROM public.journal_entry_lines
            WHERE journal_entry_id = NEW.id
        LOOP
            SELECT * INTO account_record
            FROM public.accounts
            WHERE id = line_record.account_id;
            -- Determine if account has debit normal balance based on type
            is_debit_normal := account_record.type IN ('Aset', 'Beban');
            IF is_debit_normal THEN
                balance_change := line_record.debit_amount - line_record.credit_amount;
            ELSE
                balance_change := line_record.credit_amount - line_record.debit_amount;
            END IF;
            UPDATE public.accounts
            SET balance = COALESCE(balance, 0) + balance_change,
                updated_at = NOW()
            WHERE id = line_record.account_id;
        END LOOP;
    END IF;
    -- Handle voiding: reverse all balance changes
    IF NEW.is_voided = TRUE AND (OLD.is_voided IS NULL OR OLD.is_voided = FALSE) THEN
        FOR line_record IN
            SELECT * FROM public.journal_entry_lines
            WHERE journal_entry_id = NEW.id
        LOOP
            SELECT * INTO account_record
            FROM public.accounts
            WHERE id = line_record.account_id;
            is_debit_normal := account_record.type IN ('Aset', 'Beban');
            IF is_debit_normal THEN
                balance_change := line_record.credit_amount - line_record.debit_amount;
            ELSE
                balance_change := line_record.debit_amount - line_record.credit_amount;
            END IF;
            UPDATE public.accounts
            SET balance = COALESCE(balance, 0) + balance_change,
                updated_at = NOW()
            WHERE id = line_record.account_id;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$function$
;


-- Function: update_account_initial_balance_atomic
CREATE OR REPLACE FUNCTION public.update_account_initial_balance_atomic(p_account_id text, p_new_initial_balance numeric, p_branch_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_user_name text DEFAULT 'System'::text)
 RETURNS TABLE(success boolean, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_account RECORD;
  v_old_journal_id UUID;
  v_new_journal_id UUID;
  v_entry_number TEXT;
  v_current_journal_amount NUMERIC;
  v_equity_account_id TEXT;
  v_description TEXT;
BEGIN
  -- 1. Validate inputs
  IF p_account_id IS NULL OR p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Account ID and Branch ID are required'::TEXT;
    RETURN;
  END IF;

  -- 2. Get account info
  SELECT id, code, name, type INTO v_account
  FROM accounts
  WHERE id = p_account_id AND branch_id = p_branch_id;

  IF v_account.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Account not found'::TEXT;
    RETURN;
  END IF;

  -- 3. Cek jurnal saldo awal existing
  SELECT je.id, je.total_debit INTO v_old_journal_id, v_current_journal_amount
  FROM journal_entries je
  WHERE je.reference_id = p_account_id
    AND je.reference_type = 'opening_balance'
    AND je.branch_id = p_branch_id
    AND je.is_voided = FALSE
  ORDER BY je.created_at DESC
  LIMIT 1;

  v_current_journal_amount := COALESCE(v_current_journal_amount, 0);

  -- No change needed if journal amount equals new balance
  IF v_old_journal_id IS NOT NULL AND v_current_journal_amount = ABS(p_new_initial_balance) THEN
    RETURN QUERY SELECT TRUE, v_old_journal_id, NULL::TEXT;
    RETURN;
  END IF;

  -- 4. VOID existing opening balance journal (audit trail)
  IF v_old_journal_id IS NOT NULL THEN
    UPDATE journal_entries
    SET is_voided = TRUE,
        voided_at = NOW(),
        voided_by = p_user_id,
        updated_at = NOW()
    WHERE id = v_old_journal_id;
  END IF;

  -- 5. Handle saldo awal = 0: just void, don't create new journal
  IF p_new_initial_balance = 0 THEN
    RETURN QUERY SELECT TRUE, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;


  -- 6. Find equity/modal account for balancing (3xxx)
  -- Priority 1: 'Modal Disetor'
  SELECT id INTO v_equity_account_id
  FROM accounts
  WHERE code LIKE '3%' 
    AND branch_id = p_branch_id 
    AND is_active = TRUE
    AND name ILIKE '%Modal Disetor%'
  LIMIT 1;

  -- Priority 2: Code '3110' (Common standard)
  IF v_equity_account_id IS NULL THEN
    SELECT id INTO v_equity_account_id
    FROM accounts
    WHERE code = '3110'
      AND branch_id = p_branch_id 
      AND is_active = TRUE
    LIMIT 1;
  END IF;

  -- Priority 3: Any Equity account
  IF v_equity_account_id IS NULL THEN
    SELECT id INTO v_equity_account_id
    FROM accounts
    WHERE code LIKE '3%' 
      AND branch_id = p_branch_id 
      AND is_active = TRUE
    ORDER BY code ASC
    LIMIT 1;
  END IF;

  IF v_equity_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Akun Modal (3xxx) tidak ditemukan untuk pasangan jurnal'::TEXT;
    RETURN;
  END IF;

  -- Prevent self-reference for equity accounts
  IF p_account_id = v_equity_account_id THEN
    SELECT id INTO v_equity_account_id
    FROM accounts
    WHERE code LIKE '3%'
      AND branch_id = p_branch_id
      AND is_active = TRUE
      AND id != p_account_id
    ORDER BY code ASC
    LIMIT 1;

    IF v_equity_account_id IS NULL THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, 'Tidak ada akun Modal lain untuk pasangan jurnal saldo awal Modal'::TEXT;
      RETURN;
    END IF;
  END IF;

  v_description := format('Saldo Awal: %s - %s', v_account.code, v_account.name);

  -- 7. Create NEW journal (always new, for audit trail)
  v_entry_number := 'OB-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');

  INSERT INTO journal_entries (
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    branch_id,
    status,
    total_debit,
    total_credit,
    created_by
  ) VALUES (
    v_entry_number,
    DATE_TRUNC('year', NOW())::DATE,
    v_description,
    'opening_balance',
    p_account_id,
    p_branch_id,
    'draft',
    ABS(p_new_initial_balance),
    ABS(p_new_initial_balance),
    p_user_id
  ) RETURNING id INTO v_new_journal_id;

  -- 8. Create journal lines based on account type
  IF v_account.type IN ('Aset', 'Beban') THEN
    INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
    VALUES
      (v_new_journal_id, 1, p_account_id, v_description, ABS(p_new_initial_balance), 0),
      (v_new_journal_id, 2, v_equity_account_id, v_description, 0, ABS(p_new_initial_balance));
  ELSE
    INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
    VALUES
      (v_new_journal_id, 1, p_account_id, v_description, 0, ABS(p_new_initial_balance)),
      (v_new_journal_id, 2, v_equity_account_id, v_description, ABS(p_new_initial_balance), 0);
  END IF;

  -- 9. Post the journal
  UPDATE journal_entries SET status = 'posted' WHERE id = v_new_journal_id;

  -- 10. UPDATE accounts column (CACHE for Tree/List View)
  UPDATE accounts 
  SET initial_balance = p_new_initial_balance,
      updated_at = NOW()
  WHERE id = p_account_id;

  RETURN QUERY SELECT TRUE, v_new_journal_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


-- Function: update_payroll_record_atomic
CREATE OR REPLACE FUNCTION public.update_payroll_record_atomic(p_payroll_id uuid, p_branch_id uuid, p_base_salary numeric, p_commission numeric, p_bonus numeric, p_advance_deduction numeric, p_salary_deduction numeric, p_notes text)
 RETURNS TABLE(success boolean, net_salary numeric, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_old_record RECORD;
  v_new_net_salary NUMERIC;
  v_new_gross_salary NUMERIC;
  v_new_total_deductions NUMERIC;
  v_journal_id UUID;
  v_beban_gaji_account UUID;
  v_panjar_account UUID;
  v_payment_account_id UUID;
  v_journal_lines JSONB := '[]'::JSONB;
BEGIN
  -- 1. Get Old Record
  SELECT * INTO v_old_record FROM payroll_records 
  WHERE id = p_payroll_id AND branch_id = p_branch_id;
  
  IF v_old_record.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, NULL::UUID, 'Data gaji tidak ditemukan'::TEXT;
    RETURN;
  END IF;
  -- 2. Calculate New Amounts
  v_new_gross_salary := COALESCE(p_base_salary, v_old_record.base_salary) + 
                        COALESCE(p_commission, v_old_record.total_commission) + 
                        COALESCE(p_bonus, v_old_record.total_bonus);
  
  v_new_total_deductions := COALESCE(p_advance_deduction, v_old_record.advance_deduction) + 
                           COALESCE(p_salary_deduction, v_old_record.salary_deduction);
  
  v_new_net_salary := v_new_gross_salary - v_new_total_deductions;
  -- 3. Update Record
  UPDATE payroll_records
  SET
    base_salary = COALESCE(p_base_salary, base_salary),
    total_commission = COALESCE(p_commission, total_commission),
    total_bonus = COALESCE(p_bonus, total_bonus),
    advance_deduction = COALESCE(p_advance_deduction, advance_deduction),
    salary_deduction = COALESCE(p_salary_deduction, salary_deduction),
    total_deductions = v_new_total_deductions,
    net_salary = v_new_net_salary,
    notes = COALESCE(p_notes, notes),
    updated_at = NOW()
  WHERE id = p_payroll_id;
  -- 4. Handle Journal Update if Status is 'paid'
  IF v_old_record.status = 'paid' THEN
    -- Find existing journal
    SELECT id INTO v_journal_id FROM journal_entries 
    WHERE reference_id = p_payroll_id::TEXT AND reference_type = 'payroll' AND branch_id = p_branch_id
    ORDER BY created_at DESC LIMIT 1;
    IF v_journal_id IS NOT NULL THEN
      -- Get Accounts
      SELECT id INTO v_beban_gaji_account FROM accounts WHERE branch_id = p_branch_id AND code = '6110' LIMIT 1;
      SELECT id INTO v_panjar_account FROM accounts WHERE branch_id = p_branch_id AND code = '1260' LIMIT 1;
      v_payment_account_id := v_old_record.payment_account_id;
      -- Debit: Beban Gaji (gross)
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_id', v_beban_gaji_account,
        'debit_amount', v_new_gross_salary,
        'credit_amount', 0,
        'description', 'Beban gaji (updated)'
      );
      -- Credit: Kas (net)
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_id', v_payment_account_id,
        'debit_amount', 0,
        'credit_amount', v_new_net_salary,
        'description', 'Pembayaran gaji (updated)'
      );
      -- Credit: Panjar (deductions)
      IF COALESCE(p_advance_deduction, v_old_record.advance_deduction) > 0 AND v_panjar_account IS NOT NULL THEN
        v_journal_lines := v_journal_lines || jsonb_build_object(
          'account_id', v_panjar_account,
          'debit_amount', 0,
          'credit_amount', COALESCE(p_advance_deduction, v_old_record.advance_deduction),
          'description', 'Potongan panjar (updated)'
        );
      END IF;
      -- Delete old lines and insert new ones
      DELETE FROM journal_entry_lines WHERE journal_entry_id = v_journal_id;
      
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
      SELECT v_journal_id, row_number() OVER (), (line->>'account_id')::UUID, line->>'description', (line->>'debit_amount')::NUMERIC, (line->>'credit_amount')::NUMERIC
      FROM jsonb_array_elements(v_journal_lines) AS line;
      -- Update header totals
      UPDATE journal_entries 
      SET total_debit = v_new_gross_salary, 
          total_credit = v_new_gross_salary,
          updated_at = NOW()
      WHERE id = v_journal_id;
    END IF;
  END IF;
  RETURN QUERY SELECT TRUE, v_new_net_salary, v_journal_id, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0::NUMERIC, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


-- Function: upsert_zakat_record_atomic
CREATE OR REPLACE FUNCTION public.upsert_zakat_record_atomic(p_branch_id uuid, p_zakat_id text, p_data jsonb)
 RETURNS TABLE(success boolean, zakat_id text, journal_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_zakat_id TEXT := p_zakat_id;
  v_journal_id UUID;
  v_beban_acc_id UUID;
  v_payment_acc_id UUID;
  v_amount NUMERIC;
  v_date DATE;
  v_journal_lines JSONB;
  v_category TEXT;
  v_title TEXT;
BEGIN
  -- ==================== VALIDASI & EKSTRAKSI ====================
  
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, 'Branch ID is REQUIRED'::TEXT;
    RETURN;
  END IF;
  v_amount := (p_data->>'amount')::NUMERIC;
  v_date := (p_data->>'payment_date')::DATE;
  v_payment_acc_id := (p_data->>'payment_account_id')::UUID;
  v_category := p_data->>'category';
  v_title := p_data->>'title';
  IF v_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, 'Amount must be positive'::TEXT;
    RETURN;
  END IF;
  -- Cari atau buat akun Beban Zakat/Sosial (6260-ish)
  -- Jika tidak ada, fallback ke Beban Umum (6200)
  SELECT id INTO v_beban_acc_id
  FROM accounts
  WHERE branch_id = p_branch_id
    AND (name ILIKE '%Beban Zakat%' OR name ILIKE '%Beban Sosial%' OR name ILIKE '%Beban Sumbangan%')
    AND is_header = FALSE
  LIMIT 1;
  IF v_beban_acc_id IS NULL THEN
    -- Fallback ke Beban Umum & Administrasi
    SELECT id INTO v_beban_acc_id
    FROM accounts
    WHERE branch_id = p_branch_id
      AND (code = '6200' OR name ILIKE '%Beban Umum%')
      AND is_header = FALSE
    LIMIT 1;
  END IF;
  IF v_beban_acc_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, 'Akun Beban (6200) tidak ditemukan'::TEXT;
    RETURN;
  END IF;
  -- ==================== UPSERT ZAKAT RECORD ====================
  
  IF v_zakat_id IS NULL THEN
    v_zakat_id := 'ZAKAT-' || TO_CHAR(v_date, 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');
  END IF;
  INSERT INTO zakat_records (
    id,
    type,
    category,
    title,
    description,
    recipient,
    recipient_type,
    amount,
    nishab_amount,
    percentage_rate,
    payment_date,
    payment_account_id,
    payment_method,
    status,
    receipt_number,
    calculation_basis,
    calculation_notes,
    is_anonymous,
    notes,
    attachment_url,
    hijri_year,
    hijri_month,
    created_by,
    branch_id,
    created_at,
    updated_at
  ) VALUES (
    v_zakat_id,
    p_data->>'type',
    v_category,
    v_title,
    p_data->>'description',
    p_data->>'recipient',
    p_data->>'recipient_type',
    v_amount,
    (p_data->>'nishab_amount')::NUMERIC,
    (p_data->>'percentage_rate')::NUMERIC,
    v_date,
    v_payment_acc_id,
    p_data->>'payment_method',
    'paid',
    p_data->>'receipt_number',
    p_data->>'calculation_basis',
    p_data->>'calculation_notes',
    (p_data->>'is_anonymous')::BOOLEAN,
    p_data->>'notes',
    p_data->>'attachment_url',
    (p_data->>'hijri_year')::INTEGER,
    p_data->>'hijri_month',
    auth.uid(),
    p_branch_id,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    type = EXCLUDED.type,
    category = EXCLUDED.category,
    title = EXCLUDED.title,
    amount = EXCLUDED.amount,
    payment_date = EXCLUDED.payment_date,
    payment_account_id = EXCLUDED.payment_account_id,
    updated_at = NOW();
  -- ==================== CREATE JOURNAL ====================
  
  -- Void existing journal if updating
  UPDATE journal_entries 
  SET is_voided = TRUE, status = 'voided', voided_reason = 'Updated zakat record'
  WHERE reference_id = v_zakat_id AND reference_type = 'zakat' AND is_voided = FALSE;
  -- Dr. Beban Zakat/Umum
  --   Cr. Kas/Bank
  v_journal_lines := jsonb_build_array(
    jsonb_build_object(
      'account_id', v_beban_acc_id,
      'debit_amount', v_amount,
      'credit_amount', 0,
      'description', format('%s: %s', INITCAP(v_category), v_title)
    ),
    jsonb_build_object(
      'account_id', v_payment_acc_id,
      'debit_amount', 0,
      'credit_amount', v_amount,
      'description', format('Pembayaran %s (%s)', v_category, v_zakat_id)
    )
  );
  SELECT journal_id INTO v_journal_id
  FROM create_journal_atomic(
    p_branch_id,
    v_date,
    format('Pembayaran %s - %s', INITCAP(v_category), v_title),
    'zakat',
    v_zakat_id,
    v_journal_lines,
    TRUE -- auto post
  );
  -- Link journal to zakat record
  UPDATE zakat_records SET journal_entry_id = v_journal_id WHERE id = v_zakat_id;
  RETURN QUERY SELECT TRUE, v_zakat_id, v_journal_id, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, SQLERRM::TEXT;
END;
$function$
;


