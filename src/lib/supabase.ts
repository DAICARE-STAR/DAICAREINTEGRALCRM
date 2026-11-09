import { createClient } from '@supabase/supabase-js'

// Una variable vacía (VITE_SUPABASE_URL= en el .env o en Netlify) cuenta como
// ausente: con '' el cliente lanzaba al crearse y la app no llegaba al aviso
// de configuración pendiente.
const valor = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const url = valor(import.meta.env.VITE_SUPABASE_URL)
const anonKey = valor(import.meta.env.VITE_SUPABASE_ANON_KEY)

export const supabaseConfigured = Boolean(url && anonKey)

// Con placeholders el cliente se crea igual y la app puede renderizar
// la pantalla de login con el aviso de configuración pendiente.
export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-anon-key'
)
