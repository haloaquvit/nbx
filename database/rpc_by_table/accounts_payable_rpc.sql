-- =====================================================
-- RPC Functions for table: accounts_payable
-- Generated: 2026-01-08T22:26:17.728Z
-- Total functions: 1
-- =====================================================

-- Function: delete_accounts_payable_atomic
CREATE OR REPLACE FUNCTION public.delete_accounts_payable_atomic(p_payable_id text, p_branch_id uuid)
 RETURNS TABLE(success boolean, journals_voided integer, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_journals_voided INTEGER := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM accounts_payable_payments WHERE accounts_payable_id = p_payable_id) THEN RETURN QUERY SELECT FALSE, 0, 'Ada pembayaran'::TEXT; RETURN; END IF;
  UPDATE journal_entries SET is_voided = TRUE, voided_at = NOW(), voided_reason = 'AP Deleted', status = 'voided' WHERE reference_id = p_payable_id AND reference_type = 'payable' AND branch_id = p_branch_id AND is_voided = FALSE;
  GET DIAGNOSTICS v_journals_voided = ROW_COUNT;
  DELETE FROM accounts_payable WHERE id = p_payable_id AND branch_id = p_branch_id;
  RETURN QUERY SELECT TRUE, v_journals_voided, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN RETURN QUERY SELECT FALSE, 0, SQLERRM::TEXT;
END;
$function$
;


