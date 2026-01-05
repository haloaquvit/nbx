#!/bin/bash
# ============================================================================
# FULL DEPLOY: aquvit_dev → Production
#
# Jalankan di VPS setelah upload semua file:
#   cd /home/deployer/deploy
#   chmod +x deploy_full.sh
#   ./deploy_full.sh
# ============================================================================

set -e

DB_USER="aquavit"
DB_PASS="Aquvit2024"
DB_HOST="127.0.0.1"

PROD_NABIRE="aquvit_new"
PROD_MKW="mkw_db"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  FULL DEPLOY TO PRODUCTION               ${NC}"
echo -e "${CYAN}============================================${NC}"

# RPC files in correct order (dependencies first)
RPC_FILES=(
  "00_permission_checker.sql"
  "01_fifo_inventory.sql"
  "02_fifo_material.sql"
  "03_journal.sql"
  "04_production.sql"
  "05_delivery.sql"
  "06_payment.sql"
  "07_void.sql"
  "08_purchase_order.sql"
  "09_transaction.sql"
  "10_payroll.sql"
  "10_migration_transaction.sql"
  "11_expense.sql"
  "11_migration_delivery_journal.sql"
  "12_asset.sql"
  "12_tax_payment.sql"
  "13_debt_installment.sql"
  "13_sales_journal.sql"
  "14_account_management.sql"
  "14_employee_advance.sql"
  "15_coa_adjustments.sql"
  "15_zakat.sql"
  "16_commission_payment.sql"
  "16_po_management.sql"
  "17_production_void.sql"
  "17_retasi.sql"
  "18_payroll_management.sql"
  "18_stock_adjustment.sql"
  "19_delivery_management.sql"
  "19_legacy_journal_rpc.sql"
  "20_employee_advances.sql"
  "21_retasi_management.sql"
  "22_closing_entries.sql"
  "23_zakat_management.sql"
  "24_debt_installment.sql"
)

deploy_to_db() {
  local db=$1
  local db_label=$2

  echo -e "\n${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${YELLOW}  Deploying to: ${db_label} (${db})${NC}"
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  # Step 1: Schema sync (drop functions + add columns)
  echo -e "\n${CYAN}[1/2] Schema sync (drop old functions + add columns)...${NC}"
  PGPASSWORD="$DB_PASS" psql -U "$DB_USER" -h "$DB_HOST" -d "$db" \
    -f "${SCRIPT_DIR}/full_sync_to_production.sql" 2>&1 | grep -E '(NOTICE|ERROR|DROP|CREATE)' || true

  # Step 2: Deploy RPC functions
  echo -e "\n${CYAN}[2/2] Deploying RPC functions...${NC}"

  local success=0
  local failed=0

  for file in "${RPC_FILES[@]}"; do
    if [ -f "${SCRIPT_DIR}/rpc/${file}" ]; then
      echo -n "  → ${file}... "
      if PGPASSWORD="$DB_PASS" psql -U "$DB_USER" -h "$DB_HOST" -d "$db" \
          -f "${SCRIPT_DIR}/rpc/${file}" 2>&1 | grep -q "ERROR"; then
        echo -e "${RED}✗${NC}"
        ((failed++))
      else
        echo -e "${GREEN}✓${NC}"
        ((success++))
      fi
    fi
  done

  echo -e "\n  ${GREEN}Success: ${success}${NC} | ${RED}Failed: ${failed}${NC}"
}

# Backup first
echo -e "\n${YELLOW}[0/3] Creating backups...${NC}"
BACKUP_DIR="/home/deployer/backups/pre_deploy_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

PGPASSWORD="$DB_PASS" pg_dump -U "$DB_USER" -h "$DB_HOST" -d "$PROD_NABIRE" \
  --no-owner --no-acl -F c -f "${BACKUP_DIR}/nabire.dump" && \
  echo -e "  ${GREEN}✓${NC} Nabire backup: ${BACKUP_DIR}/nabire.dump"

PGPASSWORD="$DB_PASS" pg_dump -U "$DB_USER" -h "$DB_HOST" -d "$PROD_MKW" \
  --no-owner --no-acl -F c -f "${BACKUP_DIR}/mkw.dump" && \
  echo -e "  ${GREEN}✓${NC} Manokwari backup: ${BACKUP_DIR}/mkw.dump"

# Deploy to Nabire
deploy_to_db "$PROD_NABIRE" "Nabire"

# Deploy to Manokwari
deploy_to_db "$PROD_MKW" "Manokwari"

# Restart PostgREST
echo -e "\n${YELLOW}[3/3] Restarting PostgREST...${NC}"
pm2 restart postgrest-aquvit postgrest-mkw 2>/dev/null && \
  echo -e "  ${GREEN}✓${NC} PostgREST restarted" || \
  echo -e "  ${RED}✗${NC} Failed to restart PostgREST"

# Done
echo -e "\n${GREEN}============================================${NC}"
echo -e "${GREEN}  DEPLOYMENT COMPLETE!                     ${NC}"
echo -e "${GREEN}============================================${NC}"
echo -e "Backups: ${BACKUP_DIR}"
echo ""
echo -e "Verify functions:"
echo "  PGPASSWORD='$DB_PASS' psql -U $DB_USER -h $DB_HOST -d $PROD_NABIRE -c \"SELECT COUNT(*) as function_count FROM pg_proc WHERE pronamespace = 'public'::regnamespace;\""
echo ""
echo -e "Test API:"
echo "  curl -s https://nabire.aquvit.id/rest/v1/ | head"
echo "  curl -s https://mkw.aquvit.id/rest/v1/ | head"
