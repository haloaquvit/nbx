--
-- PostgreSQL database dump
--

\restrict Ahzdox5XVu5tMG79LXmRnXIfmbUvQrJHmfR2hbCItSeLeEVoqXFDKIZbLIL72Yh

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
-- Name: supplier_materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_id uuid NOT NULL,
    material_id uuid NOT NULL,
    supplier_price numeric NOT NULL,
    unit character varying(20) NOT NULL,
    min_order_qty integer DEFAULT 1,
    lead_time_days integer DEFAULT 7,
    last_updated timestamp with time zone DEFAULT now(),
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT supplier_materials_supplier_price_check CHECK ((supplier_price > (0)::numeric))
);


--
-- Name: supplier_materials supplier_materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_materials
    ADD CONSTRAINT supplier_materials_pkey PRIMARY KEY (id);


--
-- Name: supplier_materials supplier_materials_supplier_id_material_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_materials
    ADD CONSTRAINT supplier_materials_supplier_id_material_id_key UNIQUE (supplier_id, material_id);


--
-- Name: idx_supplier_materials_material_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_materials_material_id ON public.supplier_materials USING btree (material_id);


--
-- Name: idx_supplier_materials_supplier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_materials_supplier_id ON public.supplier_materials USING btree (supplier_id);


--
-- Name: supplier_materials supplier_materials_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_materials
    ADD CONSTRAINT supplier_materials_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE CASCADE;


--
-- Name: supplier_materials supplier_materials_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_materials
    ADD CONSTRAINT supplier_materials_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: supplier_materials supplier_materials_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_materials_allow_all ON public.supplier_materials TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict Ahzdox5XVu5tMG79LXmRnXIfmbUvQrJHmfR2hbCItSeLeEVoqXFDKIZbLIL72Yh

