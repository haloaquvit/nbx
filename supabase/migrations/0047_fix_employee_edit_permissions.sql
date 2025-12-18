-- =====================================================
-- FIX EMPLOYEE EDIT PERMISSIONS FOR OWNER AND ADMIN
-- =====================================================

-- Drop existing policies on profiles table
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- Ensure get_current_user_role function exists and works correctly
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT AS $$
BEGIN
  RETURN (
    SELECT role 
    FROM public.profiles 
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure is_owner function exists
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'owner'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure is_admin function exists
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'owner')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- NEW PROFILES POLICIES - SIMPLIFIED AND CLEAR
-- =====================================================

-- Policy 1: Users can view their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
FOR SELECT USING (id = auth.uid());

-- Policy 2: Admin and Owner can view all profiles
CREATE POLICY "Admin can view all profiles" ON public.profiles
FOR SELECT USING (public.is_admin());

-- Policy 3: Users can update their own basic profile info (not role)
CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE USING (
  id = auth.uid()
) WITH CHECK (
  id = auth.uid() AND
  -- Prevent users from changing their own role
  (role IS NULL OR role = (SELECT role FROM public.profiles WHERE id = auth.uid()))
);

-- Policy 4: Admin and Owner can update any profile including roles
CREATE POLICY "Admin can update all profiles" ON public.profiles
FOR UPDATE USING (
  public.is_admin()
) WITH CHECK (
  public.is_admin()
);

-- Policy 5: Admin and Owner can insert new profiles
CREATE POLICY "Admin can insert profiles" ON public.profiles
FOR INSERT WITH CHECK (public.is_admin());

-- Policy 6: Only Owner can delete profiles (safety measure)
CREATE POLICY "Owner can delete profiles" ON public.profiles
FOR DELETE USING (public.is_owner());

-- =====================================================
-- GRANT NECESSARY PERMISSIONS
-- =====================================================

-- Ensure authenticated users can access profiles table
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT DELETE ON public.profiles TO authenticated;

-- Ensure the functions can be called by authenticated users
GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;