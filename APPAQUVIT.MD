# AQUVIT SYSTEM CURRENT STATE
**Last Updated:** Tuesday, January 6, 2026 15:00 (JST)

## 1. 🌐 VPS Connection Information

### SSH Access
To connect to the VPS server, use the temporary key file (`Aquvit_temp.pem`). Use `git bash` or `powershell`.

```bash
# SSH Connection Command
ssh -i Aquvit_temp.pem -o StrictHostKeyChecking=no deployer@103.197.190.54
```

### Database Access (From VPS Terminal)
Once logged into the VPS via SSH:

```bash
# 1. Connect to Nabire Database (aquvit_new)
PGPASSWORD='Aquvit2024' psql -U aquavit -h 127.0.0.1 -d aquvit_new

# 2. Connect to Manokwari Database (mkw_db)
# Note: Owned by postgres user, use sudo for DDL changes
PGPASSWORD='Aquvit2024' psql -U aquavit -h 127.0.0.1 -d mkw_db
# OR for Admin access:
sudo -u postgres psql -d mkw_db
```

### Server Services (PM2)
Check status of running services:
```bash
pm2 list
# Restart services after DB schema changes:
pm2 restart postgrest-aquvit postgrest-mkw
```

---

## 2. 🖥️ Server Health Status
**VPS IP**: `103.197.190.54`

| Metric | Status | Details |
|--------|--------|---------|
| **Disk Usage** | ✅ **Healthy** | 11% Used (6.1GB / 58GB) on `/` |
| **PostgREST** | 🟢 **Online** | Port 3000 (Nabire), Port 3007 (Manokwari) |
| **Auth Servers**| 🟢 **Online** | Port 3006 (Nabire), Port 3003 (Manokwari) |

---

## 3. 📂 Application Structure

### Tech Stack
*   **Frontend**: React 18, TypeScript, Vite, TailwindCSS, Shadcn UI.
*   **Backend**: PostgreSQL 14 + PostgREST (REST API over SQL).
*   **Mobile**: Capacitor (Android).

### Key Folder Structure
```
d:\App\Aquvit Fix - Copy\
├── src/
│   ├── components/         # UI Components (Feature-based & shadcn/ui)
│   ├── hooks/             # React Custom Hooks (Game Logic)
│   │   ├── useRetasi.ts            # ⚠️ ACTIVE: Canvas/Sales/Return Logic
│   │   ├── useTransactions.ts      # Core Sales Logic
│   │   └── useTransactionPayments.ts # Payment Logic
│   ├── pages/             # Route Pages (PosPage, Dashboard, etc.)
│   ├── services/          # Business Logic extracted from UI
│   │   └── journalService.ts       # Auto-journal entry generation
│   ├── contexts/          # Global State (Auth, Branch, Timezone)
│   └── integrations/      # Supabase/PostgREST Client configurations
│
├── database/              # Database Migrations & RPCs
│   ├── rpc/              # ⚠️ CORE LOGIC LIVES HERE (v4.3)
│   │   ├── 01_fifo_inventory.sql   # FIFO Logic
│   │   ├── 03_journal.sql          # Atomic Journal Creation
│   │   ├── 05_delivery.sql         # Delivery & Stock Reduction
│   │   └── pay_receivable_complete_rpc.sql # Recent Fix
│   └── migrations/       # SQL Migration files
│
├── .env.local            # Local Environment config
└── Aquvit_temp.pem       # SSH Key (Use this one!)
```

### Critical RPC Functions (Atomic Operations)
The system relies on **PostgreSQL RPCs** for data integrity. Frontend calls `supabase.rpc('function_name', params)`.

**Key Functions Present on Production:**
*   `create_retasi_atomic`: Handles Retasi creation.
*   `mark_retasi_returned_atomic`: Processes updates and returns.
*   `pay_receivable_complete_rpc`: Handles debt payments + journals.
*   `consume_inventory_fifo_v3`: Latest FIFO stock logic.

---

## 4. ⚠️ Current Focus & Next Steps
**Active Task**: Auditing Stock & Validating Retasi Logic.

