--
-- PostgreSQL database dump
--

\restrict f5D1yezWDqubTENKFnr0FG6SnUS4MVc7M0h1WeUV5EK6xon5CygeLQcWdDwcGf9

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
-- Name: retasi_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retasi_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    retasi_id uuid,
    product_id uuid,
    product_name text,
    quantity integer DEFAULT 0,
    weight numeric(10,2) DEFAULT 0,
    returned_qty integer DEFAULT 0,
    error_qty integer DEFAULT 0,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    customer_name text,
    amount numeric(15,2) DEFAULT 0,
    collected_amount numeric(15,2) DEFAULT 0,
    status text DEFAULT 'pending'::text,
    sold_qty integer DEFAULT 0,
    unsold_qty integer DEFAULT 0
);


--
-- Name: retasi_items retasi_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retasi_items
    ADD CONSTRAINT retasi_items_pkey PRIMARY KEY (id);


--
-- Name: retasi_items retasi_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retasi_items
    ADD CONSTRAINT retasi_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: retasi_items retasi_items_retasi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retasi_items
    ADD CONSTRAINT retasi_items_retasi_id_fkey FOREIGN KEY (retasi_id) REFERENCES public.retasi(id) ON DELETE CASCADE;


--
-- Name: retasi_items retasi_items_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY retasi_items_allow_all ON public.retasi_items TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict f5D1yezWDqubTENKFnr0FG6SnUS4MVc7M0h1WeUV5EK6xon5CygeLQcWdDwcGf9

