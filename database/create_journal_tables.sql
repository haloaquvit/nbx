-- =====================================================
-- JURNAL UMUM (General Journal) Tables
-- Sistem Double-Entry Bookkeeping yang benar
-- =====================================================

-- 1. Tabel Header Jurnal
CREATE TABLE IF NOT EXISTS public.journal_entries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Nomor jurnal (auto-generate: JE-2024-000001)
    entry_number TEXT NOT NULL UNIQUE,

    -- Tanggal transaksi (bukan created_at)
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Deskripsi/keterangan jurnal
    description TEXT NOT NULL,

    -- Referensi ke transaksi sumber (opsional)
    reference_type TEXT, -- 'transaction', 'expense', 'payroll', 'manual', 'adjustment', 'closing'
    reference_id TEXT, -- ID dari transaksi sumber

    -- Status jurnal
    status TEXT NOT NULL DEFAULT 'draft',

    -- Total debit dan kredit (harus sama)
    total_debit NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_credit NUMERIC(15,2) NOT NULL DEFAULT 0,

    -- Audit trail
    created_by UUID,
    created_by_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Untuk approval (opsional)
    approved_by UUID,
    approved_by_name TEXT,
    approved_at TIMESTAMP WITH TIME ZONE,

    -- Untuk voiding (tidak boleh delete)
    is_voided BOOLEAN DEFAULT FALSE,
    voided_by UUID,
    voided_by_name TEXT,
    voided_at TIMESTAMP WITH TIME ZONE,
    void_reason TEXT,

    -- Multi-branch support
    branch_id UUID,

    -- Constraint: debit harus sama dengan kredit
    CONSTRAINT journal_entries_balanced CHECK (total_debit = total_credit),

    -- Constraint: status valid
    CONSTRAINT journal_entries_status_check CHECK (status IN ('draft', 'posted', 'voided')),

    -- Constraint: reference_type valid
    CONSTRAINT journal_entries_reference_type_check CHECK (
        reference_type IS NULL OR
        reference_type IN ('transaction', 'expense', 'payroll', 'transfer', 'manual', 'adjustment', 'closing', 'opening')
    )
);

-- 2. Tabel Detail/Baris Jurnal
CREATE TABLE IF NOT EXISTS public.journal_entry_lines (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Foreign key ke header
    journal_entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,

    -- Line number untuk urutan
    line_number INTEGER NOT NULL DEFAULT 1,

    -- Akun yang terlibat
    account_id TEXT NOT NULL REFERENCES public.accounts(id),
    account_code TEXT, -- Denormalized untuk performance
    account_name TEXT, -- Denormalized untuk performance

    -- Debit atau Credit (hanya satu yang boleh > 0)
    debit_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    credit_amount NUMERIC(15,2) NOT NULL DEFAULT 0,

    -- Keterangan per baris (opsional)
    description TEXT,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraint: tidak boleh keduanya 0 atau keduanya > 0
    CONSTRAINT journal_entry_lines_amount_check CHECK (
        (debit_amount > 0 AND credit_amount = 0) OR
        (debit_amount = 0 AND credit_amount > 0)
    ),

    -- Unique constraint untuk urutan line
    CONSTRAINT journal_entry_lines_unique_line UNIQUE (journal_entry_id, line_number)
);

