-- Create accounts payable table
CREATE TABLE IF NOT EXISTS public.accounts_payable (
    id text PRIMARY KEY,
    purchase_order_id text,
    supplier_name text NOT NULL,
    amount numeric NOT NULL,
    due_date timestamptz,
    description text NOT NULL,
    status text NOT NULL DEFAULT 'Outstanding' CHECK (status IN ('Outstanding', 'Paid', 'Partial')),
    created_at timestamptz DEFAULT now(),
    paid_at timestamptz,
    paid_amount numeric DEFAULT 0,
    payment_account_id text,
    notes text
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_accounts_payable_po_id ON public.accounts_payable(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_status ON public.accounts_payable(status);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_created_at ON public.accounts_payable(created_at);

-- Enable RLS
ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;

-- Create policy
DROP POLICY IF EXISTS "Authenticated users can manage accounts payable" ON public.accounts_payable;
CREATE POLICY "Authenticated users can manage accounts payable"
ON public.accounts_payable FOR ALL
USING (auth.role() = 'authenticated');