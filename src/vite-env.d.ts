/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_PORTAL_NOMBRE?: string
  readonly VITE_VAPID_PUBLIC_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// La pone vite.config.ts: el build descartó una clave secreta de la variable pública
declare const __CLAVE_SECRETA_DESCARTADA__: boolean
