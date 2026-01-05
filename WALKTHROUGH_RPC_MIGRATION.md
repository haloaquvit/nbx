# Walkthrough: Migrasi Frontend ke RPC Atomic Functions

## Tanggal: 2026-01-05

## Ringkasan

Semua operasi jurnal di frontend AQUVIT ERP telah sepenuhnya dimigrasikan dari `journalService.ts` ke PostgreSQL RPC atomic functions. Ini memastikan:

1. **Atomicity** - Semua operasi dalam satu transaksi database
2. **Konsistensi** - Tidak ada state inconsistent antara frontend dan database
3. **Performance** - Mengurangi round-trip ke database
4. **Branch Isolation** - Semua RPC WAJIB menerima `branch_id`

---

## File yang Dihapus

| File | Alasan |
|------|--------|
| `src/services/journalService.ts` | Digantikan oleh RPC functions |
| `src/hooks/useJournalService.ts` | Hook wrapper yang tidak lagi diperlukan |

---

## File RPC Baru

### 18_stock_adjustment.sql

```sql
-- Stock adjustment untuk products dan materials
create_product_stock_adjustment_atomic(p_product_id, p_branch_id, p_quantity_change, p_reason, p_unit_cost, p_user_id)
create_material_stock_adjustment_atomic(p_material_id, p_branch_id, p_quantity_change, p_reason, p_unit_cost, p_user_id)

-- Pembayaran pajak
create_tax_payment_atomic(p_branch_id, p_period, p_ppn_masukan_used, p_ppn_keluaran_paid, p_payment_account_id, p_notes, p_user_id)
```

### 19_legacy_journal_rpc.sql

```sql
-- Migrasi Piutang: Dr. Piutang, Cr. Saldo Awal
create_migration_receivable_journal_rpc(p_branch_id, p_receivable_id, p_receivable_date, p_amount, p_customer_name, p_description)

-- Hutang Baru (terima kas): Dr. Kas, Cr. Hutang
create_debt_journal_rpc(p_branch_id, p_debt_id, p_debt_date, p_amount, p_creditor_name, p_creditor_type, p_description, p_cash_account_id)

-- Migrasi Hutang: Dr. Saldo Awal, Cr. Hutang
create_migration_debt_journal_rpc(p_branch_id, p_debt_id, p_debt_date, p_amount, p_creditor_name, p_creditor_type, p_description)

-- Kas Masuk Manual: Dr. Kas, Cr. Pendapatan Lain
create_manual_cash_in_journal_rpc(p_branch_id, p_reference_id, p_transaction_date, p_amount, p_description, p_cash_account_id)

-- Kas Keluar Manual: Dr. Beban Lain, Cr. Kas
create_manual_cash_out_journal_rpc(p_branch_id, p_reference_id, p_transaction_date, p_amount, p_description, p_cash_account_id)

-- Transfer Antar Akun: Dr. To, Cr. From
create_transfer_journal_rpc(p_branch_id, p_transfer_id, p_transfer_date, p_amount, p_from_account_id, p_to_account_id, p_description)

-- Pembayaran Bahan: Dr. Beban Bahan, Cr. Kas
create_material_payment_journal_rpc(p_branch_id, p_reference_id, p_transaction_date, p_amount, p_material_id, p_material_name, p_description, p_cash_account_id)

-- Saldo Awal Persediaan
create_inventory_opening_balance_journal_rpc(p_branch_id, p_products_value, p_materials_value, p_opening_date)

-- Saldo Awal Semua Akun
create_all_opening_balance_journal_rpc(p_branch_id, p_opening_date)
```

---

## Komponen yang Diupdate

### 1. AddManualReceivableDialog.tsx

**Sebelum:**
```typescript
import { createMigrationReceivableJournal } from '@/services/journalService';
// ...
const journalResult = await createMigrationReceivableJournal({...});
```

**Sesudah:**
```typescript
const { data: journalResultRaw, error: journalError } = await supabase
  .rpc('create_migration_receivable_journal_rpc', {
    p_branch_id: currentBranch.id,
    p_receivable_id: transactionId,
    p_receivable_date: orderDate.toISOString().split('T')[0],
    p_amount: parsedAmount,
    p_customer_name: selectedCustomerName,
    p_description: notes || 'Piutang migrasi',
  });

const journalResult = Array.isArray(journalResultRaw) ? journalResultRaw[0] : journalResultRaw;
```

### 2. AddDebtDialog.tsx

**Sebelum:**
```typescript
import { createDebtJournal, createMigrationDebtJournal } from '@/services/journalService';
```

**Sesudah:**
```typescript
// Untuk hutang baru (kas bertambah)
await supabase.rpc('create_debt_journal_rpc', {...});

// Untuk migrasi hutang (tanpa kas)
await supabase.rpc('create_migration_debt_journal_rpc', {...});
```

### 3. CashInOutDialog.tsx

