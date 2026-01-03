-- Migration 005: Add soft delete columns for event immutability
-- Purpose: Instead of DELETE, we use soft delete (is_cancelled)
-- Date: 2026-01-03

-- Transactions soft delete
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT FALSE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cancelled_by UUID;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cancelled_by_name TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS correction_of TEXT;  -- Reference to original transaction if this is a correction

-- Deliveries soft delete
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT FALSE;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS cancelled_by UUID;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS cancelled_by_name TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- Production records soft delete
ALTER TABLE production_records ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT FALSE;
ALTER TABLE production_records ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE production_records ADD COLUMN IF NOT EXISTS cancelled_by UUID;
ALTER TABLE production_records ADD COLUMN IF NOT EXISTS cancelled_by_name TEXT;
ALTER TABLE production_records ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- Expenses soft delete
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT FALSE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS cancelled_by UUID;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS cancelled_by_name TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- Payment history soft delete
ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT FALSE;
ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS cancelled_by UUID;
ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS cancelled_by_name TEXT;
ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- Create indexes for filtering non-cancelled records
CREATE INDEX IF NOT EXISTS idx_transactions_not_cancelled ON transactions(id) WHERE is_cancelled = FALSE OR is_cancelled IS NULL;
CREATE INDEX IF NOT EXISTS idx_deliveries_not_cancelled ON deliveries(id) WHERE is_cancelled = FALSE OR is_cancelled IS NULL;
CREATE INDEX IF NOT EXISTS idx_production_not_cancelled ON production_records(id) WHERE is_cancelled = FALSE OR is_cancelled IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_not_cancelled ON expenses(id) WHERE is_cancelled = FALSE OR is_cancelled IS NULL;

-- Function to cancel a transaction (soft delete + void journal + restore stock)
CREATE OR REPLACE FUNCTION cancel_transaction_v2(
  p_transaction_id TEXT,
  p_user_id UUID,
  p_user_name TEXT,
  p_reason TEXT DEFAULT 'Cancelled'
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  journal_voided BOOLEAN,
  stock_restored BOOLEAN
) AS $$
DECLARE
  v_transaction RECORD;
  v_item RECORD;
  v_journal_id UUID;
  v_restore_result RECORD;
BEGIN
  -- Get transaction
  SELECT * INTO v_transaction
  FROM transactions
  WHERE id = p_transaction_id;

  IF v_transaction IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Transaction not found'::TEXT, FALSE, FALSE;
    RETURN;
  END IF;

  IF v_transaction.is_cancelled = TRUE THEN
    RETURN QUERY SELECT FALSE, 'Transaction already cancelled'::TEXT, FALSE, FALSE;
    RETURN;
  END IF;

  -- 1. Mark transaction as cancelled
  UPDATE transactions
  SET
    is_cancelled = TRUE,
    cancelled_at = NOW(),
    cancelled_by = p_user_id,
    cancelled_by_name = p_user_name,
    cancel_reason = p_reason,
    updated_at = NOW()
  WHERE id = p_transaction_id;

  -- 2. Void related journal entry
  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_by = p_user_id,
    voided_by_name = p_user_name,
    void_reason = p_reason,
    status = 'voided'
  WHERE reference_id = p_transaction_id
    AND reference_type = 'transaction'
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_journal_id = ROW_COUNT;

  -- 3. Restore stock for each item (if office sale or already delivered)
  IF v_transaction.is_office_sale = TRUE THEN
    FOR v_item IN
      SELECT
        (elem->>'productId')::UUID as product_id,
        (elem->>'quantity')::NUMERIC as quantity
      FROM jsonb_array_elements(v_transaction.items) as elem
      WHERE elem->>'productId' IS NOT NULL
    LOOP
      PERFORM restore_stock_fifo_v2(
        v_item.product_id,
        v_item.quantity,
        p_transaction_id,
        'transaction',
        v_transaction.branch_id
      );
    END LOOP;
  END IF;

  RETURN QUERY SELECT TRUE, 'Transaction cancelled successfully'::TEXT, v_journal_id > 0, TRUE;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION cancel_transaction_v2(TEXT, UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION cancel_transaction_v2 IS 'Soft delete transaction, void journal, and restore stock';
