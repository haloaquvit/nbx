-- =====================================================
-- SCRIPT UNTUK MEMPERBAIKI DATA HPP / MATERIAL MOVEMENTS
-- Jalankan di Supabase SQL Editor: https://supabase.com/dashboard/project/emfvoassfrsokqwspuml/sql/new
-- =====================================================

-- LANGKAH 1: Lihat dulu movement IN yang salah (dari delete produksi sebelumnya)
SELECT
    id,
    material_name,
    type,
    reason,
    quantity,
    notes,
    reference_id,
    reference_type,
    created_at
FROM material_stock_movements
WHERE type = 'IN'
AND (
    notes LIKE '%PRODUCTION_DELETE%'
    OR notes LIKE '%Production delete restore%'
    OR (reason = 'ADJUSTMENT' AND reference_type = 'production')
)
ORDER BY created_at DESC;

-- =====================================================
-- LANGKAH 2: Cari movement OUT yang seharusnya sudah dihapus tapi masih ada
-- (ini adalah produksi yang sudah di-delete tapi movement OUT masih ada)
-- =====================================================
SELECT
    msm.id,
    msm.material_name,
    msm.type,
    msm.reason,
    msm.quantity,
    msm.notes,
    msm.reference_id,
    msm.created_at,
    pr.id as production_exists
FROM material_stock_movements msm
LEFT JOIN production_records pr ON pr.id = msm.reference_id
WHERE msm.reference_type = 'production'
AND msm.type = 'OUT'
AND pr.id IS NULL  -- Production record sudah dihapus
ORDER BY msm.created_at DESC;

-- =====================================================
-- LANGKAH 3: HAPUS movement OUT yang production record-nya sudah tidak ada
-- UNCOMMENT baris di bawah untuk menjalankan
-- =====================================================
/*
DELETE FROM material_stock_movements
WHERE reference_type = 'production'
AND type = 'OUT'
AND reference_id NOT IN (SELECT id FROM production_records);
*/

-- =====================================================
-- LANGKAH 4: HAPUS movement IN yang merupakan "restore" dari delete produksi
-- (karena sekarang kita langsung hapus OUT, tidak perlu IN)
-- UNCOMMENT baris di bawah untuk menjalankan
-- =====================================================
/*
DELETE FROM material_stock_movements
WHERE type = 'IN'
AND (
    notes LIKE '%PRODUCTION_DELETE%'
    OR notes LIKE '%Production delete restore%'
    OR (reason = 'ADJUSTMENT' AND reference_type = 'production')
);
*/

-- =====================================================
-- LANGKAH 5: Verifikasi hasil
-- =====================================================
-- Cek total HPP saat ini (hanya OUT dengan reason tertentu)
SELECT
    SUM(msm.quantity * COALESCE(m.price_per_unit, 0)) as total_hpp,
    COUNT(*) as total_movements
FROM material_stock_movements msm
LEFT JOIN materials m ON m.id = msm.material_id
WHERE msm.type = 'OUT'
AND msm.reason IN ('PRODUCTION_CONSUMPTION', 'RUSAK', 'WASTE', 'DAMAGED', 'LOSS');

-- Breakdown per reason
SELECT
    reason,
    SUM(msm.quantity * COALESCE(m.price_per_unit, 0)) as total_value,
    COUNT(*) as count
FROM material_stock_movements msm
LEFT JOIN materials m ON m.id = msm.material_id
WHERE msm.type = 'OUT'
GROUP BY reason
ORDER BY total_value DESC;
