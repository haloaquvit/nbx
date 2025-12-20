"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { Trash2, Plus, TrendingUp, Gift, Package } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { useProductPricing, usePricingMutations } from '@/hooks/usePricing'
import { CreateStockPricingRequest, CreateBonusPricingRequest } from '@/types/pricing'
import { formatCurrency } from '@/utils/currency'

interface ProductPricingManagementProps {
  productId: string
  productName: string
  basePrice: number
  currentStock: number
}

export function ProductPricingManagement({
  productId,
  productName,
  basePrice,
  currentStock
}: ProductPricingManagementProps) {
  const { toast } = useToast()
  const { data: productPricing, isLoading, refetch } = useProductPricing(productId)
  const {
    createStockPricing,
    createBonusPricing,
    deleteStockPricing,
    deleteBonusPricing,
    toggleStockPricingActive,
    toggleBonusPricingActive
  } = usePricingMutations()

  const [isStockDialogOpen, setIsStockDialogOpen] = useState(false)
  const [isBonusDialogOpen, setIsBonusDialogOpen] = useState(false)

  const [stockForm, setStockForm] = useState<CreateStockPricingRequest>({
    productId,
    minStock: 0,
    maxStock: undefined,
    price: basePrice
  })

  const [bonusForm, setBonusForm] = useState<CreateBonusPricingRequest>({
    productId,
    minQuantity: 1,
    maxQuantity: undefined,
    bonusQuantity: 0,
    bonusType: 'percentage',
    bonusValue: 0,
    description: ''
  })

  const handleCreateStockPricing = async () => {
    try {
      const result = await createStockPricing.mutateAsync(stockForm)
      if (result) {
        toast({
          title: "Berhasil",
          description: "Aturan harga berdasarkan stock berhasil ditambahkan"
        })
        setIsStockDialogOpen(false)
        setStockForm({
          productId,
          minStock: 0,
          maxStock: undefined,
          price: basePrice
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal menambahkan aturan harga"
      })
    }
  }

  const handleCreateBonusPricing = async () => {
    try {
      const result = await createBonusPricing.mutateAsync(bonusForm)
      if (result) {
        toast({
          title: "Berhasil",
          description: "Aturan bonus berhasil ditambahkan"
        })
        setIsBonusDialogOpen(false)
        setBonusForm({
          productId,
          minQuantity: 1,
          maxQuantity: undefined,
          bonusQuantity: 0,
          bonusType: 'percentage',
          bonusValue: 0,
          description: ''
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal menambahkan aturan bonus"
      })
    }
  }

  const handleDeleteStockPricing = async (id: string) => {
    try {
      const success = await deleteStockPricing.mutateAsync({ id, productId })
      if (success) {
        toast({
          title: "Berhasil",
          description: "Aturan harga berhasil dihapus"
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal menghapus aturan harga"
      })
    }
  }

  const handleDeleteBonusPricing = async (id: string) => {
    try {
      const success = await deleteBonusPricing.mutateAsync({ id, productId })
      if (success) {
        toast({
          title: "Berhasil",
          description: "Aturan bonus berhasil dihapus"
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal menghapus aturan bonus"
      })
    }
  }

  const handleToggleStockPricing = async (id: string, isActive: boolean) => {
    try {
      const success = await toggleStockPricingActive.mutateAsync({ id, productId, isActive })
      if (success) {
        toast({
          title: "Berhasil",
          description: `Aturan harga ${isActive ? 'diaktifkan' : 'dinonaktifkan'}`
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal mengubah status aturan harga"
      })
    }
  }

  const handleToggleBonusPricing = async (id: string, isActive: boolean) => {
    try {
      const success = await toggleBonusPricingActive.mutateAsync({ id, productId, isActive })
      if (success) {
        toast({
          title: "Berhasil",
          description: `Aturan bonus ${isActive ? 'diaktifkan' : 'dinonaktifkan'}`
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal mengubah status aturan bonus"
      })
    }
  }

  if (isLoading) {
    return <div>Loading pricing information...</div>
  }

  return (
    <div className="space-y-6">
      {/* Product Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {productName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-sm font-medium">Harga Dasar</Label>
              <p className="text-lg font-bold text-green-600">
                {formatCurrency(basePrice)}
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium">Stock Saat Ini</Label>
              <p className="text-lg font-bold text-blue-600">
                {currentStock} pcs
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium">Harga Efektif</Label>
              <p className="text-lg font-bold text-purple-600">
                {productPricing?.finalPrice 
                  ? formatCurrency(productPricing.finalPrice)
                  : formatCurrency(basePrice)
                }
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quantity-Based Pricing */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Aturan Harga Berdasarkan Jumlah Pembelian
            </CardTitle>
            <Dialog open={isStockDialogOpen} onOpenChange={setIsStockDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Tambah Aturan
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Tambah Aturan Harga Berdasarkan Jumlah Pembelian</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="minStock">Qty Minimum</Label>
                    <Input
                      id="minStock"
                      type="number"
                      value={stockForm.minStock}
                      onChange={(e) => setStockForm(prev => ({
                        ...prev,
                        minStock: parseInt(e.target.value) || 0
                      }))}
                      placeholder="Jumlah pembelian minimum"
                    />
                  </div>
                  <div>
                    <Label htmlFor="maxStock">Qty Maximum (opsional)</Label>
                    <Input
                      id="maxStock"
                      type="number"
                      value={stockForm.maxStock || ''}
                      onChange={(e) => setStockForm(prev => ({
                        ...prev,
                        maxStock: e.target.value ? parseInt(e.target.value) : undefined
                      }))}
                      placeholder="Kosongkan untuk tanpa batas"
                    />
                  </div>
                  <div>
                    <Label htmlFor="price">Harga</Label>
                    <Input
                      id="price"
                      type="number"
                      value={stockForm.price}
                      onChange={(e) => setStockForm(prev => ({
                        ...prev,
                        price: parseFloat(e.target.value) || 0
                      }))}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={handleCreateStockPricing}
                      disabled={createStockPricing.isPending}
                    >
                      {createStockPricing.isPending ? "Menyimpan..." : "Simpan"}
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => setIsStockDialogOpen(false)}
                    >
                      Batal
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {productPricing?.stockPricings.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Belum ada aturan harga berdasarkan jumlah pembelian
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Qty Min</TableHead>
                  <TableHead>Qty Max</TableHead>
                  <TableHead>Harga</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productPricing?.stockPricings.map((rule) => (
                  <TableRow key={rule.id} className={!rule.isActive ? 'opacity-50' : ''}>
                    <TableCell>{rule.minStock}</TableCell>
                    <TableCell>{rule.maxStock || 'Tanpa batas'}</TableCell>
                    <TableCell className="font-semibold">
                      {formatCurrency(rule.price)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={rule.isActive}
                          onCheckedChange={(checked) => handleToggleStockPricing(rule.id, checked)}
                        />
                        <span className="text-sm text-muted-foreground">
                          {rule.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteStockPricing(rule.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Bonus Pricing */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5" />
              Aturan Bonus
            </CardTitle>
            <Dialog open={isBonusDialogOpen} onOpenChange={setIsBonusDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Tambah Bonus
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Tambah Aturan Bonus</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="minQuantity">Quantity Minimum</Label>
                    <Input
                      id="minQuantity"
                      type="number"
                      value={bonusForm.minQuantity}
                      onChange={(e) => setBonusForm(prev => ({
                        ...prev,
                        minQuantity: parseInt(e.target.value) || 1
                      }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="maxQuantity">Quantity Maximum (opsional)</Label>
                    <Input
                      id="maxQuantity"
                      type="number"
                      value={bonusForm.maxQuantity || ''}
                      onChange={(e) => setBonusForm(prev => ({
                        ...prev,
                        maxQuantity: e.target.value ? parseInt(e.target.value) : undefined
                      }))}
                      placeholder="Kosongkan untuk tanpa batas"
                    />
                  </div>
                  <div>
                    <Label htmlFor="bonusType">Tipe Bonus</Label>
                    <Select
                      value={bonusForm.bonusType}
                      onValueChange={(value: 'quantity' | 'percentage' | 'fixed_discount') => 
                        setBonusForm(prev => ({ ...prev, bonusType: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="quantity">Bonus Quantity</SelectItem>
                        <SelectItem value="percentage">Diskon Persentase</SelectItem>
                        <SelectItem value="fixed_discount">Diskon Tetap</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="bonusValue">
                      {bonusForm.bonusType === 'quantity' && 'Bonus Quantity'}
                      {bonusForm.bonusType === 'percentage' && 'Persentase Diskon (%)'}
                      {bonusForm.bonusType === 'fixed_discount' && 'Nilai Diskon (Rp)'}
                    </Label>
                    <Input
                      id="bonusValue"
                      type="number"
                      value={bonusForm.bonusValue}
                      onChange={(e) => setBonusForm(prev => ({
                        ...prev,
                        bonusValue: parseFloat(e.target.value) || 0
                      }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Deskripsi (opsional)</Label>
                    <Textarea
                      id="description"
                      value={bonusForm.description}
                      onChange={(e) => setBonusForm(prev => ({
                        ...prev,
                        description: e.target.value
                      }))}
                      placeholder="Deskripsi bonus..."
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={handleCreateBonusPricing}
                      disabled={createBonusPricing.isPending}
                    >
                      {createBonusPricing.isPending ? "Menyimpan..." : "Simpan"}
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => setIsBonusDialogOpen(false)}
                    >
                      Batal
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {productPricing?.bonusPricings.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Belum ada aturan bonus
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Qty Min</TableHead>
                  <TableHead>Qty Max</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Nilai</TableHead>
                  <TableHead>Deskripsi</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productPricing?.bonusPricings.map((bonus) => (
                  <TableRow key={bonus.id} className={!bonus.isActive ? 'opacity-50' : ''}>
                    <TableCell>{bonus.minQuantity}</TableCell>
                    <TableCell>{bonus.maxQuantity || 'Tanpa batas'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {bonus.bonusType === 'quantity' && 'Bonus Qty'}
                        {bonus.bonusType === 'percentage' && 'Diskon %'}
                        {bonus.bonusType === 'fixed_discount' && 'Diskon Tetap'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {bonus.bonusType === 'quantity' && `+${bonus.bonusValue} pcs`}
                      {bonus.bonusType === 'percentage' && `${bonus.bonusValue}%`}
                      {bonus.bonusType === 'fixed_discount' && formatCurrency(bonus.bonusValue)}
                    </TableCell>
                    <TableCell>{bonus.description || '-'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={bonus.isActive}
                          onCheckedChange={(checked) => handleToggleBonusPricing(bonus.id, checked)}
                        />
                        <span className="text-sm text-muted-foreground">
                          {bonus.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteBonusPricing(bonus.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}