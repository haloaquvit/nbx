"use client"

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, MapPin, Calendar, User } from 'lucide-react'
import { Customer } from '@/types/customer'
import { useAuth } from '@/hooks/useAuth'
import { useBranch } from '@/contexts/BranchContext'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/components/ui/use-toast'
import { format } from 'date-fns'
import { id as localeId } from 'date-fns/locale/id'
import { useTimezone } from '@/contexts/TimezoneContext'
import { getOfficeTime } from '@/utils/officeTime'

interface SalesVisitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer: Customer | null
  onVisitRecorded: () => void
}

const VISIT_PURPOSES = [
  'Penawaran Produk',
  'Follow Up Pesanan',
  'Penagihan',
  'Survei Kebutuhan',
  'Perkenalan / Prospek Baru',
  'Komplain / After Sales',
  'Lainnya',
]

export function SalesVisitDialog({
  open,
  onOpenChange,
  customer,
  onVisitRecorded,
}: SalesVisitDialogProps) {
  const { user } = useAuth()
  const { currentBranch } = useBranch()
  const { toast } = useToast()
  const { timezone } = useTimezone()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    purpose: '',
    notes: '',
    followUpDate: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!customer || !user) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Data tidak lengkap',
      })
      return
    }

    if (!formData.purpose) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Pilih tujuan kunjungan',
      })
      return
    }

    setIsSubmitting(true)
    try {
      // Insert visit record
      const { error: visitError } = await supabase
        .from('customer_visits')
        .insert({
          customer_id: customer.id,
          visited_by: user.id,
          visited_by_name: user.name,
          visit_date: getOfficeTime(timezone).toISOString(),
          purpose: formData.purpose,
          notes: formData.notes || null,
          follow_up_date: formData.followUpDate || null,
          branch_id: currentBranch?.id,
        })

      if (visitError) {
        // If table doesn't exist, create it
        if (visitError.code === '42P01') {
          toast({
            variant: 'destructive',
            title: 'Tabel belum ada',
            description: 'Silakan jalankan migrasi database terlebih dahulu',
          })
        } else {
          throw visitError
        }
      }

      toast({
        title: 'Berhasil!',
        description: `Kunjungan ke ${customer.name} berhasil dicatat`,
      })

      // Reset form
      setFormData({
        purpose: '',
        notes: '',
        followUpDate: '',
      })

      onVisitRecorded()
      onOpenChange(false)
    } catch (err) {
      console.error('Error recording visit:', err)
      toast({
        variant: 'destructive',
        title: 'Gagal',
        description: 'Tidak dapat mencatat kunjungan',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-green-600" />
            Catat Kunjungan Sales
          </DialogTitle>
          <DialogDescription>
            Catat kunjungan ke pelanggan {customer?.name}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Customer Info */}
          <div className="p-3 bg-muted rounded-lg space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{customer?.name}</span>
            </div>
            <p className="text-xs text-muted-foreground">{customer?.address}</p>
            <p className="text-xs text-muted-foreground">
              <Calendar className="h-3 w-3 inline mr-1" />
              {format(getOfficeTime(timezone), "eeee, d MMMM yyyy - HH:mm", { locale: localeId })}
            </p>
          </div>

          {/* Purpose */}
          <div className="space-y-2">
            <Label htmlFor="purpose">Tujuan Kunjungan *</Label>
            <Select
              value={formData.purpose}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, purpose: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih tujuan kunjungan" />
              </SelectTrigger>
              <SelectContent>
                {VISIT_PURPOSES.map((purpose) => (
                  <SelectItem key={purpose} value={purpose}>
                    {purpose}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Catatan</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Catatan hasil kunjungan..."
              rows={3}
            />
          </div>

          {/* Follow Up Date */}
          <div className="space-y-2">
            <Label htmlFor="followUpDate">Tanggal Follow Up</Label>
            <Input
              id="followUpDate"
              type="date"
              value={formData.followUpDate}
              onChange={(e) => setFormData((prev) => ({ ...prev, followUpDate: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              Opsional. Jadwalkan follow up berikutnya.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Batal
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <MapPin className="mr-2 h-4 w-4" />
                  Catat Kunjungan
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
