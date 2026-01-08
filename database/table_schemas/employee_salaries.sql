--
-- PostgreSQL database dump
--

\restrict JsitO9abOKjkQTtTzVdwXiHyRSnUaCcrJeVehcxxWZa1yHhTX76M4CXFncYwxkA

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
-- Name: employee_salaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_salaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    base_salary numeric(15,2) DEFAULT 0 NOT NULL,
    commission_rate numeric(5,2) DEFAULT 0 NOT NULL,
    payroll_type character varying(20) DEFAULT 'monthly'::character varying NOT NULL,
    commission_type character varying(20) DEFAULT 'none'::character varying NOT NULL,
    effective_from date DEFAULT CURRENT_DATE NOT NULL,
    effective_until date,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    CONSTRAINT valid_base_salary CHECK ((base_salary >= (0)::numeric)),
    CONSTRAINT valid_commission_rate CHECK (((commission_rate >= (0)::numeric) AND (commission_rate <= (100)::numeric))),
    CONSTRAINT valid_commission_type CHECK (((commission_type)::text = ANY (ARRAY[('percentage'::character varying)::text, ('fixed_amount'::character varying)::text, ('none'::character varying)::text]))),
    CONSTRAINT valid_effective_period CHECK (((effective_until IS NULL) OR (effective_until >= effective_from))),
    CONSTRAINT valid_payroll_type CHECK (((payroll_type)::text = ANY (ARRAY[('monthly'::character varying)::text, ('commission_only'::character varying)::text, ('mixed'::character varying)::text])))
);


--
-- Name: employee_salaries employee_salaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_salaries
    ADD CONSTRAINT employee_salaries_pkey PRIMARY KEY (id);


--
-- Name: idx_employee_salaries_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_salaries_active ON public.employee_salaries USING btree (employee_id, is_active) WHERE (is_active = true);


--
-- Name: idx_employee_salaries_effective_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_salaries_effective_period ON public.employee_salaries USING btree (effective_from, effective_until);


--
-- Name: idx_employee_salaries_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_salaries_employee_id ON public.employee_salaries USING btree (employee_id);


--
-- Name: employee_salaries employee_salaries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_salaries
    ADD CONSTRAINT employee_salaries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: employee_salaries employee_salaries_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_salaries
    ADD CONSTRAINT employee_salaries_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: employee_salaries employee_salaries_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employee_salaries_allow_all ON public.employee_salaries TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict JsitO9abOKjkQTtTzVdwXiHyRSnUaCcrJeVehcxxWZa1yHhTX76M4CXFncYwxkA

