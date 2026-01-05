"use client"

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar, DollarSign, Percent, Clock, User } from 'lucide-react'
import { EmployeeSalary, SalaryConfigFormData, PayrollType, CommissionType } from '@/types/payroll'
import { Employee } from '@/types/employee'
import { useEmployeeSalaries } from '@/hooks/usePayroll'
import { useToast } from '@/hooks/use-toast'
import { useTimezone } from '@/contexts/TimezoneContext'
import { getOfficeTime } from '@/utils/officeTime'

interface SalaryConfigDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  employee: Employee | null
  existingConfig?: EmployeeSalary | null
}

const payrollTypeOptions = [
  { value: 'monthly' as PayrollType, label: 'Gaji Bulanan', description: 'Gaji tetap setiap bulan' },
  { value: 'commission_only' as PayrollType, label: 'Komisi Saja', description: 'Hanya berdasarkan komisi' },
  { value: 'mixed' as PayrollType, label: 'Gaji + Komisi', description: 'Kombinasi gaji tetap dan komisi' },
]

const commissionTypeOptions = [
  { value: 'none' as CommissionType, label: 'Tidak Ada', description: 'Tidak ada komisi' },
  { value: 'percentage' as CommissionType, label: 'Persentase', description: 'Berdasarkan persentase dari penjualan/delivery' },
  { value: 'fixed_amount' as CommissionType, label: 'Jumlah Tetap', description: 'Jumlah komisi tetap per bulan' },
]

const getRoleSuggestion = (role: string) => {
  switch (role?.toLowerCase()) {
    case 'driver':
    case 'helper':
      // Driver/Helper biasanya gaji pokok + komisi delivery
      return {
        baseSalary: 3000000,
        payrollType: 'mixed' as PayrollType,
        commissionType: 'none' as CommissionType,
        commissionRate: 0,
      }
    case 'sales':
      // Sales bisa commission only atau mixed, defaultkan ke mixed
      return {
        baseSalary: 2500000,
        payrollType: 'mixed' as PayrollType,
        commissionType: 'none' as CommissionType,
        commissionRate: 0,
      }
    case 'admin':
    case 'cashier':
      return {
        baseSalary: 4000000,
        payrollType: 'monthly' as PayrollType,
        commissionType: 'none' as CommissionType,
        commissionRate: 0,
      }
    case 'supervisor':
    case 'owner':
      return {
        baseSalary: 6000000,
        payrollType: 'monthly' as PayrollType,
        commissionType: 'none' as CommissionType,
        commissionRate: 0,
      }
    default:
      return {
        baseSalary: 3500000,
        payrollType: 'monthly' as PayrollType,
        commissionType: 'none' as CommissionType,
        commissionRate: 0,
      }
  }
}

