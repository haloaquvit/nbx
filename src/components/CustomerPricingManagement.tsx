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
import { Trash2, Plus, Users, User, Store, Home } from 'lucide-react'
import { useCustomerPricings, useCustomerPricingMutations } from '@/hooks/usePricing'
import { useCustomers } from '@/hooks/useCustomers'
import { CreateCustomerPricingRequest, CustomerPricingType, CustomerClassificationType } from '@/types/pricing'
import { formatCurrency } from '@/utils/currency'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { Check, ChevronsUpDown } from 'lucide-react'

interface CustomerPricingManagementProps {
  productId: string
  productName: string
  basePrice: number
}

export function CustomerPricingManagement({
  productId,
  productName,
  basePrice
}: CustomerPricingManagementProps) {
  const { toast } = useToast()
  const { data: customerPricings, isLoading } = useCustomerPricings(productId)
  const { customers } = useCustomers()
  const { createCustomerPricing, deleteCustomerPricing } = useCustomerPricingMutations()

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [targetType, setTargetType] = useState<'classification' | 'customer'>('classification')
  const [customerOpen, setCustomerOpen] = useState(false)

  const [form, setForm] = useState<CreateCustomerPricingRequest>({
    productId,
    customerClassification: 'Rumahan',
    priceType: 'fixed',
    priceValue: basePrice,
    description: ''
  })

  const resetForm = () => {
    setForm({
      productId,
      customerClassification: 'Rumahan',
      priceType: 'fixed',
      priceValue: basePrice,
      description: ''
    })
    setTargetType('classification')
  }

  const handleCreate = async () => {
    try {
      // Validate
      if (targetType === 'customer' && !form.customerId) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Pilih pelanggan terlebih dahulu"
        })
        return
      }

      const request: CreateCustomerPricingRequest = {
        productId,
        priceType: form.priceType,
        priceValue: form.priceValue,
        description: form.description
      }

      if (targetType === 'classification') {
        request.customerClassification = form.customerClassification
      } else {
        request.customerId = form.customerId
      }

      const result = await createCustomerPricing.mutateAsync(request)
      if (result) {
        toast({
          title: "Berhasil",
          description: "Aturan harga pelanggan berhasil ditambahkan"
        })
        setIsDialogOpen(false)
        resetForm()
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal menambahkan aturan harga"
      })
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const success = await deleteCustomerPricing.mutateAsync({ id, productId })
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

  const getPriceTypeLabel = (type: CustomerPricingType) => {
    switch (type) {
      case 'fixed': return 'Harga Tetap'
      case 'discount_percentage': return 'Diskon %'
      case 'discount_amount': return 'Potongan Rp'
    }
  }

  const formatPriceValue = (type: CustomerPricingType, value: number) => {
    switch (type) {
      case 'fixed': return formatCurrency(value)
      case 'discount_percentage': return `${value}%`
      case 'discount_amount': return `-${formatCurrency(value)}`
    }
  }

  const calculateFinalPrice = (type: CustomerPricingType, value: number) => {
    switch (type) {
      case 'fixed': return value
      case 'discount_percentage': return basePrice - (basePrice * value / 100)
      case 'discount_amount': return Math.max(0, basePrice - value)
    }
  }

  if (isLoading) {
    return <div>Loading customer pricing...</div>
  }

  // Separate pricings by type
  const classificationPricings = customerPricings?.filter(p => p.customerClassification) || []
  const customerSpecificPricings = customerPricings?.filter(p => p.customerId) || []

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Harga Berdasarkan Pelanggan
          </CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={resetForm}>
                <Plus className="h-4 w-4 mr-2" />
                Tambah Aturan
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Tambah Aturan Harga Pelanggan</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Target Type */}
                <div>
                  <Label>Target Aturan</Label>
                  <Select
                    value={targetType}
                    onValueChange={(value: 'classification' | 'customer') => {
                      setTargetType(value)
                      if (value === 'classification') {
                        setForm(prev => ({
                          ...prev,
                          customerId: undefined,
                          customerClassification: 'Rumahan'
                        }))
                      } else {
                        setForm(prev => ({
                          ...prev,
                          customerClassification: undefined,
                          customerId: undefined
                        }))
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="classification">
                        <div className="flex items-center gap-2">
                          <Store className="h-4 w-4" />
                          Kategori Pelanggan
                        </div>
                      </SelectItem>
                      <SelectItem value="customer">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          Pelanggan Tertentu
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Classification or Customer Selection */}
                {targetType === 'classification' ? (
                  <div>
                    <Label>Kategori Pelanggan</Label>
                    <Select
                      value={form.customerClassification || 'Rumahan'}
                      onValueChange={(value: CustomerClassificationType) =>
                        setForm(prev => ({ ...prev, customerClassification: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Rumahan">
                          <div className="flex items-center gap-2">
                            <Home className="h-4 w-4" />
                            Rumahan
                          </div>
                        </SelectItem>
                        <SelectItem value="Kios/Toko">
                          <div className="flex items-center gap-2">
                            <Store className="h-4 w-4" />
                            Kios/Toko
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div>
                    <Label>Pilih Pelanggan</Label>
                    <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={customerOpen}
                          className="w-full justify-between"
                        >
                          {form.customerId
                            ? customers?.find(c => c.id === form.customerId)?.name
                            : "Pilih pelanggan..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0">
                        <Command>
                          <CommandInput placeholder="Cari pelanggan..." />
                          <CommandList>
                            <CommandEmpty>Pelanggan tidak ditemukan.</CommandEmpty>
                            <CommandGroup className="max-h-64 overflow-auto">
                              {customers?.map(customer => (
                                <CommandItem
                                  key={customer.id}
                                  value={customer.name}
                                  onSelect={() => {
                                    setForm(prev => ({ ...prev, customerId: customer.id }))
                                    setCustomerOpen(false)
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      form.customerId === customer.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <div className="flex flex-col">
                                    <span>{customer.name}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {customer.classification || 'Tidak ada kategori'} - {customer.address}
                                    </span>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}

                {/* Price Type */}
                <div>
                  <Label>Tipe Harga</Label>
                  <Select
                    value={form.priceType}
                    onValueChange={(value: CustomerPricingType) =>
                      setForm(prev => ({ ...prev, priceType: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Harga Tetap (Rp)</SelectItem>
                      <SelectItem value="discount_percentage">Diskon Persentase (%)</SelectItem>
                      <SelectItem value="discount_amount">Potongan Tetap (Rp)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Price Value */}
                <div>
                  <Label>
                    {form.priceType === 'fixed' && 'Harga (Rp)'}
                    {form.priceType === 'discount_percentage' && 'Persentase Diskon (%)'}
                    {form.priceType === 'discount_amount' && 'Nilai Potongan (Rp)'}
                  </Label>
                  <Input
                    type="number"
                    value={form.priceValue}
                    onChange={(e) => setForm(prev => ({
                      ...prev,
                      priceValue: parseFloat(e.target.value) || 0
                    }))}
                  />
                  {form.priceType !== 'fixed' && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Harga akhir: {formatCurrency(calculateFinalPrice(form.priceType, form.priceValue))}
                    </p>
                  )}
                </div>

                {/* Description */}
                <div>
                  <Label>Keterangan (opsional)</Label>
                  <Textarea
                    value={form.description || ''}
                    onChange={(e) => setForm(prev => ({
                      ...prev,
                      description: e.target.value
                    }))}
                    placeholder="Keterangan aturan harga..."
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    onClick={handleCreate}
                    disabled={createCustomerPricing.isPending}
                  >
                    {createCustomerPricing.isPending ? "Menyimpan..." : "Simpan"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Batal
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Classification-based Pricing */}
        <div>
          <h4 className="font-semibold mb-2 flex items-center gap-2">
            <Store className="h-4 w-4" />
            Berdasarkan Kategori Pelanggan
          </h4>
          {classificationPricings.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">
              Belum ada aturan harga berdasarkan kategori
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Nilai</TableHead>
                  <TableHead>Harga Akhir</TableHead>
                  <TableHead>Keterangan</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classificationPricings.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {rule.customerClassification === 'Rumahan' ? (
                          <Home className="h-4 w-4" />
                        ) : (
                          <Store className="h-4 w-4" />
                        )}
                        {rule.customerClassification}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {getPriceTypeLabel(rule.priceType)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-semibold">
                      {formatPriceValue(rule.priceType, rule.priceValue)}
                    </TableCell>
                    <TableCell className="font-bold text-green-600">
                      {formatCurrency(calculateFinalPrice(rule.priceType, rule.priceValue))}
                    </TableCell>
                    <TableCell>{rule.description || '-'}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(rule.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Customer-specific Pricing */}
        <div>
          <h4 className="font-semibold mb-2 flex items-center gap-2">
            <User className="h-4 w-4" />
            Berdasarkan Pelanggan Tertentu
          </h4>
          {customerSpecificPricings.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">
              Belum ada aturan harga khusus pelanggan
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pelanggan</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Nilai</TableHead>
                  <TableHead>Harga Akhir</TableHead>
                  <TableHead>Keterangan</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customerSpecificPricings.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        {rule.customerName || 'Unknown'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {getPriceTypeLabel(rule.priceType)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-semibold">
                      {formatPriceValue(rule.priceType, rule.priceValue)}
                    </TableCell>
                    <TableCell className="font-bold text-green-600">
                      {formatCurrency(calculateFinalPrice(rule.priceType, rule.priceValue))}
                    </TableCell>
                    <TableCell>{rule.description || '-'}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(rule.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Info */}
        <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-700">
          <strong>Catatan:</strong> Harga pelanggan tertentu memiliki prioritas lebih tinggi dari kategori pelanggan.
          Jika pelanggan memiliki aturan khusus, aturan tersebut akan digunakan terlebih dahulu.
        </div>
      </CardContent>
    </Card>
  )
}
