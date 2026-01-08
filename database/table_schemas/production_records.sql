--
-- PostgreSQL database dump
--

\restrict uieObx9pb8jhyF8sJw6Aa4FPuQ6C8RkSziy1iMa2mWLhw1AzyleyLZ1PyIBhlE2

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
-- Name: production_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.production_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ref character varying(50) NOT NULL,
    product_id uuid,
    quantity numeric(10,2) DEFAULT 0 NOT NULL,
    note text,
    consume_bom boolean DEFAULT true NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    branch_id uuid,
    bom_snapshot jsonb,
    user_input_id uuid,
    user_input_name text,
    is_cancelled boolean DEFAULT false,
    cancelled_at timestamp with time zone,
    cancelled_by uuid,
    cancelled_by_name text,
    cancel_reason text,
    CONSTRAINT check_production_record_logic CHECK ((((product_id IS NULL) AND (quantity <= (0)::numeric)) OR ((product_id IS NOT NULL) AND (quantity >= (0)::numeric))))
);


--
-- Name: production_records production_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_records
    ADD CONSTRAINT production_records_pkey PRIMARY KEY (id);


--
-- Name: production_records production_records_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_records
    ADD CONSTRAINT production_records_ref_key UNIQUE (ref);


--
-- Name: idx_production_not_cancelled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_production_not_cancelled ON public.production_records USING btree (id) WHERE ((is_cancelled = false) OR (is_cancelled IS NULL));


--
-- Name: idx_production_records_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_production_records_created_at ON public.production_records USING btree (created_at);


--
-- Name: idx_production_records_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_production_records_created_by ON public.production_records USING btree (created_by);


--
-- Name: idx_production_records_error_entries; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_production_records_error_entries ON public.production_records USING btree (created_at) WHERE (product_id IS NULL);


--
-- Name: idx_production_records_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_production_records_product_id ON public.production_records USING btree (product_id);


--
-- Name: idx_production_records_product_id_nullable; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_production_records_product_id_nullable ON public.production_records USING btree (product_id) WHERE (product_id IS NOT NULL);


--
-- Name: production_records production_records_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_records
    ADD CONSTRAINT production_records_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: production_records production_records_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_records
    ADD CONSTRAINT production_records_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: production_records production_records_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_records
    ADD CONSTRAINT production_records_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: production_records production_records_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY production_records_allow_all ON public.production_records TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict uieObx9pb8jhyF8sJw6Aa4FPuQ6C8RkSziy1iMa2mWLhw1AzyleyLZ1PyIBhlE2

