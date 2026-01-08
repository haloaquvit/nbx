--
-- PostgreSQL database dump
--

\restrict EXmUyZPhIGWDl0RMtXcXN71cN2fwMtUjMHqDGMKCgLxcLySYgRMzwkAGgaEF2zZ

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
-- Name: inventory_batch_consumptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_batch_consumptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    transaction_id text,
    quantity_consumed numeric(15,2) NOT NULL,
    unit_cost numeric(15,2) NOT NULL,
    total_cost numeric(15,2) NOT NULL,
    consumed_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    total_hpp numeric DEFAULT 0,
    batches_detail jsonb,
    reference_id text,
    reference_type text,
    CONSTRAINT qty_consumed_positive CHECK ((quantity_consumed > (0)::numeric))
);


--
-- Name: inventory_batch_consumptions inventory_batch_consumptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batch_consumptions
    ADD CONSTRAINT inventory_batch_consumptions_pkey PRIMARY KEY (id);


--
-- Name: idx_batch_consumptions_transaction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batch_consumptions_transaction ON public.inventory_batch_consumptions USING btree (transaction_id);


--
-- Name: inventory_batch_consumptions inventory_batch_consumptions_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batch_consumptions
    ADD CONSTRAINT inventory_batch_consumptions_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.inventory_batches(id) ON DELETE CASCADE;


--
-- Name: inventory_batch_consumptions Allow all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for authenticated users" ON public.inventory_batch_consumptions TO authenticated USING (true) WITH CHECK (true);


--
-- Name: inventory_batch_consumptions Allow read for anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow read for anon" ON public.inventory_batch_consumptions FOR SELECT TO anon USING (true);


--
-- Name: inventory_batch_consumptions inventory_batch_consumptions_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_batch_consumptions_allow_all ON public.inventory_batch_consumptions TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict EXmUyZPhIGWDl0RMtXcXN71cN2fwMtUjMHqDGMKCgLxcLySYgRMzwkAGgaEF2zZ

