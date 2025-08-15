"use client"
import * as React from "react"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { TrendingUp, TrendingDown, Wallet } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface AccountBalance {
  accountId: string;
  accountName: string;
  currentBalance: number;
  previousBalance: number;
  todayIncome: number;
  todayExpense: number;
  todayNet: number;
  todayChange: number;
}

interface AccountBalanceTableProps {
  data: AccountBalance[];
  isLoading: boolean;
}

export function AccountBalanceTable({ data, isLoading }: AccountBalanceTableProps) {
  const columns: ColumnDef<AccountBalance>[] = [
    {
      accessorKey: "accountName",
      header: "Nama Akun",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{row.getValue("accountName")}</span>
        </div>
      ),
    },
    {
      accessorKey: "previousBalance",
      header: "Saldo Sebelumnya",
      cell: ({ row }) => {
        const amount = row.getValue("previousBalance") as number;
        return (
          <div className="text-right font-medium text-gray-600">
            {new Intl.NumberFormat("id-ID", {
              style: "currency",
              currency: "IDR",
              minimumFractionDigits: 0,
            }).format(amount)}
          </div>
        );
      },
    },
    {
      accessorKey: "todayIncome",
      header: "Masuk Hari Ini",
      cell: ({ row }) => {
        const amount = row.getValue("todayIncome") as number;
        return amount > 0 ? (
          <div className="text-right font-medium text-green-600">
            {new Intl.NumberFormat("id-ID", {
              style: "currency",
              currency: "IDR",
              minimumFractionDigits: 0,
            }).format(amount)}
          </div>
        ) : (
          <div className="text-right text-muted-foreground">-</div>
        );
      },
    },
    {
      accessorKey: "todayExpense",
      header: "Keluar Hari Ini",
      cell: ({ row }) => {
        const amount = row.getValue("todayExpense") as number;
        return amount > 0 ? (
          <div className="text-right font-medium text-red-600">
            {new Intl.NumberFormat("id-ID", {
              style: "currency",
              currency: "IDR",
              minimumFractionDigits: 0,
            }).format(amount)}
          </div>
        ) : (
          <div className="text-right text-muted-foreground">-</div>
        );
      },
    },
    {
      accessorKey: "todayNet",
      header: "Arus Kas Hari Ini",
      cell: ({ row }) => {
        const amount = row.getValue("todayNet") as number;
        const isPositive = amount >= 0;
        return (
          <div className="text-right flex items-center justify-end gap-1">
            {isPositive ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
            <span className={`font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: "IDR",
                minimumFractionDigits: 0,
              }).format(Math.abs(amount))}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "currentBalance",
      header: "Saldo Saat Ini",
      cell: ({ row }) => {
        const amount = row.getValue("currentBalance") as number;
        const isPositive = amount >= 0;
        return (
          <div className="text-right">
            <Badge variant={isPositive ? "default" : "destructive"} className="text-sm font-bold">
              {new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: "IDR",
                minimumFractionDigits: 0,
              }).format(amount)}
            </Badge>
          </div>
        );
      },
    },
  ]

  const table = useReactTable({
    data: data || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Saldo Per Akun Keuangan</CardTitle>
          <CardDescription>Memuat data saldo akun...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Saldo Per Akun Keuangan</CardTitle>
        <CardDescription>
          Detail saldo masing-masing akun dengan perbandingan saldo sebelumnya dan aktivitas hari ini
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    Tidak ada data akun keuangan.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Summary */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-sm font-medium text-blue-700">Total Saldo Saat Ini</div>
            <div className="text-xl font-bold text-blue-600">
              {new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: "IDR",
                minimumFractionDigits: 0,
              }).format(
                data?.reduce((sum, account) => sum + account.currentBalance, 0) || 0
              )}
            </div>
          </div>
          
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium text-gray-700">Total Saldo Sebelumnya</div>
            <div className="text-xl font-bold text-gray-600">
              {new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: "IDR",
                minimumFractionDigits: 0,
              }).format(
                data?.reduce((sum, account) => sum + account.previousBalance, 0) || 0
              )}
            </div>
          </div>
          
          <div className={`border rounded-lg p-4 ${
            (data?.reduce((sum, account) => sum + account.todayNet, 0) || 0) >= 0 
              ? 'bg-green-50 border-green-200' 
              : 'bg-red-50 border-red-200'
          }`}>
            <div className={`text-sm font-medium ${
              (data?.reduce((sum, account) => sum + account.todayNet, 0) || 0) >= 0 
                ? 'text-green-700' 
                : 'text-red-700'
            }`}>
              Total Perubahan Hari Ini
            </div>
            <div className={`text-xl font-bold ${
              (data?.reduce((sum, account) => sum + account.todayNet, 0) || 0) >= 0 
                ? 'text-green-600' 
                : 'text-red-600'
            }`}>
              {new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: "IDR",
                minimumFractionDigits: 0,
              }).format(
                data?.reduce((sum, account) => sum + account.todayNet, 0) || 0
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}