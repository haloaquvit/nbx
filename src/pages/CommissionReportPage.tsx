"use client"

import { useState, useMemo, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useCommissionEntries } from "@/hooks/useCommissions"
import { useAuth } from "@/hooks/useAuth"
import { useUsers } from "@/hooks/useUsers"
import { format } from "date-fns"
import { id } from "date-fns/locale/id"
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Calendar,
  Download,
  Filter,
  Loader2
} from "lucide-react"


export default function CommissionReportPage() {
  const { user } = useAuth()
  const { entries, isLoading, fetchEntries, error } = useCommissionEntries()
  const { users, isLoading: usersLoading } = useUsers()
  
  // Date filters
  const [startDate, setStartDate] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() - 7) // Last 7 days
    return date.toISOString().slice(0, 10)
  })
  
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().slice(0, 10)
  })
  
  const [selectedUser, setSelectedUser] = useState<string>("all")

  // Fetch data when filters change
  useEffect(() => {
    const start = new Date(startDate + "T00:00:00")
    const end = new Date(endDate + "T23:59:59.999")
    fetchEntries(start, end)
  }, [startDate, endDate])

  // Filter by user if selected
  const filteredEntries = useMemo(() => {
    let filtered = entries
    
    if (selectedUser !== "all") {
      filtered = filtered.filter(entry => entry.userId === selectedUser)
    }
    
    return filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }, [entries, selectedUser])

  // Calculate totals
  const totals = useMemo(() => {
    const total = filteredEntries.reduce((sum, entry) => sum + entry.amount, 0)
    const quantity = filteredEntries.reduce((sum, entry) => sum + entry.quantity, 0)
    
    // Group by role
    const byRole = filteredEntries.reduce((acc, entry) => {
      if (!acc[entry.role]) {
        acc[entry.role] = { amount: 0, quantity: 0, count: 0 }
      }
      acc[entry.role].amount += entry.amount
      acc[entry.role].quantity += entry.quantity
      acc[entry.role].count += 1
      return acc
    }, {} as Record<string, { amount: number; quantity: number; count: number }>)
    
    // Group by user
    const byUser = filteredEntries.reduce((acc, entry) => {
      if (!acc[entry.userId]) {
        const employee = users?.find(u => u.id === entry.userId)
        acc[entry.userId] = {
          userName: employee?.name || entry.userName,
          role: employee?.role || entry.role,
          amount: 0,
          quantity: 0,
          count: 0
        }
      }
      acc[entry.userId].amount += entry.amount
      acc[entry.userId].quantity += entry.quantity
      acc[entry.userId].count += 1
      return acc
    }, {} as Record<string, { userName: string; role: string; amount: number; quantity: number; count: number }>)
    
    return { total, quantity, byRole, byUser }
  }, [filteredEntries])

  // Get users for filter - use all employees from profiles table
  const uniqueUsers = useMemo(() => {
    // If we have users data, use it directly
    if (users && users.length > 0) {
      return users
        .filter(user => user.name && user.name.trim() !== '')
        .map(user => ({
          id: user.id,
          name: user.name, // useUsers already maps full_name to name
          role: user.role
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    }
    
    // Fallback: get from entries if users not available
    const userIds = Array.from(new Set(entries.map(entry => entry.userId)))
    return userIds
      .map(userId => {
        const entry = entries.find(e => e.userId === userId)
        return { 
          id: userId, 
          name: entry?.userName || userId, 
          role: entry?.role 
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [users, entries])

  const exportToPDF = () => {
    // TODO: Implement PDF export
    console.log("Export to PDF")
  }

  if (isLoading || usersLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-4 flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardContent className="p-6 text-center">
            <Loader2 className="h-8 w-8 mx-auto mb-4 text-blue-600 animate-spin" />
            <p className="text-lg font-medium">Memuat laporan komisi...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Show error message if table doesn't exist
  if (error && error.includes('Tabel komisi belum dibuat')) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
            <CardHeader className="py-6 px-6">
              <CardTitle className="flex items-center gap-3 text-2xl font-bold">
                <BarChart3 className="h-8 w-8" />
                Laporan Komisi
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="p-6">
              <div className="text-center space-y-4">
                <div className="text-orange-600 text-6xl">⚠️</div>
                <h2 className="text-xl font-bold text-orange-800">Tabel Komisi Belum Dibuat</h2>
                <p className="text-orange-700">
                  Sistem komisi belum diaktifkan. Tabel database belum dibuat.
                </p>
                <div className="bg-white p-4 rounded-lg border border-orange-200">
                  <p className="text-sm text-gray-600 mb-2">
                    Untuk mengaktifkan sistem komisi, jalankan migration berikut:
                  </p>
                  <code className="text-xs bg-gray-100 p-2 rounded block">
                    supabase/migrations/0031_add_commission_tables.sql
                  </code>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <CardHeader className="py-6 px-6">
            <CardTitle className="flex items-center gap-3 text-2xl font-bold">
              <BarChart3 className="h-8 w-8" />
              Laporan Komisi
            </CardTitle>
            <CardDescription className="text-blue-100 text-lg mt-2">
              Detail komisi dari seluruh orderan dan pengantaran
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filter Laporan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Dari Tanggal
                </label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Sampai Tanggal
                </label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Karyawan
                </label>
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Karyawan</SelectItem>
                    {uniqueUsers.map(userItem => (
                      <SelectItem key={userItem.id} value={userItem.id}>
                        {userItem.name} ({userItem.role?.toUpperCase()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Komisi</p>
                  <p className="text-2xl font-bold text-green-600">
                    {new Intl.NumberFormat("id-ID", {
                      style: "currency",
                      currency: "IDR",
                      maximumFractionDigits: 0
                    }).format(totals.total)}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Qty</p>
                  <p className="text-2xl font-bold">{totals.quantity.toLocaleString("id-ID")}</p>
                </div>
                <BarChart3 className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Entri</p>
                  <p className="text-2xl font-bold">{filteredEntries.length}</p>
                </div>
                <Calendar className="h-8 w-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Karyawan</p>
                  <p className="text-2xl font-bold">{Object.keys(totals.byUser).length}</p>
                </div>
                <Users className="h-8 w-8 text-orange-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Summary by Role */}
        <Card>
          <CardHeader>
            <CardTitle>Ringkasan per Peran</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(totals.byRole).map(([role, data]) => (
                <div key={role} className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className="uppercase">
                      {role}
                    </Badge>
                    <span className="text-sm text-muted-foreground">{data.count} entri</span>
                  </div>
                  <div className="space-y-1">
                    <div className="text-lg font-bold text-green-600">
                      {new Intl.NumberFormat("id-ID", {
                        style: "currency",
                        currency: "IDR",
                        maximumFractionDigits: 0
                      }).format(data.amount)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {data.quantity} qty total
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Export Button */}
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-600">
            Menampilkan {filteredEntries.length} entri komisi
          </div>
          <Button onClick={exportToPDF} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
        </div>

        {/* Detailed Table */}
        <Card>
          <CardHeader>
            <CardTitle>Detail Komisi</CardTitle>
            <CardDescription>
              Rincian setiap entri komisi berdasarkan transaksi dan pengantaran
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg bg-white overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Tanggal</th>
                    <th className="text-left px-4 py-3 font-semibold">Peran</th>
                    <th className="text-left px-4 py-3 font-semibold">Karyawan</th>
                    <th className="text-left px-4 py-3 font-semibold">Produk</th>
                    <th className="text-left px-4 py-3 font-semibold">Qty</th>
                    <th className="text-left px-4 py-3 font-semibold">Rate</th>
                    <th className="text-left px-4 py-3 font-semibold">Jumlah</th>
                    <th className="text-left px-4 py-3 font-semibold">Ref</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((entry) => (
                    <tr key={entry.id} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-3">
                        {format(entry.createdAt, "dd MMM yyyy HH:mm", { locale: id })}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="uppercase text-xs">
                          {entry.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {(() => {
                          const employee = users?.find(u => u.id === entry.userId)
                          return employee?.name || entry.userName
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <div className="font-medium">{entry.productName}</div>
                          {entry.productSku && (
                            <div className="text-xs text-muted-foreground font-mono">
                              {entry.productSku}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">{entry.quantity}</td>
                      <td className="px-4 py-3">
                        {new Intl.NumberFormat("id-ID", {
                          style: "currency",
                          currency: "IDR",
                          maximumFractionDigits: 0
                        }).format(entry.ratePerQty)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-green-600">
                        {new Intl.NumberFormat("id-ID", {
                          style: "currency",
                          currency: "IDR",
                          maximumFractionDigits: 0
                        }).format(entry.amount)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{entry.ref}</td>
                      <td className="px-4 py-3">
                        <Badge 
                          variant={entry.status === 'paid' ? 'default' : entry.status === 'pending' ? 'secondary' : 'destructive'}
                        >
                          {entry.status === 'paid' ? 'Dibayar' : entry.status === 'pending' ? 'Pending' : 'Batal'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {filteredEntries.length === 0 && (
                    <tr>
                      <td className="px-4 py-8 text-center text-slate-500" colSpan={9}>
                        Tidak ada data komisi untuk periode yang dipilih
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}