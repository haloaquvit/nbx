# RPC Functions untuk AQUVIT ERP

Folder ini berisi semua RPC functions yang digunakan oleh sistem.

## PENTING: Branch ID WAJIB

**Semua RPC function WAJIB menerima `branch_id` sebagai parameter.**
Ini untuk memastikan isolasi data antar cabang - tidak boleh lintas data!

## Struktur File

| File | Deskripsi | Functions |
|------|-----------|-----------|
| `00_permission_checker.sql` | Permission check functions | `check_user_permission`, `check_user_permission_any`, `check_user_permission_all`, `get_user_role`, `validate_branch_access` |
| `01_fifo_inventory.sql` | FIFO consume/restore untuk products | `consume_inventory_fifo`, `restore_inventory_fifo`, `get_product_stock`, `calculate_fifo_cost` |
| `02_fifo_material.sql` | FIFO consume/restore untuk materials | `consume_material_fifo`, `restore_material_fifo`, `add_material_batch`, `get_material_stock` |
| `03_journal.sql` | Create journal atomic dengan validasi | `create_journal_atomic`, `void_journal_entry` |
| `04_production.sql` | Production + material consume + journal | `process_production_atomic`, `process_spoilage_atomic` |
| `05_delivery.sql` | Delivery + stock consume + HPP journal | `process_delivery_atomic`, `process_laku_kantor_atomic` |
| `06_payment.sql` | Receivable/Payable payment + journal | `receive_payment_atomic`, `pay_supplier_atomic` |
| `07_void.sql` | Void operations dengan restore | `void_transaction_atomic`, `void_delivery_atomic`, `void_production_atomic` |
| `08_purchase_order.sql` | PO receive dan delete atomic | `receive_po_atomic`, `delete_po_atomic` |
| `09_transaction.sql` | Transaction atomic (create, update, void) | `create_transaction_atomic`, `update_transaction_atomic`, `void_transaction_atomic` |
| `10_payroll.sql` | Payroll management | `create_payroll_record`, `process_payroll_complete`, `void_payroll_record` |
| `11_expense.sql` | Expense management | `create_expense_atomic`, `update_expense_atomic`, `delete_expense_atomic` |
| `12_asset.sql` | Asset management | `create_asset_atomic`, `update_asset_atomic`, `delete_asset_atomic`, `record_depreciation_atomic` |
| `13_sales_journal.sql` | Sales journal creation | `create_sales_journal_rpc`, `create_receivable_payment_journal_rpc` |
| `14_employee_advance.sql` | Kasbon karyawan | `create_employee_advance_atomic`, `repay_employee_advance_atomic`, `void_employee_advance_atomic` |
| `15_zakat.sql` | Pembayaran zakat | `create_zakat_payment_atomic`, `void_zakat_payment_atomic` |
| `16_commission_payment.sql` | Pembayaran komisi | `pay_commission_atomic`, `get_pending_commissions`, `get_commission_summary` |
| `17_retasi.sql` | Driver returns (retasi) | `process_retasi_atomic`, `void_retasi_atomic` |
| `18_stock_adjustment.sql` | Stock adjustment + tax | `create_product_stock_adjustment_atomic`, `create_material_stock_adjustment_atomic`, `create_tax_payment_atomic` |
| `19_legacy_journal_rpc.sql` | Legacy journal functions | `create_migration_receivable_journal_rpc`, `create_debt_journal_rpc`, `create_migration_debt_journal_rpc`, `create_manual_cash_in_journal_rpc`, `create_manual_cash_out_journal_rpc`, `create_transfer_journal_rpc`, `create_material_payment_journal_rpc`, `create_inventory_opening_balance_journal_rpc`, `create_all_opening_balance_journal_rpc` |

## Permission System

RPC functions menggunakan sistem permission granular. Gunakan helper functions:

```sql
-- Cek single permission
SELECT check_user_permission(user_id, 'pos_access');

-- Cek salah satu dari beberapa permission
SELECT check_user_permission_any(user_id, ARRAY['pos_access', 'transactions_view']);

-- Cek semua permission
SELECT check_user_permission_all(user_id, ARRAY['expenses_create', 'expenses_edit']);

-- Validasi akses branch
SELECT validate_branch_access(user_id, branch_id);
```

