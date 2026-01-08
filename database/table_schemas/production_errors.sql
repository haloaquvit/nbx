--
-- PostgreSQL database dump
--

\restrict t5ZxoGoZtVYrjj4sCHrUKcNKoqrbTXK3Wcq9IdhstFuPhBK3pFZ19GO8dUPfPFH

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
-- Name: production_errors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.production_errors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ref character varying(50) NOT NULL,
    material_id uuid NOT NULL,
    quantity numeric(10,2) NOT NULL,
    note text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT production_errors_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: TABLE production_errors; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.production_errors IS 'Records of material errors/defects during production process';


--
-- Name: COLUMN production_errors.ref; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.production_errors.ref IS 'Unique reference code for the error record (e.g., ERR-250122-001)';


--
-- Name: COLUMN production_errors.material_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.production_errors.material_id IS 'Reference to the material that had errors';


--
-- Name: COLUMN production_errors.quantity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.production_errors.quantity IS 'Quantity of material that was defective/error';


--
-- Name: COLUMN production_errors.note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.production_errors.note IS 'Description of the error or defect';


--
-- Name: COLUMN production_errors.created_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.production_errors.created_by IS 'User who recorded the error';


--
-- Name: production_errors production_errors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_errors
    ADD CONSTRAINT production_errors_pkey PRIMARY KEY (id);


--
-- Name: production_errors production_errors_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_errors
    ADD CONSTRAINT production_errors_ref_key UNIQUE (ref);


--
-- Name: idx_production_errors_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_production_errors_created_at ON public.production_errors USING btree (created_at);


--
-- Name: idx_production_errors_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_production_errors_created_by ON public.production_errors USING btree (created_by);


--
-- Name: idx_production_errors_material_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_production_errors_material_id ON public.production_errors USING btree (material_id);


--
-- Name: idx_production_errors_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_production_errors_ref ON public.production_errors USING btree (ref);


--
-- Name: production_errors production_errors_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_errors
    ADD CONSTRAINT production_errors_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: production_errors production_errors_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_errors
    ADD CONSTRAINT production_errors_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE CASCADE;


--
-- Name: production_errors production_errors_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY production_errors_allow_all ON public.production_errors TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict t5ZxoGoZtVYrjj4sCHrUKcNKoqrbTXK3Wcq9IdhstFuPhBK3pFZ19GO8dUPfPFH

