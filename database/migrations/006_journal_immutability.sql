-- Migration 006: Journal Immutability Trigger
-- Purpose: Prevent UPDATE on posted journals (only void allowed)
-- Date: 2026-01-03

-- Function to prevent updates on posted journals
CREATE OR REPLACE FUNCTION prevent_posted_journal_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow if changing from draft to posted
  IF OLD.status = 'draft' AND NEW.status = 'posted' THEN
    RETURN NEW;
  END IF;

  -- Allow if voiding (is_voided changing to true)
  IF OLD.is_voided IS DISTINCT FROM NEW.is_voided THEN
    RETURN NEW;
  END IF;

  -- Allow if changing status to voided
  IF NEW.status = 'voided' AND OLD.status != 'voided' THEN
    RETURN NEW;
  END IF;

  -- Prevent other updates on posted journals
  IF OLD.status = 'posted' THEN
    -- Check if any significant field changed
    IF OLD.total_debit IS DISTINCT FROM NEW.total_debit
       OR OLD.total_credit IS DISTINCT FROM NEW.total_credit
       OR OLD.entry_date IS DISTINCT FROM NEW.entry_date
       OR OLD.description IS DISTINCT FROM NEW.description THEN
      RAISE EXCEPTION 'Cannot update posted journal entry. Use void and create new instead. Journal: %', OLD.entry_number;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_prevent_posted_journal_update ON journal_entries;

CREATE TRIGGER trigger_prevent_posted_journal_update
BEFORE UPDATE ON journal_entries
FOR EACH ROW
EXECUTE FUNCTION prevent_posted_journal_update();

-- Also prevent updates on journal_entry_lines for posted journals
CREATE OR REPLACE FUNCTION prevent_posted_journal_lines_update()
RETURNS TRIGGER AS $$
DECLARE
  v_journal_status TEXT;
  v_is_voided BOOLEAN;
BEGIN
  -- Get parent journal status
  SELECT status, is_voided
  INTO v_journal_status, v_is_voided
  FROM journal_entries
  WHERE id = COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);

  -- Allow changes if journal is draft
  IF v_journal_status = 'draft' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Allow deletes if journal is being voided
  IF v_is_voided = TRUE THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Prevent changes on posted journal lines
  IF v_journal_status = 'posted' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Cannot delete lines from posted journal. Void the journal instead.';
    ELSIF TG_OP = 'UPDATE' THEN
      IF OLD.debit_amount IS DISTINCT FROM NEW.debit_amount
         OR OLD.credit_amount IS DISTINCT FROM NEW.credit_amount
         OR OLD.account_id IS DISTINCT FROM NEW.account_id THEN
        RAISE EXCEPTION 'Cannot update lines in posted journal. Void the journal instead.';
      END IF;
    ELSIF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Cannot add lines to posted journal. Void and create new instead.';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger for journal lines
DROP TRIGGER IF EXISTS trigger_prevent_posted_lines_update ON journal_entry_lines;

CREATE TRIGGER trigger_prevent_posted_lines_update
BEFORE INSERT OR UPDATE OR DELETE ON journal_entry_lines
FOR EACH ROW
EXECUTE FUNCTION prevent_posted_journal_lines_update();

-- Function to void journal by reference (for use when cancelling transactions)
CREATE OR REPLACE FUNCTION void_journal_by_reference(
  p_reference_id TEXT,
  p_reference_type TEXT,
  p_user_id UUID DEFAULT NULL,
  p_user_name TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT 'Cancelled'
)
RETURNS TABLE (
  success BOOLEAN,
  journals_voided INTEGER,
  message TEXT
) AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  UPDATE journal_entries
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_by = p_user_id,
    voided_by_name = COALESCE(p_user_name, 'System'),
    void_reason = p_reason,
    status = 'voided'
  WHERE reference_id = p_reference_id
    AND reference_type = p_reference_type
    AND (is_voided = FALSE OR is_voided IS NULL);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    RETURN QUERY SELECT TRUE, v_count, format('Voided %s journal(s) for %s: %s', v_count, p_reference_type, p_reference_id)::TEXT;
  ELSE
    RETURN QUERY SELECT FALSE, 0, format('No journals found for %s: %s', p_reference_type, p_reference_id)::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION void_journal_by_reference(TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION prevent_posted_journal_update IS 'Prevents modification of posted journals - only void allowed';
COMMENT ON FUNCTION prevent_posted_journal_lines_update IS 'Prevents modification of posted journal lines';
COMMENT ON FUNCTION void_journal_by_reference IS 'Void all journals related to a reference (transaction, delivery, etc)';
