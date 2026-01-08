--
-- PostgreSQL database dump
--

\restrict jwijSs94dkPAol4azNka1F6tlzLv72jj8Z5JWFIMySm55wirxgWdSTcE43RA41c

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
-- Name: stock_pricings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_pricings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    min_stock integer NOT NULL,
    max_stock integer,
    price numeric(15,2) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE stock_pricings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.stock_pricings IS 'Pricing rules based on product stock levels';


--
-- Name: COLUMN stock_pricings.min_stock; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_pricings.min_stock IS 'Minimum stock level for this pricing rule';


--
-- Name: COLUMN stock_pricings.max_stock; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_pricings.max_stock IS 'Maximum stock level for this pricing rule (NULL means no upper limit)';


--
-- Name: COLUMN stock_pricings.price; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_pricings.price IS 'Price to use when stock is within the range';


--
-- Name: stock_pricings stock_pricings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_pricings
    ADD CONSTRAINT stock_pricings_pkey PRIMARY KEY (id);


--
-- Name: idx_stock_pricings_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_pricings_active ON public.stock_pricings USING btree (is_active);


--
-- Name: idx_stock_pricings_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_pricings_product_id ON public.stock_pricings USING btree (product_id);


--
-- Name: idx_stock_pricings_stock_range; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_pricings_stock_range ON public.stock_pricings USING btree (min_stock, max_stock);


--
-- Name: stock_pricings stock_pricings_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_pricings
    ADD CONSTRAINT stock_pricings_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: stock_pricings stock_pricings_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_pricings_delete ON public.stock_pricings FOR DELETE USING ((auth.role() = ANY (ARRAY['owner'::text, 'admin'::text])));


--
-- Name: stock_pricings stock_pricings_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_pricings_insert ON public.stock_pricings FOR INSERT WITH CHECK (((auth.uid() IS NOT NULL) OR (CURRENT_USER = ANY (ARRAY['owner'::name, 'admin'::name, 'supervisor'::name, 'cashier'::name, 'authenticated'::name]))));


--
-- Name: stock_pricings stock_pricings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_pricings_select ON public.stock_pricings FOR SELECT USING (true);


--
-- Name: stock_pricings stock_pricings_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_pricings_update ON public.stock_pricings FOR UPDATE USING (((auth.uid() IS NOT NULL) OR (CURRENT_USER = ANY (ARRAY['owner'::name, 'admin'::name, 'supervisor'::name, 'cashier'::name, 'authenticated'::name]))));


--
-- PostgreSQL database dump complete
--

\unrestrict jwijSs94dkPAol4azNka1F6tlzLv72jj8Z5JWFIMySm55wirxgWdSTcE43RA41c

