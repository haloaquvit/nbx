# Dokumentasi Lengkap Sistem RPC (Remote Procedure Call)

## Daftar Isi
1. [Pengantar](#pengantar)
2. [Kategori Fungsi RPC](#kategori-fungsi-rpc)
3. [Fungsi Manajemen Inventori (FIFO)](#fungsi-manajemen-inventori-fifo)
4. [Fungsi Akuntansi & Jurnal](#fungsi-akuntansi--jurnal)
5. [Fungsi Manajemen Akun](#fungsi-manajemen-akun)
6. [Fungsi Hutang & Piutang](#fungsi-hutang--piutang)
7. [Fungsi Aset Tetap](#fungsi-aset-tetap)
8. [Fungsi Penjualan & Transaksi](#fungsi-penjualan--transaksi)
9. [Fungsi Retasi & Pengiriman](#fungsi-retasi--pengiriman)
10. [Fungsi Perpajakan](#fungsi-perpajakan)
11. [Fungsi Utilitas](#fungsi-utilitas)
12. [Catatan Penting](#catatan-penting)

---

## Pengantar

Dokumen ini berisi dokumentasi lengkap untuk semua fungsi RPC (Remote Procedure Call) yang tersedia dalam sistem database Aquvit. Fungsi-fungsi ini dirancang untuk menangani operasi bisnis secara atomik (atomic operations) sehingga menjamin konsistensi data.

### Apa itu RPC di Sistem Ini?

Dalam sistem Aquvit, RPC adalah fungsi-fungsi database (PostgreSQL Functions) yang dipanggil langsung dari aplikasi (Frontend). Kami menggunakan RPC secara ekstensif untuk:

1. **Transaksi Atomik (*Atomic Transactions*)**: Memastikan serangkaian perubahan data (misal: buat sales, potong stok, buat jurnal) terjadi semua atau gagal semua
2. **Logika Bisnis yang Kompleks**: Menjalankan perhitungan rumit (seperti FIFO stok, gaji karyawan, HPP) di server
3. **Keamanan & Bypass RLS**: Mengizinkan user melakukan aksi spesifik tanpa harus memberikan hak akses penuh ke tabel sensitif

### Karakteristik Umum Fungsi RPC:
- **SECURITY DEFINER**: Fungsi berjalan dengan hak akses pembuatnya
- **Atomic Operations**: Semua operasi dalam satu transaksi
- **Branch Isolation**: Setiap operasi terisolasi per cabang (branch_id)
- **Error Handling**: Mengembalikan `success`, `error_message` untuk penanganan error

---

## Kategori Fungsi RPC

| Kategori | Jumlah Fungsi | Deskripsi |
|----------|---------------|-----------|
| Inventori FIFO | 4 | Manajemen stok dengan metode FIFO |
| Akuntansi & Jurnal | 5 | Pembuatan jurnal dan entri akuntansi |
| Manajemen Akun | 3 | Pembuatan dan pembaruan akun |
| Hutang & Piutang | 2 | Manajemen AP (Accounts Payable) |
| Aset Tetap | 1 | Manajemen aset tetap |
| Penjualan | 1 | Jurnal penjualan |
| Retasi | 1 | Manajemen pengiriman barang |
| Perpajakan | 1 | Pembayaran PPN |

---

## Fungsi Manajemen Inventori (FIFO)

### 1. `consume_fifo`

**Deskripsi**: Mengkonsumsi stok produk menggunakan metode FIFO (First In, First Out). Batch terlama akan dikonsumsi terlebih dahulu.

**Parameter**:
| Parameter | Tipe | Wajib | Deskripsi |
|-----------|------|-------|-----------|
| `p_product_id` | UUID | Ya | ID produk yang akan dikonsumsi |
| `p_branch_id` | UUID | Ya | ID cabang (WAJIB untuk isolasi cabang) |
| `p_quantity` | NUMERIC | Ya | Jumlah yang dikonsumsi |
| `p_reference_id` | TEXT | Tidak | ID referensi (misal: ID penjualan) |

**Return**:
```sql
TABLE (
    success BOOLEAN,
    total_hpp NUMERIC,           -- Total HPP (Harga Pokok Penjualan)
    batches_consumed JSONB,      -- Detail batch yang dikonsumsi
    error_message TEXT
)
```

**Fitur Khusus**:
- Mendukung **stok negatif**: Jika stok tidak mencukupi, sistem akan membuat batch negatif sebagai fallback
- Mencatat movement di `product_stock_movements`
- Menghitung HPP otomatis dari unit_cost setiap batch

**Contoh Penggunaan**:
```sql
SELECT * FROM consume_fifo(
    'uuid-produk',
    'uuid-cabang',
    10,
    'TRX-001'
);
```

**Alur Kerja**:
1. Validasi branch_id dan product_id (WAJIB)
2. Validasi quantity > 0
3. Cek ketersediaan stok di branch tersebut
4. Loop batch dari terlama (ORDER BY batch_date ASC, created_at ASC)
5. Kurangi remaining_quantity dari setiap batch
6. Jika stok tidak cukup, buat batch negatif (fallback)
7. Catat di product_stock_movements
8. Return total HPP dan detail batch

---

### 2. `consume_material_fifo`

**Deskripsi**: Mengkonsumsi stok bahan baku (material) menggunakan metode FIFO. Digunakan untuk proses produksi.

**Parameter**:
| Parameter | Tipe | Wajib | Deskripsi |
|-----------|------|-------|-----------|
| `p_material_id` | UUID | Ya | ID material yang dikonsumsi |
| `p_branch_id` | UUID | Ya | ID cabang |
| `p_quantity` | NUMERIC | Ya | Jumlah yang dikonsumsi |
| `p_reference_id` | TEXT | Tidak | ID referensi (misal: ID produksi) |
| `p_reference_type` | TEXT | Tidak | Tipe referensi (default: 'production') |
| `p_notes` | TEXT | Tidak | Catatan tambahan |

**Return**:
```sql
TABLE (
    success BOOLEAN,
    total_cost NUMERIC,          -- Total biaya material
    batches_consumed JSONB,      -- Detail batch yang dikonsumsi
    error_message TEXT
)
```

**Fitur Khusus**:
- Mendukung stok negatif (negative stock fallback)
- Mencatat di `inventory_batch_consumptions` dan `material_stock_movements`
- Mengupdate kolom legacy `materials.stock`
- Reason mapping: production → PRODUCTION_CONSUMPTION, spoilage → PRODUCTION_ERROR

---

### 3. `consume_material_fifo_v2`

**Deskripsi**: Versi kedua dari fungsi konsumsi material FIFO dengan validasi stok yang lebih ketat.

**Perbedaan dengan v1**:
- **TIDAK** mengizinkan stok negatif
- Mengembalikan error jika stok tidak mencukupi
- TIDAK mengupdate `materials.stock` (stok diambil dari view `v_material_current_stock`)

**Parameter**: Sama dengan `consume_material_fifo` + tambahan:
| Parameter | Tipe | Wajib | Deskripsi |
|-----------|------|-------|-----------|
| `p_user_id` | UUID | Tidak | ID user yang melakukan konsumsi |
| `p_user_name` | TEXT | Tidak | Nama user |

**Return**:
```sql
TABLE (
    success BOOLEAN,
    total_cost NUMERIC,
    quantity_consumed NUMERIC,   -- Jumlah yang berhasil dikonsumsi
    batches_consumed JSONB,
    error_message TEXT
)
```

**Contoh Error**:
```
'Insufficient stock: need 100, available 50'
```

---

### 4. `consume_stock_fifo_v2`

**Deskripsi**: Versi kedua konsumsi stok produk dengan validasi ketat.

**Perbedaan dengan `consume_fifo`**:
- TIDAK mengizinkan stok negatif
- Mencatat konsumsi di `inventory_batch_consumptions`
- Mengupdate `products.current_stock`

**Parameter**:
| Parameter | Tipe | Wajib | Deskripsi |
|-----------|------|-------|-----------|
| `p_product_id` | UUID | Ya | ID produk |
| `p_quantity` | NUMERIC | Ya | Jumlah konsumsi |
| `p_reference_id` | TEXT | Ya | ID referensi |
| `p_reference_type` | TEXT | Ya | Tipe referensi |
| `p_branch_id` | UUID | Tidak | ID cabang |

**Return**:
```sql
TABLE (
    success BOOLEAN,
    total_hpp NUMERIC,
    batches_consumed JSONB,
    remaining_to_consume NUMERIC,  -- Sisa yang belum terkonsumsi
    error_message TEXT
)
```

---

## Fungsi Akuntansi & Jurnal

### 5. `create_journal_atomic` (Versi 1)

**Deskripsi**: Membuat jurnal akuntansi secara atomik dengan validasi balance (debit = kredit).

**Parameter**:
| Parameter | Tipe | Wajib | Default | Deskripsi |
|-----------|------|-------|---------|-----------|
| `p_branch_id` | UUID | Ya | - | ID cabang |
| `p_description` | TEXT | Ya | - | Deskripsi jurnal |
| `p_reference_type` | TEXT | Tidak | NULL | Tipe referensi |
| `p_reference_id` | TEXT | Tidak | NULL | ID referensi |
| `p_lines` | JSONB | Ya | '[]' | Baris-baris jurnal |
| `p_entry_date` | DATE | Tidak | CURRENT_DATE | Tanggal jurnal |
| `p_auto_post` | BOOLEAN | Tidak | TRUE | Auto posting |
| `p_created_by` | UUID | Tidak | NULL | ID pembuat |

**Format `p_lines`**:
```json
[
    {
        "account_id": "uuid-akun-1",
        "debit_amount": 1000000,
        "credit_amount": 0,
        "description": "Debit kas"
    },
    {
        "account_id": "uuid-akun-2",
        "debit_amount": 0,
        "credit_amount": 1000000,
        "description": "Kredit pendapatan"
    }
]
```

**Return**:
```sql
TABLE (
    success BOOLEAN,
    journal_id UUID,
    entry_number TEXT,       -- Format: JE-YYYYMMDD-XXXX
    error_message TEXT
)
```

**Validasi yang Dilakukan**:
1. Branch ID wajib diisi
2. Minimal 2 baris jurnal (double-entry)
3. Total debit HARUS sama dengan total kredit
4. Semua akun harus ada di branch yang sama dan aktif
5. Cek apakah periode sudah ditutup (closing entries)
6. Total debit/kredit tidak boleh 0

---

### 6. `create_journal_atomic` (Versi 2 - dengan entry_date sebagai parameter kedua)

**Deskripsi**: Overload fungsi dengan urutan parameter berbeda untuk kemudahan penggunaan.

**Parameter**:
| Parameter | Tipe | Wajib | Deskripsi |
|-----------|------|-------|-----------|
| `p_branch_id` | UUID | Ya | ID cabang |
| `p_entry_date` | DATE | Ya | Tanggal jurnal |
| `p_description` | TEXT | Ya | Deskripsi |
| `p_reference_type` | TEXT | Tidak | Tipe referensi |
| `p_reference_id` | TEXT | Tidak | ID referensi |
| `p_lines` | JSONB | Ya | Baris jurnal |
| `p_auto_post` | BOOLEAN | Tidak | Auto posting |

---

### 7. `create_all_opening_balance_journal_rpc`

**Deskripsi**: Membuat jurnal saldo awal untuk SEMUA akun yang memiliki `initial_balance` > 0 dalam satu jurnal.

**Parameter**:
| Parameter | Tipe | Wajib | Default | Deskripsi |
|-----------|------|-------|---------|-----------|
| `p_branch_id` | UUID | Ya | - | ID cabang |
| `p_opening_date` | DATE | Tidak | CURRENT_DATE | Tanggal saldo awal |

**Return**:
```sql
TABLE (
    success BOOLEAN,
    journal_id UUID,
    accounts_processed INTEGER,  -- Jumlah akun yang diproses
    total_debit NUMERIC,
    error_message TEXT
)
```

**Logika Penentuan Debit/Kredit**:
| Tipe Akun | Normal Balance | Posisi di Jurnal |
|-----------|----------------|------------------|
| Aset | DEBIT | Dr. |
| Beban | DEBIT | Dr. |
| Kewajiban | KREDIT | Cr. |
| Ekuitas | KREDIT | Cr. |
| Pendapatan | KREDIT | Cr. |

**Akun Penyeimbang**:
- Selisih debit-kredit dimasukkan ke akun **Laba Ditahan (3200)**
- Fallback ke **Modal Disetor (3100)** jika 3200 tidak ada

**Pengecualian**:
- Akun 1310 (Persediaan Barang) dan 1320 (Persediaan Bahan) di-exclude (ditangani terpisah)

---

### 8. `create_inventory_opening_balance_journal_rpc`

**Deskripsi**: Membuat jurnal saldo awal khusus untuk persediaan (produk dan material).

**Parameter**:
| Parameter | Tipe | Wajib | Default | Deskripsi |
|-----------|------|-------|---------|-----------|
| `p_branch_id` | UUID | Ya | - | ID cabang |
| `p_products_value` | NUMERIC | Tidak | 0 | Nilai persediaan barang dagang |
| `p_materials_value` | NUMERIC | Tidak | 0 | Nilai persediaan bahan baku |
| `p_opening_date` | DATE | Tidak | CURRENT_DATE | Tanggal |

**Return**:
```sql
TABLE (
    success BOOLEAN,
    journal_id UUID,
    error_message TEXT
)
```

**Jurnal yang Dibuat**:
```
Dr. Persediaan Barang Dagang (1310)  Rp xxx
Dr. Persediaan Bahan Baku (1320)     Rp xxx
    Cr. Laba Ditahan (3200)              Rp xxx (total)
```

---

## Fungsi Manajemen Akun

### 9. `create_account`

**Deskripsi**: Membuat akun baru di Chart of Accounts dengan validasi kode unik per cabang.

**Parameter**:
| Parameter | Tipe | Wajib | Default | Deskripsi |
|-----------|------|-------|---------|-----------|
| `p_branch_id` | TEXT | Ya | - | ID cabang |
| `p_name` | TEXT | Ya | - | Nama akun |
| `p_code` | TEXT | Ya | - | Kode akun (unik per branch) |
| `p_type` | TEXT | Ya | - | Tipe: Aset, Kewajiban, Ekuitas, Pendapatan, Beban |
| `p_initial_balance` | NUMERIC | Tidak | 0 | Saldo awal |
| `p_is_payment_account` | BOOLEAN | Tidak | FALSE | Akun pembayaran (kas/bank) |
| `p_parent_id` | TEXT | Tidak | NULL | ID akun induk |
| `p_level` | INTEGER | Tidak | 1 | Level hierarki |
| `p_is_header` | BOOLEAN | Tidak | FALSE | Akun header (tidak untuk transaksi) |
| `p_sort_order` | INTEGER | Tidak | 0 | Urutan tampilan |
| `p_employee_id` | TEXT | Tidak | NULL | ID karyawan (untuk piutang karyawan) |

**Return**:
```sql
TABLE (
    success BOOLEAN,
    account_id TEXT,
    error_message TEXT
)
```

**Alur Kerja**:
1. Validasi branch_id (wajib)
2. Cek kode tidak duplikat dalam branch
3. Generate UUID untuk akun baru
4. Insert ke tabel accounts dengan balance = 0
5. Jika initial_balance > 0, panggil `update_account_initial_balance_atomic`
6. Trigger database akan mengupdate balance dari jurnal

---

### 10. `update_account_initial_balance_atomic`

**Deskripsi**: Mengupdate saldo awal akun dan membuat jurnal penyesuaian.

**Parameter**:
| Parameter | Tipe | Wajib | Deskripsi |
|-----------|------|-------|-----------|
| `p_account_id` | TEXT | Ya | ID akun |
| `p_initial_balance` | NUMERIC | Ya | Saldo awal baru |
| `p_branch_id` | UUID | Ya | ID cabang |

**Logika**:
1. Update `accounts.initial_balance`
2. Buat jurnal saldo awal dengan akun lawan **Laba Ditahan**
3. Trigger database akan mengupdate `accounts.balance`

---

## Fungsi Hutang & Piutang

### 11. `create_accounts_payable_atomic`

**Deskripsi**: Membuat catatan hutang usaha (Accounts Payable) dengan jurnal otomatis.

**Parameter**:
| Parameter | Tipe | Wajib | Default | Deskripsi |
|-----------|------|-------|---------|-----------|
| `p_branch_id` | UUID | Ya | - | ID cabang |
| `p_supplier_name` | TEXT | Ya | - | Nama supplier |
| `p_amount` | NUMERIC | Ya | - | Jumlah hutang |
| `p_due_date` | DATE | Tidak | NULL | Tanggal jatuh tempo |
| `p_description` | TEXT | Tidak | NULL | Deskripsi |
| `p_creditor_type` | TEXT | Tidak | 'supplier' | Tipe kreditur |
| `p_purchase_order_id` | TEXT | Tidak | NULL | ID Purchase Order |
| `p_skip_journal` | BOOLEAN | Tidak | FALSE | Skip pembuatan jurnal |

**Return**:
```sql
TABLE (
    success BOOLEAN,
    payable_id TEXT,        -- Format: AP-YYYYMMDD-XXXX
    journal_id UUID,
    error_message TEXT
)
```

**Jurnal yang Dibuat** (jika tidak skip):
```
Dr. Pembelian (5110)        Rp xxx
    Cr. Hutang Usaha (2110)     Rp xxx
```

**Validasi**:
- Branch_id wajib
- Amount harus positif
- Tidak boleh duplikat AP untuk PO yang sama
- Jika `p_purchase_order_id` diisi, jurnal otomatis di-skip

---

## Fungsi Aset Tetap

### 12. `create_asset_atomic`

**Deskripsi**: Membuat aset tetap baru dengan jurnal akuisisi otomatis.

**Parameter**:
| Parameter | Tipe | Wajib | Deskripsi |
|-----------|------|-------|-----------|
| `p_asset` | JSONB | Ya | Data aset dalam format JSON |
| `p_branch_id` | UUID | Ya | ID cabang |

**Format `p_asset`**:
```json
{
    "name": "Kendaraan Operasional",
    "code": "AST-001",
    "category": "vehicle",
    "purchase_date": "2024-01-15",
    "purchase_price": 150000000,
    "useful_life_years": 5,
    "salvage_value": 10000000,
    "depreciation_method": "straight_line",
    "source": "cash"
}
```

**Kategori yang Didukung**:
| Kategori | Kode Akun | Nama Pencarian |
|----------|-----------|----------------|
| vehicle | 1410 | kendaraan |
| equipment | 1420 | peralatan, mesin |
| building | 1440 | bangunan, gedung |
| furniture | 1450 | furniture, inventaris |
| computer | 1460 | komputer, laptop |
| other | 1490 | aset lain |

**Sumber Pembelian (source)**:
| Source | Jurnal |
|--------|--------|
| cash | Dr. Aset, Cr. Kas |
| credit | Dr. Aset, Cr. Hutang |
| migration | Tanpa jurnal |

**Return**:
```sql
TABLE (
    success BOOLEAN,
    asset_id UUID,
    journal_id UUID,
    error_message TEXT
)
```

---

## Fungsi Penjualan & Transaksi

### 13. `create_sales_journal_rpc`

**Deskripsi**: Membuat jurnal penjualan lengkap dengan HPP dan PPN.

**Parameter**:
| Parameter | Tipe | Wajib | Default | Deskripsi |
|-----------|------|-------|---------|-----------|
| `p_branch_id` | UUID | Ya | - | ID cabang |
| `p_transaction_id` | TEXT | Ya | - | ID transaksi |
| `p_transaction_date` | DATE | Ya | - | Tanggal transaksi |
| `p_total_amount` | NUMERIC | Ya | - | Total penjualan |
| `p_paid_amount` | NUMERIC | Tidak | 0 | Jumlah yang dibayar |
| `p_customer_name` | TEXT | Tidak | 'Umum' | Nama pelanggan |
| `p_hpp_amount` | NUMERIC | Tidak | 0 | HPP barang reguler |
| `p_hpp_bonus_amount` | NUMERIC | Tidak | 0 | HPP barang bonus/gratis |
| `p_ppn_enabled` | BOOLEAN | Tidak | FALSE | PPN aktif |
| `p_ppn_amount` | NUMERIC | Tidak | 0 | Jumlah PPN |
| `p_subtotal` | NUMERIC | Tidak | 0 | Subtotal sebelum PPN |
| `p_is_office_sale` | BOOLEAN | Tidak | FALSE | Penjualan dari kantor |
| `p_payment_account_id` | UUID | Tidak | NULL | Akun pembayaran khusus |

**Return**:
```sql
TABLE (
    success BOOLEAN,
    journal_id UUID,
    entry_number TEXT,
    error_message TEXT
)
```

**Akun yang Digunakan**:
| Kode | Nama | Fungsi |
|------|------|--------|
| 1110 | Kas | Penerimaan tunai |
| 1210 | Piutang Usaha | Penjualan kredit |
| 4100 | Pendapatan Penjualan | Revenue |
| 5100 | HPP | Harga Pokok Penjualan |
| 5210 | HPP Bonus | HPP untuk barang gratis |
| 1310 | Persediaan | Pengurangan stok (office sale) |
| 2130 | PPN Keluaran | Hutang PPN |
| 2140 | Hutang Barang Dagang | Kewajiban kirim barang |

**Jurnal Penjualan Tunai**:
```
Dr. Kas (1110)                      Rp xxx
    Cr. Pendapatan Penjualan (4100)     Rp xxx
    Cr. PPN Keluaran (2130)             Rp xxx (jika PPN)

Dr. HPP (5100)                      Rp xxx
Dr. HPP Bonus (5210)                Rp xxx (jika ada)
    Cr. Persediaan (1310)               Rp xxx (office sale)
    Cr. Hutang Barang Dagang (2140)     Rp xxx (non-office sale)
```

**Jurnal Penjualan Kredit**:
```
Dr. Piutang Usaha (1210)            Rp xxx
    Cr. Pendapatan Penjualan (4100)     Rp xxx
```

**Jenis Penjualan**:
- **Tunai**: paid_amount >= total_amount
- **Kredit**: paid_amount = 0
- **Sebagian**: 0 < paid_amount < total_amount

---

## Fungsi Retasi & Pengiriman

### 14. `create_retasi_atomic`

**Deskripsi**: Membuat surat jalan (retasi) untuk pengiriman barang.

**Parameter**:
| Parameter | Tipe | Wajib | Default | Deskripsi |
|-----------|------|-------|---------|-----------|
| `p_branch_id` | UUID | Ya | - | ID cabang |
| `p_driver_name` | TEXT | Ya | - | Nama supir |
| `p_helper_name` | TEXT | Tidak | NULL | Nama kenek |
| `p_truck_number` | TEXT | Tidak | NULL | Nomor kendaraan |
| `p_route` | TEXT | Tidak | NULL | Rute pengiriman |
| `p_departure_date` | DATE | Tidak | CURRENT_DATE | Tanggal berangkat |
| `p_departure_time` | TEXT | Tidak | NULL | Jam berangkat (format: HH:MM) |
| `p_notes` | TEXT | Tidak | NULL | Catatan |
| `p_items` | JSONB | Tidak | '[]' | Item-item yang dikirim |
| `p_created_by` | UUID | Tidak | NULL | ID pembuat |

**Format `p_items`**:
```json
[
    {
        "product_id": "uuid-produk",
        "product_name": "Produk A",
        "quantity": 100,
        "weight": 50.5,
        "notes": "Catatan item"
    }
]
```

**Return**:
```sql
TABLE (
    success BOOLEAN,
    retasi_id UUID,
    retasi_number TEXT,     -- Format: RET-YYYYMMDD-HHMMSS
    retasi_ke INTEGER,      -- Retasi ke-n untuk supir di hari itu
    error_message TEXT
)
```

**Validasi**:
- Supir tidak boleh memiliki retasi aktif yang belum dikembalikan (`is_returned = FALSE`)

**Contoh Error**:
```
'Supir John Doe masih memiliki retasi yang belum dikembalikan'
```

---

## Fungsi Perpajakan

### 15. `create_tax_payment_atomic`

**Deskripsi**: Membuat jurnal pembayaran PPN dengan offset PPN Masukan dan Keluaran.

**Parameter**:
| Parameter | Tipe | Wajib | Default | Deskripsi |
|-----------|------|-------|---------|-----------|
| `p_branch_id` | UUID | Ya | - | ID cabang |
| `p_period` | TEXT | Ya | - | Periode pajak (format: YYYY-MM) |
| `p_ppn_masukan_used` | NUMERIC | Ya | - | PPN Masukan yang digunakan |
| `p_ppn_keluaran_paid` | NUMERIC | Ya | - | PPN Keluaran yang dibayar |
| `p_payment_account_id` | TEXT | Ya | - | Akun pembayaran (kas/bank) |
| `p_notes` | TEXT | Tidak | NULL | Catatan |

**Return**:
```sql
TABLE (
    success BOOLEAN,
    journal_id UUID,
    net_payment NUMERIC,    -- Selisih yang harus dibayar
    error_message TEXT
)
```

**Logika Net Payment**:
```
Net Payment = PPN Keluaran - PPN Masukan
```

| Kondisi | Aksi |
|---------|------|
| Net > 0 | Bayar ke negara (Cr. Kas) |
| Net < 0 | Lebih bayar / kredit pajak (Dr. Kas) |
| Net = 0 | Hanya offset, tanpa pembayaran |

**Jurnal**:
```
Dr. PPN Keluaran (2130)         Rp xxx  -- Menghapus kewajiban
    Cr. PPN Masukan (1230)          Rp xxx  -- Menghapus hak kredit
    Cr. Kas (11xx)                  Rp xxx  -- Pembayaran ke negara
```

**Akun yang Dicari**:
| Kode | Nama |
|------|------|
| 2130 | PPN Keluaran |
| 1230 | PPN Masukan |

---

## Fungsi Utilitas

### 16. `create_expense_atomic`

**Deskripsi**: Membuat catatan pengeluaran/beban dengan jurnal otomatis.

**Parameter**:
| Parameter | Tipe | Wajib | Default | Deskripsi |
|-----------|------|-------|---------|-----------|
| `p_branch_id` | UUID | Ya | - | ID cabang |
| `p_description` | TEXT | Ya | - | Deskripsi pengeluaran |
| `p_amount` | NUMERIC | Ya | - | Jumlah |
| `p_category` | TEXT | Tidak | NULL | Kategori beban |
| `p_date` | TIMESTAMP | Tidak | NOW() | Tanggal |
| `p_expense_account_id` | UUID | Tidak | NULL | Akun beban spesifik |
| `p_cash_account_id` | UUID | Tidak | NULL | Akun kas spesifik |

**Return**:
```sql
TABLE (
    success BOOLEAN,
    expense_id TEXT,        -- Format: exp-timestamp-xxx
    journal_id UUID,
    error_message TEXT
)
```

**Pencarian Akun Beban**:
1. Gunakan `p_expense_account_id` jika disediakan
2. Cari berdasarkan kategori (nama akun LIKE kategori)
3. Fallback ke akun 6200, 6100, atau 6000

**Jurnal**:
```
Dr. Beban xxx (6xxx)        Rp xxx
    Cr. Kas (11xx)              Rp xxx
```

---

## Catatan Penting

### Isolasi Cabang (Branch Isolation)

Semua fungsi RPC memerlukan `branch_id` untuk memastikan:
- Data tidak tercampur antar cabang
- Akun yang digunakan sesuai dengan cabang
- Laporan keuangan per cabang akurat

**Error jika branch_id kosong**:
```
'Branch ID is REQUIRED - tidak boleh lintas cabang!'
```

### Error Handling

Setiap fungsi mengembalikan format standar:
```sql
RETURN QUERY SELECT
    FALSE,              -- success
    NULL::UUID,         -- ID (jika gagal)
    SQLERRM::TEXT;      -- error_message
```

### Trigger Dependencies

Beberapa fungsi bergantung pada trigger database untuk:
- Update balance akun secara otomatis setelah jurnal diposting
- Sinkronisasi stok produk
- Audit trail (pencatatan perubahan)

### Best Practices

1. **Gunakan Transaksi**: Wrap multiple RPC calls dalam satu transaksi
2. **Validasi Input**: Selalu validasi data sebelum memanggil RPC
3. **Handle Error**: Cek field `success` dan `error_message`
4. **Logging**: Log semua operasi untuk audit

### Contoh Penggunaan di Frontend (TypeScript/Supabase)

```typescript
// Contoh memanggil create_journal_atomic
const { data, error } = await supabase.rpc('create_journal_atomic', {
    p_branch_id: branchId,
    p_entry_date: '2024-01-15',
    p_description: 'Penjualan Tunai',
    p_reference_type: 'transaction',
    p_reference_id: 'TRX-001',
    p_lines: [
        { account_id: kasAccountId, debit_amount: 1000000, credit_amount: 0 },
        { account_id: pendapatanAccountId, debit_amount: 0, credit_amount: 1000000 }
    ],
    p_auto_post: true
});

if (data && data[0].success) {
    console.log('Journal created:', data[0].journal_id);
} else {
    console.error('Error:', data?.[0]?.error_message || error?.message);
}
```

---

## Changelog

| Versi | Tanggal | Perubahan |
|-------|---------|-----------|
| 2.0 | 2026-01-09 | Dokumentasi lengkap dengan detail parameter |
| 1.0 | - | Dokumentasi awal |

---

*Dokumentasi ini di-generate dari file backup: `system_vps_backup_20260109.sql`*
