-- ============================================================================
-- KATEGORI PENGELUARAN: BIASA VS BAHAN BAKU UNTUK HPP
-- ============================================================================
-- Memisahkan kategori pengeluaran agar bahan baku masuk ke HPP
-- dan pengeluaran biasa masuk ke beban operasional
-- ============================================================================

-- 1. Add expense_category column to cash_history
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'cash_history'
    AND column_name = 'expense_category'
  ) THEN
    ALTER TABLE public.cash_history
    ADD COLUMN expense_category VARCHAR(50) DEFAULT 'operational';
  END IF;
END $$;

-- 2. Create expense_categories table for reference
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Kategori untuk laporan keuangan
  financial_category VARCHAR(50) NOT NULL CHECK (financial_category IN (
    'cogs_raw_materials',      -- Bahan Baku → HPP
    'cogs_direct_labor',        -- Tenaga Kerja Langsung → HPP
    'cogs_manufacturing_overhead', -- Overhead Pabrik → HPP
    'operating_expense',        -- Beban Operasional
    'administrative_expense',   -- Beban Administrasi
    'selling_expense',          -- Beban Penjualan
    'other_expense'            -- Beban Lain-lain
  )),

  -- Mapping to chart of accounts
  default_account_id TEXT REFERENCES public.accounts(id),

  -- Is active
  is_active BOOLEAN DEFAULT true,

  -- Display order
  sort_order INTEGER DEFAULT 0,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Insert default expense categories
INSERT INTO public.expense_categories (code, name, description, financial_category, sort_order)
VALUES
  -- COGS Categories (Masuk ke HPP)
  ('RAW_MATERIALS', 'Pembelian Bahan Baku', 'Pembelian bahan baku untuk produksi (masuk HPP)', 'cogs_raw_materials', 1),
  ('DIRECT_LABOR', 'Upah Tenaga Kerja Langsung', 'Upah karyawan produksi langsung (masuk HPP)', 'cogs_direct_labor', 2),
  ('FACTORY_OVERHEAD', 'Overhead Pabrik', 'Biaya overhead pabrik: listrik, air, maintenance (masuk HPP)', 'cogs_manufacturing_overhead', 3),

  -- Operating Expenses (Beban Operasional)
  ('SALARY', 'Gaji Karyawan', 'Gaji karyawan non-produksi', 'operating_expense', 10),
  ('RENT', 'Sewa', 'Sewa kantor, gudang, dll', 'operating_expense', 11),
  ('UTILITIES', 'Listrik & Air Kantor', 'Listrik dan air untuk kantor/non-produksi', 'operating_expense', 12),
  ('TRANSPORT', 'Transportasi', 'Biaya transportasi operasional', 'operating_expense', 13),
  ('COMMUNICATION', 'Komunikasi', 'Telepon, internet, dll', 'operating_expense', 14),
  ('MAINTENANCE', 'Pemeliharaan', 'Pemeliharaan aset non-produksi', 'operating_expense', 15),
  ('FUEL', 'BBM', 'Bensin, solar untuk operasional', 'operating_expense', 16),
  ('OFFICE_SUPPLIES', 'Perlengkapan Kantor', 'ATK dan perlengkapan kantor', 'operating_expense', 17),

  -- Administrative Expenses
  ('ADMIN_FEE', 'Biaya Administrasi', 'Biaya admin bank, dll', 'administrative_expense', 20),
  ('INSURANCE', 'Asuransi', 'Premi asuransi', 'administrative_expense', 21),
  ('LEGAL_FEE', 'Biaya Hukum & Perizinan', 'Biaya legal dan perizinan', 'administrative_expense', 22),

  -- Selling Expenses
  ('MARKETING', 'Pemasaran & Promosi', 'Biaya iklan, promosi, dll', 'selling_expense', 30),
  ('COMMISSION', 'Komisi Penjualan', 'Komisi untuk sales', 'selling_expense', 31),
  ('DELIVERY', 'Biaya Pengiriman', 'Ongkir, ekspedisi', 'selling_expense', 32),

  -- Other Expenses
  ('OTHER', 'Pengeluaran Lain-lain', 'Pengeluaran yang tidak termasuk kategori di atas', 'other_expense', 99)
ON CONFLICT (code) DO NOTHING;

