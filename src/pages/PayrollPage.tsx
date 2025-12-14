"use client"

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar as CalendarComponent } from '@/components/ui/calendar'
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
  AlertTriangle,
  FileDown,
  Calendar,
  Filter,
  X,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns'
import { id } from 'date-fns/locale/id'
import { cn } from '@/lib/utils'
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

  // Filter states for payroll history
  const [showFilters, setShowFilters] = useState(false)
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined })
  const [employeeFilter, setEmployeeFilter] = useState<string>('all')

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

  // Filter payroll records
  const filteredPayrollRecords = payrollRecords?.filter(record => {
    // Filter by date range
    if (dateRange.from || dateRange.to) {
      const recordDate = new Date(record.periodYear, record.periodMonth - 1, 15) // Use mid-month as reference
      if (dateRange.from && dateRange.to) {
        if (!isWithinInterval(recordDate, {
          start: startOfDay(dateRange.from),
          end: endOfDay(dateRange.to)
        })) return false
      } else if (dateRange.from) {
        if (recordDate < startOfDay(dateRange.from)) return false
      } else if (dateRange.to) {
        if (recordDate > endOfDay(dateRange.to)) return false
      }
    }

    // Filter by employee
    if (employeeFilter !== 'all' && record.employeeId !== employeeFilter) {
      return false
    }

    return true
  }) || []

  // Export to Excel
  const handleExportExcel = () => {
    const exportData = filteredPayrollRecords.map((record, index) => ({
      'No': index + 1,
      'Periode': `${record.periodMonth}/${record.periodYear}`,
      'Karyawan': record.employeeName,
      'Gaji Pokok': record.baseSalary,
      'Bonus': record.bonuses || 0,
      'Komisi': record.commission || 0,
      'Potongan': record.deductions || 0,
      'Gaji Bersih': record.netSalary,
      'Status': record.status === 'paid' ? 'Dibayar' : record.status === 'approved' ? 'Disetujui' : 'Draft',
      'Dibayar Oleh': record.paidBy || '-',
    }))

    const worksheet = XLSX.utils.json_to_sheet(exportData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Riwayat Gaji')

    let filename = `riwayat-gaji-${filteredPayrollRecords.length}-records`
    if (dateRange.from && dateRange.to) {
      filename += `-${format(dateRange.from, 'yyyy-MM-dd')}-${format(dateRange.to, 'yyyy-MM-dd')}`
    }
    filename += '.xlsx'

    XLSX.writeFile(workbook, filename)
  }

  // Export to PDF
  const handleExportPDF = () => {
    const totalBaseSalary = filteredPayrollRecords.reduce((sum, r) => sum + r.baseSalary, 0)
    const totalBonus = filteredPayrollRecords.reduce((sum, r) => sum + (r.bonuses || 0), 0)
    const totalCommission = filteredPayrollRecords.reduce((sum, r) => sum + (r.commission || 0), 0)
    const totalDeductions = filteredPayrollRecords.reduce((sum, r) => sum + (r.deductions || 0), 0)
    const totalNetSalary = filteredPayrollRecords.reduce((sum, r) => sum + r.netSalary, 0)

    const doc = new jsPDF()

    doc.setFontSize(16)
    doc.text('Riwayat Pembayaran Gaji', 14, 15)
    doc.setFontSize(10)
    doc.text(`Total Records: ${filteredPayrollRecords.length}`, 14, 25)
    if (dateRange.from && dateRange.to) {
      doc.text(`Periode: ${format(dateRange.from, 'd MMM yyyy', { locale: id })} - ${format(dateRange.to, 'd MMM yyyy', { locale: id })}`, 14, 30)
      doc.text(`Export Date: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 35)
    } else {
      doc.text(`Export Date: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 30)
    }

    autoTable(doc, {
      head: [['No', 'Periode', 'Karyawan', 'Gaji Pokok', 'Bonus', 'Komisi', 'Potongan', 'Gaji Bersih', 'Status']],
      body: [
        ...filteredPayrollRecords.map((record, index) => [
          index + 1,
          `${record.periodMonth}/${record.periodYear}`,
          record.employeeName,
          formatCurrency(record.baseSalary),
          formatCurrency(record.bonuses || 0),
          formatCurrency(record.commission || 0),
          formatCurrency(record.deductions || 0),
          formatCurrency(record.netSalary),
          record.status === 'paid' ? 'Dibayar' : record.status === 'approved' ? 'Disetujui' : 'Draft',
        ]),
        // Summary row
        [
          '',
          '',
          `TOTAL (${filteredPayrollRecords.length})`,
          formatCurrency(totalBaseSalary),
          formatCurrency(totalBonus),
          formatCurrency(totalCommission),
          formatCurrency(totalDeductions),
          formatCurrency(totalNetSalary),
          '',
        ]
      ],
      startY: dateRange.from && dateRange.to ? 40 : 35,
      styles: {
        fontSize: 8,
        cellPadding: 1.5
      },
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontSize: 8,
        fontStyle: 'bold'
      },
      didParseCell: function (data: any) {
        if (data.row.index === filteredPayrollRecords.length) {
          data.cell.styles.fillColor = [52, 152, 219]
          data.cell.styles.textColor = 255
          data.cell.styles.fontStyle = 'bold'
        }
      }
    })

    let filename = `riwayat-gaji-${filteredPayrollRecords.length}-records`
    if (dateRange.from && dateRange.to) {
      filename += `-${format(dateRange.from, 'yyyy-MM-dd')}-${format(dateRange.to, 'yyyy-MM-dd')}`
    }
    filename += '.pdf'

    doc.save(filename)
  }

  const clearFilters = () => {
    setDateRange({ from: undefined, to: undefined })
    setEmployeeFilter('all')
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
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Riwayat Pembayaran Gaji</CardTitle>
                  <CardDescription>
                    Histori semua pembayaran gaji yang telah dilakukan
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleExportExcel} className="gap-2">
                    <FileDown className="h-4 w-4" />
                    Excel
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-2">
                    <FileDown className="h-4 w-4" />
                    PDF
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filter Section */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                    className="gap-2"
                  >
                    <Filter className="h-4 w-4" />
                    Filter
                  </Button>
                  {(dateRange.from || dateRange.to || employeeFilter !== 'all') && (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Filter aktif</Badge>
                      <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-2">
                        <X className="h-4 w-4" />
                        Reset
                      </Button>
                    </div>
                  )}
                </div>

                {showFilters && (
                  <div className="border rounded-lg p-4 bg-muted/40">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Date Range Filter */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Rentang Tanggal</label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !dateRange.from && !dateRange.to && "text-muted-foreground"
                              )}
                            >
                              <Calendar className="mr-2 h-4 w-4" />
                              {dateRange.from ? (
                                dateRange.to ? (
                                  `${format(dateRange.from, "d MMM yyyy", { locale: id })} - ${format(dateRange.to, "d MMM yyyy", { locale: id })}`
                                ) : (
                                  `${format(dateRange.from, "d MMM yyyy", { locale: id })} - ...`
                                )
                              ) : (
                                "Pilih Rentang Tanggal"
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent
                              initialFocus
                              mode="range"
                              defaultMonth={dateRange.from}
                              selected={dateRange.from && dateRange.to ? { from: dateRange.from, to: dateRange.to } : dateRange.from ? { from: dateRange.from, to: undefined } : undefined}
                              onSelect={(range) => {
                                if (range) {
                                  setDateRange({ from: range.from, to: range.to })
                                } else {
                                  setDateRange({ from: undefined, to: undefined })
                                }
                              }}
                              numberOfMonths={2}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>

                      {/* Employee Filter */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Karyawan</label>
                        <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                          <SelectTrigger>
                            <SelectValue placeholder="Semua Karyawan" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Semua Karyawan</SelectItem>
                            {employees?.map(emp => (
                              <SelectItem key={emp.id} value={emp.id}>
                                {emp.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Table */}
              {filteredPayrollRecords.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-16 w-16 mx-auto mb-4" />
                  <p>Tidak ada riwayat pembayaran</p>
                  <p className="text-sm">Silakan tambahkan data gaji karyawan terlebih dahulu</p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Karyawan</TableHead>
                        <TableHead>Deskripsi</TableHead>
                        <TableHead>Akun Pembayaran</TableHead>
                        <TableHead className="text-right">Jumlah</TableHead>
                        <TableHead>Dibayar Oleh</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPayrollRecords.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell>
                            <div className="text-sm">
                              {record.paidDate ? format(new Date(record.paidDate), 'd MMM yyyy', { locale: id }) : '-'}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {record.paidDate ? format(new Date(record.paidDate), 'HH:mm') : ''}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{record.employeeName}</div>
                            <div className="text-xs text-muted-foreground">
                              ID: {record.employeeId.substring(0, 8)}...
                            </div>
                          </TableCell>
                          <TableCell>
                            Pembayaran gaji {record.employeeName} - {record.periodMonth}/{record.periodYear}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{record.paymentAccount || 'Kas dan Setara Kas'}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-bold text-green-600">
                              {formatCurrency(record.netSalary)}
                            </span>
                          </TableCell>
                          <TableCell>
                            {record.paidBy || '-'}
                          </TableCell>
                          <TableCell>
                            {getPayrollStatusBadge(record.status)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Summary */}
              {filteredPayrollRecords.length > 0 && (
                <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-green-900">Ringkasan Pembayaran Gaji</h3>
                    <div className="text-right">
                      <p className="text-sm text-green-700">Total Pembayaran</p>
                      <p className="text-2xl font-bold text-green-900">
                        {formatCurrency(filteredPayrollRecords.reduce((sum, r) => sum + r.netSalary, 0))}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-green-700 mt-2">
                    Jumlah Transaksi: {filteredPayrollRecords.length} |
                    Gaji: {formatCurrency(filteredPayrollRecords.reduce((sum, r) => sum + r.baseSalary, 0))} |
                    Bonus: {formatCurrency(filteredPayrollRecords.reduce((sum, r) => sum + (r.bonuses || 0), 0))}
                  </p>
                </div>
              )}
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