-- =====================================================
-- RPC Functions for table: assets
-- Generated: 2026-01-08T22:26:17.671Z
-- Total functions: 3
-- =====================================================

-- Function: calculate_asset_current_value
CREATE OR REPLACE FUNCTION public.calculate_asset_current_value(p_asset_id text)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_purchase_price NUMERIC;
    v_purchase_date DATE;
    v_useful_life_years INTEGER;
    v_salvage_value NUMERIC;
    v_depreciation_method TEXT;
    v_years_elapsed NUMERIC;
    v_current_value NUMERIC;
BEGIN
    -- Get asset details
    SELECT
        purchase_price,
        purchase_date,
        useful_life_years,
        salvage_value,
        depreciation_method
    INTO
        v_purchase_price,
        v_purchase_date,
        v_useful_life_years,
        v_salvage_value,
        v_depreciation_method
    FROM assets
    WHERE id = p_asset_id;
    -- Calculate years elapsed
    v_years_elapsed := EXTRACT(YEAR FROM AGE(CURRENT_DATE, v_purchase_date)) +
                      (EXTRACT(MONTH FROM AGE(CURRENT_DATE, v_purchase_date)) / 12.0);
    -- Calculate depreciation based on method
    IF v_depreciation_method = 'straight_line' THEN
        -- Straight-line depreciation
        v_current_value := v_purchase_price -
                          ((v_purchase_price - v_salvage_value) / v_useful_life_years * v_years_elapsed);
    ELSE
        -- Declining balance (double declining)
        v_current_value := v_purchase_price * POWER(1 - (2.0 / v_useful_life_years), v_years_elapsed);
    END IF;
    -- Ensure value doesn't go below salvage value
    IF v_current_value < v_salvage_value THEN
        v_current_value := v_salvage_value;
    END IF;
    RETURN GREATEST(v_current_value, 0);
END;
$function$
;


-- Function: delete_asset_atomic
CREATE OR REPLACE FUNCTION public.delete_asset_atomic(p_asset_id uuid, p_branch_id uuid)
 RETURNS TABLE(success boolean, journals_voided integer, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_journals_voided INTEGER := 0;
BEGIN
  -- ==================== VALIDASI ====================
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;
  -- Check asset exists
  IF NOT EXISTS (
    SELECT 1 FROM assets WHERE id = p_asset_id AND branch_id = p_branch_id
  ) THEN
    RETURN QUERY SELECT FALSE, 0, 'Asset not found'::TEXT;
    RETURN;
  END IF;
  -- ==================== VOID JOURNALS ====================
  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = 'Asset deleted',
    updated_at = NOW()
  WHERE reference_id = p_asset_id::TEXT
    AND branch_id = p_branch_id
    AND is_voided = FALSE;
  GET DIAGNOSTICS v_journals_voided = ROW_COUNT;
  -- ==================== DELETE ASSET ====================
  DELETE FROM assets WHERE id = p_asset_id AND branch_id = p_branch_id;
  RETURN QUERY SELECT TRUE, v_journals_voided, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, SQLERRM::TEXT;
END;
$function$
;


-- Function: update_asset_atomic
CREATE OR REPLACE FUNCTION public.update_asset_atomic(p_asset_id uuid, p_asset jsonb, p_branch_id uuid)
 RETURNS TABLE(success boolean, journal_updated boolean, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_old_asset RECORD;
  v_new_price NUMERIC;
  v_price_changed BOOLEAN;
  v_journal_id UUID;
  v_asset_account_id UUID;
  v_cash_account_id UUID;
BEGIN
  -- ==================== VALIDASI ====================
  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, FALSE,
      'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;
  -- Get existing asset
  SELECT * INTO v_old_asset
  FROM assets
  WHERE id = p_asset_id AND branch_id = p_branch_id;
  IF v_old_asset.id IS NULL THEN
    RETURN QUERY SELECT FALSE, FALSE,
      'Asset not found in this branch'::TEXT;
    RETURN;
  END IF;
  -- ==================== CHECK PRICE CHANGE ====================
  v_new_price := (p_asset->>'purchase_price')::NUMERIC;
  v_price_changed := v_new_price IS NOT NULL AND v_new_price != v_old_asset.purchase_price;
  -- ==================== UPDATE ASSET ====================
  UPDATE assets SET
    name = COALESCE(p_asset->>'name', p_asset->>'asset_name', name),
    code = COALESCE(p_asset->>'code', p_asset->>'asset_code', code),
    asset_code = COALESCE(p_asset->>'code', p_asset->>'asset_code', asset_code),
    category = COALESCE(p_asset->>'category', category),
    purchase_date = COALESCE((p_asset->>'purchase_date')::DATE, purchase_date),
    purchase_price = COALESCE(v_new_price, purchase_price),
    useful_life_years = COALESCE((p_asset->>'useful_life_years')::INTEGER, useful_life_years),
    salvage_value = COALESCE((p_asset->>'salvage_value')::NUMERIC, salvage_value),
    depreciation_method = COALESCE(p_asset->>'depreciation_method', depreciation_method),
    location = COALESCE(p_asset->>'location', location),
    brand = COALESCE(p_asset->>'brand', brand),
    model = COALESCE(p_asset->>'model', model),
    serial_number = COALESCE(p_asset->>'serial_number', serial_number),
    supplier_name = COALESCE(p_asset->>'supplier_name', supplier_name),
    notes = COALESCE(p_asset->>'notes', notes),
    status = COALESCE(p_asset->>'status', status),
    condition = COALESCE(p_asset->>'condition', condition),
    updated_at = NOW()
  WHERE id = p_asset_id;
  -- ==================== UPDATE JOURNAL IF PRICE CHANGED ====================
  IF v_price_changed THEN
    -- Find existing journal
    SELECT id INTO v_journal_id
    FROM journal_entries
    WHERE reference_id = p_asset_id::TEXT
      AND reference_type = 'asset'
      AND branch_id = p_branch_id
      AND is_voided = FALSE
    ORDER BY created_at DESC
    LIMIT 1;
    IF v_journal_id IS NOT NULL THEN
      v_asset_account_id := COALESCE((p_asset->>'account_id')::UUID, v_old_asset.account_id);
      -- Get cash account
      SELECT id INTO v_cash_account_id
      FROM accounts
      WHERE branch_id = p_branch_id
        AND is_payment_account = TRUE
        AND code LIKE '11%'
      ORDER BY code
      LIMIT 1;
      IF v_asset_account_id IS NOT NULL AND v_cash_account_id IS NOT NULL THEN
        -- Delete old lines
        DELETE FROM journal_entry_lines WHERE journal_entry_id = v_journal_id;
        -- Insert new lines
        INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, debit_amount, credit_amount, description)
        VALUES
          (v_journal_id, 1, v_asset_account_id, v_new_price, 0, format('Pembelian %s (edit)', v_old_asset.name)),
          (v_journal_id, 2, v_cash_account_id, 0, v_new_price, 'Pembayaran aset (edit)');
        -- Update journal totals
        UPDATE journal_entries SET
          total_debit = v_new_price,
          total_credit = v_new_price,
          updated_at = NOW()
        WHERE id = v_journal_id;
        RETURN QUERY SELECT TRUE, TRUE, NULL::TEXT;
      END IF;
    END IF;
  END IF;
  RETURN QUERY SELECT TRUE, FALSE, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, FALSE, SQLERRM::TEXT;
END;
$function$
;


