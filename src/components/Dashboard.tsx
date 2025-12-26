"use client"
import { useState, useMemo } from "react"
import { Link } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { DateRange } from "react-day-picker"
import { useAuthContext } from "@/contexts/AuthContext"
import { useTransactions } from "@/hooks/useTransactions"
import { useExpenses } from "@/hooks/useExpenses"
import { useCustomers } from "@/hooks/useCustomers"
import { useMaterials } from "@/hooks/useMaterials"
import { useAccounts } from "@/hooks/useAccounts"
import { Material } from "@/types/material"
import { format, subDays, startOfDay, endOfDay, startOfMonth, isWithinInterval, eachDayOfInterval } from "date-fns"
import { id } from "date-fns/locale/id"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Users, AlertTriangle, DollarSign, TrendingDown, Scale, Award, ShoppingCart, TrendingUp, Activity, PieChart, BarChart3, ChevronLeft, ChevronRight, UserCheck, UserX } from "lucide-react"
import { Button } from "@/components/ui/button"

export function Dashboard() {
  const { user } = useAuthContext()
  const { transactions, isLoading: transactionsLoading } = useTransactions()
  const { expenses, isLoading: expensesLoading } = useExpenses()
  const { customers, isLoading: customersLoading } = useCustomers()
  const { materials, isLoading: materialsLoading } = useMaterials()
  const { accounts, isLoading: accountsLoading } = useAccounts()

  // Helper function to calculate production cost based on BOM and material prices
  const calculateProductionCost = (product: any, quantity: number, materials: Material[] | undefined): number => {
    if (!materials || !product.materials || product.materials.length === 0) {
      // Fallback: Estimate cost as 70% of base price if no materials data
      // This provides more realistic profit margins for analysis
      return product.basePrice * quantity * 0.7;
    }

    let totalCost = 0;
    product.materials.forEach((productMaterial: any) => {
      const material = materials.find(m => m.id === productMaterial.materialId);
      if (material) {
        const materialCost = material.pricePerUnit * productMaterial.quantity * quantity;
        totalCost += materialCost;
      }
    });

    return totalCost;
  };

  // Memoize today to prevent unnecessary re-calculations
  const today = useMemo(() => new Date(), [])
  const [chartDateRange, setChartDateRange] = useState<DateRange | undefined>(() => ({
    from: subDays(new Date(), 6),
    to: new Date(),
  }));

  // Pagination state for customer lists
  const [activeCustomerPage, setActiveCustomerPage] = useState(0);
  const [inactiveCustomerPage, setInactiveCustomerPage] = useState(0);
  const ITEMS_PER_PAGE = 5;

  const summaryData = useMemo(() => {
    const startOfToday = startOfDay(today)
    const endOfToday = endOfDay(today)
    const startOfThisMonth = startOfMonth(today)

    const todayTransactions = transactions?.filter(t => isWithinInterval(new Date(t.orderDate), { start: startOfToday, end: endOfToday })) || []
    const todayExpensesData = expenses?.filter(e => isWithinInterval(new Date(e.date), { start: startOfToday, end: endOfToday })) || []
    
    const todayIncome = todayTransactions.reduce((sum, t) => sum + t.total, 0)
    const todayExpense = todayExpensesData.reduce((sum, e) => sum + e.amount, 0)
    const todayNetProfit = todayIncome - todayExpense

    const newCustomersThisMonth = customers?.filter(c => new Date(c.createdAt) >= startOfThisMonth).length || 0
    const criticalStockItems = materials?.filter(m => m.stock <= m.minStock).length || 0

    const thisMonthTransactions = transactions?.filter(t => new Date(t.orderDate) >= startOfThisMonth) || []
    const customerTotals = thisMonthTransactions.reduce((acc, t) => {
      if (t.customerId && t.customerName) {
        const currentTotal = acc.get(t.customerId) || { name: t.customerName, total: 0 };
        acc.set(t.customerId, { ...currentTotal, total: currentTotal.total + t.total });
      }
      return acc;
    }, new Map<string, { name: string, total: number }>());

    const bestCustomer = customerTotals.size > 0 
      ? [...customerTotals.values()].sort((a, b) => b.total - a.total)[0]
      : null;

    // Analyze product sales and profits (this month)
    const productStats = thisMonthTransactions.reduce((acc, transaction) => {
      transaction.items.forEach(item => {
        const productId = item.product.id;
        const productName = item.product.name;
        
        if (!acc[productId]) {
          acc[productId] = {
            productId: productId,
            productName: productName,
            totalQuantity: 0,
            totalRevenue: 0,
            totalProfit: 0,
            transactions: 0
          };
        }
        
        const itemTotal = item.quantity * item.price;
        const itemCost = calculateProductionCost(item.product, item.quantity, materials);
        const itemProfit = itemTotal - itemCost;
        
        acc[productId].totalQuantity += item.quantity;
        acc[productId].totalRevenue += itemTotal;
        acc[productId].totalProfit += itemProfit;
        acc[productId].transactions += 1;
      });
      return acc;
    }, {} as Record<string, {
      productId: string;
      productName: string;
      totalQuantity: number;
      totalRevenue: number;
      totalProfit: number;
      transactions: number;
    }>);

    const productStatsArray = Object.values(productStats);

    // Top selling product (by quantity) - create copy to avoid mutating original
    const topSellingProduct = productStatsArray.length > 0 
      ? [...productStatsArray].sort((a, b) => b.totalQuantity - a.totalQuantity)[0]
      : null;
    
    // Most profitable product (by profit amount) - create copy to avoid mutating original
    const mostProfitableProduct = productStatsArray.length > 0
      ? [...productStatsArray].sort((a, b) => b.totalProfit - a.totalProfit)[0]
      : null;

    return {
      todayIncome,
      todayTransactionsCount: todayTransactions.length,
      todayExpense,
      todayNetProfit,
      newCustomersThisMonth,
      criticalStockItems,
      bestCustomer,
      topSellingProduct,
      mostProfitableProduct
    }
  }, [transactions, expenses, customers, materials, today])

  // ============================================================================
  // RASIO KEUANGAN (Financial Ratios)
  // ============================================================================
  // ROA = Net Profit / Total Assets (kemampuan menghasilkan laba dari aset)
  // ROE = Net Profit / Total Equity (kemampuan menghasilkan laba dari modal)
  // DER = Total Liabilities / Total Equity (tingkat leverage/hutang)
  // ============================================================================
  const financialRatios = useMemo(() => {
    if (!accounts || accounts.length === 0) {
      return {
        totalAssets: 0,
        totalLiabilities: 0,
        totalEquity: 0,
        netProfit: 0,
        roa: 0,
        roe: 0,
        der: 0,
      };
    }

    // Calculate totals by account type
    const totalAssets = accounts
      .filter(acc => acc.type === 'Aset')
      .reduce((sum, acc) => sum + (acc.balance || 0), 0);

    const totalLiabilities = accounts
      .filter(acc => acc.type === 'Kewajiban')
      .reduce((sum, acc) => sum + (acc.balance || 0), 0);

    // Modal dari akun langsung
    const totalModalAkun = accounts
      .filter(acc => acc.type === 'Modal')
      .reduce((sum, acc) => sum + (acc.balance || 0), 0);

    // Jika akun Modal kosong, gunakan persamaan akuntansi: Modal = Aset - Kewajiban
    // Ini adalah retained earnings (laba ditahan) yang belum dicatat ke akun Modal
    const totalEquity = totalModalAkun > 0
      ? totalModalAkun
      : (totalAssets - totalLiabilities);

    // Net Profit = Pendapatan - Beban
    const totalPendapatan = accounts
      .filter(acc => acc.type === 'Pendapatan')
      .reduce((sum, acc) => sum + (acc.balance || 0), 0);

    const totalBeban = accounts
      .filter(acc => acc.type === 'Beban')
      .reduce((sum, acc) => sum + (acc.balance || 0), 0);

    const netProfit = totalPendapatan - totalBeban;

    // Calculate ratios (handle division by zero)
    const roa = totalAssets > 0 ? (netProfit / totalAssets) * 100 : 0;
    const roe = totalEquity > 0 ? (netProfit / totalEquity) * 100 : 0;
    const der = totalEquity > 0 ? totalLiabilities / totalEquity : 0;

    return {
      totalAssets,
      totalLiabilities,
      totalEquity,
      netProfit,
      roa,
      roe,
      der,
    };
  }, [accounts]);

  const chartData = useMemo(() => {
    const daysInChartRange = chartDateRange?.from && chartDateRange?.to
      ? eachDayOfInterval({ start: chartDateRange.from, end: chartDateRange.to })
      : [];
    
    return daysInChartRange.map(date => {
      const dailyTransactions = transactions?.filter(t => isWithinInterval(new Date(t.orderDate), { start: startOfDay(date), end: endOfDay(date) })) || []
      return {
        name: format(date, 'EEE, d/M', { locale: id }),
        Pendapatan: dailyTransactions.reduce((sum, t) => sum + t.total, 0),
      }
    })
  }, [transactions, chartDateRange])

  // Pelanggan paling aktif dan tidak aktif berdasarkan transaksi
  const customerActivity = useMemo(() => {
    if (!customers || !transactions) return { activeCustomers: [], inactiveCustomers: [] };

    // Hitung statistik transaksi per pelanggan
    const customerStats = customers.map(customer => {
      const customerTransactions = transactions.filter(t => t.customerId === customer.id);
      const totalTransactions = customerTransactions.length;
      const totalAmount = customerTransactions.reduce((sum, t) => sum + t.total, 0);
      const lastTransaction = customerTransactions.length > 0
        ? customerTransactions.sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime())[0]
        : null;

      return {
        id: customer.id,
        name: customer.name,
        phone: customer.phone || '-',
        totalTransactions,
        totalAmount,
        lastTransactionDate: lastTransaction ? new Date(lastTransaction.orderDate) : null,
        daysSinceLastTransaction: lastTransaction
          ? Math.floor((today.getTime() - new Date(lastTransaction.orderDate).getTime()) / (1000 * 60 * 60 * 24))
          : Infinity,
      };
    });

    // Pelanggan aktif: diurutkan berdasarkan jumlah transaksi (terbanyak dulu)
    const activeCustomers = customerStats
      .filter(c => c.totalTransactions > 0)
      .sort((a, b) => b.totalTransactions - a.totalTransactions);

    // Pelanggan tidak aktif: sudah lama tidak transaksi atau belum pernah transaksi
    // Diurutkan berdasarkan hari sejak transaksi terakhir (terlama dulu)
    const inactiveCustomers = customerStats
      .filter(c => c.daysSinceLastTransaction >= 30 || c.totalTransactions === 0) // 30 hari tidak aktif
      .sort((a, b) => b.daysSinceLastTransaction - a.daysSinceLastTransaction);

    return { activeCustomers, inactiveCustomers };
  }, [customers, transactions, today]);

  const isLoading = transactionsLoading || customersLoading || materialsLoading || expensesLoading || accountsLoading

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-1/4" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <Card className="col-span-4"><CardHeader><Skeleton className="h-6 w-1/3" /></CardHeader><CardContent><Skeleton className="h-64" /></CardContent></Card>
          <Card className="col-span-3"><CardHeader><Skeleton className="h-6 w-1/2" /></CardHeader><CardContent><Skeleton className="h-64" /></CardContent></Card>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Selamat Datang, {user?.name || 'Pengguna'}!</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Pendapatan Hari Ini</CardTitle><DollarSign className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(summaryData.todayIncome)}</div><p className="text-xs text-muted-foreground">{summaryData.todayTransactionsCount} transaksi</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Pengeluaran Hari Ini</CardTitle><TrendingDown className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(summaryData.todayExpense)}</div><p className="text-xs text-muted-foreground">dari semua akun</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Laba Bersih Hari Ini</CardTitle><Scale className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(summaryData.todayNetProfit)}</div><p className="text-xs text-muted-foreground">Estimasi laba bersih</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Pelanggan Baru (Bulan Ini)</CardTitle><Users className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">+{summaryData.newCustomersThisMonth}</div><p className="text-xs text-muted-foreground">Sejak {format(startOfMonth(today), "d MMM")}</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Pelanggan Terbaik (Bulan Ini)</CardTitle><Award className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summaryData.bestCustomer?.name || '-'}</div><p className="text-xs text-muted-foreground">Total belanja: {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(summaryData.bestCustomer?.total || 0)}</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Produk Terlaris (Bulan Ini)</CardTitle><ShoppingCart className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summaryData.topSellingProduct?.productName || '-'}</div><p className="text-xs text-muted-foreground">Terjual: {summaryData.topSellingProduct?.totalQuantity || 0} unit</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Produk Paling Menghasilkan</CardTitle><TrendingUp className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summaryData.mostProfitableProduct?.productName || '-'}</div><p className="text-xs text-muted-foreground">Profit: {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(summaryData.mostProfitableProduct?.totalProfit || 0)}</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Stok Kritis</CardTitle><AlertTriangle className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summaryData.criticalStockItems} item</div><p className="text-xs text-muted-foreground">Perlu segera dipesan ulang</p></CardContent></Card>
      </div>

      {/* Rasio Keuangan (Financial Health) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Kesehatan Keuangan
          </CardTitle>
          <CardDescription>Indikator rasio keuangan perusahaan</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {/* ROA - Return on Assets */}
            <div className="flex flex-col gap-2 p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">ROA</span>
                <PieChart className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className={`text-2xl font-bold ${financialRatios.roa >= 5 ? 'text-green-600' : financialRatios.roa >= 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                {financialRatios.roa.toFixed(2)}%
              </div>
              <p className="text-xs text-muted-foreground">
                Return on Assets
              </p>
              <p className="text-xs text-muted-foreground">
                {financialRatios.roa >= 5 ? 'Baik (>5%)' : financialRatios.roa >= 0 ? 'Cukup (0-5%)' : 'Kurang (<0%)'}
              </p>
            </div>

            {/* ROE - Return on Equity */}
            <div className="flex flex-col gap-2 p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">ROE</span>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className={`text-2xl font-bold ${financialRatios.roe >= 15 ? 'text-green-600' : financialRatios.roe >= 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                {financialRatios.roe.toFixed(2)}%
              </div>
              <p className="text-xs text-muted-foreground">
                Return on Equity
              </p>
              <p className="text-xs text-muted-foreground">
                {financialRatios.roe >= 15 ? 'Baik (>15%)' : financialRatios.roe >= 0 ? 'Cukup (0-15%)' : 'Kurang (<0%)'}
              </p>
            </div>

            {/* DER - Debt to Equity Ratio */}
            <div className="flex flex-col gap-2 p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">DER</span>
                <Scale className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className={`text-2xl font-bold ${financialRatios.der <= 1 ? 'text-green-600' : financialRatios.der <= 2 ? 'text-yellow-600' : 'text-red-600'}`}>
                {financialRatios.der.toFixed(2)}x
              </div>
              <p className="text-xs text-muted-foreground">
                Debt to Equity Ratio
              </p>
              <p className="text-xs text-muted-foreground">
                {financialRatios.der <= 1 ? 'Sehat (<=1x)' : financialRatios.der <= 2 ? 'Moderat (1-2x)' : 'Tinggi (>2x)'}
              </p>
            </div>
          </div>

          {/* Summary Totals */}
          <div className="mt-4 pt-4 border-t grid gap-4 md:grid-cols-4 text-sm">
            <div>
              <p className="text-muted-foreground">Total Aset</p>
              <p className="font-medium">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(financialRatios.totalAssets)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total Kewajiban</p>
              <p className="font-medium">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(financialRatios.totalLiabilities)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total Modal</p>
              <p className="font-medium">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(financialRatios.totalEquity)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Laba Bersih</p>
              <p className={`font-medium ${financialRatios.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(financialRatios.netProfit)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader className="flex-row items-center justify-between">
            <div className="space-y-1"><CardTitle>Grafik Pendapatan</CardTitle><CardDescription>Visualisasi pendapatan berdasarkan rentang waktu.</CardDescription></div>
            <DateRangePicker date={chartDateRange} onDateChange={setChartDateRange} />
          </CardHeader>
          <CardContent className="pl-2">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${new Intl.NumberFormat("id-ID", { notation: "compact", compactDisplay: "short" }).format(value as number)}`} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} cursor={{ fill: 'hsl(var(--muted))' }} formatter={(value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(value)} />
                <Legend />
                <Bar dataKey="Pendapatan" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        {/* Pelanggan Paling Aktif */}
        <Card className="col-span-3">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-green-600" />
                Pelanggan Aktif
              </CardTitle>
              <CardDescription>Pelanggan dengan transaksi terbanyak</CardDescription>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setActiveCustomerPage(p => Math.max(0, p - 1))}
                disabled={activeCustomerPage === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground px-2">
                {activeCustomerPage + 1}/{Math.max(1, Math.ceil(customerActivity.activeCustomers.length / ITEMS_PER_PAGE))}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setActiveCustomerPage(p => Math.min(Math.ceil(customerActivity.activeCustomers.length / ITEMS_PER_PAGE) - 1, p + 1))}
                disabled={activeCustomerPage >= Math.ceil(customerActivity.activeCustomers.length / ITEMS_PER_PAGE) - 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pelanggan</TableHead>
                  <TableHead className="text-center">Transaksi</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customerActivity.activeCustomers
                  .slice(activeCustomerPage * ITEMS_PER_PAGE, (activeCustomerPage + 1) * ITEMS_PER_PAGE)
                  .map((customer, idx) => (
                    <TableRow key={customer.id} className="hover:bg-muted/50">
                      <TableCell>
                        <div className="font-medium">{customer.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {customer.lastTransactionDate
                            ? `Terakhir: ${format(customer.lastTransactionDate, 'd MMM yyyy', { locale: id })}`
                            : 'Belum ada transaksi'}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="default" className="bg-green-600">
                          {customer.totalTransactions}x
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(customer.totalAmount)}
                      </TableCell>
                    </TableRow>
                  ))}
                {customerActivity.activeCustomers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                      Belum ada pelanggan aktif
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Pelanggan Tidak Aktif */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UserX className="h-5 w-5 text-red-600" />
              Pelanggan Tidak Aktif
            </CardTitle>
            <CardDescription>Pelanggan yang sudah lama tidak transaksi (30+ hari) atau belum pernah transaksi</CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setInactiveCustomerPage(p => Math.max(0, p - 1))}
              disabled={inactiveCustomerPage === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground px-2">
              {inactiveCustomerPage + 1}/{Math.max(1, Math.ceil(customerActivity.inactiveCustomers.length / ITEMS_PER_PAGE))}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setInactiveCustomerPage(p => Math.min(Math.ceil(customerActivity.inactiveCustomers.length / ITEMS_PER_PAGE) - 1, p + 1))}
              disabled={inactiveCustomerPage >= Math.ceil(customerActivity.inactiveCustomers.length / ITEMS_PER_PAGE) - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-5">
            {customerActivity.inactiveCustomers
              .slice(inactiveCustomerPage * ITEMS_PER_PAGE, (inactiveCustomerPage + 1) * ITEMS_PER_PAGE)
              .map(customer => (
                <Card key={customer.id} className="p-3 border-orange-200 bg-orange-50/50">
                  <div className="font-medium text-sm truncate">{customer.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {customer.totalTransactions > 0 ? (
                      <>
                        <span className="text-red-600 font-medium">
                          {customer.daysSinceLastTransaction === Infinity
                            ? 'Tidak ada data'
                            : `${customer.daysSinceLastTransaction} hari lalu`}
                        </span>
                        <br />
                        <span>{customer.totalTransactions} transaksi</span>
                        <br />
                        <span>{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(customer.totalAmount)}</span>
                      </>
                    ) : (
                      <span className="text-orange-600 font-medium">Belum pernah transaksi</span>
                    )}
                  </div>
                </Card>
              ))}
            {customerActivity.inactiveCustomers.length === 0 && (
              <div className="col-span-5 text-center text-muted-foreground py-6">
                Tidak ada pelanggan tidak aktif
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}