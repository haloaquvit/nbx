import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Cloud, Folder, CheckCircle, XCircle, Info, Shield } from 'lucide-react';

interface ServiceAccountSettingsData {
  folderId: string; // hanya folder ID yang disimpan di frontend
}

export function GoogleDriveServiceAccountSettings() {
  const { toast } = useToast();
  const [config, setConfig] = useState<ServiceAccountSettingsData>({
    folderId: ''
  });
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [serviceAccountEmail, setServiceAccountEmail] = useState<string>('');

  useEffect(() => {
    // Load hanya folder ID dari localStorage (aman)
    const savedFolderId = localStorage.getItem('googleDriveFolderId');
    if (savedFolderId) {
      setConfig({ folderId: savedFolderId });
      checkConfiguration();
    }

    // Load Service Account email dari server (tanpa expose private key)
    loadServiceAccountInfo();
  }, []);

  const loadServiceAccountInfo = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/gdrive/info');
      const data = await response.json();
      
      if (data.ok && data.serviceAccountEmail) {
        setServiceAccountEmail(data.serviceAccountEmail);
      }
    } catch (error) {
      console.warn('Could not load Service Account info:', error);
    }
  };

  const checkConfiguration = () => {
    // Simple check - jika ada folder ID, anggap configured
    setIsConfigured(!!config.folderId.trim());
  };

  const handleInputChange = (field: keyof ServiceAccountSettingsData, value: string) => {
    const newConfig = { ...config, [field]: value };
    setConfig(newConfig);
    
    // Save hanya folder ID ke localStorage
    if (field === 'folderId') {
      localStorage.setItem('googleDriveFolderId', value);
    }
    
    checkConfiguration();
  };

  const validateConfig = (config: ServiceAccountSettingsData): string | null => {
    if (!config.folderId.trim()) {
      return "Folder ID wajib diisi";
    }
    return null;
  };

  const handleTestConnection = async () => {
    const validationError = validateConfig(config);
    if (validationError) {
      toast({
        variant: "destructive",
        title: "Error Konfigurasi",
        description: validationError
      });
      return;
    }

    setIsLoading(true);
    try {
      // Test koneksi via server endpoint yang aman
      const response = await fetch('http://localhost:3001/api/gdrive/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: config.folderId }),
      });

      const result = await response.json();
      
      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Test gagal');
      }

      setIsConfigured(true);
      toast({
        title: "Sukses!",
        description: "Test upload berhasil. Google Drive Service Account siap digunakan."
      });

    } catch (error: any) {
      console.error('Google Drive Service Account test failed:', error);
      setIsConfigured(false);
      toast({
        variant: "destructive",
        title: "Test Koneksi Gagal",
        description: error.message
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = () => {
    const validationError = validateConfig(config);
    if (validationError) {
      toast({
        variant: "destructive",
        title: "Error Validasi",
        description: validationError
      });
      return;
    }

    // Data sudah tersimpan otomatis saat input change
    checkConfiguration();
    
    toast({
      title: "Tersimpan!",
      description: "Konfigurasi Google Drive Service Account berhasil disimpan"
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-green-600" />
          <div>
            <CardTitle>Google Drive Service Account (Secure)</CardTitle>
            <CardDescription>
              Konfigurasi aman untuk upload foto ke Google Drive
            </CardDescription>
          </div>
          {isConfigured ? (
            <Badge variant="default" className="ml-auto bg-green-100 text-green-800">
              <CheckCircle className="h-3 w-3 mr-1" />
              Aktif
            </Badge>
          ) : (
            <Badge variant="secondary" className="ml-auto">
              <XCircle className="h-3 w-3 mr-1" />
              Tidak Aktif
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Security Notice */}
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            <strong>🔒 Keamanan:</strong> Service Account credentials disimpan aman di server, 
            bukan di browser. Hanya Folder ID yang disimpan lokal.
          </AlertDescription>
        </Alert>

        {/* Service Account Info (Read-only) */}
        {serviceAccountEmail && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Service Account Email</Label>
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-md">
              <Cloud className="h-4 w-4 text-gray-500" />
              <code className="text-sm">{serviceAccountEmail}</code>
            </div>
            <p className="text-xs text-gray-500">
              Share folder Google Drive Anda ke email ini dengan permission <strong>Editor</strong>
            </p>
          </div>
        )}

        {/* Folder ID Input */}
        <div className="space-y-2">
          <Label htmlFor="folderId" className="flex items-center gap-2">
            <Folder className="h-4 w-4" />
            Google Drive Folder ID
          </Label>
          <Input
            id="folderId"
            value={config.folderId}
            onChange={(e) => handleInputChange('folderId', e.target.value)}
            placeholder="1zFhEWdnh7aG7O602nzBYoAg1r2JIsEWj"
            className="font-mono text-sm"
          />
          <p className="text-xs text-gray-500">
            Bisa folder ID atau URL lengkap Google Drive folder
          </p>
        </div>

        {/* Instructions */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Cara setup:</strong>
            <ol className="mt-2 ml-4 list-decimal text-sm space-y-1">
              <li>Buat folder baru di Google Drive</li>
              <li>Share folder ke email Service Account di atas (permission: Editor)</li>
              <li>Copy folder ID atau URL dan paste ke field di atas</li>
              <li>Klik "Test Koneksi" untuk memastikan setup benar</li>
            </ol>
          </AlertDescription>
        </Alert>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button 
            onClick={handleTestConnection}
            disabled={isLoading || !config.folderId.trim()}
            className="flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Testing...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                Test Koneksi
              </>
            )}
          </Button>
          
          <Button 
            variant="outline" 
            onClick={handleSave}
            disabled={!config.folderId.trim()}
          >
            Simpan Konfigurasi
          </Button>
        </div>

        {/* Status */}
        {isConfigured && (
          <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-3 rounded-md">
            <CheckCircle className="h-4 w-4" />
            Google Drive Service Account siap digunakan untuk upload foto
          </div>
        )}
      </CardContent>
    </Card>
  );
}