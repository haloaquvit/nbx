--
-- PostgreSQL database dump
--

\restrict kGnkzuGYsIOWlhpuExjVWWIShdteYI24IvzgwPtY33I9AVcX58zkdwoPTcoPp8q

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
-- Name: commission_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commission_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    user_name text NOT NULL,
    role text NOT NULL,
    product_id uuid NOT NULL,
    product_name text NOT NULL,
    quantity integer DEFAULT 0 NOT NULL,
    rate_per_qty numeric(15,2) DEFAULT 0 NOT NULL,
    amount numeric(15,2) DEFAULT 0 NOT NULL,
    transaction_id text,
    delivery_id text,
    ref text NOT NULL,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    branch_id uuid,
    CONSTRAINT commission_entries_role_check CHECK ((role = ANY (ARRAY['sales'::text, 'driver'::text, 'helper'::text]))),
    CONSTRAINT commission_entries_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'cancelled'::text])))
);


--
-- Name: commission_entries commission_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_entries
    ADD CONSTRAINT commission_entries_pkey PRIMARY KEY (id);


--
-- Name: idx_commission_entries_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commission_entries_date ON public.commission_entries USING btree (created_at);


--
-- Name: idx_commission_entries_delivery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commission_entries_delivery ON public.commission_entries USING btree (delivery_id);


--
-- Name: idx_commission_entries_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commission_entries_role ON public.commission_entries USING btree (role);


--
-- Name: idx_commission_entries_transaction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commission_entries_transaction ON public.commission_entries USING btree (transaction_id);


--
-- Name: idx_commission_entries_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commission_entries_user ON public.commission_entries USING btree (user_id);


--
-- Name: commission_entries commission_entries_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_entries
    ADD CONSTRAINT commission_entries_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: commission_entries commission_entries_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY commission_entries_allow_all ON public.commission_entries TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict kGnkzuGYsIOWlhpuExjVWWIShdteYI24IvzgwPtY33I9AVcX58zkdwoPTcoPp8q

