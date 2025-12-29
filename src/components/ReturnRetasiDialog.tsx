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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ReturnItemsData, RetasiItem } from '@/types/retasi';
import { Package, CheckCircle, XCircle, ShoppingCart, Ban } from 'lucide-react';

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

    onConfirm({
      returned_items_count: totals.kembali,
      error_items_count: totals.error,
      barang_laku: totals.laku,
      barang_tidak_laku: totals.tidakLaku,
      return_notes: notes.trim() || undefined,
      item_returns: itemReturns,
    });
  };

  const handleClose = () => {
    setNotes('');
    onClose();
  };

  // If no items, show simple form (backward compatibility)
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

          <div className="p-4 text-center text-muted-foreground">
            <Package className="mx-auto h-12 w-12 mb-2 opacity-50" />
            <p>Tidak ada data produk untuk retasi ini.</p>
            <p className="text-sm">Silakan input manual atau cek data retasi.</p>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Konfirmasi Barang Kembali</DialogTitle>
          <DialogDescription>
            Retasi: {retasiNumber} | Total Barang: {totalItems} | {items.length} Produk
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Product Items Table */}
          <ScrollArea className="h-[300px] rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead className="w-[200px]">Produk</TableHead>
                  <TableHead className="text-center w-[80px]">Dibawa</TableHead>
                  <TableHead className="text-center w-[100px]">
                    <div className="flex items-center justify-center gap-1">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      Kembali
                    </div>
                  </TableHead>
                  <TableHead className="text-center w-[90px]">
                    <div className="flex items-center justify-center gap-1">
                      <ShoppingCart className="h-4 w-4 text-blue-600" />
                      Laku
                    </div>
                  </TableHead>
                  <TableHead className="text-center w-[90px]">
                    <div className="flex items-center justify-center gap-1">
                      <Ban className="h-4 w-4 text-orange-600" />
                      Tdk Laku
                    </div>
                  </TableHead>
                  <TableHead className="text-center w-[90px]">
                    <div className="flex items-center justify-center gap-1">
                      <XCircle className="h-4 w-4 text-red-600" />
                      Error
                    </div>
                  </TableHead>
                  <TableHead className="text-center w-[70px]">Selisih</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemReturns.map((item, index) => {
                  const itemTotal = item.returned_quantity + item.sold_quantity + item.unsold_quantity + item.error_quantity;
                  const itemSelisih = item.quantity - itemTotal;

                  return (
                    <TableRow key={item.item_id}>
                      <TableCell className="font-medium">{item.product_name}</TableCell>
                      <TableCell className="text-center font-semibold">{item.quantity}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max={item.quantity}
                          value={item.returned_quantity || ''}
                          onChange={(e) => handleItemChange(index, 'returned_quantity', parseInt(e.target.value) || 0)}
                          className="w-16 mx-auto text-center"
                          placeholder="0"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max={item.quantity}
                          value={item.sold_quantity || ''}
                          onChange={(e) => handleItemChange(index, 'sold_quantity', parseInt(e.target.value) || 0)}
                          className="w-16 mx-auto text-center"
                          placeholder="0"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max={item.quantity}
                          value={item.unsold_quantity || ''}
                          onChange={(e) => handleItemChange(index, 'unsold_quantity', parseInt(e.target.value) || 0)}
                          className="w-16 mx-auto text-center"
                          placeholder="0"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max={item.quantity}
                          value={item.error_quantity || ''}
                          onChange={(e) => handleItemChange(index, 'error_quantity', parseInt(e.target.value) || 0)}
                          className="w-16 mx-auto text-center"
                          placeholder="0"
                        />
                      </TableCell>
                      <TableCell className={`text-center font-semibold ${itemSelisih > 0 ? 'text-orange-600' : itemSelisih < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {itemSelisih}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Catatan (Opsional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan tambahan mengenai kondisi barang..."
              rows={2}
            />
          </div>

          {/* Summary */}
          <div className="grid grid-cols-7 gap-2 p-3 bg-gray-50 rounded-lg text-sm">
            <div className="text-center">
              <div className="text-muted-foreground text-xs">Dibawa</div>
              <div className="font-bold text-lg">{totals.bawa}</div>
            </div>
            <div className="text-center">
              <div className="text-green-600 text-xs">Kembali</div>
              <div className="font-bold text-lg text-green-600">{totals.kembali}</div>
            </div>
            <div className="text-center">
              <div className="text-blue-600 text-xs">Laku</div>
              <div className="font-bold text-lg text-blue-600">{totals.laku}</div>
            </div>
            <div className="text-center">
              <div className="text-orange-600 text-xs">Tdk Laku</div>
              <div className="font-bold text-lg text-orange-600">{totals.tidakLaku}</div>
            </div>
            <div className="text-center">
              <div className="text-red-600 text-xs">Error</div>
              <div className="font-bold text-lg text-red-600">{totals.error}</div>
            </div>
            <div className="text-center">
              <div className="text-muted-foreground text-xs">Total</div>
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
              disabled={isLoading || selisih < 0}
            >
              {isLoading ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
