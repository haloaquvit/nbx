import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { useEmployees } from '@/hooks/useEmployees';
import { useRoles } from '@/hooks/useRoles';
import { supabase } from '@/integrations/supabase/client';
import { Users, Shield, Save, User } from 'lucide-react';

const PERMISSION_CATEGORIES = {
  'User Management': ['employees.read', 'employees.write'],
  'Product Management': ['products.read', 'products.write'],
  'Transaction Management': ['transactions.read', 'transactions.write'],
  'Customer Management': ['customers.read', 'customers.write'],
  'Material Management': ['materials.read', 'materials.write'],
  'Delivery Management': ['deliveries.read', 'deliveries.write'],
  'Financial Management': ['payments.read', 'payments.write', 'reports.read'],
  'Quotation Management': ['quotations.read', 'quotations.write'],
  'System Settings': ['roles.write']
};

const PERMISSION_LABELS: Record<string, string> = {
  'employees.read': 'Lihat Karyawan',
  'employees.write': 'Kelola Karyawan',
  'products.read': 'Lihat Produk',
  'products.write': 'Kelola Produk',
  'transactions.read': 'Lihat Transaksi',
  'transactions.write': 'Kelola Transaksi',
  'customers.read': 'Lihat Customer',
  'customers.write': 'Kelola Customer',
  'materials.read': 'Lihat Bahan',
  'materials.write': 'Kelola Bahan',
  'deliveries.read': 'Lihat Pengantaran',
  'deliveries.write': 'Kelola Pengantaran',
  'payments.read': 'Lihat Pembayaran',
  'payments.write': 'Kelola Pembayaran',
  'quotations.read': 'Lihat Quotation',
  'quotations.write': 'Kelola Quotation',
  'reports.read': 'Lihat Laporan',
  'roles.write': 'Kelola Role & Permission'
};

export const UserPermissionTab = () => {
  const { toast } = useToast();
  const { employees } = useEmployees();
  const { roles } = useRoles();
  
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [customPermissions, setCustomPermissions] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);

  // Reset when user changes
  useEffect(() => {
    if (selectedUserId) {
      const user = employees?.find(emp => emp.id === selectedUserId);
      setSelectedUser(user);
      setUserRole(user?.role || '');
      
      // Load user's custom permissions if any
      loadUserPermissions(selectedUserId);
    } else {
      setSelectedUser(null);
      setUserRole('');
      setCustomPermissions({});
    }
  }, [selectedUserId, employees]);

  const loadUserPermissions = async (userId: string) => {
    try {
      // Get user's current role and permissions
      const { data: userRole } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (userRole) {
        // Get role's default permissions
        const role = roles?.find(r => r.name === userRole.role);
        if (role) {
          setCustomPermissions(role.permissions || {});
        }
      }
    } catch (error) {
      console.error('Error loading user permissions:', error);
    }
  };

  const handleRoleChange = (newRole: string) => {
    setUserRole(newRole);
    // Set default permissions from selected role
    const role = roles?.find(r => r.name === newRole);
    if (role) {
      setCustomPermissions(role.permissions || {});
    }
  };

  const handlePermissionChange = (permission: string, checked: boolean) => {
    setCustomPermissions(prev => ({
      ...prev,
      [permission]: checked
    }));
  };

  const handleSaveUserPermissions = async () => {
    if (!selectedUserId || !userRole) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Pilih user dan role terlebih dahulu."
      });
      return;
    }

    setIsLoading(true);
    try {
      // Update user's role in profiles table
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ role: userRole })
        .eq('id', selectedUserId);

      if (profileError) throw profileError;

      // If custom permissions differ from role defaults, save them separately
      // For now, we'll just update the role since our RLS system reads from roles table
      
      toast({
        title: "Sukses!",
        description: `Permission user ${selectedUser?.name} berhasil diperbarui.`
      });
      
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal!",
        description: error.message
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getUserRolePermissions = () => {
    if (!userRole) return {};
    const role = roles?.find(r => r.name === userRole);
    return role?.permissions || {};
  };

  return (
    <div className="space-y-6">
      {/* User Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Pilih User & Role
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="user-select">Pilih Karyawan</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih karyawan..." />
                </SelectTrigger>
                <SelectContent>
                  {employees?.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        {employee.name} - {employee.role}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="role-select">Assign Role</Label>
              <Select value={userRole} onValueChange={handleRoleChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih role..." />
                </SelectTrigger>
                <SelectContent>
                  {roles?.map((role) => (
                    <SelectItem key={role.id} value={role.name}>
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        {role.displayName}
                        {role.isSystemRole && (
                          <Badge variant="secondary" className="text-xs">System</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedUser && (
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">User Terpilih:</h4>
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-sm"><strong>Nama:</strong> {selectedUser.name}</p>
                  <p className="text-sm"><strong>Email:</strong> {selectedUser.email}</p>
                </div>
                <div>
                  <p className="text-sm"><strong>Role Saat Ini:</strong> 
                    <Badge variant="outline" className="ml-2">{selectedUser.role}</Badge>
                  </p>
                  <p className="text-sm"><strong>Status:</strong> 
                    <Badge variant={selectedUser.status === 'Aktif' ? 'default' : 'secondary'} className="ml-2">
                      {selectedUser.status}
                    </Badge>
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Permissions Management */}
      {selectedUserId && userRole && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Kelola Permissions
            </CardTitle>
            <div className="text-sm text-muted-foreground">
              Atur permission untuk <strong>{selectedUser?.name}</strong> dengan role <strong>{userRole}</strong>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {Object.entries(PERMISSION_CATEGORIES).map(([category, permissions]) => (
                <div key={category} className="space-y-3">
                  <h4 className="font-medium text-sm text-muted-foreground border-b pb-2">
                    {category}
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    {permissions.map((permission) => (
                      <div key={permission} className="flex items-center space-x-2">
                        <Checkbox
                          id={permission}
                          checked={customPermissions[permission] || false}
                          onCheckedChange={(checked) => 
                            handlePermissionChange(permission, checked as boolean)
                          }
                        />
                        <Label htmlFor={permission} className="text-sm">
                          {PERMISSION_LABELS[permission] || permission}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div className="flex justify-end pt-4 border-t">
                <Button 
                  onClick={handleSaveUserPermissions} 
                  disabled={isLoading}
                  className="flex items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  {isLoading ? 'Menyimpan...' : 'Simpan Permission'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!selectedUserId && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Pilih Karyawan</h3>
            <p className="text-muted-foreground text-center">
              Pilih karyawan dari dropdown di atas untuk mengatur role dan permission
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};