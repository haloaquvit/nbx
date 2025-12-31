import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { format, addMonths } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import {
  Calendar,
  CreditCard,
  CheckCircle,
  AlertCircle,
  Clock,
  Trash2,
  RefreshCw,
  Calculator,
  Banknote,
  Receipt
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { DebtInstallment, AccountsPayable } from '@/types/accountsPayable';
import { DebtInstallmentService } from '@/services/debtInstallmentService';
import { useAccounts } from '@/hooks/useAccounts';
import { useBranch } from '@/contexts/BranchContext';

interface DebtInstallmentTabProps {
  debt: AccountsPayable;
  onUpdate?: () => void;
}

export function DebtInstallmentTab({ debt, onUpdate }: DebtInstallmentTabProps) {
  const { currentBranch } = useBranch();
  const { accounts } = useAccounts();
  const [installments, setInstallments] = useState<DebtInstallment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<DebtInstallment | null>(null);
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [liabilityAccountId, setLiabilityAccountId] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Generate form state
  const [generateForm, setGenerateForm] = useState({
    tenorMonths: debt.tenorMonths?.toString() || '12',
    startDate: format(new Date(), 'yyyy-MM-dd'),
  });

  const paymentAccounts = accounts?.filter(acc => acc.isPaymentAccount) || [];
  const liabilityAccounts = accounts?.filter(acc => acc.type === 'Kewajiban' && !acc.isHeader) || [];

  // Load installments
  useEffect(() => {
    loadInstallments();
  }, [debt.id]);

  const loadInstallments = async () => {
    setIsLoading(true);
    try {
      const data = await DebtInstallmentService.getInstallments(debt.id);
      setInstallments(data);
    } catch (error) {
      console.error('Error loading installments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Generate installments
  const handleGenerate = async () => {
    setIsProcessing(true);
    try {
      const result = await DebtInstallmentService.generateInstallments({
        debtId: debt.id,
        principal: debt.amount,
        interestRate: debt.interestRate || 0,
        interestType: debt.interestType || 'flat',
        tenorMonths: parseInt(generateForm.tenorMonths) || 12,
        startDate: new Date(generateForm.startDate),
        branchId: currentBranch?.id,
      });

      if (result.success) {
        toast.success(`Berhasil generate ${result.installments?.length} jadwal angsuran`);
        setShowGenerateDialog(false);
        loadInstallments();
        onUpdate?.();
      } else {
        toast.error(result.error || 'Gagal generate jadwal angsuran');
      }
    } catch (error: any) {
      toast.error(error.message || 'Terjadi kesalahan');
    } finally {
      setIsProcessing(false);
    }
  };

  // Pay installment
  const handlePay = async () => {
    if (!selectedInstallment || !paymentAccountId || !liabilityAccountId) {
      toast.error('Pilih akun pembayaran dan akun kewajiban');
      return;
    }

    setIsProcessing(true);
    try {
      const result = await DebtInstallmentService.payInstallment({
        installmentId: selectedInstallment.id,
        paymentAccountId,
        liabilityAccountId,
        branchId: currentBranch?.id || '',
        notes: paymentNotes,
      });

      if (result.success) {
        toast.success(`Angsuran ke-${selectedInstallment.installmentNumber} berhasil dibayar`);
        setShowPayDialog(false);
        setSelectedInstallment(null);
        setPaymentAccountId('');
        setLiabilityAccountId('');
        setPaymentNotes('');
        loadInstallments();
        onUpdate?.();
      } else {
        toast.error(result.error || 'Gagal membayar angsuran');
      }
    } catch (error: any) {
      toast.error(error.message || 'Terjadi kesalahan');
    } finally {
      setIsProcessing(false);
    }
  };

  // Delete all installments
  const handleDelete = async () => {
    if (!confirm('Hapus semua jadwal angsuran? Hanya bisa jika belum ada pembayaran.')) return;

    setIsProcessing(true);
    try {
      const result = await DebtInstallmentService.deleteInstallments(debt.id);
      if (result.success) {
        toast.success('Jadwal angsuran dihapus');
        loadInstallments();
        onUpdate?.();
      } else {
        toast.error(result.error || 'Gagal menghapus jadwal');
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const openPayDialog = (installment: DebtInstallment) => {
    setSelectedInstallment(installment);
    setShowPayDialog(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-100 text-green-700"><CheckCircle className="h-3 w-3 mr-1" /> Lunas</Badge>;
      case 'overdue':
        return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" /> Terlambat</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Menunggu</Badge>;
    }
  };

  // Calculate summary
  const totalPrincipal = installments.reduce((sum, i) => sum + i.principalAmount, 0);
  const totalInterest = installments.reduce((sum, i) => sum + i.interestAmount, 0);
  const totalAmount = installments.reduce((sum, i) => sum + i.totalAmount, 0);
  const paidAmount = installments.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.totalAmount, 0);
  const remainingAmount = totalAmount - paidAmount;
  const paidCount = installments.filter(i => i.status === 'paid').length;
  const overdueCount = installments.filter(i => i.status === 'overdue').length;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      {installments.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Total Pokok</div>
            <div className="font-mono font-bold">{formatCurrency(totalPrincipal)}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Total Bunga</div>
            <div className="font-mono font-bold text-orange-600">{formatCurrency(totalInterest)}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Sudah Dibayar</div>
            <div className="font-mono font-bold text-green-600">{formatCurrency(paidAmount)}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Sisa</div>
            <div className="font-mono font-bold text-red-600">{formatCurrency(remainingAmount)}</div>
          </Card>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          {installments.length > 0 ? (
            <>
              {paidCount}/{installments.length} angsuran terbayar
              {overdueCount > 0 && <span className="text-red-600 ml-2">({overdueCount} terlambat)</span>}
            </>
          ) : (
            'Belum ada jadwal angsuran'
          )}
        </div>
        <div className="flex gap-2">
          {installments.length === 0 ? (
            <Button onClick={() => setShowGenerateDialog(true)} className="gap-2">
              <Calculator className="h-4 w-4" />
              Generate Jadwal Angsuran
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={loadInstallments} className="gap-1">
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDelete} className="gap-1" disabled={paidCount > 0}>
                <Trash2 className="h-4 w-4" />
                Hapus Jadwal
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Installments Table */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : installments.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">No</TableHead>
                  <TableHead>Jatuh Tempo</TableHead>
                  <TableHead className="text-right">Pokok</TableHead>
                  <TableHead className="text-right">Bunga</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {installments.map((installment) => (
                  <TableRow key={installment.id} className={installment.status === 'overdue' ? 'bg-red-50' : ''}>
                    <TableCell className="font-medium">{installment.installmentNumber}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {format(installment.dueDate, 'd MMM yyyy', { locale: idLocale })}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(installment.principalAmount)}</TableCell>
                    <TableCell className="text-right font-mono text-orange-600">{formatCurrency(installment.interestAmount)}</TableCell>
                    <TableCell className="text-right font-mono font-bold">{formatCurrency(installment.totalAmount)}</TableCell>
                    <TableCell>{getStatusBadge(installment.status)}</TableCell>
                    <TableCell>
                      {installment.status !== 'paid' && (
                        <Button size="sm" onClick={() => openPayDialog(installment)} className="gap-1">
                          <Banknote className="h-4 w-4" />
                          Bayar
                        </Button>
                      )}
                      {installment.status === 'paid' && installment.paidAt && (
                        <span className="text-xs text-muted-foreground">
                          {format(installment.paidAt, 'd/M/yy')}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card className="p-8 text-center">
          <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">
            Belum ada jadwal angsuran untuk hutang ini
          </p>
          <Button onClick={() => setShowGenerateDialog(true)} className="gap-2">
            <Calculator className="h-4 w-4" />
            Generate Jadwal Angsuran
          </Button>
        </Card>
      )}

      {/* Generate Dialog */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Generate Jadwal Angsuran
            </DialogTitle>
            <DialogDescription>
              Buat jadwal cicilan untuk hutang {debt.supplierName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Debt Info */}
            <div className="bg-muted p-3 rounded-lg space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Pokok Hutang:</span>
                <span className="font-mono font-bold">{formatCurrency(debt.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span>Bunga:</span>
                <span>{debt.interestRate || 0}% {debt.interestType === 'per_month' ? '/bulan' : debt.interestType === 'per_year' ? '/tahun' : '(flat)'}</span>
              </div>
            </div>

            {/* Tenor */}
            <div className="space-y-2">
              <Label htmlFor="tenorMonths">Tenor (Bulan)</Label>
              <Input
                id="tenorMonths"
                type="number"
                min="1"
                max="360"
                value={generateForm.tenorMonths}
                onChange={(e) => setGenerateForm({ ...generateForm, tenorMonths: e.target.value })}
              />
            </div>

            {/* Start Date */}
            <div className="space-y-2">
              <Label htmlFor="startDate">Tanggal Mulai Cicilan</Label>
              <Input
                id="startDate"
                type="date"
                value={generateForm.startDate}
                onChange={(e) => setGenerateForm({ ...generateForm, startDate: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Angsuran pertama jatuh tempo 1 bulan setelah tanggal ini
              </p>
            </div>

            {/* Preview */}
            <div className="bg-blue-50 p-3 rounded-lg text-sm">
              <p className="font-medium mb-2">Perkiraan:</p>
              <div className="space-y-1 text-xs">
                <div>Angsuran pokok/bulan: {formatCurrency(debt.amount / (parseInt(generateForm.tenorMonths) || 1))}</div>
                <div>Angsuran pertama: {format(addMonths(new Date(generateForm.startDate), 1), 'd MMMM yyyy', { locale: idLocale })}</div>
                <div>Angsuran terakhir: {format(addMonths(new Date(generateForm.startDate), parseInt(generateForm.tenorMonths) || 1), 'd MMMM yyyy', { locale: idLocale })}</div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>Batal</Button>
            <Button onClick={handleGenerate} disabled={isProcessing}>
              {isProcessing ? 'Memproses...' : 'Generate Jadwal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pay Dialog */}
      <Dialog open={showPayDialog} onOpenChange={setShowPayDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5" />
              Bayar Angsuran #{selectedInstallment?.installmentNumber}
            </DialogTitle>
            <DialogDescription>
              Jatuh tempo: {selectedInstallment && format(selectedInstallment.dueDate, 'd MMMM yyyy', { locale: idLocale })}
            </DialogDescription>
          </DialogHeader>

          {selectedInstallment && (
            <div className="space-y-4">
              {/* Amount Info */}
              <div className="bg-muted p-3 rounded-lg space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Pokok:</span>
                  <span className="font-mono">{formatCurrency(selectedInstallment.principalAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Bunga:</span>
                  <span className="font-mono text-orange-600">{formatCurrency(selectedInstallment.interestAmount)}</span>
                </div>
                <div className="flex justify-between font-bold border-t pt-1 mt-1">
                  <span>Total Bayar:</span>
                  <span className="font-mono">{formatCurrency(selectedInstallment.totalAmount)}</span>
                </div>
              </div>

              {/* Payment Account */}
              <div className="space-y-2">
                <Label>Akun Pembayaran (Kas/Bank)</Label>
                <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih akun pembayaran" />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.code ? `${account.code} - ` : ''}{account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Liability Account */}
              <div className="space-y-2">
                <Label>Akun Kewajiban (Hutang)</Label>
                <Select value={liabilityAccountId} onValueChange={setLiabilityAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih akun kewajiban" />
                  </SelectTrigger>
                  <SelectContent>
                    {liabilityAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.code ? `${account.code} - ` : ''}{account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>Catatan (Opsional)</Label>
                <Input
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Catatan pembayaran"
                />
              </div>

              {/* Journal Preview */}
              <div className="bg-green-50 p-3 rounded-lg text-sm">
                <p className="font-medium mb-1">Jurnal Otomatis:</p>
                <p className="font-mono text-xs">
                  Dr. Hutang Usaha &nbsp;&nbsp;&nbsp;{formatCurrency(selectedInstallment.totalAmount)}<br />
                  &nbsp;&nbsp;&nbsp;Cr. Kas/Bank &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{formatCurrency(selectedInstallment.totalAmount)}
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayDialog(false)}>Batal</Button>
            <Button onClick={handlePay} disabled={isProcessing || !paymentAccountId || !liabilityAccountId}>
              {isProcessing ? 'Memproses...' : 'Bayar Angsuran'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
