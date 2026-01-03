-- Migration 009: PIN per User
-- Purpose: Move PIN from company_settings to individual profiles
-- Date: 2026-01-03

-- Add pin column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pin TEXT;

-- Create index for fast PIN lookup
CREATE INDEX IF NOT EXISTS idx_profiles_pin ON profiles(id) WHERE pin IS NOT NULL;

-- Optional: Migrate existing owner PIN to the first owner user
-- This preserves existing PIN for the owner
DO $$
DECLARE
  v_existing_pin TEXT;
  v_owner_id UUID;
BEGIN
  -- Get existing owner PIN from company_settings
  SELECT value INTO v_existing_pin
  FROM company_settings
  WHERE key = 'owner_pin'
  LIMIT 1;

  -- If there's an existing PIN, migrate it to the first owner user
  IF v_existing_pin IS NOT NULL AND v_existing_pin != '' THEN
    -- Find the first owner user
    SELECT id INTO v_owner_id
    FROM profiles
    WHERE LOWER(role) = 'owner'
    ORDER BY created_at ASC
    LIMIT 1;

    -- Update the owner's PIN
    IF v_owner_id IS NOT NULL THEN
      UPDATE profiles
      SET pin = v_existing_pin
      WHERE id = v_owner_id;

      RAISE NOTICE 'Migrated PIN to owner user: %', v_owner_id;
    END IF;
  END IF;
END
$$;

-- Comment on the new column
COMMENT ON COLUMN profiles.pin IS 'User PIN for idle session validation (4-6 digits). If NULL, PIN validation is bypassed for this user.';

-- Grant permissions
GRANT SELECT (pin) ON profiles TO authenticated;
GRANT UPDATE (pin) ON profiles TO authenticated;
