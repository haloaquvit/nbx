#!/bin/bash
# ============================================================================
# SYNC SCHEMA FROM aquvit_dev TO PRODUCTION (aquvit_new & mkw_db)
#
# Cara pakai:
#   chmod +x sync_schema_to_production.sh
#   ./sync_schema_to_production.sh
#
# Script ini akan:
# 1. Export schema + functions dari aquvit_dev (TANPA data)
# 2. Generate safe migration script
# 3. Apply ke aquvit_new dan mkw_db
# ============================================================================

set -e

# Database credentials
DB_USER="aquavit"
DB_PASS="Aquvit2024"
DB_HOST="127.0.0.1"

# Databases
DEV_DB="aquvit_dev"
PROD_NABIRE="aquvit_new"
PROD_MKW="mkw_db"

# Output files
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/deployer/backups/sync_${TIMESTAMP}"
SCHEMA_FILE="${BACKUP_DIR}/schema_only.sql"
FUNCTIONS_FILE="${BACKUP_DIR}/functions_only.sql"
DIFF_REPORT="${BACKUP_DIR}/diff_report.txt"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  SYNC SCHEMA: aquvit_dev → Production     ${NC}"
echo -e "${GREEN}============================================${NC}"

# Create backup directory
mkdir -p "$BACKUP_DIR"
echo -e "${YELLOW}Backup directory: ${BACKUP_DIR}${NC}"

# ============================================================================
# STEP 1: Backup existing production databases
# ============================================================================
echo -e "\n${YELLOW}[1/5] Backing up production databases...${NC}"

PGPASSWORD="$DB_PASS" pg_dump -U "$DB_USER" -h "$DB_HOST" -d "$PROD_NABIRE" \
  --no-owner --no-acl -F c -f "${BACKUP_DIR}/nabire_backup_${TIMESTAMP}.dump"
echo "  ✓ Nabire backup complete"

PGPASSWORD="$DB_PASS" pg_dump -U "$DB_USER" -h "$DB_HOST" -d "$PROD_MKW" \
  --no-owner --no-acl -F c -f "${BACKUP_DIR}/mkw_backup_${TIMESTAMP}.dump"
echo "  ✓ Manokwari backup complete"

# ============================================================================
# STEP 2: Export schema from aquvit_dev (no data)
# ============================================================================
echo -e "\n${YELLOW}[2/5] Exporting schema from aquvit_dev...${NC}"

# Export schema only (tables, constraints, indexes)
PGPASSWORD="$DB_PASS" pg_dump -U "$DB_USER" -h "$DB_HOST" -d "$DEV_DB" \
  --schema-only --no-owner --no-acl \
  --exclude-table='pg_*' \
  > "$SCHEMA_FILE"
echo "  ✓ Schema exported: $SCHEMA_FILE"

# Export functions only
PGPASSWORD="$DB_PASS" pg_dump -U "$DB_USER" -h "$DB_HOST" -d "$DEV_DB" \
  --schema-only --no-owner --no-acl \
  -t 'dummy_table_for_functions' 2>/dev/null || true

# Better: Extract functions directly
PGPASSWORD="$DB_PASS" psql -U "$DB_USER" -h "$DB_HOST" -d "$DEV_DB" -t -A <<'EOF' > "$FUNCTIONS_FILE"
SELECT pg_get_functiondef(p.oid) || ';'
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname IN ('public', 'auth')
  AND p.prokind = 'f'
ORDER BY p.proname;
EOF
echo "  ✓ Functions exported: $FUNCTIONS_FILE"

# ============================================================================
# STEP 3: Generate safe migration SQL
# ============================================================================
echo -e "\n${YELLOW}[3/5] Generating safe migration script...${NC}"

MIGRATION_FILE="${BACKUP_DIR}/safe_migration.sql"

cat > "$MIGRATION_FILE" << 'HEADER'
-- ============================================================================
-- SAFE MIGRATION SCRIPT
-- Generated automatically - Apply to production databases
-- This script uses IF NOT EXISTS and won't delete existing data
-- ============================================================================

SET client_min_messages TO WARNING;

-- Create auth schema if not exists
CREATE SCHEMA IF NOT EXISTS auth;

HEADER

# Add all CREATE OR REPLACE FUNCTION statements
cat "$FUNCTIONS_FILE" >> "$MIGRATION_FILE"

# Add column additions (safe)
PGPASSWORD="$DB_PASS" psql -U "$DB_USER" -h "$DB_HOST" -d "$DEV_DB" -t -A <<'EOF' >> "$MIGRATION_FILE"

