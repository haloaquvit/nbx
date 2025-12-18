# Cara Menggunakan Sistem Filter Cabang

## Overview

Sistem branch filter memungkinkan:
1. **User biasa**: Hanya melihat data dari cabang mereka sendiri
2. **Head Office (Owner/Super Admin)**: Dapat melihat semua cabang DAN bisa switch cabang untuk melihat data cabang tertentu
3. **Auto-filter**: Data otomatis di-filter berdasarkan cabang saat di-query
4. **Auto-set branch**: Data baru otomatis di-set branch_id sesuai cabang user

## Langkah-langkah Implementasi

### 1. Jalankan Migration Database

```bash
# Jalankan migration untuk add branch_id columns
npx supabase db push
```

Migration akan:
- Menambah kolom `branch_id` ke semua tabel penting
- Membuat index untuk performance
- Migrate data lama (set branch_id untuk data existing)
- Setup RLS policies untuk enforce branch access
- Membuat trigger untuk auto-set branch_id

### 2. Update Sudah Selesai di BranchContext

✅ **BranchContext** (`src/contexts/BranchContext.tsx`) sudah diupdate dengan:
- Query invalidation saat switch branch
- Toast notification
- Branch persistence di localStorage

### 3. Gunakan useBranch Hook di Hooks Data Lainnya

**Pattern yang harus diikuti:**

```typescript
import { useBranch } from '@/contexts/BranchContext';

export const useYourDataHook = () => {
  const { currentBranch, canAccessAllBranches } = useBranch();

  const { data } = useQuery({
    queryKey: ['your-data', currentBranch?.id], // Include branch ID
    queryFn: async () => {
      let query = supabase.from('your_table').select('*');

      // Filter by branch (skip if head office viewing all branches)
      if (currentBranch?.id && !canAccessAllBranches) {
        query = query.eq('branch_id', currentBranch.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!currentBranch, // Only run when branch loaded
  });

  return { data };
};
```

### 4. Testing

#### Test sebagai User Biasa:
1. Login sebagai user dengan role selain owner/super_admin
2. Buka halaman transactions/customers/products
3. Verify: Hanya data dari cabang user yang terlihat

#### Test sebagai Head Office:
1. Login sebagai owner/super_admin
2. Lihat branch selector di header
3. Switch ke cabang lain
4. Verify:
   - Toast notification muncul "Cabang berhasil dipindah"
   - Data refresh untuk cabang baru
   - Semua halaman menampilkan data cabang yang dipilih

#### Test Create Data:
1. Buat transaction/customer/product baru
2. Cek di database: `branch_id` otomatis terisi sesuai cabang user

### 5. Contoh Implementasi

**useTransactions.ts** - ✅ Sudah diupdate:

```typescript
export const useTransactions = (filters?) => {
  const { currentBranch, canAccessAllBranches } = useBranch();

  const { data: transactions } = useQuery({
    queryKey: ['transactions', filters, currentBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false });

      // Branch filter
      if (currentBranch?.id && !canAccessAllBranches) {
        query = query.eq('branch_id', currentBranch.id);
      }

      // Apply other filters...

      const { data, error } = await query;
      if (error) throw error;
      return data.map(fromDb);
    },
    enabled: !!currentBranch,
  });

  return { transactions };
};
```

## Hooks yang Perlu Diupdate

Hooks berikut belum diupdate dan masih perlu ditambahkan branch filter:

- [ ] `useCustomers.ts`
- [ ] `useProducts.ts`
- [ ] `useMaterials.ts`
- [ ] `usePurchaseOrders.ts`
- [ ] `useEmployees.ts`
- [ ] `useAccounts.ts`
- [ ] `useCashFlow.ts`
- [ ] `useDeliveries.ts`
- [ ] `useRetasi.ts`
- [ ] `useCommissions.ts`
- [ ] `useAssets.ts`
- [ ] `useMaintenance.ts`
- [ ] `useZakat.ts`

Gunakan pattern yang sama seperti di `useTransactions.ts`.

## Troubleshooting

### Data tidak muncul setelah switch cabang
- Periksa: Apakah `currentBranch?.id` ada di queryKey?
- Periksa: Apakah data di database memiliki `branch_id`?
- Periksa console: Apakah ada error dari query?

### Branch selector tidak muncul
- Periksa: Apakah user memiliki role owner/super_admin?
- Periksa: Apakah ada lebih dari 1 cabang aktif?

### Data lama tidak punya branch_id
- Jalankan migration lagi, bagian data migration akan set branch_id untuk data lama

## FAQ

**Q: Bagaimana cara head office lihat semua data dari semua cabang?**
A: Tidak ada filter yang di-apply jika `canAccessAllBranches = true`. Data dari semua cabang akan terlihat.

**Q: Apakah user biasa bisa switch cabang?**
A: Tidak. Branch selector hanya muncul untuk role owner/super_admin/head_office_admin.

**Q: Bagaimana cara set branch_id manual saat create data?**
A: Branch_id sudah otomatis ter-set via database trigger. Tapi bisa juga di-set manual di aplikasi jika perlu.

## Next Steps

1. ✅ BranchContext sudah diupdate dengan invalidation
2. ✅ useTransactions sudah diupdate dengan branch filter
3. ⏳ Run migration database
4. ⏳ Update hooks lainnya (gunakan pattern dari useTransactions)
5. ⏳ Testing menyeluruh
6. ⏳ Deploy ke production
