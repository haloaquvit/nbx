-- =====================================================
-- RPC Functions for table: suppliers
-- Generated: 2026-01-08T22:26:17.731Z
-- Total functions: 1
-- =====================================================

-- Function: generate_supplier_code
CREATE OR REPLACE FUNCTION public.generate_supplier_code()
 RETURNS character varying
 LANGUAGE plpgsql
AS $function$
DECLARE
  new_code VARCHAR(20);
  counter INTEGER;
BEGIN
  -- Get the current max number from existing codes
  SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 4) AS INTEGER)), 0) + 1
  INTO counter
  FROM suppliers
  WHERE code ~ '^SUP[0-9]+$';
  
  -- Generate new code
  new_code := 'SUP' || LPAD(counter::TEXT, 4, '0');
  
  RETURN new_code;
END;
$function$
;


