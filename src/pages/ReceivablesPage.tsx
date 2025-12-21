"use client"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReceivablesTable } from "@/components/ReceivablesTable";
import { PaymentHistoryTable } from "@/components/PaymentHistoryTable";
import { CreditCard, History } from "lucide-react";

export default function ReceivablesPage() {
  return (
    <div className="w-full max-w-none p-4 lg:p-6">
      <div className="text-lg md:text-xl font-semibold mb-2">Manajemen Piutang</div>
      <div className="text-sm text-slate-600 mb-6">
        Kelola piutang pelanggan dan lihat history pembayaran
      </div>

      <Tabs defaultValue="receivables" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="receivables" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Daftar Piutang
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            History Pembayaran
          </TabsTrigger>
        </TabsList>

        <TabsContent value="receivables" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Daftar Piutang</CardTitle>
              <CardDescription>
                Daftar semua transaksi yang belum lunas. Klik 'Bayar' untuk mencatat pembayaran baru dari pelanggan.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReceivablesTable />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <PaymentHistoryTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}