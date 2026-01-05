-- ============================================================================
-- RPC 24: Debt Installment Management
-- Purpose: Manage debt installment operations atomically
-- - Update overdue status for installments
-- ============================================================================

-- ============================================================================
-- 1. UPDATE OVERDUE INSTALLMENTS
-- Automatically mark pending installments as overdue if past due date
-- ============================================================================

CREATE OR REPLACE FUNCTION update_overdue_installments_atomic()
RETURNS TABLE (
  updated_count INTEGER,
  success BOOLEAN,
  error_message TEXT
) AS $$
DECLARE
  v_updated_count INTEGER := 0;
BEGIN
  -- Update all pending installments that are past due date
  UPDATE debt_installments
  SET
    status = 'overdue'
  WHERE status = 'pending'
    AND due_date < CURRENT_DATE;
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  RETURN QUERY SELECT 
    v_updated_count,
    TRUE,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT 
    0,
    FALSE,
    SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION update_overdue_installments_atomic() TO authenticated;
GRANT EXECUTE ON FUNCTION update_overdue_installments_atomic() TO anon;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION update_overdue_installments_atomic IS
  'Automatically update pending installments to overdue status if past due date. Can be called by authenticated users or scheduled jobs.';

-- ============================================================================
-- 2. UPSERT NOTIFICATION
-- Create or update notification (for low stock, due payments, etc.)
-- ============================================================================

CREATE OR REPLACE FUNCTION upsert_notification_atomic(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_priority TEXT DEFAULT 'normal',
  p_reference_id TEXT DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL,
  p_reference_url TEXT DEFAULT NULL
)
RETURNS TABLE (
  notification_id UUID,
  success BOOLEAN,
  error_message TEXT
) AS $$
DECLARE
  v_notification_id UUID;
  v_existing_id UUID;
  v_today TIMESTAMP;
BEGIN
  -- Get today's start time
  v_today := DATE_TRUNC('day', NOW());

  -- Check if similar unread notification exists today
  SELECT id INTO v_existing_id
  FROM notifications
  WHERE user_id = p_user_id
    AND type = p_type
    AND is_read = FALSE
    AND created_at >= v_today
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Update existing notification
    UPDATE notifications
    SET 
      title = p_title,
      message = p_message,
      priority = p_priority,
      reference_id = p_reference_id,
      updated_at = NOW()
    WHERE id = v_existing_id;
    
    v_notification_id := v_existing_id;
  ELSE
    -- Create new notification
    INSERT INTO notifications (
      user_id,
      type,
      title,
      message,
      priority,
      reference_id,
      reference_type,
      reference_url
    ) VALUES (
      p_user_id,
      p_type,
      p_title,
      p_message,
      p_priority,
      p_reference_id,
      p_reference_type,
      p_reference_url
    )
    RETURNING id INTO v_notification_id;
  END IF;

  RETURN QUERY SELECT 
    v_notification_id,
    TRUE,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT 
    NULL::UUID,
    FALSE,
    SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION upsert_notification_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_notification_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION upsert_notification_atomic IS
  'Create or update notification for a user. If similar unread notification exists today, update it instead of creating duplicate.';
