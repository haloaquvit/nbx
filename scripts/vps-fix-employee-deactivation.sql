-- ============================================================================
-- FIX EMPLOYEE DEACTIVATION
-- Run this on VPS PostgreSQL: psql -U aquavit -d aquavit_db -f vps-fix-employee-deactivation.sql
-- ============================================================================

-- 1. Check and drop problematic triggers that may cause JSON parsing
DROP TRIGGER IF EXISTS trigger_sync_profile_name ON profiles;
DROP TRIGGER IF EXISTS on_auth_user_created ON profiles;
DROP FUNCTION IF EXISTS sync_profile_name() CASCADE;

-- 2. Drop 'name' column entirely if it causes problems (it's a generated column)
DO $$
BEGIN
    -- Check if name column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles'
        AND column_name = 'name'
    ) THEN
        ALTER TABLE profiles DROP COLUMN name;
        RAISE NOTICE 'Dropped column "name" from profiles';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error dropping name column: %', SQLERRM;
END $$;

-- 3. Drop and recreate deactivate_employee function with correct parameter
DROP FUNCTION IF EXISTS public.deactivate_employee(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.deactivate_employee(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.deactivate_employee(JSON) CASCADE;
DROP FUNCTION IF EXISTS public.deactivate_employee(JSONB) CASCADE;

CREATE OR REPLACE FUNCTION public.deactivate_employee(employee_id UUID)
RETURNS JSONB AS $$
BEGIN
    -- Update the profile status to 'Tidak Aktif'
    UPDATE profiles
    SET status = 'Tidak Aktif',
        updated_at = NOW()
    WHERE id = employee_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Employee not found'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Employee deactivated successfully'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.deactivate_employee(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_employee(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.deactivate_employee(UUID) TO aquavit;

-- 4. Check for any triggers on profiles that could be causing issues
SELECT tgname, tgtype, tgenabled, pg_get_triggerdef(oid) as definition
FROM pg_trigger
WHERE tgrelid = 'profiles'::regclass;

SELECT 'Employee deactivation fix completed!' as status;
