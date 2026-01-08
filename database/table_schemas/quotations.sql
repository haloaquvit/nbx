--
-- PostgreSQL database dump
--

\restrict sMH9xouDNJkSweIBbCKgOB9jZxRafURLGQvKbcHnJwezTpCUdTxULErQN7ca8Am

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
-- Name: quotations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quotations (
    id text NOT NULL,
    customer_id uuid,
    customer_name text,
    prepared_by text,
    items jsonb,
    total numeric,
    status text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    valid_until timestamp with time zone,
    transaction_id text,
    branch_id uuid,
    notes text,
    quotation_number text,
    customer_address text,
    customer_phone text,
    quotation_date timestamp with time zone DEFAULT now(),
    subtotal numeric DEFAULT 0,
    discount_amount numeric DEFAULT 0,
    tax_amount numeric DEFAULT 0,
    terms text,
    created_by uuid,
    created_by_name text,
    converted_to_invoice_id uuid,
    converted_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: quotations quotations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_pkey PRIMARY KEY (id);


--
-- Name: idx_quotations_branch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotations_branch_id ON public.quotations USING btree (branch_id);


--
-- Name: idx_quotations_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotations_customer_id ON public.quotations USING btree (customer_id);


--
-- Name: idx_quotations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotations_status ON public.quotations USING btree (status);


--
-- Name: quotations quotations_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: quotations quotations_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: quotations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

--
-- Name: quotations quotations_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quotations_allow_all ON public.quotations TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict sMH9xouDNJkSweIBbCKgOB9jZxRafURLGQvKbcHnJwezTpCUdTxULErQN7ca8Am

