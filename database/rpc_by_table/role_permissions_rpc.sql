-- =====================================================
-- RPC Functions for table: role_permissions
-- Generated: 2026-01-08T22:26:17.733Z
-- Total functions: 2
-- =====================================================

-- Function: has_perm
CREATE OR REPLACE FUNCTION public.has_perm(perm_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    jwt_role TEXT;
    perms JSONB;
BEGIN
    -- Get role from JWT claims
    BEGIN
        jwt_role := current_setting('request.jwt.claims', true)::json->>'role';
    EXCEPTION WHEN OTHERS THEN
        jwt_role := NULL;
    END;
    -- No JWT role = deny
    IF jwt_role IS NULL OR jwt_role = '' THEN
        RETURN false;
    END IF;
    -- Owner always has all permissions
    IF jwt_role = 'owner' THEN
        RETURN true;
    END IF;
    -- Get permissions from role_permissions table
    SELECT permissions INTO perms
    FROM role_permissions
    WHERE role_id = jwt_role;
    -- If no permissions found for role, allow basic access (authenticated)
    IF perms IS NULL THEN
        RETURN true;  -- Allow authenticated users with unknown roles
    END IF;
    -- Check 'all' permission first
    IF (perms->>'all')::boolean = true THEN
        RETURN true;
    END IF;
    -- Check specific permission
    RETURN COALESCE((perms->>perm_name)::boolean, false);
END;
$function$
;


-- Function: has_permission
CREATE OR REPLACE FUNCTION public.has_permission(permission_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
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
$function$
;


