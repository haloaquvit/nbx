# ID Generation System Guide

## Format Standar ID
Semua ID di sistem mengikuti format: `[PREFIX]-[MODULE]-[PAGE]-[NUMBER]`

### Contoh:
- `KAN-HT-AP-0001` - Hutang Accounts Payable #1 dari Kantor Pusat
- `EKS-TR-PO-0023` - Purchase Order #23 dari Ekstrisit Aquvit
- `COM-AS-MT-0005` - Maintenance Asset #5 dari Company (tanpa branch)

## Komponen ID

### 1. PREFIX (3 huruf)
- Diambil dari 3 huruf pertama nama branch
- Uppercase, tanpa spasi
- Contoh: "Kantor Pusat" → `KAN`, "Ekstrisit Aquvit" → `EKS`
- Default jika tidak ada branch: `COM` (Company)

### 2. MODULE (2 huruf)
Kode modul/kategori:
- `HT` - Hutang (Accounts Payable)
- `TR` - Transaksi
- `KU` - Keuangan (Finance/Expenses)
- `KR` - Karyawan (Employee)
- `KM` - Komisi
- `AS` - Asset
- `PR` - Produksi
- `CU` - Customer
- `RT` - Retasi
- `ZK` - Zakat
- `AK` - Akun
- `KA` - Kas

### 3. PAGE (2 huruf)
Kode halaman/sub-modul:
- `AP` - Accounts Payable
- `PO` - Purchase Order
- `TX` - Transaction
- `EX` - Expense
- `EM` - Employee
- `AD` - Advance
- `CM` - Commission
- `AS` - Asset (generic)
- `MT` - Maintenance
- `PR` - Production Record
- `CS` - Customer
- `RT` - Retasi
- `ZK` - Zakat
- `AC` - Account
- `CH` - Cash History

### 4. NUMBER (4 digit)
- Nomor berurutan: 0001, 0002, 0003, ...
- Per branch (setiap branch punya penomoran sendiri)

## Cara Menggunakan

### Import Function
```typescript
import { generateSequentialId } from '@/utils/idGenerator';
```

### Generate ID
```typescript
const id = await generateSequentialId({
  branchName: currentBranch?.name,      // Nama branch (opsional)
  tableName: 'accounts_payable',        // Nama tabel database
  pageCode: 'HT-AP',                    // Kode MODULE-PAGE
  branchId: currentBranch?.id || null,  // ID branch untuk filter count
});
```

## Mapping Table → Module Code

| Table Name | Module Code | Contoh ID |
|------------|-------------|-----------|
| accounts_payable | HT-AP | KAN-HT-AP-0001 |
| purchase_orders | TR-PO | EKS-TR-PO-0023 |
| transactions | TR-TX | COM-TR-TX-0100 |
| expenses | KU-EX | KAN-KU-EX-0015 |
| employees | KR-EM | COM-KR-EM-0042 |
| employee_advances | KR-AD | KAN-KR-AD-0008 |
| commissions | KM-CM | EKS-KM-CM-0012 |
| assets | AS-AS | KAN-AS-AS-0005 |
| maintenance | AS-MT | EKS-AS-MT-0003 |
| production_records | PR-PR | KAN-PR-PR-0055 |
| customers | CU-CS | COM-CU-CS-0200 |
| retasi | RT-RT | KAN-RT-RT-0010 |
| zakat | ZK-ZK | COM-ZK-ZK-0002 |
| accounts | AK-AC | COM-AK-AC-0025 |
| cash_history | KA-CH | KAN-KA-CH-1500 |

## Contoh Implementasi

### 1. Accounts Payable (Hutang)
```typescript
// di AddDebtDialog.tsx atau useAccountsPayable.ts
const id = await generateSequentialId({
  branchName: currentBranch?.name,
  tableName: 'accounts_payable',
  pageCode: 'HT-AP',
  branchId: currentBranch?.id || null,
});
// Hasil: KAN-HT-AP-0001
```

### 2. Purchase Order
```typescript
const id = await generateSequentialId({
  branchName: currentBranch?.name,
  tableName: 'purchase_orders',
  pageCode: 'TR-PO',
  branchId: currentBranch?.id || null,
});
// Hasil: EKS-TR-PO-0023
```

### 3. Employee Advance
```typescript
const id = await generateSequentialId({
  branchName: currentBranch?.name,
  tableName: 'employee_advances',
  pageCode: 'KR-AD',
  branchId: currentBranch?.id || null,
});
// Hasil: KAN-KR-AD-0008
```

## File yang Sudah Diupdate

✅ [src/utils/idGenerator.ts](src/utils/idGenerator.ts) - Utility function
✅ [src/components/AddDebtDialog.tsx](src/components/AddDebtDialog.tsx) - Manual debt input
✅ [src/hooks/useAccountsPayable.ts](src/hooks/useAccountsPayable.ts) - Accounts payable hook

## File yang Perlu Diupdate (TODO)

Untuk menerapkan sistem ID di seluruh aplikasi, update file-file berikut:

- [ ] src/hooks/usePurchaseOrders.ts - Purchase Order
- [ ] src/hooks/useExpenses.ts - Expenses
- [ ] src/hooks/useEmployeeAdvances.ts - Employee Advances
- [ ] src/hooks/useCommissions.ts - Commissions
- [ ] src/hooks/useAssets.ts - Assets
- [ ] src/hooks/useMaintenance.ts - Maintenance
- [ ] src/hooks/useProduction.ts - Production Records
- [ ] src/hooks/useRetasi.ts - Retasi
- [ ] src/hooks/useZakat.ts - Zakat
- [ ] src/hooks/useAccounts.ts - Financial Accounts
- [ ] src/components/AddCustomerDialog.tsx - Customers
- [ ] src/components/CashInOutDialog.tsx - Cash History
- [ ] src/components/TransferAccountDialog.tsx - Account Transfers

## Keuntungan Sistem ID Baru

1. **Konsisten** - Format yang sama di seluruh sistem
2. **Traceable** - Mudah identifikasi dari branch mana
3. **Organized** - Penomoran berurutan per branch
4. **Readable** - Mudah dibaca dan dipahami manusia
5. **Scalable** - Mendukung 9,999 record per branch per modul

## Catatan Penting

- Nomor urut dihitung berdasarkan `count` dari tabel, bukan dari ID terakhir
- Setiap branch memiliki penomoran terpisah (isolasi data)
- Jika gagal mendapatkan count, sistem fallback ke ID berbasis timestamp
- Prefix "COM" digunakan untuk data global tanpa branch
