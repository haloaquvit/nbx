"use client"
import { useState } from 'react'
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Material } from '@/types/material'
import { useMaterials } from '@/hooks/useMaterials'
import { useAuth } from '@/hooks/useAuth'
import { RequestPoDialog } from './RequestPoDialog'
import { AstragraphiaReport } from './AstragraphiaReport'
import { Badge } from './ui/badge'
import { useToast } from './ui/use-toast'
import { Trash2, ChevronDown, ChevronUp, Package, Search, X, FileText } from 'lucide-react'

const materialSchema = z.object({
  name: z.string().min(3, { message: "Nama bahan minimal 3 karakter." }),
  type: z.enum(['Stock', 'Beli'], { message: "Pilih jenis bahan." }),
  unit: z.string().min(1, { message: "Satuan harus diisi (cth: meter, lembar, kg)." }),
  pricePerUnit: z.coerce.number().min(0, { message: "Harga tidak boleh negatif." }),
  stock: z.coerce.number().min(0, { message: "Stok tidak boleh negatif." }),
  minStock: z.coerce.number().min(0, { message: "Stok minimal tidak boleh negatif." }).optional(),
  description: z.string().optional(),
}).refine((data) => {
  // For "Beli" type, minStock is not required or should be 0
  if (data.type === 'Beli') {
    return true; // minStock can be anything for "Beli" type
  }
  // For "Stock" type, minStock is required
  return data.minStock !== undefined && data.minStock >= 0;
}, {
  message: "Stok minimal diperlukan untuk jenis Stock.",
  path: ["minStock"],
})

type MaterialFormData = z.infer<typeof materialSchema>

const EMPTY_FORM_DATA: MaterialFormData = {
  name: '',
  type: 'Stock',
  unit: '',
  pricePerUnit: 0,
  stock: 0,
  minStock: 10,
  description: '',
};

