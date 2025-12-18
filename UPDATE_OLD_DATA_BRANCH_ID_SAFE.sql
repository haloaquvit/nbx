-- ==========================================
-- UPDATE BRANCH_ID UNTUK DATA LAMA (SAFE VERSION)
-- Hanya update tabel yang pasti ada
-- Jalankan SQL ini di Supabase SQL Editor
-- ==========================================

-- Cek dulu ID cabang yang ada
SELECT id, name FROM branches ORDER BY created_at;

-- IMPORTANT: Script ini akan set SEMUA data lama ke Kantor Pusat

DO $$
DECLARE
  kantor_pusat_id UUID;
  eskristal_id UUID;
  updated_count INTEGER;
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
    RAISE EXCEPTION 'Kantor Pusat tidak ditemukan! Pastikan sudah ada cabang "Kantor Pusat"';
  END IF;

  -- ==========================================
  -- UPDATE DATA LAMA - SET BRANCH_ID
  -- ==========================================

  -- 1. Update profiles (karyawan)
  UPDATE profiles
  SET branch_id = kantor_pusat_id
  WHERE branch_id IS NULL
  AND role NOT IN ('super_admin', 'head_office_admin');

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE '✅ Updated % profiles', updated_count;

  -- 2. Update transactions
  UPDATE transactions
  SET branch_id = kantor_pusat_id
  WHERE branch_id IS NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE '✅ Updated % transactions', updated_count;

  -- 3. Update products
  UPDATE products
  SET branch_id = kantor_pusat_id
  WHERE branch_id IS NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE '✅ Updated % products', updated_count;

  -- 4. Update customers
  UPDATE customers
  SET branch_id = kantor_pusat_id
  WHERE branch_id IS NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE '✅ Updated % customers', updated_count;

  -- 5. Update materials
  UPDATE materials
  SET branch_id = kantor_pusat_id
  WHERE branch_id IS NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE '✅ Updated % materials', updated_count;

  -- 6. Update purchase_orders (if exists)
  BEGIN
    UPDATE purchase_orders
    SET branch_id = kantor_pusat_id
    WHERE branch_id IS NULL;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE '✅ Updated % purchase_orders', updated_count;
  EXCEPTION
    WHEN undefined_table THEN
      RAISE NOTICE '⚠️  Tabel purchase_orders tidak ada, skip';
  END;

  -- 7. Update deliveries (if exists)
  BEGIN
    UPDATE deliveries
    SET branch_id = kantor_pusat_id
    WHERE branch_id IS NULL;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE '✅ Updated % deliveries', updated_count;
  EXCEPTION
    WHEN undefined_table THEN
      RAISE NOTICE '⚠️  Tabel deliveries tidak ada, skip';
  END;

  -- 8. Update cash_history (if exists)
  BEGIN
    UPDATE cash_history
    SET branch_id = kantor_pusat_id
    WHERE branch_id IS NULL;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE '✅ Updated % cash_history', updated_count;
  EXCEPTION
    WHEN undefined_table THEN
      RAISE NOTICE '⚠️  Tabel cash_history tidak ada, skip';
  END;

  -- 9. Update retasi (if exists)
  BEGIN
    UPDATE retasi
    SET branch_id = kantor_pusat_id
    WHERE branch_id IS NULL;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE '✅ Updated % retasi', updated_count;
  EXCEPTION
    WHEN undefined_table THEN
      RAISE NOTICE '⚠️  Tabel retasi tidak ada, skip';
  END;

  RAISE NOTICE '====================================';
  RAISE NOTICE '✅ SELESAI! Semua data lama sudah diberi branch_id = Kantor Pusat';
  RAISE NOTICE '====================================';
END $$;

-- ==========================================
-- VERIFIKASI HASIL
-- ==========================================

-- Cek data yang sudah punya branch_id
SELECT
  'profiles' as table_name,
  COUNT(*) FILTER (WHERE branch_id IS NULL) as null_count,
  COUNT(*) FILTER (WHERE branch_id IS NOT NULL) as has_branch,
  COUNT(*) as total
FROM profiles
WHERE role NOT IN ('super_admin', 'head_office_admin')

UNION ALL

SELECT 'transactions',
  COUNT(*) FILTER (WHERE branch_id IS NULL),
  COUNT(*) FILTER (WHERE branch_id IS NOT NULL),
  COUNT(*)
FROM transactions

UNION ALL

SELECT 'products',
  COUNT(*) FILTER (WHERE branch_id IS NULL),
  COUNT(*) FILTER (WHERE branch_id IS NOT NULL),
  COUNT(*)
FROM products

UNION ALL

SELECT 'customers',
  COUNT(*) FILTER (WHERE branch_id IS NULL),
  COUNT(*) FILTER (WHERE branch_id IS NOT NULL),
  COUNT(*)
FROM customers

UNION ALL

SELECT 'materials',
  COUNT(*) FILTER (WHERE branch_id IS NULL),
  COUNT(*) FILTER (WHERE branch_id IS NOT NULL),
  COUNT(*)
FROM materials;

-- ==========================================
-- CEK DISTRIBUSI DATA PER CABANG
-- ==========================================

SELECT
  b.name as branch_name,
  COUNT(t.id) as transaction_count,
  COUNT(p.id) as product_count,
  COUNT(c.id) as customer_count
FROM branches b
LEFT JOIN transactions t ON t.branch_id = b.id
LEFT JOIN products p ON p.branch_id = b.id
LEFT JOIN customers c ON c.branch_id = b.id
GROUP BY b.id, b.name
ORDER BY b.name;
