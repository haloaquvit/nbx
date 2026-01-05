-- ============================================================================
-- RPC 09: Transaction Atomic
-- Purpose: Proses transaksi penjualan atomic dengan:
-- - Insert Transaction Header & Items
-- - Consume product inventory FIFO (untuk Laku Kantor)
-- - Calculate HPP dari FIFO batches
-- - Create sales journal entry (Kas/Piutang, Pendapatan, HPP, Persediaan)
-- - Generate sales commission
-- PENTING: Semua operasi WAJIB filter by branch_id
-- ============================================================================

-- Drop existing functions
DROP FUNCTION IF EXISTS create_transaction_atomic(JSONB, JSONB, UUID, UUID, TEXT, TEXT);

-- ============================================================================
-- 1. CREATE TRANSACTION ATOMIC
-- Membuat transaksi penjualan dengan semua operasi dalam satu transaksi
-- ============================================================================

CREATE OR REPLACE FUNCTION create_transaction_atomic(
  p_transaction JSONB,        -- Transaction data
  p_items JSONB,              -- Array items: [{product_id, product_name, quantity, price, discount, is_bonus, cost_price, width, height, unit}]
  p_branch_id UUID,           -- WAJIB
  p_cashier_id UUID DEFAULT NULL,
  p_cashier_name TEXT DEFAULT NULL,
  p_quotation_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  transaction_id TEXT,
  total_hpp NUMERIC,
  total_hpp_bonus NUMERIC,
  journal_id UUID,
  items_count INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_transaction_id TEXT;
  v_customer_id UUID;
  v_customer_name TEXT;
  v_total NUMERIC;
  v_paid_amount NUMERIC;
  v_payment_method TEXT;
  v_is_office_sale BOOLEAN;
  v_date TIMESTAMPTZ;
  v_notes TEXT;
  v_sales_id UUID;
  v_sales_name TEXT;

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

  -- ==================== PROCESS ITEMS & CALCULATE HPP ====================

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_product_name := v_item->>'product_name';
    v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
    v_price := COALESCE((v_item->>'price')::NUMERIC, 0);
    v_discount := COALESCE((v_item->>'discount')::NUMERIC, 0);
    v_is_bonus := COALESCE((v_item->>'is_bonus')::BOOLEAN, FALSE);
    v_cost_price := COALESCE((v_item->>'cost_price')::NUMERIC, 0);
    v_unit := v_item->>'unit';
    v_width := (v_item->>'width')::NUMERIC;
    v_height := (v_item->>'height')::NUMERIC;

    IF v_product_id IS NOT NULL AND v_quantity > 0 THEN
      -- Calculate HPP using FIFO
      IF v_is_office_sale THEN
        -- Office Sale: Consume inventory immediately
        SELECT * INTO v_fifo_result FROM consume_inventory_fifo(
          v_product_id,
          p_branch_id,
          v_quantity,
          v_transaction_id
        );

        IF v_fifo_result.success THEN
          v_item_hpp := v_fifo_result.total_hpp;
        ELSE
          -- Fallback to cost_price
          v_item_hpp := v_cost_price * v_quantity;
        END IF;
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
        'productId', v_product_id,
        'productName', v_product_name,
        'quantity', v_quantity,
        'price', v_price,
        'discount', v_discount,
        'isBonus', v_is_bonus,
        'costPrice', v_cost_price,
        'hppAmount', v_item_hpp,
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
    status,
    delivery_status,
    is_office_sale,
    notes,
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
    'Pesanan Masuk',
    CASE WHEN v_is_office_sale THEN 'Completed' ELSE 'Pending' END,
    v_is_office_sale,
    v_notes,
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
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. UPDATE TRANSACTION ATOMIC
-- Update transaksi dengan recalculate journal
-- ============================================================================

CREATE OR REPLACE FUNCTION update_transaction_atomic(
  p_transaction_id TEXT,
  p_transaction JSONB,        -- Updated transaction data
  p_branch_id UUID,           -- WAJIB
  p_user_id UUID DEFAULT NULL,
  p_user_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  transaction_id TEXT,
  journal_id UUID,
  changes_made TEXT[],
  error_message TEXT
) AS $$
DECLARE
  v_old_transaction RECORD;
  v_new_total NUMERIC;
  v_new_paid_amount NUMERIC;
  v_changes TEXT[] := '{}';
  v_journal_id UUID;
  v_journal_lines JSONB := '[]'::JSONB;
  v_customer_name TEXT;
  v_date DATE;
  v_total_hpp NUMERIC := 0;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, '{}'::TEXT[],
      'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  IF p_transaction_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, '{}'::TEXT[],
      'Transaction ID is required'::TEXT;
    RETURN;
  END IF;

  -- Get existing transaction
  SELECT * INTO v_old_transaction
  FROM transactions
  WHERE id = p_transaction_id AND branch_id = p_branch_id;

  IF v_old_transaction.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, '{}'::TEXT[],
      'Transaction not found in this branch'::TEXT;
    RETURN;
  END IF;

  -- ==================== PARSE NEW DATA ====================

  v_new_total := COALESCE((p_transaction->>'total')::NUMERIC, v_old_transaction.total);
  v_new_paid_amount := COALESCE((p_transaction->>'paid_amount')::NUMERIC, v_old_transaction.paid_amount);
  v_customer_name := COALESCE(p_transaction->>'customer_name', v_old_transaction.customer_name);
  v_date := COALESCE(v_old_transaction.order_date, CURRENT_DATE);

  -- Detect changes
  IF v_new_total != v_old_transaction.total THEN
    v_changes := array_append(v_changes, 'total');
  END IF;
  IF v_new_paid_amount != v_old_transaction.paid_amount THEN
    v_changes := array_append(v_changes, 'paid_amount');
  END IF;

  -- ==================== UPDATE TRANSACTION ====================

  UPDATE transactions SET
    total = v_new_total,
    paid_amount = v_new_paid_amount,
    payment_status = CASE WHEN v_new_paid_amount >= v_new_total THEN 'Lunas' ELSE 'Belum Lunas' END,
    customer_name = v_customer_name,
    notes = COALESCE(p_transaction->>'notes', notes),
    updated_at = NOW()
  WHERE id = p_transaction_id;

  -- ==================== UPDATE JOURNAL IF AMOUNTS CHANGED ====================

  IF 'total' = ANY(v_changes) OR 'paid_amount' = ANY(v_changes) THEN
    -- Void old journal
    UPDATE journal_entries
    SET is_voided = TRUE, voided_at = NOW(), voided_reason = 'Transaction updated'
    WHERE reference_type = 'transaction'
      AND reference_id = p_transaction_id
      AND branch_id = p_branch_id
      AND is_voided = FALSE;

    -- Calculate HPP from items
    SELECT COALESCE(SUM((item->>'hppAmount')::NUMERIC), 0) INTO v_total_hpp
    FROM jsonb_array_elements(v_old_transaction.items) AS item;

    -- Build new journal lines
    v_journal_lines := '[]'::JSONB;

    -- Debit: Kas atau Piutang
    IF v_new_paid_amount >= v_new_total THEN
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '1110',
        'debit_amount', v_new_total,
        'credit_amount', 0,
        'description', 'Penerimaan kas dari penjualan'
      );
    ELSIF v_new_paid_amount > 0 THEN
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '1110',
        'debit_amount', v_new_paid_amount,
        'credit_amount', 0,
        'description', 'Penerimaan kas dari penjualan'
      );
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '1210',
        'debit_amount', v_new_total - v_new_paid_amount,
        'credit_amount', 0,
        'description', 'Piutang usaha'
      );
    ELSE
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '1210',
        'debit_amount', v_new_total,
        'credit_amount', 0,
        'description', 'Piutang usaha'
      );
    END IF;

    -- Credit: Pendapatan
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_code', '4100',
      'debit_amount', 0,
      'credit_amount', v_new_total,
      'description', 'Pendapatan penjualan'
    );

    -- HPP entries
    IF v_total_hpp > 0 THEN
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '5100',
        'debit_amount', v_total_hpp,
        'credit_amount', 0,
        'description', 'Harga Pokok Penjualan'
      );
      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', '1310',
        'debit_amount', 0,
        'credit_amount', v_total_hpp,
        'description', 'Pengurangan persediaan'
      );
    END IF;

    -- Create new journal
    SELECT cja.journal_id INTO v_journal_id FROM create_journal_atomic(
      p_branch_id,
      v_date,
      'Penjualan ke ' || COALESCE(v_customer_name, 'Umum') || ' - ' || p_transaction_id || ' (Updated)',
      'transaction',
      p_transaction_id,
      v_journal_lines,
      TRUE
    );

    v_changes := array_append(v_changes, 'journal_updated');
  END IF;

  RETURN QUERY SELECT TRUE, p_transaction_id, v_journal_id, v_changes, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, '{}'::TEXT[], SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 3. VOID TRANSACTION ATOMIC
