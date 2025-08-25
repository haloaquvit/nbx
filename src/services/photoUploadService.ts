// Frontend service untuk upload foto via backend API (aman)
export interface PhotoUploadResult {
  id: string;
  name: string;
  webViewLink: string;
  parents?: string[];
}

export class PhotoUploadService {
  /**
   * Get the correct upload URL based on environment
   */
  private static getUploadUrl(): string {
    // Check if we're in production or development
    const isProduction = import.meta.env.PROD || window.location.hostname !== 'localhost';
    
    if (isProduction) {
      // Use Vercel API route in production
      return '/api/upload-photo';
    } else {
      // Use Express server in development
      return 'http://localhost:3001/upload-photo';
    }
  }

  /**
   * Upload foto delivery ke Google Drive via backend API
   * @param file - File foto yang akan diupload
   * @param transactionId - ID transaksi untuk penamaan file
   * @returns Promise dengan result upload
   */
  static async uploadPhoto(file: File, transactionId: string): Promise<PhotoUploadResult> {
    try {
      console.log('🔄 Uploading photo via backend API...');
      
      // Prepare form data
      const formData = new FormData();
      formData.append('photo', file);
      formData.append('transactionId', transactionId);

      // Call backend upload server (development) or Vercel API route (production)
      const uploadUrl = this.getUploadUrl();
      const response = await fetch(uploadUrl, {
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

      console.log('✅ Photo uploaded successfully:', result.data);
      return result.data;

    } catch (error: any) {
      console.error('❌ Photo upload failed:', error);
      throw new Error(`Photo upload failed: ${error.message}`);
    }
  }

  /**
   * Check if backend photo upload service is available
   * @returns Promise<boolean> - true if service is available
   */
  static async isServiceAvailable(): Promise<boolean> {
    try {
      const response = await fetch('http://localhost:3001/health');
      return response.ok;
    } catch (error) {
      console.warn('Backend photo upload service not available:', error);
      return false;
    }
  }
}