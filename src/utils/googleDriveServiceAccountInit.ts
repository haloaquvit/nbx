import { googleDriveServiceAccount, ServiceAccountConfig } from '@/services/googleDriveServiceAccount';

/**
 * Initialize Google Drive Service Account with settings from localStorage
 * @returns Promise<boolean> - true if initialized successfully
 */
export async function initializeGoogleDriveServiceAccount(): Promise<boolean> {
  try {
    // Load config from localStorage (set by ServiceAccountSettings component)
    const savedConfig = localStorage.getItem('googleDriveServiceAccountConfig');
    if (!savedConfig) {
      console.warn('Google Drive Service Account configuration not found in settings.');
      return false;
    }

    const config: ServiceAccountConfig = JSON.parse(savedConfig);
    
    if (!config.privateKey || !config.clientEmail) {
      console.warn('Google Drive Service Account Private Key or Client Email is missing.');
      return false;
    }

    // Initialize the service
    googleDriveServiceAccount.initialize(config);
    
    return true;
  } catch (error) {
    console.error('Failed to initialize Google Drive Service Account:', error);
    return false;
  }
}

/**
 * Upload file to Google Drive using Service Account with error handling
 * @param file - File to upload
 * @param fileName - Name for the uploaded file
 * @returns Promise<{id: string, webViewLink: string} | null>
 */
export async function uploadToGoogleDriveServiceAccount(file: File, fileName: string): Promise<{id: string, webViewLink: string} | null> {
  try {
    const initialized = await initializeGoogleDriveServiceAccount();
    if (!initialized) {
      throw new Error('Google Drive Service Account tidak terkonfigurasi. Silakan konfigurasi di halaman pengaturan.');
    }

    const result = await googleDriveServiceAccount.uploadFile(file, fileName);
    return result;
  } catch (error) {
    console.error('Google Drive Service Account upload failed:', error);
    throw error;
  }
}

/**
 * Get the configured Google Drive folder ID for Service Account
 * @returns string | null - Folder ID or null if not configured
 */
export function getServiceAccountGoogleDriveFolderId(): string | null {
  try {
    const savedConfig = localStorage.getItem('googleDriveServiceAccountConfig');
    if (!savedConfig) return null;

    const config = JSON.parse(savedConfig);
    return config.folderId || null;
  } catch (error) {
    console.error('Failed to get Google Drive Service Account folder ID:', error);
    return null;
  }
}