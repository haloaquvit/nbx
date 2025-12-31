# REVISI KEUANGAN AQUVIT ERP

Dokumen ini berisi rencana pengembangan sistem akuntansi AQUVIT ERP berdasarkan audit yang dilakukan pada 31 Desember 2025.

---

## RINGKASAN VALIDASI PRINSIP AKUNTANSI

| Kategori | Status | Catatan |
|----------|--------|---------|
| **Sales Journal** | ✅ OK | Double-entry benar, FIFO HPP |
| **Receivable Payment** | ⚠️ PARTIAL | Missing reversal untuk koreksi pembayaran |
| **Purchase Journal** | ✅ OK | Material & Product terpisah, PPN Masukan benar |
| **Payroll Journal** | ⚠️ PARTIAL | Bug potensial di gross_salary fallback |
| **Production Journal** | ✅ OK | FIFO consumption benar, bahan rusak terpisah |
| **Delivery Journal** | ✅ OK | Konversi liability ke COGS benar |
| **FIFO HPP** | ✅ OK | Perlu validasi update inventory batch |
| **Chart of Accounts** | ✅ OK | Sesuai standar Indonesia |
| **Void & Reversal** | ✅ OK | Cascade delete komprehensif |

**Rating Keseluruhan: 7.5/10**

---

## DAFTAR REVISI PRIORITAS

| No | Item | Prioritas | Status | Target |
|----|------|-----------|--------|--------|
| 1 | Implementasi Jurnal Penutup | TINGGI | 🔴 Belum | - |
| 2 | Adjustment Data Historis | TINGGI | 🔴 Belum | - |
| 3 | Bunga Menurun (Efektif) | SEDANG | 🔴 Belum | - |
| 4 | Rekonsiliasi PPN | SEDANG | 🔴 Belum | - |
| 5 | Perbaikan Akun 2140 | RENDAH | 🔴 Belum | - |
| 6 | Audit Trail Lengkap | SEDANG | 🔴 Belum | - |

---

## DETAIL RENCANA IMPLEMENTASI

### 1. IMPLEMENTASI JURNAL PENUTUP (PRIORITAS TINGGI)

**Masalah:**
- Tidak ada fitur tutup buku tahunan
- Laba Tahun Berjalan (3300) terus terakumulasi tanpa pernah ditutup ke Laba Ditahan (3200)

**Rencana Implementasi:**

```
A. Tambah fitur di Web Management (owner only)
   - Tab baru: "Tutup Buku Tahunan"
   - Input: Tahun yang akan ditutup
   - Validasi: Cek apakah tahun tersebut sudah pernah ditutup

B. Jurnal yang akan di-generate:

   1. Tutup Pendapatan ke Ikhtisar Laba Rugi:
      Dr. Pendapatan Usaha (4100)           xxx
      Dr. Pendapatan Lain-lain (4200)       xxx
        Cr. Ikhtisar Laba Rugi (3300)           xxx

   2. Tutup Beban ke Ikhtisar Laba Rugi:
      Dr. Ikhtisar Laba Rugi (3300)         xxx
        Cr. HPP (5100)                          xxx
        Cr. HPP Bonus (5210)                    xxx
        Cr. Beban Gaji (6100)                   xxx
        Cr. Beban Operasional (6xxx)            xxx

   3. Tutup Ikhtisar ke Laba Ditahan:
      - Jika LABA:
        Dr. Ikhtisar Laba Rugi (3300)       xxx
          Cr. Laba Ditahan (3200)               xxx

      - Jika RUGI:
        Dr. Laba Ditahan (3200)             xxx
          Cr. Ikhtisar Laba Rugi (3300)         xxx

C. File yang perlu dibuat:
   - src/services/closingEntryService.ts (NEW)
   - src/hooks/useClosingEntry.ts (NEW)

D. File yang perlu dimodifikasi:
   - src/pages/WebManagementPage.tsx (tambah tab Tutup Buku)
   - src/utils/chartOfAccountsUtils.ts (pastikan akun 3200, 3300 ada)

E. Database:
   - Buat tabel closing_periods untuk tracking tahun yang sudah ditutup:
     CREATE TABLE closing_periods (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       year INTEGER NOT NULL UNIQUE,
       closed_at TIMESTAMPTZ NOT NULL,
       closed_by UUID REFERENCES profiles(id),
       journal_entry_id UUID REFERENCES journal_entries(id),
       net_income NUMERIC NOT NULL,
       branch_id UUID REFERENCES branches(id),
       created_at TIMESTAMPTZ DEFAULT NOW()
     );
```

---

### 2. ADJUSTMENT DATA HISTORIS (PRIORITAS TINGGI)

