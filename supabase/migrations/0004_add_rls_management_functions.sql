-- Create functions for RLS management

-- Function to get RLS status for all tables
CREATE OR REPLACE FUNCTION get_rls_status()
RETURNS TABLE (
  schema_name text,
  table_name text,
  rls_enabled boolean
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT 
    schemaname::text as schema_name,
    tablename::text as table_name,
    rowsecurity as rls_enabled
  FROM pg_tables 
  WHERE schemaname = 'public'
  ORDER BY tablename;
$$;

-- Function to enable RLS on a specific table
CREATE OR REPLACE FUNCTION enable_rls(table_name text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Check if user has permission (only owner role)
  IF NOT EXISTS (
    SELECT 1 FROM auth.users 
    WHERE id = auth.uid() 
    AND raw_user_meta_data->>'role' = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only owner can manage RLS settings';
  END IF;

  -- Enable RLS on the specified table
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to enable RLS on table %: %', table_name, SQLERRM;
END;
$$;

-- Function to disable RLS on a specific table
CREATE OR REPLACE FUNCTION disable_rls(table_name text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Check if user has permission (only owner role)
  IF NOT EXISTS (
    SELECT 1 FROM auth.users 
    WHERE id = auth.uid() 
    AND raw_user_meta_data->>'role' = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only owner can manage RLS settings';
  END IF;

  -- Disable RLS on the specified table
  EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', table_name);
  
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to disable RLS on table %: %', table_name, SQLERRM;
END;
$$;

-- Function to get RLS policies
CREATE OR REPLACE FUNCTION get_rls_policies(table_name text DEFAULT NULL)
RETURNS TABLE (
  schema_name text,
  table_name text,
  policy_name text,
  cmd text,
  roles text,
  qual text
) LANGUAGE sql SECURITY DEFINER AS $$
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
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_rls_status() TO authenticated;
GRANT EXECUTE ON FUNCTION enable_rls(text) TO authenticated;
GRANT EXECUTE ON FUNCTION disable_rls(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_rls_policies(text) TO authenticated;