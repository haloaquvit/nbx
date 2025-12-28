"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "./ui/textarea"
import { useCustomers } from "@/hooks/useCustomers"
import { useToast } from "./ui/use-toast"
import { Customer, CustomerClassification } from "@/types/customer"
import { MapPin, Camera } from "lucide-react"
import { compressImage, formatFileSize, isImageFile } from "@/utils/imageCompression"
import { PhotoUploadService } from "@/services/photoUploadService"
import { useState, useRef } from "react"
import { useAuth } from "@/hooks/useAuth"

const customerSchema = z.object({
  name: z.string().min(3, { message: "Nama harus diisi (minimal 3 karakter)." }),
  phone: z.string().min(10, { message: "Nomor telepon tidak valid." }),
  address: z.string().min(5, { message: "Alamat harus diisi (minimal 5 karakter)." }),
  full_address: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  jumlah_galon_titip: z.coerce.number().min(0, { message: "Jumlah galon tidak boleh negatif." }).optional(),
  classification: z.enum(['Rumahan', 'Kios/Toko']).optional(),
})

type CustomerFormData = z.infer<typeof customerSchema>

interface AddCustomerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCustomerAdded?: (customer: Customer) => void
}

export function AddCustomerDialog({ open, onOpenChange, onCustomerAdded }: AddCustomerDialogProps) {
  const { toast } = useToast()
  const { addCustomer, isLoading } = useCustomers()
  const { user } = useAuth()
  const [isUploading, setIsUploading] = useState(false)
  const [storePhoto, setStorePhoto] = useState<File | null>(null)
  const [storePhotoFilename, setStorePhotoFilename] = useState<string>('') // Hanya simpan filename
  const [photoPreview, setPhotoPreview] = useState<string | null>(null) // Preview foto
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Foto wajib untuk semua user, koordinat GPS opsional untuk admin/owner
  const requiresPhoto = true // Foto WAJIB untuk semua
  const requiresLocation = user?.role && !['kasir', 'admin', 'owner'].includes(user.role.toLowerCase())
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: "",
      phone: "",
      address: "",
      full_address: "",
      latitude: undefined,
      longitude: undefined,
      jumlah_galon_titip: 0,
      classification: undefined,
    },
  })

  const latitude = watch('latitude')
  const longitude = watch('longitude')

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Geolocation tidak didukung di browser ini.",
      })
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        setValue('latitude', latitude)
        setValue('longitude', longitude)
        // Auto-fill alamat lengkap dengan koordinat GPS
        setValue('full_address', `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`)
        toast({
          title: "Sukses!",
          description: "Lokasi berhasil diambil dan alamat lengkap terisi otomatis.",
        })
      },
      (error) => {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Gagal mendapatkan lokasi. Pastikan GPS aktif.",
        })
      }
    )
  }

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!isImageFile(file)) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "File harus berupa gambar.",
      })
      return
    }

    setIsUploading(true)

    try {
      // Show original file size
      console.log(`Original file size: ${formatFileSize(file.size)}`)

      // Compress image to max 100KB
      const compressedFile = await compressImage(file, 100)
      console.log(`Compressed file size: ${formatFileSize(compressedFile.size)}`)

      setStorePhoto(compressedFile)

      // Create preview
      const reader = new FileReader()
      reader.onload = (e) => {
        setPhotoPreview(e.target?.result as string)
      }
      reader.readAsDataURL(compressedFile)

      // Get customer name from form, fallback to timestamp if empty
      const customerName = watch('name')?.trim() || `customer-${Date.now()}`

      // Upload to VPS server
      const result = await PhotoUploadService.uploadPhoto(compressedFile, customerName, 'customers')

      if (!result) {
        throw new Error('Gagal mengupload foto ke server.')
      }

      // Simpan hanya filename ke state (akan disimpan ke database)
      setStorePhotoFilename(result.filename || result.id)

      toast({
        title: "Sukses!",
        description: `Foto toko berhasil diupload (${formatFileSize(compressedFile.size)}).`,
      })
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Gagal mengupload foto.",
      })
    } finally {
      setIsUploading(false)
    }
  }


  const onSubmit = async (data: CustomerFormData) => {
    // Validate foto - WAJIB untuk semua user
    if (!storePhotoFilename) {
      toast({
        variant: "destructive",
        title: "Foto Toko Wajib",
        description: "Foto toko/kios pelanggan wajib diupload.",
      })
      return
    }

    // Validate koordinat GPS - wajib untuk role tertentu
    if (requiresLocation) {
      if (!data.latitude || !data.longitude) {
        toast({
          variant: "destructive",
          title: "Koordinat GPS Wajib",
          description: "Untuk role Anda, koordinat GPS pelanggan wajib diisi.",
        })
        return
      }
    }

    const newCustomerData = {
      name: data.name,
      phone: data.phone,
      address: data.address,
      full_address: data.full_address,
      latitude: data.latitude,
      longitude: data.longitude,
      jumlah_galon_titip: data.jumlah_galon_titip || 0,
      classification: data.classification,
      store_photo_url: storePhotoFilename, // Simpan filename saja, URL di-generate saat tampil
    };
    addCustomer.mutate(newCustomerData, {
      onSuccess: (newCustomer) => {
        toast({
          title: "Sukses!",
          description: `Pelanggan "${newCustomer.name}" berhasil ditambahkan.`,
        })
        reset()
        setStorePhoto(null)
        setStorePhotoFilename('')
        setPhotoPreview(null)
        onOpenChange(false)
        if (onCustomerAdded) {
          onCustomerAdded(newCustomer)
        }
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Gagal!",
          description: "Terjadi kesalahan saat menambah pelanggan.",
        })
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Tambah Pelanggan Baru</DialogTitle>
            <DialogDescription>
              Isi detail pelanggan di bawah ini. <strong className="text-red-600">Foto toko wajib diisi.</strong>
              {requiresLocation && (
                <span className="text-red-600"> Koordinat GPS juga wajib untuk role Anda.</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Mobile-first form layout */}
            <div className="space-y-2">
              <Label htmlFor="name">Nama</Label>
              <Input id="name" {...register("name")} placeholder="Masukkan nama pelanggan" />
              {errors.name && <p className="text-red-500 text-sm">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telepon</Label>
              <Input id="phone" {...register("phone")} placeholder="Masukkan nomor telepon" />
              {errors.phone && <p className="text-red-500 text-sm">{errors.phone.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Alamat</Label>
              <Textarea id="address" {...register("address")} placeholder="Masukkan alamat pelanggan" />
              {errors.address && <p className="text-red-500 text-sm">{errors.address.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="full_address">
                Koordinat GPS
                {requiresLocation && <span className="text-red-500 ml-1">*</span>}
              </Label>
              <Textarea 
                id="full_address" 
                {...register("full_address")} 
                placeholder="Koordinat GPS akan terisi otomatis saat ambil lokasi"
                readOnly
                className="bg-gray-50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="classification">Klasifikasi</Label>
              <select
                id="classification"
                {...register("classification")}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">Pilih Klasifikasi</option>
                <option value="Rumahan">Rumahan</option>
                <option value="Kios/Toko">Kios/Toko</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="jumlah_galon_titip">Galon Titip</Label>
              <Input
                id="jumlah_galon_titip"
                type="number"
                min="0"
                {...register("jumlah_galon_titip")}
                placeholder="Jumlah galon yang dititip di pelanggan"
              />
              {errors.jumlah_galon_titip && <p className="text-red-500 text-sm">{errors.jumlah_galon_titip.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>
                Lokasi
                {requiresLocation && <span className="text-red-500 ml-1">*</span>}
              </Label>
              <div className="space-y-2">
                <Button 
                  type="button" 
                  onClick={handleGetCurrentLocation}
                  variant="outline"
                  className="w-full"
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  Ambil Lokasi Saat Ini
                </Button>
                {latitude && longitude && (
                  <div className="text-sm text-green-600">
                    <p>✓ Lokasi berhasil diambil ({latitude.toFixed(6)}, {longitude.toFixed(6)})</p>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>
                Foto Toko
                <span className="text-red-500 ml-1">*</span>
              </Label>
              <div className="space-y-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handlePhotoUpload}
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                />
                {!photoPreview ? (
                  <div
                    className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Camera className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm text-gray-600">
                      {isUploading ? 'Mengupload...' : 'Klik untuk ambil foto toko'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <img
                        src={photoPreview}
                        alt="Preview foto toko"
                        className="w-full max-h-48 object-contain rounded-lg border"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setStorePhoto(null)
                          setStorePhotoFilename('')
                          setPhotoPreview(null)
                        }}
                        className="absolute top-2 right-2"
                      >
                        ✕
                      </Button>
                    </div>
                    <p className="text-sm text-green-600">✓ Foto berhasil diupload</p>
                    <Button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={isUploading}
                    >
                      {isUploading ? 'Mengupload...' : 'Ganti Foto'}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="order-2 sm:order-1">
              Batal
            </Button>
            <Button type="submit" disabled={isLoading} className="order-1 sm:order-2">
              {isLoading ? "Menyimpan..." : "Simpan Pelanggan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}