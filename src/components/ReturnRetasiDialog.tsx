import React, { useState, useEffect } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { ReturnItemsData, RetasiItem } from '@/types/retasi';
import { Package, CheckCircle, XCircle, ShoppingCart, Ban } from 'lucide-react';

// Simple form component for retasi without item details
function SimpleReturnForm({
  totalItems,
  notes,
  setNotes,
  onConfirm,
  onClose,
  isLoading,
}: {
  totalItems: number;
  notes: string;
  setNotes: (notes: string) => void;
  onConfirm: (data: ReturnItemsData) => void;
  onClose: () => void;
  isLoading: boolean;
}) {
  const [kembali, setKembali] = React.useState(0);
  const [laku, setLaku] = React.useState(0);
  const [tidakLaku, setTidakLaku] = React.useState(0);
  const [error, setError] = React.useState(0);

  const totalInput = kembali + laku + tidakLaku + error;
  const selisih = totalItems - totalInput;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (totalInput > totalItems) {
      alert('Total input melebihi jumlah barang yang dibawa!');
      return;
    }

    const returnData: ReturnItemsData = {
      returned_items_count: kembali,
      error_items_count: error,
      barang_laku: laku,
      barang_tidak_laku: tidakLaku,
      return_notes: notes.trim() || undefined,
      item_returns: [],
    };

    onConfirm(returnData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-4 text-center text-muted-foreground border-b">
        <Package className="mx-auto h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">Input manual jumlah barang kembali</p>
      </div>

      {/* Input Fields */}
      <div className="grid grid-cols-2 gap-4 px-4">
        <div className="space-y-2">
          <Label className="flex items-center gap-1">
            <CheckCircle className="h-4 w-4 text-green-600" />
            Kembali
          </Label>
          <Input
            type="number"
            min="0"
            max={totalItems}
            value={kembali || ''}
            onChange={(e) => setKembali(parseInt(e.target.value) || 0)}
            placeholder="0"
          />
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-1">
            <ShoppingCart className="h-4 w-4 text-blue-600" />
            Laku
          </Label>
          <Input
            type="number"
            min="0"
            max={totalItems}
            value={laku || ''}
            onChange={(e) => setLaku(parseInt(e.target.value) || 0)}
            placeholder="0"
          />
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-1">
            <Ban className="h-4 w-4 text-orange-600" />
            Tidak Laku
          </Label>
          <Input
            type="number"
            min="0"
            max={totalItems}
            value={tidakLaku || ''}
            onChange={(e) => setTidakLaku(parseInt(e.target.value) || 0)}
            placeholder="0"
          />
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-1">
            <XCircle className="h-4 w-4 text-red-600" />
            Error
          </Label>
          <Input
            type="number"
            min="0"
            max={totalItems}
            value={error || ''}
            onChange={(e) => setError(parseInt(e.target.value) || 0)}
            placeholder="0"
          />
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 p-3 bg-gray-50 rounded-lg text-sm mx-4">
        <div className="text-center">
          <div className="text-muted-foreground text-xs">Dibawa</div>
          <div className="font-bold text-lg">{totalItems}</div>
        </div>
        <div className="text-center">
          <div className="text-muted-foreground text-xs">Total Input</div>
          <div className="font-bold text-lg">{totalInput}</div>
        </div>
        <div className="text-center">
          <div className={`text-xs ${selisih === 0 ? 'text-green-600' : 'text-orange-600'}`}>Selisih</div>
          <div className={`font-bold text-lg ${selisih === 0 ? 'text-green-600' : 'text-orange-600'}`}>{selisih}</div>
        </div>
      </div>

      {selisih > 0 && (
        <div className="text-orange-600 text-sm text-center">
          Masih ada {selisih} barang belum diinput
        </div>
      )}
      {selisih < 0 && (
        <div className="text-red-600 text-sm text-center">
          Total input melebihi jumlah barang yang dibawa!
        </div>
      )}

      {/* Notes */}
      <div className="space-y-2 px-4">
        <Label htmlFor="simple-notes">Catatan (Opsional)</Label>
        <Textarea
          id="simple-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Catatan tambahan..."
          rows={2}
        />
      </div>

      <DialogFooter className="gap-2 px-4 pb-4">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isLoading}
        >
          Batal
        </Button>
        <Button
          type="submit"
          disabled={isLoading || selisih < 0}
        >
          {isLoading ? 'Menyimpan...' : 'Simpan'}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface ReturnRetasiDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: ReturnItemsData) => void;
  retasiNumber: string;
  totalItems: number;
  items?: RetasiItem[]; // Produk yang dibawa
  isLoading?: boolean;
}

