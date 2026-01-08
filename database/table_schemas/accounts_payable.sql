--
-- PostgreSQL database dump
--

\restrict 5ppcmMlBM0GGrk32tLybCHBxXJFtPsjvyAYAD0XvEe4hjiROwnfLIZGMeetJhdt

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
-- Name: accounts_payable; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts_payable (
    id text NOT NULL,
    purchase_order_id text,
    supplier_name text NOT NULL,
    amount numeric NOT NULL,
    due_date timestamp with time zone,
    description text NOT NULL,
    status text DEFAULT 'Outstanding'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    paid_at timestamp with time zone,
    paid_amount numeric DEFAULT 0,
    payment_account_id text,
    notes text,
    interest_rate numeric DEFAULT 0,
    interest_type text DEFAULT 'flat'::text,
    creditor_type text DEFAULT 'supplier'::text,
    branch_id uuid,
    tenor_months integer DEFAULT 1,
    CONSTRAINT accounts_payable_creditor_type_check CHECK ((creditor_type = ANY (ARRAY['supplier'::text, 'bank'::text, 'credit_card'::text, 'other'::text]))),
    CONSTRAINT accounts_payable_interest_type_check CHECK ((interest_type = ANY (ARRAY['flat'::text, 'per_month'::text, 'per_year'::text]))),
    CONSTRAINT accounts_payable_status_check CHECK ((status = ANY (ARRAY['Outstanding'::text, 'Paid'::text, 'Partial'::text])))
);


--
-- Name: COLUMN accounts_payable.interest_rate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts_payable.interest_rate IS 'Interest rate in percentage (e.g., 5 for 5%)';


--
-- Name: COLUMN accounts_payable.interest_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts_payable.interest_type IS 'Type of interest calculation: flat (one-time), per_month (monthly), per_year (annual)';


--
-- Name: COLUMN accounts_payable.creditor_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts_payable.creditor_type IS 'Type of creditor: supplier, bank, credit_card, or other';


--
-- Name: accounts_payable accounts_payable_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts_payable
    ADD CONSTRAINT accounts_payable_pkey PRIMARY KEY (id);


--
-- Name: idx_accounts_payable_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounts_payable_created_at ON public.accounts_payable USING btree (created_at);


--
-- Name: idx_accounts_payable_po_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounts_payable_po_id ON public.accounts_payable USING btree (purchase_order_id);


--
-- Name: idx_accounts_payable_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounts_payable_status ON public.accounts_payable USING btree (status);


--
-- Name: accounts_payable accounts_payable_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts_payable
    ADD CONSTRAINT accounts_payable_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: accounts_payable accounts_payable_payment_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts_payable
    ADD CONSTRAINT accounts_payable_payment_account_id_fkey FOREIGN KEY (payment_account_id) REFERENCES public.accounts(id);


--
-- Name: accounts_payable Allow all for accounts_payable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for accounts_payable" ON public.accounts_payable USING (true) WITH CHECK (true);


--
-- Name: accounts_payable accounts_payable_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounts_payable_allow_all ON public.accounts_payable TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict 5ppcmMlBM0GGrk32tLybCHBxXJFtPsjvyAYAD0XvEe4hjiROwnfLIZGMeetJhdt

