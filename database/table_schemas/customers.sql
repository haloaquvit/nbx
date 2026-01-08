--
-- PostgreSQL database dump
--

\restrict rRBvQzgxYAW6W5pMCMYYhgS0PedkaxhyRzNrUMGOgOxbO4Wij5MtdLz8HK7RZZe

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
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text,
    address text,
    "orderCount" integer DEFAULT 0,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    latitude numeric,
    longitude numeric,
    full_address text,
    store_photo_url text,
    store_photo_drive_id text,
    jumlah_galon_titip integer DEFAULT 0,
    branch_id uuid,
    classification text,
    last_visited_at timestamp with time zone,
    last_visited_by uuid,
    visit_count integer DEFAULT 0,
    ordercount integer DEFAULT 0,
    createdat timestamp with time zone DEFAULT now()
);


--
-- Name: COLUMN customers.jumlah_galon_titip; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customers.jumlah_galon_titip IS 'Jumlah galon yang dititip di pelanggan';


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: idx_customers_classification; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_classification ON public.customers USING btree (classification);


--
-- Name: idx_customers_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_created_at ON public.customers USING btree ("createdAt");


--
-- Name: idx_customers_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_name ON public.customers USING btree (name);


--
-- Name: customers customers_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: customers customers_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_allow_all ON public.customers TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict rRBvQzgxYAW6W5pMCMYYhgS0PedkaxhyRzNrUMGOgOxbO4Wij5MtdLz8HK7RZZe

