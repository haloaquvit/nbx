"use client"

import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { Plus, FileText, Search, Loader2, Trash2, Edit, Send, CheckCircle, XCircle, ArrowRight, Eye } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useBranch } from '@/contexts/BranchContext'
import { useCustomers } from '@/hooks/useCustomers'
import { useProducts } from '@/hooks/useProducts'
import { quotationService, Quotation, QuotationItem } from '@/services/quotationService'
import { format } from 'date-fns'
import { id as localeId } from 'date-fns/locale/id'
import { formatCurrency } from '@/utils/currency'

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  accepted: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  expired: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  converted: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Terkirim',
  accepted: 'Diterima',
  rejected: 'Ditolak',
  expired: 'Kadaluarsa',
  converted: 'Jadi Invoice',
}

export default function QuotationsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const { currentBranch } = useBranch()
  const { toast } = useToast()
  const { customers } = useCustomers()
  const { products } = useProducts()

  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Dialog states
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Form states
  const [formData, setFormData] = useState({
    customer_id: '',
    customer_name: '',
    customer_address: '',
    customer_phone: '',
    valid_until: '',
    notes: '',
    terms: 'Harga belum termasuk PPN\nBerlaku 7 hari sejak tanggal penawaran\nPembayaran: Cash / Transfer',
  })
  const [items, setItems] = useState<QuotationItem[]>([])

  // Load quotations
  useEffect(() => {
    if (currentBranch?.id) {
      loadQuotations()
    }
  }, [currentBranch?.id])

  // Check if coming from customer map with customerId
  useEffect(() => {
    const customerId = searchParams.get('customerId')
    if (customerId && customers) {
      const customer = customers.find((c) => c.id === customerId)
      if (customer) {
        setFormData((prev) => ({
          ...prev,
          customer_id: customer.id,
          customer_name: customer.name,
          customer_address: customer.address || '',
          customer_phone: customer.phone || '',
        }))
        setIsFormOpen(true)
      }
    }
  }, [searchParams, customers])

  const loadQuotations = async () => {
    if (!currentBranch?.id) return

    setIsLoading(true)
    try {
      const result = await quotationService.getQuotations(currentBranch.id, {
        status: statusFilter !== 'all' ? statusFilter : undefined,
      })
      setQuotations(result.data)
    } catch (err) {
      console.error('Error loading quotations:', err)
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Gagal memuat data penawaran',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleCustomerChange = (customerId: string) => {
    const customer = customers?.find((c) => c.id === customerId)
    if (customer) {
      setFormData((prev) => ({
        ...prev,
        customer_id: customer.id,
        customer_name: customer.name,
        customer_address: customer.address || '',
        customer_phone: customer.phone || '',
      }))
    }
  }

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        product_id: '',
        product_name: '',
        product_type: '',
        quantity: 1,
        unit: 'pcs',
        unit_price: 0,
        discount_percent: 0,
        discount_amount: 0,
        subtotal: 0,
      },
    ])
  }

  const handleItemChange = (index: number, field: keyof QuotationItem, value: any) => {
    setItems((prev) => {
      const newItems = [...prev]
      newItems[index] = { ...newItems[index], [field]: value }

      // Recalculate subtotal
      const item = newItems[index]
      const baseAmount = item.quantity * item.unit_price
      const discountAmount = item.discount_percent
        ? (baseAmount * item.discount_percent) / 100
        : item.discount_amount || 0
      item.discount_amount = discountAmount
      item.subtotal = baseAmount - discountAmount

      return newItems
    })
  }

  const handleProductSelect = (index: number, productId: string) => {
    const product = products?.find((p) => p.id === productId)
    if (product) {
      setItems((prev) => {
        const newItems = [...prev]
        newItems[index] = {
          ...newItems[index],
          product_id: product.id,
          product_name: product.name,
          product_type: product.type,
          unit: 'pcs',
          unit_price: product.basePrice,
          subtotal: product.basePrice,
        }
        return newItems
      })
    }
  }

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const calculateTotals = () => {
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0)
    return { subtotal, total: subtotal }
  }

  const handleSubmit = async () => {
    if (!currentBranch?.id || !user) {
      toast({ variant: 'destructive', title: 'Error', description: 'Data tidak lengkap' })
      return
    }

    if (!formData.customer_id) {
      toast({ variant: 'destructive', title: 'Error', description: 'Pilih pelanggan' })
      return
    }

    if (items.length === 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Tambahkan minimal 1 item' })
      return
    }

    const { subtotal, total } = calculateTotals()

    setIsSaving(true)
    try {
      if (isEditing && selectedQuotation) {
        await quotationService.updateQuotation(
          selectedQuotation.id!,
          {
            ...formData,
            subtotal,
            total,
          },
          items
        )
        toast({ title: 'Berhasil', description: 'Penawaran berhasil diperbarui' })
      } else {
        await quotationService.createQuotation(
          {
            ...formData,
            quotation_date: new Date().toISOString(),
            status: 'draft',
            subtotal,
            total,
            created_by: user.id,
            created_by_name: user.name,
            branch_id: currentBranch.id,
          },
          items
        )
        toast({ title: 'Berhasil', description: 'Penawaran berhasil dibuat' })
      }

      setIsFormOpen(false)
      resetForm()
      loadQuotations()
    } catch (err) {
      console.error('Error saving quotation:', err)
      toast({ variant: 'destructive', title: 'Gagal', description: 'Tidak dapat menyimpan penawaran' })
    } finally {
      setIsSaving(false)
    }
  }

  const resetForm = () => {
    setFormData({
      customer_id: '',
      customer_name: '',
      customer_address: '',
      customer_phone: '',
      valid_until: '',
      notes: '',
      terms: 'Harga belum termasuk PPN\nBerlaku 7 hari sejak tanggal penawaran\nPembayaran: Cash / Transfer',
    })
    setItems([])
    setSelectedQuotation(null)
    setIsEditing(false)
  }

  const handleEdit = async (quotation: Quotation) => {
    const fullQuotation = await quotationService.getQuotationById(quotation.id!)
    if (fullQuotation) {
      setSelectedQuotation(fullQuotation)
      setFormData({
        customer_id: fullQuotation.customer_id,
        customer_name: fullQuotation.customer_name,
        customer_address: fullQuotation.customer_address || '',
        customer_phone: fullQuotation.customer_phone || '',
        valid_until: fullQuotation.valid_until || '',
        notes: fullQuotation.notes || '',
        terms: fullQuotation.terms || '',
      })
      setItems(fullQuotation.items || [])
      setIsEditing(true)
      setIsFormOpen(true)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Yakin ingin menghapus penawaran ini?')) return

    try {
      await quotationService.deleteQuotation(id)
      toast({ title: 'Berhasil', description: 'Penawaran berhasil dihapus' })
      loadQuotations()
    } catch (err) {
      toast({ variant: 'destructive', title: 'Gagal', description: 'Tidak dapat menghapus penawaran' })
    }
  }

  const handleStatusChange = async (id: string, status: Quotation['status']) => {
    try {
      await quotationService.updateStatus(id, status)
      toast({ title: 'Berhasil', description: `Status berhasil diubah ke ${STATUS_LABELS[status]}` })
      loadQuotations()
    } catch (err) {
      toast({ variant: 'destructive', title: 'Gagal', description: 'Tidak dapat mengubah status' })
    }
  }

  const filteredQuotations = quotations.filter((q) => {
    const qNumber = q.quotation_number || q.id || ''
    const matchesSearch =
      qNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (q.customer_name || '').toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || q.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const { subtotal: formSubtotal, total: formTotal } = calculateTotals()

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Penawaran Harga
              </CardTitle>
              <CardDescription>Kelola penawaran harga untuk pelanggan</CardDescription>
            </div>
            <Button
              onClick={() => {
                resetForm()
                setIsFormOpen(true)
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Buat Penawaran
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari nomor atau nama pelanggan..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Terkirim</SelectItem>
                <SelectItem value="accepted">Diterima</SelectItem>
                <SelectItem value="rejected">Ditolak</SelectItem>
                <SelectItem value="converted">Jadi Invoice</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Quotations List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredQuotations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Belum ada penawaran</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredQuotations.map((quotation) => (
                <Card key={quotation.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium">{quotation.quotation_number || quotation.id}</span>
                          <Badge className={STATUS_COLORS[quotation.status] || STATUS_COLORS.draft}>
                            {STATUS_LABELS[quotation.status] || 'Draft'}
                          </Badge>
                        </div>
                        <p className="font-medium">{quotation.customer_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {quotation.quotation_date || quotation.created_at
                            ? format(new Date(quotation.quotation_date || quotation.created_at!), 'd MMM yyyy', { locale: localeId })
                            : '-'}
                          {quotation.valid_until && (
                            <> - Berlaku s/d {format(new Date(quotation.valid_until), 'd MMM yyyy', { locale: localeId })}</>
                          )}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold">{formatCurrency(quotation.total)}</p>
                        <div className="flex gap-1 mt-2 justify-end flex-wrap">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(quotation)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {quotation.status === 'draft' && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => handleEdit(quotation)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleStatusChange(quotation.id!, 'sent')}
                              >
                                <Send className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {quotation.status === 'sent' && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-green-600"
                                onClick={() => handleStatusChange(quotation.id!, 'accepted')}
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600"
                                onClick={() => handleStatusChange(quotation.id!, 'rejected')}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {quotation.status === 'accepted' && !quotation.converted_to_invoice_id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-purple-600"
                              onClick={() => navigate(`/pos?fromQuotation=${quotation.id}`)}
                            >
                              <ArrowRight className="h-4 w-4 mr-1" />
                              Invoice
                            </Button>
                          )}
                          {quotation.status === 'draft' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600"
                              onClick={() => handleDelete(quotation.id!)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Penawaran' : 'Buat Penawaran Baru'}</DialogTitle>
            <DialogDescription>
              Isi detail penawaran harga untuk pelanggan
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Customer Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Pelanggan *</Label>
                <Select value={formData.customer_id} onValueChange={handleCustomerChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih pelanggan" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers?.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Berlaku Hingga</Label>
                <Input
                  type="date"
                  value={formData.valid_until}
                  onChange={(e) => setFormData((prev) => ({ ...prev, valid_until: e.target.value }))}
                />
              </div>
            </div>

            {formData.customer_name && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="font-medium">{formData.customer_name}</p>
                <p className="text-muted-foreground">{formData.customer_address}</p>
                <p className="text-muted-foreground">{formData.customer_phone}</p>
              </div>
            )}

            {/* Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Item Penawaran</Label>
                <Button variant="outline" size="sm" onClick={handleAddItem}>
                  <Plus className="h-4 w-4 mr-1" />
                  Tambah Item
                </Button>
              </div>

              {items.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Belum ada item. Klik "Tambah Item" untuk menambahkan.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item, index) => (
                    <Card key={index}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <span className="text-sm font-medium text-muted-foreground">Item #{index + 1}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 h-6 w-6 p-0"
                            onClick={() => handleRemoveItem(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="col-span-2 sm:col-span-2 space-y-1">
                            <Label className="text-xs">Produk</Label>
                            <Select
                              value={item.product_id || ''}
                              onValueChange={(v) => handleProductSelect(index, v)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Pilih produk" />
                              </SelectTrigger>
                              <SelectContent>
                                {products?.map((product) => (
                                  <SelectItem key={product.id} value={product.id}>
                                    {product.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Qty</Label>
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => handleItemChange(index, 'quantity', Number(e.target.value))}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Harga Satuan</Label>
                            <Input
                              type="number"
                              value={item.unit_price}
                              onChange={(e) => handleItemChange(index, 'unit_price', Number(e.target.value))}
                            />
                          </div>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t">
                          <span className="text-sm text-muted-foreground">Subtotal:</span>
                          <span className="font-medium">{formatCurrency(item.subtotal)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Notes & Terms */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Catatan</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Catatan tambahan..."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Syarat & Ketentuan</Label>
                <Textarea
                  value={formData.terms}
                  onChange={(e) => setFormData((prev) => ({ ...prev, terms: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>

            {/* Totals */}
            {items.length > 0 && (
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex justify-between items-center text-lg font-bold">
                  <span>Total:</span>
                  <span>{formatCurrency(formTotal)}</span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSaving}>
              Batal
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <FileText className="mr-2 h-4 w-4" />
                  {isEditing ? 'Simpan Perubahan' : 'Buat Penawaran'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
