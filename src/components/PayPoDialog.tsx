"use client"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "./ui/use-toast"
import { PurchaseOrder } from "@/types/purchaseOrder"
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders"
import { useAccounts } from "@/hooks/useAccounts"
import { Wallet } from "lucide-react"

const paymentSchema = z.object({
  totalCost: z.coerce.number().min(1, "Total biaya harus diisi."),
  paymentAccountId: z.string().min(1, "Akun pembayaran harus dipilih."),
})

type PaymentFormData = z.infer<typeof paymentSchema>

interface PayPoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  purchaseOrder: PurchaseOrder | null
}

export function PayPoDialog({ open, onOpenChange, purchaseOrder }: PayPoDialogProps) {
  const { toast } = useToast()
  const { payPurchaseOrder } = usePurchaseOrders()
  const { accounts } = useAccounts()
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
  })

  const onSubmit = (data: PaymentFormData) => {
    if (!purchaseOrder) return;

    payPurchaseOrder.mutate({
      poId: purchaseOrder.id,
      totalCost: data.totalCost,
      paymentAccountId: data.paymentAccountId,
    }, {
      onSuccess: () => {
        toast({ title: "Sukses", description: "Pembayaran PO berhasil dicatat." })
        reset()
        onOpenChange(false)
      },
      onError: (error) => {
        toast({ variant: "destructive", title: "Gagal", description: error.message })
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bayar Purchase Order</DialogTitle>
          <DialogDescription>
            Catat pembayaran untuk PO #{purchaseOrder?.id} ({purchaseOrder?.materialName}). Ini akan membuat catatan pengeluaran baru.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="py-4 space-y-4">
            <div>
              <Label htmlFor="totalCost">Total Biaya Pembelian (Rp)</Label>
              <Input id="totalCost" type="number" {...register("totalCost")} />
              {errors.totalCost && <p className="text-sm text-destructive mt-1">{errors.totalCost.message}</p>}
            </div>
            <div>
              <Label htmlFor="paymentAccountId">Bayar Dari Akun</Label>
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
          </div>
          <DialogFooter>
            <Button type="submit" disabled={payPurchaseOrder.isPending}>
              {payPurchaseOrder.isPending ? "Menyimpan..." : "Simpan Pembayaran"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}