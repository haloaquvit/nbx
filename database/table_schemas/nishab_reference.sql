--
-- PostgreSQL database dump
--

\restrict BhgqOROYDRnum6SXgg78wsHXzTLjrLf0Jksdwagstvfwhlyn4UKrZmj1V3rlsnI

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
-- Name: nishab_reference; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nishab_reference (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gold_price numeric(15,2),
    silver_price numeric(15,2),
    gold_nishab numeric(15,4) DEFAULT 85,
    silver_nishab numeric(15,4) DEFAULT 595,
    zakat_rate numeric(5,4) DEFAULT 0.025,
    effective_date date DEFAULT CURRENT_DATE,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    notes text
);


--
-- Name: nishab_reference nishab_reference_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nishab_reference
    ADD CONSTRAINT nishab_reference_pkey PRIMARY KEY (id);


--
-- Name: nishab_reference nishab_reference_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nishab_reference
    ADD CONSTRAINT nishab_reference_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: nishab_reference Allow all for nishab_reference; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for nishab_reference" ON public.nishab_reference USING (true) WITH CHECK (true);


--
-- Name: nishab_reference nishab_reference_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nishab_reference_allow_all ON public.nishab_reference TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict BhgqOROYDRnum6SXgg78wsHXzTLjrLf0Jksdwagstvfwhlyn4UKrZmj1V3rlsnI

