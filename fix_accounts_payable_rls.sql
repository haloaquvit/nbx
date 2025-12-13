-- Fix RLS policy for accounts_payable table
-- The table exists but RLS policy is too restrictive

-- Drop existing policy and recreate with proper permissions
DROP POLICY IF EXISTS "Authenticated users can manage accounts payable" ON public.accounts_payable;

-- Create new policy that allows authenticated users to do everything
CREATE POLICY "Enable all access for authenticated users"
ON public.accounts_payable
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Alternative: Create separate policies for different operations
/*
-- Policy for SELECT
CREATE POLICY "Enable select for authenticated users"
ON public.accounts_payable
FOR SELECT
TO authenticated
USING (true);

-- Policy for INSERT
CREATE POLICY "Enable insert for authenticated users"
ON public.accounts_payable
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy for UPDATE
CREATE POLICY "Enable update for authenticated users"
ON public.accounts_payable
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Policy for DELETE
CREATE POLICY "Enable delete for authenticated users"
ON public.accounts_payable
FOR DELETE
TO authenticated
USING (true);
*/

-- Verify the policy was created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'accounts_payable';