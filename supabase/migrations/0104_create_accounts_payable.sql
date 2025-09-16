-- Create accounts payable table
CREATE TABLE IF NOT EXISTS accounts_payable (
    id text PRIMARY KEY,
    purchase_order_id text REFERENCES purchase_orders(id) ON DELETE CASCADE,
    supplier_name text NOT NULL,
    amount numeric NOT NULL,
    due_date timestamptz,
    description text NOT NULL,
    status text NOT NULL DEFAULT 'Outstanding' CHECK (status IN ('Outstanding', 'Paid', 'Partial')),
    created_at timestamptz DEFAULT now(),
    paid_at timestamptz,
    paid_amount numeric DEFAULT 0,
    payment_account_id text REFERENCES accounts(id),
    notes text
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_accounts_payable_po_id ON accounts_payable(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_status ON accounts_payable(status);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_created_at ON accounts_payable(created_at);