export const MaterialManagement = () => {
  const { materials, isLoading, upsertMaterial, deleteMaterial } = useMaterials()
  const { user } = useAuth()
  const { toast } = useToast()

  // Permission checks
  const canManageMaterials = user && ['admin', 'owner', 'supervisor'].includes(user.role)
  const [isRequestPoOpen, setIsRequestPoOpen] = useState(false)
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null)
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null)
  const [isMaterialListOpen, setIsMaterialListOpen] = useState(true)
  const [showAstragraphiaReport, setShowAstragraphiaReport] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("")
  const [lowStockFilter, setLowStockFilter] = useState(false)

  const { register, handleSubmit, reset, control, watch, formState: { errors } } = useForm<MaterialFormData>({
    resolver: zodResolver(materialSchema),
    defaultValues: EMPTY_FORM_DATA,
  })

  const selectedType = watch('type')

  // Filter materials based on search query and filters
  const filteredMaterials = materials?.filter(material => {
    const matchesSearch = material.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         material.description?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType = !typeFilter || material.type === typeFilter
    const matchesLowStock = !lowStockFilter || (material.type === 'Stock' && material.stock <= (material.minStock || 0))
    
    return matchesSearch && matchesType && matchesLowStock
  }) || []

  const hasActiveFilters = searchQuery || typeFilter || lowStockFilter

  const clearAllFilters = () => {
    setSearchQuery("")
    setTypeFilter("")
    setLowStockFilter(false)
  }

  const handleOpenRequestPo = (material: Material) => {
    setSelectedMaterial(material)
    setIsRequestPoOpen(true)
  }

  const handleEditClick = (material: Material) => {
    setEditingMaterial(material);
    // Fix: Only pass allowed fields and map type if needed
    const { name, unit, pricePerUnit, stock, minStock, description } = material;
    const type: 'Stock' | 'Beli' = material.type === 'Jasa' ? 'Stock' : material.type;
    
    // For "Beli" type, set minStock to 0 since it's not used
    const adjustedMinStock = type === 'Beli' ? 0 : minStock;
    
    reset({ name, type, unit, pricePerUnit, stock, minStock: adjustedMinStock, description });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingMaterial(null);
    reset(EMPTY_FORM_DATA);
  };

  const handleDeleteClick = (material: Material) => {
    if (window.confirm(`Apakah Anda yakin ingin menghapus bahan "${material.name}"?`)) {
      deleteMaterial.mutate(material.id, {
        onSuccess: () => {
          toast({
            title: "Sukses!",
            description: `Bahan "${material.name}" berhasil dihapus.`,
          })
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Gagal!",
            description: `Terjadi kesalahan: ${error.message}`,
          })
        },
      })
    }
  }

  const onFormSubmit = (data: MaterialFormData) => {
    const materialToSave: Partial<Material> = {
      ...data,
      id: editingMaterial?.id, // Include ID if editing
    };

    upsertMaterial.mutate(materialToSave, {
      onSuccess: (savedMaterial) => {
        toast({
          title: "Sukses!",
          description: `Bahan "${savedMaterial.name}" berhasil ${editingMaterial ? 'diperbarui' : 'ditambahkan'}.`,
        })
        handleCancelEdit();
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: "Gagal!",
          description: `Terjadi kesalahan: ${error.message}`,
        })
      },
    })
  }


  return (
    <div className="space-y-6">
      <RequestPoDialog
        open={isRequestPoOpen}
        onOpenChange={setIsRequestPoOpen}
        material={selectedMaterial}
      />

      {canManageMaterials && (
        <Card>
          <CardHeader>
            <CardTitle>{editingMaterial ? `Edit Bahan: ${editingMaterial.name}` : 'Tambah Bahan Baru'}</CardTitle>
            <CardDescription>
              {editingMaterial ? 'Perbarui detail bahan di bawah ini.' : 'Tambahkan material baru yang akan digunakan dalam produksi.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
          <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-2 lg:col-span-2">
                <Label htmlFor="name">Nama Bahan</Label>
                <Input id="name" {...register("name")} />
                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Jenis Bahan</Label>
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih jenis bahan" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Stock">Stock</SelectItem>
                        <SelectItem value="Beli">Beli</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.type && <p className="text-sm text-destructive">{errors.type.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Satuan</Label>
                <Input id="unit" {...register("unit")} placeholder="meter, lembar, kg" />
                {errors.unit && <p className="text-sm text-destructive">{errors.unit.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="pricePerUnit">Harga per Satuan</Label>
                <Input id="pricePerUnit" type="number" step="any" {...register("pricePerUnit")} />
                {errors.pricePerUnit && <p className="text-sm text-destructive">{errors.pricePerUnit.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock">Stok Saat Ini</Label>
                <Input id="stock" type="number" step="any" {...register("stock")} />
                {errors.stock && <p className="text-sm text-destructive">{errors.stock.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {selectedType === 'Stock' && (
                <div className="space-y-2">
                  <Label htmlFor="minStock">Stok Minimal</Label>
                  <Input id="minStock" type="number" step="any" {...register("minStock")} />
                  {errors.minStock && <p className="text-sm text-destructive">{errors.minStock.message}</p>}
                </div>
              )}
              <div className="space-y-2 lg:col-span-4">
                <Label htmlFor="description">Deskripsi (Opsional)</Label>
                <Textarea id="description" {...register("description")} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={upsertMaterial.isPending}>
                {upsertMaterial.isPending ? "Menyimpan..." : (editingMaterial ? 'Simpan Perubahan' : 'Simpan Bahan Baru')}
              </Button>
              {editingMaterial && (
                <Button type="button" variant="outline" onClick={handleCancelEdit}>Batal</Button>
              )}
            </div>
          </form>
        </CardContent>
        </Card>
      )}

      <Collapsible open={isMaterialListOpen} onOpenChange={setIsMaterialListOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Daftar Bahan & Stok
                  </CardTitle>
                  <CardDescription>
                    {canManageMaterials 
                      ? 'Kelola semua bahan baku dan stok yang tersedia.'
                      : user?.role === 'designer' 
                        ? 'Lihat informasi bahan baku dan request Purchase Order (PO).'
                        : 'Lihat informasi bahan baku dan stok (hanya baca).'}
                  </CardDescription>
                </div>
                {isMaterialListOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              
              {/* Search and Filter Controls */}
              <div className="mb-6 space-y-4">
                <div className="flex gap-4 items-center flex-wrap">
                  <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Cari bahan berdasarkan nama..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={typeFilter || "all"} onValueChange={(value) => setTypeFilter(value === "all" ? "" : value)}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Jenis" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Jenis</SelectItem>
                      <SelectItem value="Stock">Stock</SelectItem>
                      <SelectItem value="Beli">Beli</SelectItem>
                      <SelectItem value="Jasa">Jasa</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant={lowStockFilter ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLowStockFilter(!lowStockFilter)}
                  >
                    Stok Rendah
                  </Button>
                  <Button
                    variant={showAstragraphiaReport ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowAstragraphiaReport(!showAstragraphiaReport)}
                    className="bg-blue-50 text-blue-700 hover:bg-blue-100"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Laporan Astragraphia
                  </Button>
                  {hasActiveFilters && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        Menampilkan {filteredMaterials.length} dari {materials?.length || 0} bahan
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
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Stok Saat Ini</TableHead>
                    <TableHead>Stok Minimal</TableHead>
                    <TableHead>Harga/Satuan</TableHead>
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center">Memuat data...</TableCell></TableRow>
                  ) : filteredMaterials?.map((material) => (
                    <TableRow key={material.id}>
                      <TableCell className="font-medium">
                        <Link 
                          to={`/materials/${material.id}`} 
                          className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                        >
                          {material.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          material.type === 'Stock' ? 'bg-purple-100 text-purple-800' :
                          'bg-orange-100 text-orange-800'
                        }>
                          {material.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {material.type === 'Stock' ? (
                          <Badge variant={material.stock < (material.minStock || 0) ? "destructive" : "secondary"}>
                            {material.stock} {material.unit}
                          </Badge>
                        ) : (
                          <div className="flex flex-col">
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 mb-1">
                              Total Digunakan: {material.stock} {material.unit}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              (Kontrak/Jasa)
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {material.type === 'Stock' ? (
                          `${material.minStock || 0} ${material.unit}`
                        ) : (
                          <span className="text-muted-foreground text-sm">Tidak ada</span>
                        )}
                      </TableCell>
                      <TableCell>Rp{material.pricePerUnit.toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {canManageMaterials && (
                            <Button variant="outline" size="sm" onClick={() => handleEditClick(material)}>Edit</Button>
                          )}
                          <Button variant="secondary" size="sm" onClick={() => handleOpenRequestPo(material)}>
                            Request PO
                          </Button>
                          {user?.role === 'owner' && (
                            <Button 
                              variant="destructive" 
                              size="sm" 
                              onClick={() => handleDeleteClick(material)}
                              disabled={deleteMaterial.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>


      {/* Astragraphia Report */}
      {showAstragraphiaReport && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Laporan Kontrak Astragraphia
                </CardTitle>
                <CardDescription>
                  Monitoring penggunaan mesin xerox dan estimasi tagihan bulanan
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAstragraphiaReport(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <AstragraphiaReport />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
