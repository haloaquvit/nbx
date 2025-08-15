"use client"
import * as React from "react"
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table"
import { MoreHorizontal, PlusCircle } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Link } from "react-router-dom"
import { Quotation, QuotationStatus } from "@/types/quotation"
import { format } from "date-fns"
import { id } from "date-fns/locale/id"
import { useQuotations } from "@/hooks/useQuotations"
import { Skeleton } from "./ui/skeleton"
import { cn } from "@/lib/utils"

const getStatusVariant = (status: QuotationStatus) => {
  switch (status) {
    case 'Disetujui': return 'success';
    case 'Ditolak': return 'destructive';
    case 'Terkirim': return 'default';
    case 'Draft': return 'secondary';
    case 'Kadaluarsa': return 'outline';
    default: return 'outline';
  }
}

export function QuotationTable() {
  const navigate = useNavigate();
  const { quotations, isLoading } = useQuotations();

  const columns: ColumnDef<Quotation>[] = [
    { accessorKey: "id", header: "No. Penawaran" },
    { accessorKey: "customerName", header: "Pelanggan" },
    {
      accessorKey: "createdAt",
      header: "Tgl Dibuat",
      cell: ({ row }) => format(new Date(row.getValue("createdAt")), "d MMM yyyy", { locale: id }),
    },
    { accessorKey: "preparedBy", header: "Dibuat Oleh" },
    {
      accessorKey: "total",
      header: () => <div className="text-right">Total</div>,
      cell: ({ row }) => {
        const amount = parseFloat(row.getValue("total"))
        return <div className="text-right font-medium">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(amount)}</div>
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("status") as QuotationStatus;
        return <Badge variant={getStatusVariant(status)}>{status}</Badge>
      },
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-haspopup="true" size="icon" variant="ghost" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Aksi</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => navigate(`/quotations/${row.original.id}`)}>Lihat Detail</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  const table = useReactTable({
    data: quotations || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="w-full">
      <div className="flex items-center justify-between py-4">
        <Input placeholder="Cari berdasarkan nama pelanggan..." className="max-w-sm" />
        <Button asChild><Link to="/quotations/new"><PlusCircle className="mr-2 h-4 w-4" /> Buat Penawaran Baru</Link></Button>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>{table.getHeaderGroups().map(hg => <TableRow key={hg.id}>{hg.headers.map(h => <TableHead key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</TableHead>)}</TableRow>)}</TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={columns.length}><Skeleton className="h-8 w-full" /></TableCell></TableRow>)
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map(row => (
                <TableRow key={row.id} onClick={() => navigate(`/quotations/${row.original.id}`)} className="cursor-pointer hover:bg-muted">
                  {row.getVisibleCells().map(cell => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}
                </TableRow>
              ))
            ) : (
              <TableRow><TableCell colSpan={columns.length} className="h-24 text-center">Belum ada penawaran.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}