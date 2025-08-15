"use client"
import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "./ui/use-toast"
import { Transaction } from "@/types/transaction"
import { useTransactions } from "@/hooks/useTransactions"
import { useAccounts } from "@/hooks/useAccounts"
import { useAuth } from "@/hooks/useAuth"
import { useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/integrations/supabase/client"
import { Wallet } from "lucide-react"

const paymentSchema = z.object({
  amount: z.coerce.number().min(1, "Jumlah pembayaran harus lebih dari 0."),
  paymentAccountId: z.string().min(1, "Akun pembayaran harus dipilih."),
  notes: z.string().optional(),
})

type PaymentFormData = z.infer<typeof paymentSchema>

interface PayReceivableDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: Transaction | null
}

export function PayReceivableDialog({ open, onOpenChange, transaction }: PayReceivableDialogProps) {
  const { toast } = useToast()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { accounts, updateAccountBalance } = useAccounts()
  const { register, handleSubmit, reset, setValue, formState: { errors }, watch } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
  })
  
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const remainingAmount = transaction ? transaction.total - (transaction.paidAmount || 0) : 0

  const onSubmit = async (data: PaymentFormData) => {
    if (!transaction || !user) return;
    if (data.amount > remainingAmount) {
      toast({ variant: "destructive", title: "Gagal", description: "Jumlah pembayaran melebihi sisa tagihan." });
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedAccount = accounts?.find(acc => acc.id === data.paymentAccountId);
      if (!selectedAccount) {
        throw new Error("Akun pembayaran tidak ditemukan");
      }
      
      // Calculate new payment amount
      const newPaidAmount = (transaction.paidAmount || 0) + data.amount;
      const newStatus = newPaidAmount >= transaction.total ? 'Lunas' : 'Belum Lunas';
      
      // Update transaction with payment
      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          paid_amount: newPaidAmount,
          payment_status: newStatus,
          payment_account_id: data.paymentAccountId
        })
        .eq('id', transaction.id);
      
      if (updateError) {
        throw new Error(updateError.message);
      }

      // Update account balance (increase cash)
      await updateAccountBalance.mutateAsync({ accountId: data.paymentAccountId, amount: data.amount });

      // Record payment in cash_history table (proper way to track cash flow)
      const paymentRecord = {
        account_id: data.paymentAccountId,
        transaction_type: 'income', // Pembayaran piutang adalah income
        amount: data.amount, // Jumlah positif karena cash bertambah
        description: `Pembayaran piutang dari ${transaction.customerName} - Order: ${transaction.id}${data.notes ? ' | ' + data.notes : ''}`,
        reference_number: transaction.id,
        source_type: 'receivable_payment',
        created_by: user.id,
        created_by_name: user.name || user.email || 'Unknown User'
      };

      // Insert payment record to cash_history
      const { error: paymentRecordError } = await supabase
        .from('cash_history')
        .insert(paymentRecord);

      if (paymentRecordError) {
        throw new Error(`Failed to record payment: ${paymentRecordError.message}`);
      }

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['cashier-recap'] });
      queryClient.invalidateQueries({ queryKey: ['cashFlow'] });

      toast({ 
        title: "Sukses", 
        description: `Pembayaran piutang sebesar ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(data.amount)} berhasil dicatat ke ${selectedAccount?.name}.` 
      });
      
      reset();
      onOpenChange(false);
    } catch (error) {
      toast({ 
        variant: "destructive", 
        title: "Gagal", 
        description: error instanceof Error ? error.message : "Terjadi kesalahan saat memproses pembayaran"
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bayar Piutang: {transaction?.customerName}</DialogTitle>
          <DialogDescription>
            No. Order: {transaction?.id}. Sisa tagihan: <strong className="text-destructive">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(remainingAmount)}</strong>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="py-4 space-y-4">
            <div>
              <Label htmlFor="amount">Jumlah Pembayaran</Label>
              <Input id="amount" type="number" {...register("amount")} />
              {errors.amount && <p className="text-sm text-destructive mt-1">{errors.amount.message}</p>}
            </div>
            <div>
              <Label htmlFor="paymentAccountId">Setor Ke Akun</Label>
              <Select onValueChange={(value) => setValue("paymentAccountId", value)}>
                <SelectTrigger><SelectValue placeholder="Pilih Akun..." /></SelectTrigger>
                <SelectContent>
                  {accounts?.filter(a => a.isPaymentAccount).map(acc => (
                    <SelectItem key={acc.id} value={acc.id}><Wallet className="inline-block mr-2 h-4 w-4" />{acc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.paymentAccountId && <p className="text-sm text-destructive mt-1">{errors.paymentAccountId.message}</p>}
            </div>
            <div>
              <Label htmlFor="notes">Catatan (Opsional)</Label>
              <Textarea 
                id="notes" 
                placeholder="Catatan tambahan untuk pembayaran ini..."
                {...register("notes")} 
                rows={2}
              />
              {errors.notes && <p className="text-sm text-destructive mt-1">{errors.notes.message}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Menyimpan..." : "Simpan Pembayaran"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}