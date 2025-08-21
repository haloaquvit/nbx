interface GoogleDriveConfig {
  apiKey: string;
  clientId: string;
  folderId?: string;
}

class GoogleDriveService {
  private config: GoogleDriveConfig | null = null;
  private isInitialized = false;

  async initialize(config: GoogleDriveConfig): Promise<void> {
    this.config = config;
    
    // Load Google APIs
    await this.loadGoogleApis();
    
    // Initialize gapi
    await new Promise<void>((resolve, reject) => {
      window.gapi.load('auth2:client', async () => {
        try {
          await window.gapi.client.init({
            apiKey: config.apiKey,
            clientId: config.clientId,
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
            scope: 'https://www.googleapis.com/auth/drive.file'
          });
          
          this.isInitialized = true;
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  private async loadGoogleApis(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.gapi) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google APIs'));
      document.head.appendChild(script);
    });
  }

  async signIn(): Promise<boolean> {
    if (!this.isInitialized) {
      throw new Error('Google Drive service not initialized');
    }

    const authInstance = window.gapi.auth2.getAuthInstance();
    const user = await authInstance.signIn();
    return user.isSignedIn();
  }

  async uploadFile(file: File, fileName: string, folderId?: string): Promise<{ id: string; webViewLink: string }> {
    if (!this.isInitialized) {
      throw new Error('Google Drive service not initialized');
    }

    const authInstance = window.gapi.auth2.getAuthInstance();
    if (!authInstance.isSignedIn.get()) {
      await this.signIn();
    }

    const metadata = {
      name: fileName,
      parents: folderId ? [folderId] : this.config?.folderId ? [this.config.folderId] : undefined
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authInstance.currentUser.get().getAuthResponse().access_token}`
      },
      body: form
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const result = await response.json();
    
    // Make file publicly viewable
    try {
      await window.gapi.client.drive.permissions.create({
        fileId: result.id,
        resource: {
          role: 'reader',
          type: 'anyone'
        }
      });
    } catch (permissionError) {
      console.warn('Could not set public permissions for file:', permissionError);
    }
    
    return {
      id: result.id,
      webViewLink: result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`
    };
  }

  async getFileUrl(fileId: string): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Google Drive service not initialized');
    }

    // Make file publicly viewable
    await window.gapi.client.drive.permissions.create({
      fileId: fileId,
      resource: {
        role: 'reader',
        type: 'anyone'
      }
    });

    return `https://drive.google.com/file/d/${fileId}/view`;
  }

  async deleteFile(fileId: string): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Google Drive service not initialized');
    }

    await window.gapi.client.drive.files.delete({
      fileId: fileId
    });
  }

  isSignedIn(): boolean {
    if (!this.isInitialized) return false;
    
    const authInstance = window.gapi.auth2.getAuthInstance();
    return authInstance.isSignedIn.get();
  }
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    gapi: any;
  }
}

export const googleDriveService = new GoogleDriveService();
export type { GoogleDriveConfig };