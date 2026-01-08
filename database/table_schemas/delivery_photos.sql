--
-- PostgreSQL database dump
--

\restrict UFP9yb7E96rhXUE3XdQyjfLtm6QRQcLKZD5W5y55J7s5cmr2iM8eQFdwFaz0Yvx

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
-- Name: delivery_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    delivery_id uuid,
    photo_url text NOT NULL,
    photo_type text DEFAULT 'delivery'::text,
    description text,
    uploaded_at timestamp with time zone DEFAULT now()
);


--
-- Name: delivery_photos delivery_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_photos
    ADD CONSTRAINT delivery_photos_pkey PRIMARY KEY (id);


--
-- Name: delivery_photos delivery_photos_delivery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_photos
    ADD CONSTRAINT delivery_photos_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES public.deliveries(id);


--
-- Name: delivery_photos delivery_photos_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delivery_photos_allow_all ON public.delivery_photos TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict UFP9yb7E96rhXUE3XdQyjfLtm6QRQcLKZD5W5y55J7s5cmr2iM8eQFdwFaz0Yvx

