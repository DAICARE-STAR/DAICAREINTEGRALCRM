import { createClient } from '@supabase/supabase-js'
import { esClaveSecreta } from './clave-supabase'

// Una variable vacía (VITE_SUPABASE_URL= en el .env o en Netlify) cuenta como
// ausente: con '' el cliente lanzaba al crearse y la app no llegaba al aviso
// de configuración pendiente.
const valor = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const url = valor(import.meta.env.VITE_SUPABASE_URL)
// Una clave secreta nunca se usa en el navegador (ver clave-supabase.ts)
const claveLeida = valor(import.meta.env.VITE_SUPABASE_ANON_KEY)
const anonKey = esClaveSecreta(claveLeida) ? undefined : claveLeida

// El build descartó una clave secreta pegada en la variable pública
export const claveSecretaDescartada = (typeof __CLAVE_SECRETA_DESCARTADA__ !== 'undefined' && __CLAVE_SECRETA_DESCARTADA__) || esClaveSecreta(claveLeida)

export const supabaseConfigured = Boolean(url && anonKey)

// Con placeholders el cliente se crea igual y la app puede renderizar
// la pantalla de login con el aviso de configuración pendiente.
export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-anon-key'
)
