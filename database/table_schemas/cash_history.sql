--
-- PostgreSQL database dump
--

\restrict mBgHqhHsKdA6a4wz7ZoMWIxxX6xK7Uatjjex4hxdzZQKFdsNsGhRH1CNicMp9Jh

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
-- Name: cash_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id text NOT NULL,
    transaction_type text NOT NULL,
    amount numeric NOT NULL,
    description text NOT NULL,
    reference_number text,
    created_by uuid,
    created_by_name text,
    source_type text,
    created_at timestamp with time zone DEFAULT now(),
    branch_id uuid,
    type text,
    account_name text,
    CONSTRAINT cash_history_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT cash_history_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['income'::text, 'expense'::text])))
);


--
-- Name: cash_history cash_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_history
    ADD CONSTRAINT cash_history_pkey PRIMARY KEY (id);


--
-- Name: idx_cash_history_account_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cash_history_account_id ON public.cash_history USING btree (account_id);


--
-- Name: idx_cash_history_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cash_history_created_at ON public.cash_history USING btree (created_at);


--
-- Name: idx_cash_history_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cash_history_type ON public.cash_history USING btree (transaction_type);


--
-- Name: cash_history cash_history_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_history
    ADD CONSTRAINT cash_history_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: cash_history cash_history_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_history
    ADD CONSTRAINT cash_history_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: cash_history cash_history_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_history
    ADD CONSTRAINT cash_history_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: cash_history cash_history_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cash_history_allow_all ON public.cash_history TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict mBgHqhHsKdA6a4wz7ZoMWIxxX6xK7Uatjjex4hxdzZQKFdsNsGhRH1CNicMp9Jh

