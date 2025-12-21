-- Complete COA Structure for Aquvit ERP
-- Based on Indonesian Accounting Standards

-- First, update existing accounts to match the structure
UPDATE accounts SET name = 'BEBAN OPERASIONAL', type = 'BEBAN' WHERE id = 'acc-6000';

-- Delete old duplicate/conflicting accounts first
DELETE FROM accounts WHERE id IN ('acc-6100', 'acc-6200', 'acc-2100');

-- ASET additions
INSERT INTO accounts (id, code, name, type, parent_id, level, is_header, normal_balance, is_active, balance, initial_balance) VALUES
-- Kas dan Setara Kas children
('acc-1113', '1113', 'Bank Lainnya', 'ASET', 'acc-1100', 3, false, 'DEBIT', true, 0, 0),
('acc-1120', '1120', 'Kas Kecil', 'ASET', 'acc-1100', 3, false, 'DEBIT', true, 0, 0),
('acc-1130', '1130', 'BCA Kasmawati', 'ASET', 'acc-1100', 3, false, 'DEBIT', true, 0, 0),
-- Piutang children
('acc-1220', '1220', 'Piutang Karyawan', 'ASET', 'acc-1200', 3, false, 'DEBIT', true, 0, 0),
-- Persediaan
('acc-1300', '1300', 'Persediaan', 'ASET', 'acc-1000', 2, true, 'DEBIT', true, 0, 0),
('acc-1310', '1310', 'Persediaan Bahan Baku', 'ASET', 'acc-1300', 3, false, 'DEBIT', true, 0, 0),
('acc-1320', '1320', 'Persediaan Produk Jadi', 'ASET', 'acc-1300', 3, false, 'DEBIT', true, 0, 0),
-- Aset Tetap
('acc-1400', '1400', 'Aset Tetap', 'ASET', 'acc-1000', 2, true, 'DEBIT', true, 0, 0),
('acc-1410', '1410', 'Peralatan Produksi', 'ASET', 'acc-1400', 3, false, 'DEBIT', true, 0, 0),
('acc-1420', '1420', 'Kendaraan', 'ASET', 'acc-1400', 3, false, 'DEBIT', true, 0, 0),
('acc-1430', '1430', 'Tanah', 'ASET', 'acc-1400', 3, false, 'DEBIT', true, 0, 0),
('acc-1440', '1440', 'Bangunan', 'ASET', 'acc-1400', 3, false, 'DEBIT', true, 0, 0)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id, level = EXCLUDED.level, is_header = EXCLUDED.is_header;

-- KEWAJIBAN additions
INSERT INTO accounts (id, code, name, type, parent_id, level, is_header, normal_balance, is_active, balance, initial_balance) VALUES
('acc-2100', '2100', 'Kewajiban Lancar', 'KEWAJIBAN', 'acc-2000', 2, true, 'CREDIT', true, 0, 0),
('acc-2110', '2110', 'Utang Usaha', 'KEWAJIBAN', 'acc-2100', 3, false, 'CREDIT', true, 0, 0),
('acc-2120', '2120', 'Utang Gaji', 'KEWAJIBAN', 'acc-2100', 3, false, 'CREDIT', true, 0, 0),
('acc-2130', '2130', 'Utang Pajak', 'KEWAJIBAN', 'acc-2100', 3, false, 'CREDIT', true, 0, 0),
('acc-2140', '2140', 'Utang Bank', 'KEWAJIBAN', 'acc-2100', 3, false, 'CREDIT', true, 0, 0)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id, level = EXCLUDED.level, is_header = EXCLUDED.is_header;

-- MODAL additions
INSERT INTO accounts (id, code, name, type, parent_id, level, is_header, normal_balance, is_active, balance, initial_balance) VALUES
('acc-3200', '3200', 'Laba Ditahan', 'MODAL', 'acc-3000', 2, false, 'CREDIT', true, 0, 0),
('acc-3300', '3300', 'Prive', 'MODAL', 'acc-3000', 2, false, 'DEBIT', true, 0, 0)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id, level = EXCLUDED.level;

