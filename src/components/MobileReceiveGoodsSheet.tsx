"use client"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Truck, Package, Calendar, Building2, CheckCircle2, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'
import { PurchaseOrder } from '@/types/purchaseOrder'

interface MobileReceiveGoodsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  purchaseOrder: PurchaseOrder
  onReceive: () => Promise<void>
  isLoading: boolean
}

export const MobileReceiveGoodsSheet = ({
  open,
  onOpenChange,
  purchaseOrder,
  onReceive,
  isLoading
}: MobileReceiveGoodsSheetProps) => {
  const handleReceive = async () => {
    try {
      await onReceive()
    } catch (error) {
      console.error('Error receiving goods:', error)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[80vh] dark:bg-gray-900">
        <SheetHeader className="text-center pb-4">
          <div className="mx-auto w-14 h-14 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center mb-3">
            <Truck className="h-7 w-7 text-green-600 dark:text-green-400" />
          </div>
          <SheetTitle className="text-lg dark:text-white">Terima Barang</SheetTitle>
          <SheetDescription className="dark:text-gray-400">
            Konfirmasi penerimaan barang dari PO ini
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 pb-6">
          {/* PO Info Card */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-4 space-y-3">
              {/* PO Number */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">No. PO</span>
                <span className="font-semibold dark:text-white">{purchaseOrder.id}</span>
              </div>

              {/* Supplier */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                  <Building2 className="h-4 w-4" />
                  Supplier
                </span>
                <span className="font-medium dark:text-white">{purchaseOrder.supplierName || '-'}</span>
              </div>

              {/* Order Date */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Tanggal Order
                </span>
                <span className="dark:text-white">
                  {purchaseOrder.orderDate
                    ? format(new Date(purchaseOrder.orderDate), 'dd MMM yyyy', { locale: id })
                    : format(new Date(purchaseOrder.createdAt), 'dd MMM yyyy', { locale: id })}
                </span>
              </div>

              {/* Material/Items */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                  <Package className="h-4 w-4" />
                  Item
                </span>
                <span className="dark:text-white">{purchaseOrder.materialName || 'Multi Items'}</span>
              </div>

              {/* Quantity */}
              {purchaseOrder.quantity && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Jumlah</span>
                  <span className="font-medium dark:text-white">
                    {purchaseOrder.quantity} {purchaseOrder.unit || 'pcs'}
                  </span>
                </div>
              )}

              {/* Total */}
              <div className="flex items-center justify-between pt-2 border-t dark:border-gray-700">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total</span>
                <span className="font-bold text-lg text-green-600 dark:text-green-400">
                  {new Intl.NumberFormat('id-ID', {
                    style: 'currency',
                    currency: 'IDR',
                    minimumFractionDigits: 0
                  }).format(purchaseOrder.totalCost || 0)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Warning */}
          <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg border border-yellow-200 dark:border-yellow-700">
            <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800 dark:text-yellow-200">
              <p className="font-medium">Perhatian:</p>
              <p>Pastikan barang sudah diterima dan sesuai dengan pesanan sebelum konfirmasi.</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 h-12 dark:border-gray-600 dark:text-white"
              disabled={isLoading}
            >
              Batal
            </Button>
            <Button
              onClick={handleReceive}
              className="flex-1 h-12 bg-green-600 hover:bg-green-700"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                  Memproses...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5 mr-2" />
                  Konfirmasi Terima
                </>
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
