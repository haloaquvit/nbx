import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { History, DollarSign } from 'lucide-react'

interface PayrollPayment {
  id: string
  account_name: string
  amount: number
  description: string
  user_name: string
  created_at: string
  reference_id: string
  reference_name: string
}

export const PayrollHistoryTable = () => {
  // Fetch payroll payment history from cash_history
  const { data: payrollHistory, isLoading } = useQuery<PayrollPayment[]>({
    queryKey: ['payrollHistory'],
    queryFn: async () => {
      console.log('🔍 Fetching payroll history from cash_history...')

      const { data, error } = await supabase
        .from('cash_history')
        .select('*')
        .eq('type', 'gaji_karyawan')
        .order('created_at', { ascending: false })

      console.log('📊 Payroll history query result:', { data, error })

      if (error) {
        console.error('❌ Failed to fetch payroll history:', error)
        throw error
      }

      console.log(`✅ Found ${data?.length || 0} payroll payment records`)
      return data || []
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  if (!payrollHistory || payrollHistory.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <History className="h-16 w-16 mx-auto mb-4 opacity-50" />
        <p className="text-lg font-medium">Belum Ada Pembayaran Gaji</p>
        <p className="text-sm">Pembayaran gaji akan muncul di sini setelah status payroll diubah ke "Paid"</p>
      </div>
    )
  }

  // Calculate total payments
  const totalPayments = payrollHistory.reduce((sum, payment) => sum + payment.amount, 0)

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card className="bg-gradient-to-r from-green-50 to-blue-50 border-green-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-green-700">
            <DollarSign className="h-5 w-5" />
            Ringkasan Pembayaran Gaji
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600">Total Pembayaran</p>
              <p className="text-2xl font-bold text-green-700">
                {formatCurrency(totalPayments)}
              </p>
            </div>
            <div>
              <p className="text-sm text-blue-600">Jumlah Transaksi</p>
              <p className="text-2xl font-bold text-blue-700">
                {payrollHistory.length}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment History Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tanggal</TableHead>
              <TableHead>Karyawan</TableHead>
              <TableHead>Deskripsi</TableHead>
              <TableHead>Akun Pembayaran</TableHead>
              <TableHead className="text-right">Jumlah</TableHead>
              <TableHead>Dibayar Oleh</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payrollHistory.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{formatDate(new Date(payment.created_at))}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(payment.created_at).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">
                      {payment.reference_name?.replace('Payroll ', '') || 'N/A'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ID: {payment.reference_id}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <p className="text-sm">{payment.description}</p>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {payment.account_name}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-semibold text-green-600">
                    {formatCurrency(payment.amount)}
                  </span>
                </TableCell>
                <TableCell>
                  <p className="text-sm">{payment.user_name}</p>
                </TableCell>
                <TableCell>
                  <Badge className="bg-green-100 text-green-700 hover:bg-green-200">
                    Dibayar
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}