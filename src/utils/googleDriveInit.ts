import { googleDriveService, GoogleDriveConfig } from '@/services/googleDriveService';

/**
 * Initialize Google Drive service with settings from localStorage
 * @returns Promise<boolean> - true if initialized successfully
 */
export async function initializeGoogleDrive(): Promise<boolean> {
  try {
    // Load config from localStorage (set by GoogleDriveSettings component)
    const savedConfig = localStorage.getItem('googleDriveConfig');
    if (!savedConfig) {
      console.warn('Google Drive configuration not found in settings. Please configure Google Drive API in settings.');
      return false;
    }

    const config: GoogleDriveConfig = JSON.parse(savedConfig);
    
    if (!config.apiKey || !config.clientId) {
      console.warn('Google Drive API Key or Client ID is missing. Please configure in settings.');
      return false;
    }

    // Initialize the service
    await googleDriveService.initialize(config);
    
    return true;
  } catch (error) {
    console.error('Failed to initialize Google Drive service:', error);
    return false;
  }
}

/**
 * Ensure Google Drive is initialized before upload
 * @returns Promise<boolean> - true if ready for upload
 */
export async function ensureGoogleDriveReady(): Promise<boolean> {
  try {
    // Check if already initialized and signed in
    if (googleDriveService.isSignedIn()) {
      return true;
    }

    // Try to initialize
    const initialized = await initializeGoogleDrive();
    if (!initialized) {
      return false;
    }

    // Try to sign in
    const signedIn = await googleDriveService.signIn();
    return signedIn;
  } catch (error) {
    console.error('Failed to ensure Google Drive is ready:', error);
    return false;
  }
}

/**
 * Upload file to Google Drive with error handling
 * @param file - File to upload
 * @param fileName - Name for the uploaded file
 * @returns Promise<{id: string, webViewLink: string} | null>
 */
export async function uploadToGoogleDrive(file: File, fileName: string): Promise<{id: string, webViewLink: string} | null> {
  try {
    const ready = await ensureGoogleDriveReady();
    if (!ready) {
      throw new Error('Google Drive tidak terkonfigurasi. Silakan konfigurasi di halaman pengaturan.');
    }

    const result = await googleDriveService.uploadFile(file, fileName);
    return result;
  } catch (error) {
    console.error('Google Drive upload failed:', error);
    throw error;
  }
}

/**
 * Get the configured Google Drive folder ID
 * @returns string | null - Folder ID or null if not configured
 */
export function getGoogleDriveFolderId(): string | null {
  try {
    const savedConfig = localStorage.getItem('googleDriveConfig');
    if (!savedConfig) return null;

    const config = JSON.parse(savedConfig);
    return config.folderId || null;
  } catch (error) {
    console.error('Failed to get Google Drive folder ID:', error);
    return null;
  }
}