"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { Pencil, Trash2, Plus, Users, Percent, DollarSign } from "lucide-react"
import { useSalesEmployees, useSalesCommissionSettings } from "@/hooks/useSalesCommission"
import { SalesCommissionSetting } from "@/types/commission"
import { useAuth } from "@/hooks/useAuth"

export function SalesCommissionSettings() {
  const { toast } = useToast()
  const { user } = useAuth()
  const { data: salesEmployees } = useSalesEmployees()
  const { settings, isLoading, createSetting, updateSetting, deleteSetting } = useSalesCommissionSettings()

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingSetting, setEditingSetting] = useState<SalesCommissionSetting | null>(null)
  const [formData, setFormData] = useState({
    salesId: '',
    commissionType: 'percentage' as 'percentage' | 'fixed',
    commissionValue: 0,
  })

  const resetForm = () => {
    setFormData({
      salesId: '',
      commissionType: 'percentage',
      commissionValue: 0,
    })
    setEditingSetting(null)
  }

  const handleSubmit = async () => {
    if (!formData.salesId || formData.commissionValue <= 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Harap lengkapi semua field dengan benar",
      })
      return
    }

    try {
      const salesEmployee = salesEmployees?.find(emp => emp.id === formData.salesId)
      
      if (editingSetting) {
        await updateSetting.mutateAsync({
          ...editingSetting,
          commissionType: formData.commissionType,
          commissionValue: formData.commissionValue,
        })
        toast({
          title: "Berhasil",
          description: "Setting komisi sales berhasil diperbarui",
        })
      } else {
        await createSetting.mutateAsync({
          salesId: formData.salesId,
          salesName: salesEmployee?.name || 'Unknown',
          commissionType: formData.commissionType,
          commissionValue: formData.commissionValue,
          isActive: true,
          createdBy: user?.id || 'system',
        })
        toast({
          title: "Berhasil",
          description: "Setting komisi sales berhasil dibuat",
        })
      }

      setIsDialogOpen(false)
      resetForm()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal menyimpan setting komisi",
      })
    }
  }

  const handleEdit = (setting: SalesCommissionSetting) => {
    setEditingSetting(setting)
    setFormData({
      salesId: setting.salesId,
      commissionType: setting.commissionType,
      commissionValue: setting.commissionValue,
    })
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteSetting.mutateAsync(id)
      toast({
        title: "Berhasil",
        description: "Setting komisi sales berhasil dihapus",
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal menghapus setting komisi",
      })
    }
  }

  const formatCommissionValue = (type: 'percentage' | 'fixed', value: number) => {
    if (type === 'percentage') {
      return `${value}%`
    }
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
    }).format(value)
  }

  // Get available sales employees (not yet configured)
  const availableSalesEmployees = salesEmployees?.filter(emp => 
    !settings.some(setting => setting.salesId === emp.id)
  ) || []

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Setting Komisi Sales
              </CardTitle>
              <CardDescription>
                Atur komisi untuk setiap sales berdasarkan penjualan
              </CardDescription>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={resetForm}>
                  <Plus className="h-4 w-4 mr-2" />
                  Tambah Setting
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingSetting ? 'Edit Setting Komisi' : 'Tambah Setting Komisi'}
                  </DialogTitle>
                  <DialogDescription>
                    Atur komisi sales berdasarkan persentase penjualan atau nominal tetap per transaksi
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="salesId">Sales</Label>
                    <Select
                      value={formData.salesId}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, salesId: value }))}
                      disabled={!!editingSetting}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih sales" />
                      </SelectTrigger>
                      <SelectContent>
                        {editingSetting ? (
                          <SelectItem value={editingSetting.salesId}>
                            {editingSetting.salesName}
                          </SelectItem>
                        ) : (
                          availableSalesEmployees.map((employee) => (
                            <SelectItem key={employee.id} value={employee.id}>
                              {employee.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="commissionType">Tipe Komisi</Label>
                    <Select
                      value={formData.commissionType}
                      onValueChange={(value: 'percentage' | 'fixed') => 
                        setFormData(prev => ({ ...prev, commissionType: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">
                          <div className="flex items-center gap-2">
                            <Percent className="h-4 w-4" />
                            Persentase dari Penjualan
                          </div>
                        </SelectItem>
                        <SelectItem value="fixed">
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4" />
                            Nominal Tetap per Transaksi
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="commissionValue">
                      {formData.commissionType === 'percentage' ? 'Persentase (%)' : 'Nominal (Rp)'}
                    </Label>
                    <Input
                      id="commissionValue"
                      type="number"
                      step={formData.commissionType === 'percentage' ? '0.1' : '1000'}
                      min="0"
                      max={formData.commissionType === 'percentage' ? '100' : undefined}
                      value={formData.commissionValue}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        commissionValue: parseFloat(e.target.value) || 0 
                      }))}
                      placeholder={formData.commissionType === 'percentage' ? 'Contoh: 5.0' : 'Contoh: 50000'}
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Batal
                  </Button>
                  <Button onClick={handleSubmit}>
                    {editingSetting ? 'Update' : 'Tambah'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading...</div>
          ) : settings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Belum ada setting komisi sales. Tambah setting pertama Anda.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sales</TableHead>
                  <TableHead>Tipe Komisi</TableHead>
                  <TableHead>Nilai Komisi</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dibuat</TableHead>
                  <TableHead className="w-20">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settings.map((setting) => (
                  <TableRow key={setting.id}>
                    <TableCell className="font-medium">
                      {setting.salesName}
                    </TableCell>
                    <TableCell>
                      <Badge variant={setting.commissionType === 'percentage' ? 'default' : 'secondary'}>
                        {setting.commissionType === 'percentage' ? 'Persentase' : 'Nominal Tetap'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {formatCommissionValue(setting.commissionType, setting.commissionValue)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={setting.isActive ? 'default' : 'secondary'}>
                        {setting.isActive ? 'Aktif' : 'Nonaktif'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {setting.createdAt.toLocaleDateString('id-ID')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(setting)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(setting.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}