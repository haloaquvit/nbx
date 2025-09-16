"use client"

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DollarSign,
  Users,
  Calculator,
  History,
  Settings,
  Plus,
  Edit,
  CheckCircle,
  Clock,
  AlertTriangle
} from 'lucide-react'
import { useEmployees } from '@/hooks/useEmployees'
import { useEmployeeSalaries, usePayrollRecords, usePayrollSummary } from '@/hooks/usePayroll'
import { SalaryConfigDialog } from '@/components/SalaryConfigDialog'
import { Employee } from '@/types/employee'
import { EmployeeSalary, PayrollRecord } from '@/types/payroll'
import { useAuth } from '@/hooks/useAuth'
import { isOwner, isAdmin } from '@/utils/roleUtils'

export default function PayrollPage() {
  const { user } = useAuth()
  const { employees } = useEmployees()
  const { salaryConfigs, isLoading: isLoadingSalaries } = useEmployeeSalaries()
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const { payrollRecords } = usePayrollRecords({
    year: selectedYear,
    month: selectedMonth,
  })
  const { summary } = usePayrollSummary(selectedYear, selectedMonth)

  const [isSalaryConfigDialogOpen, setIsSalaryConfigDialogOpen] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [selectedSalaryConfig, setSelectedSalaryConfig] = useState<EmployeeSalary | null>(null)

  const userCanManagePayroll = isOwner(user) || isAdmin(user)

  const handleOpenSalaryConfigDialog = (employee: Employee, existingConfig?: EmployeeSalary) => {
    setSelectedEmployee(employee)
    setSelectedSalaryConfig(existingConfig || null)
    setIsSalaryConfigDialogOpen(true)
  }

  const getSalaryConfig = (employeeId: string) => {
    return salaryConfigs?.find(config => config.employeeId === employeeId && config.isActive)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const getPayrollStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge variant="default" className="bg-green-500 hover:bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Dibayar</Badge>
      case 'approved':
        return <Badge variant="outline" className="text-blue-600 border-blue-600"><Clock className="h-3 w-3 mr-1" />Disetujui</Badge>
      case 'draft':
        return <Badge variant="secondary"><Edit className="h-3 w-3 mr-1" />Draft</Badge>
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
  }

  const getPayrollTypeBadge = (type: string) => {
    switch (type) {
      case 'monthly':
        return <Badge variant="outline" className="text-blue-600">Gaji Bulanan</Badge>
      case 'commission_only':
        return <Badge variant="outline" className="text-green-600">Komisi Saja</Badge>
      case 'mixed':
        return <Badge variant="outline" className="text-purple-600">Gaji + Komisi</Badge>
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
  }

  if (!userCanManagePayroll) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertTriangle className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Akses Terbatas</h3>
            <p className="text-muted-foreground text-center">
              Hanya admin dan owner yang dapat mengakses halaman penggajian.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <DollarSign className="h-8 w-8" />
            Sistem Penggajian
          </h1>
          <p className="text-muted-foreground">
            Kelola gaji karyawan, komisi, dan proses pembayaran
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Karyawan</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalEmployees}</div>
              <p className="text-xs text-muted-foreground">
                {summary.period.display}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Gaji Kotor</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {formatCurrency(summary.totalGrossSalary)}
              </div>
              <p className="text-xs text-muted-foreground">
                Gaji: {formatCurrency(summary.totalBaseSalary)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Komisi</CardTitle>
              <Calculator className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(summary.totalCommission)}
              </div>
              <p className="text-xs text-muted-foreground">
                Bonus: {formatCurrency(summary.totalBonus)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Status Pembayaran</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{summary.paidCount}</div>
              <p className="text-xs text-muted-foreground">
                Pending: {summary.pendingCount} | Draft: {summary.draftCount}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="salary-config" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="salary-config" className="gap-2">
            <Settings className="h-4 w-4" />
            Konfigurasi Gaji
          </TabsTrigger>
          <TabsTrigger value="payroll-records" className="gap-2">
            <Calculator className="h-4 w-4" />
            Catatan Gaji
          </TabsTrigger>
          <TabsTrigger value="payroll-history" className="gap-2">
            <History className="h-4 w-4" />
            Riwayat Pembayaran
          </TabsTrigger>
        </TabsList>

        {/* Salary Configuration Tab */}
        <TabsContent value="salary-config" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Konfigurasi Gaji Karyawan</CardTitle>
                  <CardDescription>
                    Atur gaji pokok dan komisi untuk setiap karyawan
                  </CardDescription>
                </div>
                <Button onClick={() => setIsSalaryConfigDialogOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Tambah Konfigurasi
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Karyawan</TableHead>
                      <TableHead>Jabatan</TableHead>
                      <TableHead>Tipe Gaji</TableHead>
                      <TableHead className="text-right">Gaji Pokok</TableHead>
                      <TableHead className="text-right">Komisi (%)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees?.map((employee) => {
                      const salaryConfig = getSalaryConfig(employee.id)
                      return (
                        <TableRow key={employee.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{employee.name}</p>
                              <p className="text-xs text-muted-foreground">{employee.email}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{employee.role}</Badge>
                          </TableCell>
                          <TableCell>
                            {salaryConfig ? (
                              getPayrollTypeBadge(salaryConfig.payrollType)
                            ) : (
                              <Badge variant="secondary">Belum diatur</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {salaryConfig ? (
                              <span className="font-medium">
                                {formatCurrency(salaryConfig.baseSalary)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {salaryConfig && salaryConfig.commissionRate > 0 ? (
                              <span className="font-medium text-green-600">
                                {salaryConfig.commissionRate}%
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {salaryConfig ? (
                              salaryConfig.isActive ? (
                                <Badge variant="outline" className="text-green-600">Aktif</Badge>
                              ) : (
                                <Badge variant="outline" className="text-red-600">Tidak Aktif</Badge>
                              )
                            ) : (
                              <Badge variant="secondary">Belum diatur</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenSalaryConfigDialog(employee, salaryConfig)}
                            >
                              {salaryConfig ? <Edit className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payroll Records Tab */}
        <TabsContent value="payroll-records" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Catatan Gaji Bulanan</CardTitle>
                  <CardDescription>
                    Kelola pembayaran gaji per periode
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Select value={selectedMonth.toString()} onValueChange={(value) => setSelectedMonth(Number(value))}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => (
                        <SelectItem key={i + 1} value={(i + 1).toString()}>
                          {new Date(0, i).toLocaleDateString('id-ID', { month: 'long' })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(Number(value))}>
                    <SelectTrigger className="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 5 }, (_, i) => (
                        <SelectItem key={i} value={(new Date().getFullYear() - i).toString()}>
                          {new Date().getFullYear() - i}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Karyawan</TableHead>
                      <TableHead className="text-right">Gaji Pokok</TableHead>
                      <TableHead className="text-right">Komisi</TableHead>
                      <TableHead className="text-right">Bonus</TableHead>
                      <TableHead className="text-right">Potongan</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payrollRecords?.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{record.employeeName}</p>
                            <p className="text-xs text-muted-foreground">{record.employeeRole}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(record.baseSalaryAmount)}
                        </TableCell>
                        <TableCell className="text-right">
                          {record.commissionAmount > 0 ? (
                            <span className="text-green-600 font-medium">
                              {formatCurrency(record.commissionAmount)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {record.bonusAmount > 0 ? (
                            <span className="text-blue-600 font-medium">
                              {formatCurrency(record.bonusAmount)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {record.deductionAmount > 0 ? (
                            <span className="text-red-600 font-medium">
                              ({formatCurrency(record.deductionAmount)})
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-bold">
                            {formatCurrency(record.netSalary)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {getPayrollStatusBadge(record.status)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline">
                            <Edit className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payroll History Tab */}
        <TabsContent value="payroll-history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Riwayat Pembayaran Gaji</CardTitle>
              <CardDescription>
                Histori semua pembayaran gaji yang telah dilakukan
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <History className="h-16 w-16 mx-auto mb-4" />
                <p>Riwayat pembayaran akan ditampilkan di sini</p>
                <p className="text-sm">Fitur ini akan segera tersedia</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <SalaryConfigDialog
        isOpen={isSalaryConfigDialogOpen}
        onOpenChange={setIsSalaryConfigDialogOpen}
        employee={selectedEmployee}
        existingConfig={selectedSalaryConfig}
      />
    </div>
  )
}