"use client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PurchaseOrderTable } from "@/components/PurchaseOrderTable";

export default function PurchaseOrderPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Purchase Orders (PO)</CardTitle>
        <CardDescription>
          Daftar permintaan pembelian bahan baku dari tim. Admin dapat menyetujui atau menolak permintaan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PurchaseOrderTable />
      </CardContent>
    </Card>
  );
}