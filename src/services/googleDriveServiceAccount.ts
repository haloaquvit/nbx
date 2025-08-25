interface ServiceAccountConfig {
  privateKey: string;
  clientEmail: string;
  projectId: string;
  folderId?: string;
}

interface JWTHeader {
  alg: string;
  typ: string;
}

interface JWTPayload {
  iss: string;
  scope: string;
  aud: string;
  exp: number;
  iat: number;
}

class GoogleDriveServiceAccount {
  private config: ServiceAccountConfig | null = null;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  initialize(config: ServiceAccountConfig): void {
    this.config = config;
  }

  private base64UrlEncode(str: string): string {
    return btoa(str)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  private async importPrivateKey(privateKeyPem: string): Promise<CryptoKey> {
    try {
      // Remove PEM headers and newlines
      const pemHeader = '-----BEGIN PRIVATE KEY-----';
      const pemFooter = '-----END PRIVATE KEY-----';
      const pemContents = privateKeyPem
        .replace(pemHeader, '')
        .replace(pemFooter, '')
        .replace(/\s/g, '');

      // Convert base64 to binary
      const binaryDer = atob(pemContents);
      const binaryArray = new Uint8Array(binaryDer.length);
      for (let i = 0; i < binaryDer.length; i++) {
        binaryArray[i] = binaryDer.charCodeAt(i);
      }

      // Import the key
      return await crypto.subtle.importKey(
        'pkcs8',
        binaryArray,
        {
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-256',
        },
        false,
        ['sign']
      );
    } catch (error) {
      console.error('Failed to import private key:', error);
      throw new Error('Invalid private key format. Make sure it\'s a valid PKCS#8 PEM private key.');
    }
  }

  private async createJWT(): Promise<string> {
    if (!this.config) throw new Error('Service Account not configured');

    const header: JWTHeader = {
      alg: 'RS256',
      typ: 'JWT'
    };

    const now = Math.floor(Date.now() / 1000);
    const payload: JWTPayload = {
      iss: this.config.clientEmail,
      scope: 'https://www.googleapis.com/auth/drive.file',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600 // 1 hour
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;

    // Import private key and sign
    const privateKey = await this.importPrivateKey(this.config.privateKey);
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      privateKey,
      new TextEncoder().encode(unsignedToken)
    );

    const encodedSignature = this.base64UrlEncode(
      String.fromCharCode(...new Uint8Array(signature))
    );

    return `${unsignedToken}.${encodedSignature}`;
  }

  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && Date.now() < this.tokenExpiry - 60000) {
      return this.accessToken;
    }

    if (!this.config) throw new Error('Service Account not configured');

    try {
      const jwt = await this.createJWT();

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwt
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token request failed: ${response.status} ${errorText}`);
      }

      const tokenData = await response.json();
      this.accessToken = tokenData.access_token;
      this.tokenExpiry = Date.now() + (tokenData.expires_in * 1000);

      return this.accessToken;
    } catch (error) {
      console.error('Failed to get access token:', error);
      throw error;
    }
  }

  async uploadFile(file: File, fileName: string): Promise<{ id: string; webViewLink: string }> {
    if (!this.config) throw new Error('Service Account not configured');
    
    // WAJIB ada folder ID - Service Account tidak bisa upload ke root
    if (!this.config.folderId) {
      throw new Error('Folder ID wajib diisi! Service Account tidak bisa upload ke root Drive. Buat folder di Google Drive, share ke Service Account, dan masukkan Folder ID.');
    }

    const accessToken = await this.getAccessToken();

    const metadata = {
      name: fileName,
      parents: [this.config.folderId] // WAJIB set parents
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        body: form
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();

    // Make file publicly viewable
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${result.id}/permissions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          role: 'reader',
          type: 'anyone'
        })
      });
    } catch (permissionError) {
      console.warn('Could not set public permissions for file:', permissionError);
    }

    return {
      id: result.id,
      webViewLink: result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`
    };
  }

  async deleteFile(fileId: string): Promise<void> {
    if (!this.config) throw new Error('Service Account not configured');

    const accessToken = await this.getAccessToken();

    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Delete failed: ${response.statusText}`);
    }
  }

  isConfigured(): boolean {
    return this.config !== null;
  }
}

export const googleDriveServiceAccount = new GoogleDriveServiceAccount();
export type { ServiceAccountConfig };