-- 4. Update existing cash_history records
-- Set default categories based on type
UPDATE public.cash_history
SET expense_category = CASE
  -- PO pembayaran kemungkinan besar bahan baku
  WHEN type = 'pembayaran_po' THEN 'RAW_MATERIALS'
  -- Pengeluaran umum default ke operasional
  WHEN type = 'pengeluaran' THEN 'OTHER'
  WHEN type = 'kas_keluar_manual' THEN 'OTHER'
  -- Lainnya tetap default
  ELSE 'operational'
END
WHERE expense_category IS NULL OR expense_category = 'operational';

-- 5. Create indexes
CREATE INDEX IF NOT EXISTS idx_cash_history_expense_category ON public.cash_history(expense_category);
CREATE INDEX IF NOT EXISTS idx_expense_categories_financial_category ON public.expense_categories(financial_category);
CREATE INDEX IF NOT EXISTS idx_expense_categories_active ON public.expense_categories(is_active) WHERE is_active = true;

-- 6. Enable RLS for expense_categories
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS policies
CREATE POLICY "Everyone can view active expense categories"
  ON public.expense_categories FOR SELECT
  USING (is_active = true OR auth.role() = 'authenticated');

CREATE POLICY "Admins can manage expense categories"
  ON public.expense_categories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin', 'super_admin', 'head_office_admin')
    )
  );

-- 8. Create trigger for updated_at
CREATE TRIGGER trigger_expense_categories_updated_at
  BEFORE UPDATE ON public.expense_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 9. Create view for COGS expenses
CREATE OR REPLACE VIEW cogs_expenses_summary AS
SELECT
  ec.financial_category,
  ec.name as category_name,
  ch.account_id,
  ch.account_name,
  SUM(ch.amount) as total_amount,
  COUNT(*) as transaction_count,
  DATE_TRUNC('month', ch.created_at) as period_month
FROM public.cash_history ch
JOIN public.expense_categories ec ON ch.expense_category = ec.code
WHERE ec.financial_category IN ('cogs_raw_materials', 'cogs_direct_labor', 'cogs_manufacturing_overhead')
  AND ch.type IN ('pengeluaran', 'kas_keluar_manual', 'pembayaran_po')
GROUP BY ec.financial_category, ec.name, ch.account_id, ch.account_name, DATE_TRUNC('month', ch.created_at);

COMMENT ON VIEW cogs_expenses_summary IS 'Ringkasan pengeluaran yang masuk ke HPP (Harga Pokok Penjualan)';

-- 10. Create view for operating expenses
CREATE OR REPLACE VIEW operating_expenses_summary AS
SELECT
  ec.financial_category,
  ec.name as category_name,
  ch.account_id,
  ch.account_name,
  SUM(ch.amount) as total_amount,
  COUNT(*) as transaction_count,
  DATE_TRUNC('month', ch.created_at) as period_month
FROM public.cash_history ch
JOIN public.expense_categories ec ON ch.expense_category = ec.code
WHERE ec.financial_category IN ('operating_expense', 'administrative_expense', 'selling_expense', 'other_expense')
  AND ch.type IN ('pengeluaran', 'kas_keluar_manual')
GROUP BY ec.financial_category, ec.name, ch.account_id, ch.account_name, DATE_TRUNC('month', ch.created_at);

COMMENT ON VIEW operating_expenses_summary IS 'Ringkasan beban operasional (bukan HPP)';