-- Void transaksi dengan rollback semua
-- ============================================================================

CREATE OR REPLACE FUNCTION void_transaction_atomic(
  p_transaction_id TEXT,
  p_branch_id UUID,
  p_reason TEXT DEFAULT 'Cancelled',
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  items_restored INTEGER,
  journals_voided INTEGER,
  commissions_deleted INTEGER,
  deliveries_deleted INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_transaction RECORD;
  v_items_restored INTEGER := 0;
  v_journals_voided INTEGER := 0;
  v_commissions_deleted INTEGER := 0;
  v_deliveries_deleted INTEGER := 0;
  v_item RECORD;
  v_batch RECORD;
  v_restore_qty NUMERIC;
BEGIN
  -- ==================== VALIDASI ====================

  IF p_branch_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0, 0, 'Branch ID is REQUIRED!'::TEXT;
    RETURN;
  END IF;

  -- Get transaction with row lock
  SELECT * INTO v_transaction
  FROM transactions
  WHERE id = p_transaction_id AND branch_id = p_branch_id
  FOR UPDATE;

  IF v_transaction.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 0, 0, 'Transaction not found'::TEXT;
    RETURN;
  END IF;

  -- ==================== RESTORE INVENTORY ====================

  -- IF Office Sale (immediate consume) OR already delivered (consume via delivery)
  IF v_transaction.is_office_sale OR v_transaction.delivery_status = 'Delivered' THEN
    -- Parse items from JSONB
    FOR v_item IN 
      SELECT 
        (elem->>'productId')::UUID as product_id,
        (elem->>'quantity')::NUMERIC as quantity
      FROM jsonb_array_elements(v_transaction.items) as elem
      WHERE (elem->>'productId') IS NOT NULL
    LOOP
      v_restore_qty := v_item.quantity;

      -- Restore to batches in LIFO order (newest first)
      FOR v_batch IN
        SELECT id, remaining_quantity, initial_quantity
        FROM inventory_batches
        WHERE product_id = v_item.product_id
          AND branch_id = p_branch_id
          AND remaining_quantity < initial_quantity
        ORDER BY batch_date DESC, created_at DESC
        FOR UPDATE
      LOOP
        EXIT WHEN v_restore_qty <= 0;

        DECLARE
          v_can_restore NUMERIC;
        BEGIN
          v_can_restore := LEAST(v_restore_qty, v_batch.initial_quantity - v_batch.remaining_quantity);

          UPDATE inventory_batches
          SET
            remaining_quantity = remaining_quantity + v_can_restore,
            updated_at = NOW()
          WHERE id = v_batch.id;

          v_restore_qty := v_restore_qty - v_can_restore;
        END;
      END LOOP;

      -- If still have qty to restore, create new batch
      IF v_restore_qty > 0 THEN
        INSERT INTO inventory_batches (
          product_id,
          branch_id,
          initial_quantity,
          remaining_quantity,
          unit_cost,
          batch_date,
          notes
        ) VALUES (
          v_item.product_id,
          p_branch_id,
          v_restore_qty,
          v_restore_qty,
          0,
          NOW(),
          format('Restored from void: %s', v_transaction.id)
        );
      END IF;
      
      v_items_restored := v_items_restored + 1;
    END LOOP;
  END IF;

  -- ==================== VOID JOURNALS ====================

  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = p_reason,
    status = 'voided',
    updated_at = NOW()
  WHERE reference_type = 'transaction'
    AND reference_id = p_transaction_id
    AND branch_id = p_branch_id
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_journals_voided = ROW_COUNT;

  -- Void related delivery journals
  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_reason = 'Transaction voided: ' || p_reason,
    status = 'voided',
    updated_at = NOW()
  WHERE reference_type = 'delivery'
    AND reference_id IN (SELECT id::TEXT FROM deliveries WHERE transaction_id = p_transaction_id)
    AND branch_id = p_branch_id
    AND is_voided = FALSE;

  -- ==================== DELETE COMMISSIONS ====================

  DELETE FROM commission_entries
  WHERE transaction_id = p_transaction_id AND branch_id = p_branch_id;

  GET DIAGNOSTICS v_commissions_deleted = ROW_COUNT;

  -- ==================== DELETE DELIVERIES ====================

  DELETE FROM delivery_items
  WHERE delivery_id IN (SELECT id FROM deliveries WHERE transaction_id = p_transaction_id);

  DELETE FROM deliveries
  WHERE transaction_id = p_transaction_id AND branch_id = p_branch_id;

  GET DIAGNOSTICS v_deliveries_deleted = ROW_COUNT;

  -- ==================== DELETE STOCK MOVEMENTS ====================

  DELETE FROM product_stock_movements
  WHERE reference_id = p_transaction_id AND reference_type IN ('transaction', 'delivery', 'fifo_consume');

  -- ==================== CANCEL RECEIVABLES ====================
  
  UPDATE receivables
  SET status = 'cancelled', updated_at = NOW()
  WHERE transaction_id = p_transaction_id AND branch_id = p_branch_id;

  -- ==================== DELETE TRANSACTION ====================

  -- Hard delete the transaction (not soft delete)
  DELETE FROM transactions
  WHERE id = p_transaction_id AND branch_id = p_branch_id;

  -- ==================== SUCCESS ====================

  RETURN QUERY SELECT
    TRUE,
    v_items_restored,
    v_journals_voided,
    v_commissions_deleted,
    v_deliveries_deleted,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, 0, 0, 0, 0, SQLERRM::TEXT;
END;

$$ LANGUAGE plpgsql SECURITY DEFINER;



-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_transaction_atomic(JSONB, JSONB, UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_transaction_atomic(TEXT, JSONB, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION void_transaction_atomic(TEXT, UUID, TEXT, UUID) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION create_transaction_atomic IS
  'Create transaction atomic dengan FIFO HPP calculation, journal, dan commission. WAJIB branch_id.';
COMMENT ON FUNCTION update_transaction_atomic IS
  'Update transaction dan recreate journal jika amounts berubah. WAJIB branch_id.';
COMMENT ON FUNCTION void_transaction_atomic IS
  'Void transaction dengan restore inventory LIFO, void journals, delete commissions & deliveries.';

