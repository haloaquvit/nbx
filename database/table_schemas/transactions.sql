--
-- PostgreSQL database dump
--

\restrict nY6zJHcVLcnoUh1ZVWhsZCnpOR6Wn8wzytMNDjlHedGulZB1f2ebAM03oySRkpY

-- Dumped from database version 14.20 (Ubuntu 14.20-0ubuntu0.22.04.1)
-- Dumped by pg_dump version 14.20 (Ubuntu 14.20-0ubuntu0.22.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

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
    is_voided boolean DEFAULT false,
    voided_at timestamp with time zone,
    voided_by uuid,
    void_reason text,
    hpp_snapshot jsonb,
    hpp_total numeric DEFAULT 0,
    ref text,
    delivery_status text DEFAULT 'pending'::text,
    delivered_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now(),
    voided_reason text,
    CONSTRAINT transaction_status_check CHECK ((status = ANY (ARRAY['Pesanan Masuk'::text, 'Siap Antar'::text, 'Diantar Sebagian'::text, 'Selesai'::text, 'Dibatalkan'::text]))),
    CONSTRAINT transactions_ppn_mode_check CHECK ((ppn_mode = ANY (ARRAY['include'::text, 'exclude'::text])))
);


--
-- Name: TABLE transactions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.transactions IS 'Transaction data. Delivery information is now handled separately in deliveries and delivery_items tables as of migration 0034.';


--
-- Name: COLUMN transactions.subtotal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.subtotal IS 'Total sebelum PPN dan setelah diskon';


--
-- Name: COLUMN transactions.ppn_enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.ppn_enabled IS 'Apakah PPN diaktifkan untuk transaksi ini';


--
-- Name: COLUMN transactions.ppn_percentage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.ppn_percentage IS 'Persentase PPN yang digunakan (default 11%)';


--
-- Name: COLUMN transactions.ppn_amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.ppn_amount IS 'Jumlah PPN dalam rupiah';


--
-- Name: COLUMN transactions.is_office_sale; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.is_office_sale IS 'Menandakan apakah produk laku kantor (true) atau perlu diantar (false)';


--
-- Name: COLUMN transactions.due_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.due_date IS 'Tanggal jatuh tempo untuk pembayaran kredit';


--
-- Name: COLUMN transactions.ppn_mode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.ppn_mode IS 'Mode PPN: include (sudah termasuk) atau exclude (belum termasuk)';


--
-- Name: COLUMN transactions.sales_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.sales_id IS 'ID of the sales person responsible for this transaction';


--
-- Name: COLUMN transactions.sales_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.sales_name IS 'Name of the sales person responsible for this transaction';


--
-- Name: COLUMN transactions.retasi_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.retasi_id IS 'Reference to retasi table - links driver transactions to their active retasi';


--
-- Name: COLUMN transactions.retasi_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.retasi_number IS 'Retasi number for display purposes (e.g., RET-20251213-001)';


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: idx_transactions_branch_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_branch_date ON public.transactions USING btree (branch_id, order_date);


--
-- Name: idx_transactions_cashier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_cashier_id ON public.transactions USING btree (cashier_id);


--
-- Name: idx_transactions_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_customer_id ON public.transactions USING btree (customer_id);


--
-- Name: idx_transactions_delivery_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_delivery_status ON public.transactions USING btree (status, is_office_sale) WHERE (status = ANY (ARRAY['Siap Antar'::text, 'Diantar Sebagian'::text]));


--
-- Name: idx_transactions_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_due_date ON public.transactions USING btree (due_date);


--
-- Name: idx_transactions_is_office_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_is_office_sale ON public.transactions USING btree (is_office_sale);


--
-- Name: idx_transactions_not_cancelled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_not_cancelled ON public.transactions USING btree (id) WHERE ((is_cancelled = false) OR (is_cancelled IS NULL));


--
-- Name: idx_transactions_not_voided; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_not_voided ON public.transactions USING btree (id) WHERE (is_voided IS NOT TRUE);


--
-- Name: idx_transactions_order_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_order_date ON public.transactions USING btree (order_date);


--
-- Name: idx_transactions_payment_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_payment_status ON public.transactions USING btree (payment_status);


--
-- Name: idx_transactions_ppn_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_ppn_enabled ON public.transactions USING btree (ppn_enabled);


--
-- Name: idx_transactions_retasi_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_retasi_id ON public.transactions USING btree (retasi_id);


--
-- Name: idx_transactions_retasi_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_retasi_number ON public.transactions USING btree (retasi_number);


--
-- Name: idx_transactions_sales_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_sales_id ON public.transactions USING btree (sales_id);


--
-- Name: idx_transactions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_status ON public.transactions USING btree (status);


--
-- Name: transactions transactions_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: transactions transactions_cashier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_cashier_id_fkey FOREIGN KEY (cashier_id) REFERENCES public.profiles(id);


--
-- Name: transactions transactions_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: transactions transactions_designer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_designer_id_fkey FOREIGN KEY (designer_id) REFERENCES public.profiles(id);


--
-- Name: transactions transactions_operator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES public.profiles(id);


--
-- Name: transactions transactions_payment_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_payment_account_id_fkey FOREIGN KEY (payment_account_id) REFERENCES public.accounts(id);


--
-- Name: transactions transactions_retasi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_retasi_id_fkey FOREIGN KEY (retasi_id) REFERENCES public.retasi(id) ON DELETE SET NULL;


--
-- Name: transactions transactions_sales_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_sales_id_fkey FOREIGN KEY (sales_id) REFERENCES public.profiles(id);


--
-- Name: transactions transactions_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transactions_allow_all ON public.transactions TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict nY6zJHcVLcnoUh1ZVWhsZCnpOR6Wn8wzytMNDjlHedGulZB1f2ebAM03oySRkpY