1.  **Frontend**: Modifying `src/hooks/useRetasi.ts` to ensure correct data is sent to RPC.
2.  **Database**: 
    *   `audit_stock_gap_v2.sql` is ready to run to find inventory mismatches.
    *   Validating `pay_receivable_complete_rpc` deployment.



# AQUVIT ERP - Post-RPC Migration Audit

## Audit Date: 2026-01-06

### Context
Setelah migrasi ke RPC semalam, dilakukan audit menyeluruh untuk memastikan semua fungsi bekerja dengan benar.

---

## 1. TABLE `TRANSACTIONS` (Penjualan)

### ✅ RPC Functions
| Operation | RPC Function | Journal | Status |
|-----------|--------------|---------|--------|
| **CREATE** | `create_transaction_atomic` | ✅ YES | ✅ Working |
| **UPDATE** | `update_transaction_atomic` | ✅ YES | ✅ Fixed (2026-01-06) |
| **DELETE** | `void_transaction_atomic` | ✅ Voided | ✅ Working |

### 📊 Journal Entries

#### Skenario A: LUNAS (Paid Full)
```
Dr. 1110 Kas                    Rp XXX (Penerimaan kas)
Cr. 4100 Pendapatan Penjualan   Rp XXX
Dr. 5100 HPP                    Rp XXX (Harga Pokok)
Cr. 1310 Persediaan             Rp XXX (Pengurangan stock)
```

#### Skenario B: KREDIT (Belum Bayar)
```
Dr. 1210 Piutang Usaha          Rp XXX
Cr. 4100 Pendapatan Penjualan   Rp XXX
Dr. 5100 HPP                    Rp XXX
Cr. 1310 Persediaan             Rp XXX
```

#### Skenario C: BAYAR SEBAGIAN (Partial)
```
Dr. 1110 Kas                    Rp XXX (Paid amount)
Dr. 1210 Piutang Usaha          Rp XXX (Remaining)
Cr. 4100 Pendapatan Penjualan   Rp XXX (Total)
Dr. 5100 HPP                    Rp XXX
Cr. 1310 Persediaan             Rp XXX
```

#### Skenario D: Item Bonus
```
Dr. 5210 HPP Bonus/Gratis       Rp XXX (Item bonus)
(Selain jurnal normal di atas)
```

### 🔧 Akun yang Terhubung
- **1110** - Kas (Debit, jika paid_amount > 0)
- **1210** - Piutang Usaha (Debit, jika paid_amount < total)
- **4100** - Pendapatan Penjualan (Credit, selalu)
- **5100** - HPP (Debit, item biasa)
- **5210** - HPP Bonus/Gratis (Debit, item bonus)
- **1310** - Persediaan Barang Dagang (Credit, selalu)

### 🐛 Issues Fixed
1. **Edit Transaction Error** (Fixed 2026-01-06)
   - Missing `v_fifo_result` variable declaration
   - Wrong SELECT syntax in journal creation
   - Status: ✅ Deployed to production

---

## 2. TABLE `DELIVERIES` (Pengantaran)

### ✅ RPC Functions
| Operation | RPC Function | Journal | Status |
|-----------|--------------|---------|--------|
| **CREATE** | `process_delivery_atomic` | ✅ YES | ✅ Working |
| **UPDATE** | `update_delivery_atomic` | ✅ YES | ⚠️ Wrong reference_type |
| **DELETE** | via `void_transaction_atomic` | ✅ Voided | ✅ Working |

### 📊 Journal Entries

#### Non-Office Sale (Stock consumed at delivery)
```
Dr. 2140 Modal Barang Dagang Tertahan   Rp XXX (Realisasi Pengiriman)
Cr. 1310 Persediaan Barang Dagang       Rp XXX (Barang Keluar Gudang)
```

**Penjelasan:**
- **2140** = Liability yang dibuat saat transaksi (accrual)
- Saat delivery, liability di-clear karena barang sudah keluar
- Stock dikurangi dengan FIFO real-time

#### Office Sale (Stock consumed at transaction)
```
TIDAK ADA JURNAL DELIVERY
(Stock sudah dikurangi saat create transaction)
```

### 🔧 Akun yang Terhubung
- **2140** - Modal Barang Dagang Tertahan (Debit, clear liability)
- **1310** - Persediaan Barang Dagang (Credit, stock out)

