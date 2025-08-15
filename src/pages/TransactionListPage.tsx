"use client"
import { TransactionTable } from "@/components/TransactionTable";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function TransactionListPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Data Transaksi</CardTitle>
        <CardDescription>
          Lihat dan kelola semua transaksi yang pernah dibuat.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TransactionTable />
      </CardContent>
    </Card>
  );
}