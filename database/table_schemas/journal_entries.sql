--
-- PostgreSQL database dump
--

\restrict T4GXgw0IIMjgZvjvrbE5d11kMlbfeBAed2V8Q9yQbiUGo0dNuo7fAmXfFSbh92K

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
-- Name: journal_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_number text NOT NULL,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    description text NOT NULL,
    reference_type text,
    reference_id text,
    status text DEFAULT 'draft'::text NOT NULL,
    total_debit numeric(15,2) DEFAULT 0 NOT NULL,
    total_credit numeric(15,2) DEFAULT 0 NOT NULL,
    created_by uuid,
    created_by_name text,
    created_at timestamp with time zone DEFAULT now(),
    approved_by uuid,
    approved_by_name text,
    approved_at timestamp with time zone,
    is_voided boolean DEFAULT false,
    voided_by uuid,
    voided_by_name text,
    voided_at timestamp with time zone,
    void_reason text,
    branch_id uuid,
    entry_time time without time zone DEFAULT CURRENT_TIME,
    voided_reason text,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT journal_entries_balanced CHECK ((total_debit = total_credit)),
    CONSTRAINT journal_entries_reference_type_check CHECK (((reference_type IS NULL) OR (reference_type = ANY (ARRAY['transaction'::text, 'expense'::text, 'payroll'::text, 'transfer'::text, 'manual'::text, 'adjustment'::text, 'closing'::text, 'opening'::text, 'opening_balance'::text, 'receivable_payment'::text, 'advance'::text, 'advance_payment'::text, 'payable_payment'::text, 'purchase'::text, 'purchase_order'::text, 'receivable'::text, 'payable'::text, 'production'::text, 'production_error'::text, 'tax_payment'::text, 'zakat'::text, 'asset'::text, 'commission'::text, 'debt_installment'::text])))),
    CONSTRAINT journal_entries_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'posted'::text, 'voided'::text])))
);


--
-- Name: TABLE journal_entries; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.journal_entries IS 'Jurnal Umum - Header untuk setiap entri jurnal double-entry';


--
-- Name: journal_entries journal_entries_entry_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_entry_number_key UNIQUE (entry_number);


--
-- Name: journal_entries journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);


--
-- Name: idx_journal_entries_branch_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_entries_branch_date ON public.journal_entries USING btree (branch_id, entry_date);


--
-- Name: idx_journal_entries_branch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_entries_branch_id ON public.journal_entries USING btree (branch_id);


--
-- Name: idx_journal_entries_entry_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_entries_entry_date ON public.journal_entries USING btree (entry_date);


--
-- Name: idx_journal_entries_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_entries_reference ON public.journal_entries USING btree (reference_type, reference_id);


--
-- Name: idx_journal_entries_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_entries_status ON public.journal_entries USING btree (status);


--
-- Name: journal_entries trg_balance_journal_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_balance_journal_change AFTER UPDATE OF is_voided ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.tf_update_balance_on_journal_change();


--
-- Name: journal_entries journal_entries_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY journal_entries_delete ON public.journal_entries FOR DELETE USING ((auth.role() = ANY (ARRAY['owner'::text, 'admin'::text])));


--
-- Name: journal_entries journal_entries_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY journal_entries_insert ON public.journal_entries FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: journal_entries journal_entries_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY journal_entries_select ON public.journal_entries FOR SELECT USING (true);


--
-- Name: journal_entries journal_entries_select_returning; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY journal_entries_select_returning ON public.journal_entries FOR SELECT TO authenticated USING (true);


--
-- Name: journal_entries journal_entries_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY journal_entries_update ON public.journal_entries FOR UPDATE TO authenticated, anon, owner, admin, supervisor, cashier, designer, operator, supir, sales, helper USING (true);


--
-- PostgreSQL database dump complete
--

\unrestrict T4GXgw0IIMjgZvjvrbE5d11kMlbfeBAed2V8Q9yQbiUGo0dNuo7fAmXfFSbh92K

