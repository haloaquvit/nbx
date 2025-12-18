"use client"

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { PayrollRecord } from "@/types/payroll"
import { DollarSign, User, Calendar, CreditCard, FileText } from "lucide-react"

interface PaymentConfirmationDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  payrollRecord: PayrollRecord | null
  onConfirm: () => void
  isProcessing: boolean
}

export function PaymentConfirmationDialog({
  isOpen,
  onOpenChange,
  payrollRecord,
  onConfirm,
  isProcessing
}: PaymentConfirmationDialogProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(date)
  }

  if (!payrollRecord) return null

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-600" />
            Konfirmasi Pembayaran Gaji
          </DialogTitle>
          <DialogDescription>
            Pastikan informasi pembayaran berikut sudah benar
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Employee Info */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span>Karyawan</span>
            </div>
            <div className="pl-6">
              <p className="font-semibold">{payrollRecord.employeeName}</p>
              <p className="text-sm text-muted-foreground">{payrollRecord.employeeRole}</p>
            </div>
          </div>

          <Separator />

          {/* Period Info */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Periode</span>
            </div>
            <div className="pl-6">
              <p className="font-medium">{payrollRecord.periodDisplay}</p>
            </div>
          </div>

          <Separator />

          {/* Payment Details */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span>Rincian Gaji</span>
            </div>
            <div className="pl-6 space-y-1">
              <div className="flex justify-between text-sm">
                <span>Gaji Pokok:</span>
                <span>{formatCurrency(payrollRecord.baseSalaryAmount)}</span>
              </div>
              {payrollRecord.commissionAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Komisi:</span>
                  <span className="text-green-600">{formatCurrency(payrollRecord.commissionAmount)}</span>
                </div>
              )}
              {payrollRecord.bonusAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Bonus:</span>
                  <span className="text-green-600">{formatCurrency(payrollRecord.bonusAmount)}</span>
                </div>
              )}
              {payrollRecord.deductionAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Potongan:</span>
                  <span className="text-red-600">({formatCurrency(payrollRecord.deductionAmount)})</span>
                </div>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between font-bold text-base">
                <span>Total Dibayar:</span>
                <span className="text-green-600">{formatCurrency(payrollRecord.netSalary)}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Payment Account */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CreditCard className="h-4 w-4" />
              <span>Akun Pembayaran</span>
            </div>
            <div className="pl-6">
              <p className="font-medium">{payrollRecord.paymentAccountName || 'Akun Kas'}</p>
            </div>
          </div>

          {/* Warning */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm text-amber-800">
              ⚠️ Setelah dikonfirmasi, pembayaran akan diproses dan saldo akun akan berkurang.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
          >
            Batal
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isProcessing}
            className="bg-green-600 hover:bg-green-700"
          >
            {isProcessing ? "Memproses..." : "Setujui & Bayar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