### Daftar Permission Granular

| Kategori | Permissions |
|----------|-------------|
| **POS & Transaksi** | `pos_access`, `pos_driver_access`, `transactions_view`, `transactions_edit` |
| **Produk & Material** | `products_view`, `products_create`, `products_edit`, `products_delete`, `materials_view`, `materials_create`, `materials_edit`, `materials_delete` |
| **Customer & Supplier** | `customers_view`, `customers_create`, `customers_edit`, `customers_delete`, `suppliers_view`, `suppliers_create`, `suppliers_edit` |
| **Karyawan & Payroll** | `employees_view`, `employees_create`, `employees_edit`, `employees_delete`, `payroll_view`, `payroll_manage` |
| **Pengiriman** | `delivery_view`, `delivery_create`, `delivery_edit`, `retasi_view`, `retasi_create`, `retasi_edit` |
| **Keuangan** | `accounts_view`, `accounts_manage`, `receivables_view`, `receivables_manage`, `payables_view`, `payables_manage`, `expenses_view`, `expenses_create`, `expenses_edit`, `expenses_delete`, `advances_view`, `advances_manage`, `cash_flow_view`, `financial_reports` |
| **Aset** | `assets_view`, `assets_create`, `assets_edit`, `assets_delete` |
| **Produksi** | `production_view`, `production_create`, `production_edit` |
| **Laporan** | `stock_reports`, `transaction_reports`, `attendance_reports`, `production_reports`, `material_movement_report`, `transaction_items_report` |
| **Sistem** | `settings_access`, `role_management`, `attendance_access`, `attendance_view` |

## Cara Deploy ke Local

```bash
# 1. Pastikan Docker containers running
docker start aquvit-postgres
docker start postgrest-local

# 2. Deploy semua RPC files (Windows PowerShell)
$files = Get-ChildItem "database/rpc/*.sql" | Sort-Object Name
foreach ($file in $files) {
  Get-Content $file.FullName -Raw | docker exec -i aquvit-postgres psql -U postgres -d aquvit_test
}

# 3. Restart PostgREST untuk reload schema
docker restart postgrest-local

# 4. Verify functions loaded
docker logs postgrest-local --tail 5
# Should show: Schema cache loaded XXX Functions
```

## Cara Deploy ke VPS

```bash
# 1. SSH ke VPS
ssh -i Aquvit.pem deployer@103.197.190.54

# 2. Koneksi ke database
PGPASSWORD='Aquvit2024' psql -U aquavit -h 127.0.0.1 -d aquvit_new

# 3. Jalankan file SQL secara berurutan (00-17)
\i /path/to/00_permission_checker.sql
\i /path/to/01_fifo_inventory.sql
... (dan seterusnya)

# 4. Restart PostgREST
pm2 restart postgrest-aquvit postgrest-mkw
```

## Prinsip Desain

1. **Atomic** - Semua operasi dalam satu transaksi PostgreSQL
2. **Branch Isolation** - WAJIB branch_id untuk isolasi data
3. **Permission Check** - Validasi akses user sebelum operasi (opsional)
4. **Validasi** - Cek parameter dan state sebelum operasi
5. **FIFO** - Konsumsi stok dari batch tertua (First In First Out)
6. **Auto Journal** - Jurnal akuntansi dibuat otomatis
7. **Error Handling** - Return error message yang jelas dalam bahasa Indonesia

## Penggunaan di Frontend

### Transaction Atomic (Full)

```typescript
const { data } = await supabase.rpc('create_transaction_atomic', {
  p_transaction: {
    id: 'TRX-20260105-00001',
    customer_id: customerId,
    customer_name: 'Toko ABC',
    total: 500000,
    paid_amount: 500000,
    payment_method: 'Tunai',
    is_office_sale: false,
    date: '2026-01-05',
    sales_id: salesId,
    sales_name: 'Budi'
  },
  p_items: [
    { product_id: 'xxx', product_name: 'Aquvit 500ml', quantity: 10, price: 50000, is_bonus: false }
  ],
  p_branch_id: branchId,
  p_cashier_id: cashierId,
  p_cashier_name: 'Admin'
});

// Returns: { success, transaction_id, journal_id, total_hpp, items_count }
```

