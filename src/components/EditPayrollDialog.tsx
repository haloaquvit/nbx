"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAccounts } from "@/hooks/useAccounts"
import { usePayrollRecords } from "@/hooks/usePayroll"
import { PayrollRecord } from "@/types/payroll"
import { CreditCard } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

interface EditPayrollDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  payrollRecord: PayrollRecord | null
}

export function EditPayrollDialog({
  isOpen,
  onOpenChange,
  payrollRecord
}: EditPayrollDialogProps) {
  const { toast } = useToast()
  const { accounts } = useAccounts()
  const { updatePayrollRecord } = usePayrollRecords({})

  const [bonusAmount, setBonusAmount] = useState(0)
  const [deductionAmount, setDeductionAmount] = useState(0)
  const [paymentAccountId, setPaymentAccountId] = useState<string>("")
  const [notes, setNotes] = useState("")
  const [isUpdating, setIsUpdating] = useState(false)

  // Get payment accounts (accounts with isPaymentAccount = true)
  const cashAccounts = accounts?.filter(acc => acc.isPaymentAccount === true)

  // Initialize form with payroll record data
  useEffect(() => {
    if (payrollRecord) {
      setBonusAmount(payrollRecord.bonusAmount || 0)
      setDeductionAmount(payrollRecord.deductionAmount || 0)
      setPaymentAccountId(payrollRecord.paymentAccountId || "")
      setNotes(payrollRecord.notes || "")
    }
  }, [payrollRecord])

  const handleUpdate = async () => {
    if (!payrollRecord) return

    setIsUpdating(true)
    try {
      await updatePayrollRecord.mutateAsync({
        id: payrollRecord.id,
        data: {
          bonusAmount,
          deductionAmount,
          paymentAccountId,
          notes
        }
      })

      toast({
        title: "Sukses",
        description: "Record payroll berhasil diperbarui"
      })

      // Wait a bit for the query to be invalidated and refetched
      setTimeout(() => {
        onOpenChange(false)
      }, 500)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Gagal memperbarui record payroll"
      })
      setIsUpdating(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount)
  }

  if (!payrollRecord) return null

  const baseSal = payrollRecord.baseSalaryAmount || 0
  const commission = payrollRecord.commissionAmount || 0
  const recalculatedGross = baseSal + commission + bonusAmount
  const recalculatedNet = recalculatedGross - deductionAmount

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Record Payroll - {payrollRecord.employeeName}</DialogTitle>
          <DialogDescription>
            {payrollRecord.periodDisplay}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Read-only fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Gaji Pokok (Read-only)</Label>
              <Input
                value={formatCurrency(baseSal)}
                disabled
                className="bg-gray-50"
              />
            </div>
            <div className="space-y-2">
              <Label>Komisi (Read-only)</Label>
              <Input
                value={formatCurrency(commission)}
                disabled
                className="bg-gray-50"
              />
            </div>
          </div>

          {/* Editable fields */}
          <div className="space-y-2">
            <Label htmlFor="bonusAmount">Bonus Tambahan</Label>
            <Input
              id="bonusAmount"
              type="number"
              value={bonusAmount}
              onChange={(e) => setBonusAmount(Number(e.target.value) || 0)}
              placeholder="0"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="deductionAmount">Potongan</Label>
            <Input
              id="deductionAmount"
              type="number"
              value={deductionAmount}
              onChange={(e) => setDeductionAmount(Number(e.target.value) || 0)}
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground">
              Sisa Panjar: {formatCurrency(payrollRecord.outstandingAdvances || 0)}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Akun Pembayaran</Label>
            <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih akun pembayaran..." />
              </SelectTrigger>
              <SelectContent>
                {cashAccounts?.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      <span>{account.name}</span>
                      <span className="text-muted-foreground">({formatCurrency(account.balance)})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Catatan</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan tambahan..."
              rows={3}
            />
          </div>

          {/* Summary */}
          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between">
              <span className="font-medium">Gaji Kotor:</span>
              <span>{formatCurrency(recalculatedGross)}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Potongan:</span>
              <span className="text-red-600">({formatCurrency(deductionAmount)})</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t pt-2">
              <span>Gaji Bersih:</span>
              <span className="text-primary">{formatCurrency(recalculatedNet)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            onClick={handleUpdate}
            disabled={isUpdating || !paymentAccountId}
          >
            {isUpdating ? "Memperbarui..." : "Simpan Perubahan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
