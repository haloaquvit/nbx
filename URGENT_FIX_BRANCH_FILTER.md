# 🚨 URGENT: Fix Branch Filter untuk Data Karyawan

## Masalah Saat Ini

Data karyawan masih menampilkan semua data dari pusat, meskipun sudah pindah ke cabang "Eskristal Aqvuit".

## Penyebabnya

1. ✅ Hook `useEmployees` sudah diupdate dengan branch filter
2. ❌ Database belum punya kolom `branch_id` di tabel `profiles`
3. ❌ Migration belum dijalankan

## Solusi - Jalankan Migration

### Option 1: Manual SQL (Rekomendasi - Lebih Cepat)

Jalankan SQL berikut di Supabase SQL Editor:

```sql
-- Add branch_id to profiles table
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- Create index
CREATE INDEX IF NOT EXISTS idx_profiles_branch_id ON profiles(branch_id);

-- Set branch_id for existing users (gunakan ID cabang default Anda)
-- Ganti 'YOUR_DEFAULT_BRANCH_ID' dengan ID cabang default
UPDATE profiles
SET branch_id = (
  SELECT id FROM branches
  WHERE name = 'Kantor Pusat' -- atau nama cabang default Anda
  LIMIT 1
)
WHERE branch_id IS NULL
AND role NOT IN ('super_admin', 'head_office_admin');
```

### Option 2: Run Full Migration (Complete)

```bash
cd "d:\App\Aquvit Fix - Copy"
npx supabase db push
```

**Warning**: Ini akan menjalankan SEMUA migration, termasuk menambah `branch_id` ke 16+ tabel lain.

## Setelah Migration Berhasil

1. **Refresh browser** (hard refresh: Ctrl+Shift+R)
2. **Switch cabang** di branch selector
3. **Verify**: Data karyawan hanya tampil sesuai cabang yang dipilih

## Testing Quick

Setelah migration:

1. Login sebagai Owner (Syahruddin Makki)
2. Switch cabang ke "Eskristal Aqvuit"
3. Buka halaman Manajemen Karyawan
4. ✅ Seharusnya hanya tampil karyawan dari cabang Eskristal Aqvuit

## Jika Masih Error

### Error: "column branch_id does not exist"

Jalankan SQL manual di atas untuk add kolom `branch_id` ke `profiles`.

### Error: RLS policy violation

Sementara disable RLS untuk testing:
```sql
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
```

Setelah testing berhasil, enable kembali:
```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
```

## Current Status

- ✅ BranchContext updated (query invalidation + toast)
- ✅ useTransactions updated (branch filter)
- ✅ useEmployees updated (branch filter) **← BARU**
- ✅ Migration file ready (0200_add_branch_filter_system.sql)
- ❌ Migration belum dijalankan **← HARUS DIJALANKAN**

## Next Files to Update (Setelah Migration Berhasil)

Setelah employees berfungsi, update hooks berikut dengan pattern yang sama:

1. useCustomers.ts
2. useProducts.ts
3. useMaterials.ts
4. usePurchaseOrders.ts
5. Dan seterusnya...

Gunakan pattern dari `useEmployees.ts` atau `useTransactions.ts`.
