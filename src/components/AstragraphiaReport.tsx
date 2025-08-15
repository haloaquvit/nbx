"use client"
import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from './ui/badge'
import { Calendar, Calculator, FileText, TrendingUp, Clock, AlertCircle, Settings } from 'lucide-react'
import { format, startOfDay, endOfDay, isAfter, isBefore, parseISO } from 'date-fns'
import { id } from 'date-fns/locale/id'
import { useMaterialMovements } from '@/hooks/useMaterialMovements'
import { useMaterials } from '@/hooks/useMaterials'
import { useAstragraphiaSettings } from '@/hooks/useAstragraphiaSettings'
import { useAuth } from '@/hooks/useAuth'
import { AstragraphiaSettingsDialog } from './AstragraphiaSettingsDialog'
import { AstragraphiaContractType } from '@/hooks/useAstragraphiaSettings'
import { MaterialMovement } from '@/types/materialMovement'
import { Material } from '@/types/material'

// Helper function to detect contract type from material name/description
const detectContractType = (material: Material): AstragraphiaContractType => {
  const text = `${material.name} ${material.description || ''}`.toLowerCase()
  
  // Check for color indicators
  if (text.includes('warna') || text.includes('color') || text.includes('colour')) {
    return 'color'
  }
  
  // Check for black & white indicators  
  if (text.includes('hitam putih') || text.includes('bw') || text.includes('black white') || text.includes('monochrome')) {
    return 'bw'
  }
  
  // Default to black & white if no specific indicator
  return 'bw'
}

