/**
 * Simple Auth Server for PostgREST
 * Provides JWT authentication compatible with Supabase Auth API format
 */

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.AUTH_PORT || 3002;

// JWT Secret - MUST match PostgREST jwt-secret
const JWT_SECRET = process.env.JWT_SECRET || 'c7ltcd4PN7uyaZJ/UoBbf71xdnHA3ezq7HYaaIvxizA=';
const JWT_EXPIRES_IN = '7d';

// PostgreSQL connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'aquavit_db',
  user: process.env.DB_USER || 'aquavit',
  password: process.env.DB_PASSWORD || 'Aquvit2024!',
});

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * POST /auth/v1/token?grant_type=password
 * Supabase-compatible login endpoint
 */
app.post('/auth/v1/token', async (req, res) => {
  const grantType = req.query.grant_type;

  if (grantType === 'password') {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Email and password are required'
      });
    }

    try {
      // Get user from profiles table
      const result = await pool.query(
        'SELECT id, email, full_name, role, password_hash FROM profiles WHERE email = $1',
        [email.toLowerCase()]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          error: 'invalid_grant',
          error_description: 'Invalid login credentials'
        });
      }

      const user = result.rows[0];

      // Verify password
      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({
          error: 'invalid_grant',
          error_description: 'Invalid login credentials'
        });
      }

      // Generate JWT token with user's actual role for RLS
      const token = jwt.sign(
        {
          sub: user.id,
          user_id: user.id, // For auth.uid()
          email: user.email,
          role: user.role, // User's actual role (owner, admin, etc) for RLS
          aud: 'authenticated',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days
        },
        Buffer.from(JWT_SECRET, 'base64'),
        { algorithm: 'HS256' }
      );

      // Return Supabase-compatible response
      return res.json({
        access_token: token,
        token_type: 'bearer',
        expires_in: 604800,
        refresh_token: token, // Simplified: same as access token
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          user_metadata: {
            full_name: user.full_name
          },
          app_metadata: {
            role: user.role
          }
        }
      });

    } catch (error) {
      console.error('Login error:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: 'Internal server error'
      });
    }
  }

  if (grantType === 'refresh_token') {
    const { refresh_token } = req.body;

    try {
      const decoded = jwt.verify(refresh_token, Buffer.from(JWT_SECRET, 'base64'));

      // Get fresh user data
      const result = await pool.query(
        'SELECT id, email, full_name, role FROM profiles WHERE id = $1',
        [decoded.sub]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          error: 'invalid_grant',
          error_description: 'User not found'
        });
      }

      const user = result.rows[0];

      // Generate new token with user's actual role for RLS
      const token = jwt.sign(
        {
          sub: user.id,
          user_id: user.id, // For auth.uid()
          email: user.email,
          role: user.role, // User's actual role (owner, admin, etc) for RLS
          aud: 'authenticated',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60),
        },
        Buffer.from(JWT_SECRET, 'base64'),
        { algorithm: 'HS256' }
      );

      return res.json({
        access_token: token,
        token_type: 'bearer',
        expires_in: 604800,
        refresh_token: token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          user_metadata: { full_name: user.full_name },
          app_metadata: { role: user.role }
        }
      });

    } catch (error) {
      return res.status(401).json({
        error: 'invalid_grant',
        error_description: 'Invalid refresh token'
      });
    }
  }

  return res.status(400).json({
    error: 'unsupported_grant_type',
    error_description: 'Only password and refresh_token grant types are supported'
  });
});

/**
 * GET /auth/v1/user
 * Get current user from token
 */
app.get('/auth/v1/user', async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'unauthorized',
      error_description: 'Missing or invalid authorization header'
    });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, Buffer.from(JWT_SECRET, 'base64'));

    const result = await pool.query(
      'SELECT id, email, full_name, role, created_at FROM profiles WHERE id = $1',
      [decoded.sub]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'not_found',
        error_description: 'User not found'
      });
    }

    const user = result.rows[0];

    return res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
      user_metadata: { full_name: user.full_name },
      app_metadata: { role: user.role }
    });

  } catch (error) {
    return res.status(401).json({
      error: 'invalid_token',
      error_description: 'Token is invalid or expired'
    });
  }
});

/**
 * POST /auth/v1/logout
 * Logout (just returns success, token invalidation handled client-side)
 */