**Masalah:**
- Transaksi lama (sebelum implementasi baru) tidak memiliki jurnal Hutang Barang Dagang (2140) yang benar
- Gap antara saldo akun 2140 dengan HPP barang yang belum diantar

**Rencana Implementasi:**

```
A. Query Diagnosa (sudah ada di sql/fix-hutang-barang-dagang.sql):

   -- Cek total HPP barang yang belum diantar
   WITH undelivered_hpp AS (
     SELECT SUM(
       CASE WHEN (item->>'quantity')::numeric > 0
       THEN (
         ((item->>'quantity')::numeric - delivered_qty) *
         ((item->>'hpp')::numeric / (item->>'quantity')::numeric)
       ) ELSE 0 END
     ) AS total_undelivered_hpp
     FROM transactions t, jsonb_array_elements(t.items) AS item
     WHERE t.is_office_sale = false
       AND t.status NOT IN ('Dibatalkan', 'Cancelled')
   )
   SELECT total_undelivered_hpp AS "HPP Seharusnya" FROM undelivered_hpp;

   -- Cek saldo akun 2140 saat ini
   SELECT SUM(credit_amount - debit_amount) AS saldo_2140
   FROM journal_entry_lines jel
   JOIN journal_entries je ON je.id = jel.journal_entry_id
   WHERE jel.account_code = '2140'
     AND je.status = 'posted'
     AND je.is_voided = false;

B. Hitung Selisih:
   - Selisih = HPP Seharusnya - Saldo 2140 Saat Ini

C. Buat Jurnal Adjustment:

   -- Jika saldo 2140 KURANG dari seharusnya:
   Dr. HPP (5100)                         xxx (selisih)
     Cr. Modal Barang Dagang Tertahan (2140)   xxx

   -- Jika saldo 2140 LEBIH dari seharusnya:
   Dr. Modal Barang Dagang Tertahan (2140) xxx (selisih)
     Cr. HPP (5100)                            xxx

D. Implementasi di Aplikasi:
   - Tambah menu "Adjustment Data Historis" di Web Management
   - Tampilkan hasil diagnosa
   - Tombol "Generate Jurnal Adjustment"
   - Log adjustment yang sudah dilakukan
```

---

### 3. BUNGA MENURUN/EFEKTIF (PRIORITAS SEDANG)

**Masalah:**
- Semua tipe bunga dihitung sebagai bunga flat
- Pinjaman bank biasanya menggunakan bunga efektif (menurun)

**Rencana Implementasi:**

```
A. Modifikasi src/services/debtInstallmentService.ts:

   function calculateInstallments(input: GenerateInstallmentInput) {
     // ... existing code ...

     // TAMBAHAN: Bunga Efektif/Menurun
     if (interestType === 'effective' || interestType === 'decreasing') {
       let remainingPrincipal = principal;
       const monthlyRate = interestRate / 12 / 100;

       for (let i = 1; i <= tenorMonths; i++) {
         // Bunga dihitung dari sisa pokok
         const interestForMonth = remainingPrincipal * monthlyRate;
         const principalForMonth = monthlyPrincipal;

         installments.push({
           debtId,
           installmentNumber: i,
           dueDate,
           principalAmount: Math.round(principalForMonth),
           interestAmount: Math.round(interestForMonth),
           totalAmount: Math.round(principalForMonth + interestForMonth),
           status: 'pending',
           branchId,
         });

         remainingPrincipal -= principalForMonth;
       }
     }
   }

B. Update src/types/accountsPayable.ts:

   interestType?: 'flat' | 'per_month' | 'per_year' | 'effective';

C. Update UI di src/components/AddDebtDialog.tsx:
   - Tambah opsi "Bunga Efektif/Menurun" di dropdown
   - Tampilkan preview simulasi jadwal cicilan
   - Info tooltip menjelaskan perbedaan tipe bunga
```

---

### 4. REKONSILIASI PPN (PRIORITAS SEDANG)

**Masalah:**
- Tidak ada laporan rekonsiliasi PPN Masukan vs Keluaran
- Sulit mempersiapkan SPT PPN

**Rencana Implementasi:**

