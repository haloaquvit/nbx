--
-- PostgreSQL database dump
--

\restrict UMrujKzun43cx2ZPWhfDc7Y0OMYqCJp3tyY9BIjA62yWQ2NCZV0qKjUOLmcV71f

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
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_id text NOT NULL,
    permissions jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);


--
-- Name: role_permissions_role_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX role_permissions_role_id_idx ON public.role_permissions USING btree (role_id);


--
-- Name: role_permissions role_permissions_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY role_permissions_allow_all ON public.role_permissions TO authenticated, anon, owner, admin, supervisor, cashier, designer, operator, supir, sales, helper USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict UMrujKzun43cx2ZPWhfDc7Y0OMYqCJp3tyY9BIjA62yWQ2NCZV0qKjUOLmcV71f

