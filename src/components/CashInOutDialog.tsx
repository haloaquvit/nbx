"use client"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
import { TrendingUp, TrendingDown } from "lucide-react"
import { createManualCashInJournal, createManualCashOutJournal } from "@/services/journalService"
import { useState } from "react"

// ============================================================================
// CATATAN PENTING: DOUBLE-ENTRY ACCOUNTING SYSTEM
// ============================================================================
// Semua saldo akun HANYA dihitung dari journal_entries (tidak ada updateAccountBalance)
// cash_history digunakan HANYA untuk Buku Kas Harian (monitoring), TIDAK update balance
// Kas manual menggunakan createManualCashInJournal / createManualCashOutJournal
// ============================================================================

const cashTransactionSchema = z.object({
  accountId: z.string().min(1, "Pilih akun terlebih dahulu"),
  amount: z.coerce.number().min(1, "Jumlah harus lebih dari 0"),
  description: z.string().min(3, "Keterangan minimal 3 karakter"),
})

type CashTransactionFormData = z.infer<typeof cashTransactionSchema>

interface CashInOutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: "in" | "out"
  title: string
  description: string
}

export function CashInOutDialog({ open, onOpenChange, type, title, description }: CashInOutDialogProps) {
  const { accounts } = useAccounts()
  const { toast } = useToast()
  const { user } = useAuth()
  const { currentBranch } = useBranch()
  const queryClient = useQueryClient()
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<CashTransactionFormData>({
    resolver: zodResolver(cashTransactionSchema),
    defaultValues: {
      accountId: '',
      amount: 0,
      description: '',
    }
  })

  const selectedAccountId = watch('accountId')
  const selectedAccount = accounts?.find(acc => acc.id === selectedAccountId)

  const onSubmit = async (data: CashTransactionFormData) => {
    if (!user) {
      toast({ variant: "destructive", title: "Error", description: "User tidak ditemukan" })
      return
    }

    if (!selectedAccount) {
      toast({ variant: "destructive", title: "Error", description: "Akun tidak ditemukan" })
      return
    }

    if (!currentBranch?.id) {
      toast({ variant: "destructive", title: "Error", description: "Branch tidak ditemukan" })
      return
    }

    setIsSubmitting(true)

    try {
      const referenceId = `MANUAL-${Date.now()}`;

      // ============================================================================
      // BALANCE UPDATE VIA JURNAL - TIDAK LAGI updateAccountBalance
      // ============================================================================
      // Jurnal otomatis untuk kas masuk/keluar:
      // Kas Masuk: Dr. Kas, Cr. Pendapatan Lain-lain
      // Kas Keluar: Dr. Beban Lain-lain, Cr. Kas
      // ============================================================================
      let journalResult;
      if (type === "in") {
        journalResult = await createManualCashInJournal({
          referenceId,
          transactionDate: new Date(),
          amount: data.amount,
          description: data.description,
          cashAccountId: selectedAccount.id,
          cashAccountCode: selectedAccount.code || '',
          cashAccountName: selectedAccount.name,
          branchId: currentBranch.id,
        });
      } else {
        journalResult = await createManualCashOutJournal({
          referenceId,
          transactionDate: new Date(),
          amount: data.amount,
          description: data.description,
          cashAccountId: selectedAccount.id,
          cashAccountCode: selectedAccount.code || '',
          cashAccountName: selectedAccount.name,
          branchId: currentBranch.id,
        });
      }

      if (!journalResult.success) {
        throw new Error(journalResult.error || 'Gagal membuat jurnal kas');
      }

      console.log(`✅ Jurnal kas ${type} auto-generated:`, journalResult.journalId);

      // Record in cash_history for monitoring (TIDAK update balance)
      try {
        await supabase.from('cash_history').insert({
          account_id: data.accountId,
          transaction_type: type === "in" ? "income" : "expense",
          type: type === "in" ? "kas_masuk_manual" : "kas_keluar_manual",
          amount: data.amount,
          description: data.description,
          reference_number: referenceId,
          created_by: user.id,
          created_by_name: user.name || user.email || "Unknown User",
          source_type: 'manual',
          branch_id: currentBranch.id,
        });
      } catch (historyError) {
        console.warn('cash_history recording failed (non-critical):', historyError);
      }

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['cashFlow'] })
      queryClient.invalidateQueries({ queryKey: ['cashBalance'] })
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] })

      toast({
        title: "Sukses",
        description: `${title} sebesar ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(data.amount)} berhasil dicatat.`
      })

      reset()
      onOpenChange(false)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Gagal",
        description: error instanceof Error ? error.message : "Terjadi kesalahan"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const cashAccounts = accounts?.filter(acc => 
    acc.type === 'Aset' && (
      acc.name.toLowerCase().includes('kas') || 
      acc.name.toLowerCase().includes('cash') ||
      acc.isPaymentAccount
    )
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {type === "in" ? 
              <TrendingUp className="h-5 w-5 text-green-600" /> : 
              <TrendingDown className="h-5 w-5 text-red-600" />
            }
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="accountId">Akun</Label>
            <Select onValueChange={(value) => setValue("accountId", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih akun kas..." />
              </SelectTrigger>
              <SelectContent>
                {cashAccounts?.map(account => (
                  <SelectItem key={account.id} value={account.id}>
                    <div className="flex flex-col">
                      <span className="font-medium">{account.name}</span>
                      <span className="text-sm text-muted-foreground">
                        Saldo: {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(account.balance)}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.accountId && <p className="text-sm text-destructive">{errors.accountId.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Jumlah (Rp)</Label>
            <Input
              id="amount"
              type="number"
              min="1"
              step="1"
              placeholder="Masukkan jumlah..."
              {...register("amount")}
            />
            {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Keterangan</Label>
            <Textarea
              id="description"
              placeholder={type === "in" ? "Misal: Penjualan tunai, komisi, dll" : "Misal: Operasional, pembelian, dll"}
              rows={3}
              {...register("description")}
            />
            {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
          </div>

          {selectedAccount && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Akun dipilih: {selectedAccount.name}</p>
              <p className="text-sm font-medium">
                Saldo saat ini: {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(selectedAccount.balance)}
              </p>
              {watch('amount') > 0 && (
                <p className="text-sm font-medium mt-1">
                  Saldo setelah {type === "in" ? "kas masuk" : "kas keluar"}: {" "}
                  <span className={type === "in" ? "text-green-600" : "text-red-600"}>
                    {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(
                      selectedAccount.balance + (type === "in" ? watch('amount') : -watch('amount'))
                    )}
                  </span>
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className={type === "in" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
            >
              {isSubmitting ? "Menyimpan..." : `Simpan ${title}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}