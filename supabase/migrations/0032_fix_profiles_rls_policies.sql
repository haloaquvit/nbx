-- Fix RLS policies for profiles table (Employee CRUD)
-- Migration: 0032_fix_profiles_rls_policies.sql  
-- Date: 2025-01-19

-- First, let's check and drop existing policies that might conflict
DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;

-- Create comprehensive RLS policies for profiles table

-- 1. SELECT Policy - All authenticated users can view profiles
CREATE POLICY "Authenticated users can view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

-- 2. INSERT Policy - Only allow system/auth to create profiles, or admins/owners
CREATE POLICY "System and admins can create profiles" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Allow users to create their own profile (from auth trigger)
    auth.uid() = id OR
    -- Allow admins and owners to create profiles for others
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() 
      AND p.role IN ('owner', 'admin')
      AND p.status = 'Aktif'
    )
  );

-- 3. UPDATE Policy - Users can update their own profile, admins/owners can update any
CREATE POLICY "Users can update own profile, admins can update any" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    -- Users can update their own profile
    auth.uid() = id OR
    -- Admins and owners can update any profile
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() 
      AND p.role IN ('owner', 'admin')
      AND p.status = 'Aktif'
    )
  )
  WITH CHECK (
    -- Same conditions for the updated data
    auth.uid() = id OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() 
      AND p.role IN ('owner', 'admin')
      AND p.status = 'Aktif'
    )
  );

-- 4. DELETE Policy - Only admins and owners can delete profiles (MISSING POLICY!)
CREATE POLICY "Only admins and owners can delete profiles" ON public.profiles
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() 
      AND p.role IN ('owner', 'admin')
      AND p.status = 'Aktif'
    )
    -- Prevent deleting yourself (safety measure)
    AND id != auth.uid()
    -- Prevent admins from deleting owners (hierarchy protection)
    AND NOT (
      role = 'owner' AND 
      EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id = auth.uid() AND p2.role = 'admin'
      )
    )
  );

-- Drop existing view first to avoid data type conflicts
DROP VIEW IF EXISTS public.employees_view;

-- Create a more flexible employees view that works with RLS
CREATE OR REPLACE VIEW public.employees_view AS
SELECT
    p.id,
    p.full_name,
    p.email,
    COALESCE(r.display_name, p.role) as role_name,
    p.role,
    p.phone,
    p.address,
    p.status,
    p.updated_at
FROM public.profiles p
LEFT JOIN public.roles r ON r.name = p.role
WHERE p.status != 'Nonaktif' OR p.status IS NULL;

-- Grant access to the view
GRANT SELECT ON public.employees_view TO authenticated;

-- Create helper function to check if user can manage employees
CREATE OR REPLACE FUNCTION public.can_manage_employees(user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_id 
    AND p.role IN ('owner', 'admin')
    AND p.status = 'Aktif'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the helper function
GRANT EXECUTE ON FUNCTION public.can_manage_employees(UUID) TO authenticated;

-- Create helper function for safe employee deletion (marks as inactive instead of hard delete)
CREATE OR REPLACE FUNCTION public.deactivate_employee(employee_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if current user can manage employees
  IF NOT public.can_manage_employees() THEN
    RAISE EXCEPTION 'Unauthorized: Only admins and owners can deactivate employees';
  END IF;
  
  -- Check if trying to deactivate self
  IF employee_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot deactivate your own account';
  END IF;
  
  -- Check if admin trying to deactivate owner
  IF EXISTS (
    SELECT 1 FROM public.profiles p1, public.profiles p2
    WHERE p1.id = auth.uid() AND p1.role = 'admin'
    AND p2.id = employee_id AND p2.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Admins cannot deactivate owners';
  END IF;
  
  -- Deactivate the employee
  UPDATE public.profiles 
  SET status = 'Tidak Aktif', updated_at = NOW()
  WHERE id = employee_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the deactivation function
GRANT EXECUTE ON FUNCTION public.deactivate_employee(UUID) TO authenticated;

-- Add trigger to update updated_at on profiles
CREATE OR REPLACE FUNCTION public.update_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at 
  BEFORE UPDATE ON public.profiles 
  FOR EACH ROW 
  EXECUTE FUNCTION public.update_profiles_updated_at();

-- Success message
SELECT 'RLS policies untuk profiles berhasil diperbaiki! DELETE policy sudah ditambahkan.' as status;