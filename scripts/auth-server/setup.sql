-- Add password_hash column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Create index for email lookup
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Create default admin user (password: admin123)
-- bcrypt hash for 'admin123'
INSERT INTO profiles (id, email, password_hash, full_name, role, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'admin@aquvit.com',
  '$2a$10$rQnM1vYH8rJV6sMjXzPJxOqK5hPE1mS5k8tR1B2mH0LM6.1Rq4wPK',
  'Administrator',
  'admin',
  NOW(),
  NOW()
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  updated_at = NOW();

-- Grant permissions
GRANT ALL ON profiles TO aquavit;
