"use client"

import { useState, useEffect, useCallback } from 'react'
import { useCustomers } from '@/hooks/useCustomers'
import { CustomerMap } from '@/components/CustomerMap'
import { NearbyCustomerList } from '@/components/NearbyCustomerList'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import { Map, List, Crosshair, RefreshCw, AlertCircle } from 'lucide-react'
import { Customer } from '@/types/customer'

export default function CustomerMapPage() {
  const { customers, isLoading, refetch } = useCustomers()
  const { toast } = useToast()

  // User location state
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [isGettingLocation, setIsGettingLocation] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)

  // Filter state
  const [radiusMeters, setRadiusMeters] = useState(2000) // 2km default

  // Default to 'nearby' tab for all users (especially on mobile)
  const [activeTab, setActiveTab] = useState('nearby')

  // Get user location on mount
  useEffect(() => {
    getUserLocation()
  }, [])

  const getUserLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation tidak didukung browser ini')
      toast({
        variant: 'destructive',
        title: 'GPS Tidak Tersedia',
        description: 'Browser Anda tidak mendukung geolocation'
      })
      return
    }

    setIsGettingLocation(true)
    setLocationError(null)

    navigator.geolocation.getCurrentPosition(
      position => {
        const { latitude, longitude } = position.coords
        setUserLocation({ lat: latitude, lng: longitude })
        setIsGettingLocation(false)
        toast({
          title: 'Lokasi Ditemukan',
          description: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
        })
      },
      error => {
        setIsGettingLocation(false)
        let message = 'Gagal mendapatkan lokasi'
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = 'Izin lokasi ditolak. Aktifkan GPS di pengaturan browser.'
            break
          case error.POSITION_UNAVAILABLE:
            message = 'Informasi lokasi tidak tersedia'
            break
          case error.TIMEOUT:
            message = 'Waktu mendapatkan lokasi habis'
            break
        }
        setLocationError(message)
        toast({
          variant: 'destructive',
          title: 'Gagal Mendapatkan Lokasi',
          description: message
        })
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    )
  }, [toast])

  // Watch position for real-time updates
  useEffect(() => {
    if (!navigator.geolocation) return

    const watchId = navigator.geolocation.watchPosition(
      position => {
        const { latitude, longitude } = position.coords
        setUserLocation({ lat: latitude, lng: longitude })
      },
      () => {
        // Silently fail on watch errors
      },
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 10000
      }
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
    }
  }, [])

  const handleCustomerSelect = (customer: Customer) => {
    // Switch to map tab and could center on customer
    setActiveTab('map')
  }

  // Count customers with coordinates
  const customersWithCoords = customers?.filter(c => c.latitude && c.longitude) || []

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-12rem)] md:h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 md:p-4 border-b bg-background">
        <div>
          <h1 className="text-xl font-bold">Peta Pelanggan</h1>
          <p className="text-sm text-muted-foreground">
            {customersWithCoords.length} pelanggan dengan koordinat
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant={userLocation ? 'outline' : 'default'}
            size="sm"
            onClick={getUserLocation}
            disabled={isGettingLocation}
            className={userLocation ? '' : 'bg-blue-600 hover:bg-blue-700'}
          >
            {isGettingLocation ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Crosshair className="h-4 w-4" />
            )}
            <span className="ml-1 hidden sm:inline">
              {userLocation ? 'Update' : 'GPS'}
            </span>
          </Button>
        </div>
      </div>

      {/* Location Error Banner */}
      {locationError && !userLocation && (
        <div className="bg-orange-50 dark:bg-orange-900/20 border-b border-orange-200 dark:border-orange-800 px-4 py-2 flex items-center gap-2 text-sm text-orange-800 dark:text-orange-200">
          <AlertCircle className="h-4 w-4" />
          {locationError}
          <Button
            variant="link"
            size="sm"
            className="ml-auto text-orange-800 dark:text-orange-200 p-0 h-auto"
            onClick={getUserLocation}
          >
            Coba lagi
          </Button>
        </div>
      )}

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col"
      >
        <TabsList className="mx-4 mt-2 grid w-auto grid-cols-2">
          <TabsTrigger value="map" className="gap-2">
            <Map className="h-4 w-4" />
            Peta
          </TabsTrigger>
          <TabsTrigger value="nearby" className="gap-2">
            <List className="h-4 w-4" />
            Terdekat
          </TabsTrigger>
        </TabsList>

        <TabsContent value="map" className="flex-1 m-0 p-4 pt-2">
          <CustomerMap
            customers={customers || []}
            userLocation={userLocation}
            onCustomerClick={handleCustomerSelect}
          />
        </TabsContent>

        <TabsContent value="nearby" className="flex-1 m-0 p-4 pt-2 overflow-hidden">
          <NearbyCustomerList
            customers={customers || []}
            userLocation={userLocation}
            radiusMeters={radiusMeters}
            onRadiusChange={setRadiusMeters}
            onCustomerSelect={handleCustomerSelect}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
