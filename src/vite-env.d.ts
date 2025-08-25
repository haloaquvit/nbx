/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_APPS_SCRIPT_URL: string
  readonly VITE_UPLOAD_SIGNATURE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