-- 3. Index untuk performa
CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_date ON public.journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_branch_id ON public.journal_entries(branch_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON public.journal_entries(status);
CREATE INDEX IF NOT EXISTS idx_journal_entries_reference ON public.journal_entries(reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_journal_id ON public.journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account_id ON public.journal_entry_lines(account_id);

-- 4. Function untuk generate nomor jurnal otomatis
CREATE OR REPLACE FUNCTION public.generate_journal_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    current_year TEXT;
    next_number INTEGER;
    new_entry_number TEXT;
BEGIN
    current_year := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;

    -- Get next sequence number for this year
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(entry_number FROM 'JE-' || current_year || '-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO next_number
    FROM public.journal_entries
    WHERE entry_number LIKE 'JE-' || current_year || '-%';

    -- Format: JE-2024-000001
    new_entry_number := 'JE-' || current_year || '-' || LPAD(next_number::TEXT, 6, '0');

    RETURN new_entry_number;
END;
$$;

-- 5. Function untuk update saldo akun setelah jurnal di-posting
CREATE OR REPLACE FUNCTION public.update_account_balance_from_journal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    line_record RECORD;
    account_record RECORD;
    balance_change NUMERIC;
BEGIN
    -- Hanya proses jika status berubah ke 'posted'
    IF NEW.status = 'posted' AND (OLD.status IS NULL OR OLD.status != 'posted') THEN
        -- Loop semua baris jurnal
        FOR line_record IN
            SELECT * FROM public.journal_entry_lines
            WHERE journal_entry_id = NEW.id
        LOOP
            -- Get account info
            SELECT * INTO account_record
            FROM public.accounts
            WHERE id = line_record.account_id;

            -- Calculate balance change based on normal_balance
            IF account_record.normal_balance = 'DEBIT' THEN
                -- Aset, Beban: Debit menambah, Credit mengurangi
                balance_change := line_record.debit_amount - line_record.credit_amount;
            ELSE
                -- Kewajiban, Modal, Pendapatan: Credit menambah, Debit mengurangi
                balance_change := line_record.credit_amount - line_record.debit_amount;
            END IF;

            -- Update account balance
            UPDATE public.accounts
            SET balance = balance + balance_change,
                updated_at = NOW()
            WHERE id = line_record.account_id;
        END LOOP;
    END IF;

    -- Handle voiding: reverse all balance changes
    IF NEW.is_voided = TRUE AND (OLD.is_voided IS NULL OR OLD.is_voided = FALSE) THEN
        FOR line_record IN
            SELECT * FROM public.journal_entry_lines
            WHERE journal_entry_id = NEW.id
        LOOP
            SELECT * INTO account_record
            FROM public.accounts
            WHERE id = line_record.account_id;

            IF account_record.normal_balance = 'DEBIT' THEN
                balance_change := line_record.credit_amount - line_record.debit_amount; -- Reverse
            ELSE
                balance_change := line_record.debit_amount - line_record.credit_amount; -- Reverse
            END IF;

            UPDATE public.accounts
            SET balance = balance + balance_change,
                updated_at = NOW()
            WHERE id = line_record.account_id;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

-- 6. Trigger untuk update saldo akun
DROP TRIGGER IF EXISTS trigger_update_account_balance ON public.journal_entries;
CREATE TRIGGER trigger_update_account_balance
    AFTER UPDATE ON public.journal_entries
    FOR EACH ROW
    EXECUTE FUNCTION public.update_account_balance_from_journal();

-- 7. Function untuk validasi jurnal sebelum posting
CREATE OR REPLACE FUNCTION public.validate_journal_entry(p_journal_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    total_dr NUMERIC;
    total_cr NUMERIC;
    line_count INTEGER;
    result JSONB;
BEGIN
    -- Get totals
    SELECT
        COALESCE(SUM(debit_amount), 0),
        COALESCE(SUM(credit_amount), 0),
        COUNT(*)
    INTO total_dr, total_cr, line_count
    FROM public.journal_entry_lines
    WHERE journal_entry_id = p_journal_id;

    -- Build result
    result := jsonb_build_object(
        'is_valid', (total_dr = total_cr AND total_dr > 0 AND line_count >= 2),
        'total_debit', total_dr,
        'total_credit', total_cr,
        'line_count', line_count,
        'is_balanced', (total_dr = total_cr),
        'has_amount', (total_dr > 0),
        'has_minimum_lines', (line_count >= 2),
        'errors', CASE
            WHEN total_dr != total_cr THEN 'Debit dan Credit tidak seimbang'
            WHEN total_dr = 0 THEN 'Jumlah transaksi harus lebih dari 0'
            WHEN line_count < 2 THEN 'Minimal harus ada 2 baris jurnal'
            ELSE NULL
        END
    );

    RETURN result;
END;
$$;

-- 8. View untuk Buku Besar (General Ledger)
CREATE OR REPLACE VIEW public.general_ledger AS
SELECT
    jel.account_id,
    a.code AS account_code,
    a.name AS account_name,
    a.type AS account_type,
    a.normal_balance,
    je.entry_date,
    je.entry_number,
    je.description AS journal_description,
    jel.description AS line_description,
    jel.debit_amount,
    jel.credit_amount,
    je.reference_type,
    je.reference_id,
    je.branch_id,
    je.status,
    je.is_voided,
    je.created_at
FROM public.journal_entry_lines jel
JOIN public.journal_entries je ON jel.journal_entry_id = je.id
JOIN public.accounts a ON jel.account_id = a.id
WHERE je.status = 'posted' AND je.is_voided = FALSE
ORDER BY a.code, je.entry_date, je.entry_number;

-- 9. View untuk Trial Balance (Neraca Saldo)
CREATE OR REPLACE VIEW public.trial_balance AS
SELECT
    a.id AS account_id,
    a.code AS account_code,
    a.name AS account_name,
    a.type AS account_type,
    a.normal_balance,
    a.initial_balance,
    COALESCE(SUM(jel.debit_amount), 0) AS total_debit,
    COALESCE(SUM(jel.credit_amount), 0) AS total_credit,
    a.initial_balance +
        CASE
            WHEN a.normal_balance = 'DEBIT' THEN COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)
            ELSE COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount), 0)
        END AS ending_balance
FROM public.accounts a
LEFT JOIN public.journal_entry_lines jel ON a.id = jel.account_id
LEFT JOIN public.journal_entries je ON jel.journal_entry_id = je.id
    AND je.status = 'posted'
    AND je.is_voided = FALSE
WHERE a.is_active = TRUE AND a.is_header = FALSE
GROUP BY a.id, a.code, a.name, a.type, a.normal_balance, a.initial_balance
ORDER BY a.code;

-- 10. RLS Policies
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;

-- Policy untuk journal_entries
DROP POLICY IF EXISTS "journal_entries_select" ON public.journal_entries;
CREATE POLICY "journal_entries_select" ON public.journal_entries
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "journal_entries_insert" ON public.journal_entries;
CREATE POLICY "journal_entries_insert" ON public.journal_entries
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "journal_entries_update" ON public.journal_entries;
CREATE POLICY "journal_entries_update" ON public.journal_entries
    FOR UPDATE USING (true);

-- Policy untuk journal_entry_lines
DROP POLICY IF EXISTS "journal_entry_lines_select" ON public.journal_entry_lines;
CREATE POLICY "journal_entry_lines_select" ON public.journal_entry_lines
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "journal_entry_lines_insert" ON public.journal_entry_lines;
CREATE POLICY "journal_entry_lines_insert" ON public.journal_entry_lines
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "journal_entry_lines_update" ON public.journal_entry_lines;
CREATE POLICY "journal_entry_lines_update" ON public.journal_entry_lines
    FOR UPDATE USING (true);

DROP POLICY IF EXISTS "journal_entry_lines_delete" ON public.journal_entry_lines;
CREATE POLICY "journal_entry_lines_delete" ON public.journal_entry_lines
    FOR DELETE USING (true);

-- 11. Grant permissions
GRANT ALL ON public.journal_entries TO authenticated;
GRANT ALL ON public.journal_entry_lines TO authenticated;
GRANT SELECT ON public.general_ledger TO authenticated;
GRANT SELECT ON public.trial_balance TO authenticated;

-- 12. Comment documentation
COMMENT ON TABLE public.journal_entries IS 'Jurnal Umum - Header untuk setiap entri jurnal double-entry';
COMMENT ON TABLE public.journal_entry_lines IS 'Baris Jurnal - Detail debit/credit per akun untuk setiap jurnal';
COMMENT ON VIEW public.general_ledger IS 'Buku Besar - View semua transaksi per akun dari jurnal yang sudah di-posting';
COMMENT ON VIEW public.trial_balance IS 'Neraca Saldo - Ringkasan saldo semua akun';
