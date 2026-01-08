--
-- PostgreSQL database dump
--

\restrict ww2AUnx4SZoAImZ0FtdTFNJfAsluQUbfqx4pdWVLOtdOhpdirTBxG7lC5wkanpZ

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
-- Name: customer_pricings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_pricings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    customer_id uuid,
    customer_classification text,
    price_type text DEFAULT 'fixed'::text,
    price_value numeric(15,2),
    priority integer DEFAULT 0,
    description text,
    is_active boolean DEFAULT true,
    branch_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: customer_pricings customer_pricings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_pricings
    ADD CONSTRAINT customer_pricings_pkey PRIMARY KEY (id);


--
-- Name: customer_pricings customer_pricings_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_pricings
    ADD CONSTRAINT customer_pricings_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: customer_pricings customer_pricings_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_pricings
    ADD CONSTRAINT customer_pricings_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: customer_pricings customer_pricings_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_pricings
    ADD CONSTRAINT customer_pricings_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: customer_pricings customer_pricings_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_pricings_allow_all ON public.customer_pricings TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict ww2AUnx4SZoAImZ0FtdTFNJfAsluQUbfqx4pdWVLOtdOhpdirTBxG7lC5wkanpZ

