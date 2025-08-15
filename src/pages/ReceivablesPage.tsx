"use client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReceivablesTable } from "@/components/ReceivablesTable";

export default function ReceivablesPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Manajemen Piutang</CardTitle>
        <CardDescription>
          Daftar semua transaksi yang belum lunas. Klik 'Bayar' untuk mencatat pembayaran baru dari pelanggan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ReceivablesTable />
      </CardContent>
    </Card>
  );
}