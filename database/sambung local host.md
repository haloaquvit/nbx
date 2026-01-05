# Panduan Koneksi & Testing Database Localhost

Dokumen ini untuk AI lain yang perlu test RPC atau query database di localhost.

## Prerequisites

Docker Desktop harus running dengan containers:
- `aquvit-postgres` - PostgreSQL database (port 5433)
- `postgrest-local` - PostgREST API (port 3001)

## Quick Check Status

```bash
# Check if containers are running
docker ps

# Expected output should show:
# aquvit-postgres   ... 0.0.0.0:5433->5432/tcp
# postgrest-local   ... 0.0.0.0:3001->3000/tcp
```

## Start Containers (if not running)

```bash
docker start aquvit-postgres
docker start postgrest-local
```

## Koneksi ke Database

### Via Docker Exec (Recommended)

```bash
# Interactive psql session
docker exec -it aquvit-postgres psql -U postgres -d aquvit_test

# Run single query
docker exec aquvit-postgres psql -U postgres -d aquvit_test -c "SELECT NOW();"

# Run SQL file
docker exec -i aquvit-postgres psql -U postgres -d aquvit_test < path/to/file.sql
```

### Connection Details

| Property | Value |
|----------|-------|
| Host | `localhost` |
| Port | `5433` |
| Database | `aquvit_test` |
| Username | `postgres` |
| Password | (none/trust) |

## Deploy RPC Functions

**PENTING: Deploy dalam urutan yang benar karena ada dependencies!**

```bash
# Deploy semua RPC files (urutan penting!)
docker exec -i aquvit-postgres psql -U postgres -d aquvit_test < database/rpc/01_fifo_inventory.sql
docker exec -i aquvit-postgres psql -U postgres -d aquvit_test < database/rpc/02_fifo_material.sql
docker exec -i aquvit-postgres psql -U postgres -d aquvit_test < database/rpc/03_journal.sql
docker exec -i aquvit-postgres psql -U postgres -d aquvit_test < database/rpc/04_production.sql
docker exec -i aquvit-postgres psql -U postgres -d aquvit_test < database/rpc/05_delivery.sql
docker exec -i aquvit-postgres psql -U postgres -d aquvit_test < database/rpc/06_payment.sql
docker exec -i aquvit-postgres psql -U postgres -d aquvit_test < database/rpc/07_void.sql
docker exec -i aquvit-postgres psql -U postgres -d aquvit_test < database/rpc/08_purchase_order.sql

# WAJIB: Restart PostgREST setelah deploy
docker restart postgrest-local
```

## Testing RPC Functions

### 1. Test Branch Validation

Semua RPC WAJIB menerima `branch_id`. Test tanpa branch_id harus gagal:

```sql
-- Harus return error "Branch ID is REQUIRED"
SELECT * FROM void_delivery_atomic(
  '00000000-0000-0000-0000-000000000000'::UUID,
  NULL,  -- branch_id NULL = ERROR!
  'test',
  NULL
);
```

### 2. Test void_transaction_atomic

```sql
-- Get sample transaction ID (TEXT, bukan UUID!)
SELECT id, branch_id, status FROM transactions LIMIT 5;

-- Test void (ganti dengan ID yang valid)
SELECT * FROM void_transaction_atomic(
  'TRX-20260104-0001',  -- TEXT transaction ID
  'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'::UUID,  -- branch_id
  'Test void',
  NULL
);
```

### 3. Test void_delivery_atomic

```sql
-- Get sample delivery
SELECT id, branch_id, transaction_id FROM deliveries LIMIT 5;

-- Test void
SELECT * FROM void_delivery_atomic(
  'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'::UUID,  -- delivery_id
  'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'::UUID,  -- branch_id
  'Test void delivery',
  NULL
);
```

### 4. Test receive_po_atomic

```sql
-- Get sample PO with status Approved/Pending
SELECT id, branch_id, status FROM purchase_orders WHERE status IN ('Approved', 'Pending') LIMIT 5;

-- Test receive
SELECT * FROM receive_po_atomic(
  'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'::UUID,  -- po_id
  'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'::UUID,  -- branch_id
  CURRENT_DATE,
  NULL,
  'Test User'
);
```

### 5. Test pay_supplier_atomic

```sql
-- Get sample payable (id adalah TEXT!)
SELECT id, branch_id, amount, paid_amount, status FROM accounts_payable WHERE status != 'Paid' LIMIT 5;

-- Test payment
SELECT * FROM pay_supplier_atomic(
  'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',  -- TEXT payable_id
  'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'::UUID,  -- branch_id
  100000,  -- amount
  'cash',
  CURRENT_DATE,
  'Test payment'
);
```

## Check RPC Exists

```sql
-- List all RPC functions
SELECT
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname LIKE '%atomic%'
ORDER BY p.proname;
```

## Common Errors & Solutions

### Error: "function does not exist"

```bash
# RPC belum di-deploy, jalankan:
docker exec -i aquvit-postgres psql -U postgres -d aquvit_test < database/rpc/XX_file.sql
docker restart postgrest-local
```

### Error: "Branch ID is REQUIRED"

RPC dipanggil tanpa branch_id. Semua RPC WAJIB menerima branch_id.

### Error: "invalid input syntax for type uuid"

Beberapa ID adalah TEXT, bukan UUID:
- `transactions.id` = TEXT
- `accounts.id` = TEXT
- `accounts_payable.id` = TEXT

### Error: "column X does not exist"

Schema di RPC tidak match dengan database. Check:
- `void_reason` bukan `voided_reason`
- `production_records` bukan `production_batches`
- `delivery_items` bukan `transaction_items`

## Useful Queries

### Check Inventory Batches

```sql
SELECT
  ib.id,
  COALESCE(p.name, m.name) as item_name,
  ib.initial_quantity,
  ib.remaining_quantity,
  ib.unit_cost,
  ib.batch_date
FROM inventory_batches ib
LEFT JOIN products p ON p.id = ib.product_id
LEFT JOIN materials m ON m.id = ib.material_id
WHERE ib.remaining_quantity > 0
ORDER BY ib.batch_date
LIMIT 20;
```

### Check Journal Entries

```sql
SELECT
  je.entry_number,
  je.entry_date,
  je.description,
  je.reference_type,
  je.status,
  je.is_voided
FROM journal_entries je
ORDER BY je.created_at DESC
LIMIT 20;
```

### Check Product Stock (via VIEW)

```sql
SELECT * FROM v_product_current_stock LIMIT 20;
```

## Frontend Testing

Setelah RPC di-deploy, test dari frontend:

```bash
# Start dev server
npm run dev

# Open browser to localhost:8081
# Login dan test fitur yang menggunakan RPC
```

## Reset Test Data (HATI-HATI!)

```sql
-- DANGER: Ini akan menghapus data test!
-- Hanya gunakan jika perlu reset

-- Void all test journals
UPDATE journal_entries SET is_voided = true WHERE description LIKE '%test%';

-- Delete test batches
DELETE FROM inventory_batches WHERE notes LIKE '%test%';
```
