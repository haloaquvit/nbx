-- =====================================================
-- RPC Functions for table: roles
-- Generated: 2026-01-08T22:26:17.732Z
-- Total functions: 1
-- =====================================================

-- Function: get_rls_policies
CREATE OR REPLACE FUNCTION public.get_rls_policies(table_name text DEFAULT NULL::text)
 RETURNS TABLE(schema_name text, table_name text, policy_name text, cmd text, roles text, qual text)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT 
    schemaname::text as schema_name,
    tablename::text as table_name,
    policyname::text as policy_name,
    cmd::text,
    array_to_string(roles, ', ')::text as roles,
    qual::text
  FROM pg_policies 
  WHERE schemaname = 'public'
    AND (table_name IS NULL OR tablename = table_name)
  ORDER BY tablename, policyname;
$function$
;


