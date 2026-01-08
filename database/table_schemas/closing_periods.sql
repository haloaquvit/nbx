--
-- PostgreSQL database dump
--

\restrict HDAurIVxivekH8Q2AklW6BYBdfYKY9XSGBVIrL24EMW6xpChRkNc1oPBRjsxsfa

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
-- Name: closing_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.closing_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    year integer NOT NULL,
    closed_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_by uuid,
    journal_entry_id uuid,
    net_income numeric DEFAULT 0 NOT NULL,
    branch_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: closing_periods closing_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.closing_periods
    ADD CONSTRAINT closing_periods_pkey PRIMARY KEY (id);


--
-- Name: closing_periods closing_periods_year_branch_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.closing_periods
    ADD CONSTRAINT closing_periods_year_branch_id_key UNIQUE (year, branch_id);


--
-- Name: idx_closing_periods_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_closing_periods_branch ON public.closing_periods USING btree (branch_id);


--
-- Name: idx_closing_periods_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_closing_periods_year ON public.closing_periods USING btree (year);


--
-- Name: closing_periods closing_periods_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.closing_periods
    ADD CONSTRAINT closing_periods_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: closing_periods closing_periods_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.closing_periods
    ADD CONSTRAINT closing_periods_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);


--
-- PostgreSQL database dump complete
--

\unrestrict HDAurIVxivekH8Q2AklW6BYBdfYKY9XSGBVIrL24EMW6xpChRkNc1oPBRjsxsfa

