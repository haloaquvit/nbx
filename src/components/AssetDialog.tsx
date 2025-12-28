import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useCreateAsset, useUpdateAsset } from "@/hooks/useAssets"
import { useAccounts } from "@/hooks/useAccounts"
import { useBranch } from "@/contexts/BranchContext"
import { Asset, AssetFormData } from "@/types/assets"
import { useToast } from "@/components/ui/use-toast"

interface AssetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  asset?: Asset | null
}

export function AssetDialog({ open, onOpenChange, asset }: AssetDialogProps) {
  const { toast } = useToast()
  const createAsset = useCreateAsset()
  const updateAsset = useUpdateAsset()
  const { accounts = [], isLoading } = useAccounts()
  const { currentBranch } = useBranch()

  // Debug: Log accounts data
  useEffect(() => {
    console.log('AssetDialog - Total accounts:', accounts.length)
    console.log('AssetDialog - All accounts:', accounts)

    // Check each filter condition separately
    const activeAccounts = accounts.filter(a => a.isActive !== false)
    const nonHeaderAccounts = accounts.filter(a => !a.isHeader)
    const filteredAccounts = accounts.filter(account => account.isActive !== false && !account.isHeader)

    console.log('AssetDialog - Active accounts:', activeAccounts.length)
    console.log('AssetDialog - Non-header accounts:', nonHeaderAccounts.length)
    console.log('AssetDialog - Active AND Non-header accounts:', filteredAccounts.length)
    console.log('AssetDialog - Filtered accounts detail:', filteredAccounts)

    // Show some header accounts to understand the data structure
    const headerAccounts = accounts.filter(a => a.isHeader)
    console.log('AssetDialog - Sample header accounts:', headerAccounts.slice(0, 3))
  }, [accounts])

  // Generate unique asset code
  const generateAssetCode = () => {
    const prefix = "AST"
    const timestamp = Date.now().toString().slice(-8)
    const random = Math.random().toString(36).substring(2, 5).toUpperCase()
    return `${prefix}-${timestamp}-${random}`
  }

  const [formData, setFormData] = useState<Partial<AssetFormData>>({
    assetName: "",
    assetCode: generateAssetCode(),
    category: "equipment",
    description: "",
    purchaseDate: new Date(),
    purchasePrice: 0,
    supplierName: "",
    brand: "",
    model: "",
    serialNumber: "",
    location: "",
    usefulLifeYears: 5,
    salvageValue: 0,
    depreciationMethod: "straight_line",
    status: "active",
    condition: "good",
    accountId: "",
    notes: "",
    source: "cash", // Default: Pembelian Tunai
  })

  useEffect(() => {
    if (asset) {
      setFormData({
        assetName: asset.assetName,
        assetCode: asset.assetCode,
        category: asset.category,
        description: asset.description,
        purchaseDate: asset.purchaseDate,
        purchasePrice: asset.purchasePrice,
        supplierName: asset.supplierName,
        brand: asset.brand,
        model: asset.model,
        serialNumber: asset.serialNumber,
        location: asset.location,
        usefulLifeYears: asset.usefulLifeYears,
        salvageValue: asset.salvageValue,
        depreciationMethod: asset.depreciationMethod,
        status: asset.status,
        condition: asset.condition,
        accountId: asset.accountId,
        notes: asset.notes,
      })
    } else {
      setFormData({
        assetName: "",
        assetCode: generateAssetCode(),
        category: "equipment",
        description: "",
        purchaseDate: new Date(),
        purchasePrice: 0,
        supplierName: "",
        brand: "",
        model: "",
        serialNumber: "",
        location: "",
        usefulLifeYears: 5,
        salvageValue: 0,
        depreciationMethod: "straight_line",
        status: "active",
        condition: "good",
        accountId: "",
        notes: "",
        source: "cash", // Default: Pembelian Tunai
      })
    }
  }, [asset, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.assetName || !formData.assetCode) {
      toast({
        title: "Error",
        description: "Nama aset dan kode aset wajib diisi",
        variant: "destructive",
      })
      return
    }

    // Validate branch is selected
    if (!currentBranch?.id) {
      toast({
        title: "Error",
        description: "Cabang belum dipilih. Silakan pilih cabang terlebih dahulu dari header.",
        variant: "destructive",
      })
      return
    }

    console.log('[AssetDialog] Creating asset for branch:', currentBranch.name, '| ID:', currentBranch.id)

    try {
      // Clean up formData - convert empty strings to undefined for optional fields
      const cleanedFormData = {
        ...formData,
        accountId: formData.accountId && formData.accountId.trim() !== '' ? formData.accountId : undefined,
        supplierName: formData.supplierName && formData.supplierName.trim() !== '' ? formData.supplierName : undefined,
        brand: formData.brand && formData.brand.trim() !== '' ? formData.brand : undefined,
        model: formData.model && formData.model.trim() !== '' ? formData.model : undefined,
        serialNumber: formData.serialNumber && formData.serialNumber.trim() !== '' ? formData.serialNumber : undefined,
        location: formData.location && formData.location.trim() !== '' ? formData.location : undefined,
        notes: formData.notes && formData.notes.trim() !== '' ? formData.notes : undefined,
      } as AssetFormData

      if (asset) {
        await updateAsset.mutateAsync({
          id: asset.id,
          formData: cleanedFormData,
        })
        toast({
          title: "Berhasil",
          description: "Aset berhasil diperbarui",
        })
      } else {
        await createAsset.mutateAsync(cleanedFormData)
        toast({
          title: "Berhasil",
          description: "Aset berhasil ditambahkan",
        })
      }
      onOpenChange(false)
    } catch (error: any) {
      console.error('Error saving asset:', error)
      const errorMessage = error?.message || (asset ? "Gagal memperbarui aset" : "Gagal menambahkan aset")

      // Check for unique constraint violation
      if (errorMessage.includes('duplicate') || errorMessage.includes('unique')) {
        toast({
          title: "Kode Aset Sudah Ada",
          description: "Kode aset sudah digunakan. Silakan generate kode baru atau gunakan kode yang berbeda.",
          variant: "destructive",
        })
      } else {
        toast({
          title: "Gagal",
          description: errorMessage,
          variant: "destructive",
        })
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{asset ? "Edit Aset" : "Tambah Aset Baru"}</DialogTitle>
          <DialogDescription>
            {asset ? "Perbarui informasi aset" : "Tambahkan aset baru ke sistem"}
            {currentBranch && (
              <span className="block mt-1 text-blue-600 font-medium">
                Cabang: {currentBranch.name}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="assetName">Nama Aset *</Label>
              <Input
                id="assetName"
                value={formData.assetName}
                onChange={(e) => setFormData({ ...formData, assetName: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="assetCode">Kode Aset *</Label>
              <div className="flex gap-2">
                <Input
                  id="assetCode"
                  value={formData.assetCode}
                  onChange={(e) => setFormData({ ...formData, assetCode: e.target.value })}
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setFormData({ ...formData, assetCode: generateAssetCode() })}
                  title="Generate kode baru"
                >
                  ↻
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Kategori</Label>
              <select
                id="category"
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
              >
                <option value="equipment">Peralatan → Akun 1410 Peralatan Produksi</option>
                <option value="vehicle">Kendaraan → Akun 1420 Kendaraan</option>
                <option value="building">Bangunan → Akun 1440 Bangunan</option>
                <option value="computer">Komputer → Akun 1410 Peralatan Produksi</option>
                <option value="furniture">Furnitur → Akun 1430 Tanah</option>
                <option value="other">Lainnya → Akun 1400 Aset Tetap</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Aset akan otomatis masuk ke akun keuangan sesuai kategori di atas
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Lokasi</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="purchaseDate">Tanggal Pembelian</Label>
              <Input
                id="purchaseDate"
                type="date"
                value={formData.purchaseDate ? formData.purchaseDate.toISOString().split('T')[0] : ''}
                onChange={(e) => setFormData({ ...formData, purchaseDate: new Date(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="purchasePrice">Harga Pembelian</Label>
              <Input
                id="purchasePrice"
                type="number"
                value={formData.purchasePrice}
                onChange={(e) => setFormData({ ...formData, purchasePrice: Number(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplierName">Nama Supplier</Label>
              <Input
                id="supplierName"
                value={formData.supplierName}
                onChange={(e) => setFormData({ ...formData, supplierName: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="brand">Merek</Label>
              <Input
                id="brand"
                value={formData.brand}
                onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="model">Model</Label>
              <Input
                id="model"
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="serialNumber">Serial Number</Label>
              <Input
                id="serialNumber"
                value={formData.serialNumber}
                onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="usefulLifeYears">Umur Ekonomis (tahun)</Label>
              <Input
                id="usefulLifeYears"
                type="number"
                value={formData.usefulLifeYears}
                onChange={(e) => setFormData({ ...formData, usefulLifeYears: Number(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="salvageValue">Nilai Residu</Label>
              <Input
                id="salvageValue"
                type="number"
                value={formData.salvageValue}
                onChange={(e) => setFormData({ ...formData, salvageValue: Number(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="depreciationMethod">Metode Depresiasi</Label>
              <select
                id="depreciationMethod"
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={formData.depreciationMethod}
                onChange={(e) => setFormData({ ...formData, depreciationMethod: e.target.value as any })}
              >
                <option value="straight_line">Garis Lurus</option>
                <option value="declining_balance">Saldo Menurun</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
              >
                <option value="active">Aktif</option>
                <option value="maintenance">Maintenance</option>
                <option value="retired">Tidak Aktif</option>
                <option value="sold">Terjual</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="condition">Kondisi</Label>
              <select
                id="condition"
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={formData.condition}
                onChange={(e) => setFormData({ ...formData, condition: e.target.value as any })}
              >
                <option value="excellent">Sangat Baik</option>
                <option value="good">Baik</option>
                <option value="fair">Cukup</option>
                <option value="poor">Buruk</option>
              </select>
            </div>

            <div className="space-y-2 col-span-2">
              <Label htmlFor="source">Sumber Aset</Label>
              <select
                id="source"
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={formData.source || 'cash'}
                onChange={(e) => setFormData({ ...formData, source: e.target.value as any })}
              >
                <option value="cash">Pembelian Tunai - Kurangi Kas</option>
                <option value="credit">Pembelian Kredit - Tambah Hutang</option>
                <option value="migration">Migrasi Data - Tidak Kurangi Kas</option>
              </select>
              <p className="text-xs text-muted-foreground">
                {formData.source === 'migration'
                  ? 'Jurnal: Dr. Aset Tetap, Cr. Saldo Awal (tidak mempengaruhi kas)'
                  : formData.source === 'credit'
                  ? 'Jurnal: Dr. Aset Tetap, Cr. Hutang Usaha'
                  : 'Jurnal: Dr. Aset Tetap, Cr. Kas'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="accountId">Akun Keuangan</Label>
              <select
                id="accountId"
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={formData.accountId}
                onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
              >
                <option value="">Pilih Akun (Opsional)</option>
                {accounts
                  .filter(account => {
                    // Show active accounts
                    if (account.isActive === false) return false

                    // Prioritize non-header accounts, but show all if no non-header exists
                    const hasNonHeaderAccounts = accounts.some(a => a.isActive !== false && a.isHeader === false)
                    if (hasNonHeaderAccounts) {
                      return account.isHeader === false
                    }

                    // If all accounts are headers, show them all
                    return true
                  })
                  .sort((a, b) => (a.code || '').localeCompare(b.code || ''))
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.code ? `${account.code} - ` : ''}{account.name}
                    </option>
                  ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Total: {accounts.length} akun,
                Header: {accounts.filter(a => a.isHeader === true).length},
                Detail: {accounts.filter(a => a.isHeader === false).length}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Deskripsi</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Catatan</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={createAsset.isPending || updateAsset.isPending}>
              {asset ? "Perbarui" : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
