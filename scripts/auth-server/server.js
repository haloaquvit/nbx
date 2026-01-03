/**
 * Simple Auth Server for PostgREST
 * Provides JWT authentication compatible with Supabase Auth API format
 */

// Load .env file FIRST (for local development)
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.AUTH_PORT || 3002;

// JWT Secret - MUST match PostgREST jwt-secret
const JWT_SECRET = process.env.JWT_SECRET || 'c7ltcd4PN7uyaZJ/UoBbf71xdnHA3ezq7HYaaIvxizA=';
const JWT_EXPIRES_IN = '7d';

// Generate unique session token
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// PostgreSQL connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'aquvit_db',
  user: process.env.DB_USER || 'aquavit',
  password: process.env.DB_PASSWORD || 'Aquvit2024',
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
      // Get user from profiles table (including password_changed_at for token invalidation)
      const result = await pool.query(
        'SELECT id, email, full_name, role, password_hash, password_changed_at FROM profiles WHERE email = $1',
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

      // Get password_changed_at timestamp for token invalidation
      const pca = user.password_changed_at ? Math.floor(new Date(user.password_changed_at).getTime() / 1000) : 0;

      // DISABLED: Single session enforcement (tabrak auth)
      // Users can now login from multiple devices simultaneously
      // const sessionToken = generateSessionToken();
      // await pool.query('DELETE FROM active_sessions WHERE user_id = $1', [user.id]);
      // await pool.query(`INSERT INTO active_sessions ...`);

      // Generate JWT token (without session enforcement)
      const token = jwt.sign(
        {
          sub: user.id,
          user_id: user.id, // For auth.uid()
          email: user.email,
          role: user.role, // User's actual role (owner, admin, etc) for RLS
          aud: 'authenticated',
          pca: pca, // password_changed_at - for token invalidation on password reset
          // sid removed - no longer using single session enforcement
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
        // session_token removed - no longer using single session enforcement
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

      // Get fresh user data including password_changed_at
      const result = await pool.query(
        'SELECT id, email, full_name, role, password_changed_at FROM profiles WHERE id = $1',
        [decoded.sub]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          error: 'invalid_grant',
          error_description: 'User not found'
        });
      }

      const user = result.rows[0];

      // Check if password was changed after token was issued (token invalidation)
      const currentPca = user.password_changed_at ? Math.floor(new Date(user.password_changed_at).getTime() / 1000) : 0;
      const tokenPca = decoded.pca || 0;

      if (currentPca > tokenPca) {
        return res.status(401).json({
          error: 'invalid_grant',
          error_description: 'Password was changed. Please login again.'
        });
      }

      // Generate new token with user's actual role for RLS
      const token = jwt.sign(
        {
          sub: user.id,
          user_id: user.id, // For auth.uid()
          email: user.email,
          role: user.role, // User's actual role (owner, admin, etc) for RLS
          aud: 'authenticated',
          pca: currentPca, // password_changed_at - for token invalidation
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
      'SELECT id, email, full_name, role, created_at, password_changed_at FROM profiles WHERE id = $1',
      [decoded.sub]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'not_found',
        error_description: 'User not found'
      });
    }

    const user = result.rows[0];

    // Check if password was changed after token was issued (token invalidation)
    const currentPca = user.password_changed_at ? Math.floor(new Date(user.password_changed_at).getTime() / 1000) : 0;
    const tokenPca = decoded.pca || 0;

    if (currentPca > tokenPca) {
      return res.status(401).json({
        error: 'token_invalidated',
        error_description: 'Password was changed. Please login again.'
      });
    }

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
 * Logout - just acknowledge (no more active_sessions to clean up)
 */
app.post('/auth/v1/logout', async (req, res) => {
  // No more active_sessions cleanup needed since single session enforcement is disabled
  res.json({ message: 'Logged out successfully' });
});

/**
 * GET /auth/v1/session/validate
 * DISABLED: Single session enforcement removed
 * Now just validates if token is still valid (not expired, password not changed)
 */