### ⚠️ Issues Found
1. **Wrong Reference Type in Update Delivery**
   - Location: `database/rpc/19_delivery_management.sql` line 168
   - Current: `reference_type = 'adjustment'`
   - Should be: `reference_type = 'delivery'`
   - Impact: Journals tidak ter-track dengan benar sebagai delivery
   - Status: ⚠️ **BELUM DIPERBAIKI**

### 🎯 Commission Generation
- ✅ Driver commission created (if driver assigned)
- ✅ Helper commission created (if helper assigned)
- Based on `commission_rules` table

---

## 3. TABLE `PURCHASE_ORDERS` (PO)

### ✅ RPC Functions
| Operation | RPC Function | Journal | Status |
|-----------|--------------|---------|--------|
| **CREATE** | `create_purchase_order_atomic` | ❌ NO | ✅ Working |
| **APPROVE** | `approve_purchase_order_atomic` | ✅ YES | ✅ Fixed (2026-01-06) |
| **RECEIVE** | `receive_po_atomic` | ❌ NO | ✅ Working |
| **DELETE** | `delete_po_atomic` | ✅ Voided | ✅ Working |

### 📊 Journal Entries

#### PO Approval (Create Liability)
```
Dr. 1320 Persediaan Bahan Baku      Rp XXX (Material)
Dr. 1310 Persediaan Barang Dagang   Rp XXX (Product)
Dr. 1230 PPN Masukan                Rp XXX (Tax)
Cr. 2110 Hutang Usaha               Rp XXX (Total)
```

### 🔧 Akun yang Terhubung
- **1320** - Persediaan Bahan Baku (Debit, for materials)
- **1310** - Persediaan Barang Dagang (Debit, for products)
- **1230** - PPN Masukan (Debit, if PPN included)
- **2110** - Hutang Usaha (Credit, total liability)

### 🐛 Issues Fixed
1. **Duplicate PO Payable Journals** (Fixed 2026-01-06)
   - Problem: Hutang tercatat 2x (dari approve + manual AP creation)
   - Solution: 
     - Added duplicate check in `approve_purchase_order_atomic`
     - Added PO validation in `create_accounts_payable_atomic`
     - Frontend validation in `useAccountsPayable.ts`
   - Status: ✅ Deployed to production

---

## 4. TABLE `ACCOUNTS_PAYABLE` (Hutang)

### ✅ RPC Functions
| Operation | RPC Function | Journal | Status |
|-----------|--------------|---------|--------|
| **CREATE** | `create_accounts_payable_atomic` | ✅ YES | ✅ Fixed (2026-01-06) |
| **PAY** | `pay_supplier_atomic` | ✅ YES | ✅ Working |
| **DELETE** | `delete_accounts_payable_atomic` | ✅ Voided | ✅ Working |

### 📊 Journal Entries

#### Create Manual AP
```
Dr. 5110 Pembelian              Rp XXX (Default)
Cr. 2110 Hutang Usaha           Rp XXX
```

#### Pay AP
```
Dr. 2110 Hutang Usaha           Rp XXX (Reduce liability)
Cr. 1110 Kas / 1120 Bank        Rp XXX (Payment)
```

### 🔧 Akun yang Terhubung
- **5110** - Pembelian (Debit, for manual AP)
- **2110** - Hutang Usaha (Credit for create, Debit for pay)
- **1110** - Kas (Credit, if payment method = cash)
- **1120** - Bank (Credit, if payment method = transfer)

### 🐛 Issues Fixed
1. **Manual AP Creation for PO** (Fixed 2026-01-06)
   - Problem: User bisa create manual AP untuk PO yang sudah punya AP
   - Solution: Added validation to prevent duplicate
   - Status: ✅ Deployed to production

---

## 5. TABLE `RETASI` (Pengembalian/Return)

### ✅ RPC Functions (21_retasi_management.sql)

| Operation | RPC Function | Journal | Stock Restore | Status |
|-----------|--------------|---------|---------------|--------|
| **CREATE** | `create_retasi_atomic` | ❌ NO | ❌ NO | ✅ Working |
| **MARK RETURNED** | `mark_retasi_returned_atomic` | ❌ NO | ❌ NO | ✅ Working |
| **UPDATE** | Direct table update | ❌ NO | ❌ NO | ✅ Working |
| **DELETE** | Direct table delete | ❌ NO | ❌ NO | ✅ Working |

