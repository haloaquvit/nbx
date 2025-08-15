"use client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useTransactions } from "@/hooks/useTransactions"
import { useMaterials } from "@/hooks/useMaterials"
import { format, startOfMonth } from "date-fns"
import { id } from "date-fns/locale/id"
import { Material } from "@/types/material"

export function ProductAnalyticsDebug() {
  const { transactions } = useTransactions()
  const { materials } = useMaterials()

  const today = new Date()
  const startOfThisMonth = startOfMonth(today)
  const thisMonthTransactions = transactions?.filter(t => new Date(t.orderDate) >= startOfThisMonth) || []

  // Helper function to calculate production cost
  const calculateProductionCost = (product: any, quantity: number, materials: Material[] | undefined): number => {
    if (!materials || !product.materials || product.materials.length === 0) {
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

  // Create detailed analysis
  const detailedAnalysis = thisMonthTransactions.flatMap(transaction => 
    transaction.items.map(item => {
      const itemTotal = item.quantity * item.price;
      const itemCost = calculateProductionCost(item.product, item.quantity, materials);
      const itemProfit = itemTotal - itemCost;

      return {
        transactionId: transaction.id,
        customerName: transaction.customerName,
        productName: item.product.name,
        quantity: item.quantity,
        price: item.price,
        revenue: itemTotal,
        cost: itemCost,
        profit: itemProfit,
        profitMargin: itemTotal > 0 ? (itemProfit / itemTotal * 100) : 0,
        orderDate: transaction.orderDate,
        hasMaterials: item.product.materials && item.product.materials.length > 0
      };
    })
  );

  const sortedByProfit = [...detailedAnalysis].sort((a, b) => b.profit - a.profit);
  const sortedByRevenue = [...detailedAnalysis].sort((a, b) => b.revenue - a.revenue);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Debug: Analisis Produk Detail (Bulan Ini)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground mb-4">
            Total transaksi bulan ini: {thisMonthTransactions.length} | 
            Total item: {detailedAnalysis.length}
          </div>
          
          <div className="max-h-[400px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transaksi</TableHead>
                  <TableHead>Produk</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Harga</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-right">Margin %</TableHead>
                  <TableHead>BOM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedByProfit.slice(0, 20).map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-mono text-xs">{item.transactionId}</TableCell>
                    <TableCell>{item.productName}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">
                      {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(item.price)}
                    </TableCell>
                    <TableCell className="text-right">
                      {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(item.revenue)}
                    </TableCell>
                    <TableCell className="text-right">
                      {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(item.cost)}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(item.profit)}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.profitMargin.toFixed(1)}%
                    </TableCell>
                    <TableCell>
                      {item.hasMaterials ? '✅' : '❌'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}