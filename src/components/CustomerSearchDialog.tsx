"use client"

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useCustomers } from "@/hooks/useCustomers"
import { Customer } from "@/types/customer"
import { Skeleton } from './ui/skeleton'
import { ScrollArea } from './ui/scroll-area'
import { Search, User, Phone, MapPin, Check, Loader2 } from 'lucide-react'

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
      <DialogContent className="sm:max-w-lg max-h-[85vh] p-0">
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Cari Pelanggan
          </DialogTitle>
          <DialogDescription className="text-xs">
            Cari dan pilih pelanggan. Tap untuk memilih.
          </DialogDescription>
        </DialogHeader>

        {/* Search Input */}
        <div className="px-4 pt-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari nama atau telepon..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-10"
              autoFocus
            />
          </div>
        </div>

        {/* Customer List - Mobile Optimized */}
        <ScrollArea className="max-h-[55vh] px-4 pb-4">
          <div className="space-y-2 pt-2">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-3 border rounded-lg">
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))
            ) : filteredCustomers?.length ? (
              filteredCustomers.map((customer) => (
                <div
                  key={customer.id}
                  onClick={() => handleSelect(customer)}
                  className="p-3 border rounded-lg cursor-pointer transition-all duration-150 active:scale-[0.98] active:bg-blue-50 dark:active:bg-blue-900/30 hover:bg-gray-50 dark:hover:bg-gray-800 touch-manipulation select-none"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{customer.name}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <Phone className="h-3 w-3" />
                        <span>{customer.phone || '-'}</span>
                      </div>
                      {customer.address && (
                        <div className="flex items-start gap-1 text-xs text-muted-foreground mt-1">
                          <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          <span className="line-clamp-2">{customer.address}</span>
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(customer);
                      }}
                    >
                      <Check className="h-4 w-4 text-green-600" />
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <User className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">
                  {searchTerm ? 'Pelanggan tidak ditemukan' : 'Tidak ada pelanggan'}
                </p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer with count */}
        {!isLoading && filteredCustomers && filteredCustomers.length > 0 && (
          <div className="px-4 py-2 border-t text-xs text-muted-foreground text-center">
            {filteredCustomers.length} pelanggan ditemukan
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}