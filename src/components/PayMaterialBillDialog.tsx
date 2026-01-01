"use client"
import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAccounts } from "@/hooks/useAccounts"
import { useToast } from "./ui/use-toast"
import { useAuth } from "@/hooks/useAuth"
import { supabase } from "@/integrations/supabase/client"
import { useQueryClient } from "@tanstack/react-query"
import { useBranch } from "@/contexts/BranchContext"
import { CreditCard, Wallet, AlertCircle } from "lucide-react"
import { createMaterialPaymentJournal } from "@/services/journalService"
import { Material } from "@/types/material"
import { format } from "date-fns"
import { id as idLocale } from "date-fns/locale/id"

const paymentSchema = z.object({
  accountId: z.string().min(1, "Pilih akun kas terlebih dahulu"),
  amount: z.coerce.number().min(1, "Jumlah harus lebih dari 0"),
  notes: z.string().optional(),
})

type PaymentFormData = z.infer<typeof paymentSchema>

interface PayMaterialBillDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  material: Material
  unpaidAmount: number
  periodLabel?: string
  onSuccess?: () => void
}

export function PayMaterialBillDialog({
  open,
  onOpenChange,
  material,
  unpaidAmount,
  periodLabel,
  onSuccess
}: PayMaterialBillDialogProps) {
  const { accounts, getEmployeeCashAccount } = useAccounts()
  const { toast } = useToast()
  const { user } = useAuth()
  const { currentBranch } = useBranch()
  const queryClient = useQueryClient()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      accountId: '',
      amount: unpaidAmount,
      notes: '',
    }
  })

  const selectedAccountId = watch('accountId')
  const selectedAccount = accounts?.find(acc => acc.id === selectedAccountId)
  const paymentAmount = watch('amount')

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      reset({
        accountId: '',
        amount: unpaidAmount,
        notes: '',
      })

      // Auto-select cash account based on logged-in user
      if (user?.id && accounts && accounts.length > 0) {
        const employeeCashAccount = getEmployeeCashAccount(user.id)
        if (employeeCashAccount) {
          setValue("accountId", employeeCashAccount.id)
        }
      }
    }
  }, [open, unpaidAmount, user?.id, accounts, reset, setValue, getEmployeeCashAccount])

  const onSubmit = async (data: PaymentFormData) => {
    if (!user) {
      toast({ variant: "destructive", title: "Error", description: "User tidak ditemukan" })
      return
    }

    if (!selectedAccount) {
      toast({ variant: "destructive", title: "Error", description: "Akun kas tidak ditemukan" })
      return
    }

    if (!currentBranch?.id) {
      toast({ variant: "destructive", title: "Error", description: "Branch tidak ditemukan" })
      return
    }

    if (data.amount > selectedAccount.balance) {
      toast({
        variant: "destructive",
        title: "Saldo Tidak Cukup",
        description: `Saldo ${selectedAccount.name} tidak mencukupi untuk pembayaran ini.`
      })
      return
    }

    setIsSubmitting(true)

    try {
      const referenceId = `MATPAY-${material.id.slice(0, 8)}-${Date.now()}`
      const description = `Pembayaran tagihan ${material.name}${periodLabel ? ` (${periodLabel})` : ''}`

      // Create journal entry for material payment
      // Dr. Beban Bahan Baku / Beban Operasional
      // Cr. Kas
      const journalResult = await createMaterialPaymentJournal({
        referenceId,
        transactionDate: new Date(),
        amount: data.amount,
        materialId: material.id,
        materialName: material.name,
        description: data.notes || description,
        cashAccountId: selectedAccount.id,
        cashAccountCode: selectedAccount.code || '',
        cashAccountName: selectedAccount.name,
        branchId: currentBranch.id,
      })

      if (!journalResult.success) {
        throw new Error(journalResult.error || 'Gagal membuat jurnal pembayaran')
      }

      console.log(`✅ Jurnal pembayaran bahan ${material.name} auto-generated:`, journalResult.journalId)

      // Record payment in material_payments table
      const { error: paymentError } = await supabase
        .from('material_payments')
        .insert({
          material_id: material.id,
          amount: data.amount,
          payment_date: new Date().toISOString(),
          cash_account_id: selectedAccount.id,
          notes: data.notes || description,
          journal_entry_id: journalResult.journalId,
          created_by: user.id,
          created_by_name: user.name || user.email || 'Unknown',
          branch_id: currentBranch.id,
        })

      if (paymentError) {
        console.warn('material_payments recording failed:', paymentError)
        // Continue anyway - journal is the source of truth
      }

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['materials'] })
      queryClient.invalidateQueries({ queryKey: ['materialPayments'] })
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] })

      toast({
        title: "Pembayaran Berhasil",
        description: `Pembayaran tagihan ${material.name} sebesar ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(data.amount)} berhasil dicatat.`
      })

      reset()
      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      console.error('Payment error:', error)
      toast({
        variant: "destructive",
        title: "Gagal",
        description: error instanceof Error ? error.message : "Terjadi kesalahan saat memproses pembayaran"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Filter cash accounts
  const cashAccounts = accounts?.filter(acc => {
    const isCashAccount = acc.type === 'Aset' && (
      acc.name.toLowerCase().includes('kas') ||
      acc.name.toLowerCase().includes('cash') ||
      acc.isPaymentAccount
    )
    if (!isCashAccount) return false
    if (!acc.employeeId) return true
    if (acc.employeeId === user?.id) return true
    return false
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-blue-600" />
            Bayar Tagihan Bahan
          </DialogTitle>
          <DialogDescription>
            Pembayaran tagihan untuk bahan konsumsi: <strong>{material.name}</strong>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Bill Summary */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-amber-900">Ringkasan Tagihan</h4>
                <div className="mt-2 space-y-1 text-sm text-amber-800">
                  <div className="flex justify-between">
                    <span>Bahan:</span>
                    <span className="font-medium">{material.name}</span>
                  </div>
                  {periodLabel && (
                    <div className="flex justify-between">
                      <span>Periode:</span>
                      <span>{periodLabel}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Harga per {material.unit}:</span>
                    <span>{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(material.pricePerUnit)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-amber-300">
                    <span className="font-semibold">Total Tagihan:</span>
                    <span className="font-bold text-amber-900">
                      {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(unpaidAmount)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Cash Account Selection */}
          <div className="space-y-2">
            <Label htmlFor="accountId">Bayar dari Akun</Label>
            <Select
              value={selectedAccountId || ""}
              onValueChange={(value) => setValue("accountId", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih akun kas..." />
              </SelectTrigger>
              <SelectContent>
                {cashAccounts?.map(account => {
                  const isMyAccount = account.employeeId === user?.id
                  const hasEnoughBalance = account.balance >= unpaidAmount
                  return (
                    <SelectItem key={account.id} value={account.id}>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {account.name}
                          {isMyAccount && <span className="text-green-600 font-medium ml-2">(Kas Saya)</span>}
                        </span>
                        <span className={`text-sm ${hasEnoughBalance ? 'text-muted-foreground' : 'text-red-500'}`}>
                          Saldo: {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(account.balance)}
                          {!hasEnoughBalance && ' - Tidak cukup'}
                        </span>
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            {errors.accountId && <p className="text-sm text-destructive">{errors.accountId.message}</p>}
          </div>

          {/* Payment Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Jumlah Pembayaran (Rp)</Label>
            <Input
              id="amount"
              type="number"
              min="1"
              max={unpaidAmount}
              step="1"
              placeholder="Masukkan jumlah..."
              {...register("amount")}
            />
            {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
            {paymentAmount > 0 && paymentAmount < unpaidAmount && (
              <p className="text-sm text-amber-600">
                Pembayaran sebagian. Sisa: {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(unpaidAmount - paymentAmount)}
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Catatan (Opsional)</Label>
            <Textarea
              id="notes"
              placeholder="Catatan tambahan untuk pembayaran ini..."
              rows={2}
              {...register("notes")}
            />
          </div>

          {/* Account Summary */}
          {selectedAccount && (
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{selectedAccount.name}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Saldo saat ini:</span>
                  <p className="font-medium">
                    {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(selectedAccount.balance)}
                  </p>
                </div>
                {paymentAmount > 0 && (
                  <div>
                    <span className="text-muted-foreground">Saldo setelah bayar:</span>
                    <p className={`font-medium ${selectedAccount.balance - paymentAmount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(selectedAccount.balance - paymentAmount)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !selectedAccount || paymentAmount <= 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSubmitting ? "Memproses..." : "Bayar Tagihan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
