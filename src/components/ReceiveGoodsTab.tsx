import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ReceivePODialog } from "./ReceivePODialog"
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders"
import { PurchaseOrder } from "@/types/purchaseOrder"
import { format } from "date-fns"
import { id } from "date-fns/locale"
import { Search, Package } from "lucide-react"

export function ReceiveGoodsTab() {
  const { purchaseOrders, isLoading } = usePurchaseOrders()
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null)
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")

  // Filter POs that are approved and ready to be received
  const approvedPOs = purchaseOrders?.filter(po => po.status === 'Approved') || []
  
  // Filter by search term
  const filteredPOs = approvedPOs.filter(po => 
    po.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    po.materialName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    po.supplierName?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleReceiveGoods = (po: PurchaseOrder) => {
    setSelectedPO(po)
    setReceiveDialogOpen(true)
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <div className="text-muted-foreground">Memuat data...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Penerimaan Barang
          </CardTitle>
          <CardDescription>
            Kelola penerimaan barang untuk Purchase Order yang sudah disetujui
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari berdasarkan ID PO, nama material, atau supplier..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* PO Table */}
          {filteredPOs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {approvedPOs.length === 0 
                ? "Tidak ada PO yang siap diterima saat ini" 
                : "Tidak ditemukan PO yang sesuai dengan pencarian"
              }
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID PO</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Tanggal Dibuat</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPOs.map((po) => (
                    <TableRow key={po.id}>
                      <TableCell className="font-medium">{po.id}</TableCell>
                      <TableCell>{po.materialName}</TableCell>
                      <TableCell>{po.quantity} {po.unit}</TableCell>
                      <TableCell>{po.supplierName || '-'}</TableCell>
                      <TableCell>
                        {format(po.createdAt, "dd MMM yyyy", { locale: id })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {po.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          onClick={() => handleReceiveGoods(po)}
                          className="w-full sm:w-auto"
                        >
                          Terima Barang
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Receive PO Dialog */}
      <ReceivePODialog
        open={receiveDialogOpen}
        onOpenChange={setReceiveDialogOpen}
        purchaseOrder={selectedPO}
      />
    </div>
  )
}