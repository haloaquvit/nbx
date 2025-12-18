# Implementasi Filter Cabang (Branch Filter)

## Tujuan
Memastikan setiap user hanya melihat data sesuai dengan cabang mereka, dan user Head Office dapat switch cabang untuk melihat data cabang lain.

## Status Implementasi

### ✅ Sudah Selesai:
1. **BranchContext** - Updated dengan query invalidation dan notifikasi
   - Menambahkan `queryClient.invalidateQueries()` saat switch branch
   - Toast notification saat pindah cabang
   - Branch tersimpan di localStorage untuk persistence

2. **BranchSelector** - Component untuk switch cabang
   - Menampilkan cabang saat ini
   - Hanya tampil untuk user yang bisa akses multi cabang
   - UI yang clean dengan search

### 🔄 Perlu Implementasi:

#### 1. Update Database Schema
Pastikan semua tabel penting memiliki kolom `branch_id`:

```sql
-- Tabel yang perlu kolom branch_id:
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE cash_history ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE material_stock_movements ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
```

#### 2. Update Hooks untuk Gunakan Branch Filter

**Pattern yang harus diikuti:**
```typescript
import { useBranch } from '@/contexts/BranchContext';

export const useDataHook = () => {
  const { currentBranch } = useBranch();

  const { data } = useQuery({
    queryKey: ['data', currentBranch?.id], // PENTING: include branch ID di query key
    queryFn: async () => {
      let query = supabase.from('table').select('*');

      // Filter berdasarkan branch jika bukan head office
      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!currentBranch, // Hanya run jika branch sudah loaded
  });

  return { data };
};
```

**Hooks yang perlu diupdate:**

- [ ] `useTransactions.ts`
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

#### 3. Update Mutations untuk Auto-set Branch ID

Setiap kali create data baru, otomatis set branch_id:

```typescript
const { currentBranch } = useBranch();

const addMutation = useMutation({
  mutationFn: async (data: NewData) => {
    const dataWithBranch = {
      ...data,
      branch_id: currentBranch?.id, // Auto-set branch
    };

    const { data: result, error } = await supabase
      .from('table')
      .insert([dataWithBranch])
      .select()
      .single();

    if (error) throw error;
    return result;
  },
});
```

#### 4. Update RLS Policies

Tambahkan RLS policy untuk enforce branch filtering di database level:

```sql
-- Example untuk transactions
CREATE POLICY "Users can only see their branch transactions"
  ON transactions
  FOR SELECT
  USING (
    branch_id IN (
      SELECT branch_id FROM profiles WHERE id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'owner', 'head_office_admin')
    )
  );

-- Repeat untuk semua tabel dengan branch_id
```

## Testing Checklist

- [ ] User biasa hanya lihat data cabang mereka
- [ ] Head office bisa switch cabang
- [ ] Setelah switch, semua data refresh dengan cabang baru
- [ ] Toast notification muncul saat pindah cabang
- [ ] Data baru auto-set branch_id sesuai cabang aktif
- [ ] Filter cabang persist setelah refresh browser
- [ ] RLS policy enforce branch access di database level

## Migration Strategy

1. **Fase 1**: Update database schema
   - Tambah kolom branch_id ke semua tabel
   - Set branch_id untuk data existing (migrasi data lama)

2. **Fase 2**: Update hooks (one by one)
   - Mulai dari hooks paling penting (transactions, customers, products)
   - Test setiap hook setelah update

3. **Fase 3**: Update mutations
   - Tambahkan auto-set branch_id di semua create/insert

4. **Fase 4**: RLS policies
   - Tambahkan policies untuk enforce access

5. **Fase 5**: Testing & QA
   - Test dengan berbagai role
   - Test switch cabang
   - Verify data isolation

## Notes

- Gunakan `currentBranch?.id` dari `useBranch()` hook
- Selalu include `currentBranch?.id` di query key untuk proper cache invalidation
- Set `enabled: !!currentBranch` untuk avoid query run sebelum branch loaded
- Untuk head office yang lihat semua cabang, bisa skip filter branch_id
