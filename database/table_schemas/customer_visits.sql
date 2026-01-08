--
-- PostgreSQL database dump
--

\restrict qixKkkkFb1HgbVSfHWSZaBN5yi8ruSGd4VPNdfMhtkxuAAO3pHWIAc8cAMkDMis

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
-- Name: customer_visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_visits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    visited_by text,
    visited_by_name text,
    visited_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: customer_visits customer_visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_visits
    ADD CONSTRAINT customer_visits_pkey PRIMARY KEY (id);


--
-- Name: idx_customer_visits_branch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_visits_branch_id ON public.customer_visits USING btree (branch_id);


--
-- Name: idx_customer_visits_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_visits_customer_id ON public.customer_visits USING btree (customer_id);


--
-- Name: idx_customer_visits_visited_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_visits_visited_at ON public.customer_visits USING btree (visited_at);


--
-- Name: idx_customer_visits_visited_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_visits_visited_by ON public.customer_visits USING btree (visited_by);


--
-- Name: customer_visits customer_visits_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_visits
    ADD CONSTRAINT customer_visits_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: customer_visits customer_visits_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_visits
    ADD CONSTRAINT customer_visits_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: customer_visits customer_visits_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_visits_allow_all ON public.customer_visits TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict qixKkkkFb1HgbVSfHWSZaBN5yi8ruSGd4VPNdfMhtkxuAAO3pHWIAc8cAMkDMis

