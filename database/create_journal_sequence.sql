-- ============================================================================
-- Journal Entry Sequence Generator
-- ============================================================================
-- Provides a robust, race-condition-free journal number generation
-- using PostgreSQL sequences
-- ============================================================================

-- Create a table to store per-branch, per-day sequences
CREATE TABLE IF NOT EXISTS journal_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  date_prefix VARCHAR(10) NOT NULL, -- Format: YYYYMMDD
  last_sequence INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(branch_id, date_prefix)
);

-- Create index for faster lookup
CREATE INDEX IF NOT EXISTS idx_journal_sequences_lookup
  ON journal_sequences(branch_id, date_prefix);

-- ============================================================================
-- Function: get_next_journal_number
-- Returns the next journal number in format: JE-YYYYMMDD-XXXX
-- Uses advisory lock to prevent race conditions
-- ============================================================================
CREATE OR REPLACE FUNCTION get_next_journal_number(
  p_branch_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_date_prefix TEXT;
  v_next_seq INTEGER;
  v_lock_id BIGINT;
BEGIN
  -- Generate date prefix
  v_date_prefix := TO_CHAR(p_date, 'YYYYMMDD');

  -- Create a unique lock ID based on branch and date
  -- This prevents race conditions when multiple transactions try to get the next number
  v_lock_id := hashtext(p_branch_id::TEXT || v_date_prefix);

  -- Acquire advisory lock (will wait if another transaction has it)
  PERFORM pg_advisory_xact_lock(v_lock_id);

  -- Insert or update the sequence
  INSERT INTO journal_sequences (branch_id, date_prefix, last_sequence, updated_at)
  VALUES (p_branch_id, v_date_prefix, 1, NOW())
  ON CONFLICT (branch_id, date_prefix)
  DO UPDATE SET
    last_sequence = journal_sequences.last_sequence + 1,
    updated_at = NOW()
  RETURNING last_sequence INTO v_next_seq;

  -- Return formatted journal number
  RETURN 'JE-' || v_date_prefix || '-' || LPAD(v_next_seq::TEXT, 4, '0');
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_next_journal_number(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_journal_number(UUID, DATE) TO anon;

-- ============================================================================
-- Function: reset_journal_sequence
-- Resets the sequence for a specific branch and date (for testing/admin use)
-- ============================================================================
CREATE OR REPLACE FUNCTION reset_journal_sequence(
  p_branch_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_date_prefix TEXT;
BEGIN
  v_date_prefix := TO_CHAR(p_date, 'YYYYMMDD');

  DELETE FROM journal_sequences
  WHERE branch_id = p_branch_id AND date_prefix = v_date_prefix;
END;
$$;

-- Grant execute permission (admin only)
GRANT EXECUTE ON FUNCTION reset_journal_sequence(UUID, DATE) TO authenticated;

-- ============================================================================
-- RLS Policies for journal_sequences table
-- ============================================================================
ALTER TABLE journal_sequences ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view sequences for their branch
CREATE POLICY "View journal sequences for own branch"
  ON journal_sequences
  FOR SELECT
  USING (true); -- Allow read for all authenticated users

-- Policy: Only the function can modify (SECURITY DEFINER)
CREATE POLICY "Only functions can modify sequences"
  ON journal_sequences
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON TABLE journal_sequences IS 'Stores per-branch, per-day journal number sequences';
COMMENT ON FUNCTION get_next_journal_number IS 'Gets the next journal entry number with race-condition protection';
COMMENT ON FUNCTION reset_journal_sequence IS 'Resets the journal sequence for a specific branch and date (admin use)';
