"use client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAttendance } from "@/hooks/useAttendance"
import { format } from "date-fns"
import { id } from "date-fns/locale/id"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"

export default function AttendanceReportPage() {
  const { allAttendance, isLoadingAll } = useAttendance()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Laporan Absensi Karyawan</CardTitle>
        <CardDescription>Lihat riwayat absensi semua karyawan.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama Karyawan</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>Clock In</TableHead>
                <TableHead>Clock Out</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingAll ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}><Skeleton className="h-6 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : allAttendance?.length ? (
                allAttendance.map((att) => (
                  <TableRow key={att.id}>
                    <TableCell className="font-medium">{att.profiles?.full_name || 'N/A'}</TableCell>
                    <TableCell>{format(new Date(att.check_in_time), "d MMM yyyy", { locale: id })}</TableCell>
                    <TableCell>{format(new Date(att.check_in_time), "HH:mm:ss", { locale: id })}</TableCell>
                    <TableCell>{att.check_out_time ? format(new Date(att.check_out_time), "HH:mm:ss", { locale: id }) : '-'}</TableCell>
                    <TableCell><Badge variant={att.status === 'Hadir' ? 'destructive' : 'success'}>{att.status}</Badge></TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    Belum ada data absensi.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}