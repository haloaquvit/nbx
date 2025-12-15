-- ============================================
-- AQUAVIT DATABASE SCHEMA - CONSOLIDATED
-- Generated: 2025-12-15
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- This file consolidates all migrations in order
-- Run this on a fresh PostgreSQL database to create the complete schema

\echo 'Starting database setup...'
\echo ''

-- Set timezone
SET timezone = 'Asia/Jakarta';
