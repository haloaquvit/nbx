import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'id.aquvit.app',
  appName: 'Aquvit ERP',
  webDir: 'dist',
  server: {
    // Load web app from VPS (WebView wrapper mode)
    url: 'https://app.aquvit.id',
    androidScheme: 'https',
    cleartext: false
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false // Disable for production
  }
};

export default config;
