import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AddDebtDialogProps {
  onSuccess?: () => void;
}

export function AddDebtDialog({ onSuccess }: AddDebtDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    creditorName: '',
    creditorType: 'other' as 'supplier' | 'bank' | 'credit_card' | 'other',
    amount: '',
    interestRate: '0',
    interestType: 'flat' as 'flat' | 'per_month' | 'per_year' | 'decreasing',
    dueDate: '',
    description: '',
    notes: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const amount = parseFloat(formData.amount);
      const interestRate = parseFloat(formData.interestRate);

      if (isNaN(amount) || amount <= 0) {
        toast.error('Jumlah hutang harus lebih dari 0');
        return;
      }

      if (isNaN(interestRate) || interestRate < 0) {
        toast.error('Persentase bunga tidak valid');
        return;
      }

      // Generate unique ID
      const id = `DEBT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Insert into accounts_payable
      const { error } = await supabase.from('accounts_payable').insert({
        id,
        purchase_order_id: null, // Manual debt entry, not from PO
        supplier_name: formData.creditorName,
        creditor_type: formData.creditorType,
        amount,
        interest_rate: interestRate,
        interest_type: formData.interestType,
        due_date: formData.dueDate || null,
        description: formData.description,
        status: 'Outstanding',
        paid_amount: 0,
        notes: formData.notes || null
      });

      if (error) throw error;

      toast.success('Hutang berhasil ditambahkan');

      // Reset form
      setFormData({
        creditorName: '',
        creditorType: 'other',
        amount: '',
        interestRate: '0',
        interestType: 'flat',
        dueDate: '',
        description: '',
        notes: ''
      });

      setOpen(false);
      onSuccess?.();
    } catch (error: any) {
      console.error('Error adding debt:', error);
      toast.error(`Gagal menambahkan hutang: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const getCreditorTypeLabel = (type: string) => {
    switch (type) {
      case 'supplier': return 'Supplier';
      case 'bank': return 'Bank';
      case 'credit_card': return 'Kartu Kredit';
      case 'other': return 'Lainnya';
      default: return type;
    }
  };

  const getInterestTypeLabel = (type: string) => {
    switch (type) {
      case 'flat': return 'Flat (Sekali)';
      case 'per_month': return 'Per Bulan';
      case 'per_year': return 'Per Tahun';
      case 'decreasing': return 'Bunga Menurun';
      default: return type;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Tambah Hutang
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tambah Hutang Manual</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
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
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              placeholder="0"
              required
            />
          </div>

          {/* Interest Rate Section */}
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
              <p className="text-xs text-muted-foreground">
                Contoh: 5 untuk 5%
              </p>
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
              placeholder="Contoh: Pinjaman modal usaha, Pembelian peralatan, dll"
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
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              Batal
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Menyimpan...' : 'Simpan Hutang'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
