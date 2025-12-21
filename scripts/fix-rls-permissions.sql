-- Fix RLS permissions to work with JWT auth

-- Update has_permission to handle JWT role properly
CREATE OR REPLACE FUNCTION public.has_permission(permission_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
    permissions JSONB;
BEGIN
    user_role := auth.role();

    -- If no role or anon, check if there's a valid user_id (authenticated)
    IF user_role IS NULL OR user_role = 'anon' THEN
        -- Check if user is authenticated via auth.uid()
        IF auth.uid() IS NOT NULL THEN
            -- Get role from profiles table
            SELECT role INTO user_role FROM profiles WHERE id = auth.uid();
        END IF;

        -- Still no role? deny access
        IF user_role IS NULL OR user_role = 'anon' THEN
            RETURN false;
        END IF;
    END IF;

    -- Get permissions from role_permissions table
    SELECT rp.permissions INTO permissions
    FROM role_permissions rp
    WHERE rp.role_id = user_role;

    -- If role not found in role_permissions, fallback to roles table
    IF permissions IS NULL THEN
        SELECT r.permissions INTO permissions
        FROM roles r
        WHERE r.name = user_role AND r.is_active = true;
    END IF;

    -- No permissions found, but owner/admin should have access
    IF permissions IS NULL THEN
        IF user_role IN ('owner', 'admin', 'super_admin', 'head_office_admin') THEN
            RETURN true;
        END IF;
        RETURN false;
    END IF;

    -- Check 'all' permission (owner-level access)
    IF (permissions->>'all')::boolean = true THEN
        RETURN true;
    END IF;

    -- Check specific permission
    RETURN COALESCE((permissions->>permission_name)::boolean, false);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Also update is_authenticated to be more lenient
CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    -- Check if there's a valid user_id
    IF auth.uid() IS NOT NULL THEN
        RETURN true;
    END IF;

    -- Or if role is not anon
    user_role := auth.role();
    RETURN user_role IS NOT NULL AND user_role != 'anon';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

SELECT 'Permissions fixed!' as status;
