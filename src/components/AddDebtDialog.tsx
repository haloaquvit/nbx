import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Plus, Upload, Download, Check, AlertCircle, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useBranch } from '@/contexts/BranchContext';
import { generateSequentialId } from '@/utils/idGenerator';
import { createDebtJournal, createMigrationDebtJournal } from '@/services/journalService';
import { useAuthContext } from '@/contexts/AuthContext';
import { isOwner } from '@/utils/roleUtils';
import { formatCurrency } from '@/lib/utils';
import { formatNumberWithCommas, parseNumberWithCommas } from '@/utils/formatNumber';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

interface AddDebtDialogProps {
  onSuccess?: () => void;
}

interface ImportRow {
  creditorName: string;
  creditorType: 'supplier' | 'bank' | 'credit_card' | 'other';
  amount: number;
  dueDate?: string;
  description?: string;
  notes?: string;
  isValid: boolean;
  error?: string;
}

export function AddDebtDialog({ onSuccess }: AddDebtDialogProps) {
  const { currentBranch } = useBranch();
  const { user } = useAuthContext();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('manual');
  const [isLoading, setIsLoading] = useState(false);

  // Manual input state
  const [formData, setFormData] = useState({
    creditorName: '',
    creditorType: 'other' as 'supplier' | 'bank' | 'credit_card' | 'other',
    amount: '',
    interestRate: '0',
    interestType: 'flat' as 'flat' | 'per_month' | 'per_year' | 'decreasing',
    tenorMonths: '1', // Tenor cicilan dalam bulan
    dueDate: '',
    description: '',
    notes: ''
  });

  // Migration mode - only for owner
  const [isMigration, setIsMigration] = useState(false);

  // Import state
  const [importData, setImportData] = useState<ImportRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setFormData({
      creditorName: '',
      creditorType: 'other',
      amount: '',
      interestRate: '0',
      interestType: 'flat',
      tenorMonths: '1',
      dueDate: '',
      description: '',
      notes: ''
    });
    setIsMigration(false);
    setImportData([]);
    setActiveTab('manual');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const amount = parseNumberWithCommas(formData.amount);
      const interestRate = parseFloat(formData.interestRate);

      if (isNaN(amount) || amount <= 0) {
        toast.error('Jumlah hutang harus lebih dari 0');
        return;
      }

      if (isNaN(interestRate) || interestRate < 0) {
        toast.error('Persentase bunga tidak valid');
        return;
      }

      // Generate unique ID with sequential number
      const id = await generateSequentialId({
        branchName: currentBranch?.name,
        tableName: 'accounts_payable',
        pageCode: isMigration ? 'MIG-AP' : 'HT-AP',
        branchId: currentBranch?.id || null,
      });

      const tenorMonths = parseInt(formData.tenorMonths) || 1;

      // Insert into accounts_payable
      const { error } = await supabase.from('accounts_payable').insert({
        id,
        purchase_order_id: null, // Manual debt entry, not from PO
        supplier_name: formData.creditorName,
        creditor_type: formData.creditorType,
        amount,
        interest_rate: interestRate,
        interest_type: formData.interestType,
        tenor_months: tenorMonths,
        due_date: formData.dueDate || null,
        description: formData.description,
        status: 'Outstanding',
        paid_amount: 0,
        notes: isMigration ? `[MIGRASI] ${formData.notes || ''}` : (formData.notes || null),
        branch_id: currentBranch?.id || null,
      });

      if (error) throw error;

      // Create appropriate journal entry
      if (currentBranch?.id) {
        try {
          let journalResult;

          if (isMigration) {
            // Migration journal: Dr. Saldo Awal, Cr. Hutang (no cash involved)
            journalResult = await createMigrationDebtJournal({
              debtId: id,
              debtDate: new Date(),
              amount,
              creditorName: formData.creditorName,
              creditorType: formData.creditorType,
              description: formData.description,
              branchId: currentBranch.id,
            });
          } else {
            // Normal journal: Dr. Kas, Cr. Hutang (receiving cash)
            journalResult = await createDebtJournal({
              debtId: id,
              debtDate: new Date(),
              amount,
              creditorName: formData.creditorName,
              creditorType: formData.creditorType,
              description: formData.description,
              branchId: currentBranch.id,
            });
          }

          if (journalResult.success) {
            console.log('Jurnal hutang berhasil:', journalResult.journalId);
          } else {
            console.warn('Gagal membuat jurnal hutang:', journalResult.error);
            toast.warning(`Hutang tersimpan, tapi jurnal gagal: ${journalResult.error}`);
          }
        } catch (journalError) {
          console.error('Error creating debt journal:', journalError);
        }
      }

      toast.success(isMigration
        ? `Hutang migrasi ${formatCurrency(amount)} berhasil ditambahkan`
        : 'Hutang berhasil ditambahkan'
      );

      resetForm();
      setOpen(false);
      onSuccess?.();
    } catch (error: any) {
      console.error('Error adding debt:', error);
      toast.error(`Gagal menambahkan hutang: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      const mappedData: ImportRow[] = jsonData.map((row) => {
        const creditorName = row['Nama Kreditor'] || row['Creditor Name'] || row['nama'] || '';
        const creditorTypeRaw = (row['Jenis'] || row['Type'] || row['jenis'] || 'other').toLowerCase();
        const amountRaw = row['Jumlah'] || row['Amount'] || row['jumlah'] || 0;
        const dueDateRaw = row['Jatuh Tempo'] || row['Due Date'] || row['jatuh_tempo'] || '';
        const descriptionRaw = row['Deskripsi'] || row['Description'] || row['deskripsi'] || '';
        const notesRaw = row['Catatan'] || row['Notes'] || row['catatan'] || '';

        const amount = typeof amountRaw === 'string' ? parseNumberWithCommas(amountRaw) : Number(amountRaw);

        let creditorType: 'supplier' | 'bank' | 'credit_card' | 'other' = 'other';
        if (creditorTypeRaw.includes('supplier') || creditorTypeRaw.includes('suplier')) {
          creditorType = 'supplier';
        } else if (creditorTypeRaw.includes('bank')) {
          creditorType = 'bank';
        } else if (creditorTypeRaw.includes('kartu') || creditorTypeRaw.includes('credit')) {
          creditorType = 'credit_card';
        }

        const isValid = !!creditorName && amount > 0;
        const error = !creditorName
          ? 'Nama kreditor kosong'
          : amount <= 0
            ? 'Jumlah tidak valid'
            : undefined;

        return {
          creditorName,
          creditorType,
          amount,
          dueDate: dueDateRaw,
          description: descriptionRaw,
          notes: notesRaw,
          isValid,
          error,
        };
      });

      setImportData(mappedData);
    } catch (error: any) {
      console.error('Error reading file:', error);
      toast.error('Gagal membaca file Excel');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleImportSubmit = async () => {
    const validRows = importData.filter(row => row.isValid);
    if (validRows.length === 0) {
      toast.error('Tidak ada data valid untuk diimport');
      return;
    }

    setIsLoading(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const row of validRows) {
        try {
          const id = await generateSequentialId({
            branchName: currentBranch?.name,
            tableName: 'accounts_payable',
            pageCode: 'MIG-AP',
            branchId: currentBranch?.id || null,
          });

          let parsedDueDate: string | null = null;
          if (row.dueDate) {
            const date = new Date(row.dueDate);
            if (!isNaN(date.getTime())) {
              parsedDueDate = date.toISOString().split('T')[0];
            }
          }

          const { error } = await supabase.from('accounts_payable').insert({
            id,
            purchase_order_id: null,
            supplier_name: row.creditorName,
            creditor_type: row.creditorType,
            amount: row.amount,
            interest_rate: 0,
            interest_type: 'flat',
            due_date: parsedDueDate,
            description: row.description || `Import hutang migrasi`,
            status: 'Outstanding',
            paid_amount: 0,
            notes: `[MIGRASI] ${row.notes || 'Import dari Excel'}`,
            branch_id: currentBranch?.id || null,
          });

          if (error) throw error;

          // Create migration journal
          if (currentBranch?.id) {
            await createMigrationDebtJournal({
              debtId: id,
              debtDate: new Date(),
              amount: row.amount,
              creditorName: row.creditorName,
              creditorType: row.creditorType,
              description: row.description || 'Import hutang migrasi',
              branchId: currentBranch.id,
            });
          }

          successCount++;
        } catch (err) {
          console.error('Error importing row:', err);
          errorCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`Berhasil import ${successCount} hutang`);
      }
      if (errorCount > 0) {
        toast.warning(`${errorCount} data gagal diimport`);
      }

      resetForm();
      setOpen(false);
      onSuccess?.();
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(`Gagal import: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadTemplate = () => {
    const template = [
      {
        'Nama Kreditor': 'Bank BCA',
        'Jenis': 'Bank',
        'Jumlah': 5000000,
        'Jatuh Tempo': '2025-06-15',
        'Deskripsi': 'Pinjaman modal usaha',
        'Catatan': 'Migrasi dari sistem lama',
      },
      {
        'Nama Kreditor': 'PT Supplier ABC',
        'Jenis': 'Supplier',
        'Jumlah': 2500000,
        'Jatuh Tempo': '2025-02-20',
        'Deskripsi': 'Hutang pembelian barang',
        'Catatan': '',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    ws['!cols'] = [
      { wch: 20 },
      { wch: 12 },
      { wch: 15 },
      { wch: 15 },
      { wch: 25 },
      { wch: 25 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template Hutang');
    XLSX.writeFile(wb, 'Template_Import_Hutang.xlsx');
  };

  const validCount = importData.filter(r => r.isValid).length;
  const invalidCount = importData.filter(r => !r.isValid).length;
  const showImportTab = isOwner(user?.role);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Tambah Hutang
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tambah Hutang Manual</DialogTitle>
          <DialogDescription>
            Catat hutang baru atau import hutang dari sistem lain
          </DialogDescription>
        </DialogHeader>

        {showImportTab ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="manual">Input Manual</TabsTrigger>
              <TabsTrigger value="import">Import Excel</TabsTrigger>
            </TabsList>

            {/* Manual Input Tab */}
            <TabsContent value="manual">
              <ManualInputForm
                formData={formData}
                setFormData={setFormData}
                isMigration={isMigration}
                setIsMigration={setIsMigration}
                isOwner={isOwner(user?.role)}
                isLoading={isLoading}
                onSubmit={handleSubmit}
                onCancel={() => setOpen(false)}
              />
            </TabsContent>

            {/* Import Excel Tab */}
            <TabsContent value="import">
              <div className="space-y-4 mt-4">
                {/* Upload Area */}
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="debt-file-upload"
                  />
                  <label htmlFor="debt-file-upload" className="cursor-pointer">
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-10 w-10 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        {isImporting ? 'Membaca file...' : 'Klik atau drag file Excel di sini'}
                      </p>
                      <p className="text-xs text-muted-foreground">Format: .xlsx, .xls</p>
                    </div>
                  </label>
                </div>

                {/* Download Template */}
                <Button variant="outline" onClick={downloadTemplate} className="w-full gap-2">
                  <Download className="h-4 w-4" />
                  Download Template Excel
                </Button>

                {/* Preview Data */}
                {importData.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Preview Data</h4>
                      <div className="text-sm">
                        <span className="text-green-600">{validCount} valid</span>
                        {invalidCount > 0 && (
                          <span className="text-red-600 ml-2">{invalidCount} error</span>
                        )}
                      </div>
                    </div>

                    <div className="border rounded-lg max-h-60 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted sticky top-0">
                          <tr>
                            <th className="text-left p-2">Status</th>
                            <th className="text-left p-2">Kreditor</th>
                            <th className="text-left p-2">Jenis</th>
                            <th className="text-right p-2">Jumlah</th>
                            <th className="text-left p-2">Keterangan</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importData.map((row, idx) => (
                            <tr key={idx} className={cn(
                              "border-t",
                              !row.isValid && "bg-red-50 dark:bg-red-900/20"
                            )}>
                              <td className="p-2">
                                {row.isValid ? (
                                  <Check className="h-4 w-4 text-green-600" />
                                ) : (
                                  <AlertCircle className="h-4 w-4 text-red-600" />
                                )}
                              </td>
                              <td className="p-2">{row.creditorName || '-'}</td>
                              <td className="p-2 capitalize">{row.creditorType}</td>
                              <td className="p-2 text-right font-mono">
                                {formatCurrency(row.amount)}
                              </td>
                              <td className="p-2 text-xs text-muted-foreground">
                                {row.error || row.description || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Journal Info */}
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                        <div className="text-sm text-blue-800 dark:text-blue-300">
                          <p>Import akan menggunakan jurnal migrasi:</p>
                          <p className="font-mono text-xs mt-1">
                            Dr. Saldo Awal (3100) | Cr. Hutang (2xxx)
                          </p>
                          <p className="text-xs mt-1 opacity-80">Tidak mempengaruhi saldo kas</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setImportData([])}
                        disabled={isLoading}
                      >
                        Reset
                      </Button>
                      <Button
                        onClick={handleImportSubmit}
                        disabled={isLoading || validCount === 0}
                      >
                        {isLoading ? 'Mengimport...' : `Import ${validCount} Data`}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <ManualInputForm
            formData={formData}
            setFormData={setFormData}
            isMigration={false}
            setIsMigration={() => {}}
            isOwner={false}
            isLoading={isLoading}
            onSubmit={handleSubmit}
            onCancel={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// Separate component for manual input form
function ManualInputForm({
  formData,
  setFormData,
  isMigration,
  setIsMigration,
  isOwner,
  isLoading,
  onSubmit,
  onCancel,
}: {
  formData: any;
  setFormData: (data: any) => void;
  isMigration: boolean;
  setIsMigration: (value: boolean) => void;
  isOwner: boolean;
  isLoading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4 mt-4">
      {/* Migration Toggle - Owner Only */}
      {isOwner && (
        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <div className="space-y-0.5">
            <Label htmlFor="migration-mode">Mode Migrasi</Label>
            <p className="text-xs text-muted-foreground">
              Untuk import hutang dari sistem lain (tanpa menambah kas)
            </p>
          </div>
          <Switch
            id="migration-mode"
            checked={isMigration}
            onCheckedChange={setIsMigration}
          />
        </div>
      )}

      {/* Creditor Type */}
      <div className="space-y-2">
        <Label htmlFor="creditorType">Jenis Kreditor *</Label>
        <Select
          value={formData.creditorType}
          onValueChange={(value: any) => setFormData({ ...formData, creditorType: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bank">Bank</SelectItem>
            <SelectItem value="credit_card">Kartu Kredit</SelectItem>
            <SelectItem value="supplier">Supplier</SelectItem>
            <SelectItem value="other">Lainnya</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Creditor Name */}
      <div className="space-y-2">
        <Label htmlFor="creditorName">Nama Kreditor *</Label>
        <Input
          id="creditorName"
          value={formData.creditorName}
          onChange={(e) => setFormData({ ...formData, creditorName: e.target.value })}
          placeholder="Contoh: Bank BCA, Supplier ABC, dll"
          required
        />
      </div>

      {/* Amount */}
      <div className="space-y-2">
        <Label htmlFor="amount">Jumlah Hutang *</Label>
        <Input
          id="amount"
          value={formData.amount}
          onChange={(e) => {
            const value = e.target.value.replace(/[^\d]/g, '');
            setFormData({ ...formData, amount: formatNumberWithCommas(value) });
          }}
          placeholder="0"
          required
        />
      </div>

      {/* Interest Rate Section - hide for migration */}
      {!isMigration && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="interestRate">Persentase Bunga (%)</Label>
              <Input
                id="interestRate"
                type="number"
                step="0.01"
                min="0"
                value={formData.interestRate}
                onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
                placeholder="0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="interestType">Tipe Bunga</Label>
              <Select
                value={formData.interestType}
                onValueChange={(value: any) => setFormData({ ...formData, interestType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flat">Flat (Sekali)</SelectItem>
                  <SelectItem value="per_month">Per Bulan</SelectItem>
                  <SelectItem value="per_year">Per Tahun</SelectItem>
                  <SelectItem value="decreasing">Bunga Menurun</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tenor / Cicilan */}
          <div className="space-y-2">
            <Label htmlFor="tenorMonths">Tenor Cicilan (Bulan)</Label>
            <Input
              id="tenorMonths"
              type="number"
              min="1"
              max="360"
              value={formData.tenorMonths}
              onChange={(e) => setFormData({ ...formData, tenorMonths: e.target.value })}
              placeholder="1"
            />
            <p className="text-xs text-muted-foreground">
              Jumlah bulan untuk cicilan. Jadwal angsuran dapat di-generate setelah hutang disimpan.
            </p>
          </div>
        </>
      )}

      {/* Due Date */}
      <div className="space-y-2">
        <Label htmlFor="dueDate">Jatuh Tempo</Label>
        <Input
          id="dueDate"
          type="date"
          value={formData.dueDate}
          onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Deskripsi *</Label>
        <Input
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder={isMigration ? "Migrasi hutang dari sistem lama" : "Contoh: Pinjaman modal usaha"}
          required
        />
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes">Catatan (Opsional)</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Catatan tambahan..."
          rows={2}
        />
      </div>

      {/* Journal Info */}
      <div className={cn(
        "border rounded-lg p-3",
        isMigration
          ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
          : "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
      )}>
        <div className="flex items-start gap-2">
          <Info className={cn(
            "h-5 w-5 mt-0.5",
            isMigration ? "text-blue-600 dark:text-blue-400" : "text-green-600 dark:text-green-400"
          )} />
          <div className={cn(
            "text-sm",
            isMigration ? "text-blue-800 dark:text-blue-300" : "text-green-800 dark:text-green-300"
          )}>
            <p className="font-medium">Jurnal Otomatis:</p>
            {isMigration ? (
              <>
                <p className="mt-1 font-mono text-xs">
                  Dr. Saldo Awal (3100)<br />
                  &nbsp;&nbsp;&nbsp;Cr. Hutang (2xxx)
                </p>
                <p className="mt-2 text-xs opacity-80">
                  Mode migrasi: Tidak ada perubahan pada saldo kas
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 font-mono text-xs">
                  Dr. Kas (1120)<br />
                  &nbsp;&nbsp;&nbsp;Cr. Hutang (2xxx)
                </p>
                <p className="mt-2 text-xs opacity-80">
                  Hutang baru: Kas bertambah dari pinjaman
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isLoading}
        >
          Batal
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Menyimpan...' : 'Simpan Hutang'}
        </Button>
      </div>
    </form>
  );
}
