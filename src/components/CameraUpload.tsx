import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Camera, Upload, X, Loader2, CheckCircle } from 'lucide-react';
import { compressImage, captureFromCamera, validateImageFile, CompressedImage } from '@/utils/imageUtils';
import { uploadToGoogleDrive as uploadToDrive } from '@/utils/googleDriveInit';

interface CameraUploadProps {
  onPhotoUploaded: (photoUrl: string, fileName: string) => void;
  onPhotoRemoved: (fileName: string) => void;
  uploadedPhotos: Array<{ url: string; fileName: string }>;
  maxPhotos?: number;
  label?: string;
}

export function CameraUpload({ 
  onPhotoUploaded, 
  onPhotoRemoved, 
  uploadedPhotos = [], 
  maxPhotos = 5,
  label = "Foto Bukti Pengantaran"
}: CameraUploadProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewImages, setPreviewImages] = useState<CompressedImage[]>([]);

  const handleCameraCapture = async () => {
    try {
      setIsUploading(true);
      
      // Capture from camera
      const cameraFile = await captureFromCamera();
      
      // Validate file
      const validationError = validateImageFile(cameraFile);
      if (validationError) {
        toast({
          variant: "destructive",
          title: "Error",
          description: validationError
        });
        return;
      }

      // Compress image
      const compressed = await compressImage(cameraFile, 100);
      
      toast({
        title: "Foto diambil!",
        description: `Ukuran: ${compressed.size.toFixed(1)}KB`
      });

      // Upload to Google Drive
      await uploadToGoogleDrive(compressed);
      
    } catch (error) {
      console.error('Camera capture failed:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal mengambil foto dari kamera"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    
    for (const file of files) {
      if (uploadedPhotos.length >= maxPhotos) {
        toast({
          variant: "destructive",
          title: "Batas maksimal",
          description: `Maksimal ${maxPhotos} foto`
        });
        break;
      }

      try {
        setIsUploading(true);

        // Validate file
        const validationError = validateImageFile(file);
        if (validationError) {
          toast({
            variant: "destructive",
            title: "Error",
            description: validationError
          });
          continue;
        }

        // Compress image
        const compressed = await compressImage(file, 100);
        
        // Generate unique filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `delivery-${timestamp}-${file.name}`;
        
        // Upload to Google Drive
        const result = await uploadToDrive(compressed.file, fileName);
        
        if (!result) {
          throw new Error('Gagal mengupload ke Google Drive. Periksa konfigurasi di pengaturan.');
        }
        
        // Notify parent component
        onPhotoUploaded(result.webViewLink, fileName);
        
        toast({
          title: "Upload berhasil!",
          description: `Foto tersimpan di Google Drive (${compressed.size.toFixed(1)}KB)`
        });

      } catch (error) {
        console.error('File upload failed:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: `Gagal upload ${file.name}`
        });
      }
    }
    
    setIsUploading(false);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };


  const handleRemovePhoto = (fileName: string) => {
    onPhotoRemoved(fileName);
    toast({
      title: "Foto dihapus",
      description: "Foto berhasil dihapus dari daftar"
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        <span className="text-xs text-muted-foreground">
          {uploadedPhotos.length}/{maxPhotos} foto
        </span>
      </div>

      {/* Upload Buttons */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleCameraCapture}
          disabled={isUploading || uploadedPhotos.length >= maxPhotos}
          className="flex-1"
        >
          {isUploading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Camera className="h-4 w-4 mr-2" />
          )}
          Ambil Foto
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading || uploadedPhotos.length >= maxPhotos}
          className="flex-1"
        >
          <Upload className="h-4 w-4 mr-2" />
          Pilih File
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Uploaded Photos Preview */}
      {uploadedPhotos.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {uploadedPhotos.map((photo, index) => (
            <Card key={index} className="relative">
              <CardContent className="p-2">
                <div className="aspect-video bg-muted rounded flex items-center justify-center relative">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="absolute top-1 right-1 h-6 w-6 p-0"
                    onClick={() => handleRemovePhoto(photo.fileName)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-xs text-center mt-1 truncate">
                  {photo.fileName}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Upload Status */}
      {isUploading && (
        <div className="flex items-center justify-center p-4 bg-muted rounded">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          <span className="text-sm">Mengupload foto...</span>
        </div>
      )}

      {/* Info */}
      <div className="text-xs text-muted-foreground">
        • Foto akan otomatis dikompres maksimal 100KB<br/>
        • Gunakan tombol "Ambil Foto" untuk akses kamera<br/>
        • Maksimal {maxPhotos} foto per pengantaran
      </div>
    </div>
  );
}