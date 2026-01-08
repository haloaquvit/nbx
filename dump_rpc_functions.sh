#!/bin/bash
# Script to dump ALL RPC functions from VPS and organize by table

OUTPUT_DIR="/tmp/rpc_by_table"
mkdir -p $OUTPUT_DIR

# Dump all functions to a single file first
echo "Dumping all functions..."
PGPASSWORD=Aquvit2024 pg_dump -U aquavit -h 127.0.0.1 -d aquvit_new \
  --schema-only --no-owner --no-acl \
  -n public \
  -t '' \
  --section=pre-data 2>/dev/null | grep -v "^--" | grep -v "^SET" | grep -v "^SELECT" > /tmp/all_functions_raw.sql

# Alternative: Get function definitions directly
echo "Extracting function definitions..."
PGPASSWORD=Aquvit2024 psql -U aquavit -h 127.0.0.1 -d aquvit_new -t -A -c "
SELECT 
  pg_get_functiondef(p.oid) || ';' as func_def
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
ORDER BY p.proname;
" > /tmp/all_functions.sql

echo "Done! All functions dumped to /tmp/all_functions.sql"
wc -l /tmp/all_functions.sql