interface ItemReturn {
  item_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  returned_quantity: number;
  sold_quantity: number;
  error_quantity: number;
  unsold_quantity: number;
}

export function ReturnRetasiDialog({
  isOpen,
  onClose,
  onConfirm,
  retasiNumber,
  totalItems,
  items = [],
  isLoading = false,
}: ReturnRetasiDialogProps) {
  const [itemReturns, setItemReturns] = useState<ItemReturn[]>([]);
  const [notes, setNotes] = useState('');

  // Initialize item returns from items prop
  useEffect(() => {
    if (items.length > 0) {
      setItemReturns(items.map(item => ({
        item_id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        returned_quantity: item.returned_quantity || 0,
        sold_quantity: item.sold_quantity || 0,
        error_quantity: item.error_quantity || 0,
        unsold_quantity: item.unsold_quantity || 0,
      })));
    } else {
      setItemReturns([]);
    }
  }, [items]);

  // Calculate totals
  const totals = itemReturns.reduce((acc, item) => ({
    bawa: acc.bawa + item.quantity,
    kembali: acc.kembali + item.returned_quantity,
    laku: acc.laku + item.sold_quantity,
    tidakLaku: acc.tidakLaku + item.unsold_quantity,
    error: acc.error + item.error_quantity,
  }), { bawa: 0, kembali: 0, laku: 0, tidakLaku: 0, error: 0 });

  const totalInput = totals.kembali + totals.laku + totals.tidakLaku + totals.error;
  const selisih = totals.bawa - totalInput;

  const handleItemChange = (index: number, field: keyof ItemReturn, value: number) => {
    const newItems = [...itemReturns];
    const item = newItems[index];
    const newValue = Math.max(0, value);

    // Validate that total doesn't exceed quantity
    const otherFields = {
      returned_quantity: field === 'returned_quantity' ? newValue : item.returned_quantity,
      sold_quantity: field === 'sold_quantity' ? newValue : item.sold_quantity,
      unsold_quantity: field === 'unsold_quantity' ? newValue : item.unsold_quantity,
      error_quantity: field === 'error_quantity' ? newValue : item.error_quantity,
    };

    const total = otherFields.returned_quantity + otherFields.sold_quantity + otherFields.unsold_quantity + otherFields.error_quantity;

    if (total <= item.quantity) {
      newItems[index] = { ...item, ...otherFields };
      setItemReturns(newItems);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate
    const hasOverflow = itemReturns.some(item => {
      const total = item.returned_quantity + item.sold_quantity + item.unsold_quantity + item.error_quantity;
      return total > item.quantity;
    });

    if (hasOverflow) {
      alert('Ada produk yang jumlah inputnya melebihi jumlah yang dibawa');
      return;
    }

    // Kirim data per-item saja, RPC yang hitung total (Single Source of Truth)
    const returnData = {
      returned_items_count: 0, // Akan dihitung oleh RPC
      error_items_count: 0,    // Akan dihitung oleh RPC
      barang_laku: 0,          // Akan dihitung oleh RPC
      barang_tidak_laku: 0,    // Akan dihitung oleh RPC
      return_notes: notes.trim() || undefined,
      item_returns: itemReturns,
    };
    onConfirm(returnData);
  };

  const handleClose = () => {
    setNotes('');
    onClose();
  };

  // If no items, show simple form with manual input (backward compatibility)
  if (items.length === 0) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Konfirmasi Barang Kembali</DialogTitle>
            <DialogDescription>
              Retasi: {retasiNumber} | Total Barang: {totalItems}
            </DialogDescription>
          </DialogHeader>

          <SimpleReturnForm
            totalItems={totalItems}
            notes={notes}
            setNotes={setNotes}
            onConfirm={onConfirm}
            onClose={handleClose}
            isLoading={isLoading}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] p-0">
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="text-base">Konfirmasi Barang Kembali</DialogTitle>
          <DialogDescription className="text-xs">
            {retasiNumber} | {totalItems} item | {items.length} produk
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          {/* Mobile-optimized Product Items */}
          <ScrollArea className="max-h-[45vh] px-4">
            <div className="space-y-3 py-2">
              {itemReturns.map((item, index) => {
                const itemTotal = item.returned_quantity + item.sold_quantity + item.unsold_quantity + item.error_quantity;
                const itemSelisih = item.quantity - itemTotal;

                return (
                  <div key={item.item_id} className="border rounded-lg p-3 bg-white">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{item.product_name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Bawa: {item.quantity}</span>
                        <span className={`text-xs font-medium ${itemSelisih === 0 ? 'text-green-600' : itemSelisih < 0 ? 'text-red-600' : 'text-orange-600'}`}>
                          ({itemSelisih >= 0 ? '+' : ''}{-itemSelisih})
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-green-600 flex items-center gap-0.5">
                          <CheckCircle className="h-3 w-3" />Kembali
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          max={item.quantity}
                          value={item.returned_quantity || ''}
                          onChange={(e) => handleItemChange(index, 'returned_quantity', parseInt(e.target.value) || 0)}
                          className="h-9 text-center text-sm"
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-blue-600 flex items-center gap-0.5">
                          <ShoppingCart className="h-3 w-3" />Laku
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          max={item.quantity}
                          value={item.sold_quantity || ''}
                          onChange={(e) => handleItemChange(index, 'sold_quantity', parseInt(e.target.value) || 0)}
                          className="h-9 text-center text-sm"
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-orange-600 flex items-center gap-0.5">
                          <Ban className="h-3 w-3" />Tdk Laku
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          max={item.quantity}
                          value={item.unsold_quantity || ''}
                          onChange={(e) => handleItemChange(index, 'unsold_quantity', parseInt(e.target.value) || 0)}
                          className="h-9 text-center text-sm"
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-red-600 flex items-center gap-0.5">
                          <XCircle className="h-3 w-3" />Error
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          max={item.quantity}
                          value={item.error_quantity || ''}
                          onChange={(e) => handleItemChange(index, 'error_quantity', parseInt(e.target.value) || 0)}
                          className="h-9 text-center text-sm"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <div className="p-4 pt-2 space-y-3 border-t">
            {/* Notes */}
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan (opsional)..."
              rows={2}
              className="resize-none text-sm"
            />

            {/* Compact Summary */}
            <div className="grid grid-cols-5 gap-1 p-2 bg-gray-50 rounded-lg text-center text-xs">
              <div>
                <div className="text-muted-foreground">Bawa</div>
                <div className="font-bold text-base">{totals.bawa}</div>
              </div>
              <div>
                <div className="text-green-600">Kembali</div>
                <div className="font-bold text-base text-green-600">{totals.kembali}</div>
              </div>
              <div>
                <div className="text-blue-600">Laku</div>
                <div className="font-bold text-base text-blue-600">{totals.laku}</div>
              </div>
              <div>
                <div className="text-orange-600">Error</div>
                <div className="font-bold text-base text-orange-600">{totals.error + totals.tidakLaku}</div>
              </div>
              <div>
                <div className={selisih === 0 ? 'text-green-600' : 'text-orange-600'}>Selisih</div>
                <div className={`font-bold text-base ${selisih === 0 ? 'text-green-600' : 'text-orange-600'}`}>{selisih}</div>
              </div>
            </div>

            {selisih > 0 && (
              <div className="text-orange-600 text-xs text-center">
                Masih ada {selisih} barang belum diinput
              </div>
            )}
            {selisih < 0 && (
              <div className="text-red-600 text-xs text-center">
                Total melebihi jumlah yang dibawa!
              </div>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isLoading}
                className="flex-1 h-11"
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={isLoading || selisih < 0}
                className="flex-1 h-11 bg-green-600 hover:bg-green-700"
              >
                {isLoading ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
