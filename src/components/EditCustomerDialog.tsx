"use client"
import { useState, useEffect, useRef } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useCustomers } from "@/hooks/useCustomers"
import { useToast } from "@/components/ui/use-toast"
import { useAuth } from "@/hooks/useAuth"
import { Customer } from "@/types/customer"
import { MapPin, Upload, ExternalLink, Camera } from "lucide-react"
import { compressImage, formatFileSize, isImageFile } from "@/utils/imageCompression"
import { PhotoUploadService } from "@/services/photoUploadService"

const customerSchema = z.object({
  name: z.string().min(3, { message: "Nama harus diisi (minimal 3 karakter)." }),
  phone: z.string().min(10, { message: "Nomor telepon tidak valid." }),
  address: z.string().min(5, { message: "Alamat harus diisi (minimal 5 karakter)." }),
  full_address: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  jumlah_galon_titip: z.coerce.number().min(0, { message: "Jumlah galon tidak boleh negatif." }).optional(),
})

type CustomerFormData = z.infer<typeof customerSchema>

interface EditCustomerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer: Customer | null
}

export function EditCustomerDialog({ open, onOpenChange, customer }: EditCustomerDialogProps) {
  const { toast } = useToast()
  const { updateCustomer, isLoading } = useCustomers()
  const { user } = useAuth()
  
  // Photo upload states
  const [isUploading, setIsUploading] = useState(false)
  const [storePhoto, setStorePhoto] = useState<File | null>(null)
  const [storePhotoUrl, setStorePhotoUrl] = useState<string>('')
  const [storePhotoDriveId, setStorePhotoDriveId] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Check if user is owner, admin, or cashier
  const canEditAllFields = user?.role && ['owner', 'admin', 'cashier'].includes(user.role)
  
  // Check if user must provide coordinates and photo
  const requiresLocationAndPhoto = user?.role && !['kasir', 'admin', 'owner'].includes(user.role.toLowerCase())

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
    },
  })
  
  const latitude = watch('latitude')
  const longitude = watch('longitude')

  // Set form values when customer changes
  useEffect(() => {
    if (customer && open) {
      setValue("name", customer.name)
      setValue("phone", customer.phone)
      setValue("address", customer.address)
      setValue("latitude", customer.latitude)
      setValue("longitude", customer.longitude)
      setValue("jumlah_galon_titip", customer.jumlah_galon_titip || 0)
      
      // Auto-fill alamat lengkap dengan koordinat GPS jika ada
      if (customer.latitude && customer.longitude) {
        setValue("full_address", `${customer.latitude.toFixed(6)}, ${customer.longitude.toFixed(6)}`)
      } else {
        setValue("full_address", "")
      }
      
      // Set photo states
      setStorePhotoUrl(customer.store_photo_url || "")
      setStorePhotoDriveId(customer.store_photo_drive_id || "")
    }
  }, [customer, open, setValue])

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

      // Get customer name from form, fallback to existing customer name or timestamp
      const customerName = watch('name')?.trim() || customer?.name?.trim() || `customer-${Date.now()}`
      // Clean filename: replace special characters with spaces, then with hyphens
      const cleanName = customerName.replace(/[^\w\s-]/gi, '').replace(/\s+/g, '-').toLowerCase()
      const fileName = `${cleanName}.jpg`
      const result = await PhotoUploadService.uploadPhoto(compressedFile, customerName)
      
      if (!result) {
        throw new Error('Gagal mengupload ke Google Drive. Periksa konfigurasi di pengaturan.')
      }
      
      const driveId = result.id
      const viewUrl = result.webViewLink
      
      setStorePhotoDriveId(driveId)
      setStorePhotoUrl(viewUrl)
      
      toast({
        title: "Sukses!",
        description: `Foto toko berhasil diupload ke Google Drive (${formatFileSize(compressedFile.size)}).`,
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal mengupload foto ke Google Drive.",
      })
    } finally {
      setIsUploading(false)
    }
  }

  const onSubmit = async (data: CustomerFormData) => {
    if (!customer) return

    // Validate required fields for non-privileged users
    if (requiresLocationAndPhoto) {
      if (!data.latitude || !data.longitude) {
        toast({
          variant: "destructive",
          title: "Koordinat GPS Wajib",
          description: "Untuk role Anda, koordinat GPS pelanggan wajib diisi.",
        })
        return
      }
      
      if (!storePhotoUrl && !customer.photo_url) {
        toast({
          variant: "destructive", 
          title: "Foto Toko Wajib",
          description: "Untuk role Anda, foto toko/kios pelanggan wajib diupload.",
        })
        return
      }
    }

    const updateData: any = {
      id: customer.id,
      name: data.name,
      phone: data.phone,
      address: data.address,
      jumlah_galon_titip: data.jumlah_galon_titip || 0,
    }

    // Include additional fields if user can edit all fields
    if (canEditAllFields) {
      updateData.full_address = data.full_address
      updateData.latitude = data.latitude
      updateData.longitude = data.longitude
      updateData.store_photo_url = storePhotoUrl
      updateData.store_photo_drive_id = storePhotoDriveId
    }

    updateCustomer.mutate(updateData, {
      onSuccess: (updatedCustomer) => {
        toast({
          title: "Sukses!",
          description: `Data pelanggan "${updatedCustomer.name}" berhasil diperbarui.`,
        })
        reset()
        setStorePhoto(null)
        setStorePhotoUrl('')
        setStorePhotoDriveId('')
        onOpenChange(false)
      },
      onError: (error: any) => {
        toast({
          variant: "destructive",
          title: "Gagal!",
          description: error.message,
        })
      },
    })
  }

  const handleCancel = () => {
    reset()
    setStorePhoto(null)
    setStorePhotoUrl('')
    setStorePhotoDriveId('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Edit Pelanggan</DialogTitle>
            <DialogDescription>
              Ubah informasi pelanggan. {requiresLocationAndPhoto && (
                <strong className="text-red-600">
                  Koordinat GPS dan foto toko wajib diisi untuk role Anda.
                </strong>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Basic fields - always visible */}
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
            
            {/* Additional fields - only for owner/admin */}
            {canEditAllFields && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="full_address">Koordinat GPS</Label>
                  <Textarea 
                    id="full_address" 
                    {...register("full_address")} 
                    placeholder="Koordinat GPS akan terisi otomatis saat ambil lokasi"
                    readOnly
                    className="bg-gray-50"
                  />
                  {latitude && longitude && watch('full_address') && (
                    <Button
                      type="button"
                      variant="link"
                      className="p-0 h-auto text-blue-600"
                      onClick={() => window.open(`https://www.google.com/maps/dir//${latitude},${longitude}`, '_blank')}
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      Lihat Lokasi di Google Maps
                    </Button>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label>Lokasi</Label>
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
                      <div className="text-sm text-gray-600 space-y-1">
                        <p>Lat: {latitude.toFixed(6)}</p>
                        <p>Long: {longitude.toFixed(6)}</p>
                        <Button
                          type="button"
                          variant="link"
                          className="p-0 h-auto text-blue-600"
                          onClick={() => window.open(`https://www.google.com/maps/dir//${latitude},${longitude}`, '_blank')}
                        >
                          <ExternalLink className="w-3 h-3 mr-1" />
                          Lihat di Google Maps
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Foto Toko</Label>
                  <div className="space-y-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handlePhotoUpload}
                      accept="image/*"
                      className="hidden"
                    />
                    <Button 
                      type="button" 
                      onClick={() => fileInputRef.current?.click()}
                      variant="outline"
                      className="w-full"
                      disabled={isUploading}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {isUploading ? 'Mengupload...' : 'Upload Foto Toko'}
                    </Button>
                    {(storePhoto || storePhotoUrl) && (
                      <div className="text-sm text-gray-600">
                        <p>File: {storePhoto?.name || 'Foto tersedia'}</p>
                        {storePhotoUrl && (
                          <Button
                            type="button"
                            variant="link"
                            className="p-0 h-auto text-blue-600"
                            onClick={() => window.open(storePhotoUrl, '_blank')}
                          >
                            <Camera className="w-3 h-3 mr-1" />
                            Lihat Foto di Google Drive
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
            
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
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={handleCancel} className="order-2 sm:order-1">
              Batal
            </Button>
            <Button type="submit" disabled={isLoading} className="order-1 sm:order-2">
              {isLoading ? "Menyimpan..." : "Simpan Perubahan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}