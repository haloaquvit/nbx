--
-- PostgreSQL database dump
--

\restrict XGcBczyzMqnBme9mrX5onIodsSMeeAGO1LxS83Dge0Sb4OCz21tThnvcA8bntte

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
-- Name: assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    code text,
    category text,
    purchase_date date,
    purchase_price numeric(15,2) DEFAULT 0,
    current_value numeric(15,2) DEFAULT 0,
    depreciation_method text DEFAULT 'straight_line'::text,
    useful_life_years integer DEFAULT 5,
    salvage_value numeric(15,2) DEFAULT 0,
    location text,
    status text DEFAULT 'active'::text,
    notes text,
    branch_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    asset_name text GENERATED ALWAYS AS (name) STORED,
    asset_code text,
    description text,
    supplier_name text,
    brand text,
    model text,
    serial_number text,
    condition text DEFAULT 'good'::text,
    account_id text,
    warranty_expiry date,
    insurance_expiry date,
    photo_url text,
    created_by uuid
);


--
-- Name: assets assets_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_code_key UNIQUE (code);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: assets assets_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: assets assets_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: assets assets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: assets assets_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assets_allow_all ON public.assets TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict XGcBczyzMqnBme9mrX5onIodsSMeeAGO1LxS83Dge0Sb4OCz21tThnvcA8bntte

