"use client"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "./ui/use-toast"
import { Employee } from "@/types/employee"
import { useEmployees } from "@/hooks/useEmployees"
import { PasswordInput } from "./PasswordInput"

const passwordSchema = z.object({
  newPassword: z.string().min(6, "Password baru minimal 6 karakter."),
  confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Password tidak cocok.",
  path: ["confirmPassword"],
})

type PasswordFormData = z.infer<typeof passwordSchema>

interface ResetPasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee: Employee | null
}

export function ResetPasswordDialog({ open, onOpenChange, employee }: ResetPasswordDialogProps) {
  const { toast } = useToast()
  const { resetPassword } = useEmployees()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
  })

  const onSubmit = (data: PasswordFormData) => {
    if (!employee) return;

    resetPassword.mutate({ userId: employee.id, newPassword: data.newPassword }, {
      onSuccess: () => {
        toast({ title: "Sukses", description: `Password untuk ${employee.name} berhasil direset.` })
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
          <DialogTitle>Reset Password: {employee?.name}</DialogTitle>
          <DialogDescription>
            Masukkan password baru untuk karyawan ini.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="newPassword">Password Baru</Label>
            <PasswordInput id="newPassword" {...register("newPassword")} />
            {errors.newPassword && <p className="text-sm text-destructive mt-1">{errors.newPassword.message}</p>}
          </div>
          <div>
            <Label htmlFor="confirmPassword">Konfirmasi Password Baru</Label>
            <PasswordInput id="confirmPassword" {...register("confirmPassword")} />
            {errors.confirmPassword && <p className="text-sm text-destructive mt-1">{errors.confirmPassword.message}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={resetPassword.isPending}>
              {resetPassword.isPending ? "Menyimpan..." : "Reset Password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}