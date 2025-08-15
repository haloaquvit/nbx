"use client"
import { QuotationForm } from "@/components/QuotationForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewQuotationPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Buat Penawaran Harga Baru</CardTitle>
        <CardDescription>
          Isi detail penawaran untuk pelanggan. Penawaran ini dapat dikonversi menjadi transaksi nanti.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <QuotationForm />
      </CardContent>
    </Card>
  );
}