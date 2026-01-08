--
-- PostgreSQL database dump
--

\restrict 09z6IACni5bGxd6EDZFSp2mXB8j1TwlMTtcT1Df35p4iR607c7RIJB7NnAJL2Sh

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
-- Name: zakat_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zakat_records (
    id text NOT NULL,
    type text NOT NULL,
    category text DEFAULT 'zakat'::text NOT NULL,
    title text NOT NULL,
    description text,
    recipient text,
    recipient_type text,
    amount numeric(15,2) DEFAULT 0 NOT NULL,
    nishab_amount numeric(15,2),
    percentage_rate numeric(5,2) DEFAULT 2.5,
    payment_date date DEFAULT CURRENT_DATE NOT NULL,
    payment_account_id uuid,
    payment_method text,
    status text DEFAULT 'pending'::text,
    cash_history_id uuid,
    receipt_number text,
    calculation_basis text,
    calculation_notes text,
    is_anonymous boolean DEFAULT false,
    notes text,
    attachment_url text,
    hijri_year text,
    hijri_month text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: zakat_records zakat_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zakat_records
    ADD CONSTRAINT zakat_records_pkey PRIMARY KEY (id);


--
-- Name: zakat_records Allow all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for authenticated users" ON public.zakat_records USING (true) WITH CHECK (true);


--
-- Name: zakat_records zakat_records_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY zakat_records_allow_all ON public.zakat_records TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict 09z6IACni5bGxd6EDZFSp2mXB8j1TwlMTtcT1Df35p4iR607c7RIJB7NnAJL2Sh

