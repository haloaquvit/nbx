--
-- PostgreSQL database dump
--

\restrict 9VUNR1MGHDXCgXbfHE9HTVQyLaAWAhgLk1jRip3bLfUJ4xX0duO3C3fcuCYdLvg

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
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id text NOT NULL,
    description text NOT NULL,
    amount numeric NOT NULL,
    account_id text,
    account_name text,
    date timestamp with time zone NOT NULL,
    category text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expense_account_id character varying(50),
    expense_account_name character varying(100),
    branch_id uuid,
    is_cancelled boolean DEFAULT false,
    cancelled_at timestamp with time zone,
    cancelled_by uuid,
    cancelled_by_name text,
    cancel_reason text
);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: idx_expenses_not_cancelled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_not_cancelled ON public.expenses USING btree (id) WHERE ((is_cancelled = false) OR (is_cancelled IS NULL));


--
-- Name: expenses expenses_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: expenses expenses_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: expenses fk_expenses_expense_account; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT fk_expenses_expense_account FOREIGN KEY (expense_account_id) REFERENCES public.accounts(id);


--
-- Name: expenses expenses_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expenses_allow_all ON public.expenses TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict 9VUNR1MGHDXCgXbfHE9HTVQyLaAWAhgLk1jRip3bLfUJ4xX0duO3C3fcuCYdLvg

