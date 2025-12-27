import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor Config for Nabire (default)
 *
 * APK will load from live URL - no need to rebuild APK for web updates!
 *
 * For Manokwari build:
 * 1. Change url to 'https://mkw.aquvit.id'
 * 2. Run: npx cap sync android
 * 3. Build APK in Android Studio
 *
 * Or use the batch files:
 * - android/build_nabire.bat
 * - android/build_manokwari.bat
 */
const config: CapacitorConfig = {
  appId: 'id.aquvit.app',
  appName: 'Aquvit ERP',
  webDir: 'dist',
  server: {
    url: 'https://mkw.aquvit.id', // Live server URL - change to nbx.aquvit.id for Nabire
    androidScheme: 'https',
    cleartext: false
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: true
  }
};

export default config;
