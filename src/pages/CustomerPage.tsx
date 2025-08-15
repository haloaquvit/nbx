"use client"
import { useState, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, FileDown, Upload } from "lucide-react";
import { CustomerTable } from "@/components/CustomerTable";
import { AddCustomerDialog } from "@/components/AddCustomerDialog";
import * as XLSX from "xlsx";
import { useCustomers } from "@/hooks/useCustomers";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export default function CustomerPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const { customers } = useCustomers();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportExcel = () => {
    if (customers) {
      const worksheet = XLSX.utils.json_to_sheet(customers);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Pelanggan");
      XLSX.writeFile(workbook, "data-pelanggan.xlsx");
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);

        const { error } = await supabase.functions.invoke('bulk-upsert-customers', {
          body: json,
        });

        if (error) throw error;

        toast({
          title: "Sukses!",
          description: "Data pelanggan berhasil diimpor.",
        });
        queryClient.invalidateQueries({ queryKey: ['customers'] });
      } catch (error: any) {
        toast({
          variant: "destructive",
          title: "Gagal Impor!",
          description: `Terjadi kesalahan: ${error.message}. Pastikan kolom Excel adalah 'Nama', 'Telepon', 'Alamat'.`,
        });
      } finally {
        setIsImporting(false);
        // Reset file input
        if(fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <>
      <AddCustomerDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} />
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".xlsx, .xls, .csv"
      />
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Data Pelanggan</CardTitle>
              <CardDescription>
                Kelola semua data pelanggan Anda di sini.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleImportClick} disabled={isImporting}>
                <Upload className="mr-2 h-4 w-4" /> {isImporting ? 'Mengimpor...' : 'Impor dari Excel'}
              </Button>
              <Button variant="outline" onClick={handleExportExcel}>
                <FileDown className="mr-2 h-4 w-4" /> Ekspor Excel
              </Button>
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <PlusCircle className="mr-2 h-4 w-4" /> Tambah Pelanggan
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <CustomerTable />
        </CardContent>
      </Card>
    </>
  );
}