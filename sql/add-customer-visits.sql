-- ============================================================================
-- Tabel customer_visits untuk mencatat kunjungan sales
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL,
    visited_by UUID NOT NULL,
    visited_by_name TEXT,
    visit_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    purpose TEXT NOT NULL,
    notes TEXT,
    follow_up_date DATE,
    branch_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

    CONSTRAINT customer_visits_customer_id_fkey
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT customer_visits_branch_id_fkey
        FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_customer_visits_customer_id ON customer_visits(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_visits_visited_by ON customer_visits(visited_by);
CREATE INDEX IF NOT EXISTS idx_customer_visits_visit_date ON customer_visits(visit_date);
CREATE INDEX IF NOT EXISTS idx_customer_visits_branch_id ON customer_visits(branch_id);
CREATE INDEX IF NOT EXISTS idx_customer_visits_follow_up ON customer_visits(follow_up_date) WHERE follow_up_date IS NOT NULL;

-- RLS Policy
ALTER TABLE customer_visits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_visits_allow_all ON customer_visits;
CREATE POLICY customer_visits_allow_all ON customer_visits
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- Tabel quotations untuk penawaran harga
-- ============================================================================

CREATE TABLE IF NOT EXISTS quotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_number TEXT NOT NULL UNIQUE,
    customer_id UUID NOT NULL,
    customer_name TEXT NOT NULL,
    customer_address TEXT,
    customer_phone TEXT,
    quotation_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    valid_until DATE,
    status TEXT NOT NULL DEFAULT 'draft',
    subtotal NUMERIC NOT NULL DEFAULT 0,
    discount_amount NUMERIC DEFAULT 0,
    tax_amount NUMERIC DEFAULT 0,
    total NUMERIC NOT NULL DEFAULT 0,
    notes TEXT,
    terms TEXT,
    created_by UUID,
    created_by_name TEXT,
    converted_to_invoice_id UUID,
    converted_at TIMESTAMP WITH TIME ZONE,
    branch_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

    CONSTRAINT quotations_status_check
        CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted')),
    CONSTRAINT quotations_customer_id_fkey
        FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT quotations_branch_id_fkey
        FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_quotations_customer_id ON quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotations_date ON quotations(quotation_date);
CREATE INDEX IF NOT EXISTS idx_quotations_branch_id ON quotations(branch_id);
CREATE INDEX IF NOT EXISTS idx_quotations_number ON quotations(quotation_number);

-- RLS Policy
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quotations_allow_all ON quotations;
CREATE POLICY quotations_allow_all ON quotations
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- Tabel quotation_items untuk item penawaran
-- ============================================================================

CREATE TABLE IF NOT EXISTS quotation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_id UUID NOT NULL,
    product_id UUID,
    product_name TEXT NOT NULL,
    product_type TEXT,
    quantity NUMERIC NOT NULL DEFAULT 1,
    unit TEXT DEFAULT 'pcs',
    unit_price NUMERIC NOT NULL DEFAULT 0,
    discount_percent NUMERIC DEFAULT 0,
    discount_amount NUMERIC DEFAULT 0,
    subtotal NUMERIC NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

    CONSTRAINT quotation_items_quotation_id_fkey
        FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation_id ON quotation_items(quotation_id);
CREATE INDEX IF NOT EXISTS idx_quotation_items_product_id ON quotation_items(product_id);

-- RLS Policy
ALTER TABLE quotation_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quotation_items_allow_all ON quotation_items;
CREATE POLICY quotation_items_allow_all ON quotation_items
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- Function untuk auto-update updated_at pada quotations
-- ============================================================================

CREATE OR REPLACE FUNCTION update_quotations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_quotations_updated_at ON quotations;
CREATE TRIGGER trigger_quotations_updated_at
    BEFORE UPDATE ON quotations
    FOR EACH ROW
    EXECUTE FUNCTION update_quotations_updated_at();
