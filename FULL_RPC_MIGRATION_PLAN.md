# IMPLEMENATION PLAN: FULL RPC MIGRATION

## Tujuan
Mengubah arsitektur aplikasi dari "Heavy Client" (logika bisnis di frontend) menjadi "Fully RPC / Thin Client" (logika bisnis di database/backend). Ini akan meningkatkan stabilitas data, mencegah race condition, menyederhanakan kode frontend, dan memperbaiki isu sinkronisasi stok/jurnal.

## Status Saat Ini (Current State)
- **Database**: Sudah memiliki RPC yang sangat lengkap dan matang (`create_transaction_atomic`, `receive_payment_atomic`, dll).
- **Frontend**: Masih melakukan operasi database secara manual dan terpisah-pisah (Insert Transaction -> Insert Payment -> Update Stock -> Create Journal). Ini berisiko tinggi menyebabkan data tidak konsisten.

## Rencana Migrasi (Migration Plan)

### Phase 1: Transactions (CRITICAL)
Refactor `useTransactions.ts` untuk menggunakan `create_transaction_atomic`.
- [ ] Hapus logika manual `insert transactions`
- [ ] Hapus logika manual `insert transaction_payments`
- [ ] Hapus logika manual `StockService.processTransactionStock` (karena sudah di-handle RPC)
- [ ] Hapus logika manual `createSalesJournal` (karena sudah di-handle RPC)
- [ ] Hapus logika manual `generateSalesCommission` (karena sudah di-handle RPC)
- [ ] Ganti semua dengan satu panggilan: `supabase.rpc('create_transaction_atomic', ...)`

### Phase 2: Payments (Receivable & Payable)
Refactor pembayaran piutang dan hutang menggunakan RPC.
- [ ] Cari penggunaan manual update saldo dan jurnal pembayaran.
- [ ] Implementasi `receive_payment_atomic` untuk pelunasan piutang.
- [ ] Implementasi `pay_supplier_atomic` untuk pembayaran hutang supplier.

### Phase 3: Delivery (Pengiriman)
Pastikan modul delivery menggunakan `process_delivery_atomic` sepenuhnya.
- [ ] Review `useDeliveries.ts`.
- [ ] Hapus kode fallback legacy yang masih melakukan manual update.
- [ ] Pastikan semua jalur menggunakan `process_delivery_atomic`.

### Phase 4: Production & Assembly
Refactor modul produksi.
- [ ] Cek `useProduction.ts` (jika ada).
- [ ] Gunakan RPC `create_production_atomic` (perlu update file RPC jika belum ada, tapi sepertinya file `04_production.sql` sudah ada).

## Detail Teknis Phase 1: `useTransactions.ts`

**RPC Signature:**
```sql
create_transaction_atomic(
  p_transaction JSONB,
  p_items JSONB,
  p_branch_id UUID,
  p_cashier_id UUID,
  p_cashier_name TEXT,
  p_quotation_id TEXT
)
```

**Langkah Refactor Code:**
1. Siapkan payload `p_transaction` dan `p_items` dari object `newTransaction`.
2. Panggil RPC.
3. Handle response RPC (success/fail).
4. Update cache React Query.

## Next Steps
Saya akan mulai dengan **Phase 1: Transactions**. Ini adalah perubahan terbesar dan paling berdampak.
