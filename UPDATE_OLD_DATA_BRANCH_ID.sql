-- ==========================================
-- UPDATE BRANCH_ID UNTUK DATA LAMA
-- Jalankan SQL ini di Supabase SQL Editor
-- ==========================================

-- Cek dulu ID cabang yang ada
SELECT id, name FROM branches ORDER BY created_at;

-- PENTING: Ganti UUID di bawah dengan ID cabang yang sesuai dari query di atas!

DO $$
DECLARE
  kantor_pusat_id UUID;
  eskristal_id UUID;
BEGIN
  -- Ambil ID Kantor Pusat
  SELECT id INTO kantor_pusat_id
  FROM branches
  WHERE name = 'Kantor Pusat'
  LIMIT 1;

  -- Ambil ID Eskristal Aqvuit
  SELECT id INTO eskristal_id
  FROM branches
  WHERE name = 'Eskristal Aqvuit'
  LIMIT 1;

  RAISE NOTICE '====================================';
  RAISE NOTICE 'Kantor Pusat ID: %', kantor_pusat_id;
  RAISE NOTICE 'Eskristal Aqvuit ID: %', eskristal_id;
  RAISE NOTICE '====================================';

  -- Jika branch tidak ditemukan, stop
  IF kantor_pusat_id IS NULL THEN
    RAISE EXCEPTION 'Kantor Pusat tidak ditemukan!';
  END IF;

  -- ==========================================
  -- UPDATE DATA LAMA - SET BRANCH_ID
  -- ==========================================

  -- Update profiles (karyawan) yang belum punya branch_id
  UPDATE profiles
  SET branch_id = kantor_pusat_id
  WHERE branch_id IS NULL
  AND role NOT IN ('super_admin', 'head_office_admin');

  RAISE NOTICE 'Updated % profiles', (SELECT COUNT(*) FROM profiles WHERE branch_id = kantor_pusat_id);

  -- Update transactions yang belum punya branch_id
  UPDATE transactions
  SET branch_id = kantor_pusat_id
  WHERE branch_id IS NULL;

  RAISE NOTICE 'Updated % transactions', (SELECT COUNT(*) FROM transactions WHERE branch_id = kantor_pusat_id);

  -- Update products yang belum punya branch_id
  UPDATE products
  SET branch_id = kantor_pusat_id
  WHERE branch_id IS NULL;

  RAISE NOTICE 'Updated % products', (SELECT COUNT(*) FROM products WHERE branch_id = kantor_pusat_id);

  -- Update customers yang belum punya branch_id
  UPDATE customers
  SET branch_id = kantor_pusat_id
  WHERE branch_id IS NULL;

  RAISE NOTICE 'Updated % customers', (SELECT COUNT(*) FROM customers WHERE branch_id = kantor_pusat_id);

  -- Update materials yang belum punya branch_id
  UPDATE materials
  SET branch_id = kantor_pusat_id
  WHERE branch_id IS NULL;

  RAISE NOTICE 'Updated % materials', (SELECT COUNT(*) FROM materials WHERE branch_id = kantor_pusat_id);

  -- Update purchase_orders yang belum punya branch_id
  UPDATE purchase_orders
  SET branch_id = kantor_pusat_id
  WHERE branch_id IS NULL;

  RAISE NOTICE 'Updated % purchase_orders', (SELECT COUNT(*) FROM purchase_orders WHERE branch_id = kantor_pusat_id);

  -- Update deliveries yang belum punya branch_id
  UPDATE deliveries
  SET branch_id = kantor_pusat_id
  WHERE branch_id IS NULL;

  RAISE NOTICE 'Updated % deliveries', (SELECT COUNT(*) FROM deliveries WHERE branch_id = kantor_pusat_id);

  -- Update cash_history yang belum punya branch_id
  UPDATE cash_history
  SET branch_id = kantor_pusat_id
  WHERE branch_id IS NULL;

  RAISE NOTICE 'Updated % cash_history', (SELECT COUNT(*) FROM cash_history WHERE branch_id = kantor_pusat_id);

  -- Update stock_movements yang belum punya branch_id
  UPDATE stock_movements
  SET branch_id = kantor_pusat_id
  WHERE branch_id IS NULL;

  RAISE NOTICE 'Updated % stock_movements', (SELECT COUNT(*) FROM stock_movements WHERE branch_id = kantor_pusat_id);

  -- Update retasi yang belum punya branch_id
  UPDATE retasi
  SET branch_id = kantor_pusat_id
  WHERE branch_id IS NULL;

  RAISE NOTICE 'Updated % retasi', (SELECT COUNT(*) FROM retasi WHERE branch_id = kantor_pusat_id);

  RAISE NOTICE '====================================';
  RAISE NOTICE 'SELESAI! Semua data lama sudah diberi branch_id';
  RAISE NOTICE '====================================';
END $$;

-- ==========================================
-- VERIFIKASI HASIL
-- ==========================================

-- Cek berapa data yang masih NULL branch_id
SELECT
  'profiles' as table_name,
  COUNT(*) FILTER (WHERE branch_id IS NULL) as null_count,
  COUNT(*) FILTER (WHERE branch_id IS NOT NULL) as has_branch_count,
  COUNT(*) as total
FROM profiles
WHERE role NOT IN ('super_admin', 'head_office_admin')

UNION ALL

SELECT
  'transactions',
  COUNT(*) FILTER (WHERE branch_id IS NULL),
  COUNT(*) FILTER (WHERE branch_id IS NOT NULL),
  COUNT(*)
FROM transactions

UNION ALL

SELECT
  'products',
  COUNT(*) FILTER (WHERE branch_id IS NULL),
  COUNT(*) FILTER (WHERE branch_id IS NOT NULL),
  COUNT(*)
FROM products

UNION ALL

SELECT
  'customers',
  COUNT(*) FILTER (WHERE branch_id IS NULL),
  COUNT(*) FILTER (WHERE branch_id IS NOT NULL),
  COUNT(*)
FROM customers

UNION ALL

SELECT
  'materials',
  COUNT(*) FILTER (WHERE branch_id IS NULL),
  COUNT(*) FILTER (WHERE branch_id IS NOT NULL),
  COUNT(*)
FROM materials

UNION ALL

SELECT
  'purchase_orders',
  COUNT(*) FILTER (WHERE branch_id IS NULL),
  COUNT(*) FILTER (WHERE branch_id IS NOT NULL),
  COUNT(*)
FROM purchase_orders

UNION ALL

SELECT
  'deliveries',
  COUNT(*) FILTER (WHERE branch_id IS NULL),
  COUNT(*) FILTER (WHERE branch_id IS NOT NULL),
  COUNT(*)
FROM deliveries;
