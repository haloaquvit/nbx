CREATE OR REPLACE FUNCTION public.create_account(
    p_branch_id text,
    p_name text,
    p_code text,
    p_type text,
    p_initial_balance numeric DEFAULT 0,
    p_is_payment_account boolean DEFAULT false,
    p_parent_id text DEFAULT NULL::text,
    p_level integer DEFAULT 1,
    p_is_header boolean DEFAULT false,
    p_sort_order integer DEFAULT 0,
    p_employee_id text DEFAULT NULL::text
)
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
$function$;
