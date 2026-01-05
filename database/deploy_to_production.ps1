# ============================================================================
# DEPLOY TO PRODUCTION - PowerShell Script (Windows)
#
# Cara pakai:
#   cd "d:\App\Aquvit Fix - Copy"
#   .\database\deploy_to_production.ps1
#
# Script ini akan:
# 1. Upload schema sync + RPC files ke VPS
# 2. Apply ke aquvit_new (Nabire) dan mkw_db (Manokwari)
# 3. Restart PostgREST
# ============================================================================

$ErrorActionPreference = "Stop"

# Config
$VPS_IP = "103.197.190.54"
$VPS_USER = "deployer"
$PEM_FILE = "Aquvit.pem"
$REMOTE_DIR = "/home/deployer/sync_deploy"

$DB_USER = "aquavit"
$DB_PASS = "Aquvit2024"
$DB_HOST = "127.0.0.1"

$PROD_NABIRE = "aquvit_new"
$PROD_MKW = "mkw_db"

Write-Host "============================================" -ForegroundColor Green
Write-Host "  DEPLOY TO PRODUCTION                     " -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green

# Check PEM file exists
if (-not (Test-Path $PEM_FILE)) {
    Write-Host "ERROR: PEM file not found: $PEM_FILE" -ForegroundColor Red
    exit 1
}

# Create remote directory
Write-Host "`n[1/4] Creating remote directory..." -ForegroundColor Yellow
ssh -i $PEM_FILE "${VPS_USER}@${VPS_IP}" "mkdir -p $REMOTE_DIR"

# Upload files
Write-Host "`n[2/4] Uploading files to VPS..." -ForegroundColor Yellow
scp -i $PEM_FILE "database\sync_to_production.sql" "${VPS_USER}@${VPS_IP}:${REMOTE_DIR}/"
scp -i $PEM_FILE "database\rpc\*.sql" "${VPS_USER}@${VPS_IP}:${REMOTE_DIR}/rpc/"
Write-Host "  ✓ Files uploaded" -ForegroundColor Green

# Apply to production
Write-Host "`n[3/4] Applying to production databases..." -ForegroundColor Yellow

# Apply schema sync
$schema_cmd = @"
cd $REMOTE_DIR

echo '>>> Applying schema to Nabire...'
PGPASSWORD='$DB_PASS' psql -U $DB_USER -h $DB_HOST -d $PROD_NABIRE -f sync_to_production.sql

echo '>>> Applying schema to Manokwari...'
PGPASSWORD='$DB_PASS' psql -U $DB_USER -h $DB_HOST -d $PROD_MKW -f sync_to_production.sql

echo '>>> Applying RPC functions...'
for f in rpc/*.sql; do
    echo "  -> \$f"
    PGPASSWORD='$DB_PASS' psql -U $DB_USER -h $DB_HOST -d $PROD_NABIRE -f "\$f" 2>&1 | grep -E '(ERROR|CREATE|REPLACE)' || true
    PGPASSWORD='$DB_PASS' psql -U $DB_USER -h $DB_HOST -d $PROD_MKW -f "\$f" 2>&1 | grep -E '(ERROR|CREATE|REPLACE)' || true
done
"@

ssh -i $PEM_FILE "${VPS_USER}@${VPS_IP}" $schema_cmd

Write-Host "  ✓ Schema and RPC applied" -ForegroundColor Green

# Restart PostgREST
Write-Host "`n[4/4] Restarting PostgREST..." -ForegroundColor Yellow
ssh -i $PEM_FILE "${VPS_USER}@${VPS_IP}" "pm2 restart postgrest-aquvit postgrest-mkw"
Write-Host "  ✓ PostgREST restarted" -ForegroundColor Green

# Done
Write-Host "`n============================================" -ForegroundColor Green
Write-Host "  DEPLOYMENT COMPLETE!                     " -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "Verify: https://nabire.aquvit.id/rest/v1/"
Write-Host "Verify: https://mkw.aquvit.id/rest/v1/"
