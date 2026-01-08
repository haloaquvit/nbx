--
-- PostgreSQL database dump
--

\restrict 2ZA4MTjjGn2tb1IGqws1PRc1SwsrPOIc7akQiKZ2wLvgadfn9fNZjVXAklSbNlh

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
-- Name: journal_entry_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_entry_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_entry_id uuid NOT NULL,
    line_number integer DEFAULT 1 NOT NULL,
    account_id text NOT NULL,
    account_code text,
    account_name text,
    debit_amount numeric(15,2) DEFAULT 0 NOT NULL,
    credit_amount numeric(15,2) DEFAULT 0 NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT journal_entry_lines_amount_check CHECK ((((debit_amount > (0)::numeric) AND (credit_amount = (0)::numeric)) OR ((debit_amount = (0)::numeric) AND (credit_amount > (0)::numeric))))
);


--
-- Name: TABLE journal_entry_lines; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.journal_entry_lines IS 'Baris Jurnal - Detail debit/credit per akun untuk setiap jurnal';


--
-- Name: journal_entry_lines journal_entry_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entry_lines
    ADD CONSTRAINT journal_entry_lines_pkey PRIMARY KEY (id);


--
-- Name: journal_entry_lines journal_entry_lines_unique_line; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entry_lines
    ADD CONSTRAINT journal_entry_lines_unique_line UNIQUE (journal_entry_id, line_number);


--
-- Name: idx_journal_entry_lines_account_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_entry_lines_account_id ON public.journal_entry_lines USING btree (account_id);


--
-- Name: idx_journal_entry_lines_journal_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_entry_lines_journal_id ON public.journal_entry_lines USING btree (journal_entry_id);


--
-- Name: journal_entry_lines trg_balance_line_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_balance_line_change AFTER INSERT OR DELETE OR UPDATE ON public.journal_entry_lines FOR EACH ROW EXECUTE FUNCTION public.tf_update_balance_on_line_change();


--
-- Name: journal_entry_lines journal_entry_lines_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entry_lines
    ADD CONSTRAINT journal_entry_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: journal_entry_lines journal_entry_lines_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entry_lines
    ADD CONSTRAINT journal_entry_lines_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;


--
-- Name: journal_entry_lines journal_entry_lines_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY journal_entry_lines_delete ON public.journal_entry_lines FOR DELETE USING ((auth.role() = ANY (ARRAY['owner'::text, 'admin'::text])));


--
-- Name: journal_entry_lines journal_entry_lines_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY journal_entry_lines_insert ON public.journal_entry_lines FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: journal_entry_lines journal_entry_lines_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY journal_entry_lines_select ON public.journal_entry_lines FOR SELECT USING (true);


--
-- Name: journal_entry_lines journal_entry_lines_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY journal_entry_lines_update ON public.journal_entry_lines FOR UPDATE TO authenticated USING (true);


--
-- PostgreSQL database dump complete
--

\unrestrict 2ZA4MTjjGn2tb1IGqws1PRc1SwsrPOIc7akQiKZ2wLvgadfn9fNZjVXAklSbNlh

