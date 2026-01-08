--
-- PostgreSQL database dump
--

\restrict wfEp7KI3HRZC6aNAy7oKRFoekT5PwuVCvH5LAbLj44vuotkpY85qHpecQGRO5bB

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
-- Name: payment_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_id text NOT NULL,
    amount numeric NOT NULL,
    payment_date timestamp with time zone DEFAULT now() NOT NULL,
    remaining_amount numeric NOT NULL,
    payment_method text DEFAULT 'Tunai'::text,
    account_id text,
    account_name text,
    notes text,
    recorded_by uuid,
    recorded_by_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id uuid,
    is_cancelled boolean DEFAULT false,
    cancelled_at timestamp with time zone,
    cancelled_by uuid,
    cancelled_by_name text,
    cancel_reason text,
    CONSTRAINT payment_history_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT payment_history_remaining_amount_check CHECK ((remaining_amount >= (0)::numeric))
);


--
-- Name: payment_history payment_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_history
    ADD CONSTRAINT payment_history_pkey PRIMARY KEY (id);


--
-- Name: idx_payment_history_branch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_history_branch_id ON public.payment_history USING btree (branch_id);


--
-- Name: idx_payment_history_payment_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_history_payment_date ON public.payment_history USING btree (payment_date);


--
-- Name: idx_payment_history_transaction_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_history_transaction_id ON public.payment_history USING btree (transaction_id);


--
-- Name: payment_history payment_history_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_history
    ADD CONSTRAINT payment_history_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: payment_history payment_history_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_history
    ADD CONSTRAINT payment_history_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: payment_history payment_history_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_history
    ADD CONSTRAINT payment_history_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(id);


--
-- Name: payment_history payment_history_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_history
    ADD CONSTRAINT payment_history_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;


--
-- Name: payment_history payment_history_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payment_history_allow_all ON public.payment_history TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict wfEp7KI3HRZC6aNAy7oKRFoekT5PwuVCvH5LAbLj44vuotkpY85qHpecQGRO5bB