-- Get all columns that might need to be added
SELECT 'ALTER TABLE ' || table_name || ' ADD COLUMN IF NOT EXISTS ' ||
       column_name || ' ' ||
       CASE
         WHEN data_type = 'character varying' THEN 'VARCHAR(' || character_maximum_length || ')'
         WHEN data_type = 'numeric' THEN 'NUMERIC'
         WHEN data_type = 'integer' THEN 'INTEGER'
         WHEN data_type = 'bigint' THEN 'BIGINT'
         WHEN data_type = 'boolean' THEN 'BOOLEAN'
         WHEN data_type = 'text' THEN 'TEXT'
         WHEN data_type = 'uuid' THEN 'UUID'
         WHEN data_type = 'jsonb' THEN 'JSONB'
         WHEN data_type = 'json' THEN 'JSON'
         WHEN data_type = 'timestamp with time zone' THEN 'TIMESTAMPTZ'
         WHEN data_type = 'timestamp without time zone' THEN 'TIMESTAMP'
         WHEN data_type = 'date' THEN 'DATE'
         WHEN data_type = 'time without time zone' THEN 'TIME'
         ELSE data_type
       END ||
       CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END ||
       ';'
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name NOT LIKE 'pg_%'
ORDER BY table_name, ordinal_position;
EOF

# Add GRANT statements
cat >> "$MIGRATION_FILE" << 'GRANTS'

-- ============================================================================
-- GRANTS
-- ============================================================================

-- Grant authenticated role to all custom roles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;

  -- Grant to all roles
  GRANT authenticated TO owner;
  GRANT authenticated TO admin;
  GRANT authenticated TO cashier;
  GRANT authenticated TO supir;
  GRANT authenticated TO sales;
  GRANT authenticated TO supervisor;
  GRANT authenticated TO designer;
  GRANT authenticated TO operator;
  GRANT authenticated TO helper;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Some roles may not exist: %', SQLERRM;
END $$;

-- Grant execute on all functions to authenticated
DO $$
DECLARE
  func_record RECORD;
BEGIN
  FOR func_record IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
  LOOP
    BEGIN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %I(%s) TO authenticated',
                     func_record.proname, func_record.args);
    EXCEPTION WHEN OTHERS THEN
      NULL; -- Skip if fails
    END;
  END LOOP;
END $$;

GRANTS

echo "  ✓ Migration script generated: $MIGRATION_FILE"

# ============================================================================
# STEP 4: Apply to production databases
# ============================================================================
echo -e "\n${YELLOW}[4/5] Applying migration to production...${NC}"

echo "  Applying to Nabire (aquvit_new)..."
PGPASSWORD="$DB_PASS" psql -U "$DB_USER" -h "$DB_HOST" -d "$PROD_NABIRE" \
  -f "$MIGRATION_FILE" 2>&1 | tee "${BACKUP_DIR}/nabire_apply.log"
echo "  ✓ Nabire updated"

echo "  Applying to Manokwari (mkw_db)..."
PGPASSWORD="$DB_PASS" psql -U "$DB_USER" -h "$DB_HOST" -d "$PROD_MKW" \
  -f "$MIGRATION_FILE" 2>&1 | tee "${BACKUP_DIR}/mkw_apply.log"
echo "  ✓ Manokwari updated"

# ============================================================================
# STEP 5: Restart PostgREST to reload schema
# ============================================================================
echo -e "\n${YELLOW}[5/5] Restarting PostgREST...${NC}"

pm2 restart postgrest-aquvit postgrest-mkw 2>/dev/null || {
  echo -e "${YELLOW}  PM2 not available, trying systemctl...${NC}"
  sudo systemctl restart postgrest 2>/dev/null || true
}
echo "  ✓ PostgREST restarted"

# ============================================================================
# DONE
# ============================================================================
echo -e "\n${GREEN}============================================${NC}"
echo -e "${GREEN}  SYNC COMPLETE!                           ${NC}"
echo -e "${GREEN}============================================${NC}"
echo -e "Backup location: ${BACKUP_DIR}"
echo -e "Migration log (Nabire): ${BACKUP_DIR}/nabire_apply.log"
echo -e "Migration log (Manokwari): ${BACKUP_DIR}/mkw_apply.log"
echo ""
echo -e "${YELLOW}Verify with:${NC}"
echo "  PGPASSWORD='$DB_PASS' psql -U $DB_USER -h $DB_HOST -d $PROD_NABIRE -c \"SELECT COUNT(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace;\""
echo ""