**Sebelum:**
```typescript
import { createManualCashInJournal, createManualCashOutJournal } from '@/services/journalService';
```

**Sesudah:**
```typescript
const rpcName = type === "in"
  ? 'create_manual_cash_in_journal_rpc'
  : 'create_manual_cash_out_journal_rpc';

await supabase.rpc(rpcName, {
  p_branch_id: currentBranch.id,
  p_reference_id: referenceId,
  p_transaction_date: new Date().toISOString().split('T')[0],
  p_amount: data.amount,
  p_description: data.description,
  p_cash_account_id: selectedAccount.id,
});
```

### 4. TransferAccountDialog.tsx

**Sebelum:**
```typescript
import { createTransferJournal } from '@/services/journalService';
```

**Sesudah:**
```typescript
await supabase.rpc('create_transfer_journal_rpc', {
  p_branch_id: currentBranch.id,
  p_transfer_id: transferRef,
  p_transfer_date: new Date().toISOString().split('T')[0],
  p_amount: data.amount,
  p_from_account_id: fromAccount.id,
  p_to_account_id: toAccount.id,
  p_description: data.description,
});
```

### 5. PayMaterialBillDialog.tsx

**Sebelum:**
```typescript
import { createMaterialPaymentJournal } from '@/services/journalService';
```

**Sesudah:**
```typescript
await supabase.rpc('create_material_payment_journal_rpc', {
  p_branch_id: currentBranch.id,
  p_reference_id: referenceId,
  p_transaction_date: new Date().toISOString().split('T')[0],
  p_amount: data.amount,
  p_material_id: material.id,
  p_material_name: material.name,
  p_description: data.notes || description,
  p_cash_account_id: selectedAccount.id,
});
```

### 6. ChartOfAccountsPage.tsx

**Sebelum:**
```typescript
import { createInventoryOpeningBalanceJournal, createAllOpeningBalanceJournal } from '@/services/journalService';
```

**Sesudah:**
```typescript
// Saldo awal persediaan
await supabase.rpc('create_inventory_opening_balance_journal_rpc', {
  p_branch_id: currentBranch.id,
  p_products_value: productsNeedJournal,
  p_materials_value: materialsNeedJournal,
  p_opening_date: new Date().toISOString().split('T')[0],
});

// Saldo awal semua akun
await supabase.rpc('create_all_opening_balance_journal_rpc', {
  p_branch_id: currentBranch.id,
  p_opening_date: new Date().toISOString().split('T')[0],
});
```

### 7. useTax.ts

**Sebelum:**
```typescript
import { createTaxPaymentJournal } from '@/services/journalService';
```

**Sesudah:**
```typescript
await supabase.rpc('create_tax_payment_atomic', {
  p_branch_id: currentBranch.id,
  p_period: period,
  p_ppn_masukan_used: ppnMasukanToUse,
  p_ppn_keluaran_paid: ppnKeluaranToPay,
  p_payment_account_id: paymentAccountId,
  p_notes: notes || `Pembayaran Pajak Periode ${period}`,
  p_user_id: null,
});
```

### 8. debtInstallmentService.ts

**Sebelum:**
```typescript
import { createPayablePaymentJournal } from './journalService';
```

**Sesudah:**
```typescript
await supabase.rpc('pay_supplier_atomic', {
  p_branch_id: params.branchId,
  p_payable_id: installment.debtId,
  p_amount: installment.totalAmount,
  p_payment_date: paymentDate.toISOString().split('T')[0],
  p_payment_account_id: params.paymentAccountId,
  p_supplier_name: debt?.supplier_name || 'Kreditor',
  p_notes: `Angsuran #${installment.installmentNumber}`,
});
```

---

## Pattern Standar untuk RPC Call

```typescript
// 1. Call RPC
const { data: resultRaw, error: rpcError } = await supabase
  .rpc('rpc_function_name', {
    p_branch_id: currentBranch.id,
    // ... other params
  });

// 2. Parse result (handle array wrapper)
const result = Array.isArray(resultRaw) ? resultRaw[0] : resultRaw;

// 3. Check for errors
if (rpcError || !result?.success) {
  throw new Error(
    rpcError?.message ||
    result?.error_message ||
    'Default error message'
  );
}

// 4. Use result
console.log('Success:', result.journal_id);
```

---

## Cara Deploy RPC ke Local

```powershell
# Deploy semua RPC files
$files = Get-ChildItem "database/rpc/*.sql" | Sort-Object Name
foreach ($file in $files) {
  Get-Content $file.FullName -Raw | docker exec -i aquvit-postgres psql -U postgres -d aquvit_test
}

# Restart PostgREST
docker restart postgrest-local

# Verify
docker logs postgrest-local --tail 5
# Should show: Schema cache loaded 185+ Functions
```

---

## Total RPC Functions: 185+

Semua operasi jurnal sekarang dijalankan melalui RPC atomic functions di PostgreSQL, memastikan konsistensi data dan atomicity transaksi.
