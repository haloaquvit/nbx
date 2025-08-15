"use client"
import * as React from "react"
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table"
import { Badge, badgeVariants } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { useToast } from "./ui/use-toast"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { id } from "date-fns/locale/id"
import { PurchaseOrder, PurchaseOrderStatus } from "@/types/purchaseOrder"
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders"
import { useAuth } from "@/hooks/useAuth"
import { Skeleton } from "./ui/skeleton"
import { PayPoDialog } from "./PayPoDialog"
import { Trash2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

const statusOptions: PurchaseOrderStatus[] = ['Pending', 'Approved', 'Rejected', 'Dibayar', 'Selesai'];

const getStatusVariant = (status: PurchaseOrderStatus) => {
  switch (status) {
    case 'Approved': return 'success';
    case 'Rejected': return 'destructive';
    case 'Pending': return 'secondary';
    case 'Dibayar': return 'info';
    case 'Selesai': return 'outline';
    default: return 'outline';
  }
}

export function PurchaseOrderTable() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { purchaseOrders, isLoading, updatePoStatus, payPurchaseOrder, receivePurchaseOrder, deletePurchaseOrder } = usePurchaseOrders();
  const [isPayDialogOpen, setIsPayDialogOpen] = React.useState(false);
  const [selectedPo, setSelectedPo] = React.useState<PurchaseOrder | null>(null);

  const handleStatusChange = (po: PurchaseOrder, newStatus: PurchaseOrderStatus) => {
    if (newStatus === 'Dibayar' && po.status === 'Approved') {
      setSelectedPo(po);
      setIsPayDialogOpen(true);
    } else {
      updatePoStatus.mutate({ poId: po.id, status: newStatus }, {
        onSuccess: () => toast({ title: "Status PO Diperbarui" }),
        onError: (error) => toast({ variant: "destructive", title: "Gagal", description: error.message }),
      });
    }
  };

  const handleReceiveGoods = (po: PurchaseOrder) => {
    receivePurchaseOrder.mutate(po, {
      onSuccess: () => toast({ title: "Sukses", description: "Stok berhasil diterima dan ditambahkan." }),
      onError: (error) => toast({ variant: "destructive", title: "Gagal", description: error.message }),
    });
  };

  const handleDeletePo = (poId: string) => {
    deletePurchaseOrder.mutate(poId, {
      onSuccess: () => toast({ title: "Sukses", description: "Purchase Order berhasil dihapus." }),
      onError: (error) => toast({ variant: "destructive", title: "Gagal", description: error.message }),
    });
  };

  const columns: ColumnDef<PurchaseOrder>[] = [
    { accessorKey: "id", header: "No. PO" },
    { accessorKey: "materialName", header: "Nama Bahan" },
    { accessorKey: "quantity", header: "Jumlah", cell: ({ row }) => `${row.original.quantity} ${row.original.unit}` },
    { accessorKey: "requestedBy", header: "Pemohon" },
    { accessorKey: "createdAt", header: "Tgl Request", cell: ({ row }) => format(new Date(row.getValue("createdAt")), "d MMM yyyy", { locale: id }) },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const po = row.original;
        const isAdmin = user?.role === 'admin' || user?.role === 'owner';
        
        if (isAdmin && po.status !== 'Selesai' && po.status !== 'Rejected') {
          return (
            <Select
              value={po.status}
              onValueChange={(value: PurchaseOrderStatus) => handleStatusChange(po, value)}
              disabled={updatePoStatus.isPending}
            >
              <SelectTrigger className={cn("w-[150px] border-0 focus:ring-0 focus:ring-offset-0", badgeVariants({ variant: getStatusVariant(po.status) }))}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map(status => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }
        return <Badge variant={getStatusVariant(po.status)}>{po.status}</Badge>
      },
    },
    {
      id: "actions",
      header: "Aksi",
      cell: ({ row }) => {
        const po = row.original;
        const isOwner = user?.role === 'owner';
        return (
          <div className="flex items-center gap-1">
            {po.status === 'Dibayar' && (
              <Button size="sm" onClick={() => handleReceiveGoods(po)} disabled={receivePurchaseOrder.isPending}>Terima Barang</Button>
            )}
            {isOwner && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" title="Hapus PO">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Anda yakin?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tindakan ini akan menghapus Purchase Order #{po.id} secara permanen.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Batal</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleDeletePo(po.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={deletePurchaseOrder.isPending}
                    >
                      Ya, Hapus
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        );
      }
    }
  ]

  const table = useReactTable({
    data: purchaseOrders || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <>
      <PayPoDialog open={isPayDialogOpen} onOpenChange={setIsPayDialogOpen} purchaseOrder={selectedPo} />
      <div className="rounded-md border">
        <Table>
          <TableHeader>{table.getHeaderGroups().map(hg => <TableRow key={hg.id}>{hg.headers.map(h => <TableHead key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</TableHead>)}</TableRow>)}</TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <TableRow key={i}><TableCell colSpan={columns.length}><Skeleton className="h-8 w-full" /></TableCell></TableRow>)
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map(row => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map(cell => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}
                </TableRow>
              ))
            ) : (
              <TableRow><TableCell colSpan={columns.length} className="h-24 text-center">Belum ada permintaan PO.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}