```
A. Tambah fungsi di src/utils/financialStatementsUtils.ts:

   export async function generatePPNReconciliation(
     periodFrom: Date,
     periodTo: Date,
     branchId?: string
   ): Promise<PPNReconciliationData> {

     // 1. Ambil PPN Keluaran (dari penjualan) - Akun 2130
     const ppnKeluaran = await supabase
       .from('journal_entry_lines')
       .select('credit_amount, journal_entries!inner(entry_date)')
       .eq('account_code', '2130')
       .gte('journal_entries.entry_date', periodFrom)
       .lte('journal_entries.entry_date', periodTo);

     // 2. Ambil PPN Masukan (dari pembelian) - Akun 1230
     const ppnMasukan = await supabase
       .from('journal_entry_lines')
       .select('debit_amount, journal_entries!inner(entry_date)')
       .eq('account_code', '1230')
       .gte('journal_entries.entry_date', periodFrom)
       .lte('journal_entries.entry_date', periodTo);

     // 3. Hitung selisih
     const totalKeluaran = ppnKeluaran.reduce((sum, l) => sum + l.credit_amount, 0);
     const totalMasukan = ppnMasukan.reduce((sum, l) => sum + l.debit_amount, 0);
     const ppnKurangBayar = totalKeluaran - totalMasukan;

     return {
       ppnKeluaran: totalKeluaran,
       ppnMasukan: totalMasukan,
       ppnKurangBayar: ppnKurangBayar > 0 ? ppnKurangBayar : 0,
       ppnLebihBayar: ppnKurangBayar < 0 ? Math.abs(ppnKurangBayar) : 0,
     };
   }

B. Tambah tab di src/pages/FinancialReportsPage.tsx:

   <TabsContent value="ppn">
     <Card>
       <CardHeader>
         <CardTitle>Rekonsiliasi PPN</CardTitle>
       </CardHeader>
       <CardContent>
         <Table>
           <TableBody>
             <TableRow>
               <TableCell>PPN Keluaran (Penjualan)</TableCell>
               <TableCell>{formatCurrency(ppnData.ppnKeluaran)}</TableCell>
             </TableRow>
             <TableRow>
               <TableCell>PPN Masukan (Pembelian)</TableCell>
               <TableCell>({formatCurrency(ppnData.ppnMasukan)})</TableCell>
             </TableRow>
             <TableRow className="font-bold">
               <TableCell>PPN Kurang/(Lebih) Bayar</TableCell>
               <TableCell>{formatCurrency(ppnData.ppnKurangBayar)}</TableCell>
             </TableRow>
           </TableBody>
         </Table>
       </CardContent>
     </Card>
   </TabsContent>
```

---

### 5. PERBAIKAN AKUN 2140 (PRIORITAS RENDAH)

**Masalah:**
- Nama "Modal Barang Dagang Tertahan" tidak standar akuntansi
- Secara konsep, ini lebih tepat sebagai ASET (barang masih milik perusahaan)

**Opsi Perbaikan:**

```
OPSI A - Rename saja (Minimal Change):
   - Update nama di chartOfAccountsUtils.ts:
     { code: '2140', name: 'Barang dalam Pengiriman', ... }
   - Atau: 'Persediaan dalam Transit'

OPSI B - Pindah ke Aset (Lebih Tepat Secara Akuntansi):

   1. Buat akun baru: 1350 "Persediaan dalam Pengiriman"

   2. Migrasi saldo:
      Dr. Persediaan dalam Pengiriman (1350)  xxx
        Cr. Modal Barang Dagang Tertahan (2140)    xxx

   3. Update journalService.ts:

      // Saat penjualan non-office:
      Dr. Kas/Piutang                           xxx
      Dr. HPP (5100)                            xxx
        Cr. Pendapatan                              xxx
        Cr. Persediaan dalam Pengiriman (1350)      xxx  // bukan 2140

      // Saat delivery:
      Dr. Persediaan dalam Pengiriman (1350)    xxx
        Cr. Persediaan Barang Dagang (1310)         xxx

REKOMENDASI: Opsi B lebih sesuai prinsip akuntansi, tapi Opsi A lebih cepat dan
tidak breaking change.
```

---

### 6. AUDIT TRAIL LENGKAP (PRIORITAS SEDANG)

**Masalah:**
- Tidak ada tracking siapa yang approve/void jurnal
- Sulit untuk audit dan compliance

**Rencana Implementasi:**

