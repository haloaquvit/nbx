"use client"

import { useState, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { 
  PlusCircle, 
  Search, 
  Phone, 
  MapPin, 
  Edit, 
  Trash2, 
  ExternalLink,
  Camera,
  Upload,
  FileDown
} from "lucide-react"
import { useCustomers } from "@/hooks/useCustomers"
import { Customer } from "@/types/customer"
import { cn } from "@/lib/utils"
import { PhotoUploadService } from "@/services/photoUploadService"

interface MobileCustomerViewProps {
  onEditCustomer: (customer: Customer) => void
  onAddCustomer: () => void
}

export function MobileCustomerView({ onEditCustomer, onAddCustomer }: MobileCustomerViewProps) {
  const { customers, deleteCustomer, isLoading } = useCustomers()
  const [searchTerm, setSearchTerm] = useState("")
  
  const filteredCustomers = customers?.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone.includes(searchTerm) ||
    customer.address.toLowerCase().includes(searchTerm.toLowerCase())
  ) || []

  const handleDelete = async (customer: Customer) => {
    if (window.confirm(`Hapus pelanggan "${customer.name}"?`)) {
      deleteCustomer.mutate(customer.id!)
    }
  }

  const handleViewLocation = (lat: number, lng: number) => {
    window.open(`https://www.google.com/maps/dir//${lat},${lng}`, '_blank')
  }

  const handleViewPhoto = (photoUrl: string) => {
    // Use PhotoUploadService to get the correct VPS URL
    const fullUrl = PhotoUploadService.getPhotoUrl(photoUrl, 'Customers_Images')
    window.open(fullUrl, '_blank')
  }

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="h-5 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  <div className="h-4 bg-gray-200 rounded w-full"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 p-4 pb-24">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-sm text-gray-600 mb-1">
              {filteredCustomers.length} pelanggan ditemukan
            </p>
          </div>
        </div>
        
        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Cari nama, telepon, atau alamat..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-white/80 backdrop-blur-sm border-white/20 shadow-lg"
          />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Button 
            onClick={onAddCustomer}
            className="h-12 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-lg"
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Tambah Pelanggan
          </Button>
          <Button 
            variant="outline"
            className="h-12 bg-white/80 backdrop-blur-sm border-white/20 shadow-lg hover:bg-white/90"
          >
            <FileDown className="mr-2 h-4 w-4" />
            Export Data
          </Button>
        </div>
      </div>

      {/* Customer Cards */}
      <div className="space-y-4 pb-6">
        {filteredCustomers.length === 0 ? (
          <Card className="bg-white/80 backdrop-blur-sm border-white/20 shadow-lg">
            <CardContent className="p-8 text-center">
              <div className="text-gray-400 mb-4">
                <PlusCircle className="h-16 w-16 mx-auto mb-4" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Belum Ada Pelanggan
              </h3>
              <p className="text-gray-600 mb-4">
                {searchTerm ? "Tidak ada pelanggan yang sesuai pencarian" : "Mulai tambahkan pelanggan pertama Anda"}
              </p>
              {!searchTerm && (
                <Button 
                  onClick={onAddCustomer}
                  className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                >
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Tambah Pelanggan
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          filteredCustomers.map((customer) => (
            <Card 
              key={customer.id} 
              className="bg-white/90 backdrop-blur-md border-white/30 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            >
              <CardContent className="p-5">
                <div className="space-y-4">
                  {/* Header dengan nama dan badge */}
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-900 mb-1">
                        {customer.name}
                      </h3>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          ID: {customer.id}
                        </Badge>
                        {customer.jumlah_galon_titip && customer.jumlah_galon_titip > 0 && (
                          <Badge variant="outline" className="text-xs text-blue-600 border-blue-200">
                            {customer.jumlah_galon_titip} Galon Titip
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <Phone className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm text-gray-600">Telepon</p>
                        <a 
                          href={`tel:${customer.phone}`}
                          className="text-sm font-medium text-green-600 hover:underline"
                        >
                          {customer.phone}
                        </a>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <MapPin className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm text-gray-600">Alamat</p>
                        <p className="text-sm font-medium text-gray-900 leading-relaxed">
                          {customer.address}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Photo Preview */}
                  {customer.store_photo_url && (
                    <div
                      className="relative w-full h-40 bg-gray-100 rounded-lg overflow-hidden cursor-pointer group"
                      onClick={() => handleViewPhoto(customer.store_photo_url!)}
                    >
                      <img
                        src={PhotoUploadService.getPhotoUrl(customer.store_photo_url, 'Customers_Images')}
                        alt={`Foto ${customer.name}`}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        onError={(e) => {
                          // Hide image on error and show placeholder
                          (e.target as HTMLImageElement).style.display = 'none';
                          const placeholder = (e.target as HTMLImageElement).nextElementSibling;
                          if (placeholder) (placeholder as HTMLElement).style.display = 'flex';
                        }}
                      />
                      <div className="hidden flex-col items-center justify-center w-full h-full text-gray-400">
                        <Camera className="h-8 w-8 mb-2" />
                        <span className="text-sm">Foto tidak tersedia</span>
                      </div>
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 flex items-center justify-center">
                        <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-sm font-medium bg-black/50 px-3 py-1 rounded-full">
                          Tap untuk perbesar
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Location Action */}
                  {customer.latitude && customer.longitude && (
                    <div className="pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewLocation(customer.latitude!, customer.longitude!)}
                        className="w-full text-xs bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Lihat Lokasi
                      </Button>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-3 border-t border-gray-100">
                    <Button
                      size="sm"
                      onClick={() => onEditCustomer(customer)}
                      className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white"
                    >
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(customer)}
                      className="flex-1 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Hapus
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Floating Add Button */}
      <Button
        onClick={onAddCustomer}
        className="fixed bottom-28 right-6 h-14 w-14 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 shadow-2xl hover:shadow-3xl transition-all duration-200 z-40"
        size="icon"
      >
        <PlusCircle className="h-6 w-6 text-white" />
      </Button>
    </div>
  )
}