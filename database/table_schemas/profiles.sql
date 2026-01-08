--
-- PostgreSQL database dump
--

\restrict NY1lwMhvXIILaOCLJMPNZ4B3IkeEpvdakYWsaxbhIlyGHBWFGRHDpm2O3TWgIS8

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
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    full_name text,
    role text DEFAULT 'user'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    password_hash character varying(255),
    branch_id uuid,
    username text,
    phone text,
    address text,
    status text DEFAULT 'Aktif'::text,
    name text GENERATED ALWAYS AS (full_name) STORED,
    allowed_branches uuid[] DEFAULT '{}'::uuid[],
    password_changed_at timestamp with time zone DEFAULT now(),
    current_session_id character varying(36),
    session_started_at timestamp without time zone,
    pin text
);


--
-- Name: COLUMN profiles.allowed_branches; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.allowed_branches IS 'Array of branch UUIDs user can access. Empty means all branches.';


--
-- Name: COLUMN profiles.pin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.pin IS 'User PIN for idle session validation (4-6 digits). If NULL, PIN validation is bypassed for this user.';


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: idx_profiles_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_email ON public.profiles USING btree (email);


--
-- Name: idx_profiles_pin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_pin ON public.profiles USING btree (id) WHERE (pin IS NOT NULL);


--
-- Name: idx_profiles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);


--
-- Name: profiles profiles_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: profiles profiles_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_allow_all ON public.profiles TO authenticated, anon, owner, admin, supervisor, cashier, designer, operator, supir, sales, helper USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict NY1lwMhvXIILaOCLJMPNZ4B3IkeEpvdakYWsaxbhIlyGHBWFGRHDpm2O3TWgIS8

