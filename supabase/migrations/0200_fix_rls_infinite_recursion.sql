-- Fix infinite recursion in RLS policies
-- The issue: Branches policies query profiles, and profiles policies query back

-- Step 1: Drop problematic policies
DROP POLICY IF EXISTS "Users can view accessible branches" ON public.branches;
DROP POLICY IF EXISTS "Admin can manage branches" ON public.branches;
DROP POLICY IF EXISTS "Users can view branch profiles" ON public.profiles;

-- Step 2: Recreate helper functions to be more explicit about bypassing RLS
-- Use CASCADE to drop functions that have dependent policies
DROP FUNCTION IF EXISTS public.get_user_branch_id() CASCADE;
DROP FUNCTION IF EXISTS public.is_super_admin() CASCADE;
DROP FUNCTION IF EXISTS public.can_access_branch(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.is_head_office_user() CASCADE;

-- Get user's branch ID - bypasses RLS by using SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.get_user_branch_id()
RETURNS UUID AS $$
DECLARE
  user_branch UUID;
BEGIN
  -- Directly query without triggering RLS
  SELECT branch_id INTO user_branch
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;

  RETURN user_branch;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user is super admin, owner, or head office admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Directly query without triggering RLS
  SELECT role INTO user_role
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;

  RETURN user_role IN ('super_admin', 'head_office_admin', 'owner');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user can access a specific branch
CREATE OR REPLACE FUNCTION public.can_access_branch(branch_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
  user_branch UUID;
BEGIN
  -- Directly query without triggering RLS
  SELECT role, branch_id INTO user_role, user_branch
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;

  -- Super admins, owners, and head office admins can access all branches
  IF user_role IN ('super_admin', 'head_office_admin', 'owner') THEN
    RETURN true;
  END IF;

  -- Regular users can only access their own branch
  RETURN user_branch = branch_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Step 3: Recreate branches policies with simpler logic
CREATE POLICY "Users can view accessible branches"
  ON public.branches FOR SELECT
  USING (
    -- Use helper function that bypasses RLS internally
    is_super_admin() OR id = get_user_branch_id()
  );

CREATE POLICY "Admin can insert branches"
  ON public.branches FOR INSERT
  WITH CHECK (is_super_admin());

CREATE POLICY "Admin can update branches"
  ON public.branches FOR UPDATE
  USING (is_super_admin());

CREATE POLICY "Admin can delete branches"
  ON public.branches FOR DELETE
  USING (is_super_admin());

-- Step 4: Recreate profiles policies without circular dependency
CREATE POLICY "Users can view branch profiles"
  ON public.profiles FOR SELECT
  USING (
    -- Super admins can see all profiles
    is_super_admin()
    OR
    -- Users can see profiles from their own branch
    branch_id = get_user_branch_id()
    OR
    -- Users can always see their own profile
    id = auth.uid()
  );

-- Step 5: Recreate all other policies that were dropped by CASCADE

-- Customers policies
CREATE POLICY "Users can view branch customers"
  ON public.customers FOR SELECT
  USING (can_access_branch(branch_id));

CREATE POLICY "Users can insert branch customers"
  ON public.customers FOR INSERT
  WITH CHECK (branch_id = get_user_branch_id() OR is_super_admin());

CREATE POLICY "Users can update branch customers"
  ON public.customers FOR UPDATE
  USING (can_access_branch(branch_id));

CREATE POLICY "Users can delete branch customers"
  ON public.customers FOR DELETE
  USING (can_access_branch(branch_id));

-- Transactions policies
CREATE POLICY "Users can view branch transactions"
  ON public.transactions FOR SELECT
  USING (can_access_branch(branch_id));

CREATE POLICY "Users can insert branch transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (branch_id = get_user_branch_id());

CREATE POLICY "Users can update branch transactions"
  ON public.transactions FOR UPDATE
  USING (can_access_branch(branch_id));

CREATE POLICY "Users can delete branch transactions"
  ON public.transactions FOR DELETE
  USING (can_access_branch(branch_id));

-- Products policies
CREATE POLICY "Users can view accessible products"
  ON public.products FOR SELECT
  USING (is_shared = true OR can_access_branch(branch_id));

CREATE POLICY "Users can insert products"
  ON public.products FOR INSERT
  WITH CHECK (branch_id = get_user_branch_id() OR is_super_admin());

CREATE POLICY "Users can update accessible products"
  ON public.products FOR UPDATE
  USING (can_access_branch(branch_id) OR (is_shared = true AND is_super_admin()));

CREATE POLICY "Users can delete accessible products"
  ON public.products FOR DELETE
  USING (can_access_branch(branch_id) OR (is_shared = true AND is_super_admin()));

-- Branch transfers policies
CREATE POLICY "Users can view branch transfers"
  ON public.branch_transfers FOR SELECT
  USING (can_access_branch(from_branch_id) OR can_access_branch(to_branch_id));

CREATE POLICY "Users can create branch transfers"
  ON public.branch_transfers FOR INSERT
  WITH CHECK (from_branch_id = get_user_branch_id());

CREATE POLICY "Users can update branch transfers"
  ON public.branch_transfers FOR UPDATE
  USING (
    (status = 'pending' AND requested_by = auth.uid())
    OR (status = 'pending' AND can_access_branch(to_branch_id))
    OR is_super_admin()
  );
