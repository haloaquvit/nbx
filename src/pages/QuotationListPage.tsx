"use client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QuotationTable } from "@/components/QuotationTable";

export default function QuotationListPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Surat Penawaran Harga</CardTitle>
        <CardDescription>
          Kelola semua penawaran yang dibuat untuk pelanggan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <QuotationTable />
      </CardContent>
    </Card>
  );
}