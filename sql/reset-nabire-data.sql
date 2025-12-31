-- ============================================================================
-- RESET DATA NABIRE (aquvit_new) - Jurnal, Piutang, Aset
-- Jalankan di database: aquvit_new
-- ============================================================================

-- ==============================================
-- BAGIAN 1: TAMBAH TABEL YANG HILANG
-- ==============================================

-- 1.1 Tabel debt_installments (Jadwal Angsuran Hutang)
CREATE TABLE IF NOT EXISTS debt_installments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    debt_id TEXT NOT NULL,
    installment_number INTEGER NOT NULL,
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    principal_amount NUMERIC NOT NULL DEFAULT 0,
    interest_amount NUMERIC NOT NULL DEFAULT 0,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    paid_at TIMESTAMP WITH TIME ZONE,
    paid_amount NUMERIC DEFAULT 0,
    payment_account_id TEXT,
    notes TEXT,
    branch_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT debt_installments_status_check
        CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text, 'overdue'::text])),
    CONSTRAINT debt_installments_debt_id_installment_number_key
        UNIQUE (debt_id, installment_number)
);

-- Index untuk debt_installments
CREATE INDEX IF NOT EXISTS idx_debt_installments_debt_id ON debt_installments(debt_id);
CREATE INDEX IF NOT EXISTS idx_debt_installments_due_date ON debt_installments(due_date);
CREATE INDEX IF NOT EXISTS idx_debt_installments_status ON debt_installments(status);

-- Foreign keys untuk debt_installments
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'debt_installments_branch_id_fkey') THEN
        ALTER TABLE debt_installments
        ADD CONSTRAINT debt_installments_branch_id_fkey
        FOREIGN KEY (branch_id) REFERENCES branches(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'debt_installments_debt_id_fkey') THEN
        ALTER TABLE debt_installments
        ADD CONSTRAINT debt_installments_debt_id_fkey
        FOREIGN KEY (debt_id) REFERENCES accounts_payable(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'debt_installments_payment_account_id_fkey') THEN
        ALTER TABLE debt_installments
        ADD CONSTRAINT debt_installments_payment_account_id_fkey
        FOREIGN KEY (payment_account_id) REFERENCES accounts(id);
    END IF;
END $$;

-- RLS Policy untuk debt_installments
ALTER TABLE debt_installments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS debt_installments_allow_all ON debt_installments;
CREATE POLICY debt_installments_allow_all ON debt_installments
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 1.2 Tabel closing_periods (Tutup Buku Tahunan)
CREATE TABLE IF NOT EXISTS closing_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    year INTEGER NOT NULL,
    closed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    closed_by UUID,
    journal_entry_id UUID,
    net_income NUMERIC NOT NULL DEFAULT 0,
    branch_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT closing_periods_year_branch_id_key UNIQUE (year, branch_id)
);

-- Index untuk closing_periods
CREATE INDEX IF NOT EXISTS idx_closing_periods_branch ON closing_periods(branch_id);
CREATE INDEX IF NOT EXISTS idx_closing_periods_year ON closing_periods(year);

-- Foreign keys untuk closing_periods
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'closing_periods_branch_id_fkey') THEN
        ALTER TABLE closing_periods
        ADD CONSTRAINT closing_periods_branch_id_fkey
        FOREIGN KEY (branch_id) REFERENCES branches(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'closing_periods_journal_entry_id_fkey') THEN
        ALTER TABLE closing_periods
        ADD CONSTRAINT closing_periods_journal_entry_id_fkey
        FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id);
    END IF;
END $$;

-- ==============================================
-- BAGIAN 2: RESET DATA SECARA BERTAHAP
-- ==============================================

-- 2.1 Lihat data sebelum dihapus
SELECT '=== DATA SEBELUM RESET ===' as info;
SELECT 'journal_entries: ' || COUNT(*) FROM journal_entries;
SELECT 'journal_entry_lines: ' || COUNT(*) FROM journal_entry_lines;
SELECT 'accounts_payable: ' || COUNT(*) FROM accounts_payable;
SELECT 'assets: ' || COUNT(*) FROM assets;
SELECT 'asset_maintenance: ' || COUNT(*) FROM asset_maintenance;

-- 2.2 Hapus journal_entry_lines terlebih dahulu (child table)
DELETE FROM journal_entry_lines;
SELECT 'journal_entry_lines dihapus: ' || COUNT(*) || ' baris' FROM journal_entry_lines;

-- 2.3 Hapus journal_entries (parent table)
DELETE FROM journal_entries;
SELECT 'journal_entries dihapus: ' || COUNT(*) || ' baris' FROM journal_entries;

-- 2.4 Hapus debt_installments (jika ada)
DELETE FROM debt_installments;
SELECT 'debt_installments dihapus' as info;

-- 2.5 Hapus accounts_payable (Hutang)
DELETE FROM accounts_payable;
SELECT 'accounts_payable dihapus: ' || COUNT(*) || ' baris' FROM accounts_payable;

-- 2.6 Hapus asset_maintenance terlebih dahulu (child of assets)
DELETE FROM asset_maintenance;
SELECT 'asset_maintenance dihapus' as info;

-- 2.7 Hapus assets
DELETE FROM assets;
SELECT 'assets dihapus: ' || COUNT(*) || ' baris' FROM assets;

-- 2.8 Reset balance di accounts (saldo akun kembali ke initial_balance)
UPDATE accounts SET balance = initial_balance;
SELECT 'accounts.balance direset ke initial_balance' as info;

-- ==============================================
-- BAGIAN 3: VERIFIKASI SETELAH RESET
-- ==============================================
SELECT '=== DATA SETELAH RESET ===' as info;
SELECT 'journal_entries: ' || COUNT(*) FROM journal_entries;
SELECT 'journal_entry_lines: ' || COUNT(*) FROM journal_entry_lines;
SELECT 'accounts_payable: ' || COUNT(*) FROM accounts_payable;
SELECT 'assets: ' || COUNT(*) FROM assets;
SELECT 'debt_installments: ' || COUNT(*) FROM debt_installments;

-- Cek total saldo akun
SELECT
    type,
    COUNT(*) as jumlah_akun,
    SUM(balance) as total_balance
FROM accounts
GROUP BY type
ORDER BY type;
