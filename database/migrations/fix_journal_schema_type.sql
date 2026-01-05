-- Migration: Ubah tipe kolom account_id di tabel journal_entry_lines menjadi TEXT
-- Masalah: Kolom sebelumnya bertipe UUID, sehingga menolak Account ID dengan format TEXT (acc-...)
-- Solusi: Mengubah tipe kolom menjadi TEXT agar kompatibel dengan format ID baru.

ALTER TABLE journal_entry_lines ALTER COLUMN account_id TYPE TEXT;
