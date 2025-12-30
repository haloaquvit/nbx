"use client"

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Coins, Loader2, Package, RefreshCw, Search, Truck, Store, Users, TrendingUp } from 'lucide-react'
import { format } from 'date-fns'
import { id } from 'date-fns/locale/id'
import { useOptimizedCommissionEntries } from '@/hooks/useOptimizedCommissions'
import { useAuth } from '@/hooks/useAuth'
import { useUsers } from '@/hooks/useUsers'

export default function MobileCommissionPage() {
  const { user } = useAuth()
  const { users } = useUsers()

  // Check if current user is Driver or Helper - they can only see their own commission
  const isDriverOrHelper = useMemo(() => {
    if (!user) return false
    const userRole = user.role?.toLowerCase() || ''
    return userRole.includes('driver') || userRole.includes('helper') || userRole.includes('supir')
  }, [user])

  // Date filters - default to current month
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const firstOfMonth = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd')
  const [startDate, setStartDate] = useState(firstOfMonth)
  const [endDate, setEndDate] = useState(todayStr)
  const [selectedUser, setSelectedUser] = useState<string>('all')
  const [hasSearched, setHasSearched] = useState(false)

  // Use optimized commission entries
  const start = new Date(startDate + "T00:00:00")
  const end = new Date(endDate + "T23:59:59.999")

  const {
    data: entries = [],
    isLoading,
    refetch
  } = useOptimizedCommissionEntries(start, end)

  // Filter entries based on user role
  const filteredEntries = useMemo(() => {
    let filtered = entries

    // If Driver/Helper, only show their own commission
    if (isDriverOrHelper && user?.id) {
      filtered = filtered.filter(entry => entry.userId === user.id)
    } else if (selectedUser !== 'all') {
      // Admin/Manager can filter by user
      filtered = filtered.filter(entry => entry.userId === selectedUser)
    }

    return filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }, [entries, selectedUser, isDriverOrHelper, user?.id])

  // Get unique users from entries for filter dropdown
  const availableUsers = useMemo(() => {
    const userMap = new Map<string, { id: string, name: string, role: string }>()
    entries.forEach(entry => {
      if (!userMap.has(entry.userId)) {
        userMap.set(entry.userId, {
          id: entry.userId,
          name: entry.userName,
          role: entry.role
        })
      }
    })
    return Array.from(userMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [entries])

  // Summary calculations
  const summary = useMemo(() => {
    const totalAmount = filteredEntries.reduce((sum, e) => sum + e.amount, 0)
    const totalQty = filteredEntries.reduce((sum, e) => sum + e.quantity, 0)
    const totalEntries = filteredEntries.length

    // Group by role
    const byRole: Record<string, number> = {}
    filteredEntries.forEach(entry => {
      if (!byRole[entry.role]) byRole[entry.role] = 0
      byRole[entry.role] += entry.amount
    })

    return { totalAmount, totalQty, totalEntries, byRole }
  }, [filteredEntries])

  const handleSearch = () => {
    setHasSearched(true)
    refetch()
  }

  const getRoleBadge = (role: string) => {
    const roleColors: Record<string, string> = {
      'driver': 'bg-blue-100 text-blue-700',
      'helper': 'bg-purple-100 text-purple-700',
      'sales': 'bg-green-100 text-green-700',
      'kasir': 'bg-orange-100 text-orange-700',
      'operator': 'bg-cyan-100 text-cyan-700',
      'supervisor': 'bg-indigo-100 text-indigo-700',
    }
    const color = roleColors[role.toLowerCase()] || 'bg-gray-100 text-gray-700'
    return <Badge className={`${color} text-xs`}>{role}</Badge>
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-yellow-600" />
            <h1 className="text-lg font-bold">Laporan Komisi</h1>
          </div>
          <div className="text-xs text-muted-foreground">
            {format(new Date(), 'dd MMM yyyy', { locale: id })}
          </div>
        </div>
        {isDriverOrHelper && (
          <div className="mt-1 text-xs text-muted-foreground">
            Menampilkan komisi untuk: <span className="font-medium">{user?.name || user?.email}</span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Dari</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sampai</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
        </div>

        <div className="flex gap-2">
          {/* Only show user filter for Admin/Manager */}
          {!isDriverOrHelper && (
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger className="flex-1 h-9">
                <SelectValue placeholder="Pilih Karyawan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Karyawan</SelectItem>
                {availableUsers.map(u => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            onClick={handleSearch}
            disabled={isLoading}
            className={`h-9 px-4 ${isDriverOrHelper ? 'flex-1' : ''}`}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : hasSearched ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            <span className="ml-2">Cari</span>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {!isLoading && (
        <div className="px-4 grid grid-cols-3 gap-2 mb-4">
          <Card className="bg-white">
            <CardContent className="p-3 text-center">
              <div className="text-lg font-bold text-yellow-600">
                {(summary.totalAmount / 1000).toFixed(0)}K
              </div>
              <div className="text-xs text-muted-foreground">Total Komisi</div>
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardContent className="p-3 text-center">
              <div className="text-lg font-bold text-blue-600">{summary.totalQty}</div>
              <div className="text-xs text-muted-foreground">Total Qty</div>
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardContent className="p-3 text-center">
              <div className="text-lg font-bold text-green-600">{summary.totalEntries}</div>
              <div className="text-xs text-muted-foreground">Transaksi</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Role Breakdown */}
      {!isLoading && Object.keys(summary.byRole).length > 0 && (
        <div className="px-4 mb-3">
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(summary.byRole).map(([role, amount]) => (
              <span key={role} className="bg-gray-100 px-2 py-1 rounded">
                {role}: Rp {amount.toLocaleString()}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      <div className="px-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredEntries.length === 0 ? (
          <Card className="bg-white">
            <CardContent className="p-8 text-center text-muted-foreground">
              <Coins className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {hasSearched
                  ? 'Tidak ada data komisi di periode ini'
                  : 'Pilih tanggal dan tap Cari'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredEntries.map((entry) => (
              <Card key={entry.id} className="bg-white">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {entry.productName}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {entry.userName}
                      </div>
                    </div>
                    <div className="text-right ml-2">
                      <div className="font-bold text-sm text-yellow-600">
                        Rp {entry.amount.toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {entry.quantity} × {entry.ratePerQty.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      {getRoleBadge(entry.role)}
                      <span className="text-muted-foreground truncate max-w-[120px]">
                        {entry.customerName || entry.ref}
                      </span>
                    </div>
                    <span className="text-muted-foreground">
                      {format(entry.createdAt, 'dd/MM HH:mm', { locale: id })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
