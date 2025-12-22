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

function getTenantConfig(): TenantConfig {
  // Auto-detect base URL from current domain or selected server
  let baseUrl: string;

  if (typeof window !== 'undefined') {
    if (isCapacitorApp()) {
      // Capacitor/mobile app - use selected server
      // If no server selected, use a placeholder (App.tsx will show selector first)
      const selectedUrl = getSelectedServerUrl();
      baseUrl = selectedUrl || 'https://app.aquvit.id'; // Placeholder, won't be used if selector shown
    } else {
      // Web browser - use current origin (app.aquvit.id or erp.aquvit.id)
      baseUrl = window.location.origin;
    }
  } else {
    // SSR fallback
    baseUrl = 'https://app.aquvit.id';
  }

  return {
    supabaseUrl: baseUrl,
    supabaseAnonKey: ANON_JWT, // Valid JWT for anon role
    authUrl: `${baseUrl}/auth`,
    isPostgREST: true,
  };
}

const config = getTenantConfig();

// Create Supabase-compatible client for PostgREST
// Custom fetch injects JWT token to every request
export const supabase: SupabaseClient = createClient(
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
      // Custom fetch to inject JWT token
      fetch: (url: RequestInfo | URL, options?: RequestInit) => {
        const finalUrl = url.toString();
        const token = getPostgRESTToken();

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

// Export config for use in auth context
export const tenantConfig = config;
export const isPostgRESTMode = true; // Always true now