--
-- PostgreSQL database dump
--

\restrict rJQrfxUsx3EyR74S7jcxduNhJBarAGkdHb3SdVbo6g2U4V4lKJYwUvgbXhY39Zq

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
-- Name: bonus_pricings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bonus_pricings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    min_quantity integer NOT NULL,
    max_quantity integer,
    bonus_quantity integer DEFAULT 0 NOT NULL,
    bonus_type text NOT NULL,
    bonus_value numeric(15,2) DEFAULT 0 NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT bonus_pricings_bonus_type_check CHECK ((bonus_type = ANY (ARRAY['quantity'::text, 'percentage'::text, 'fixed_discount'::text])))
);


--
-- Name: TABLE bonus_pricings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.bonus_pricings IS 'Bonus rules based on purchase quantity';


--
-- Name: COLUMN bonus_pricings.min_quantity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bonus_pricings.min_quantity IS 'Minimum quantity for this bonus rule';


--
-- Name: COLUMN bonus_pricings.max_quantity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bonus_pricings.max_quantity IS 'Maximum quantity for this bonus rule (NULL means no upper limit)';


--
-- Name: COLUMN bonus_pricings.bonus_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bonus_pricings.bonus_type IS 'Type of bonus: quantity (free items), percentage (% discount), fixed_discount (fixed amount discount)';


--
-- Name: COLUMN bonus_pricings.bonus_value; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bonus_pricings.bonus_value IS 'Value of bonus depending on type: quantity in pieces, percentage (0-100), or fixed discount amount';


--
-- Name: bonus_pricings bonus_pricings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bonus_pricings
    ADD CONSTRAINT bonus_pricings_pkey PRIMARY KEY (id);


--
-- Name: idx_bonus_pricings_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bonus_pricings_active ON public.bonus_pricings USING btree (is_active);


--
-- Name: idx_bonus_pricings_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bonus_pricings_product_id ON public.bonus_pricings USING btree (product_id);


--
-- Name: idx_bonus_pricings_qty_range; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bonus_pricings_qty_range ON public.bonus_pricings USING btree (min_quantity, max_quantity);


--
-- Name: bonus_pricings bonus_pricings_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bonus_pricings
    ADD CONSTRAINT bonus_pricings_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: bonus_pricings bonus_pricings_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bonus_pricings_delete ON public.bonus_pricings FOR DELETE USING ((auth.role() = ANY (ARRAY['owner'::text, 'admin'::text])));


--
-- Name: bonus_pricings bonus_pricings_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bonus_pricings_insert ON public.bonus_pricings FOR INSERT WITH CHECK (((auth.uid() IS NOT NULL) OR (CURRENT_USER = ANY (ARRAY['owner'::name, 'admin'::name, 'supervisor'::name, 'cashier'::name, 'authenticated'::name]))));


--
-- Name: bonus_pricings bonus_pricings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bonus_pricings_select ON public.bonus_pricings FOR SELECT USING (true);


--
-- Name: bonus_pricings bonus_pricings_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bonus_pricings_update ON public.bonus_pricings FOR UPDATE USING (((auth.uid() IS NOT NULL) OR (CURRENT_USER = ANY (ARRAY['owner'::name, 'admin'::name, 'supervisor'::name, 'cashier'::name, 'authenticated'::name]))));


--
-- PostgreSQL database dump complete
--

\unrestrict rJQrfxUsx3EyR74S7jcxduNhJBarAGkdHb3SdVbo6g2U4V4lKJYwUvgbXhY39Zq

