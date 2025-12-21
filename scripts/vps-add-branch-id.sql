-- ============================================================================
-- ADD BRANCH_ID TO TABLES THAT NEED IT
-- ============================================================================

-- Get the default branch ID (Kantor Pusat)
DO $$
DECLARE
    default_branch_id UUID;
BEGIN
    SELECT id INTO default_branch_id FROM branches WHERE name = 'Kantor Pusat' LIMIT 1;

    IF default_branch_id IS NULL THEN
        INSERT INTO branches (name, is_main, address, phone)
        VALUES ('Kantor Pusat', true, 'Alamat Kantor Pusat', '-')
        RETURNING id INTO default_branch_id;
    END IF;

    RAISE NOTICE 'Default branch ID: %', default_branch_id;
END $$;

-- Add branch_id to tables that need it
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE cash_history ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE employee_advances ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE production_records ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE retasi ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE commission_entries ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE accounts_payable ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE material_stock_movements ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- Update existing records with default branch
UPDATE accounts SET branch_id = (SELECT id FROM branches WHERE name = 'Kantor Pusat' LIMIT 1) WHERE branch_id IS NULL;
UPDATE transactions SET branch_id = (SELECT id FROM branches WHERE name = 'Kantor Pusat' LIMIT 1) WHERE branch_id IS NULL;
UPDATE customers SET branch_id = (SELECT id FROM branches WHERE name = 'Kantor Pusat' LIMIT 1) WHERE branch_id IS NULL;
UPDATE products SET branch_id = (SELECT id FROM branches WHERE name = 'Kantor Pusat' LIMIT 1) WHERE branch_id IS NULL;
UPDATE materials SET branch_id = (SELECT id FROM branches WHERE name = 'Kantor Pusat' LIMIT 1) WHERE branch_id IS NULL;
UPDATE suppliers SET branch_id = (SELECT id FROM branches WHERE name = 'Kantor Pusat' LIMIT 1) WHERE branch_id IS NULL;
UPDATE expenses SET branch_id = (SELECT id FROM branches WHERE name = 'Kantor Pusat' LIMIT 1) WHERE branch_id IS NULL;
UPDATE cash_history SET branch_id = (SELECT id FROM branches WHERE name = 'Kantor Pusat' LIMIT 1) WHERE branch_id IS NULL;
UPDATE deliveries SET branch_id = (SELECT id FROM branches WHERE name = 'Kantor Pusat' LIMIT 1) WHERE branch_id IS NULL;
UPDATE purchase_orders SET branch_id = (SELECT id FROM branches WHERE name = 'Kantor Pusat' LIMIT 1) WHERE branch_id IS NULL;
UPDATE employee_advances SET branch_id = (SELECT id FROM branches WHERE name = 'Kantor Pusat' LIMIT 1) WHERE branch_id IS NULL;
UPDATE production_records SET branch_id = (SELECT id FROM branches WHERE name = 'Kantor Pusat' LIMIT 1) WHERE branch_id IS NULL;
UPDATE retasi SET branch_id = (SELECT id FROM branches WHERE name = 'Kantor Pusat' LIMIT 1) WHERE branch_id IS NULL;
UPDATE quotations SET branch_id = (SELECT id FROM branches WHERE name = 'Kantor Pusat' LIMIT 1) WHERE branch_id IS NULL;
UPDATE commission_entries SET branch_id = (SELECT id FROM branches WHERE name = 'Kantor Pusat' LIMIT 1) WHERE branch_id IS NULL;
UPDATE accounts_payable SET branch_id = (SELECT id FROM branches WHERE name = 'Kantor Pusat' LIMIT 1) WHERE branch_id IS NULL;
UPDATE material_stock_movements SET branch_id = (SELECT id FROM branches WHERE name = 'Kantor Pusat' LIMIT 1) WHERE branch_id IS NULL;
UPDATE payment_history SET branch_id = (SELECT id FROM branches WHERE name = 'Kantor Pusat' LIMIT 1) WHERE branch_id IS NULL;

-- Fix purchase_orders id column type if needed
DO $$
BEGIN
    -- Check if purchase_orders.id is TEXT and change to UUID
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'purchase_orders'
        AND column_name = 'id'
        AND data_type = 'text'
    ) THEN
        -- Create temporary column
        ALTER TABLE purchase_orders ADD COLUMN id_new UUID;

        -- Try to convert existing IDs
        UPDATE purchase_orders SET id_new = id::UUID WHERE id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
        UPDATE purchase_orders SET id_new = gen_random_uuid() WHERE id_new IS NULL;

        -- Drop old column and rename
        ALTER TABLE purchase_orders DROP COLUMN id;
        ALTER TABLE purchase_orders RENAME COLUMN id_new TO id;
        ALTER TABLE purchase_orders ADD PRIMARY KEY (id);

        RAISE NOTICE 'Converted purchase_orders.id from TEXT to UUID';
    END IF;
END $$;

-- Create purchase_order_items table if it doesn't exist
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
    material_id UUID REFERENCES materials(id),
    product_id UUID REFERENCES products(id),
    item_type TEXT DEFAULT 'material',
    quantity NUMERIC(15,2) DEFAULT 0,
    unit_price NUMERIC(15,2) DEFAULT 0,
    quantity_received NUMERIC(15,2) DEFAULT 0,
    is_taxable BOOLEAN DEFAULT false,
    tax_percentage NUMERIC(5,2) DEFAULT 0,
    tax_amount NUMERIC(15,2) DEFAULT 0,
    subtotal NUMERIC(15,2) DEFAULT 0,
    total_with_tax NUMERIC(15,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Grant permissions
GRANT ALL ON purchase_order_items TO aquavit;
GRANT ALL ON purchase_order_items TO authenticated;
GRANT SELECT ON purchase_order_items TO anon;

SELECT 'Branch ID columns added successfully!' as status;
