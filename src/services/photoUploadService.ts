// Frontend service untuk upload foto ke VPS server
export interface PhotoUploadResult {
  id: string;
  name: string;
  webViewLink: string;
  filename?: string;
  category?: string;
}

// Default VPS settings - now using HTTPS with domain
const DEFAULT_UPLOAD_URL = 'https://upload.aquvit.id';
const VPS_SETTINGS_KEY = 'aquvit_vps_settings';

// Helper to get VPS settings from localStorage
function getVPSConfig(): { baseUrl: string } {
  try {
    const saved = localStorage.getItem(VPS_SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Support legacy format (serverUrl + port) or new format (baseUrl)
      if (parsed.baseUrl) {
        return { baseUrl: parsed.baseUrl };
      } else if (parsed.serverUrl) {
        // Legacy format - convert to new format
        const port = parsed.port || '3001';
        return { baseUrl: `http://${parsed.serverUrl}:${port}` };
      }
    }
  } catch (error) {
    console.warn('Failed to load VPS settings from localStorage:', error);
  }
  return { baseUrl: DEFAULT_UPLOAD_URL };
}

export class PhotoUploadService {
  /**
   * Get the base VPS URL from settings
   */
  private static getBaseUrl(): string {
    const config = getVPSConfig();
    return config.baseUrl;
  }

  /**
   * Get the files URL
   */
  private static getFilesUrl(): string {
    return `${this.getBaseUrl()}/files`;
  }

  /**
   * Get the upload endpoint URL
   */
  private static getUploadUrl(): string {
    return `${this.getBaseUrl()}/upload`;
  }

  /**
   * Update VPS configuration (called from settings page)
   * @param baseUrl - Full base URL (e.g., https://upload.aquvit.id)
   */
  static updateConfig(baseUrl: string): void {
    try {
      localStorage.setItem(VPS_SETTINGS_KEY, JSON.stringify({ baseUrl }));
      console.log(`VPS config updated: ${baseUrl}`);
    } catch (error) {
      console.error('Failed to update VPS config:', error);
    }
  }

  /**
   * Upload foto pelanggan ke VPS server
   * @param file - File foto yang akan diupload
   * @param customerName - Nama pelanggan untuk penamaan file
   * @param category - Kategori folder (default: Customers_Images)
   * @returns Promise dengan result upload
   */
  static async uploadPhoto(file: File, customerName: string, category: string = 'customers'): Promise<PhotoUploadResult> {
    try {
      console.log('🔄 Uploading photo to VPS server...');

      // Prepare form data
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', category);

      // Clean filename: replace special characters with hyphens
      const cleanName = customerName.replace(/[^\w\s-]/gi, '').replace(/\s+/g, '-').toLowerCase();
      const timestamp = Date.now();
      const extension = file.name.split('.').pop() || 'jpg';
      const filename = `${cleanName}-${timestamp}.${extension}`;
      formData.append('filename', filename);

      // Call VPS upload server
      const uploadUrl = this.getUploadUrl();
      console.log(`Uploading to: ${uploadUrl}`);

      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Upload failed: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Upload failed');
      }

      console.log('✅ Photo uploaded successfully:', result);

      // Return format compatible with existing code
      const finalFilename = result.filename || filename;
      const fileUrl = `${this.getFilesUrl()}/${category}/${finalFilename}`;

      return {
        id: finalFilename,
        name: finalFilename,
        webViewLink: fileUrl,
        filename: finalFilename,
        category: category
      };

    } catch (error: any) {
      console.error('❌ Photo upload failed:', error);
      throw new Error(`Photo upload failed: ${error.message}`);
    }
  }

  /**
   * Get photo URL from VPS
   * @param filename - Nama file foto (hanya filename, tanpa path)
   * @param category - Kategori folder (customers, deliveries, dll)
   * @returns URL foto lengkap
   */
  static getPhotoUrl(filename: string, category: string = 'customers'): string {
    if (!filename) return '';

    // Jika sudah berupa URL lengkap, kembalikan apa adanya
    if (filename.startsWith('http://') || filename.startsWith('https://')) {
      return filename;
    }

    // Jika filename mengandung path (legacy data), ambil hanya filename-nya
    if (filename.includes('/')) {
      const parts = filename.split('/');
      filename = parts[parts.length - 1];
    }

    // Normalize category name - map legacy names to actual VPS folder names
    const categoryMap: Record<string, string> = {
      'Customers_Images': 'customers',
      'Customers': 'customers',
      'Customer_Images': 'customers'
    };
    const normalizedCategory = categoryMap[category] || category;

    // Generate URL: baseUrl/files/category/filename
    return `${this.getFilesUrl()}/${normalizedCategory}/${filename}`;
  }

  /**
   * Check if VPS upload service is available
   * @returns Promise<boolean> - true if service is available
   */
  static async isServiceAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.getBaseUrl()}/health`, {
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch (error) {
      console.warn('VPS photo upload service not available:', error);
      return false;
    }
  }

  /**
   * Delete photo from VPS
   * @param filename - Nama file foto
   * @param category - Kategori folder
   * @returns Promise<boolean>
   */
  static async deletePhoto(filename: string, category: string = 'customers'): Promise<boolean> {
    try {
      const response = await fetch(`${this.getBaseUrl()}/files/${category}/${filename}`, {
        method: 'DELETE',
      });
      return response.ok;
    } catch (error) {
      console.error('Failed to delete photo:', error);
      return false;
    }
  }

  /**
   * Get current VPS configuration
   * @returns Current VPS URL configuration
   */
  static getCurrentConfig(): { baseUrl: string; filesUrl: string } {
    return {
      baseUrl: this.getBaseUrl(),
      filesUrl: this.getFilesUrl()
    };
  }
}