```
A. Tambah kolom di tabel journal_entries:

   ALTER TABLE journal_entries ADD COLUMN voided_by UUID REFERENCES profiles(id);
   ALTER TABLE journal_entries ADD COLUMN voided_at TIMESTAMPTZ;
   ALTER TABLE journal_entries ADD COLUMN void_reason TEXT;
   ALTER TABLE journal_entries ADD COLUMN modified_by UUID REFERENCES profiles(id);
   ALTER TABLE journal_entries ADD COLUMN modified_at TIMESTAMPTZ;

B. Update src/services/journalService.ts:

   export async function voidJournalEntry(
     journalId: string,
     userId: string,
     reason: string
   ): Promise<{ success: boolean; error?: string }> {
     const { error } = await supabase
       .from('journal_entries')
       .update({
         is_voided: true,
         status: 'voided',
         voided_by: userId,
         voided_at: new Date().toISOString(),
         void_reason: reason
       })
       .eq('id', journalId);

     return { success: !error, error: error?.message };
   }

C. Buat Audit Log Report:
   - Tampilkan history semua jurnal yang di-approve/void
   - Filter by: tanggal, user, jenis aksi
   - Export ke Excel/PDF

D. UI di src/pages/FinancialReportsPage.tsx:

   <TabsContent value="audit-log">
     <Table>
       <TableHeader>
         <TableRow>
           <TableHead>Tanggal</TableHead>
           <TableHead>No. Jurnal</TableHead>
           <TableHead>Aksi</TableHead>
           <TableHead>User</TableHead>
           <TableHead>Alasan</TableHead>
         </TableRow>
       </TableHeader>
       <TableBody>
         {auditLogs.map(log => (
           <TableRow key={log.id}>
             <TableCell>{format(log.date, 'dd/MM/yyyy HH:mm')}</TableCell>
             <TableCell>{log.entry_number}</TableCell>
             <TableCell>{log.action}</TableCell>
             <TableCell>{log.user_name}</TableCell>
             <TableCell>{log.reason || '-'}</TableCell>
           </TableRow>
         ))}
       </TableBody>
     </Table>
   </TabsContent>
```

---

## BUG FIXES YANG PERLU DILAKUKAN

### Bug 1: Missing Reversal Jurnal untuk Koreksi Pembayaran

**Lokasi:** `src/hooks/useTransactions.ts` line 643-647

**Masalah:**
```typescript
else {
  // Pembayaran berkurang - ini adalah koreksi/refund
  console.log('⚠️ Pembayaran dikurangi sebesar:', Math.abs(paymentDifference));
  // Jurnal koreksi perlu penanganan khusus  <-- TIDAK ADA IMPLEMENTASI
}
```

**Solusi:**
```typescript
else {
  // Pembayaran berkurang - buat jurnal reversal
  const reversalAmount = Math.abs(paymentDifference);

  await createReceivableReversalJournal({
    transactionId,
    amount: reversalAmount,
    reason: 'Koreksi pembayaran',
    branchId,
  });

  // Jurnal:
  // Dr. Piutang Usaha (1210)        xxx
  //   Cr. Kas/Bank                      xxx
}
```

---

### Bug 2: Gross Salary Fallback

**Lokasi:** `src/hooks/usePayroll.ts` line 578

**Masalah:**
```typescript
const grossSalary = payrollRecord.gross_salary || (payrollRecord.net_salary + deductionAmount)
```
Fallback calculation tidak akurat jika ada potongan lain selain advance.

**Solusi:**
Pastikan `gross_salary` selalu terisi saat insert payroll record:
```typescript
// Di createPayrollRecord, pastikan gross_salary dihitung dengan benar:
const grossSalary = baseSalary + commission + bonus + allowances;
const deductions = advanceDeduction + otherDeductions;
const netSalary = grossSalary - deductions;

await supabase.from('payroll_records').insert({
  gross_salary: grossSalary,  // WAJIB ISI
  net_salary: netSalary,
  // ...
});
```

---

## URUTAN IMPLEMENTASI

```
PHASE 1 - KRITIKAL (Segera)
├── [1] Jurnal Penutup
├── [2] Adjustment Data Historis
└── Bug Fix: Missing reversal jurnal

PHASE 2 - PENTING (1-2 Minggu)
├── [4] Rekonsiliasi PPN
├── [6] Audit Trail
└── Bug Fix: Gross salary fallback

PHASE 3 - ENHANCEMENT (Setelah Phase 2)
├── [3] Bunga Efektif
└── [5] Perbaikan Akun 2140
```

---

## CATATAN TEKNIS

### Kredensial Database (untuk development)

| Item | Nabire | Manokwari |
|------|--------|-----------|
| Host | 103.197.190.54 | 103.197.190.54 |
| Port | 5432 | 5432 |
| Database | aquvit_new | mkw_db |
| Username | aquavit | aquavit |
| Password | Aquvit2024 | Aquvit2024 |

### SSH Access

```bash
ssh -i Aquvit.pem deployer@103.197.190.54
```

### PM2 Services

```bash
pm2 list
# postgrest-aquvit    (port 3000 - Nabire)
# postgrest-mkw       (port 3007 - Manokwari)
# auth-server-new     (port 3006 - Nabire)
# auth-server-mkw     (port 3003 - Manokwari)
```

---

## HISTORY REVISI

| Tanggal | Revisi | Oleh |
|---------|--------|------|
| 2025-12-31 | Initial audit dan rencana | Claude AI |

---

*Dokumen ini akan diupdate seiring progress implementasi.*
