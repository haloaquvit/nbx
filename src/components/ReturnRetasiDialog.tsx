import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ReturnItemsData } from '@/types/retasi';

interface ReturnRetasiDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: ReturnItemsData) => void;
  retasiNumber: string;
  totalItems: number;
  isLoading?: boolean;
}

export function ReturnRetasiDialog({
  isOpen,
  onClose,
  onConfirm,
  retasiNumber,
  totalItems,
  isLoading = false,
}: ReturnRetasiDialogProps) {
  const [returnedItems, setReturnedItems] = useState(0);
  const [errorItems, setErrorItems] = useState(0);
  const [barangLaku, setBarangLaku] = useState(0);
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (returnedItems + errorItems + barangLaku > totalItems) {
      alert('Total barang kembali, error, dan laku tidak boleh melebihi total barang');
      return;
    }

    onConfirm({
      returned_items_count: returnedItems,
      error_items_count: errorItems,
      barang_laku: barangLaku,
      return_notes: notes.trim() || undefined,
    });
  };

  const handleClose = () => {
    setReturnedItems(0);
    setErrorItems(0);
    setBarangLaku(0);
    setNotes('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Konfirmasi Barang Kembali</DialogTitle>
          <DialogDescription>
            Retasi: {retasiNumber} | Total Barang: {totalItems}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="returnedItems">Barang Kembali</Label>
              <Input
                id="returnedItems"
                type="number"
                min="0"
                max={totalItems}
                value={returnedItems}
                onChange={(e) => setReturnedItems(parseInt(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="errorItems">Barang Error</Label>
              <Input
                id="errorItems"
                type="number"
                min="0"
                max={totalItems}
                value={errorItems}
                onChange={(e) => setErrorItems(parseInt(e.target.value) || 0)}
                placeholder="0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="barangLaku">Barang Laku</Label>
              <Input
                id="barangLaku"
                type="number"
                min="0"
                max={totalItems}
                value={barangLaku}
                onChange={(e) => setBarangLaku(parseInt(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Catatan (Opsional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan tambahan mengenai kondisi barang..."
              rows={3}
            />
          </div>

          <div className="text-sm space-y-2 p-3 bg-gray-50 rounded-lg">
            <div className="flex justify-between">
              <span>Total diinput:</span>
              <span className="font-medium">{returnedItems + errorItems + barangLaku} / {totalItems}</span>
            </div>
            <div className="flex justify-between text-blue-600">
              <span>Selisih (Kembali - Error - Laku):</span>
              <span className="font-bold">{returnedItems - errorItems - barangLaku}</span>
            </div>
            <div className="flex justify-between text-orange-600">
              <span>Sisa/Belum diinput:</span>
              <span className="font-medium">{totalItems - (returnedItems + errorItems + barangLaku)}</span>
            </div>
            {(returnedItems + errorItems + barangLaku) > totalItems && (
              <div className="text-red-600 font-medium text-center">
                ⚠️ Total melebihi jumlah barang!
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleClose}
              disabled={isLoading}
            >
              Batal
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading}
            >
              {isLoading ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}