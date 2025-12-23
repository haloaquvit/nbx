// PostgREST client - Full SQL mode (no Supabase)
// Menggunakan PostgreSQL VPS dengan PostgREST + Custom Auth
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';

// Tenant configuration
interface TenantConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  authUrl: string;
  isPostgREST: boolean;
}

const STORAGE_KEY = 'postgrest_auth_session';
const SERVER_STORAGE_KEY = 'aquvit_selected_server';

// Server configurations
const SERVERS: Record<string, string> = {
  'nabire': 'https://app.aquvit.id',
  'manokwari': 'https://erp.aquvit.id',
};

// Helper to get JWT token from localStorage
function getPostgRESTToken(): string | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const session = JSON.parse(stored);
      // Check if token is expired
      const tokenParts = session.access_token?.split('.');
      if (tokenParts?.length === 3) {
        const payload = JSON.parse(atob(tokenParts[1]));
        if (payload.exp * 1000 > Date.now()) {
          return session.access_token;
        }
      }
    }
  } catch (e) {
    console.error('Error reading PostgREST token:', e);
  }
  return null;
}

// Valid anon JWT for PostgREST (expires in 100 years)
const ANON_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImF1ZCI6ImFub24iLCJpYXQiOjE3NjYzMzM3MjgsImV4cCI6NDkyMjA5MzcyOH0.3N0XiX6YWpWpli3TuKsVx1eV0IoqXsb9_z8CER_1bR8';

// Check if running in Capacitor/mobile app
function isCapacitorApp(): boolean {
  // Multiple detection methods for reliability
  try {
    // Method 1: Capacitor native detection
    if (Capacitor.isNativePlatform()) {
      return true;
    }
    // Method 2: Check platform
    const platform = Capacitor.getPlatform();
    if (platform === 'android' || platform === 'ios') {
      return true;
    }
  } catch (e) {
    // Capacitor not available
  }

  // Method 3: Check URL scheme (capacitor:// or file://)
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    if (protocol === 'capacitor:' || protocol === 'file:') {
      return true;
    }
    // Method 4: Check if running from localhost with capacitor user agent
    if (window.location.hostname === 'localhost' &&
        navigator.userAgent.toLowerCase().includes('android')) {
      return true;
    }
  }

  return false;
}

// Get selected server from localStorage (for Capacitor app)
function getSelectedServerUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const serverId = localStorage.getItem(SERVER_STORAGE_KEY);
  if (serverId && SERVERS[serverId]) {
    return SERVERS[serverId];
  }
  return null;
}

// Check if server is selected (for Capacitor app)
// IMPORTANT: Returns false if in Capacitor and no server selected yet
export function isServerSelected(): boolean {
  if (!isCapacitorApp()) return true; // Web always has server from origin
  return getSelectedServerUrl() !== null;
}

// Get current server URL - returns null if in Capacitor and no server selected
export function getCurrentServerUrl(): string | null {
  if (typeof window === 'undefined') return null;

  if (isCapacitorApp()) {
    // In Capacitor app, return null if no server selected (to show selector)
    return getSelectedServerUrl(); // Can be null!
  } else {
    // In web browser, use current origin
    return window.location.origin;
  }
}

// Get the base URL for API calls - works for both web and APK
function getBaseUrl(): string {
  if (typeof window === 'undefined') return 'https://app.aquvit.id';

  // Check if we're on a production domain (web browser)
  const origin = window.location.origin;
  if (origin.includes('app.aquvit.id') || origin.includes('erp.aquvit.id')) {
    return origin;
  }

  // For Capacitor/APK, use selected server from localStorage
  if (isCapacitorApp()) {
    const selectedUrl = getSelectedServerUrl();
    if (selectedUrl) {
      return selectedUrl;
    }
    // No server selected yet - return empty to trigger server selector
    return '';
  }

  // For localhost/development, always use Nabire server
  return 'https://app.aquvit.id';
}

function getTenantConfig(): TenantConfig {
  const baseUrl = getBaseUrl();

  return {
    supabaseUrl: baseUrl,
    supabaseAnonKey: ANON_JWT, // Valid JWT for anon role
    authUrl: `${baseUrl}/auth`,
    isPostgREST: true,
  };
}

// Create Supabase-compatible client for PostgREST
// Custom fetch dynamically uses the selected server URL
function createSupabaseClient(): SupabaseClient {
  const config = getTenantConfig();

  return createClient(
    config.supabaseUrl,
    config.supabaseAnonKey,
    {
      auth: {
        persistSession: false, // We handle session ourselves
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        // Custom fetch to inject JWT token AND use dynamic base URL
        fetch: (url: RequestInfo | URL, options?: RequestInit) => {
          let finalUrl = url.toString();
          const token = getPostgRESTToken();

          // For APK: replace the base URL with the selected server
          // This is needed because supabase client is initialized once
          const currentBaseUrl = getBaseUrl();
          if (!finalUrl.startsWith(currentBaseUrl)) {
            // URL might be using old base URL, replace it
            const urlObj = new URL(finalUrl);
            const newBaseUrl = new URL(currentBaseUrl);
            urlObj.protocol = newBaseUrl.protocol;
            urlObj.host = newBaseUrl.host;
            finalUrl = urlObj.toString();
          }

          // Fix: Remove 'columns' parameter that causes 404 on PostgREST
          // Supabase JS v2.52+ sends columns with quoted values which PostgREST doesn't accept
          try {
            const urlObj = new URL(finalUrl);
            if (urlObj.searchParams.has('columns')) {
              urlObj.searchParams.delete('columns');
              finalUrl = urlObj.toString();
            }
          } catch (e) {
            // URL parsing failed, continue with original URL
          }

          // Merge headers with Authorization if we have a token
          const headers = new Headers(options?.headers);
          if (token && !headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${token}`);
          }

          return fetch(finalUrl, {
            ...options,
            headers,
          });
        },
      },
    }
  );
}

export const supabase: SupabaseClient = createSupabaseClient();

// Export config getter for use in auth context (dynamic)
export function getTenantConfigDynamic(): TenantConfig {
  return getTenantConfig();
}

// Legacy export for compatibility
export const tenantConfig = getTenantConfig();
export const isPostgRESTMode = true; // Always true now