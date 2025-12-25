"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Transaction } from "@/types/transaction"
import { safeFormatDate } from "@/utils/officeTime"
import { Printer, Check, FileDown, X } from "lucide-react"
import { PrintReceiptDialog } from "@/components/PrintReceiptDialog"

interface DriverPrintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: Transaction
  onComplete: () => void
}

export function DriverPrintDialog({
  open,
  onOpenChange,
  transaction,
  onComplete
}: DriverPrintDialogProps) {
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [printTemplate, setPrintTemplate] = useState<'receipt' | 'invoice'>('receipt')

  const handlePrintReceipt = () => {
    setPrintTemplate('receipt')
    setPrintDialogOpen(true)
  }

  const handlePrintInvoice = () => {
    setPrintTemplate('invoice')
    setPrintDialogOpen(true)
  }

  const handleComplete = () => {
    onComplete()
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <Check className="h-5 w-5" />
              Transaksi Berhasil!
            </DialogTitle>
            <DialogDescription>
              Transaksi dan pengantaran berhasil dibuat
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Transaction Summary */}
            <Card className="bg-green-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-green-700">
                  Ringkasan Transaksi
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>No. Transaksi:</span>
                  <span className="font-medium">{transaction.id}</span>
                </div>
                <div className="flex justify-between">
                  <span>Pelanggan:</span>
                  <span className="font-medium">{transaction.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tanggal:</span>
                  <span className="font-medium">
                    {safeFormatDate(transaction.orderDate)}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span>Total:</span>
                  <span className="font-bold text-green-600">
                    {new Intl.NumberFormat("id-ID", {
                      style: "currency",
                      currency: "IDR",
                      minimumFractionDigits: 0
                    }).format(transaction.total)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Status:</span>
                  <span className="font-medium text-blue-600">
                    {transaction.paymentStatus} • Siap Diantar
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Print Options */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Printer className="h-4 w-4" />
                  Pilihan Cetak
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button 
                  onClick={handlePrintReceipt}
                  className="w-full justify-start"
                  variant="outline"
                >
                  <FileDown className="h-4 w-4 mr-2" />
                  Cetak Nota (Thermal/Struk)
                </Button>
                <Button
                  onClick={handlePrintInvoice}
                  className="w-full justify-start"
                  variant="outline"
                >
                  <FileDown className="h-4 w-4 mr-2" />
                  Cetak Faktur (A4)
                </Button>
              </CardContent>
            </Card>

            {/* Success Message */}
            <div className="bg-blue-50 p-4 rounded-lg text-center">
              <Check className="h-8 w-8 text-blue-600 mx-auto mb-2" />
              <p className="text-sm text-blue-800 font-medium">
                Pesanan berhasil dibuat dan siap diantar!
              </p>
              <p className="text-xs text-blue-600 mt-1">
                Data pengantaran telah tercatat dalam sistem
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              onClick={handleComplete}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              <Check className="h-4 w-4 mr-2" />
              Selesai
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Receipt Dialog */}
      <PrintReceiptDialog
        open={printDialogOpen}
        onOpenChange={setPrintDialogOpen}
        transaction={transaction}
        template={printTemplate}
      />
    </>
  )
}