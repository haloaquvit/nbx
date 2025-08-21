import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { Cloud, Key, Folder, CheckCircle, XCircle } from 'lucide-react';
import { googleDriveService, GoogleDriveConfig } from '@/services/googleDriveService';

interface GoogleDriveSettingsData {
  apiKey: string;
  clientId: string;
  folderId: string;
}

export function GoogleDriveSettings() {
  const { toast } = useToast();
  const [config, setConfig] = useState<GoogleDriveSettingsData>({
    apiKey: '',
    clientId: '',
    folderId: ''
  });
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Load saved config from localStorage
    const savedConfig = localStorage.getItem('googleDriveConfig');
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        setConfig(parsed);
        checkConnection(parsed);
      } catch (error) {
        console.error('Error loading Google Drive config:', error);
      }
    }
  }, []);

  const checkConnection = async (configToCheck: GoogleDriveSettingsData) => {
    if (!configToCheck.apiKey || !configToCheck.clientId) return;

    try {
      await googleDriveService.initialize({
        apiKey: configToCheck.apiKey,
        clientId: configToCheck.clientId,
        folderId: configToCheck.folderId
      });
      setIsConnected(googleDriveService.isSignedIn());
    } catch (error) {
      console.error('Google Drive connection check failed:', error);
      setIsConnected(false);
    }
  };

  const handleSaveConfig = () => {
    if (!config.apiKey || !config.clientId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "API Key dan Client ID wajib diisi"
      });
      return;
    }

    try {
      localStorage.setItem('googleDriveConfig', JSON.stringify(config));
      toast({
        title: "Sukses!",
        description: "Konfigurasi Google Drive berhasil disimpan"
      });
      checkConnection(config);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal menyimpan konfigurasi"
      });
    }
  };

  const handleTestConnection = async () => {
    if (!config.apiKey || !config.clientId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Lengkapi konfigurasi terlebih dahulu"
      });
      return;
    }

    setIsLoading(true);
    try {
      await googleDriveService.initialize({
        apiKey: config.apiKey,
        clientId: config.clientId,
        folderId: config.folderId
      });

      const signedIn = await googleDriveService.signIn();
      setIsConnected(signedIn);

      if (signedIn) {
        toast({
          title: "Sukses!",
          description: "Koneksi Google Drive berhasil"
        });
      }
    } catch (error) {
      console.error('Google Drive connection failed:', error);
      setIsConnected(false);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal menghubungkan ke Google Drive"
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
          Konfigurasi Google Drive untuk penyimpanan foto delivery
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Badge variant={isConnected ? "default" : "secondary"}>
            {isConnected ? (
              <>
                <CheckCircle className="h-3 w-3 mr-1" />
                Terhubung
              </>
            ) : (
              <>
                <XCircle className="h-3 w-3 mr-1" />
                Tidak Terhubung
              </>
            )}
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <Label htmlFor="apiKey" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              Google API Key
            </Label>
            <Input
              id="apiKey"
              type="password"
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              placeholder="Masukkan Google API Key"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="clientId">Google Client ID</Label>
            <Input
              id="clientId"
              value={config.clientId}
              onChange={(e) => setConfig({ ...config, clientId: e.target.value })}
              placeholder="Masukkan Google Client ID"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="folderId" className="flex items-center gap-2">
              <Folder className="h-4 w-4" />
              Folder ID (Opsional)
            </Label>
            <Input
              id="folderId"
              value={config.folderId}
              onChange={(e) => setConfig({ ...config, folderId: e.target.value })}
              placeholder="ID folder Google Drive untuk foto delivery"
            />
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
          <h4 className="font-medium mb-2">Cara Setup Google Drive API:</h4>
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
            <li>Buka <a href="https://console.cloud.google.com" target="_blank" className="text-blue-600 hover:underline">Google Cloud Console</a></li>
            <li>Buat project baru atau pilih project existing</li>
            <li>Enable Google Drive API</li>
            <li>Buat credentials (API Key + OAuth 2.0 Client ID)</li>
            <li>Tambahkan domain aplikasi ke authorized origins</li>
            <li>Copy API Key dan Client ID ke form di atas</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}