export const AstragraphiaReport = () => {
  const { stockMovements, isLoading: isMovementsLoading } = useMaterialMovements()
  const { materials } = useMaterials()
  const { settings } = useAstragraphiaSettings()
  const { user } = useAuth()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  
  // Permission check
  const isOwner = user?.role === 'owner'

  // Filter material Astragraphia
  const astragraphiaMaterials = useMemo(() => {
    if (!materials) return []
    return materials.filter(material => 
      material.name.toLowerCase().includes('astragraphia') || 
      material.description?.toLowerCase().includes('astragraphia') ||
      material.description?.toLowerCase().includes('xerox') ||
      material.description?.toLowerCase().includes('mesin cetak')
    )
  }, [materials])

  // Filter movements berdasarkan material Astragraphia dan tanggal
  const filteredMovements = useMemo(() => {
    if (!stockMovements || astragraphiaMaterials.length === 0) return []
    
    const astragraphiaIds = astragraphiaMaterials.map(m => m.id)
    let movements = stockMovements.filter(movement => 
      astragraphiaIds.includes(movement.materialId) && 
      movement.type === 'OUT' // Hanya konsumsi/penggunaan
    )

    // Filter berdasarkan tanggal jika ada
    if (startDate) {
      const start = startOfDay(new Date(startDate))
      movements = movements.filter(movement => 
        isAfter(parseISO(movement.createdAt), start) || 
        format(parseISO(movement.createdAt), 'yyyy-MM-dd') === startDate
      )
    }

    if (endDate) {
      const end = endOfDay(new Date(endDate))
      movements = movements.filter(movement => 
        isBefore(parseISO(movement.createdAt), end) ||
        format(parseISO(movement.createdAt), 'yyyy-MM-dd') === endDate
      )
    }

    return movements.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [stockMovements, astragraphiaMaterials, startDate, endDate])

  // Kalkulasi statistik dengan dual contract support
  const statistics = useMemo(() => {
    // Separate calculations for B&W and Color
    let bwClicks = 0
    let colorClicks = 0
    let bwCost = 0
    let colorCost = 0
    
    // Group by date untuk daily usage
    const dailyUsage = filteredMovements.reduce((acc, movement) => {
      const date = format(parseISO(movement.createdAt), 'yyyy-MM-dd')
      acc[date] = (acc[date] || 0) + movement.quantity
      
      // Determine contract type for this movement
      const material = astragraphiaMaterials.find(m => m.id === movement.materialId)
      if (material) {
        const contractType = detectContractType(material)
        if (contractType === 'bw') {
          bwClicks += movement.quantity
        } else {
          colorClicks += movement.quantity
        }
      }
      
      return acc
    }, {} as Record<string, number>)

    // Calculate costs based on contract type
    bwCost = bwClicks * settings.bwRatePerClick
    colorCost = colorClicks * settings.colorRatePerClick
    
    const totalCost = bwCost + colorCost
    const totalClicks = bwClicks + colorClicks
    
    // Calculate billing with separate minimums
    const bwBill = Math.max(bwCost, bwClicks > 0 ? settings.bwMinimumMonthlyCharge : 0)
    const colorBill = Math.max(colorCost, colorClicks > 0 ? settings.colorMinimumMonthlyCharge : 0)
    const estimatedBill = bwBill + colorBill

    const dailyAverage = Object.keys(dailyUsage).length > 0 
      ? totalClicks / Object.keys(dailyUsage).length 
      : 0

    return {
      totalClicks,
      bwClicks,
      colorClicks,
      totalCost,
      bwCost,
      colorCost,
      estimatedBill,
      bwBill,
      colorBill,
      dailyUsage,
      dailyAverage,
      savingsFromMinimum: (bwCost < settings.bwMinimumMonthlyCharge && bwClicks > 0 ? settings.bwMinimumMonthlyCharge - bwCost : 0) +
                         (colorCost < settings.colorMinimumMonthlyCharge && colorClicks > 0 ? settings.colorMinimumMonthlyCharge - colorCost : 0)
    }
  }, [filteredMovements, astragraphiaMaterials, settings])

  const handleClearFilters = () => {
    setStartDate('')
    setEndDate('')
  }

  const getMaterialName = (materialId: string) => {
    const material = astragraphiaMaterials.find(m => m.id === materialId)
    return material?.name || 'Unknown Material'
  }

  const getDateRangeText = () => {
    if (startDate && endDate) {
      return `${format(new Date(startDate), 'dd MMM yyyy', { locale: id })} - ${format(new Date(endDate), 'dd MMM yyyy', { locale: id })}`
    } else if (startDate) {
      return `Sejak ${format(new Date(startDate), 'dd MMM yyyy', { locale: id })}`
    } else if (endDate) {
      return `Hingga ${format(new Date(endDate), 'dd MMM yyyy', { locale: id })}`
    }
    return 'Semua periode'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Laporan Astragraphia - Kontrak Mesin Xerox
              </CardTitle>
              <CardDescription>
                Monitoring penggunaan mesin xerox per klik dan estimasi tagihan bulanan
              </CardDescription>
            </div>
            {isOwner && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSettingsDialog(true)}
                className="flex items-center gap-2"
              >
                <Settings className="h-4 w-4" />
                Pengaturan Tarif
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="space-y-2">
              <Label htmlFor="startDate">Tanggal Mulai</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">Tanggal Selesai</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button 
                variant="outline" 
                onClick={handleClearFilters}
                disabled={!startDate && !endDate}
              >
                Clear Filter
              </Button>
            </div>
            <div className="flex items-end">
              <div className="text-sm text-muted-foreground">
                <Calendar className="h-4 w-4 inline mr-1" />
                {getDateRangeText()}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-gray-500 p-3 mr-4">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">⚫⚪ Hitam Putih</p>
                <p className="text-2xl font-bold">{statistics.bwClicks.toLocaleString()} klik</p>
                <p className="text-xs text-muted-foreground">Rp{statistics.bwCost.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-red-500 p-3 mr-4">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">🌈 Warna</p>
                <p className="text-2xl font-bold">{statistics.colorClicks.toLocaleString()} klik</p>
                <p className="text-xs text-muted-foreground">Rp{statistics.colorCost.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-orange-500 p-3 mr-4">
                <FileText className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">💰 Estimasi Tagihan</p>
                <p className="text-2xl font-bold text-orange-600">Rp{statistics.estimatedBill.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{Math.round(statistics.dailyAverage)} klik/hari</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Billing Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Informasi Tagihan Kontrak
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <h4 className="font-semibold">Detail Kontrak:</h4>
              <ul className="space-y-1 text-sm">
                <li>• Vendor: <strong>{settings.contractName}</strong></li>
                <li>• Tarif H&P: <strong>Rp{settings.bwRatePerClick.toLocaleString()}/klik</strong></li>
                <li>• Tarif Warna: <strong>Rp{settings.colorRatePerClick.toLocaleString()}/klik</strong></li>
                <li>• Min. H&P: <strong>Rp{settings.bwMinimumMonthlyCharge.toLocaleString()}/bulan</strong></li>
                <li>• Min. Warna: <strong>Rp{settings.colorMinimumMonthlyCharge.toLocaleString()}/bulan</strong></li>
                <li>• Periode laporan: {getDateRangeText()}</li>
                {settings.contractStartDate && (
                  <li>• Kontrak mulai: <strong>{format(new Date(settings.contractStartDate), 'dd MMM yyyy', { locale: id })}</strong></li>
                )}
                {settings.contractEndDate && (
                  <li>• Kontrak berakhir: <strong>{format(new Date(settings.contractEndDate), 'dd MMM yyyy', { locale: id })}</strong></li>
                )}
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">Analisis Biaya:</h4>
              <ul className="space-y-1 text-sm">
                <li>• H&P: <strong>{statistics.bwClicks.toLocaleString()} klik</strong> → Rp{statistics.bwCost.toLocaleString()}</li>
                <li>• Warna: <strong>{statistics.colorClicks.toLocaleString()} klik</strong> → Rp{statistics.colorCost.toLocaleString()}</li>
                <li>• Tagihan H&P: <strong>Rp{statistics.bwBill.toLocaleString()}</strong></li>
                <li>• Tagihan Warna: <strong>Rp{statistics.colorBill.toLocaleString()}</strong></li>
                <li>• <strong>Total Tagihan: <span className="text-orange-600">Rp{statistics.estimatedBill.toLocaleString()}</span></strong></li>
                {statistics.savingsFromMinimum > 0 && (
                  <li className="text-green-600">• Hemat dari minimum: <strong>Rp{statistics.savingsFromMinimum.toLocaleString()}</strong></li>
                )}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage Details Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detail Penggunaan Mesin Xerox</CardTitle>
          <CardDescription>
            Riwayat penggunaan mesin xerox berdasarkan transaksi produksi
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Material</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead className="text-right">Jumlah Klik</TableHead>
                <TableHead className="text-right">Biaya</TableHead>
                <TableHead>Transaksi</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Catatan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isMovementsLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <div className="flex items-center justify-center space-x-2">
                      <Clock className="h-4 w-4 animate-spin" />
                      <span>Memuat data...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredMovements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    <div className="flex flex-col items-center space-y-2">
                      <FileText className="h-12 w-12 opacity-50" />
                      <p>Tidak ada data penggunaan Astragraphia</p>
                      <p className="text-sm">
                        {startDate || endDate 
                          ? 'Tidak ada penggunaan pada periode yang dipilih'
                          : 'Pastikan material Astragraphia sudah ditambahkan dan digunakan dalam produksi'
                        }
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredMovements.slice(0, 100).map((movement) => {
                  const material = astragraphiaMaterials.find(m => m.id === movement.materialId)
                  const contractType = material ? detectContractType(material) : 'bw'
                  const rate = contractType === 'bw' ? settings.bwRatePerClick : settings.colorRatePerClick
                  
                  return (
                    <TableRow key={movement.id}>
                      <TableCell className="font-mono text-sm">
                        {format(parseISO(movement.createdAt), 'dd/MM/yyyy HH:mm', { locale: id })}
                      </TableCell>
                      <TableCell className="font-medium">
                        {getMaterialName(movement.materialId)}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={contractType === 'bw' ? 'bg-gray-100 text-gray-800' : 'bg-red-100 text-red-800'}
                        >
                          {contractType === 'bw' ? '⚫⚪ H&P' : '🌈 Warna'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {movement.quantity.toLocaleString()} klik
                      </TableCell>
                      <TableCell className="text-right font-semibold text-orange-600">
                        Rp{(movement.quantity * rate).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {movement.referenceId ? (
                          <Badge variant="outline" className="font-mono text-xs">
                            {movement.referenceId.slice(0, 8)}...
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {movement.userName}
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">
                        {movement.notes || '-'}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
          {filteredMovements.length > 100 && (
            <div className="mt-4 text-center text-sm text-muted-foreground">
              Menampilkan 100 data terbaru dari {filteredMovements.length} total penggunaan
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available Astragraphia Materials */}
      <Card>
        <CardHeader>
          <CardTitle>Material Astragraphia Terdaftar</CardTitle>
          <CardDescription>
            Daftar material yang terkait dengan kontrak Astragraphia
          </CardDescription>
        </CardHeader>
        <CardContent>
          {astragraphiaMaterials.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto opacity-50 mb-2" />
              <p>Belum ada material Astragraphia yang terdaftar</p>
              <p className="text-sm mt-2">
                Tambahkan material dengan nama/deskripsi yang mengandung "astragraphia", "xerox", atau "mesin cetak"
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama Material</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Satuan</TableHead>
                  <TableHead>Harga/Unit</TableHead>
                  <TableHead>Deskripsi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {astragraphiaMaterials.map((material) => (
                  <TableRow key={material.id}>
                    <TableCell className="font-medium">{material.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {material.type}
                      </Badge>
                    </TableCell>
                    <TableCell>{material.unit}</TableCell>
                    <TableCell>Rp{material.pricePerUnit.toLocaleString()}</TableCell>
                    <TableCell className="max-w-[300px] truncate">
                      {material.description || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Settings Dialog */}
      <AstragraphiaSettingsDialog 
        open={showSettingsDialog}
        onOpenChange={setShowSettingsDialog}
      />
    </div>
  )
}