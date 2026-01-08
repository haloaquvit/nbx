-- =====================================================
-- RPC Functions for table: debt_installments
-- Generated: 2026-01-08T22:26:17.736Z
-- Total functions: 1
-- =====================================================

-- Function: update_overdue_installments_atomic
CREATE OR REPLACE FUNCTION public.update_overdue_installments_atomic()
 RETURNS TABLE(updated_count integer, success boolean, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;