### 📊 Purpose: TRACKING ONLY

**User Confirmation:** RETASI hanya untuk tracking, **TIDAK perlu jurnal**

**What RETASI Does:**
1. ✅ Mencatat keberangkatan driver dengan barang (truck loading)
2. ✅ Mencatat pengembalian (barang laku/tidak laku/rusak)
3. ✅ Tracking performa driver dan helper
4. ❌ Tidak ada impact ke accounting (by design)
5. ❌ Tidak ada stock restore otomatis (by design)

### 🎯 Frontend Implementation

**File**: `src/hooks/useRetasi.ts`

**Create Retasi** (Line 296-356):
```typescript
const { data: rpcResultRaw, error: rpcError } = await supabase
  .rpc('create_retasi_atomic', {
    p_branch_id: currentBranch.id,
    p_driver_name: mainData.driver_name,
    p_helper_name: mainData.helper_name || null,
    p_truck_number: mainData.truck_number || null,
    p_route: mainData.route || null,
    p_departure_date: mainData.departure_date,
    p_departure_time: mainData.departure_time || null,
    p_notes: mainData.notes || '',
    p_items: items,
    p_created_by: user?.id || null
  });
```

**Mark Returned** (Line 359-400):
```typescript
const { data: rpcResultRaw, error: rpcError } = await supabase
  .rpc('mark_retasi_returned_atomic', {
    p_branch_id: currentBranch.id,
    p_retasi_id: retasiId,
    p_return_notes: returnData.return_notes || '',
    p_item_returns: returnData.item_returns
  });
```

### ✅ Implementation Status

**Current Implementation:**
- ✅ CREATE retasi working
- ✅ MARK returned working  
- ✅ UPDATE working
- ✅ DELETE working
- ✅ Driver availability check working
- ✅ Statistics tracking working

**No Changes Needed** - Implementation is correct for tracking-only purpose.

---

## Summary of Accounts Used

### Assets (Aktiva)
- **1110** - Kas
- **1120** - Bank
- **1210** - Piutang Usaha
- **1230** - PPN Masukan
- **1310** - Persediaan Barang Dagang
- **1320** - Persediaan Bahan Baku

### Liabilities (Kewajiban)
- **2110** - Hutang Usaha
- **2140** - Modal Barang Dagang Tertahan

### Revenue (Pendapatan)
- **4100** - Pendapatan Penjualan

### Expenses (Beban)
- **5100** - HPP (Harga Pokok Penjualan)
- **5110** - Pembelian
- **5210** - HPP Bonus/Gratis

---

## Pending Issues

### ⚠️ High Priority
1. **Delivery Update Reference Type** ✅ **FIXED (2026-01-06)**
   - File: `database/rpc/19_delivery_management.sql`
   - Line: 168
   - Change: `reference_type = 'adjustment'` to `'delivery'`
   - Status: ✅ Deployed to production

### 📋 To Be Audited
- [ ] Production records (table `production_records`)
- [ ] Expenses (table `expenses`)
- [ ] Payroll (table `payroll`)
- [ ] Stock adjustments (table `stock_adjustments`)
- [ ] Commission payments (table `commission_entries`)

### ✅ Confirmed Working (No Changes Needed)
- ✅ **RETASI** - Tracking-only (no journal by design)

---

## Deployment History

### 2026-01-06
1. ✅ Fixed `update_transaction_atomic` (missing v_fifo_result)
2. ✅ Fixed `approve_purchase_order_atomic` (duplicate prevention)
3. ✅ Fixed `create_accounts_payable_atomic` (PO validation)
4. ✅ Deployed to Nabire (aquvit_new)
5. ✅ Deployed to Manokwari (mkw_db)
6. ✅ PostgREST restarted

---

## Notes
- All RPC functions use `branch_id` for data isolation
- FIFO inventory consumption implemented
- Double-entry bookkeeping enforced
- Commission auto-generation working
- User sudah void manual duplicate journals

---

Last Updated: 2026-01-06 16:23 WIT


