-- =============================================================================
-- RESTORE TRANSACTIONS TABLE SCHEMA (TANPA DATA)
-- Generated from: mkw_db_backup.sql
-- Tanggal: 2026-01-05
-- =============================================================================
-- PERINGATAN: Script ini akan DROP dan CREATE ulang tabel transactions!
-- Pastikan backup data sudah dibuat sebelum menjalankan script ini.
-- =============================================================================

BEGIN;

-- =============================================================================
-- STEP 1: Drop existing constraints dan indexes (jika ada)
-- =============================================================================

-- Drop foreign key constraints
ALTER TABLE IF EXISTS public.transactions DROP CONSTRAINT IF EXISTS transactions_branch_id_fkey;
ALTER TABLE IF EXISTS public.transactions DROP CONSTRAINT IF EXISTS transactions_cashier_id_fkey;
ALTER TABLE IF EXISTS public.transactions DROP CONSTRAINT IF EXISTS transactions_customer_id_fkey;
ALTER TABLE IF EXISTS public.transactions DROP CONSTRAINT IF EXISTS transactions_designer_id_fkey;
ALTER TABLE IF EXISTS public.transactions DROP CONSTRAINT IF EXISTS transactions_operator_id_fkey;
ALTER TABLE IF EXISTS public.transactions DROP CONSTRAINT IF EXISTS transactions_payment_account_id_fkey;
ALTER TABLE IF EXISTS public.transactions DROP CONSTRAINT IF EXISTS transactions_retasi_id_fkey;
ALTER TABLE IF EXISTS public.transactions DROP CONSTRAINT IF EXISTS transactions_sales_id_fkey;

-- Drop check constraints
ALTER TABLE IF EXISTS public.transactions DROP CONSTRAINT IF EXISTS transaction_status_check;
ALTER TABLE IF EXISTS public.transactions DROP CONSTRAINT IF EXISTS transactions_ppn_mode_check;

-- Drop primary key
ALTER TABLE IF EXISTS public.transactions DROP CONSTRAINT IF EXISTS transactions_pkey;

-- Drop indexes
DROP INDEX IF EXISTS public.idx_transactions_cashier_id;
DROP INDEX IF EXISTS public.idx_transactions_customer_id;
DROP INDEX IF EXISTS public.idx_transactions_delivery_status;
DROP INDEX IF EXISTS public.idx_transactions_due_date;
DROP INDEX IF EXISTS public.idx_transactions_is_office_sale;
DROP INDEX IF EXISTS public.idx_transactions_not_cancelled;
DROP INDEX IF EXISTS public.idx_transactions_order_date;
DROP INDEX IF EXISTS public.idx_transactions_payment_status;
DROP INDEX IF EXISTS public.idx_transactions_ppn_enabled;
DROP INDEX IF EXISTS public.idx_transactions_retasi_id;
DROP INDEX IF EXISTS public.idx_transactions_retasi_number;
DROP INDEX IF EXISTS public.idx_transactions_sales_id;
DROP INDEX IF EXISTS public.idx_transactions_status;

-- =============================================================================
-- STEP 2: Drop dan Create tabel transactions
-- =============================================================================

DROP TABLE IF EXISTS public.transactions CASCADE;

CREATE TABLE public.transactions (
    id text NOT NULL,
    customer_id uuid,
    customer_name text,
    cashier_id uuid,
    cashier_name text,
    designer_id uuid,
    operator_id uuid,
    payment_account_id text,
    order_date timestamp with time zone NOT NULL,
    finish_date timestamp with time zone,
    items jsonb,
    total numeric NOT NULL,
    paid_amount numeric NOT NULL,
    payment_status text NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    subtotal numeric DEFAULT 0,
    ppn_enabled boolean DEFAULT false,
    ppn_percentage numeric DEFAULT 11,
    ppn_amount numeric DEFAULT 0,
    is_office_sale boolean DEFAULT false,
    due_date timestamp with time zone,
    ppn_mode text,
    sales_id uuid,
    sales_name text,
    retasi_id uuid,
    retasi_number text,
    branch_id uuid,
    notes text,
    is_cancelled boolean DEFAULT false,
    cancelled_at timestamp with time zone,
    cancelled_by uuid,
    cancelled_by_name text,
    cancel_reason text,
    correction_of text,
    CONSTRAINT transaction_status_check CHECK ((status = ANY (ARRAY['Pesanan Masuk'::text, 'Siap Antar'::text, 'Diantar Sebagian'::text, 'Selesai'::text, 'Dibatalkan'::text]))),
    CONSTRAINT transactions_ppn_mode_check CHECK ((ppn_mode = ANY (ARRAY['include'::text, 'exclude'::text])))
);