app.get('/auth/v1/session/validate', async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      valid: false,
      error: 'unauthorized',
      error_description: 'Missing authorization header'
    });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, Buffer.from(JWT_SECRET, 'base64'));

    // Check if password was changed after token was issued
    const result = await pool.query(
      'SELECT password_changed_at FROM profiles WHERE id = $1',
      [decoded.sub]
    );

    if (result.rows.length > 0) {
      const currentPca = result.rows[0].password_changed_at
        ? Math.floor(new Date(result.rows[0].password_changed_at).getTime() / 1000)
        : 0;
      const tokenPca = decoded.pca || 0;

      if (currentPca > tokenPca) {
        return res.json({
          valid: false,
          error: 'password_changed',
          error_description: 'Password telah diubah. Silakan login kembali.'
        });
      }
    }

    // Token is valid - no more single session enforcement
    return res.json({ valid: true });

  } catch (error) {
    return res.json({
      valid: false,
      error: 'invalid_token',
      error_description: 'Token is invalid or expired'
    });
  }
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

    // Update password AND password_changed_at to invalidate all other sessions
    await pool.query(
      'UPDATE profiles SET password_hash = $1, password_changed_at = NOW(), updated_at = NOW() WHERE id = $2',
      [password_hash, decoded.sub]
    );

    return res.json({
      message: 'Password updated successfully. Please login again with your new password.'
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

    // Update user's password AND password_changed_at to invalidate all existing tokens
    const result = await pool.query(
      'UPDATE profiles SET password_hash = $1, password_changed_at = NOW(), updated_at = NOW() WHERE id = $2 RETURNING id, email, full_name',
      [password_hash, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      message: 'Password reset successfully. All existing sessions have been invalidated.',
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

    // Insert user directly (no audit trigger in aquvit_new database)
    const result = await pool.query(
      `INSERT INTO profiles (id, email, password_hash, full_name, role, branch_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING id, email, full_name, role, branch_id, created_at`,
      [id, email.toLowerCase(), password_hash, full_name || email, role || 'user', defaultBranchId]
    );

    return res.status(201).json({
      user: result.rows[0]
    });

  } catch (error) {

    if (error.code === '23505') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    console.error('Create user error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /auth/v1/admin/backup
 * Create full database backup (pg_dump) - Owner only
 * Returns backup metadata
 */
app.post('/auth/v1/admin/backup', async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, Buffer.from(JWT_SECRET, 'base64'));

    // Check if user is owner
    const ownerCheck = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [decoded.sub]
    );

    if (ownerCheck.rows.length === 0 || ownerCheck.rows[0].role !== 'owner') {
      return res.status(403).json({ error: 'forbidden', error_description: 'Owner access required' });
    }

    // Execute pg_dump
    const { execSync } = require('child_process');
    const fs = require('fs');
    const path = require('path');

    const backupDir = '/home/deployer/backups';
    const dbName = process.env.DB_NAME || 'aquvit_db';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `${dbName}_full_${timestamp}.sql`);

    // Ensure backup directory exists
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Run pg_dump
    execSync(`sudo -u postgres pg_dump ${dbName} > ${backupFile}`, { encoding: 'utf-8' });

    // Compress the backup
    execSync(`gzip ${backupFile}`, { encoding: 'utf-8' });

    const compressedFile = `${backupFile}.gz`;
    const stats = fs.statSync(compressedFile);

    // Clean old backups (older than 7 days)
    execSync(`find ${backupDir} -name "*.gz" -mtime +7 -delete`, { encoding: 'utf-8' });

    return res.json({
      success: true,
      message: 'Backup created successfully',
      backup: {
        filename: path.basename(compressedFile),
        path: compressedFile,
        size: stats.size,
        sizeFormatted: formatBytes(stats.size),
        createdAt: new Date().toISOString(),
        database: dbName
      }
    });

  } catch (error) {
    console.error('Backup error:', error);
    return res.status(500).json({
      error: 'backup_failed',
      error_description: error.message || 'Failed to create backup'
    });
  }
});

/**
 * GET /auth/v1/admin/backups
 * List all available backups - Owner only
 */
