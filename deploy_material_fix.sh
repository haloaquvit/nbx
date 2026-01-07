#!/bin/bash

# ============================================================================
# Deployment Script for Material Stock Fix
# Purpose: Deploy RPC fixes for material sales stock deduction
# Date: 2026-01-07
# ============================================================================

echo "=========================================="
echo "Deploying Material Stock Fix RPCs"
echo "=========================================="

# Database connections
NABIRE_DB="aquvit_new"
MKW_DB="mkw_db"
DB_USER="aquavit"
DB_PASS="Aquvit2024"

# Check which database to deploy
if [ "$1" = "nabire" ]; then
    TARGET_DB=$NABIRE_DB
    POSTGREST_NAME="postgrest-aquvit"
elif [ "$1" = "manokwari" ]; then
    TARGET_DB=$MKW_DB
    POSTGREST_NAME="postgrest-mkw"
else
    echo "Usage: $0 [nabire|manokwari|all]"
    exit 1
fi

echo "Target Database: $TARGET_DB"
echo ""

# Deploy RPC files
echo "1. Deploying 05_delivery.sql..."
PGPASSWORD=$DB_PASS psql -U $DB_USER -h 127.0.0.1 -d $TARGET_DB -f database/rpc/05_delivery.sql
if [ $? -eq 0 ]; then
    echo "   ✅ 05_delivery.sql deployed successfully"
else
    echo "   ❌ Failed to deploy 05_delivery.sql"
    exit 1
fi

echo ""
echo "2. Deploying 05_delivery_no_stock.sql..."
PGPASSWORD=$DB_PASS psql -U $DB_USER -h 127.0.0.1 -d $TARGET_DB -f database/rpc/05_delivery_no_stock.sql
if [ $? -eq 0 ]; then
    echo "   ✅ 05_delivery_no_stock.sql deployed successfully"
else
    echo "   ❌ Failed to deploy 05_delivery_no_stock.sql"
    exit 1
fi

echo ""
echo "3. Deploying 09_transaction.sql..."
PGPASSWORD=$DB_PASS psql -U $DB_USER -h 127.0.0.1 -d $TARGET_DB -f database/rpc/09_transaction.sql
if [ $? -eq 0 ]; then
    echo "   ✅ 09_transaction.sql deployed successfully"
else
    echo "   ❌ Failed to deploy 09_transaction.sql"
    exit 1
fi

echo ""
echo "4. Restarting PostgREST..."
pm2 restart $POSTGREST_NAME
if [ $? -eq 0 ]; then
    echo "   ✅ PostgREST restarted successfully"
else
    echo "   ❌ Failed to restart PostgREST"
    exit 1
fi

echo ""
echo "=========================================="
echo "✅ Deployment Complete!"
echo "=========================================="
echo ""
echo "Next Steps:"
echo "1. Test material sales in frontend"
echo "2. Verify stock deduction works"
echo "3. Check journal entries"
