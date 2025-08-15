"use client"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { useAuthContext } from "@/contexts/AuthContext"
import { supabase } from "@/integrations/supabase/client"
import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { PasswordInput } from "@/components/PasswordInput"

const profileSchema = z.object({
  email: z.string().email("Email tidak valid."),
  name: z.string().min(3, "Nama minimal 3 karakter."),
  phone: z.string().min(10, "Nomor telepon tidak valid."),
  address: z.string().min(5, "Alamat minimal 5 karakter."),
})

const passwordSchema = z.object({
  newPassword: z.string().min(6, "Password baru minimal 6 karakter."),
  confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Password tidak cocok.",
  path: ["confirmPassword"],
})

type ProfileFormData = z.infer<typeof profileSchema>
type PasswordFormData = z.infer<typeof passwordSchema>

export default function AccountSettingsPage() {
  const { toast } = useToast()
  const { user, session } = useAuthContext()
  const queryClient = useQueryClient()
  const [isProfileUpdating, setIsProfileUpdating] = useState(false)
  const [isPasswordUpdating, setIsPasswordUpdating] = useState(false)

  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
  })

  useEffect(() => {
    if (user) {
      profileForm.reset({
        email: user.email || '',
        name: user.name || '',
        phone: user.phone || '',
        address: user.address || '',
      })
    }
  }, [user, profileForm])

  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
  })

  const onProfileSubmit = async (data: ProfileFormData) => {
    if (!user || !session?.user) return
    setIsProfileUpdating(true)

    // Update public profile first
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        full_name: data.name,
        phone: data.phone,
        address: data.address,
        email: data.email,
      })
      .eq('id', session.user.id)

    if (profileError) {
      toast({ variant: "destructive", title: "Gagal Update Profil", description: profileError.message })
      setIsProfileUpdating(false)
      return
    }

    // Update auth user (email) if it has changed
    if (data.email !== user.email) {
      const { error: authError } = await supabase.auth.updateUser({ email: data.email })
      if (authError) {
        toast({ variant: "destructive", title: "Gagal Update Email", description: authError.message })
      } else {
        toast({ title: "Konfirmasi Email", description: "Link konfirmasi telah dikirim ke email baru Anda." })
      }
    }
    
    toast({ title: "Sukses", description: "Profil berhasil diperbarui." })
    queryClient.invalidateQueries({ queryKey: ['employees'] })
    setIsProfileUpdating(false)
  }

  const onPasswordSubmit = async (data: PasswordFormData) => {
    setIsPasswordUpdating(true)
    const { error } = await supabase.auth.updateUser({ password: data.newPassword })
    if (error) {
      toast({ variant: "destructive", title: "Gagal", description: `Gagal memperbarui password: ${error.message}` })
    } else {
      toast({ title: "Sukses", description: "Password berhasil diubah." })
      passwordForm.reset({ newPassword: '', confirmPassword: '' })
    }
    setIsPasswordUpdating(false)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Pengaturan Profil</CardTitle>
          <CardDescription>Perbarui informasi kontak dan personal Anda.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4 max-w-lg">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" {...profileForm.register("email")} />
              {profileForm.formState.errors.email && <p className="text-sm text-destructive">{profileForm.formState.errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Nama Lengkap</Label>
              <Input id="name" {...profileForm.register("name")} />
              {profileForm.formState.errors.name && <p className="text-sm text-destructive">{profileForm.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">No. Telepon</Label>
              <Input id="phone" {...profileForm.register("phone")} />
              {profileForm.formState.errors.phone && <p className="text-sm text-destructive">{profileForm.formState.errors.phone.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Alamat</Label>
              <Textarea id="address" {...profileForm.register("address")} />
              {profileForm.formState.errors.address && <p className="text-sm text-destructive">{profileForm.formState.errors.address.message}</p>}
            </div>
            <Button type="submit" disabled={isProfileUpdating}>
              {isProfileUpdating ? "Menyimpan..." : "Simpan Profil"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ubah Password</CardTitle>
          <CardDescription>Pastikan Anda menggunakan password yang kuat.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4 max-w-lg">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Password Baru</Label>
              <PasswordInput id="newPassword" {...passwordForm.register("newPassword")} />
              {passwordForm.formState.errors.newPassword && <p className="text-sm text-destructive">{passwordForm.formState.errors.newPassword.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Konfirmasi Password Baru</Label>
              <PasswordInput id="confirmPassword" {...passwordForm.register("confirmPassword")} />
              {passwordForm.formState.errors.confirmPassword && <p className="text-sm text-destructive">{passwordForm.formState.errors.confirmPassword.message}</p>}
            </div>
            <Button type="submit" disabled={isPasswordUpdating}>
              {isPasswordUpdating ? "Mengubah..." : "Ubah Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}