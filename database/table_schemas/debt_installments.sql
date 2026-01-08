--
-- PostgreSQL database dump
--

\restrict 31RRA1APlozxnT5uBJyLTbrhhzATgwkM4dv7NPvt3Hws7p1SLSQOheueAAB5ncz

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
-- Name: debt_installments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.debt_installments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    debt_id text NOT NULL,
    installment_number integer NOT NULL,
    due_date timestamp with time zone NOT NULL,
    principal_amount numeric DEFAULT 0 NOT NULL,
    interest_amount numeric DEFAULT 0 NOT NULL,
    total_amount numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    paid_at timestamp with time zone,
    paid_amount numeric DEFAULT 0,
    payment_account_id text,
    notes text,
    branch_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT debt_installments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'overdue'::text])))
);


--
-- Name: debt_installments debt_installments_debt_id_installment_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_installments
    ADD CONSTRAINT debt_installments_debt_id_installment_number_key UNIQUE (debt_id, installment_number);


--
-- Name: debt_installments debt_installments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_installments
    ADD CONSTRAINT debt_installments_pkey PRIMARY KEY (id);


--
-- Name: idx_debt_installments_debt_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debt_installments_debt_id ON public.debt_installments USING btree (debt_id);


--
-- Name: idx_debt_installments_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debt_installments_due_date ON public.debt_installments USING btree (due_date);


--
-- Name: idx_debt_installments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debt_installments_status ON public.debt_installments USING btree (status);


--
-- Name: debt_installments debt_installments_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_installments
    ADD CONSTRAINT debt_installments_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: debt_installments debt_installments_debt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_installments
    ADD CONSTRAINT debt_installments_debt_id_fkey FOREIGN KEY (debt_id) REFERENCES public.accounts_payable(id) ON DELETE CASCADE;


--
-- Name: debt_installments debt_installments_payment_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_installments
    ADD CONSTRAINT debt_installments_payment_account_id_fkey FOREIGN KEY (payment_account_id) REFERENCES public.accounts(id);


--
-- Name: debt_installments debt_installments_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY debt_installments_allow_all ON public.debt_installments TO authenticated USING (true) WITH CHECK (true);


--
-- Name: debt_installments debt_installments_anon_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY debt_installments_anon_all ON public.debt_installments TO anon USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict 31RRA1APlozxnT5uBJyLTbrhhzATgwkM4dv7NPvt3Hws7p1SLSQOheueAAB5ncz

