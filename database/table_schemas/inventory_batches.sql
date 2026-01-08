--
-- PostgreSQL database dump
--

\restrict cku2NLhVFdgR6lLxuAjnCrnc2PPiOjEtFNFCOanYc9nnDPh9MmfM0phMOywnIQb

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
-- Name: inventory_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    branch_id uuid,
    batch_date timestamp with time zone DEFAULT now() NOT NULL,
    purchase_order_id text,
    supplier_id uuid,
    initial_quantity numeric(15,2) NOT NULL,
    remaining_quantity numeric(15,2) NOT NULL,
    unit_cost numeric(15,2) NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    material_id uuid,
    production_id uuid,
    CONSTRAINT initial_qty_non_negative CHECK ((initial_quantity >= (0)::numeric))
);


--
-- Name: inventory_batches inventory_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_pkey PRIMARY KEY (id);


--
-- Name: idx_inventory_batches_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_batches_branch ON public.inventory_batches USING btree (branch_id);


--
-- Name: idx_inventory_batches_fifo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_batches_fifo ON public.inventory_batches USING btree (product_id, branch_id, batch_date) WHERE (remaining_quantity > (0)::numeric);


--
-- Name: idx_inventory_batches_material; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_batches_material ON public.inventory_batches USING btree (material_id);


--
-- Name: idx_inventory_batches_material_fifo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_batches_material_fifo ON public.inventory_batches USING btree (material_id, branch_id, batch_date) WHERE (remaining_quantity > (0)::numeric);


--
-- Name: idx_inventory_batches_material_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_batches_material_id ON public.inventory_batches USING btree (material_id) WHERE (material_id IS NOT NULL);


--
-- Name: idx_inventory_batches_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_batches_product ON public.inventory_batches USING btree (product_id);


--
-- Name: idx_inventory_batches_product_fifo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_batches_product_fifo ON public.inventory_batches USING btree (product_id, branch_id, batch_date);


--
-- Name: idx_inventory_batches_production_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_batches_production_id ON public.inventory_batches USING btree (production_id);


--
-- Name: inventory_batches inventory_batches_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: inventory_batches inventory_batches_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE CASCADE;


--
-- Name: inventory_batches inventory_batches_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: inventory_batches inventory_batches_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id);


--
-- Name: inventory_batches inventory_batches_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: inventory_batches Allow all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for authenticated users" ON public.inventory_batches TO authenticated USING (true) WITH CHECK (true);


--
-- Name: inventory_batches Allow read for anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow read for anon" ON public.inventory_batches FOR SELECT TO anon USING (true);


--
-- Name: inventory_batches inventory_batches_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_batches_allow_all ON public.inventory_batches TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict cku2NLhVFdgR6lLxuAjnCrnc2PPiOjEtFNFCOanYc9nnDPh9MmfM0phMOywnIQb

