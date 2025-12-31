import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Edit, Percent, Calendar, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AccountsPayable } from '@/types/accountsPayable';
import { formatCurrency } from '@/lib/utils';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

interface EditDebtDialogProps {
  payable: AccountsPayable;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function EditDebtDialog({ payable, open, onOpenChange, onSuccess }: EditDebtDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    interestRate: '0',
    interestType: 'flat' as 'flat' | 'per_month' | 'per_year',
    tenorMonths: '1',
    dueDate: '',
    notes: ''
  });

  // Load initial data when dialog opens
  useEffect(() => {
    if (open && payable) {
      setFormData({
        interestRate: (payable.interestRate || 0).toString(),
        interestType: payable.interestType || 'flat',
        tenorMonths: (payable.tenorMonths || 1).toString(),
        dueDate: payable.dueDate ? format(payable.dueDate, 'yyyy-MM-dd') : '',
        notes: payable.notes || ''
      });
    }
  }, [open, payable]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const interestRate = parseFloat(formData.interestRate) || 0;
      const tenorMonths = parseInt(formData.tenorMonths) || 1;

      if (interestRate < 0) {
        toast.error('Persentase bunga tidak boleh negatif');
        return;
      }

      if (tenorMonths < 1) {
        toast.error('Tenor minimal 1 bulan');
        return;
      }

      const { error } = await supabase
        .from('accounts_payable')
        .update({
          interest_rate: interestRate,
          interest_type: formData.interestType,
          tenor_months: tenorMonths,
          due_date: formData.dueDate || null,
          notes: formData.notes || null,
        })
        .eq('id', payable.id);

      if (error) throw error;

      toast.success('Data hutang berhasil diperbarui');
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error('Error updating debt:', error);
      toast.error(`Gagal memperbarui: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5 text-blue-600" />
            Edit Hutang
          </DialogTitle>
          <DialogDescription>
            {payable.supplierName} - {formatCurrency(payable.amount)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Info Hutang */}
          <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">ID:</span>
              <span className="font-mono">{payable.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Dibuat:</span>
              <span>{format(payable.createdAt, 'd MMM yyyy', { locale: idLocale })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Status:</span>
              <span className={payable.status === 'Paid' ? 'text-green-600' : 'text-red-600'}>
                {payable.status === 'Outstanding' ? 'Belum Dibayar' : payable.status === 'Partial' ? 'Sebagian' : 'Lunas'}
              </span>
            </div>
          </div>

          {/* Bunga */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="interestRate" className="flex items-center gap-1">
                <Percent className="h-4 w-4" />
                Persentase Bunga
              </Label>
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
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tenor */}
          <div className="space-y-2">
            <Label htmlFor="tenorMonths" className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Tenor Cicilan (Bulan)
            </Label>
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
              Perubahan tenor tidak otomatis mengubah jadwal angsuran yang sudah ada.
              Hapus jadwal lama dan generate ulang jika diperlukan.
            </p>
          </div>

          {/* Jatuh Tempo */}
          <div className="space-y-2">
            <Label htmlFor="dueDate" className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              Jatuh Tempo
            </Label>
            <Input
              id="dueDate"
              type="date"
              value={formData.dueDate}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
            />
          </div>

          {/* Catatan */}
          <div className="space-y-2">
            <Label htmlFor="notes">Catatan</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Catatan tambahan..."
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Batal
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Menyimpan...' : 'Simpan Perubahan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
