-- Add expense account mapping columns to expenses table
ALTER TABLE public.expenses 
ADD COLUMN IF NOT EXISTS expense_account_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS expense_account_name VARCHAR(100);

-- Add reference to accounts table for expense account
ALTER TABLE public.expenses 
ADD CONSTRAINT fk_expenses_expense_account 
FOREIGN KEY (expense_account_id) REFERENCES public.accounts(id);