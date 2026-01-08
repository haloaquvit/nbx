--
-- PostgreSQL database dump
--

\restrict uPWJiawdG0GnjBoGu1on22z5NSldHdYunpAbLM39rZdl8m29O6t982fBRZEVrwV

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
-- Name: payroll_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid,
    period_start date NOT NULL,
    period_end date NOT NULL,
    base_salary numeric(15,2) DEFAULT 0,
    total_commission numeric(15,2) DEFAULT 0,
    total_bonus numeric(15,2) DEFAULT 0,
    total_deductions numeric(15,2) DEFAULT 0,
    advance_deduction numeric(15,2) DEFAULT 0,
    net_salary numeric(15,2) DEFAULT 0,
    status text DEFAULT 'draft'::text,
    paid_date date,
    payment_method text,
    notes text,
    branch_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    salary_deduction numeric(15,2) DEFAULT 0
);


--
-- Name: COLUMN payroll_records.salary_deduction; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payroll_records.salary_deduction IS 'Potongan gaji untuk keterlambatan, absensi, atau potongan lainnya (terpisah dari potong panjar)';


--
-- Name: payroll_records payroll_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_records
    ADD CONSTRAINT payroll_records_pkey PRIMARY KEY (id);


--
-- Name: payroll_records payroll_records_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_records
    ADD CONSTRAINT payroll_records_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: payroll_records payroll_records_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_records
    ADD CONSTRAINT payroll_records_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: payroll_records payroll_records_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_records
    ADD CONSTRAINT payroll_records_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.profiles(id);


--
-- Name: payroll_records payroll_records_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_records_allow_all ON public.payroll_records TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict uPWJiawdG0GnjBoGu1on22z5NSldHdYunpAbLM39rZdl8m29O6t982fBRZEVrwV