-- =============================================================================
-- STEP 3: Add comments
-- =============================================================================

COMMENT ON TABLE public.transactions IS 'Transaction data. Delivery information is now handled separately in deliveries and delivery_items tables as of migration 0034.';
COMMENT ON COLUMN public.transactions.subtotal IS 'Total sebelum PPN dan setelah diskon';
COMMENT ON COLUMN public.transactions.ppn_enabled IS 'Apakah PPN diaktifkan untuk transaksi ini';
COMMENT ON COLUMN public.transactions.ppn_percentage IS 'Persentase PPN yang digunakan (default 11%)';
COMMENT ON COLUMN public.transactions.ppn_amount IS 'Jumlah PPN dalam rupiah';
COMMENT ON COLUMN public.transactions.is_office_sale IS 'Menandakan apakah produk laku kantor (true) atau perlu diantar (false)';
COMMENT ON COLUMN public.transactions.due_date IS 'Tanggal jatuh tempo untuk pembayaran kredit';
COMMENT ON COLUMN public.transactions.ppn_mode IS 'Mode PPN: include (sudah termasuk) atau exclude (belum termasuk)';

-- =============================================================================
-- STEP 4: Add primary key
-- =============================================================================

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);

-- =============================================================================
-- STEP 5: Add foreign key constraints
-- =============================================================================

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_cashier_id_fkey FOREIGN KEY (cashier_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_designer_id_fkey FOREIGN KEY (designer_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_payment_account_id_fkey FOREIGN KEY (payment_account_id) REFERENCES public.accounts(id);

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_retasi_id_fkey FOREIGN KEY (retasi_id) REFERENCES public.retasi(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_sales_id_fkey FOREIGN KEY (sales_id) REFERENCES public.profiles(id);

-- =============================================================================
-- STEP 6: Create indexes
-- =============================================================================

CREATE INDEX idx_transactions_cashier_id ON public.transactions USING btree (cashier_id);
CREATE INDEX idx_transactions_customer_id ON public.transactions USING btree (customer_id);
CREATE INDEX idx_transactions_delivery_status ON public.transactions USING btree (status, is_office_sale) WHERE (status = ANY (ARRAY['Siap Antar'::text, 'Diantar Sebagian'::text]));
CREATE INDEX idx_transactions_due_date ON public.transactions USING btree (due_date);
CREATE INDEX idx_transactions_is_office_sale ON public.transactions USING btree (is_office_sale);
CREATE INDEX idx_transactions_not_cancelled ON public.transactions USING btree (id) WHERE ((is_cancelled = false) OR (is_cancelled IS NULL));
CREATE INDEX idx_transactions_order_date ON public.transactions USING btree (order_date);
CREATE INDEX idx_transactions_payment_status ON public.transactions USING btree (payment_status);
CREATE INDEX idx_transactions_ppn_enabled ON public.transactions USING btree (ppn_enabled);
CREATE INDEX idx_transactions_retasi_id ON public.transactions USING btree (retasi_id);
CREATE INDEX idx_transactions_retasi_number ON public.transactions USING btree (retasi_number);
CREATE INDEX idx_transactions_sales_id ON public.transactions USING btree (sales_id);
CREATE INDEX idx_transactions_status ON public.transactions USING btree (status);

-- =============================================================================
-- STEP 7: Grant permissions
-- =============================================================================

GRANT SELECT ON public.transactions TO anon;
GRANT ALL ON public.transactions TO authenticated;

COMMIT;

-- =============================================================================
-- VERIFIKASI
-- =============================================================================
-- Jalankan query berikut untuk memastikan tabel sudah dibuat dengan benar:
--
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'transactions'
-- ORDER BY ordinal_position;
-- =============================================================================
