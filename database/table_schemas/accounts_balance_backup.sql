--
-- PostgreSQL database dump
--

\restrict 5ij92JqxWGiC3vcrEORfji2LiDJyGlKHv3foeGhwuE5aVBofMEfS3rlcoSqk0Hv

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
-- Name: accounts_balance_backup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts_balance_backup (
    id text,
    code character varying(10),
    name text,
    balance numeric,
    initial_balance numeric,
    branch_id uuid,
    created_at timestamp with time zone
);


--
-- PostgreSQL database dump complete
--

\unrestrict 5ij92JqxWGiC3vcrEORfji2LiDJyGlKHv3foeGhwuE5aVBofMEfS3rlcoSqk0Hv

