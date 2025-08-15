"use client"
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
import { useAuth } from "@/hooks/useAuth"

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
  const { user } = useAuth()
  const { addRepayment } = useEmployeeAdvances()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<RepaymentFormData>({
    resolver: zodResolver(repaymentSchema),
  })

  const onSubmit = (data: RepaymentFormData) => {
    if (!advance || !user) return;
    if (data.amount > advance.remainingAmount) {
      toast({ variant: "destructive", title: "Gagal", description: "Jumlah pembayaran melebihi sisa utang." });
      return;
    }

    addRepayment.mutate({
      advanceId: advance.id,
      repaymentData: {
        amount: data.amount,
        date: new Date(),
        recordedBy: user.name,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Sukses", description: "Pembayaran cicilan berhasil dicatat." })
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
          <DialogTitle>Bayar Cicilan Panjar: {advance?.employeeName}</DialogTitle>
          <DialogDescription>
            Sisa utang saat ini: <strong className="text-destructive">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(advance?.remainingAmount || 0)}</strong>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="py-4">
            <Label htmlFor="amount">Jumlah Pembayaran</Label>
            <Input id="amount" type="number" {...register("amount")} />
            {errors.amount && <p className="text-sm text-destructive mt-1">{errors.amount.message}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={addRepayment.isPending}>
              {addRepayment.isPending ? "Menyimpan..." : "Simpan Pembayaran"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}