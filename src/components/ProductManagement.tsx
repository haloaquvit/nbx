"use client"
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Badge } from './ui/badge'
import { Product } from '@/types/product'
import { Material } from '@/types/material'
import { PlusCircle, Trash2, ChevronDown, ChevronUp, ShoppingBag, Search, X } from 'lucide-react'
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
import { useAuth } from '@/hooks/useAuth'
import { useNavigate } from 'react-router-dom'

interface ProductManagementProps {
  materials?: Material[]
}

const EMPTY_FORM_DATA: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  category: 'indoor',
  type: 'Stock',
  basePrice: 0,
  unit: 'pcs',
  currentStock: 0,
  minStock: 1,
  minOrder: 1,
  description: '',
  specifications: [],
  materials: []
};

export const ProductManagement = ({ materials = [] }: ProductManagementProps) => {
  const { toast } = useToast()
  const { products, isLoading, upsertProduct, deleteProduct } = useProducts()
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [formData, setFormData] = useState(EMPTY_FORM_DATA)
  const [isProductListOpen, setIsProductListOpen] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<'indoor' | 'outdoor' | ''>('')
  const { user } = useAuth()
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [isMaterialDetailsOpen, setMaterialDetailsOpen] = useState(false);
  const navigate = useNavigate()

  const canManageProducts = user && ['admin', 'owner', 'supervisor', 'cashier', 'designer'].includes(user.role)
  const canDeleteProducts = user && ['admin', 'owner'].includes(user.role)
  const canEditAllProducts = user && ['admin', 'owner', 'supervisor', 'cashier'].includes(user.role)
  const isDesigner = user?.role === 'designer'


  // Filter products based on search query and filters
  const filteredProducts = products?.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         product.description?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = !categoryFilter || product.category === categoryFilter
    
    return matchesSearch && matchesCategory
  }) || []

  const hasActiveFilters = searchQuery || categoryFilter

  const clearAllFilters = () => {
    setSearchQuery("")
    setCategoryFilter("")
  }

  const handleEditClick = (product: Product) => {
    setEditingProduct(product)
    setFormData({
      name: product.name,
      category: product.category,
      type: product.type || 'Stock',
      basePrice: product.basePrice,
      unit: product.unit || 'pcs',
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
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="name">Nama Produk</Label>
              <Input id="name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
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
              <Label htmlFor="basePrice">Harga Dasar (Rp)</Label>
              <Input id="basePrice" type="number" value={formData.basePrice} onChange={(e) => setFormData({...formData, basePrice: Number(e.target.value)})} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">Satuan</Label>
              <Input id="unit" value={formData.unit} onChange={(e) => setFormData({...formData, unit: e.target.value})} placeholder="pcs, lembar, m²" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currentStock">Stock Saat Ini</Label>
              <Input id="currentStock" type="number" value={formData.currentStock} onChange={(e) => setFormData({...formData, currentStock: Number(e.target.value)})} required />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="minStock">Stock Minimal</Label>
              <Input id="minStock" type="number" value={formData.minStock} onChange={(e) => setFormData({...formData, minStock: Number(e.target.value)})} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="minOrder">Min. Order</Label>
              <Input id="minOrder" type="number" value={formData.minOrder} onChange={(e) => setFormData({...formData, minOrder: Number(e.target.value)})} required />
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
                      <TableCell><Input type="number" step="any" placeholder="Jumlah" value={bom.quantity} onChange={(e) => handleBomChange(index, 'quantity', Number(e.target.value))} /></TableCell>
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
              
              {/* Search and Filter Controls */}
              <div className="mb-6 space-y-4">
                <div className="flex gap-4 items-center flex-wrap">
                  <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Cari produk berdasarkan nama..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
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
                <TableHeader><TableRow><TableHead>Nama</TableHead><TableHead>Kategori</TableHead><TableHead>Harga Dasar</TableHead><TableHead>Stock</TableHead><TableHead>Satuan</TableHead>{canManageProducts && <TableHead>Aksi</TableHead>}</TableRow></TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}><TableCell colSpan={canManageProducts ? 6 : 5}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                    ))
                  ) : filteredProducts?.map((product) => (
                    <TableRow key={product.id} onClick={() => handleRowClick(product)} className="cursor-pointer hover:bg-muted">
                      <TableCell>{product.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-blue-100 text-blue-800">
                          {product.category === 'indoor' ? 'Indoor' : 'Outdoor'}
                        </Badge>
                      </TableCell>
                      <TableCell>Rp{product.basePrice.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant={product.currentStock < product.minStock ? "destructive" : "secondary"}>
                          {product.currentStock}
                        </Badge>
                      </TableCell>
                      <TableCell>{product.unit}</TableCell>
                      {canManageProducts && (
                        <TableCell>
                          <div className="flex gap-2">
                            {canEditAllProducts && (
                              <Button variant="outline" size="sm" onClick={() => handleEditClick(product)}>Edit</Button>
                            )}
                            {isDesigner && (
                              <Button variant="outline" size="sm" disabled className="text-gray-400">View Only</Button>
                            )}
                            {canDeleteProducts && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="destructive" size="sm">
                                    <Trash2 className="h-4 w-4" />
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
    </div>
  )
}