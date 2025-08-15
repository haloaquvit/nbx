"use client"
import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { UserPlus, Edit, Trash2, KeyRound } from "lucide-react"
import { useEmployees } from "@/hooks/useEmployees"
import { Employee } from "@/types/employee"
import { EmployeeDialog } from "@/components/EmployeeDialog"
import { ResetPasswordDialog } from "@/components/ResetPasswordDialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/useAuth"
import { useToast } from "@/components/ui/use-toast"
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

export default function EmployeePage() {
  const [isEmployeeDialogOpen, setIsEmployeeDialogOpen] = useState(false)
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const { user } = useAuth()
  const { toast } = useToast()
  const { employees, isLoading, deleteEmployee, isError, error } = useEmployees()
  const isOwner = user?.role === 'owner';

  const handleOpenDialog = (employee: Employee | null) => {
    setSelectedEmployee(employee)
    setIsEmployeeDialogOpen(true)
  }

  const handleOpenResetPasswordDialog = (employee: Employee) => {
    setSelectedEmployee(employee)
    setIsResetPasswordDialogOpen(true)
  }

  const handleDelete = (employeeToDelete: Employee) => {
    deleteEmployee.mutate(employeeToDelete.id, {
      onSuccess: () => {
        toast({ title: "Sukses", description: `Karyawan ${employeeToDelete.name} berhasil dihapus.` })
      },
      onError: (error: any) => {
        toast({ variant: "destructive", title: "Gagal", description: error.message })
      }
    })
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Gagal Memuat Data</CardTitle>
          <CardDescription>
            Terjadi kesalahan saat mengambil data karyawan. Silakan coba muat ulang halaman.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Detail Error: {error?.message}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <EmployeeDialog
        open={isEmployeeDialogOpen}
        onOpenChange={setIsEmployeeDialogOpen}
        employee={selectedEmployee}
      />
      <ResetPasswordDialog
        open={isResetPasswordDialogOpen}
        onOpenChange={setIsResetPasswordDialogOpen}
        employee={selectedEmployee}
      />
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Manajemen Karyawan</CardTitle>
              <CardDescription>Kelola data semua karyawan di perusahaan Anda.</CardDescription>
            </div>
            {isOwner && (
              <Button onClick={() => handleOpenDialog(null)}>
                <UserPlus className="mr-2 h-4 w-4" /> Tambah Karyawan Baru
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Jabatan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={5}><Skeleton className="h-6 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : employees?.length ? (
                  employees.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell className="font-medium">{employee.name}</TableCell>
                      <TableCell>{employee.email}</TableCell>
                      <TableCell>{employee.role}</TableCell>
                      <TableCell>
                        <Badge variant={employee.status === 'Aktif' ? 'success' : 'destructive'}>
                          {employee.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {isOwner ? (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => handleOpenResetPasswordDialog(employee)} title="Reset Password">
                              <KeyRound className="h-4 w-4 text-muted-foreground" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(employee)} title="Edit">
                              <Edit className="h-4 w-4" />
                            </Button>
                            {employee.id !== user?.id && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" title="Hapus">
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Anda yakin?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Tindakan ini akan menghapus karyawan "{employee.name}" secara permanen.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Batal</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDelete(employee)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Ya, Hapus
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">Hanya Owner</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">
                      Belum ada data karyawan.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  )
}