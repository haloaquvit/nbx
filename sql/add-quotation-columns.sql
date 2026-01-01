-- Tambah kolom yang diperlukan ke tabel quotations
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS customer_address TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS quotation_date DATE;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS valid_until DATE;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS subtotal NUMERIC(15,2);
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(15,2);
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(15,2);
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS terms TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS quotation_number TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS notes TEXT;
