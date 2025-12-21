// PostgREST client - Full SQL mode (no Supabase)
// Menggunakan PostgreSQL VPS dengan PostgREST + Custom Auth
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Tenant configuration
interface TenantConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  authUrl: string;
  isPostgREST: boolean;
}

const STORAGE_KEY = 'postgrest_auth_session';

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

function getTenantConfig(): TenantConfig {
  // Always use PostgREST mode - pointing to VPS
  const baseUrl = 'https://app.aquvit.id';

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