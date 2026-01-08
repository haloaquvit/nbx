--
-- PostgreSQL database dump
--

\restrict ZbGiETLIHVJDVc3xRsYC6XSFQQY42tKHFrsoI6cPqeLA4t57NZiHOLqesN0gKAS

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
-- Name: transaction_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transaction_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_id text NOT NULL,
    payment_date timestamp with time zone DEFAULT now() NOT NULL,
    amount numeric NOT NULL,
    payment_method text DEFAULT 'cash'::text,
    account_id text,
    account_name text NOT NULL,
    description text NOT NULL,
    notes text,
    reference_number text,
    paid_by_user_id uuid,
    paid_by_user_name text NOT NULL,
    paid_by_user_role text,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    status text DEFAULT 'active'::text,
    cancelled_at timestamp with time zone,
    cancelled_by uuid,
    cancelled_reason text,
    branch_id uuid,
    CONSTRAINT transaction_payments_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT transaction_payments_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'bank_transfer'::text, 'check'::text, 'digital_wallet'::text]))),
    CONSTRAINT transaction_payments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'cancelled'::text, 'deleted'::text])))
);


--
-- Name: transaction_payments transaction_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_payments
    ADD CONSTRAINT transaction_payments_pkey PRIMARY KEY (id);


--
-- Name: idx_transaction_payments_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transaction_payments_date ON public.transaction_payments USING btree (payment_date);


--
-- Name: idx_transaction_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transaction_payments_status ON public.transaction_payments USING btree (status);


--
-- Name: idx_transaction_payments_transaction_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transaction_payments_transaction_id ON public.transaction_payments USING btree (transaction_id);


--
-- Name: transaction_payments transaction_payments_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_payments
    ADD CONSTRAINT transaction_payments_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: transaction_payments transaction_payments_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_payments
    ADD CONSTRAINT transaction_payments_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: transaction_payments transaction_payments_cancelled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_payments
    ADD CONSTRAINT transaction_payments_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.profiles(id);


--
-- Name: transaction_payments transaction_payments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_payments
    ADD CONSTRAINT transaction_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: transaction_payments transaction_payments_paid_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_payments
    ADD CONSTRAINT transaction_payments_paid_by_user_id_fkey FOREIGN KEY (paid_by_user_id) REFERENCES public.profiles(id);


--
-- Name: transaction_payments transaction_payments_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_payments
    ADD CONSTRAINT transaction_payments_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;


--
-- Name: transaction_payments transaction_payments_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transaction_payments_allow_all ON public.transaction_payments TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict ZbGiETLIHVJDVc3xRsYC6XSFQQY42tKHFrsoI6cPqeLA4t57NZiHOLqesN0gKAS

