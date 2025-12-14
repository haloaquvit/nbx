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
  DollarSign,
  TrendingUp,
  Heart,
  Calculator,
  Calendar,
  User,
  Building2,
  Sparkles,
  HandHeart,
} from "lucide-react"
import { useZakat, useZakatSummary, useDeleteZakat, useNishabValues, useCalculateZakat } from "@/hooks/useZakat"
import { ZakatRecord } from "@/types/zakat"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import { ZakatDialog } from "@/components/ZakatDialog"
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
import { format } from "date-fns"
import { id as localeId } from "date-fns/locale"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function ZakatPage() {
  const [selectedRecord, setSelectedRecord] = useState<ZakatRecord | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [filterCategory, setFilterCategory] = useState<string>("all")
  const [filterType, setFilterType] = useState<string>("all")
  const [calculatorAssetValue, setCalculatorAssetValue] = useState<number>(0)
  const [calculatorNishabType, setCalculatorNishabType] = useState<'gold' | 'silver'>('gold')

  const { toast } = useToast()
  const { data: records = [], isLoading } = useZakat()
  const { data: summary } = useZakatSummary()
  const { data: nishabValues } = useNishabValues()
  const calculateZakat = useCalculateZakat()
  const deleteRecord = useDeleteZakat()

  const handleDeleteRecord = async (id: string) => {
    try {
      await deleteRecord.mutateAsync(id)
      toast({
        title: "Berhasil",
        description: "Data berhasil dihapus",
      })
    } catch (error) {
      toast({
        title: "Gagal",
        description: "Gagal menghapus data",
        variant: "destructive",
      })
    }
  }

  const handleCalculate = async () => {
    if (calculatorAssetValue <= 0) {
      toast({
        title: "Error",
        description: "Masukkan nilai harta yang valid",
        variant: "destructive",
      })
      return
    }

    try {
      const result = await calculateZakat.mutateAsync({
        assetValue: calculatorAssetValue,
        nishabType: calculatorNishabType,
      })

      toast({
        title: result.is_obligatory ? "Wajib Zakat" : "Belum Wajib Zakat",
        description: result.is_obligatory
          ? `Zakat yang wajib dibayar: ${formatCurrency(result.zakat_amount)}`
          : `Nilai harta belum mencapai nishab (${formatCurrency(result.nishab_value)})`,
      })
    } catch (error) {
      toast({
        title: "Gagal",
        description: "Gagal menghitung zakat",
        variant: "destructive",
      })
    }
  }

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      zakat_mal: 'Zakat Mal',
      zakat_fitrah: 'Zakat Fitrah',
      zakat_penghasilan: 'Zakat Penghasilan',
      zakat_perdagangan: 'Zakat Perdagangan',
      zakat_emas: 'Zakat Emas/Perak',
      sedekah: 'Sedekah',
      infaq: 'Infaq',
      wakaf: 'Wakaf',
      qurban: 'Qurban',
      other: 'Lainnya',
    }
    return labels[type] || type
  }

  const getCategoryBadge = (category: string) => {
    return category === 'zakat' ? (
      <Badge className="bg-green-100 text-green-800 border-green-300">
        <Sparkles className="h-3 w-3 mr-1" />
        Zakat
      </Badge>
    ) : (
      <Badge className="bg-blue-100 text-blue-800 border-blue-300">
        <HandHeart className="h-3 w-3 mr-1" />
        Sedekah
      </Badge>
    )
  }

  const getRecipientTypeIcon = (type?: string) => {
    switch (type) {
      case 'individual':
        return <User className="h-4 w-4" />
      case 'mosque':
      case 'orphanage':
      case 'institution':
        return <Building2 className="h-4 w-4" />
      default:
        return <Heart className="h-4 w-4" />
    }
  }

  const filteredRecords = records.filter(record => {
    if (filterCategory !== 'all' && record.category !== filterCategory) return false
    if (filterType !== 'all' && record.type !== filterType) return false
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
          <h1 className="text-3xl font-bold tracking-tight">Zakat & Sedekah</h1>
          <p className="text-muted-foreground">
            Kelola pembayaran zakat dan sedekah perusahaan
          </p>
        </div>
        <Button onClick={() => {
          setSelectedRecord(null)
          setIsDialogOpen(true)
        }}>
          <Plus className="h-4 w-4 mr-2" />
          Tambah Pembayaran
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Zakat</CardTitle>
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary?.totalZakatPaid || 0)}
            </div>
            <p className="text-xs text-muted-foreground">Total dibayarkan</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sedekah</CardTitle>
            <HandHeart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary?.totalCharityPaid || 0)}
            </div>
            <p className="text-xs text-muted-foreground">Total dibayarkan</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tahun Ini</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary?.totalPaidThisYear || 0)}
            </div>
            <p className="text-xs text-muted-foreground">Total {new Date().getFullYear()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bulan Ini</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary?.totalPaidThisMonth || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {format(new Date(), 'MMMM yyyy', { locale: localeId })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Zakat Calculator */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            <CardTitle>Kalkulator Zakat</CardTitle>
          </div>
          <CardDescription>
            Hitung zakat berdasarkan nilai harta dan nishab terkini
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Nilai Harta (Rp)</Label>
              <Input
                type="number"
                placeholder="0"
                value={calculatorAssetValue || ''}
                onChange={(e) => setCalculatorAssetValue(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Standar Nishab</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={calculatorNishabType}
                onChange={(e) => setCalculatorNishabType(e.target.value as 'gold' | 'silver')}
              >
                <option value="gold">Emas (85 gram)</option>
                <option value="silver">Perak (595 gram)</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Nilai Nishab</Label>
              <Input
                disabled
                value={formatCurrency(
                  calculatorNishabType === 'gold'
                    ? nishabValues?.gold_nishab_value || 0
                    : nishabValues?.silver_nishab_value || 0
                )}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleCalculate} className="w-full">
                <Calculator className="h-4 w-4 mr-2" />
                Hitung Zakat
              </Button>
            </div>
          </div>
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Harga Emas/gram:</span>
                <span className="font-medium">{formatCurrency(nishabValues?.gold_price || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Harga Perak/gram:</span>
                <span className="font-medium">{formatCurrency(nishabValues?.silver_price || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tarif Zakat:</span>
                <span className="font-medium">{nishabValues?.zakat_rate || 2.5}%</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all" onClick={() => setFilterCategory('all')}>
            Semua
          </TabsTrigger>
          <TabsTrigger value="zakat" onClick={() => setFilterCategory('zakat')}>
            <Sparkles className="h-4 w-4 mr-1" />
            Zakat
          </TabsTrigger>
          <TabsTrigger value="charity" onClick={() => setFilterCategory('charity')}>
            <HandHeart className="h-4 w-4 mr-1" />
            Sedekah
          </TabsTrigger>
        </TabsList>

        <TabsContent value={filterCategory} className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Riwayat Pembayaran</CardTitle>
                  <CardDescription>
                    Menampilkan {filteredRecords.length} dari {records.length} transaksi
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <select
                    className="border rounded-md px-3 py-2 text-sm"
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                  >
                    <option value="all">Semua Jenis</option>
                    <optgroup label="Zakat">
                      <option value="zakat_mal">Zakat Mal</option>
                      <option value="zakat_fitrah">Zakat Fitrah</option>
                      <option value="zakat_penghasilan">Zakat Penghasilan</option>
                      <option value="zakat_perdagangan">Zakat Perdagangan</option>
                      <option value="zakat_emas">Zakat Emas/Perak</option>
                    </optgroup>
                    <optgroup label="Sedekah">
                      <option value="sedekah">Sedekah</option>
                      <option value="infaq">Infaq</option>
                      <option value="wakaf">Wakaf</option>
                      <option value="qurban">Qurban</option>
                    </optgroup>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Judul</TableHead>
                    <TableHead>Penerima</TableHead>
                    <TableHead>Jumlah</TableHead>
                    <TableHead>Tahun Hijriah</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Belum ada data pembayaran
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          {format(record.paymentDate, 'dd MMM yyyy', { locale: localeId })}
                        </TableCell>
                        <TableCell>{getCategoryBadge(record.category)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{getTypeLabel(record.type)}</Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{record.title}</div>
                            {record.description && (
                              <div className="text-xs text-muted-foreground line-clamp-1">
                                {record.description}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {record.recipient ? (
                            <div className="flex items-center gap-2">
                              {getRecipientTypeIcon(record.recipientType)}
                              <span>{record.isAnonymous ? 'Anonim' : record.recipient}</span>
                            </div>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold">{formatCurrency(record.amount)}</div>
                          {record.percentageRate && (
                            <div className="text-xs text-muted-foreground">
                              {record.percentageRate}%
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {record.hijriYear ? (
                            <div className="text-sm">
                              <div>{record.hijriYear}</div>
                              {record.hijriMonth && (
                                <div className="text-xs text-muted-foreground">
                                  {record.hijriMonth}
                                </div>
                              )}
                            </div>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSelectedRecord(record)
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
                                  <AlertDialogTitle>Hapus Data?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Anda yakin ingin menghapus data "{record.title}"? Tindakan ini
                                    tidak dapat dibatalkan.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Batal</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteRecord(record.id)}
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

      <ZakatDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        record={selectedRecord}
      />
    </div>
  )
}
