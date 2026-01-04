"use client"
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumberInput } from '@/components/ui/number-input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Badge } from './ui/badge'
import { Product } from '@/types/product'
import { Material } from '@/types/material'
import { PlusCircle, Trash2, ChevronDown, ChevronUp, ShoppingBag, Search, X, MinusCircle } from 'lucide-react'
import { Textarea } from './ui/textarea'
import { useToast } from './ui/use-toast'
import { useProducts } from '@/hooks/useProducts'
import { Skeleton } from './ui/skeleton'
import { Link } from 'react-router-dom'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuth } from '@/hooks/useAuth'
import { isUserRole } from '@/utils/roleUtils'
import { useNavigate } from 'react-router-dom'
import { useProductStockMovements, STOCK_OUT_REASONS } from '@/hooks/useProductStockMovements'

interface ProductManagementProps {
  materials?: Material[]
}

const EMPTY_FORM_DATA: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  category: 'indoor',
  type: 'Produksi', // Produksi = dari BOM, Jual Langsung = beli jadi
  basePrice: 0,
  costPrice: 0, // Harga pokok untuk produk Jual Langsung
  unit: 'pcs',
  initialStock: 0, // Stock awal untuk balancing
  currentStock: 0, // Keep for UI, but won't be saved to DB
  minStock: 1, // Keep for UI, but won't be saved to DB
  minOrder: 1,
  description: '',
  specifications: [],
  materials: []
};