### Employee Advance (Kasbon)

```typescript
// Create kasbon
const { data } = await supabase.rpc('create_employee_advance_atomic', {
  p_advance: {
    employee_id: employeeId,
    employee_name: 'Budi',
    amount: 1000000,
    advance_date: '2026-01-05',
    reason: 'Kebutuhan darurat'
  },
  p_branch_id: branchId,
  p_created_by: userId
});

// Repay kasbon
const { data } = await supabase.rpc('repay_employee_advance_atomic', {
  p_advance_id: advanceId,
  p_branch_id: branchId,
  p_amount: 500000,
  p_payment_date: '2026-01-10'
});
```

### Commission Payment

```typescript
const { data } = await supabase.rpc('pay_commission_atomic', {
  p_employee_id: employeeId,
  p_branch_id: branchId,
  p_amount: 250000,
  p_payment_date: '2026-01-05',
  p_payment_method: 'cash'
});
```

### Retasi (Driver Return)

```typescript
const { data } = await supabase.rpc('process_retasi_atomic', {
  p_retasi: {
    transaction_id: 'TRX-xxx',
    delivery_id: deliveryId,
    customer_name: 'Toko ABC',
    reason: 'Barang tidak laku'
  },
  p_items: [
    { product_id: 'xxx', product_name: 'Aquvit 500ml', quantity: 5, price: 50000 }
  ],
  p_branch_id: branchId,
  p_driver_id: driverId
});
```

## Return Format

Semua RPC function mengembalikan format standar:

```typescript
{
  success: boolean,      // true jika berhasil
  error_message: string, // pesan error jika gagal (dalam bahasa Indonesia)
  // ... data spesifik per function
}
```

## Kode Akun yang Digunakan

| Kode | Nama Akun | Digunakan untuk |
|------|-----------|-----------------|
| 1110 | Kas | Penerimaan/pengeluaran cash |
| 1120 | Bank | Transfer bank |
| 1210 | Piutang Usaha | Receivable dari customer |
| 1230 | Piutang Karyawan | Kasbon karyawan |
| 1310 | Persediaan Barang Dagang | HPP produk jadi |
| 1320 | Persediaan Bahan Baku | Consume material |
| 2110 | Hutang Usaha | Payable ke supplier |
| 2130 | PPN Keluaran | PPN penjualan |
| 2140 | Hutang Barang Dagang | Kewajiban kirim barang |
| 4100 | Pendapatan Penjualan | Revenue dari transaksi |
| 5100 | HPP | Harga Pokok Penjualan |
| 5210 | HPP Bonus | HPP untuk barang bonus |
| 6100 | Beban Gaji | Gaji karyawan |
| 6200 | Beban Komisi | Komisi sales/driver |
| 6500 | Beban Zakat | Pembayaran zakat |
| 8100 | Beban Lain-lain | Spoilage/kerugian |

## Total Functions: 185+

Last updated: 2026-01-05

---

## Migration Note: journalService.ts REMOVED

Frontend sekarang 100% menggunakan RPC untuk semua operasi jurnal.

File yang sudah dihapus:
- `src/services/journalService.ts` - DELETED
- `src/hooks/useJournalService.ts` - DELETED

File yang di-update ke RPC:
- `AddManualReceivableDialog.tsx` → `create_migration_receivable_journal_rpc`
- `AddDebtDialog.tsx` → `create_debt_journal_rpc`, `create_migration_debt_journal_rpc`
- `CashInOutDialog.tsx` → `create_manual_cash_in_journal_rpc`, `create_manual_cash_out_journal_rpc`
- `TransferAccountDialog.tsx` → `create_transfer_journal_rpc`
- `PayMaterialBillDialog.tsx` → `create_material_payment_journal_rpc`
- `ChartOfAccountsPage.tsx` → `create_inventory_opening_balance_journal_rpc`, `create_all_opening_balance_journal_rpc`
- `useTax.ts` → `create_tax_payment_atomic`
- `debtInstallmentService.ts` → `pay_supplier_atomic`
