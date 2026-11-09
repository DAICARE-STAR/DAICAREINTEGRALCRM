import type { SupabaseClient } from '@supabase/supabase-js'
import { NUCLEO } from '../../src/lib/modulos.ts'

// Módulos de la instalación vistos desde las funciones (N-6). Se leen con el
// cliente service role (modulos_instalacion no tiene escritura para la API)
// y se cachean 60 s por instancia, como antes las apps. null = no se pudo
// leer: quien llama deniega o se salta lo de módulo (falla cerrado).

export type FilaModulo = { slug: string; activo: boolean; limites: Record<string, unknown> }

const CACHE_MS = 60_000
let cache: { hasta: number; filas: FilaModulo[] } | null = null

export async function leerModulos(admin: SupabaseClient): Promise<FilaModulo[] | null> {
  if (cache && cache.hasta > Date.now()) return cache.filas
  try {
    const { data, error } = await admin.from('modulos_instalacion').select('slug, activo, limites')
    if (error || !data) {
      console.error('[seguridad] no se pudieron leer los módulos:', error?.code ?? null)
      return null
    }
    const filas = (data as FilaModulo[]).map((f) => ({
      slug: f.slug,
      activo: f.activo === true,
      limites: f.limites && typeof f.limites === 'object' && !Array.isArray(f.limites) ? f.limites : {},
    }))
    cache = { hasta: Date.now() + CACHE_MS, filas }
    return filas
  } catch {
    return null
  }
}

// Solo para las pruebas: cada una arranca sin caché
export function reiniciarCacheModulos(): void {
  cache = null
}

export function slugsActivos(filas: readonly FilaModulo[]): string[] {
  return [NUCLEO, ...filas.filter((f) => f.activo && f.slug !== NUCLEO).map((f) => f.slug)]
}

export function moduloActivo(filas: readonly FilaModulo[], slug: string): boolean {
  return slugsActivos(filas).includes(slug)
}

// Límite entero de un módulo, con la regla de limite_modulo() de 04: null =
// sin límite (la clave falta o no es un número); se trunca y nunca es negativo.
export function limiteDe(filas: readonly FilaModulo[], slug: string, clave: string): number | null {
  const v = filas.find((f) => f.slug === slug)?.limites[clave]
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  return Math.max(Math.floor(v), 0)
}
