-- =====================================================
-- MIGRATION: Create material_payments table
-- Track payments for "Beli" type materials (consumption)
-- =====================================================

-- Create material_payments table
CREATE TABLE IF NOT EXISTS material_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    amount DECIMAL(15,2) NOT NULL,
    payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cash_account_id UUID NOT NULL REFERENCES accounts(id),
    notes TEXT,
    journal_entry_id UUID REFERENCES journal_entries(id),
    created_by UUID NOT NULL,
    created_by_name TEXT NOT NULL,
    branch_id UUID NOT NULL REFERENCES branches(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_material_payments_material_id ON material_payments(material_id);
CREATE INDEX IF NOT EXISTS idx_material_payments_branch_id ON material_payments(branch_id);
CREATE INDEX IF NOT EXISTS idx_material_payments_payment_date ON material_payments(payment_date);

-- Enable RLS
ALTER TABLE material_payments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Enable read access for authenticated users" ON material_payments
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert for authenticated users" ON material_payments
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users" ON material_payments
    FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Enable delete for authenticated users" ON material_payments
    FOR DELETE TO authenticated USING (true);

-- Grant permissions
GRANT ALL ON material_payments TO authenticated;
GRANT ALL ON material_payments TO service_role;