-- PENDAPATAN additions
INSERT INTO accounts (id, code, name, type, parent_id, level, is_header, normal_balance, is_active, balance, initial_balance) VALUES
('acc-4010', '4010', 'Piutang Pelanggan', 'PENDAPATAN', 'acc-4000', 2, false, 'CREDIT', true, 0, 0),
('acc-4300', '4300', 'Pendapatan Lain-lain', 'PENDAPATAN', 'acc-4000', 2, false, 'CREDIT', true, 0, 0)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id, level = EXCLUDED.level;

-- HPP (Harga Pokok Penjualan)
INSERT INTO accounts (id, code, name, type, parent_id, level, is_header, normal_balance, is_active, balance, initial_balance) VALUES
('acc-5000', '5000', 'HARGA POKOK PENJUALAN', 'BEBAN', NULL, 1, true, 'DEBIT', true, 0, 0),
('acc-5100', '5100', 'HPP Bahan Baku', 'BEBAN', 'acc-5000', 2, false, 'DEBIT', true, 0, 0),
('acc-5200', '5200', 'HPP Tenaga Kerja', 'BEBAN', 'acc-5000', 2, false, 'DEBIT', true, 0, 0),
('acc-5300', '5300', 'HPP Overhead', 'BEBAN', 'acc-5000', 2, false, 'DEBIT', true, 0, 0)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id, level = EXCLUDED.level, is_header = EXCLUDED.is_header;

-- BEBAN OPERASIONAL additions
INSERT INTO accounts (id, code, name, type, parent_id, level, is_header, normal_balance, is_active, balance, initial_balance) VALUES
-- Beban Penjualan (Header)
('acc-6100', '6100', 'Beban Penjualan', 'BEBAN', 'acc-6000', 2, true, 'DEBIT', true, 0, 0),
('acc-6110', '6110', 'Beban Gaji Sales', 'BEBAN', 'acc-6100', 3, false, 'DEBIT', true, 0, 0),
('acc-6120', '6120', 'Beban Transportasi', 'BEBAN', 'acc-6100', 3, false, 'DEBIT', true, 0, 0),
('acc-6130', '6130', 'Komisi Penjualan', 'BEBAN', 'acc-6100', 3, false, 'DEBIT', true, 0, 0),
('acc-6140', '6140', 'Beban Komisi Karyawan', 'BEBAN', 'acc-6100', 3, false, 'DEBIT', true, 0, 0),
('acc-6150', '6150', 'Beban Promosi', 'BEBAN', 'acc-6100', 3, false, 'DEBIT', true, 0, 0),
-- Beban Umum & Administrasi (Header)
('acc-6200', '6200', 'Beban Umum & Administrasi', 'BEBAN', 'acc-6000', 2, true, 'DEBIT', true, 0, 0),
('acc-6210', '6210', 'Beban Gaji Karyawan', 'BEBAN', 'acc-6200', 3, false, 'DEBIT', true, 0, 0),
('acc-6220', '6220', 'Beban Listrik', 'BEBAN', 'acc-6200', 3, false, 'DEBIT', true, 0, 0),
('acc-6230', '6230', 'Beban Telepon', 'BEBAN', 'acc-6200', 3, false, 'DEBIT', true, 0, 0),
('acc-6240', '6240', 'Beban Penyusutan', 'BEBAN', 'acc-6200', 3, false, 'DEBIT', true, 0, 0),
('acc-6250', '6250', 'Beban Bayar Air', 'BEBAN', 'acc-6200', 3, false, 'DEBIT', true, 0, 0),
('acc-6270', '6270', 'Beban Ekspedisi/Shipping', 'BEBAN', 'acc-6200', 3, false, 'DEBIT', true, 0, 0),
('acc-6280', '6280', 'Beli Material Water Treatment', 'BEBAN', 'acc-6200', 3, false, 'DEBIT', true, 0, 0)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id, level = EXCLUDED.level, is_header = EXCLUDED.is_header;

-- Update sort_order based on code for proper ordering
UPDATE accounts SET sort_order = CAST(code AS INTEGER) WHERE code ~ '^[0-9]+$';

-- Mark payment accounts
UPDATE accounts SET is_payment_account = true WHERE code IN ('1110', '1111', '1112', '1113', '1120', '1130');

-- Reload schema
NOTIFY pgrst, 'reload schema';
