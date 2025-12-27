-- Create active_sessions table for single session enforcement
-- When user logs in, old sessions are invalidated

CREATE TABLE IF NOT EXISTS active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_token VARCHAR(64) NOT NULL UNIQUE,
  device_info TEXT,
  ip_address VARCHAR(45),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Only ONE active session per user
  CONSTRAINT unique_user_session UNIQUE (user_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_active_sessions_user_id ON active_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_token ON active_sessions(session_token);

-- Grant permissions
GRANT ALL ON active_sessions TO aquavit;
