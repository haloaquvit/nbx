import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { Cloud, Key, Folder, CheckCircle, XCircle, Upload } from 'lucide-react';
import { googleDriveServiceAccount, ServiceAccountConfig } from '@/services/googleDriveServiceAccount';

interface ServiceAccountSettingsData {
  privateKey: string;
  clientEmail: string;
  projectId: string;
  folderId: string;
}

export function GoogleDriveServiceAccountSettings() {
  const { toast } = useToast();
  const [config, setConfig] = useState<ServiceAccountSettingsData>({
    privateKey: '',
    clientEmail: '',
    projectId: '',
    folderId: ''
  });
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [jsonFile, setJsonFile] = useState<File | null>(null);

  useEffect(() => {
    // Load saved config from localStorage
    const savedConfig = localStorage.getItem('googleDriveServiceAccountConfig');
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        setConfig({
          privateKey: parsed.privateKey || '',
          clientEmail: parsed.clientEmail || '',
          projectId: parsed.projectId || '',
          folderId: parsed.folderId || ''
        });
        checkConfiguration(parsed);
      } catch (error) {
        console.error('Error loading Google Drive Service Account config:', error);
      }
    }
  }, []);

  const checkConfiguration = (configToCheck: ServiceAccountSettingsData) => {
    const isValid = configToCheck.privateKey && 
                   configToCheck.clientEmail && 
                   configToCheck.projectId &&
                   configToCheck.folderId && // WAJIB ada folder ID
                   configToCheck.privateKey.includes('BEGIN PRIVATE KEY');
    setIsConfigured(isValid);
  };

  const validateConfig = (config: ServiceAccountSettingsData): string | null => {
    if (!config.privateKey || !config.clientEmail || !config.projectId) {
      return "Lengkapi Private Key, Client Email, dan Project ID";
    }

    // Validate Private Key format
    if (!config.privateKey.includes('BEGIN PRIVATE KEY')) {
      return "Format Private Key salah. Harus dimulai dengan '-----BEGIN PRIVATE KEY-----'";
    }

    // Validate Client Email format (should be service account email)
    if (!config.clientEmail.includes('@') || !config.clientEmail.includes('.iam.gserviceaccount.com')) {
      return "Format Client Email salah. Harus berupa service account email (xxx@xxx.iam.gserviceaccount.com)";
    }

    // WAJIB ada folder ID untuk Service Account
    if (!config.folderId) {
      return "Folder ID wajib diisi! Service Account tidak bisa upload ke root Drive. Buat folder, share ke Service Account, masukkan Folder ID.";
    }

    return null;
  };

  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setJsonFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonContent = JSON.parse(e.target?.result as string);
        
        // Validate it's a service account JSON
        if (jsonContent.type !== 'service_account') {
          toast({
            variant: "destructive",
            title: "Error",
            description: "File JSON bukan Service Account key"
          });
          return;
        }

        setConfig({
          privateKey: jsonContent.private_key || '',
          clientEmail: jsonContent.client_email || '',
          projectId: jsonContent.project_id || '',
          folderId: config.folderId // Keep existing folder ID
        });

        toast({
          title: "Sukses!",
          description: "File JSON Service Account berhasil diload"
        });

      } catch (error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "File JSON tidak valid"
        });
      }
    };
    reader.readAsText(file);
  };

  const handleSaveConfig = () => {
    const validationError = validateConfig(config);
    if (validationError) {
      toast({
        variant: "destructive",
        title: "Error Konfigurasi",
        description: validationError
      });
      return;
    }

    try {
      localStorage.setItem('googleDriveServiceAccountConfig', JSON.stringify(config));
      toast({
        title: "Sukses!",
        description: "Konfigurasi Google Drive Service Account berhasil disimpan"
      });
      checkConfiguration(config);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal menyimpan konfigurasi"
      });
    }
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
      // Check if we're in production environment
      const isProduction = import.meta.env.PROD || window.location.hostname !== 'localhost';
      
      if (isProduction) {
        // Skip server test in production - just validate config
        setIsConfigured(true);
        toast({
          title: "Konfigurasi Valid!",
          description: "Service Account dikonfigurasi untuk production. Test upload akan dilakukan saat penggunaan aktual."
        });
        return;
      }

      // Test backend upload server connection in development
      const isServerAvailable = await fetch('http://localhost:3001/health')
        .then(res => res.ok)
        .catch(() => false);
      
      if (!isServerAvailable) {
        throw new Error('Upload server tidak tersedia. Pastikan server backend berjalan dengan perintah: npm run upload-server');
      }

      // Test with dummy file upload via backend
      const testFile = new Blob(['Test upload from backend server'], { type: 'text/plain' });
      const file = new File([testFile], 'test-backend.txt', { type: 'text/plain' });
      const formData = new FormData();
      formData.append('photo', file);
      formData.append('transactionId', 'settings-test');

      const response = await fetch('http://localhost:3001/upload-photo', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Upload failed: ${response.status}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Upload failed');
      }

      setIsConfigured(true);
      toast({
        title: "Sukses!",
        description: "Koneksi backend upload server berhasil. Google Drive Service Account siap digunakan."
      });

    } catch (error: any) {
      console.error('Google Drive Service Account connection failed:', error);
      setIsConfigured(false);
      
      let errorMessage = "Gagal menghubungkan ke Google Drive Service Account";
      if (error?.message?.includes('private_key')) {
        errorMessage = "Private Key tidak valid atau format salah.";
      } else if (error?.message?.includes('client_email')) {
        errorMessage = "Client Email tidak valid.";
      } else if (error?.message?.includes('Token request failed')) {
        errorMessage = "Gagal mendapatkan access token. Periksa credentials Service Account.";
      }
      
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="h-5 w-5" />
          Google Drive Integration
        </CardTitle>
        <CardDescription>
          Konfigurasi Google Drive untuk upload foto delivery (100% Gratis dengan Gmail)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Badge variant={isConfigured ? "default" : "secondary"}>
            {isConfigured ? (
              <>
                <CheckCircle className="h-3 w-3 mr-1" />
                Terkonfigurasi
              </>
            ) : (
              <>
                <XCircle className="h-3 w-3 mr-1" />
                Belum Terkonfigurasi
              </>
            )}
          </Badge>
        </div>

        {/* JSON File Upload */}
        <div className="space-y-2">
          <Label htmlFor="jsonFile" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Upload Service Account JSON (Opsional)
          </Label>
          <Input
            id="jsonFile"
            type="file"
            accept=".json"
            onChange={handleJsonUpload}
            className="cursor-pointer"
          />
          <p className="text-sm text-muted-foreground">
            Upload file JSON Service Account untuk auto-fill form di bawah
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <Label htmlFor="projectId">Project ID</Label>
            <Input
              id="projectId"
              value={config.projectId}
              onChange={(e) => setConfig({ ...config, projectId: e.target.value })}
              placeholder="aquvit-app"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="clientEmail">Client Email</Label>
            <Input
              id="clientEmail"
              value={config.clientEmail}
              onChange={(e) => setConfig({ ...config, clientEmail: e.target.value })}
              placeholder="service-account@project.iam.gserviceaccount.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="privateKey" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              Private Key
            </Label>
            <Textarea
              id="privateKey"
              value={config.privateKey}
              onChange={(e) => setConfig({ ...config, privateKey: e.target.value })}
              placeholder="-----BEGIN PRIVATE KEY-----&#10;MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDd3geR...&#10;-----END PRIVATE KEY-----"
              rows={6}
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="folderId" className="flex items-center gap-2">
              <Folder className="h-4 w-4" />
              Folder ID *
            </Label>
            <Input
              id="folderId"
              value={config.folderId}
              onChange={(e) => setConfig({ ...config, folderId: e.target.value })}
              placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
              required
            />
            <p className="text-sm text-muted-foreground">
              <strong>WAJIB:</strong> ID folder Google Drive yang sudah di-share ke Service Account dengan permission Editor
            </p>
          </div>
        </div>

        <div className="flex gap-2 pt-4">
          <Button onClick={handleSaveConfig}>
            Simpan Konfigurasi
          </Button>
          <Button 
            variant="outline" 
            onClick={handleTestConnection}
            disabled={isLoading}
          >
            {isLoading ? 'Testing...' : 'Test Koneksi'}
          </Button>
        </div>

        <div className="mt-6 p-4 bg-muted rounded-lg text-sm">
          <h4 className="font-medium mb-2">📋 Cara Setup Google Drive (Gmail Gratis):</h4>
          <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
            <li><strong>Google Cloud Console:</strong>
              <ul className="ml-4 mt-1 space-y-1 list-disc list-inside text-xs">
                <li>Buka <a href="https://console.cloud.google.com" target="_blank" className="text-blue-600 hover:underline">console.cloud.google.com</a></li>
                <li>Buat project baru (atau pakai yang ada)</li>
                <li>Enable "Google Drive API"</li>
              </ul>
            </li>
            <li><strong>Buat Service Account:</strong>
              <ul className="ml-4 mt-1 space-y-1 list-disc list-inside text-xs">
                <li>"IAM & Admin" → "Service Accounts" → "Create Service Account"</li>
                <li>Generate JSON key → Download file JSON</li>
                <li>Upload JSON file di atas, atau copy-paste manual</li>
              </ul>
            </li>
            <li><strong>Setup Folder di Google Drive (PENTING!):</strong>
              <ul className="ml-4 mt-1 space-y-1 list-disc list-inside text-xs">
                <li>Buka <a href="https://drive.google.com" target="_blank" className="text-blue-600 hover:underline">drive.google.com</a> (dengan akun Gmail Anda)</li>
                <li>Buat folder baru, misal: "Foto Delivery Aquvit"</li>
                <li><strong>Klik kanan folder → "Share" → Masukkan email:</strong><br/>
                    <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">gelasapp@aquvit-app.iam.gserviceaccount.com</code></li>
                <li><strong>Set permission: "Editor"</strong> → Send</li>
                <li>Copy Folder ID dari URL (bagian setelah /folders/)</li>
              </ul>
            </li>
            <li><strong>Test & Save:</strong>
              <ul className="ml-4 mt-1 space-y-1 list-disc list-inside text-xs">
                <li>Input Folder ID ke field "Folder ID" di atas</li>
                <li>Klik "Simpan Konfigurasi" → "Test Koneksi"</li>
                <li>Harus berhasil upload file test!</li>
              </ul>
            </li>
          </ol>
          
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-800">
            <strong>⚠️ WAJIB - Folder ID:</strong> 
            <p className="text-xs mt-1">Service Account TIDAK BISA upload ke root Drive. WAJIB buat folder, share ke Service Account dengan permission "Editor", dan masukkan Folder ID!</p>
          </div>
          
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded text-green-800">
            <strong>✅ Keuntungan Setup Ini:</strong>
            <ul className="mt-1 space-y-1 text-xs">
              <li>• 100% Gratis dengan Gmail biasa</li>
              <li>• Tidak perlu login berulang-ulang</li>
              <li>• File langsung masuk ke Google Drive Anda</li>
              <li>• Tidak ada batas quota atau expired token</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}