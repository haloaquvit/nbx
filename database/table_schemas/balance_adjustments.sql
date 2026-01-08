--
-- PostgreSQL database dump
--

\restrict rGgiIorcpna3IV3Dkc4Khkaa1BifHhbAslR8YwdC4eDjdvpDTzvqE3pFhHtvcP6

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
-- Name: balance_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.balance_adjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id text NOT NULL,
    adjustment_type text NOT NULL,
    old_balance numeric,
    new_balance numeric,
    adjustment_amount numeric,
    reason text NOT NULL,
    reference_number text,
    adjusted_by uuid,
    adjusted_by_name text,
    created_at timestamp with time zone DEFAULT now(),
    approved_by uuid,
    approved_at timestamp with time zone,
    status text DEFAULT 'pending'::text,
    CONSTRAINT balance_adjustments_adjustment_type_check CHECK ((adjustment_type = ANY (ARRAY['reconciliation'::text, 'initial_balance'::text, 'correction'::text]))),
    CONSTRAINT balance_adjustments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: balance_adjustments balance_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_adjustments
    ADD CONSTRAINT balance_adjustments_pkey PRIMARY KEY (id);


--
-- Name: idx_balance_adjustments_account_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_balance_adjustments_account_id ON public.balance_adjustments USING btree (account_id);


--
-- Name: idx_balance_adjustments_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_balance_adjustments_created_at ON public.balance_adjustments USING btree (created_at);


--
-- Name: idx_balance_adjustments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_balance_adjustments_status ON public.balance_adjustments USING btree (status);


--
-- Name: balance_adjustments balance_adjustments_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_adjustments
    ADD CONSTRAINT balance_adjustments_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: balance_adjustments balance_adjustments_adjusted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_adjustments
    ADD CONSTRAINT balance_adjustments_adjusted_by_fkey FOREIGN KEY (adjusted_by) REFERENCES public.profiles(id);


--
-- Name: balance_adjustments balance_adjustments_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_adjustments
    ADD CONSTRAINT balance_adjustments_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);


--
-- Name: balance_adjustments balance_adjustments_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY balance_adjustments_allow_all ON public.balance_adjustments TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict rGgiIorcpna3IV3Dkc4Khkaa1BifHhbAslR8YwdC4eDjdvpDTzvqE3pFhHtvcP6

