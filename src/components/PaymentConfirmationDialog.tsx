"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
// Using native select for better compatibility with dialog
import { Label } from "@/components/ui/label"
import { PayrollRecord } from "@/types/payroll"
import { useAccounts } from "@/hooks/useAccounts"
import { DollarSign, User, Calendar, CreditCard, FileText } from "lucide-react"

interface PaymentConfirmationDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  payrollRecord: PayrollRecord | null
  onConfirm: (paymentAccountId: string) => void
  isProcessing: boolean
}

export function PaymentConfirmationDialog({
  isOpen,
  onOpenChange,
  payrollRecord,
  onConfirm,
  isProcessing
}: PaymentConfirmationDialogProps) {
  const { accounts } = useAccounts()
  const [selectedAccountId, setSelectedAccountId] = useState<string>("")

  // Filter only payment accounts (kas/bank)
  const paymentAccounts = accounts?.filter(acc => acc.isPaymentAccount) || []

  // Reset selected account when dialog opens - only once when dialog opens
  useEffect(() => {
    if (isOpen && paymentAccounts.length > 0) {
      // Only set default if no account is selected yet
      if (!selectedAccountId) {
        // If payroll has a payment account, use it as default
        if (payrollRecord?.paymentAccountId) {
          setSelectedAccountId(payrollRecord.paymentAccountId)
        } else {
          // Otherwise select first payment account
          setSelectedAccountId(paymentAccounts[0].id)
        }
      }
    }
    // Reset when dialog closes
    if (!isOpen) {
      setSelectedAccountId("")
    }
  }, [isOpen, paymentAccounts.length])

  const selectedAccount = accounts?.find(acc => acc.id === selectedAccountId)

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount)
  }

  if (!payrollRecord) return null

  const handleConfirm = () => {
    if (!selectedAccountId) return
    onConfirm(selectedAccountId)
  }

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

          {/* Payment Account Selection - Using Radio Buttons */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CreditCard className="h-4 w-4" />
              <span>Akun Pembayaran</span>
            </div>
            <div className="pl-6 space-y-2">
              {paymentAccounts.map((account) => (
                <label
                  key={account.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedAccountId === account.id
                      ? 'border-green-500 bg-green-50 dark:bg-green-950'
                      : 'border-input hover:bg-accent'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentAccount"
                    value={account.id}
                    checked={selectedAccountId === account.id}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="h-4 w-4 text-green-600"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-sm">
                      {account.code ? `${account.code} - ` : ''}{account.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Saldo: {formatCurrency(account.balance || 0)}
                    </p>
                  </div>
                </label>
              ))}
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
            onClick={handleConfirm}
            disabled={isProcessing || !selectedAccountId}
            className="bg-green-600 hover:bg-green-700"
          >
            {isProcessing ? "Memproses..." : "Setujui & Bayar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
