"use client"
import { useState, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, FileDown, Upload } from "lucide-react";
import { CustomerTable } from "@/components/CustomerTable";
import { AddCustomerDialog } from "@/components/AddCustomerDialog";
import { EditCustomerDialog } from "@/components/EditCustomerDialog";
import * as XLSX from "xlsx";
import { useCustomers } from "@/hooks/useCustomers";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Customer } from "@/types/customer";

export default function CustomerPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const { customers } = useCustomers();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleEditCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsEditDialogOpen(true);
  };

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
      <EditCustomerDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        customer={selectedCustomer}
      />
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".xlsx, .xls, .csv"
      />
      
      {/* Mobile-first responsive design */}
      <div className="w-full max-w-none p-4 lg:p-6">
        {/* Header - Mobile optimized */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold">Data Pelanggan</h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">
              Kelola semua data pelanggan Anda di sini
            </p>
          </div>
          
          {/* Quick Add Button - Always visible */}
          <div className="flex-shrink-0">
            <Button 
              onClick={() => setIsAddDialogOpen(true)}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              <span className="sm:inline">Tambah Pelanggan</span>
            </Button>
          </div>
        </div>

        {/* Action buttons - Mobile responsive */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
              <Button 
                variant="outline" 
                onClick={handleImportClick} 
                disabled={isImporting}
                className="flex-1 sm:flex-initial"
              >
                <Upload className="mr-2 h-4 w-4" />
                {isImporting ? 'Mengimpor...' : 'Impor Excel'}
              </Button>
              <Button 
                variant="outline" 
                onClick={handleExportExcel}
                className="flex-1 sm:flex-initial"
              >
                <FileDown className="mr-2 h-4 w-4" />
                Ekspor Excel
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Customer Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl">Daftar Pelanggan</CardTitle>
          </CardHeader>
          <CardContent className="p-0 sm:p-6">
            <CustomerTable onEditCustomer={handleEditCustomer} />
          </CardContent>
        </Card>

        {/* Floating Action Button for Mobile */}
        <Button
          onClick={() => setIsAddDialogOpen(true)}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-xl transition-all duration-200 sm:hidden"
          size="icon"
        >
          <PlusCircle className="h-6 w-6 text-white" />
        </Button>
      </div>
    </>
  );
}