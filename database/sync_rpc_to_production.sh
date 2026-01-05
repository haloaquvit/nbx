#!/bin/bash
# ============================================================================
# SYNC RPC FUNCTIONS FROM aquvit_dev TO PRODUCTION
#
# Cara pakai:
#   1. Upload semua file di database/rpc/ ke VPS
#   2. Jalankan script ini di VPS
#
# Atau jalankan langsung dari local dengan:
#   scp -i Aquvit.pem database/rpc/*.sql deployer@103.197.190.54:/home/deployer/rpc/
#   ssh -i Aquvit.pem deployer@103.197.190.54 'bash /home/deployer/rpc/sync_rpc.sh'
# ============================================================================

set -e

DB_USER="aquavit"
DB_PASS="Aquvit2024"
DB_HOST="127.0.0.1"

PROD_NABIRE="aquvit_new"
PROD_MKW="mkw_db"

RPC_DIR="/home/deployer/rpc"
LOG_DIR="/home/deployer/logs"

mkdir -p "$LOG_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  SYNC RPC TO PRODUCTION                   ${NC}"
echo -e "${GREEN}============================================${NC}"

# RPC files in order
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
  "11_expense.sql"
  "12_asset.sql"
  "12_tax_payment.sql"
  "13_debt_installment.sql"
  "14_employee_advance.sql"
  "15_coa_adjustments.sql"
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

apply_rpc() {
  local db=$1
  local db_name=$2

  echo -e "\n${YELLOW}Applying to ${db_name}...${NC}"

  for file in "${RPC_FILES[@]}"; do
    if [ -f "${RPC_DIR}/${file}" ]; then
      echo -n "  → ${file}... "
      PGPASSWORD="$DB_PASS" psql -U "$DB_USER" -h "$DB_HOST" -d "$db" \
        -f "${RPC_DIR}/${file}" >> "${LOG_DIR}/${db}_rpc.log" 2>&1 && \
        echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}"
    fi
  done
}

# Apply to Nabire
apply_rpc "$PROD_NABIRE" "Nabire (aquvit_new)"

# Apply to Manokwari
apply_rpc "$PROD_MKW" "Manokwari (mkw_db)"

# Restart PostgREST
echo -e "\n${YELLOW}Restarting PostgREST...${NC}"
pm2 restart postgrest-aquvit postgrest-mkw 2>/dev/null || {
  echo "PM2 not available, trying systemctl..."
  sudo systemctl restart postgrest 2>/dev/null || true
}

echo -e "\n${GREEN}============================================${NC}"
echo -e "${GREEN}  RPC SYNC COMPLETE!                       ${NC}"
echo -e "${GREEN}============================================${NC}"
echo -e "Logs: ${LOG_DIR}/nabire_rpc.log"
echo -e "      ${LOG_DIR}/mkw_rpc.log"
