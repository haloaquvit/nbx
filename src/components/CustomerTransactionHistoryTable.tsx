"use client"
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Transaction } from "@/types/transaction"
import { Badge } from "./ui/badge"
import { format } from "date-fns"
import { id } from "date-fns/locale/id"
import { Skeleton } from "./ui/skeleton"

const columns: ColumnDef<Transaction>[] = [
  { accessorKey: "id", header: "No. Order" },
  { 
    accessorKey: "orderDate", 
    header: "Tanggal",
    cell: ({ row }) => {
      const dateValue = row.getValue("orderDate");
      if (!dateValue) return "N/A";
      const date = new Date(dateValue as string | number | Date);
      return format(date, "d MMM yyyy", { locale: id });
    }
  },
  { 
    accessorKey: "total", 
    header: "Total",
    cell: ({ row }) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(row.getValue("total"))
  },
  { 
    accessorKey: "status", 
    header: "Status",
    cell: ({ row }) => <Badge>{row.getValue("status")}</Badge>
  },
];

interface CustomerTransactionHistoryTableProps {
  transactions: Transaction[];
  isLoading: boolean;
}

export function CustomerTransactionHistoryTable({ transactions, isLoading }: CustomerTransactionHistoryTableProps) {
  const table = useReactTable({
    data: transactions,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={columns.length}><Skeleton className="h-6 w-full" /></TableCell>
              </TableRow>
            ))
          ) : table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                Pelanggan ini belum memiliki riwayat transaksi.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}