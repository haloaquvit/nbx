"use client"
import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, FileDown, Upload } from "lucide-react";
import { CustomerTable } from "@/components/CustomerTable";
import { AddCustomerDialog } from "@/components/AddCustomerDialog";
import { EditCustomerDialog } from "@/components/EditCustomerDialog";
import { MobileCustomerView } from "@/components/MobileCustomerView";
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
  const [isMobile, setIsMobile] = useState(false);
  const { customers } = useCustomers();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if mobile view
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleEditCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsEditDialogOpen(true);
  };

  const handleExportExcel = () => {
    if (customers) {
      // Format data untuk export dengan kolom yang konsisten
      const exportData = customers.map(customer => {
        // Gabungkan latitude dan longitude jadi satu kolom koordinat
        const koordinat = (customer.latitude && customer.longitude)
          ? `${customer.latitude}, ${customer.longitude}`
          : '';

        return {
          "Nama": customer.name || '',
          "Telepon": customer.phone || '',
          "Alamat": customer.address || '',
          "Koordinat (Latitude, Longitude)": koordinat,
          "Jumlah Galon Titip": customer.jumlah_galon_titip || 0
        };
      });
      
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Pelanggan");
      XLSX.writeFile(workbook, "template-pelanggan.xlsx");
      
      toast({
        title: "Export Berhasil",
        description: "Template pelanggan berhasil diunduh. File ini bisa digunakan untuk import."
      });
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
        const json = XLSX.utils.sheet_to_json(worksheet) as any[];
        
        // Transform data ke format yang expected oleh database
        const transformedData = json.map((row: any) => {
          let latitude = null;
          let longitude = null;

          // Coba parse dari kolom "Koordinat" gabungan (format: "lat, lng")
          const koordinatGabungan = row['Koordinat (Latitude, Longitude)'] || row['Koordinat'] || '';
          if (koordinatGabungan && typeof koordinatGabungan === 'string') {
            const parts = koordinatGabungan.split(',').map((s: string) => s.trim());
            if (parts.length === 2) {
              latitude = parseFloat(parts[0]) || null;
              longitude = parseFloat(parts[1]) || null;
            }
          }

          // Fallback: coba dari kolom terpisah (backward compatibility)
          if (!latitude || !longitude) {
            latitude = parseFloat(row['Latitude'] || row['latitude'] || '0') || null;
            longitude = parseFloat(row['Longitude'] || row['longitude'] || '0') || null;
          }

          return {
            name: row['Nama'] || row['name'] || '',
            phone: row['Telepon'] || row['phone'] || '',
            address: row['Alamat'] || row['address'] || '',
            latitude,
            longitude,
            jumlah_galon_titip: parseInt(row['Jumlah Galon Titip'] || row['jumlah_galon_titip'] || '0') || 0
          };
        }).filter(customer => customer.name.trim() !== ''); // Filter out empty names
        
        if (transformedData.length === 0) {
          throw new Error('Tidak ada data pelanggan yang valid ditemukan dalam file');
        }

        // Get existing customer names to avoid duplicates
        const { data: existingCustomers, error: fetchError } = await supabase
          .from('customers')
          .select('name')
          .in('name', transformedData.map(c => c.name));

        if (fetchError) throw fetchError;

        const existingNames = new Set(existingCustomers?.map(c => c.name) || []);
        
        // Filter out customers that already exist
        const newCustomers = transformedData.filter(customer => !existingNames.has(customer.name));
        const skippedCount = transformedData.length - newCustomers.length;

        if (newCustomers.length === 0) {
          toast({
            title: "Import Selesai!",
            description: `Semua ${transformedData.length} pelanggan sudah ada dalam database (tidak ada yang ditambahkan).`,
          });
          return;
        }

        // Insert only new customers
        const { error } = await supabase
          .from('customers')
          .insert(newCustomers);

        if (error) throw error;

        toast({
          title: "Import Berhasil!",
          description: `${newCustomers.length} pelanggan baru berhasil ditambahkan${skippedCount > 0 ? `, ${skippedCount} pelanggan dilewati (sudah ada)` : ''}.`,
        });
        queryClient.invalidateQueries({ queryKey: ['customers'] });
      } catch (error: any) {
        toast({
          variant: "destructive",
          title: "Gagal Impor!",
          description: `Terjadi kesalahan: ${error.message || 'Format file tidak sesuai'}. Pastikan kolom Excel sesuai template: 'Nama', 'Telepon', 'Alamat', dll.`,
        });
      } finally {
        setIsImporting(false);
        // Reset file input
        if(fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Show mobile view for small screens
  if (isMobile) {
    return (
      <>
        <AddCustomerDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} />
        <EditCustomerDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          customer={selectedCustomer}
        />
        <MobileCustomerView 
          onEditCustomer={handleEditCustomer}
          onAddCustomer={() => setIsAddDialogOpen(true)}
        />
      </>
    )
  }

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
      
      {/* Desktop view */}
      <div className="w-full max-w-none p-4 lg:p-6">
        {/* Header - Desktop optimized */}
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
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 btn-glossy"
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              <span className="sm:inline">Tambah Pelanggan</span>
            </Button>
          </div>
        </div>

        {/* Action buttons - Desktop responsive */}
        <Card className="mb-6 card-hover">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
              <Button 
                variant="outline" 
                onClick={handleImportClick} 
                disabled={isImporting}
                className="flex-1 sm:flex-initial hover-glow"
              >
                <Upload className="mr-2 h-4 w-4" />
                {isImporting ? 'Mengimpor...' : 'Impor Excel'}
              </Button>
              <Button 
                variant="outline" 
                onClick={handleExportExcel}
                className="flex-1 sm:flex-initial hover-glow"
              >
                <FileDown className="mr-2 h-4 w-4" />
                Ekspor Excel
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Customer Table */}
        <Card className="card-hover">
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl">Daftar Pelanggan</CardTitle>
          </CardHeader>
          <CardContent className="p-0 sm:p-6">
            <CustomerTable onEditCustomer={handleEditCustomer} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}