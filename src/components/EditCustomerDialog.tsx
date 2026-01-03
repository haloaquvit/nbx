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
import { Customer, CustomerClassification } from "@/types/customer"
import { MapPin, Camera, ExternalLink } from "lucide-react"
import { useIsMobile } from "@/hooks/use-mobile"
import { compressImage, formatFileSize, isImageFile } from "@/utils/imageCompression"
import { PhotoUploadService } from "@/services/photoUploadService"

const customerSchema = z.object({
  name: z.string().min(3, { message: "Nama harus diisi (minimal 3 karakter)." }),
  phone: z.string().min(10, { message: "Nomor telepon tidak valid." }),
  address: z.string().min(5, { message: "Alamat harus diisi (minimal 5 karakter)." }),
  full_address: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  jumlah_galon_titip: z.coerce.number().min(0, { message: "Jumlah galon tidak boleh negatif." }).optional(),
  classification: z.enum(['Rumahan', 'Kios/Toko', '']).optional().transform(val => val === '' ? undefined : val),
})

type CustomerFormData = z.infer<typeof customerSchema>

interface EditCustomerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer: Customer | null
}

export function EditCustomerDialog({ open, onOpenChange, customer }: EditCustomerDialogProps) {
  const { toast } = useToast()
  const { updateCustomer } = useCustomers()
  const { user } = useAuth()
  const isMobile = useIsMobile()
  
  // Photo upload states
  const [isUploading, setIsUploading] = useState(false)
  const [storePhoto, setStorePhoto] = useState<File | null>(null)
  const [storePhotoUrl, setStorePhotoUrl] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Check if user is owner, admin, or cashier
  const canEditAllFields = user?.role && ['owner', 'admin', 'cashier'].includes(user.role)

  // Check if user is driver/helper - they can also edit location and photo
  const isDriverOrHelper = user?.role && ['driver', 'supir', 'helper', 'pembantu'].includes(user.role.toLowerCase())

  // Show location and photo fields for admin/owner/cashier AND driver/helper
  const canEditLocationAndPhoto = canEditAllFields || isDriverOrHelper

  // Check if user must provide coordinates and photo (only on mobile, not on web view)
  const requiresLocationAndPhoto = isMobile && user?.role && !['kasir', 'admin', 'owner'].includes(user.role.toLowerCase())

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

  // Set form values when customer changes
  useEffect(() => {
    if (customer && open) {
      setValue("name", customer.name)
      setValue("phone", customer.phone)
      setValue("address", customer.address)
      setValue("latitude", customer.latitude)
      setValue("longitude", customer.longitude)
      setValue("jumlah_galon_titip", customer.jumlah_galon_titip || 0)
      setValue("classification", customer.classification)
      
      // Auto-fill alamat lengkap dengan koordinat GPS jika ada
      if (customer.latitude && customer.longitude) {
        setValue("full_address", `${customer.latitude.toFixed(6)}, ${customer.longitude.toFixed(6)}`)
      } else {
        setValue("full_address", "")
      }
      
      // Set photo states
      setStorePhotoUrl(customer.store_photo_url || "")
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
      const result = await PhotoUploadService.uploadPhoto(compressedFile, customerName, 'customers')

      if (!result) {
        throw new Error('Gagal mengupload foto ke server.')
      }

      // Simpan filename saja, URL di-generate saat tampil
      setStorePhotoUrl(result.filename || result.id)

      toast({
        title: "Sukses!",
        description: `Foto toko berhasil diupload (${formatFileSize(compressedFile.size)}).`,
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal mengupload foto ke server.",
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
      
      if (!storePhotoUrl && !customer.store_photo_url) {
        toast({
          variant: "destructive", 
          title: "Foto Toko Wajib",
          description: "Untuk role Anda, foto toko/kios pelanggan wajib diupload.",
        })
        return
      }
    }

    console.log('Form data classification:', data.classification)

    const updateData: any = {
      id: customer.id,
      name: data.name,
      phone: data.phone,
      address: data.address,
      jumlah_galon_titip: data.jumlah_galon_titip || 0,
      classification: data.classification || null,
    }

    console.log('Update data:', updateData)

    // Include location and photo fields if user can edit them (admin/owner/cashier/driver/helper)
    if (canEditLocationAndPhoto) {
      // Generate full_address from coordinates if available
      if (data.latitude && data.longitude) {
        updateData.full_address = `${data.latitude}, ${data.longitude}`
      } else {
        updateData.full_address = data.full_address
      }
      updateData.latitude = data.latitude || null
      updateData.longitude = data.longitude || null
      updateData.store_photo_url = storePhotoUrl
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
    onOpenChange(false)
  }

  const onFormError = (errors: any) => {
    console.error('Form validation errors:', errors)
    const firstError = Object.values(errors)[0] as any
    if (firstError?.message) {
      toast({
        variant: "destructive",
        title: "Validasi Gagal",
        description: firstError.message,
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit(onSubmit, onFormError)}>
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
            
            {/* Additional fields - for owner/admin/cashier AND driver/helper */}
            {canEditLocationAndPhoto && (
              <>
                <div className="space-y-2">
                  <Label>Koordinat GPS</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="latitude" className="text-xs text-gray-500">Latitude</Label>
                      <Input
                        id="latitude"
                        type="number"
                        step="any"
                        {...register("latitude")}
                        placeholder="Latitude"
                        readOnly={isMobile}
                        className={isMobile ? "bg-gray-50" : ""}
                      />
                    </div>
                    <div>
                      <Label htmlFor="longitude" className="text-xs text-gray-500">Longitude</Label>
                      <Input
                        id="longitude"
                        type="number"
                        step="any"
                        {...register("longitude")}
                        placeholder="Longitude"
                        readOnly={isMobile}
                        className={isMobile ? "bg-gray-50" : ""}
                      />
                    </div>
                  </div>
                  {latitude && longitude && (
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
                  <Label>Ambil Lokasi Otomatis</Label>
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
                      capture="environment"
                      className="hidden"
                    />
                    <Button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      variant="outline"
                      className="w-full"
                      disabled={isUploading}
                    >
                      <Camera className="w-4 h-4 mr-2" />
                      {isUploading ? 'Mengupload...' : 'Ambil Foto Toko'}
                    </Button>
                    {(storePhoto || storePhotoUrl) && (
                      <div className="space-y-2">
                        <div className="text-sm text-green-600">
                          <p>✓ Foto berhasil diupload</p>
                        </div>
                        {storePhotoUrl && (
                          <img
                            src={PhotoUploadService.getPhotoUrl(storePhotoUrl, 'Customers_Images')}
                            alt="Foto Toko"
                            className="w-full max-w-[200px] h-auto rounded-md border cursor-pointer hover:opacity-80"
                            onClick={() => window.open(PhotoUploadService.getPhotoUrl(storePhotoUrl, 'Customers_Images'), '_blank')}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                            }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
            
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
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={handleCancel} className="order-2 sm:order-1">
              Batal
            </Button>
            <Button type="submit" disabled={updateCustomer.isPending || isUploading} className="order-1 sm:order-2">
              {updateCustomer.isPending ? "Menyimpan..." : "Simpan Perubahan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}