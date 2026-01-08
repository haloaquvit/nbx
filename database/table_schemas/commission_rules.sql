--
-- PostgreSQL database dump
--

\restrict hHuRVJcWPXJdNkdobgV0U7YJZo9A7ZcdGT9uXj5lxsGsW9GlTZco4lK20F9JYHh

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
-- Name: commission_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commission_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    product_name text NOT NULL,
    role text NOT NULL,
    rate_per_qty numeric(15,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT commission_rules_role_check CHECK ((role = ANY (ARRAY['sales'::text, 'driver'::text, 'helper'::text])))
);


--
-- Name: commission_rules commission_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_rules
    ADD CONSTRAINT commission_rules_pkey PRIMARY KEY (id);


--
-- Name: commission_rules commission_rules_product_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_rules
    ADD CONSTRAINT commission_rules_product_id_role_key UNIQUE (product_id, role);


--
-- Name: idx_commission_rules_product_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commission_rules_product_role ON public.commission_rules USING btree (product_id, role);


--
-- Name: commission_rules commission_rules_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY commission_rules_allow_all ON public.commission_rules TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict hHuRVJcWPXJdNkdobgV0U7YJZo9A7ZcdGT9uXj5lxsGsW9GlTZco4lK20F9JYHh

