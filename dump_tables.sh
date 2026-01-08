#!/bin/bash
# Script to dump CREATE TABLE statements for each table

OUTPUT_DIR="/tmp/table_schemas"
mkdir -p $OUTPUT_DIR

TABLES=(
  accounts
  accounts_balance_backup
  accounts_payable
  active_sessions
  advance_repayments
  asset_maintenance
  assets
  attendance
  audit_logs
  balance_adjustments
  bonus_pricings
  branches
  cash_history
  closing_periods
  commission_entries
  commission_rules
  companies
  company_settings
  customer_pricings
  customer_visits
  customers
  debt_installments
  deliveries
  delivery_items
  delivery_photos
  employee_advances
  employee_salaries
  expenses
  inventory_batch_consumptions
  inventory_batches
  journal_entries
  journal_entry_lines
  manual_journal_entries
  manual_journal_entry_lines
  material_stock_movements
  materials
  nishab_reference
  notifications
  payment_history
  payroll_records
  product_materials
  product_stock_movements
  production_errors
  production_records
  products
  profiles
  purchase_order_items
  purchase_orders
  quotations
  receivables
  retasi
  retasi_items
  role_permissions
  roles
  stock_pricings
  supplier_materials
  suppliers
  transaction_payments
  transactions
  user_roles
  zakat_records
)

for TABLE in "${TABLES[@]}"
do
  echo "Dumping schema for: $TABLE"
  PGPASSWORD=Aquvit2024 pg_dump -U aquavit -h 127.0.0.1 -d aquvit_new --schema-only --no-owner --no-acl -t "public.$TABLE" > "$OUTPUT_DIR/$TABLE.sql" 2>/dev/null
done

# Combine all into one file 
cat $OUTPUT_DIR/*.sql > /tmp/ALL_TABLE_SCHEMAS.sql
echo "Done! Combined file at /tmp/ALL_TABLE_SCHEMAS.sql"
