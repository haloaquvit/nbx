import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'id.aquvit.app',
  appName: 'Aquvit ERP',
  webDir: 'dist',
  server: {
    // Load from local assets first (for server selector)
    // Then navigate to selected server URL
    androidScheme: 'https',
    cleartext: false
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: true // Enable for debugging
  }
};

export default config;
