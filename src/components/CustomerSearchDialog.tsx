"use client"

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { useCustomers } from "@/hooks/useCustomers"
import { Customer } from "@/types/customer"
import { Skeleton } from './ui/skeleton'

interface CustomerSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCustomerSelect: (customer: Customer) => void;
}

export function CustomerSearchDialog({ open, onOpenChange, onCustomerSelect }: CustomerSearchDialogProps) {
  const { customers, isLoading } = useCustomers();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCustomers = customers?.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone.includes(searchTerm)
  );

  const handleSelect = (customer: Customer) => {
    onCustomerSelect(customer);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Cari Pelanggan</DialogTitle>
          <DialogDescription>
            Cari dan pilih pelanggan yang sudah terdaftar. Klik pada baris untuk memilih.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Input
            placeholder="Cari berdasarkan nama atau nomor telepon..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="mb-4"
          />
          <div className="border rounded-md max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>No. Telepon</TableHead>
                  <TableHead>Alamat</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[120px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[200px]" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-8 w-[60px] ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredCustomers?.length ? (
                  filteredCustomers.map((customer) => (
                    <TableRow 
                      key={customer.id}
                      onClick={() => handleSelect(customer)}
                      className="cursor-pointer hover:bg-muted"
                    >
                      <TableCell className="font-medium">{customer.name}</TableCell>
                      <TableCell>{customer.phone}</TableCell>
                      <TableCell>{customer.address}</TableCell>
                      <TableCell className="text-right">
                        <Button 
                          size="sm" 
                          onClick={(e) => {
                            e.stopPropagation(); // Mencegah klik baris terpicu
                            handleSelect(customer);
                          }}
                        >
                          Pilih
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      Pelanggan tidak ditemukan.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}