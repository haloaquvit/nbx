"use client"
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { useAstragraphiaSettings, AstragraphiaSettings } from '@/hooks/useAstragraphiaSettings'
import { useAuth } from '@/hooks/useAuth'
import { Settings, Shield, DollarSign, Calendar } from 'lucide-react'
import { format } from 'date-fns'
import { id } from 'date-fns/locale/id'

const settingsSchema = z.object({
  bwRatePerClick: z.coerce.number().min(1, { message: "Tarif H&P minimal Rp 1 per klik" }),
  bwMinimumMonthlyCharge: z.coerce.number().min(0, { message: "Minimum charge H&P tidak boleh negatif" }),
  colorRatePerClick: z.coerce.number().min(1, { message: "Tarif warna minimal Rp 1 per klik" }),
  colorMinimumMonthlyCharge: z.coerce.number().min(0, { message: "Minimum charge warna tidak boleh negatif" }),
  contractName: z.string().min(5, { message: "Nama kontrak minimal 5 karakter" }),
  contractStartDate: z.string().min(1, { message: "Tanggal mulai kontrak harus diisi" }),
  contractEndDate: z.string().optional(),
  notes: z.string().optional(),
})

type SettingsFormData = z.infer<typeof settingsSchema>

interface AstragraphiaSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const AstragraphiaSettingsDialog = ({ 
  open, 
  onOpenChange 
}: AstragraphiaSettingsDialogProps) => {
  const { settings, updateSettings, isUpdating } = useAstragraphiaSettings()
  const { user } = useAuth()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Only owner can access this dialog
  const isOwner = user?.role === 'owner'

  const { register, handleSubmit, reset, formState: { errors } } = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      bwRatePerClick: settings.bwRatePerClick,
      bwMinimumMonthlyCharge: settings.bwMinimumMonthlyCharge,
      colorRatePerClick: settings.colorRatePerClick,
      colorMinimumMonthlyCharge: settings.colorMinimumMonthlyCharge,
      contractName: settings.contractName,
      contractStartDate: settings.contractStartDate,
      contractEndDate: settings.contractEndDate || '',
      notes: settings.notes || '',
    },
  })

  const onSubmit = async (data: SettingsFormData) => {
    if (!isOwner) {
      toast({
        variant: "destructive",
        title: "Akses Ditolak",
        description: "Hanya owner yang dapat mengubah pengaturan tarif Astragraphia.",
      })
      return
    }

    setIsSubmitting(true)
    try {
      await updateSettings({
        ...data,
        updatedBy: user?.name || user?.username || 'Owner'
      })

      toast({
        title: "Pengaturan Berhasil Disimpan!",
        description: `H&P: Rp${data.bwRatePerClick}/klik, Warna: Rp${data.colorRatePerClick}/klik`,
      })

      onOpenChange(false)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: "Terjadi kesalahan saat menyimpan pengaturan. Silakan coba lagi.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    reset()
    onOpenChange(false)
  }

  if (!isOwner) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-red-500" />
              Akses Terbatas
            </DialogTitle>
            <DialogDescription>
              Hanya owner yang dapat mengakses pengaturan tarif Astragraphia.
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 text-center">
            <Shield className="h-16 w-16 text-red-200 mx-auto mb-4" />
            <p className="text-muted-foreground">
              Fitur ini memerlukan izin level Owner untuk melindungi pengaturan kontrak yang sensitif.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Pengaturan Tarif Astragraphia
          </DialogTitle>
          <DialogDescription>
            Kelola pengaturan kontrak dan tarif PT Astragraphia. Perubahan akan berlaku untuk semua perhitungan tagihan.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Current Settings Info */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Pengaturan Saat Ini
            </h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-blue-700">Tarif H&P per klik:</span>
                <p className="font-semibold">Rp{settings.bwRatePerClick.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-blue-700">Tarif Warna per klik:</span>
                <p className="font-semibold">Rp{settings.colorRatePerClick.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-blue-700">Min. H&P bulanan:</span>
                <p className="font-semibold">Rp{settings.bwMinimumMonthlyCharge.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-blue-700">Min. Warna bulanan:</span>
                <p className="font-semibold">Rp{settings.colorMinimumMonthlyCharge.toLocaleString()}</p>
              </div>
              <div className="col-span-2">
                <span className="text-blue-700">Terakhir diubah:</span>
                <p className="font-semibold">
                  {format(new Date(settings.updatedAt), 'dd MMMM yyyy HH:mm', { locale: id })} 
                  {settings.updatedBy && ` oleh ${settings.updatedBy}`}
                </p>
              </div>
            </div>
          </div>

          {/* Form Fields - Black & White Section */}
          <div className="space-y-4">
            <div className="border-l-4 border-gray-400 pl-4">
              <h4 className="font-medium text-gray-700 mb-3">⚫⚪ Kontrak Hitam Putih</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bwRatePerClick" className="text-sm font-medium">
                    Tarif H&P per Klik (Rp) *
                  </Label>
                  <Input
                    id="bwRatePerClick"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="45"
                    {...register('bwRatePerClick')}
                    className={errors.bwRatePerClick ? 'border-red-500' : ''}
                  />
                  {errors.bwRatePerClick && (
                    <p className="text-sm text-red-600">{errors.bwRatePerClick.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bwMinimumMonthlyCharge" className="text-sm font-medium">
                    Minimum H&P Bulanan (Rp) *
                  </Label>
                  <Input
                    id="bwMinimumMonthlyCharge"
                    type="number"
                    min="0"
                    step="1000"
                    placeholder="50000"
                    {...register('bwMinimumMonthlyCharge')}
                    className={errors.bwMinimumMonthlyCharge ? 'border-red-500' : ''}
                  />
                  {errors.bwMinimumMonthlyCharge && (
                    <p className="text-sm text-red-600">{errors.bwMinimumMonthlyCharge.message}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="border-l-4 border-red-400 pl-4">
              <h4 className="font-medium text-red-700 mb-3">🌈 Kontrak Warna</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="colorRatePerClick" className="text-sm font-medium">
                    Tarif Warna per Klik (Rp) *
                  </Label>
                  <Input
                    id="colorRatePerClick"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="300"
                    {...register('colorRatePerClick')}
                    className={errors.colorRatePerClick ? 'border-red-500' : ''}
                  />
                  {errors.colorRatePerClick && (
                    <p className="text-sm text-red-600">{errors.colorRatePerClick.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="colorMinimumMonthlyCharge" className="text-sm font-medium">
                    Minimum Warna Bulanan (Rp) *
                  </Label>
                  <Input
                    id="colorMinimumMonthlyCharge"
                    type="number"
                    min="0"
                    step="1000"
                    placeholder="100000"
                    {...register('colorMinimumMonthlyCharge')}
                    className={errors.colorMinimumMonthlyCharge ? 'border-red-500' : ''}
                  />
                  {errors.colorMinimumMonthlyCharge && (
                    <p className="text-sm text-red-600">{errors.colorMinimumMonthlyCharge.message}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contractName" className="text-sm font-medium">
              Nama Kontrak/Vendor *
            </Label>
            <Input
              id="contractName"
              placeholder="PT Astragraphia Document Solutions"
              {...register('contractName')}
              className={errors.contractName ? 'border-red-500' : ''}
            />
            {errors.contractName && (
              <p className="text-sm text-red-600">{errors.contractName.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contractStartDate" className="text-sm font-medium">
                Tanggal Mulai Kontrak *
              </Label>
              <Input
                id="contractStartDate"
                type="date"
                {...register('contractStartDate')}
                className={errors.contractStartDate ? 'border-red-500' : ''}
              />
              {errors.contractStartDate && (
                <p className="text-sm text-red-600">{errors.contractStartDate.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="contractEndDate" className="text-sm font-medium">
                Tanggal Berakhir Kontrak (Opsional)
              </Label>
              <Input
                id="contractEndDate"
                type="date"
                {...register('contractEndDate')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes" className="text-sm font-medium">
              Catatan Kontrak (Opsional)
            </Label>
            <Textarea
              id="notes"
              placeholder="Informasi tambahan tentang kontrak..."
              rows={3}
              {...register('notes')}
            />
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isSubmitting || isUpdating}
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || isUpdating}
              className="min-w-[120px]"
            >
              {isSubmitting || isUpdating ? (
                <>
                  <Settings className="h-4 w-4 animate-spin mr-2" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <DollarSign className="h-4 w-4 mr-2" />
                  Simpan Pengaturan
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}