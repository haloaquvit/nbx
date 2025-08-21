import React, { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { 
  Truck, 
  Plus, 
  Calendar,
  Eye,
  Edit,
  Trash2,
  Package,
  Clock,
  MapPin,
  CheckCircle,
  ArrowLeft,
  AlertTriangle,
  Download,
  FileText
} from "lucide-react";
import { useRetasi } from "@/hooks/useRetasi";
import { useDrivers } from "@/hooks/useDrivers";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { id } from "date-fns/locale/id";
import { ReturnRetasiDialog } from "@/components/ReturnRetasiDialog";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function RetasiPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState(todayStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [driverFilter, setDriverFilter] = useState("all");
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [selectedRetasi, setSelectedRetasi] = useState<any>(null);

  const filters = {
    is_returned: statusFilter === "active" ? false : statusFilter === "returned" ? true : undefined,
    driver_name: driverFilter && driverFilter !== "all" ? driverFilter : undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  };

  const { retasiList, stats, isLoading, markRetasiReturned } = useRetasi(filters);
  const { drivers } = useDrivers();

  const filteredRetasi = retasiList || [];

  // Calculate totals like in the example
  const totals = useMemo(() => {
    const bawa = filteredRetasi.reduce((sum, r) => sum + (r.total_items || 0), 0);
    const kembali = filteredRetasi.reduce((sum, r) => sum + (r.returned_items_count || 0), 0);
    const error = filteredRetasi.reduce((sum, r) => sum + (r.error_items_count || 0), 0);
    const selisih = bawa - kembali - error;
    
    return { bawa, kembali, error, selisih };
  }, [filteredRetasi]);

  const handleReturnRetasi = (retasi: any) => {
    setSelectedRetasi(retasi);
    setReturnDialogOpen(true);
  };

  const handleConfirmReturn = async (returnData: any) => {
    if (!selectedRetasi) return;

    try {
      await markRetasiReturned.mutateAsync({
        retasiId: selectedRetasi.id,
        ...returnData,
      });
      
      toast.success('Retasi berhasil dikembalikan');
      setReturnDialogOpen(false);
      setSelectedRetasi(null);
    } catch (error: any) {
      toast.error(error.message || 'Gagal mengembalikan retasi');
    }
  };

  const exportExcel = () => {
    const data = filteredRetasi.map((r) => ({
      "Tgl Berangkat": format(r.departure_date, 'dd/MM/yyyy', { locale: id }),
      "Tgl Kembali": r.is_returned ? format(r.updated_at, 'dd/MM/yyyy HH:mm', { locale: id }) : "-",
      "Retasi Ke": r.retasi_ke,
      "Status": r.is_returned ? "KEMBALI" : "BERANGKAT",
      "Supir": r.driver_name || "-",
      "Bawa": r.total_items,
      "Kembali": r.returned_items_count || 0,
      "Error": r.error_items_count || 0,
      "Selisih": (r.total_items || 0) - (r.returned_items_count || 0) - (r.error_items_count || 0),
      "Catatan": r.return_notes || r.notes || "-",
    }));

    // Add total row
    data.push({
      "Tgl Berangkat": "TOTAL",
      "Tgl Kembali": "",
      "Retasi Ke": "",
      "Status": "",
      "Supir": "",
      "Bawa": totals.bawa,
      "Kembali": totals.kembali,
      "Error": totals.error,
      "Selisih": totals.selisih,
      "Catatan": "",
    } as any);

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Retasi");
    XLSX.writeFile(wb, `retasi-${dateFrom}-${dateTo}.xlsx`);
    
    toast.success('File Excel berhasil diunduh');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Manajemen Retasi</h1>
          <p className="text-muted-foreground">
            Alur Status: Armada Berangkat → Armada Kembali
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportExcel}>
            <Download className="h-4 w-4 mr-2" />
            Export Excel
          </Button>
          <AddRetasiDialog 
            drivers={drivers} 
            onSaved={() => window.location.reload()}
          />
        </div>
      </div>


      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bawa</CardTitle>
            <Package className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{totals.bawa}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Kembali</CardTitle>
            <CheckCircle className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-600">{totals.kembali}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Error</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{totals.error}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Selisih</CardTitle>
            <FileText className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-600">{totals.selisih}</div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Filter</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Tanggal Dari</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Tanggal Sampai</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Supir</Label>
                <Select value={driverFilter} onValueChange={setDriverFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Semua Supir" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Supir</SelectItem>
                    {drivers.map((driver) => (
                      <SelectItem key={driver.id} value={driver.name}>
                        {driver.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Semua status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Status</SelectItem>
                    <SelectItem value="active">Armada Berangkat</SelectItem>
                    <SelectItem value="returned">Armada Kembali</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Retasi Table */}
        <Card>
          <CardHeader>
            <CardTitle>Daftar Retasi</CardTitle>
            <CardDescription>
              Daftar semua retasi yang telah dibuat
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tgl Berangkat</TableHead>
                  <TableHead>Tgl Kembali</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Retasi Ke</TableHead>
                  <TableHead>Supir</TableHead>
                  <TableHead>Bawa</TableHead>
                  <TableHead>Kembali</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Laku</TableHead>
                  <TableHead>Selisih</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={11}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : filteredRetasi.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground">
                      Tidak ada data
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRetasi.map((retasi) => (
                    <TableRow key={retasi.id} className="hover:bg-slate-50/80">
                      <TableCell>
                        {format(retasi.departure_date, 'dd/MM/yyyy', { locale: id })}
                        {retasi.departure_time && (
                          <div className="text-xs text-muted-foreground">
                            {retasi.departure_time}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {retasi.is_returned ? 
                          format(retasi.updated_at, 'dd/MM/yyyy HH:mm', { locale: id }) : 
                          '-'
                        }
                      </TableCell>
                      <TableCell>
                        {retasi.is_returned ? (
                          <Badge variant="default" className="bg-emerald-100 text-emerald-700">
                            Armada Kembali
                          </Badge>
                        ) : (
                          <Badge variant="default" className="bg-amber-100 text-amber-700">
                            Armada Berangkat
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">Retasi {retasi.retasi_ke}</span>
                      </TableCell>
                      <TableCell>{retasi.driver_name || '-'}</TableCell>
                      <TableCell>{retasi.total_items}</TableCell>
                      <TableCell>{retasi.returned_items_count || 0}</TableCell>
                      <TableCell>{retasi.error_items_count || 0}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-green-50 text-green-700">
                          {retasi.barang_laku || 0}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={`font-medium ${
                          ((retasi.returned_items_count || 0) - (retasi.error_items_count || 0) - (retasi.barang_laku || 0)) >= 0 
                            ? 'text-blue-600' 
                            : 'text-red-600'
                        }`}>
                          {(retasi.returned_items_count || 0) - (retasi.error_items_count || 0) - (retasi.barang_laku || 0)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {!retasi.is_returned ? (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleReturnRetasi(retasi)}
                              className="text-green-600 hover:text-green-700"
                              title="Tandai Kembali"
                            >
                              <ArrowLeft className="h-4 w-4" />
                            </Button>
                          ) : null}
                          <Button variant="outline" size="sm" title="Lihat Detail">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Return Retasi Dialog */}
      <ReturnRetasiDialog
        isOpen={returnDialogOpen}
        onClose={() => {
          setReturnDialogOpen(false);
          setSelectedRetasi(null);
        }}
        onConfirm={handleConfirmReturn}
        retasiNumber={selectedRetasi?.retasi_number || ''}
        totalItems={selectedRetasi?.total_items || 0}
        isLoading={markRetasiReturned.isPending}
      />
    </div>
  );
}

function AddRetasiDialog({
  drivers,
  onSaved = () => {},
}: {
  drivers: { id: string; name: string }[]
  onSaved?: () => void
}) {
  const [open, setOpen] = useState(false);
  const [driverId, setDriverId] = useState(drivers[0]?.id || "");
  const [bawa, setBawa] = useState(0);
  const [notes, setNotes] = useState("");

  const { createRetasi, checkDriverAvailability } = useRetasi();
  const [nextSeq, setNextSeq] = useState<number>(1);
  const [blocked, setBlocked] = useState<boolean>(false);

  const recomputeMeta = async (driverId: string) => {
    if (!driverId) return;
    
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) return;

    try {
      const isBlocked = !(await checkDriverAvailability(driver.name));
      setBlocked(isBlocked);
      
      // Get actual next retasi_ke from backend
      const todayDate = new Date().toISOString().slice(0, 10);
      const { data: todayRetasi } = await supabase
        .from('retasi')
        .select('retasi_ke')
        .eq('driver_name', driver.name)
        .eq('departure_date', todayDate);
      
      const nextRetasiKe = (todayRetasi?.length || 0) + 1;
      setNextSeq(nextRetasiKe);
      
      console.log('[RetasiPage] Today retasi for', driver.name, ':', todayRetasi);
      console.log('[RetasiPage] Next retasi_ke will be:', nextRetasiKe);
    } catch (error) {
      console.error('Error checking driver availability:', error);
      setNextSeq(1); // Fallback
    }
  };

  React.useEffect(() => {
    if (open && driverId) {
      recomputeMeta(driverId);
    }
  }, [open, driverId]);

  const nowText = new Date().toLocaleString("id-ID");

  const save = async () => {
    if (blocked) {
      toast.error("Tidak bisa membuat Retasi baru: retasi sebelumnya masih berstatus Armada Berangkat.");
      return;
    }
    
    if (!driverId) {
      toast.error("Pilih supir");
      return;
    }

    const driver = drivers.find(d => d.id === driverId);
    if (!driver) {
      toast.error("Supir tidak ditemukan");
      return;
    }

    const safeBawa = Number(bawa) || 0;
    if (safeBawa <= 0) {
      toast.error("Jumlah bawa harus lebih dari 0");
      return;
    }

    try {
      await createRetasi.mutateAsync({
        driver_name: driver.name,
        departure_date: new Date(),
        total_items: safeBawa,
        notes: notes || undefined,
      });

      setOpen(false);
      setBawa(0);
      setNotes("");
      onSaved();
      toast.success(`Retasi Berangkat disimpan`);
    } catch (error: any) {
      toast.error(error?.message || "Gagal menyimpan retasi");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-4 w-4 mr-2" />
          Input Retasi (Berangkat)
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Retasi Berangkat</DialogTitle>
          <DialogDescription>
            Input data retasi armada berangkat dengan perhitungan otomatis counter berdasarkan supir per hari
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div>
            <Label className="text-xs text-slate-600">Waktu Berangkat</Label>
            <Input value={nowText} readOnly />
          </div>
          
          <div>
            <Label className="text-xs text-slate-600">Supir</Label>
            <Select value={driverId} onValueChange={setDriverId}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih Supir" />
              </SelectTrigger>
              <SelectContent>
                {drivers.map((driver) => (
                  <SelectItem key={driver.id} value={driver.id}>
                    {driver.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-slate-600">Retasi Hari Ini (akan menjadi)</Label>
            <Input value={`Retasi ${nextSeq}`} readOnly />
          </div>

          <div>
            <Label className="text-xs text-slate-600">Bawa</Label>
            <Input 
              type="number" 
              value={bawa || ""} 
              onChange={(e) => setBawa(Number(e.target.value) || 0)} 
              placeholder="Jumlah barang yang dibawa"
            />
          </div>

          <div>
            <Label className="text-xs text-slate-600">Catatan</Label>
            <Input 
              placeholder="Opsional" 
              value={notes} 
              onChange={(e) => setNotes(e.target.value)} 
            />
          </div>

          {blocked && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              Retasi sebelumnya masih berstatus Armada Berangkat. Selesaikan (Armada Kembali) sebelum membuat Retasi
              berikutnya.
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button 
              onClick={save} 
              disabled={blocked || createRetasi.isPending}
            >
              {createRetasi.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}