app.post('/auth/v1/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

/**
 * POST /auth/v1/recover
 * Password recovery - for self-hosted, we just reset password directly
 * Since we don't have email service, admin resets password for user
 */
app.post('/auth/v1/recover', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'Email is required'
    });
  }

  try {
    // Check if user exists
    const result = await pool.query(
      'SELECT id, email, full_name FROM profiles WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      // Return success even if user doesn't exist (security best practice)
      return res.json({
        message: 'If the email exists, a password reset link has been sent'
      });
    }

    // In self-hosted version without email service,
    // we return success but password must be reset by admin
    return res.json({
      message: 'Password reset request received. Please contact admin to reset your password.'
    });

  } catch (error) {
    console.error('Password recovery error:', error);
    return res.status(500).json({
      error: 'server_error',
      error_description: 'Internal server error'
    });
  }
});

/**
 * PUT /auth/v1/user
 * Update user password (when user has reset token or admin updates)
 */
app.put('/auth/v1/user', async (req, res) => {
  const authHeader = req.headers.authorization;
  const { password } = req.body;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'unauthorized',
      error_description: 'Missing or invalid authorization header'
    });
  }

  if (!password) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'Password is required'
    });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, Buffer.from(JWT_SECRET, 'base64'));

    // Hash new password
    const password_hash = await bcrypt.hash(password, 10);

    // Update password
    await pool.query(
      'UPDATE profiles SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [password_hash, decoded.sub]
    );

    return res.json({
      message: 'Password updated successfully'
    });

  } catch (error) {
    console.error('Password update error:', error);
    return res.status(401).json({
      error: 'invalid_token',
      error_description: 'Token is invalid or expired'
    });
  }
});

/**
 * POST /auth/v1/admin/users/:id/reset-password
 * Admin reset password for specific user
 */
app.post('/auth/v1/admin/users/:id/reset-password', async (req, res) => {
  const authHeader = req.headers.authorization;
  const { id } = req.params;
  const { password } = req.body;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, Buffer.from(JWT_SECRET, 'base64'));

    // Check if requester is admin or owner
    const adminCheck = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [decoded.sub]
    );

    if (adminCheck.rows.length === 0 || (adminCheck.rows[0].role !== 'admin' && adminCheck.rows[0].role !== 'owner')) {
      return res.status(403).json({ error: 'forbidden', error_description: 'Admin or Owner access required' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    // Hash new password
    const password_hash = await bcrypt.hash(password, 10);

    // Update user's password
    const result = await pool.query(
      'UPDATE profiles SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, full_name',
      [password_hash, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      message: 'Password reset successfully',
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Admin reset password error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /auth/v1/admin/users
 * Create new user (admin or owner only)
 */
app.post('/auth/v1/admin/users', async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, Buffer.from(JWT_SECRET, 'base64'));

    // Check if user is admin or owner
    const adminCheck = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [decoded.sub]
    );

    if (adminCheck.rows.length === 0 || (adminCheck.rows[0].role !== 'admin' && adminCheck.rows[0].role !== 'owner')) {
      return res.status(403).json({ error: 'forbidden', error_description: 'Admin or Owner access required' });
    }

    const { email, password, full_name, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Generate UUID
    const id = require('crypto').randomUUID();

    // Get default branch_id (Kantor Pusat)
    const branchResult = await pool.query(
      "SELECT id FROM branches WHERE name = 'Kantor Pusat' LIMIT 1"
    );
    const defaultBranchId = branchResult.rows.length > 0 ? branchResult.rows[0].id : null;

    // Insert user - disable audit trigger to avoid auth.uid() issue
    await pool.query('ALTER TABLE profiles DISABLE TRIGGER audit_profiles_trigger');

    const result = await pool.query(
      `INSERT INTO profiles (id, email, password_hash, full_name, role, branch_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING id, email, full_name, role, branch_id, created_at`,
      [id, email.toLowerCase(), password_hash, full_name || email, role || 'user', defaultBranchId]
    );

    await pool.query('ALTER TABLE profiles ENABLE TRIGGER audit_profiles_trigger');

    return res.status(201).json({
      user: result.rows[0]
    });

  } catch (error) {
    // Re-enable trigger in case of error
    try {
      await pool.query('ALTER TABLE profiles ENABLE TRIGGER audit_profiles_trigger');
    } catch (e) {}

    if (error.code === '23505') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    console.error('Create user error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Auth server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