app.get('/auth/v1/admin/backups', async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, Buffer.from(JWT_SECRET, 'base64'));

    // Check if user is owner
    const ownerCheck = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [decoded.sub]
    );

    if (ownerCheck.rows.length === 0 || ownerCheck.rows[0].role !== 'owner') {
      return res.status(403).json({ error: 'forbidden', error_description: 'Owner access required' });
    }

    const fs = require('fs');
    const path = require('path');
    const backupDir = '/home/deployer/backups';

    if (!fs.existsSync(backupDir)) {
      return res.json({ backups: [] });
    }

    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.gz'))
      .map(filename => {
        const filePath = path.join(backupDir, filename);
        const stats = fs.statSync(filePath);
        return {
          filename,
          path: filePath,
          size: stats.size,
          sizeFormatted: formatBytes(stats.size),
          createdAt: stats.mtime.toISOString()
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return res.json({ backups: files });

  } catch (error) {
    console.error('List backups error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /auth/v1/admin/backup/download/:filename
 * Download a specific backup file - Owner only
 */
app.get('/auth/v1/admin/backup/download/:filename', async (req, res) => {
  const authHeader = req.headers.authorization;
  const { filename } = req.params;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, Buffer.from(JWT_SECRET, 'base64'));

    // Check if user is owner
    const ownerCheck = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [decoded.sub]
    );

    if (ownerCheck.rows.length === 0 || ownerCheck.rows[0].role !== 'owner') {
      return res.status(403).json({ error: 'forbidden', error_description: 'Owner access required' });
    }

    const fs = require('fs');
    const path = require('path');
    const backupDir = '/home/deployer/backups';
    const filePath = path.join(backupDir, filename);

    // Security check - prevent path traversal
    if (!filePath.startsWith(backupDir)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Backup file not found' });
    }

    res.download(filePath, filename);

  } catch (error) {
    console.error('Download backup error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /auth/v1/admin/backup/:filename
 * Delete a specific backup file - Owner only
 */
app.delete('/auth/v1/admin/backup/:filename', async (req, res) => {
  const authHeader = req.headers.authorization;
  const { filename } = req.params;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, Buffer.from(JWT_SECRET, 'base64'));

    // Check if user is owner
    const ownerCheck = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [decoded.sub]
    );

    if (ownerCheck.rows.length === 0 || ownerCheck.rows[0].role !== 'owner') {
      return res.status(403).json({ error: 'forbidden', error_description: 'Owner access required' });
    }

    const fs = require('fs');
    const path = require('path');
    const backupDir = '/home/deployer/backups';
    const filePath = path.join(backupDir, filename);

    // Security check - prevent path traversal
    if (!filePath.startsWith(backupDir)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Backup file not found' });
    }

    fs.unlinkSync(filePath);

    return res.json({ success: true, message: 'Backup deleted successfully' });

  } catch (error) {
    console.error('Delete backup error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to format bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Initialize default data if tables are empty
 * Called once when server starts
 */
async function initializeDefaults() {
  const crypto = require('crypto');

  try {
    console.log('[Init] Checking for default data...');

    // 1. Check and create default branch
    const branchCount = await pool.query('SELECT COUNT(*) FROM branches');
    if (parseInt(branchCount.rows[0].count) === 0) {
      const branchId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO branches (id, name, address, phone, is_main, created_at, updated_at)
         VALUES ($1, 'Kantor Pusat', 'Alamat Kantor Pusat', '-', true, NOW(), NOW())`,
        [branchId]
      );
      console.log('[Init] ✓ Created default branch: Kantor Pusat');
    }

    // 2. Check and create default roles (7 system roles)
    const roleCount = await pool.query('SELECT COUNT(*) FROM roles');
    if (parseInt(roleCount.rows[0].count) === 0) {
      const defaultRoles = [
        { name: 'owner', display_name: 'Owner', description: 'Pemilik perusahaan dengan akses penuh', permissions: { all: true } },
        { name: 'admin', display_name: 'Administrator', description: 'Administrator sistem dengan akses luas', permissions: { manage_users: true, manage_products: true, manage_transactions: true, manage_customers: true, manage_materials: true, manage_finances: true, view_reports: true, manage_settings: true } },
        { name: 'supervisor', display_name: 'Supervisor', description: 'Supervisor operasional', permissions: { view_products: true, manage_products: true, view_transactions: true, manage_transactions: true, view_customers: true, view_materials: true, view_production: true, update_production: true } },
        { name: 'cashier', display_name: 'Kasir', description: 'Kasir untuk transaksi penjualan', permissions: { pos_access: true, view_products: true, manage_transactions: true, create_transactions: true, view_customers: true, create_customers: true } },
        { name: 'designer', display_name: 'Desainer', description: 'Desainer produk dan quotation', permissions: { view_products: true, edit_products: true, view_materials: true, create_quotations: true, edit_quotations: true, view_production: true } },
        { name: 'operator', display_name: 'Operator', description: 'Operator produksi', permissions: { view_products: true, view_materials: true, view_production: true, update_production: true, attendance_access: true } },
        { name: 'supir', display_name: 'Supir', description: 'Supir pengantaran', permissions: { delivery_view: true, delivery_create: true, delivery_edit: true, retasi_view: true, retasi_create: true, attendance_access: true, pos_driver_access: true } }
      ];

      for (const role of defaultRoles) {
        const roleId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO roles (id, name, display_name, description, permissions, is_system_role, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, true, true, NOW(), NOW())`,
          [roleId, role.name, role.display_name, role.description, JSON.stringify(role.permissions)]
        );
      }
      console.log('[Init] ✓ Created 7 system roles');
    }

    // 3. Check and create role_permissions (granular permissions per role)
    const rolePermCount = await pool.query('SELECT COUNT(*) FROM role_permissions');
    if (parseInt(rolePermCount.rows[0].count) === 0) {
      const rolePermissions = [
        { role_id: 'owner', permissions: { all: true } },
        { role_id: 'admin', permissions: { manage_users: true, create_users: true, edit_users: true, delete_users: true, view_users: true, manage_products: true, create_products: true, edit_products: true, delete_products: true, view_products: true, manage_transactions: true, create_transactions: true, edit_transactions: true, delete_transactions: true, view_transactions: true, manage_customers: true, create_customers: true, edit_customers: true, delete_customers: true, view_customers: true, manage_materials: true, view_materials: true, manage_finances: true, view_reports: true, manage_settings: true, pos_access: true } },
        { role_id: 'supervisor', permissions: { view_products: true, manage_products: true, view_transactions: true, manage_transactions: true, view_customers: true, manage_customers: true, view_materials: true, view_production: true, update_production: true, view_reports: true, pos_access: true, attendance_access: true, attendance_view: true } },
        { role_id: 'cashier', permissions: { pos_access: true, view_products: true, manage_transactions: true, create_transactions: true, edit_transactions: true, view_transactions: true, view_customers: true, create_customers: true, edit_customers: true, attendance_access: true, attendance_view: true, attendance_create: true } },
        { role_id: 'designer', permissions: { view_products: true, edit_products: true, create_products: true, view_materials: true, create_quotations: true, edit_quotations: true, view_quotations: true, view_production: true, attendance_access: true, attendance_view: true, attendance_create: true } },
        { role_id: 'operator', permissions: { view_products: true, view_materials: true, view_production: true, update_production: true, attendance_access: true, attendance_view: true, attendance_create: true } },
        { role_id: 'supir', permissions: { delivery_view: true, delivery_create: true, delivery_edit: true, retasi_view: true, retasi_create: true, retasi_edit: true, attendance_access: true, attendance_view: true, attendance_create: true, pos_driver_access: true } }
      ];

      for (const rp of rolePermissions) {
        const rpId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO role_permissions (id, role_id, permissions, created_at, updated_at)
           VALUES ($1, $2, $3, NOW(), NOW())`,
          [rpId, rp.role_id, JSON.stringify(rp.permissions)]
        );
      }
      console.log('[Init] ✓ Created role permissions for 7 roles');
    }

    // 4. Check and create company_settings
    const settingsCount = await pool.query('SELECT COUNT(*) FROM company_settings');
    if (parseInt(settingsCount.rows[0].count) === 0) {
      const defaultSettings = [
        { key: 'company_name', value: 'PT. Aquvit' },
        { key: 'company_address', value: '-' },
        { key: 'company_phone', value: '-' },
        { key: 'company_logo', value: '' },
        { key: 'company_latitude', value: '-0.87143' },
        { key: 'company_longitude', value: '134.04606' },
        { key: 'company_attendance_radius', value: '50' },
        { key: 'company_timezone', value: 'Asia/Jayapura' }
      ];

      for (const setting of defaultSettings) {
        const settingId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO company_settings (id, key, value, created_at, updated_at)
           VALUES ($1, $2, $3, NOW(), NOW())`,
          [settingId, setting.key, setting.value]
        );
      }
      console.log('[Init] ✓ Created 8 company settings');
    }

    // 5. Check and create default admin profile
    const profileCount = await pool.query('SELECT COUNT(*) FROM profiles');
    if (parseInt(profileCount.rows[0].count) === 0) {
      const adminId = crypto.randomUUID();
      const passwordHash = await bcrypt.hash('admin', 10);

      // Get default branch
      const branch = await pool.query("SELECT id FROM branches WHERE name = 'Kantor Pusat' LIMIT 1");
      const branchId = branch.rows.length > 0 ? branch.rows[0].id : null;

      await pool.query(
        `INSERT INTO profiles (id, email, password_hash, full_name, role, branch_id, created_at, updated_at)
         VALUES ($1, 'admin', $2, 'Administrator', 'owner', $3, NOW(), NOW())`,
        [adminId, passwordHash, branchId]
      );
      console.log('[Init] ✓ Created default admin (email: admin, password: admin, role: owner)');
    }

    console.log('[Init] ✅ Default data initialization complete');
  } catch (error) {
    console.error('[Init] Error initializing defaults:', error.message);
    // Don't crash server if init fails - just log and continue
  }
}

// Initialize defaults then start server
initializeDefaults().then(() => {
  app.listen(PORT, () => {
    console.log(`Auth server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });
});
