"use client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PurchaseOrderTable } from "@/components/PurchaseOrderTable";
import { CreatePurchaseOrderDialog } from "@/components/CreatePurchaseOrderDialog";

export default function PurchaseOrderPage() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>Purchase Orders (PO)</CardTitle>
          <CardDescription>
            Daftar permintaan pembelian bahan baku dari tim. Admin dapat menyetujui atau menolak permintaan.
          </CardDescription>
        </div>
        <CreatePurchaseOrderDialog />
      </CardHeader>
      <CardContent>
        <PurchaseOrderTable />
      </CardContent>
    </Card>
  );
}