-- 11. Create helper function to get expense breakdown by period
CREATE OR REPLACE FUNCTION get_expense_breakdown(
  p_start_date DATE,
  p_end_date DATE,
  p_branch_id UUID DEFAULT NULL
)
RETURNS TABLE (
  category_type VARCHAR,
  category_code VARCHAR,
  category_name VARCHAR,
  total_amount DECIMAL,
  transaction_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ec.financial_category::VARCHAR as category_type,
    ec.code::VARCHAR as category_code,
    ec.name::VARCHAR as category_name,
    COALESCE(SUM(ch.amount), 0)::DECIMAL as total_amount,
    COUNT(ch.id) as transaction_count
  FROM public.expense_categories ec
  LEFT JOIN public.cash_history ch ON ch.expense_category = ec.code
    AND ch.created_at >= p_start_date
    AND ch.created_at <= p_end_date
    AND ch.type IN ('pengeluaran', 'kas_keluar_manual', 'pembayaran_po')
  WHERE ec.is_active = true
  GROUP BY ec.financial_category, ec.code, ec.name, ec.sort_order
  ORDER BY ec.sort_order;
END;
$$ LANGUAGE plpgsql;

-- 12. Create function to get COGS vs Operating Expenses summary
CREATE OR REPLACE FUNCTION get_cogs_vs_operating_summary(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSON AS $$
DECLARE
  v_cogs_total DECIMAL := 0;
  v_operating_total DECIMAL := 0;
  v_result JSON;
BEGIN
  -- Calculate COGS total
  SELECT COALESCE(SUM(ch.amount), 0) INTO v_cogs_total
  FROM public.cash_history ch
  JOIN public.expense_categories ec ON ch.expense_category = ec.code
  WHERE ec.financial_category IN ('cogs_raw_materials', 'cogs_direct_labor', 'cogs_manufacturing_overhead')
    AND ch.created_at >= p_start_date
    AND ch.created_at <= p_end_date
    AND ch.type IN ('pengeluaran', 'kas_keluar_manual', 'pembayaran_po');

  -- Calculate Operating Expenses total
  SELECT COALESCE(SUM(ch.amount), 0) INTO v_operating_total
  FROM public.cash_history ch
  JOIN public.expense_categories ec ON ch.expense_category = ec.code
  WHERE ec.financial_category IN ('operating_expense', 'administrative_expense', 'selling_expense', 'other_expense')
    AND ch.created_at >= p_start_date
    AND ch.created_at <= p_end_date
    AND ch.type IN ('pengeluaran', 'kas_keluar_manual');

  -- Build result
  v_result := json_build_object(
    'period_from', p_start_date,
    'period_to', p_end_date,
    'cogs_total', v_cogs_total,
    'operating_expenses_total', v_operating_total,
    'total_expenses', v_cogs_total + v_operating_total,
    'cogs_percentage', CASE
      WHEN (v_cogs_total + v_operating_total) > 0
      THEN ROUND((v_cogs_total / (v_cogs_total + v_operating_total) * 100), 2)
      ELSE 0
    END
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- 13. Add comments
COMMENT ON TABLE public.expense_categories IS 'Kategori pengeluaran: COGS (HPP) vs Operating Expenses';
COMMENT ON COLUMN public.cash_history.expense_category IS 'Kategori pengeluaran: RAW_MATERIALS (HPP), SALARY (Operasional), dll';

COMMENT ON FUNCTION get_expense_breakdown IS 'Mendapatkan breakdown pengeluaran per kategori untuk periode tertentu';
COMMENT ON FUNCTION get_cogs_vs_operating_summary IS 'Ringkasan perbandingan HPP vs Beban Operasional

Contoh penggunaan:
SELECT get_cogs_vs_operating_summary(''2024-01-01'', ''2024-12-31'');

Hasil:
{
  "period_from": "2024-01-01",
  "period_to": "2024-12-31",
  "cogs_total": 50000000,
  "operating_expenses_total": 30000000,
  "total_expenses": 80000000,
  "cogs_percentage": 62.5
}
';

-- 14. Example usage documentation
COMMENT ON VIEW cogs_expenses_summary IS 'View untuk melihat pengeluaran yang masuk HPP

Pengeluaran yang masuk HPP:
1. RAW_MATERIALS - Pembelian Bahan Baku
2. DIRECT_LABOR - Upah Tenaga Kerja Langsung
3. FACTORY_OVERHEAD - Overhead Pabrik (listrik pabrik, maintenance mesin, dll)

Contoh query:
SELECT * FROM cogs_expenses_summary
WHERE period_month >= ''2024-01-01''
ORDER BY period_month DESC, total_amount DESC;
';

COMMENT ON VIEW operating_expenses_summary IS 'View untuk melihat beban operasional (bukan HPP)

Beban Operasional meliputi:
- OPERATING_EXPENSE: Gaji non-produksi, sewa, listrik kantor, dll
- ADMINISTRATIVE_EXPENSE: Admin bank, asuransi, perizinan
- SELLING_EXPENSE: Marketing, komisi, ongkir
- OTHER_EXPENSE: Pengeluaran lain-lain

Contoh query:
SELECT * FROM operating_expenses_summary
WHERE period_month >= ''2024-01-01''
ORDER BY period_month DESC, total_amount DESC;
';
