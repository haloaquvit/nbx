--
-- PostgreSQL database dump
--

\restrict M5vW6zJYn8ReyfpTnqSAoWrxo0s6R6xhyzu5ZxlOQ9ogwsI2t3Oq2wh30RALsl7

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
-- Name: advance_repayments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advance_repayments (
    id text NOT NULL,
    advance_id text,
    amount numeric NOT NULL,
    date timestamp with time zone NOT NULL,
    recorded_by text
);


--
-- Name: advance_repayments advance_repayments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_repayments
    ADD CONSTRAINT advance_repayments_pkey PRIMARY KEY (id);


--
-- Name: advance_repayments advance_repayments_advance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_repayments
    ADD CONSTRAINT advance_repayments_advance_id_fkey FOREIGN KEY (advance_id) REFERENCES public.employee_advances(id) ON DELETE CASCADE;


--
-- Name: advance_repayments advance_repayments_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY advance_repayments_allow_all ON public.advance_repayments TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict M5vW6zJYn8ReyfpTnqSAoWrxo0s6R6xhyzu5ZxlOQ9ogwsI2t3Oq2wh30RALsl7