export const ProductManagement = ({ materials = [] }: ProductManagementProps) => {
  const { toast } = useToast()
  const { products, isLoading, upsertProduct, deleteProduct } = useProducts()
  const { createStockOut } = useProductStockMovements()
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [formData, setFormData] = useState(EMPTY_FORM_DATA)
  const [isProductListOpen, setIsProductListOpen] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState<'indoor' | 'outdoor' | ''>('')
  const { user } = useAuth()
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [isMaterialDetailsOpen, setMaterialDetailsOpen] = useState(false);
  const navigate = useNavigate()

  // Stock Out Dialog State
  const [stockOutDialogOpen, setStockOutDialogOpen] = useState(false)
  const [stockOutProduct, setStockOutProduct] = useState<Product | null>(null)
  const [stockOutQuantity, setStockOutQuantity] = useState(0)
  const [stockOutReason, setStockOutReason] = useState('')
  const [stockOutNotes, setStockOutNotes] = useState('')

  const canManageProducts = user && ['admin', 'owner', 'supervisor', 'cashier', 'designer'].includes(user.role)
  const canDeleteProducts = user && ['admin', 'owner'].includes(user.role)
  const canEditAllProducts = user && ['admin', 'owner', 'supervisor', 'cashier'].includes(user.role)
  const isDesigner = isUserRole(user, 'designer')


  // Filter products based on search query and filters
  const filteredProducts = products?.filter(product => {
    const matchesCategory = !categoryFilter || product.category === categoryFilter
    
    return matchesCategory
  }) || []

  const hasActiveFilters = categoryFilter

  const clearAllFilters = () => {
    setCategoryFilter("")
  }

  const handleEditClick = (product: Product) => {
    setEditingProduct(product)
    setFormData({
      name: product.name,
      category: product.category,
      type: product.type || 'Produksi',
      basePrice: product.basePrice,
      costPrice: product.costPrice || 0,
      unit: product.unit || 'pcs',
      initialStock: product.initialStock || 0,
      currentStock: product.currentStock || 0,
      minStock: product.minStock || 1,
      minOrder: product.minOrder,
      description: product.description || '',
      specifications: product.specifications || [],
      materials: product.materials || []
    })
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const handleCancelEdit = () => {
    setEditingProduct(null)
    setFormData(EMPTY_FORM_DATA)
  }

  const handleDeleteClick = (productId: string) => {
    deleteProduct.mutate(productId, {
      onSuccess: () => {
        toast({ title: "Sukses!", description: "Produk berhasil dihapus." })
      },
      onError: (error) => {
        toast({ variant: "destructive", title: "Gagal!", description: error.message })
      }
    })
  }

  const handleSpecChange = (index: number, field: 'key' | 'value', value: string) => {
    const newSpecs = formData.specifications.map((spec, i) => i === index ? { ...spec, [field]: value } : spec)
    setFormData({ ...formData, specifications: newSpecs })
  }

  const addSpec = () => setFormData({ ...formData, specifications: [...formData.specifications, { key: '', value: '' }] })
  const removeSpec = (index: number) => setFormData({ ...formData, specifications: formData.specifications.filter((_, i) => i !== index) })

  // Helper functions for stock movements display
  const getMovementTypeColor = (type: string) => {
    switch (type) {
      case 'OUT': return 'bg-red-100 text-red-800'
      case 'IN': return 'bg-green-100 text-green-800'
      case 'ADJUSTMENT': return 'bg-blue-100 text-blue-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getMovementTypeLabel = (type: string) => {
    switch (type) {
      case 'OUT': return 'Keluar'
      case 'IN': return 'Masuk'
      case 'ADJUSTMENT': return 'Penyesuaian'
      default: return type
    }
  }

  const getReasonLabel = (reason: string) => {
    switch (reason) {
      case 'SALES': return 'Penjualan'
      case 'PRODUCTION': return 'Produksi'
      case 'PURCHASE': return 'Pembelian'
      case 'ADJUSTMENT': return 'Penyesuaian'
      case 'RETURN': return 'Pengembalian'
      default: return reason
    }
  }

  const handleBomChange = (index: number, field: 'materialId' | 'quantity' | 'notes', value: string | number) => {
    const newBom = formData.materials.map((item, i) => i === index ? { ...item, [field]: value } : item)
    setFormData({ ...formData, materials: newBom })
  }

  const addBomItem = () => setFormData({ ...formData, materials: [...formData.materials, { materialId: '', quantity: 0, notes: '' }] })
  const removeBomItem = (index: number) => setFormData({ ...formData, materials: formData.materials.filter((_, i) => i !== index) })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validation: BOM required if user is designer and materials are expected
    if (isDesigner && (!formData.materials || formData.materials.length === 0)) {
      toast({ 
        variant: "destructive", 
        title: "BOM Wajib!", 
        description: "Produk wajib memiliki Bill of Materials (BOM). Silakan tambahkan minimal 1 bahan." 
      })
      return
    }

    // Validation: BOM items must have materialId and quantity > 0
    if (formData.materials && formData.materials.length > 0) {
      const invalidBomItems = formData.materials.some(item => !item.materialId || item.quantity <= 0)
      if (invalidBomItems) {
        toast({ 
          variant: "destructive", 
          title: "BOM Tidak Valid!", 
          description: "Semua item BOM harus memiliki bahan dan jumlah yang valid." 
        })
        return
      }
    }
    
    const productData: Partial<Product> = {
      ...formData,
      id: editingProduct?.id,
    }
    upsertProduct.mutate(productData, {
      onSuccess: (savedProduct) => {
        toast({ title: "Sukses!", description: `Produk "${savedProduct.name}" berhasil ${editingProduct ? 'diperbarui' : 'ditambahkan'}.` })
        handleCancelEdit()
      },
      onError: (error) => {
        toast({ variant: "destructive", title: "Gagal!", description: error.message })
      }
    })
  }

  const openMaterialDetails = (materialId: string) => {
    const material = materials.find((m) => m.id === materialId);
    if (material) {
      setSelectedMaterial(material);
      setMaterialDetailsOpen(true);
    }
  };

  const closeMaterialDetails = () => {
    setSelectedMaterial(null);
    setMaterialDetailsOpen(false);
  };

  // Stock Out Functions
  const openStockOutDialog = (product: Product) => {
    setStockOutProduct(product)
    setStockOutQuantity(0)
    setStockOutReason('')
    setStockOutNotes('')
    setStockOutDialogOpen(true)
  }

  const handleStockOut = () => {
    if (!stockOutProduct || stockOutQuantity <= 0 || !stockOutReason) {
      toast({ variant: "destructive", title: "Error", description: "Lengkapi semua field yang diperlukan" })
      return
    }

    createStockOut.mutate({
      productId: stockOutProduct.id,
      quantity: stockOutQuantity,
      reason: stockOutReason,
      notes: stockOutNotes,
    }, {
      onSuccess: () => {
        toast({ title: "Sukses!", description: `Stok ${stockOutProduct.name} berhasil dikurangi ${stockOutQuantity} unit` })
        setStockOutDialogOpen(false)
        setStockOutProduct(null)
      },
      onError: (error) => {
        toast({ variant: "destructive", title: "Gagal!", description: error.message })
      }
    })
  }

  const handleRowClick = (product: Product) => {
    if (isDesigner) {
      // Navigate to product detail view
      navigate(`/products/${product.id}`)
    } else {
      handleEditClick(product)
    }
  }

  return (
    <div className="space-y-8">
      {canManageProducts && (
        <form onSubmit={handleSubmit} className="space-y-6 p-6 border rounded-lg">
          <h2 className="text-xl font-bold">{editingProduct ? `Edit Produk: ${editingProduct.name}` : 'Tambah Produk Baru'}</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="name">Nama Produk</Label>
              <Input id="name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Jenis Produk</Label>
              <Select value={formData.type} onValueChange={(value) => setFormData({...formData, type: value as 'Produksi' | 'Jual Langsung'})}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih jenis..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Produksi">Produksi (BOM)</SelectItem>
                  <SelectItem value="Jual Langsung">Jual Langsung</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Kategori</Label>
              <Select value={formData.category} onValueChange={(value) => setFormData({...formData, category: value as 'indoor' | 'outdoor'})}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih kategori..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="indoor">Indoor</SelectItem>
                  <SelectItem value="outdoor">Outdoor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="basePrice">Harga Jual (Rp)</Label>
              <NumberInput id="basePrice" value={formData.basePrice} onChange={(value) => setFormData({...formData, basePrice: value || 0})} min={0} decimalPlaces={2} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">Satuan</Label>
              <Input id="unit" value={formData.unit} onChange={(e) => setFormData({...formData, unit: e.target.value})} placeholder="pcs, lembar, m²" required />
            </div>
          </div>

          {/* Cost Price dan Stok untuk Jual Langsung */}
          {formData.type === 'Jual Langsung' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="space-y-2">
                <Label htmlFor="costPrice" className="flex items-center gap-2">
                  Harga Pokok / Modal (Rp)
                  <span className="text-xs text-amber-600 font-normal">(Untuk HPP)</span>
                </Label>
                <NumberInput id="costPrice" value={formData.costPrice || 0} onChange={(value) => setFormData({...formData, costPrice: value || 0})} min={0} decimalPlaces={2} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="initialStock" className="flex items-center gap-2">
                  Stok Awal
                  <span className="text-xs text-amber-600 font-normal">(Balancing)</span>
                </Label>
                <NumberInput id="initialStock" value={formData.initialStock || 0} onChange={(value) => setFormData({...formData, initialStock: value || 0})} min={0} decimalPlaces={0} />
              </div>
              <div className="lg:col-span-2 flex items-end">
                <p className="text-sm text-amber-700">
                  Harga pokok untuk HPP. Stok saat ini dihitung otomatis dari stok awal + PO - penjualan.
                </p>
              </div>
            </div>
          )}

          {/* Cost Price dan Stok untuk Produksi */}
          {formData.type === 'Produksi' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="space-y-2">
                <Label htmlFor="costPrice" className="flex items-center gap-2">
                  Harga Pokok / Modal (Rp)
                  <span className="text-xs text-blue-600 font-normal">(Untuk HPP)</span>
                </Label>
                <NumberInput id="costPrice" value={formData.costPrice || 0} onChange={(value) => setFormData({...formData, costPrice: value || 0})} min={0} decimalPlaces={2} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="initialStock" className="flex items-center gap-2">
                  Stok Awal
                  <span className="text-xs text-blue-600 font-normal">(Balancing)</span>
                </Label>
                <NumberInput id="initialStock" value={formData.initialStock || 0} onChange={(value) => setFormData({...formData, initialStock: value || 0})} min={0} decimalPlaces={0} />
              </div>
              <div className="lg:col-span-2 flex items-end">
                <p className="text-sm text-blue-700">
                  Harga pokok untuk HPP. Stok saat ini dihitung otomatis dari stok awal + produksi - penjualan.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* <div className="space-y-2">
              <Label htmlFor="minStock">Stock Minimal</Label>
              <Input id="minStock" type="number" value={formData.minStock} onChange={(e) => setFormData({...formData, minStock: Number(e.target.value)})} required />
            </div> */}
            <div className="space-y-2">
              <Label htmlFor="minOrder">Min. Order</Label>
              <NumberInput id="minOrder" value={formData.minOrder} onChange={(value) => setFormData({...formData, minOrder: value || 1})} min={1} decimalPlaces={0} required />
            </div>
          </div>
          
          <div className="space-y-2"><Label htmlFor="description">Deskripsi</Label><Textarea id="description" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} /></div>

          <div className="space-y-4 pt-4 border-t">
            <h3 className="font-semibold">Spesifikasi Tambahan</h3>
            {formData.specifications.map((spec, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input placeholder="Nama Spesifikasi (cth: Resolusi)" value={spec.key} onChange={(e) => handleSpecChange(index, 'key', e.target.value)} />
                <Input placeholder="Nilai Spesifikasi (cth: 720 dpi)" value={spec.value} onChange={(e) => handleSpecChange(index, 'value', e.target.value)} />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeSpec(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addSpec}><PlusCircle className="mr-2 h-4 w-4" /> Tambah Spesifikasi</Button>
          </div>

          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Bill of Materials (BOM)</h3>
              {isDesigner && (
                <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">Wajib diisi</span>
              )}
            </div>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader><TableRow><TableHead>Bahan/Material</TableHead><TableHead>Kebutuhan</TableHead><TableHead>Catatan</TableHead><TableHead>Aksi</TableHead></TableRow></TableHeader>
                <TableBody>
                  {formData.materials.map((bom, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Select value={bom.materialId || ""} onValueChange={(v) => handleBomChange(index, 'materialId', v)}>
                          <SelectTrigger><SelectValue placeholder="Pilih Bahan" /></SelectTrigger>
                          <SelectContent>{materials.map(m => <SelectItem key={m.id} value={m.id}>{m.name} ({m.unit})</SelectItem>)}</SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell><NumberInput placeholder="Jumlah" value={bom.quantity} onChange={(value) => handleBomChange(index, 'quantity', value || 0)} min={0} decimalPlaces={2} /></TableCell>
                      <TableCell><Input placeholder="Opsional" value={bom.notes || ''} onChange={(e) => handleBomChange(index, 'notes', e.target.value)} /></TableCell>
                      <TableCell>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeBomItem(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => openMaterialDetails(bom.materialId)}>Lihat Detail</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addBomItem}><PlusCircle className="mr-2 h-4 w-4" /> Tambah Bahan</Button>
          </div>

          <div className="flex justify-end gap-2">
            {editingProduct && <Button type="button" variant="outline" onClick={handleCancelEdit}>Batal</Button>}
            <Button type="submit" disabled={upsertProduct.isPending}>
              {upsertProduct.isPending ? 'Menyimpan...' : (editingProduct ? 'Simpan Perubahan' : 'Simpan Produk')}
            </Button>
          </div>
        </form>
      )}

      <Collapsible open={isProductListOpen} onOpenChange={setIsProductListOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ShoppingBag className="h-5 w-5" />
                    Daftar Produk
                  </CardTitle>
                  <CardDescription>
                    {canManageProducts 
                      ? 'Kelola semua produk dan item yang tersedia.'
                      : 'Lihat informasi produk (hanya baca).'}
                  </CardDescription>
                </div>
                {isProductListOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {isDesigner && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Info Designer:</strong> Anda dapat membuat produk baru dan melihat semua produk. 
                    Untuk produk jenis "Stock", wajib mengisi Bill of Materials (BOM).
                  </p>
                </div>
              )}
              
              {/* Filter Controls */}
              <div className="mb-6 space-y-4">
                <div className="flex gap-4 items-center flex-wrap">
                  <Select value={categoryFilter || "all"} onValueChange={(value) => setCategoryFilter(value === "all" ? "" : value as 'indoor' | 'outdoor' | '')}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Semua Kategori" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Kategori</SelectItem>
                      <SelectItem value="indoor">Indoor</SelectItem>
                      <SelectItem value="outdoor">Outdoor</SelectItem>
                    </SelectContent>
                  </Select>
                  {hasActiveFilters && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        Menampilkan {filteredProducts.length} dari {products?.length || 0} produk
                      </span>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={clearAllFilters}
                        className="h-8 px-2"
                      >
                        <X className="h-4 w-4" />
                        Clear
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              
              <Table>
                <TableHeader><TableRow><TableHead>Nama Produk</TableHead><TableHead>Jenis</TableHead><TableHead>Satuan</TableHead><TableHead>Harga</TableHead><TableHead>Stok Awal</TableHead><TableHead>Stok</TableHead><TableHead>BOM</TableHead>{canManageProducts && <TableHead>Edit</TableHead>}{canManageProducts && <TableHead>Aksi</TableHead>}</TableRow></TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}><TableCell colSpan={canManageProducts ? 9 : 7}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                    ))
                  ) : filteredProducts?.map((product) => (
                    <TableRow key={product.id} onClick={() => handleRowClick(product)} className="cursor-pointer hover:bg-muted">
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={product.type === 'Jual Langsung' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}>
                          {product.type || 'Produksi'}
                        </Badge>
                      </TableCell>
                      <TableCell>{product.unit}</TableCell>
                      <TableCell>Rp {product.basePrice.toLocaleString('id-ID')}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {product.initialStock || 0}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={product.currentStock <= 0 ? "destructive" : "secondary"}>
                          {product.currentStock}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {product.type === 'Produksi' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditClick(product);
                            }}
                          >
                            Manage BOM
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      {canManageProducts && (
                        <TableCell>
                          {canEditAllProducts && (
                            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleEditClick(product); }}>Edit</Button>
                          )}
                        </TableCell>
                      )}
                      {canManageProducts && (
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); openStockOutDialog(product); }}
                              disabled={product.currentStock <= 0}
                              title="Stok Keluar"
                            >
                              <MinusCircle className="h-4 w-4 mr-1" />
                              Keluar
                            </Button>
                            {canDeleteProducts && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="destructive" size="sm" onClick={(e) => e.stopPropagation()}>
                                    Hapus
                                  </Button>
                                </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Anda yakin ingin menghapus produk ini?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Tindakan ini tidak dapat dibatalkan. Produk "{product.name}" akan dihapus secara permanen.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Batal</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteClick(product.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    Ya, Hapus
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>


      {isMaterialDetailsOpen && selectedMaterial && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg shadow-lg w-1/2">
            <h2 className="text-xl font-bold mb-4">Detail Bahan: {selectedMaterial.name}</h2>
            <p><strong>Jenis:</strong> {selectedMaterial.type}</p>
            <p><strong>Satuan:</strong> {selectedMaterial.unit}</p>
            <p><strong>Deskripsi:</strong> {selectedMaterial.description || 'Tidak ada deskripsi'}</p>
            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={closeMaterialDetails}>Tutup</Button>
            </div>
          </div>
        </div>
      )}

      {/* Stock Out Dialog */}
      <Dialog open={stockOutDialogOpen} onOpenChange={setStockOutDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stok Keluar</DialogTitle>
            <DialogDescription>
              Kurangi stok produk: <strong>{stockOutProduct?.name}</strong>
              <br />
              Stok saat ini: <Badge variant="secondary">{stockOutProduct?.currentStock || 0}</Badge>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="stockOutQuantity">Jumlah Keluar</Label>
              <NumberInput
                id="stockOutQuantity"
                value={stockOutQuantity}
                onChange={(value) => setStockOutQuantity(value || 0)}
                min={1}
                max={stockOutProduct?.currentStock || 0}
                decimalPlaces={0}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stockOutReason">Alasan</Label>
              <Select value={stockOutReason} onValueChange={setStockOutReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih alasan..." />
                </SelectTrigger>
                <SelectContent>
                  {STOCK_OUT_REASONS.map((reason) => (
                    <SelectItem key={reason.value} value={reason.value}>
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="stockOutNotes">Catatan (Opsional)</Label>
              <Textarea
                id="stockOutNotes"
                value={stockOutNotes}
                onChange={(e) => setStockOutNotes(e.target.value)}
                placeholder="Catatan tambahan..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockOutDialogOpen(false)}>Batal</Button>
            <Button
              onClick={handleStockOut}
              disabled={createStockOut.isPending || stockOutQuantity <= 0 || !stockOutReason}
            >
              {createStockOut.isPending ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}