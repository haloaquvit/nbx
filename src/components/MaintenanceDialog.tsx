import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useCreateMaintenance, useUpdateMaintenance } from "@/hooks/useMaintenance"
import { useAssets } from "@/hooks/useAssets"
import { AssetMaintenance, MaintenanceFormData } from "@/types/assets"
import { useToast } from "@/components/ui/use-toast"

interface MaintenanceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  maintenance?: AssetMaintenance | null
}

export function MaintenanceDialog({ open, onOpenChange, maintenance }: MaintenanceDialogProps) {
  const { toast } = useToast()
  const createMaintenance = useCreateMaintenance()
  const updateMaintenance = useUpdateMaintenance()
  const { data: assets = [], isLoading: assetsLoading } = useAssets()


  const [formData, setFormData] = useState<Partial<MaintenanceFormData>>({
    maintenanceType: "preventive",
    priority: "medium",
    isRecurring: false,
    recurrenceInterval: 1,
    recurrenceUnit: "months",
    estimatedCost: 0,
    notifyBeforeDays: 7,
  })

  useEffect(() => {
    if (open && maintenance) {
      setFormData({
        assetId: maintenance.assetId,
        maintenanceType: maintenance.maintenanceType,
        title: maintenance.title,
        description: maintenance.description,
        scheduledDate: maintenance.scheduledDate,
        isRecurring: maintenance.isRecurring,
        recurrenceInterval: maintenance.recurrenceInterval,
        recurrenceUnit: maintenance.recurrenceUnit,
        priority: maintenance.priority,
        estimatedCost: maintenance.estimatedCost,
        serviceProvider: maintenance.serviceProvider,
        technicianName: maintenance.technicianName,
        notifyBeforeDays: maintenance.notifyBeforeDays,
      })
    } else if (open) {
      setFormData({
        maintenanceType: "preventive",
        priority: "medium",
        isRecurring: false,
        recurrenceInterval: 1,
        recurrenceUnit: "months",
        estimatedCost: 0,
        notifyBeforeDays: 7,
        scheduledDate: new Date(),
      })
    }
  }, [maintenance, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.assetId || !formData.title || !formData.scheduledDate) {
      toast({
        title: "Error",
        description: "Aset, judul, dan tanggal wajib diisi",
        variant: "destructive",
      })
      return
    }

    try {
      if (maintenance) {
        await updateMaintenance.mutateAsync({
          id: maintenance.id,
          formData: formData as MaintenanceFormData,
        })
        toast({
          title: "Berhasil",
          description: "Jadwal maintenance berhasil diperbarui",
        })
      } else {
        await createMaintenance.mutateAsync(formData as MaintenanceFormData)
        toast({
          title: "Berhasil",
          description: "Jadwal maintenance berhasil ditambahkan",
        })
      }
      onOpenChange(false)
    } catch (error: any) {
      toast({
        title: "Gagal",
        description: error?.message || "Gagal menyimpan jadwal maintenance",
        variant: "destructive",
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{maintenance ? "Edit Jadwal Maintenance" : "Jadwalkan Maintenance Baru"}</DialogTitle>
          <DialogDescription>
            Buat jadwal maintenance untuk aset perusahaan
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="assetId">Aset *</Label>
              <select
                id="assetId"
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={formData.assetId}
                onChange={(e) => setFormData({ ...formData, assetId: e.target.value })}
                required
                disabled={assetsLoading}
              >
                <option value="">{assetsLoading ? 'Memuat aset...' : 'Pilih Aset'}</option>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.assetCode} - {asset.assetName}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {assetsLoading ? 'Memuat...' : `${assets.length} aset tersedia`}
              </p>
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="title">Judul Maintenance *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Misal: Service Rutin AC"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maintenanceType">Tipe Maintenance</Label>
              <select
                id="maintenanceType"
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={formData.maintenanceType}
                onChange={(e) => setFormData({ ...formData, maintenanceType: e.target.value as any })}
              >
                <option value="preventive">Preventif</option>
                <option value="corrective">Korektif</option>
                <option value="inspection">Inspeksi</option>
                <option value="calibration">Kalibrasi</option>
                <option value="other">Lainnya</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Prioritas</Label>
              <select
                id="priority"
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
              >
                <option value="low">Rendah</option>
                <option value="medium">Sedang</option>
                <option value="high">Tinggi</option>
                <option value="critical">Kritis</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="scheduledDate">Tanggal Dijadwalkan *</Label>
              <Input
                id="scheduledDate"
                type="date"
                value={formData.scheduledDate ? formData.scheduledDate.toISOString().split('T')[0] : ''}
                onChange={(e) => setFormData({ ...formData, scheduledDate: new Date(e.target.value) })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="estimatedCost">Estimasi Biaya (Rp)</Label>
              <Input
                id="estimatedCost"
                type="number"
                value={formData.estimatedCost}
                onChange={(e) => setFormData({ ...formData, estimatedCost: parseFloat(e.target.value) || 0 })}
                min="0"
              />
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="description">Deskripsi</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Detail pekerjaan yang akan dilakukan..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="serviceProvider">Penyedia Layanan</Label>
              <Input
                id="serviceProvider"
                value={formData.serviceProvider}
                onChange={(e) => setFormData({ ...formData, serviceProvider: e.target.value })}
                placeholder="Nama vendor/kontraktor"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="technicianName">Nama Teknisi</Label>
              <Input
                id="technicianName"
                value={formData.technicianName}
                onChange={(e) => setFormData({ ...formData, technicianName: e.target.value })}
                placeholder="Nama teknisi yang bertanggung jawab"
              />
            </div>

            <div className="col-span-2 space-y-2">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isRecurring"
                  checked={formData.isRecurring}
                  onChange={(e) => setFormData({ ...formData, isRecurring: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="isRecurring" className="cursor-pointer">
                  Maintenance Berulang
                </Label>
              </div>
            </div>

            {formData.isRecurring && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="recurrenceInterval">Interval</Label>
                  <Input
                    id="recurrenceInterval"
                    type="number"
                    value={formData.recurrenceInterval}
                    onChange={(e) => setFormData({ ...formData, recurrenceInterval: parseInt(e.target.value) || 1 })}
                    min="1"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="recurrenceUnit">Satuan</Label>
                  <select
                    id="recurrenceUnit"
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={formData.recurrenceUnit}
                    onChange={(e) => setFormData({ ...formData, recurrenceUnit: e.target.value as any })}
                  >
                    <option value="days">Hari</option>
                    <option value="weeks">Minggu</option>
                    <option value="months">Bulan</option>
                    <option value="years">Tahun</option>
                  </select>
                </div>
              </>
            )}

            <div className="col-span-2 space-y-2">
              <Label htmlFor="notifyBeforeDays">Ingatkan Sebelum (hari)</Label>
              <Input
                id="notifyBeforeDays"
                type="number"
                value={formData.notifyBeforeDays}
                onChange={(e) => setFormData({ ...formData, notifyBeforeDays: parseInt(e.target.value) || 7 })}
                min="0"
                placeholder="Berapa hari sebelumnya untuk notifikasi (default: 7 hari)"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={createMaintenance.isPending || updateMaintenance.isPending}>
              {maintenance ? "Simpan Perubahan" : "Jadwalkan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
