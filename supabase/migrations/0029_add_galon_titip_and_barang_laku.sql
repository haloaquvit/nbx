-- Add jumlah_galon_titip column to customers table
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS jumlah_galon_titip INTEGER DEFAULT 0;

-- Add barang_laku column to retasi table  
ALTER TABLE retasi 
ADD COLUMN IF NOT EXISTS barang_laku INTEGER DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN customers.jumlah_galon_titip IS 'Jumlah galon yang dititip di pelanggan';
COMMENT ON COLUMN retasi.barang_laku IS 'Jumlah barang yang laku terjual dari retasi';