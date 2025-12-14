"use client"
import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Plus,
  Edit,
  Trash2,
  Package,
  DollarSign,
  Calendar,
  MapPin,
  TrendingDown,
  Wrench,
  AlertCircle,
  CheckCircle2,
  Building2,
  Car,
  Monitor,
  Armchair,
} from "lucide-react"
import { useAssets, useAssetsSummary, useDeleteAsset, useCalculateAssetValue } from "@/hooks/useAssets"
import { Asset } from "@/types/assets"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import { AssetDialog } from "@/components/AssetDialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { formatCurrency } from "@/lib/utils"

export default function AssetsPage() {
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [filterCategory, setFilterCategory] = useState<string>("all")
  const [filterStatus, setFilterStatus] = useState<string>("all")

  const { toast } = useToast()
  const { data: assets = [], isLoading } = useAssets()
  const { data: summary } = useAssetsSummary()
  const deleteAsset = useDeleteAsset()

  const handleDeleteAsset = async (id: string) => {
    try {
      await deleteAsset.mutateAsync(id)
      toast({
        title: "Berhasil",
        description: "Aset berhasil dihapus",
      })
    } catch (error) {
      toast({
        title: "Gagal",
        description: "Gagal menghapus aset",
        variant: "destructive",
      })
    }
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'equipment':
        return <Package className="h-4 w-4" />
      case 'vehicle':
        return <Car className="h-4 w-4" />
      case 'building':
        return <Building2 className="h-4 w-4" />
      case 'computer':
        return <Monitor className="h-4 w-4" />
      case 'furniture':
        return <Armchair className="h-4 w-4" />
      default:
        return <Package className="h-4 w-4" />
    }
  }

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      equipment: 'Peralatan',
      vehicle: 'Kendaraan',
      building: 'Bangunan',
      computer: 'Komputer',
      furniture: 'Furnitur',
      other: 'Lainnya',
    }
    return labels[category] || category
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string; icon: any }> = {
      active: { variant: 'default', label: 'Aktif', icon: <CheckCircle2 className="h-3 w-3" /> },
      maintenance: { variant: 'secondary', label: 'Maintenance', icon: <Wrench className="h-3 w-3" /> },
      retired: { variant: 'outline', label: 'Tidak Aktif', icon: <AlertCircle className="h-3 w-3" /> },
      sold: { variant: 'destructive', label: 'Terjual', icon: <DollarSign className="h-3 w-3" /> },
    }
    const config = variants[status] || variants.active
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        {config.icon}
        {config.label}
      </Badge>
    )
  }

  const getConditionBadge = (condition: string) => {
    const colors: Record<string, string> = {
      excellent: 'bg-green-100 text-green-800 border-green-300',
      good: 'bg-blue-100 text-blue-800 border-blue-300',
      fair: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      poor: 'bg-red-100 text-red-800 border-red-300',
    }
    const labels: Record<string, string> = {
      excellent: 'Sangat Baik',
      good: 'Baik',
      fair: 'Cukup',
      poor: 'Buruk',
    }
    return (
      <Badge variant="outline" className={colors[condition] || colors.good}>
        {labels[condition] || condition}
      </Badge>
    )
  }

  const filteredAssets = assets.filter(asset => {
    if (filterCategory !== 'all' && asset.category !== filterCategory) return false
    if (filterStatus !== 'all' && asset.status !== filterStatus) return false
    return true
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Aset & Maintenance</h1>
          <p className="text-muted-foreground">
            Kelola aset perusahaan dan jadwal maintenance
          </p>
        </div>
        <Button onClick={() => {
          setSelectedAsset(null)
          setIsDialogOpen(true)
        }}>
          <Plus className="h-4 w-4 mr-2" />
          Tambah Aset
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Aset</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalAssets || 0}</div>
            <p className="text-xs text-muted-foreground">
              {summary?.activeAssets || 0} aktif
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Nilai Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary?.totalValue || 0)}
            </div>
            <p className="text-xs text-muted-foreground">Nilai pembelian</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Nilai Sekarang</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary?.totalCurrentValue || 0)}
            </div>
            <p className="text-xs text-muted-foreground">Setelah depresiasi</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Maintenance</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.maintenanceCount || 0}</div>
            <p className="text-xs text-muted-foreground">Aset dalam maintenance</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all" onClick={() => setFilterCategory('all')}>
            Semua Aset
          </TabsTrigger>
          <TabsTrigger value="equipment" onClick={() => setFilterCategory('equipment')}>
            Peralatan
          </TabsTrigger>
          <TabsTrigger value="vehicle" onClick={() => setFilterCategory('vehicle')}>
            Kendaraan
          </TabsTrigger>
          <TabsTrigger value="building" onClick={() => setFilterCategory('building')}>
            Bangunan
          </TabsTrigger>
          <TabsTrigger value="computer" onClick={() => setFilterCategory('computer')}>
            Komputer
          </TabsTrigger>
        </TabsList>

        <TabsContent value={filterCategory} className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Daftar Aset</CardTitle>
                  <CardDescription>
                    Menampilkan {filteredAssets.length} dari {assets.length} aset
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <select
                    className="border rounded-md px-3 py-2 text-sm"
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                  >
                    <option value="all">Semua Status</option>
                    <option value="active">Aktif</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="retired">Tidak Aktif</option>
                    <option value="sold">Terjual</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kode</TableHead>
                    <TableHead>Nama Aset</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Lokasi</TableHead>
                    <TableHead>Nilai Pembelian</TableHead>
                    <TableHead>Nilai Sekarang</TableHead>
                    <TableHead>Kondisi</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        Tidak ada data aset
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAssets.map((asset) => (
                      <TableRow key={asset.id}>
                        <TableCell className="font-medium">{asset.assetCode}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getCategoryIcon(asset.category)}
                            <div>
                              <div className="font-medium">{asset.assetName}</div>
                              {asset.brand && (
                                <div className="text-xs text-muted-foreground">
                                  {asset.brand} {asset.model && `- ${asset.model}`}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{getCategoryLabel(asset.category)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            {asset.location || '-'}
                          </div>
                        </TableCell>
                        <TableCell>{formatCurrency(asset.purchasePrice)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span>{formatCurrency(asset.currentValue || 0)}</span>
                            {asset.currentValue && asset.purchasePrice > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {((asset.currentValue / asset.purchasePrice) * 100).toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{getConditionBadge(asset.condition)}</TableCell>
                        <TableCell>{getStatusBadge(asset.status)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSelectedAsset(asset)
                                setIsDialogOpen(true)
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Hapus Aset?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Anda yakin ingin menghapus aset "{asset.assetName}"? Tindakan ini
                                    tidak dapat dibatalkan.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Batal</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteAsset(asset.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Hapus
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AssetDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        asset={selectedAsset}
      />
    </div>
  )
}
