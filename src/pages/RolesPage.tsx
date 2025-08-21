import { Shield } from 'lucide-react';
import RolesTab from '@/components/RolesTab';

export default function RolesPage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Manajemen Roles & Security
          </h1>
          <p className="text-muted-foreground">Kelola peran, permission, dan keamanan RLS dalam sistem</p>
        </div>
      </div>

      <RolesTab />
    </div>
  );
}