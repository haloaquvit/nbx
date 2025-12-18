import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useEffect, useState } from 'react';
import { RolePermissionManagement } from './RolePermissionManagement';
import { RoleManagement } from './RoleManagement';
import { getRolePermissions, updateRolePermissions, getRLSStatus, enableRLS, disableRLS, getRLSPolicies } from '@/services/rolePermissionService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Shield, Database, Lock, Unlock, AlertTriangle, CheckCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';


const RolesTab = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rolePermissions, setRolePermissions] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rlsStatus, setRlsStatus] = useState<any>([]);
  const [rlsLoading, setRlsLoading] = useState(false);
  const [rlsPolicies, setRlsPolicies] = useState<any>([]);

  useEffect(() => {
    async function fetchPermissions() {
      setLoading(true);
      try {
        const data = await getRolePermissions();
        setRolePermissions(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchPermissions();
  }, []);

  const fetchRLSStatus = async () => {
    if (user?.role !== 'owner') return;
    
    setRlsLoading(true);
    try {
      const [statusData, policiesData] = await Promise.all([
        getRLSStatus(),
        getRLSPolicies()
      ]);
      setRlsStatus(statusData || []);
      setRlsPolicies(policiesData || []);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal memuat status RLS: " + err.message,
      });
    } finally {
      setRlsLoading(false);
    }
  };

  const handleRLSToggle = async (tableName: string, enabled: boolean) => {
    if (user?.role !== 'owner') return;
    
    try {
      if (enabled) {
        await enableRLS(tableName);
        toast({
          title: "RLS Diaktifkan",
          description: `RLS berhasil diaktifkan untuk tabel ${tableName}`,
        });
      } else {
        await disableRLS(tableName);
        toast({
          title: "RLS Dinonaktifkan", 
          description: `RLS berhasil dinonaktifkan untuk tabel ${tableName}`,
        });
      }
      
      // Refresh RLS status
      await fetchRLSStatus();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal mengubah status RLS: " + err.message,
      });
    }
  };

  // Handler to update permission for a role
  const handleUpdatePermission = async (roleId: string, permissions: Record<string, boolean>) => {
    setLoading(true);
    try {
      await updateRolePermissions(roleId, permissions);
      // Refresh after update
      const data = await getRolePermissions();
      setRolePermissions(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manajemen Role</CardTitle>
        <CardDescription>
          Kelola role dan permission user sesuai kebutuhan bisnis Anda.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="roles">
          <TabsList>
            <TabsTrigger value="roles">Kelola Role</TabsTrigger>
            <TabsTrigger value="permission">Permission</TabsTrigger>
            <TabsTrigger value="rls">RLS Security</TabsTrigger>
          </TabsList>
          <TabsContent value="roles">
            <RoleManagement />
          </TabsContent>
          <TabsContent value="permission">
            {loading ? (
              <div className="p-4">Loading...</div>
            ) : error ? (
              <div className="p-4 text-red-500">{error}</div>
            ) : (
              <RolePermissionManagement
                rolePermissions={rolePermissions}
                onUpdatePermission={handleUpdatePermission}
              />
            )}
          </TabsContent>

          <TabsContent value="rls">
            {user?.role !== 'owner' ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Shield className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">Akses Terbatas</h3>
                  <p className="text-muted-foreground text-center">
                    Hanya Owner yang dapat mengakses pengaturan RLS Security.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Database className="h-5 w-5" />
                      Row Level Security (RLS) Management
                    </CardTitle>
                    <CardDescription>
                      Kelola keamanan tingkat baris untuk setiap tabel. RLS memastikan user hanya dapat mengakses data sesuai role mereka.
                    </CardDescription>
                    <div className="mt-4">
                      <Button 
                        onClick={fetchRLSStatus}
                        disabled={rlsLoading}
                        className="flex items-center gap-2"
                      >
                        <Shield className="h-4 w-4" />
                        {rlsLoading ? 'Loading...' : 'Refresh Status RLS'}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {rlsLoading ? (
                      <div className="p-8 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                        <p>Memuat status RLS...</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {rlsStatus.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            <AlertTriangle className="h-12 w-12 mx-auto mb-4" />
                            <p>Belum ada data RLS. Klik "Refresh Status RLS" untuk memuat data.</p>
                          </div>
                        ) : (
                          <div className="grid gap-4">
                            {rlsStatus.map((table: any) => (
                              <Card key={table.table_name} className="p-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <Database className="h-5 w-5 text-muted-foreground" />
                                    <div>
                                      <h4 className="font-medium">{table.table_name}</h4>
                                      <p className="text-sm text-muted-foreground">
                                        Schema: {table.schema_name}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <Badge 
                                      variant={table.rls_enabled ? "default" : "secondary"}
                                      className={table.rls_enabled ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}
                                    >
                                      {table.rls_enabled ? (
                                        <>
                                          <Lock className="h-3 w-3 mr-1" />
                                          Aktif
                                        </>
                                      ) : (
                                        <>
                                          <Unlock className="h-3 w-3 mr-1" />
                                          Nonaktif
                                        </>
                                      )}
                                    </Badge>
                                    <Switch
                                      checked={table.rls_enabled}
                                      onCheckedChange={(checked) => handleRLSToggle(table.table_name, checked)}
                                    />
                                  </div>
                                </div>
                                
                                {/* Show policies count if available */}
                                {rlsPolicies.filter((p: any) => p.table_name === table.table_name).length > 0 && (
                                  <div className="mt-3 pt-3 border-t">
                                    <p className="text-sm text-muted-foreground">
                                      <CheckCircle className="h-4 w-4 inline mr-1" />
                                      {rlsPolicies.filter((p: any) => p.table_name === table.table_name).length} policy aktif
                                    </p>
                                  </div>
                                )}
                              </Card>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* RLS Policies Information */}
                {rlsPolicies.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Active RLS Policies</CardTitle>
                      <CardDescription>
                        Daftar policy RLS yang sedang aktif di database
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {rlsPolicies.map((policy: any, index: number) => (
                          <div key={index} className="border rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-medium">{policy.policy_name}</h4>
                              <Badge variant="outline">{policy.table_name}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Command: {policy.cmd} | Roles: {policy.roles}
                            </p>
                            {policy.qual && (
                              <p className="text-xs text-muted-foreground mt-1 font-mono bg-gray-50 p-2 rounded">
                                {policy.qual}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default RolesTab;