export function SalaryConfigDialog({ isOpen, onOpenChange, employee, existingConfig }: SalaryConfigDialogProps) {
  const { toast } = useToast()
  const { timezone } = useTimezone()
  const { createSalaryConfig, updateSalaryConfig } = useEmployeeSalaries()

  const [formData, setFormData] = useState<SalaryConfigFormData>({
    employeeId: '',
    baseSalary: 0,
    commissionRate: 0,
    payrollType: 'monthly',
    commissionType: 'none',
    effectiveFrom: getOfficeTime(timezone),
    notes: '',
  })

  const [isLoading, setIsLoading] = useState(false)

  // Initialize form when dialog opens
  useEffect(() => {
    if (isOpen && employee) {
      if (existingConfig) {
        // Edit existing config
        setFormData({
          employeeId: existingConfig.employeeId,
          baseSalary: existingConfig.baseSalary,
          commissionRate: existingConfig.commissionRate,
          payrollType: existingConfig.payrollType,
          commissionType: existingConfig.commissionType,
          effectiveFrom: existingConfig.effectiveFrom,
          effectiveUntil: existingConfig.effectiveUntil,
          notes: existingConfig.notes || '',
        })
      } else {
        // New config with role-based suggestions
        const suggestion = getRoleSuggestion(employee.role)
        setFormData({
          employeeId: employee.id,
          baseSalary: suggestion.baseSalary,
          commissionRate: 0, // Always 0 since we use existing commission system
          payrollType: suggestion.payrollType,
          commissionType: 'none' as CommissionType, // Always none since we use existing commission system
          effectiveFrom: getOfficeTime(timezone),
          notes: `Konfigurasi gaji untuk ${employee.name} (${employee.role})`,
        })
      }
    }
  }, [isOpen, employee, existingConfig, timezone])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!employee) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Employee data not found',
      })
      return
    }

    setIsLoading(true)

    try {
      // Prepare data for submission - always use 'none' for commission since we use existing system
      const submitData = {
        ...formData,
        baseSalary: formData.payrollType === 'commission_only' ? 0 : formData.baseSalary,
        commissionType: 'none' as CommissionType,
        commissionRate: 0
      }

      if (existingConfig) {
        // Update existing config
        await updateSalaryConfig.mutateAsync({
          id: existingConfig.id,
          data: submitData,
        })
      } else {
        // Create new config
        await createSalaryConfig.mutateAsync(submitData)
      }

      onOpenChange(false)
    } catch (error) {
      console.error('Failed to save salary configuration:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const calculatePreview = () => {
    if (formData.payrollType === 'commission_only') {
      return {
        baseSalary: 0,
        estimatedCommission: 'Dari sistem komisi existing',
        estimatedTotal: 'Tergantung performance dan komisi'
      }
    }

    return {
      baseSalary: formData.baseSalary,
      estimatedCommission: formData.payrollType === 'mixed' ? 'Dari sistem komisi existing' : 'Tidak ada',
      estimatedTotal: formData.payrollType === 'mixed' ?
        `${formatCurrency(formData.baseSalary)} + komisi` :
        formatCurrency(formData.baseSalary)
    }
  }

  const preview = calculatePreview()

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {existingConfig ? 'Edit' : 'Setup'} Konfigurasi Gaji
          </DialogTitle>
          <DialogDescription>
            {employee && (
              <>
                Atur gaji dan komisi untuk <strong>{employee.name}</strong> ({employee.role})
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Employee Info */}
          {employee && (
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{employee.name}</p>
                    <p className="text-sm text-muted-foreground">{employee.email}</p>
                  </div>
                  <Badge variant="outline">{employee.role}</Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Payroll Type */}
          <div className="space-y-2">
            <Label htmlFor="payrollType">Tipe Penggajian *</Label>
            <Select value={formData.payrollType} onValueChange={(value: PayrollType) =>
              setFormData(prev => ({
                ...prev,
                payrollType: value,
                baseSalary: value === 'commission_only' ? 0 : prev.baseSalary,
                commissionType: 'none' // Always none since we use existing commission system
              }))
            }>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {payrollTypeOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    <div>
                      <p className="font-medium">{option.label}</p>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Base Salary */}
          {formData.payrollType === 'monthly' || formData.payrollType === 'mixed' ? (
            <div className="space-y-2">
              <Label htmlFor="baseSalary">Gaji Pokok *</Label>
              <Input
                id="baseSalary"
                type="number"
                value={formData.baseSalary}
                onChange={(e) => setFormData(prev => ({ ...prev, baseSalary: Number(e.target.value) }))}
                placeholder="3500000"
                min="0"
                step="100000"
                required
              />
              <p className="text-xs text-muted-foreground">
                Preview: {formatCurrency(formData.baseSalary)}
              </p>
            </div>
          ) : (
            // For commission_only, set baseSalary to 0 and show info
            <Card className="bg-orange-50 border-orange-200">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-orange-700 mb-2">
                  <DollarSign className="h-4 w-4" />
                  <span className="font-medium">Gaji Komisi Saja</span>
                </div>
                <p className="text-sm text-orange-600">
                  Tidak ada gaji pokok - pendapatan 100% dari komisi existing system
                </p>
              </CardContent>
            </Card>
          )}

          {/* Commission Info */}
          {(formData.payrollType === 'mixed' || formData.payrollType === 'commission_only') && (
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="pt-4">
                <h4 className="font-medium mb-2 flex items-center gap-2 text-blue-700">
                  <DollarSign className="h-4 w-4" />
                  Informasi Komisi
                </h4>
                <div className="text-sm text-blue-600 space-y-1">
                  <p>• Komisi akan diambil otomatis dari <strong>sistem komisi existing</strong></p>
                  <p>• Tidak perlu setup manual - langsung terhubung ke laporan komisi</p>
                  <p>• Komisi dihitung dari data di tabel <code>commission_entries</code></p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Effective Period */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="effectiveFrom">Berlaku Mulai *</Label>
              <Input
                id="effectiveFrom"
                type="date"
                value={formData.effectiveFrom.toISOString().split('T')[0]}
                onChange={(e) => setFormData(prev => ({ ...prev, effectiveFrom: new Date(e.target.value) }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="effectiveUntil">Berlaku Sampai</Label>
              <Input
                id="effectiveUntil"
                type="date"
                value={formData.effectiveUntil?.toISOString().split('T')[0] || ''}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  effectiveUntil: e.target.value ? new Date(e.target.value) : undefined
                }))}
              />
              <p className="text-xs text-muted-foreground">Kosongkan jika tidak ada batas waktu</p>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Catatan</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Catatan tambahan tentang konfigurasi gaji..."
              rows={3}
            />
          </div>

          {/* Preview */}
          <Card>
            <CardContent className="pt-4">
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Preview Gaji Bulanan
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Gaji Pokok:</span>
                  <span className="font-medium">{formatCurrency(preview.baseSalary)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Estimasi Komisi:</span>
                  <span className="font-medium text-blue-600">{preview.estimatedCommission}</span>
                </div>
                <div className="border-t pt-2">
                  <div className="flex justify-between font-semibold">
                    <span>Estimasi Total:</span>
                    <span className="text-green-600">{preview.estimatedTotal}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Submit Buttons */}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Batal
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Menyimpan...' : (existingConfig ? 'Update' : 'Simpan')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}