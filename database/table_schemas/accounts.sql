--
-- PostgreSQL database dump
--

\restrict 6nlLVHRF7h27dmWcc5U9wxsS25y4GN9LnLzo8xAWJvB71EfturhakQibMaMM0Ry

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
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    balance numeric NOT NULL,
    is_payment_account boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    initial_balance numeric DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    code character varying(10),
    parent_id text,
    level integer DEFAULT 1,
    is_header boolean DEFAULT false,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    branch_id uuid,
    employee_id uuid,
    normal_balance text DEFAULT 'DEBIT'::text,
    CONSTRAINT accounts_level_check CHECK (((level >= 1) AND (level <= 4)))
);


--
-- Name: COLUMN accounts.balance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.balance IS 'Saldo saat ini yang dihitung dari initial_balance + semua transaksi';


--
-- Name: COLUMN accounts.initial_balance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.initial_balance IS 'Saldo awal yang diinput oleh owner, tidak berubah kecuali diupdate manual';


--
-- Name: COLUMN accounts.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.code IS 'Kode akun standar (1000, 1100, 1110, dst)';


--
-- Name: COLUMN accounts.parent_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.parent_id IS 'ID parent account untuk hierarki';


--
-- Name: COLUMN accounts.level; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.level IS 'Level hierarki: 1=Header, 2=Sub-header, 3=Detail, 4=Sub-detail';


--
-- Name: COLUMN accounts.is_header; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.is_header IS 'Apakah ini header account (tidak bisa digunakan untuk transaksi)';


--
-- Name: COLUMN accounts.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.is_active IS 'Status aktif account';


--
-- Name: COLUMN accounts.sort_order; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.accounts.sort_order IS 'Urutan tampilan dalam laporan';


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: accounts_code_branch_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX accounts_code_branch_unique ON public.accounts USING btree (code, branch_id);


--
-- Name: idx_accounts_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounts_code ON public.accounts USING btree (code);


--
-- Name: idx_accounts_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounts_employee_id ON public.accounts USING btree (employee_id);


--
-- Name: idx_accounts_is_payment_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounts_is_payment_account ON public.accounts USING btree (is_payment_account);


--
-- Name: idx_accounts_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounts_level ON public.accounts USING btree (level);


--
-- Name: idx_accounts_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounts_parent ON public.accounts USING btree (parent_id);


--
-- Name: idx_accounts_sort_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounts_sort_order ON public.accounts USING btree (sort_order);


--
-- Name: idx_accounts_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounts_type ON public.accounts USING btree (type);


--
-- Name: accounts accounts_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: accounts accounts_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: accounts accounts_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_parent_fk FOREIGN KEY (parent_id) REFERENCES public.accounts(id) ON DELETE RESTRICT;


--
-- Name: accounts accounts_delete_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounts_delete_authenticated ON public.accounts FOR DELETE TO authenticated, owner, admin USING (true);


--
-- Name: accounts accounts_modify_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounts_modify_authenticated ON public.accounts FOR INSERT TO authenticated, owner, admin WITH CHECK (true);


--
-- Name: accounts accounts_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounts_select_all ON public.accounts FOR SELECT TO authenticated, anon, owner, admin, supervisor, cashier, designer, operator, supir, sales, helper USING (true);


--
-- Name: accounts accounts_update_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounts_update_authenticated ON public.accounts FOR UPDATE TO authenticated, owner, admin USING (true);


--
-- PostgreSQL database dump complete
--

\unrestrict 6nlLVHRF7h27dmWcc5U9wxsS25y4GN9LnLzo8xAWJvB71EfturhakQibMaMM0Ry

