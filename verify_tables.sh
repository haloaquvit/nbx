#!/bin/bash
# Verify table structures on VPS

echo "=== TRANSACTIONS ==="
PGPASSWORD=Aquvit2024 psql -U aquavit -h 127.0.0.1 -d aquvit_new -c "\d public.transactions"

echo ""
echo "=== JOURNAL_ENTRIES ==="
PGPASSWORD=Aquvit2024 psql -U aquavit -h 127.0.0.1 -d aquvit_new -c "\d public.journal_entries"

echo ""
echo "=== PRODUCTS ==="
PGPASSWORD=Aquvit2024 psql -U aquavit -h 127.0.0.1 -d aquvit_new -c "\d public.products"

echo ""
echo "=== INVENTORY_BATCHES ==="
PGPASSWORD=Aquvit2024 psql -U aquavit -h 127.0.0.1 -d aquvit_new -c "\d public.inventory_batches"
