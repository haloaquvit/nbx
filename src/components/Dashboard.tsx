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
import { Material } from "@/types/material"
import { format, subDays, startOfDay, endOfDay, startOfMonth, isWithinInterval, eachDayOfInterval } from "date-fns"
import { id } from "date-fns/locale/id"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Users, AlertTriangle, DollarSign, TrendingDown, Scale, Award, ShoppingCart, TrendingUp } from "lucide-react"

export function Dashboard() {
  const { user } = useAuthContext()
  const { transactions, isLoading: transactionsLoading } = useTransactions()
  const { expenses, isLoading: expensesLoading } = useExpenses()
  const { customers, isLoading: customersLoading } = useCustomers()
  const { materials, isLoading: materialsLoading } = useMaterials()

  // Helper function to calculate production cost based on BOM and material prices
  const calculateProductionCost = (product: any, quantity: number, materials: Material[] | undefined): number => {
    if (!materials || !product.materials || product.materials.length === 0) {
      // Fallback to basePrice if no materials data
      return product.basePrice * quantity;
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

  const today = new Date()
  const [chartDateRange, setChartDateRange] = useState<DateRange | undefined>({
    from: subDays(today, 6),
    to: today,
  });

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
        
        // Debug logging for first few items
        if (Object.keys(acc).length < 3) {
          console.log(`Product: ${productName}`);
          console.log(`Quantity: ${item.quantity}, Price: ${item.price}`);
          console.log(`Revenue: ${itemTotal}, Cost: ${itemCost}, Profit: ${itemProfit}`);
          console.log(`Product materials:`, item.product.materials);
          console.log('---');
        }
        
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
    
    // Debug logging
    console.log('Product Stats Array:', productStatsArray);
    
    // Top selling product (by quantity) - create copy to avoid mutating original
    const topSellingProduct = productStatsArray.length > 0 
      ? [...productStatsArray].sort((a, b) => b.totalQuantity - a.totalQuantity)[0]
      : null;
    
    // Most profitable product (by profit amount) - create copy to avoid mutating original
    const mostProfitableProduct = productStatsArray.length > 0 
      ? [...productStatsArray].sort((a, b) => b.totalProfit - a.totalProfit)[0]
      : null;
    
    console.log('Top Selling Product:', topSellingProduct);
    console.log('Most Profitable Product:', mostProfitableProduct);

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

  const recentTransactions = transactions?.slice(0, 5) || []
  const isLoading = transactionsLoading || customersLoading || materialsLoading || expensesLoading

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
        <Card className="col-span-3">
          <CardHeader><CardTitle>Transaksi Terbaru</CardTitle><CardDescription>5 transaksi terakhir yang tercatat.</CardDescription></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Pelanggan</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
              <TableBody>
                {recentTransactions.map(t => (
                  <TableRow key={t.id} component={Link} to={`/transactions/${t.id}`} className="cursor-pointer hover:bg-muted/50">
                    <TableCell>
                      <div className="font-medium">{t.customerName}</div>
                      <div className="hidden text-sm text-muted-foreground md:inline">{t.id}</div>
                    </TableCell>
                    <TableCell><Badge variant={t.paymentStatus === 'Lunas' ? 'default' : 'destructive'}>{t.paymentStatus}</Badge></TableCell>
                    <TableCell className="text-right">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(t.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}