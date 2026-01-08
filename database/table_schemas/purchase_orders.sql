--
-- PostgreSQL database dump
--

\restrict Fd5Jv2rodUfjZr7LdxHDZQnAYv3EewQefuoZXcd9RGwka0fvJQ80s44crFqX7PP

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
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_orders (
    id text NOT NULL,
    material_id uuid,
    material_name text,
    quantity numeric,
    unit text,
    requested_by text,
    status text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    total_cost numeric,
    payment_account_id text,
    payment_date timestamp with time zone,
    unit_price numeric(10,2),
    supplier_name text,
    supplier_contact text,
    expected_delivery_date timestamp with time zone,
    supplier_id uuid,
    quoted_price numeric,
    expedition character varying(100),
    received_date timestamp with time zone,
    delivery_note_photo text,
    received_by text,
    received_quantity numeric,
    expedition_receiver text,
    branch_id uuid,
    po_number text,
    order_date date DEFAULT CURRENT_DATE,
    approved_at timestamp with time zone,
    approved_by text,
    include_ppn boolean DEFAULT false,
    ppn_amount numeric(15,2) DEFAULT 0,
    subtotal numeric(15,2) DEFAULT NULL::numeric,
    ppn_mode text DEFAULT 'exclude'::text
);


--
-- Name: COLUMN purchase_orders.subtotal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.purchase_orders.subtotal IS 'Subtotal sebelum PPN (DPP - Dasar Pengenaan Pajak)';


--
-- Name: COLUMN purchase_orders.ppn_mode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.purchase_orders.ppn_mode IS 'Mode PPN: include = harga sudah termasuk PPN, exclude = PPN ditambahkan di atas subtotal';


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: idx_purchase_orders_expected_delivery_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_expected_delivery_date ON public.purchase_orders USING btree (expected_delivery_date);


--
-- Name: idx_purchase_orders_expedition; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_expedition ON public.purchase_orders USING btree (expedition);


--
-- Name: idx_purchase_orders_supplier_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_supplier_name ON public.purchase_orders USING btree (supplier_name);


--
-- Name: purchase_orders purchase_orders_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);


--
-- Name: purchase_orders purchase_orders_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id);


--
-- Name: purchase_orders purchase_orders_payment_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_payment_account_id_fkey FOREIGN KEY (payment_account_id) REFERENCES public.accounts(id);


--
-- Name: purchase_orders purchase_orders_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: purchase_orders purchase_orders_allow_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_orders_allow_all ON public.purchase_orders TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict Fd5Jv2rodUfjZr7LdxHDZQnAYv3EewQefuoZXcd9RGwka0fvJQ80s44crFqX7PP

