"use client"
import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "./ui/use-toast"
import { EmployeeAdvance } from "@/types/employeeAdvance"
import { useEmployeeAdvances } from "@/hooks/useEmployeeAdvances"
import { useAccounts } from "@/hooks/useAccounts"
import { useAuth } from "@/hooks/useAuth"
import { useTimezone } from "@/contexts/TimezoneContext"
import { getOfficeTime } from "@/utils/officeTime"
import { CreditCard } from "lucide-react"

const repaymentSchema = z.object({
  amount: z.coerce.number().min(1, "Jumlah pembayaran harus lebih dari 0."),
})

type RepaymentFormData = z.infer<typeof repaymentSchema>

interface RepayAdvanceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  advance: EmployeeAdvance | null
}

export function RepayAdvanceDialog({ open, onOpenChange, advance }: RepayAdvanceDialogProps) {
  const { toast } = useToast()
  const { timezone } = useTimezone()
  const { user } = useAuth()
  const { addRepayment } = useEmployeeAdvances()
  const { accounts } = useAccounts()
  const [selectedAccountId, setSelectedAccountId] = useState<string>("")

  const { register, handleSubmit, reset, formState: { errors } } = useForm<RepaymentFormData>({
    resolver: zodResolver(repaymentSchema),
  })

  // Filter payment accounts (kas/bank)
  const paymentAccounts = accounts?.filter(acc => acc.isPaymentAccount) || []

  // Set default account when dialog opens
  useEffect(() => {
    if (open && paymentAccounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(paymentAccounts[0].id)
    }
    if (!open) {
      setSelectedAccountId("")
    }
  }, [open, paymentAccounts.length])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount)
  }

  const onSubmit = (data: RepaymentFormData) => {
    if (!advance || !user) return;
    if (data.amount > advance.remainingAmount) {
      toast({ variant: "destructive", title: "Gagal", description: "Jumlah pembayaran melebihi sisa utang." });
      return;
    }
    if (!selectedAccountId) {
      toast({ variant: "destructive", title: "Gagal", description: "Pilih akun pembayaran terlebih dahulu." });
      return;
    }

    addRepayment.mutate({
      advanceId: advance.id,
      repaymentData: {
        amount: data.amount,
        date: getOfficeTime(timezone),
        recordedBy: user.name,
      },
      accountId: selectedAccountId,
    }, {
      onSuccess: () => {
        toast({ title: "Sukses", description: "Pembayaran cicilan berhasil dicatat." })
        reset()
        setSelectedAccountId("")
        onOpenChange(false)
      },
      onError: (error) => {
        toast({ variant: "destructive", title: "Gagal", description: error.message })
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bayar Cicilan Panjar: {advance?.employeeName}</DialogTitle>
          <DialogDescription>
            Sisa utang saat ini: <strong className="text-destructive">{formatCurrency(advance?.remainingAmount || 0)}</strong>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4 py-4">
            {/* Jumlah Pembayaran */}
            <div className="space-y-2">
              <Label htmlFor="amount">Jumlah Pembayaran</Label>
              <Input id="amount" type="number" {...register("amount")} />
              {errors.amount && <p className="text-sm text-destructive mt-1">{errors.amount.message}</p>}
            </div>

            {/* Akun Pembayaran */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CreditCard className="h-4 w-4" />
                <span>Akun Pembayaran</span>
              </div>
              <div className="space-y-2">
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
                {paymentAccounts.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    Tidak ada akun pembayaran tersedia
                  </p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={addRepayment.isPending || !selectedAccountId}>
              {addRepayment.isPending ? "Menyimpan..." : "Simpan Pembayaran"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
