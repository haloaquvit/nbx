-- =====================================================
-- RPC Functions for table: employee_salaries
-- Generated: 2026-01-08T22:26:17.732Z
-- Total functions: 1
-- =====================================================

-- Function: get_active_salary_config
CREATE OR REPLACE FUNCTION public.get_active_salary_config(emp_id uuid, check_date date)
 RETURNS employee_salaries
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  result public.employee_salaries;
BEGIN
  -- First try exact match (effective_from <= check_date)
  SELECT * INTO result
  FROM public.employee_salaries
  WHERE employee_id = emp_id
    AND is_active = true
    AND effective_from <= check_date
    AND (effective_until IS NULL OR effective_until >= check_date)
  ORDER BY effective_from DESC
  LIMIT 1;
  -- If not found, just get any active config for this employee
  IF result IS NULL THEN
    SELECT * INTO result
    FROM public.employee_salaries
    WHERE employee_id = emp_id
      AND is_active = true
    ORDER BY effective_from DESC
    LIMIT 1;
  END IF;
  RETURN result;
END;
$function$
;


