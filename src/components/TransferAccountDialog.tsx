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
import { ArrowRightLeft } from "lucide-react"

const transferSchema = z.object({
  fromAccountId: z.string().min(1, "Pilih akun asal"),
  toAccountId: z.string().min(1, "Pilih akun tujuan"),
  amount: z.coerce.number().min(1, "Jumlah harus lebih dari 0"),
  description: z.string().min(3, "Keterangan minimal 3 karakter"),
}).refine((data) => data.fromAccountId !== data.toAccountId, {
  message: "Akun asal dan tujuan tidak boleh sama",
  path: ["toAccountId"],
})

type TransferFormData = z.infer<typeof transferSchema>

interface TransferAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TransferAccountDialog({ open, onOpenChange }: TransferAccountDialogProps) {
  const { accounts, updateAccountBalance } = useAccounts()
  const { toast } = useToast()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<TransferFormData>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      fromAccountId: '',
      toAccountId: '',
      amount: 0,
      description: '',
    }
  })

  const fromAccountId = watch('fromAccountId')
  const toAccountId = watch('toAccountId')
  const amount = watch('amount')
  
  const fromAccount = accounts?.find(acc => acc.id === fromAccountId)
  const toAccount = accounts?.find(acc => acc.id === toAccountId)

  const onSubmit = async (data: TransferFormData) => {
    if (!user) {
      toast({ variant: "destructive", title: "Error", description: "User tidak ditemukan" })
      return
    }

    if (!fromAccount || !toAccount) {
      toast({ variant: "destructive", title: "Error", description: "Akun tidak ditemukan" })
      return
    }

    // Check if sufficient balance
    if (fromAccount.balance < data.amount) {
      toast({ 
        variant: "destructive", 
        title: "Saldo Tidak Cukup", 
        description: `Saldo akun ${fromAccount.name} tidak mencukupi. Saldo saat ini: ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(fromAccount.balance)}`
      })
      return
    }
    
    try {
      // Deduct from source account
      await updateAccountBalance.mutateAsync({
        accountId: data.fromAccountId,
        amount: -data.amount
      })

      // Add to destination account  
      await updateAccountBalance.mutateAsync({
        accountId: data.toAccountId,
        amount: data.amount
      })

      // Generate unique reference for this transfer
      const transferRef = `TRANSFER-${Date.now()}`;

      // Record outbound cash history for source account (expense for this account)
      const { error: outboundError } = await supabase
        .from('cash_history')
        .insert({
          account_id: data.fromAccountId,
          transaction_type: 'expense', // Transfer keluar adalah expense
          amount: data.amount,
          description: `Transfer ke ${toAccount.name}: ${data.description}`,
          reference_number: transferRef,
          source_type: 'transfer_keluar',
          created_by: user.id,
          created_by_name: user.name || user.email || "Unknown User"
        })

      if (outboundError) {
        throw new Error(`Failed to record outbound transfer: ${outboundError.message}`)
      }

      // Record inbound cash history for destination account (income for this account)
      const { error: inboundError } = await supabase
        .from('cash_history')
        .insert({
          account_id: data.toAccountId,
          transaction_type: 'income', // Transfer masuk adalah income
          amount: data.amount,
          description: `Transfer dari ${fromAccount.name}: ${data.description}`,
          reference_number: transferRef,
          source_type: 'transfer_masuk',
          created_by: user.id,
          created_by_name: user.name || user.email || "Unknown User"
        })

      if (inboundError) {
        throw new Error(`Failed to record inbound transfer: ${inboundError.message}`)
      }
      
      // Invalidate cash flow queries
      queryClient.invalidateQueries({ queryKey: ['cashFlow'] })
      queryClient.invalidateQueries({ queryKey: ['cashBalance'] })
      
      toast({ 
        title: "Transfer Berhasil", 
        description: `Transfer ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(data.amount)} dari ${fromAccount.name} ke ${toAccount.name} berhasil.`
      })
      
      reset()
      onOpenChange(false)
    } catch (error) {
      toast({ 
        variant: "destructive", 
        title: "Transfer Gagal", 
        description: error instanceof Error ? error.message : "Terjadi kesalahan saat transfer"
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-blue-600" />
            Transfer Antar Akun
          </DialogTitle>
          <DialogDescription>
            Transfer dana dari satu akun ke akun lainnya
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fromAccountId">Dari Akun</Label>
              <Select onValueChange={(value) => setValue("fromAccountId", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih akun asal..." />
                </SelectTrigger>
                <SelectContent>
                  {accounts?.map(account => (
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
              {errors.fromAccountId && <p className="text-sm text-destructive">{errors.fromAccountId.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="toAccountId">Ke Akun</Label>
              <Select onValueChange={(value) => setValue("toAccountId", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih akun tujuan..." />
                </SelectTrigger>
                <SelectContent>
                  {accounts?.filter(acc => acc.id !== fromAccountId).map(account => (
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
              {errors.toAccountId && <p className="text-sm text-destructive">{errors.toAccountId.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Jumlah Transfer (Rp)</Label>
            <Input
              id="amount"
              type="number"
              min="1"
              step="1"
              placeholder="Masukkan jumlah transfer..."
              {...register("amount")}
            />
            {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
            {fromAccount && amount > 0 && amount > fromAccount.balance && (
              <p className="text-sm text-destructive">
                Saldo tidak cukup. Maksimal: {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(fromAccount.balance)}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Keterangan Transfer</Label>
            <Textarea
              id="description"
              placeholder="Misal: Penyesuaian saldo, modal kerja, dll"
              rows={3}
              {...register("description")}
            />
            {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
          </div>

          {fromAccount && toAccount && amount > 0 && (
            <div className="p-3 bg-muted rounded-lg space-y-2">
              <h4 className="font-medium text-sm">Preview Transfer:</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Dari: {fromAccount.name}</p>
                  <p>Saldo saat ini: {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(fromAccount.balance)}</p>
                  <p className="text-red-600">Saldo setelah: {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(fromAccount.balance - amount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Ke: {toAccount.name}</p>
                  <p>Saldo saat ini: {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(toAccount.balance)}</p>
                  <p className="text-green-600">Saldo setelah: {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(toAccount.balance + amount)}</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button 
              type="submit" 
              disabled={updateAccountBalance.isPending || (fromAccount && amount > fromAccount.balance)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {updateAccountBalance.isPending ? "Memproses..." : "Transfer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}