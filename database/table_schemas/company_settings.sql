--
-- PostgreSQL database dump
--

\restrict d5BcqikEzFhhnb8oxzdZKOZ78PFQsfETb8T83es2fSEfliJFhKEdNcf3ISl5cGp

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
-- Name: company_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_settings (
    key text NOT NULL,
    value text
);


--
-- Name: company_settings company_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_pkey PRIMARY KEY (key);


--
-- Name: company_settings company_settings_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_settings_allow_all ON public.company_settings TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict d5BcqikEzFhhnb8oxzdZKOZ78PFQsfETb8T83es2fSEfliJFhKEdNcf3ISl5cGp

