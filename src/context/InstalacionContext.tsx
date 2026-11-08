import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { estaActivo } from '../lib/modulos'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

// Datos de la instalación (tabla instalacion, fila única) y módulos activos
// (modulos_instalacion), leídos una vez por sesión. Los activos se guardan en
// pt_modulos_v1 para pintar el menú sin parpadeo mientras llega la lectura.
// Ante un error, nada de módulo queda activo (falla cerrado): las páginas de
// módulo muestran el error con Reintentar y el núcleo sigue usable. La base
// decide igual con has_modulo y las políticas modulo_*.

const CLAVE_CACHE = 'pt_modulos_v1'

export interface Instalacion {
  nombre: string
  nombre_corto: string
  rubro: string
  pais: string
  locale: string
  zona_horaria: string
  moneda_base: string
}

interface EstadoInstalacion {
  instalacion: Instalacion | null
  // Slugs activos (sin el núcleo, que siempre lo está)
  activos: string[]
  // Sin respuesta todavía y sin caché
  cargando: boolean
  error: string | null
  tieneModulo: (slug: string) => boolean
  reintentar: () => void
}

const InstalacionContext = createContext<EstadoInstalacion | undefined>(undefined)

function leerCache(): string[] | null {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(CLAVE_CACHE) ?? 'null')
    return Array.isArray(v) && v.every((s) => typeof s === 'string') ? v : null
  } catch {
    return null
  }
}

function guardarCache(activos: string[] | null) {
  try {
    if (activos) localStorage.setItem(CLAVE_CACHE, JSON.stringify(activos))
    else localStorage.removeItem(CLAVE_CACHE)
  } catch {
    /* sin almacenamiento: solo estado en memoria */
  }
}

export function InstalacionProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const uid = session?.user?.id ?? null
  const [instalacion, setInstalacion] = useState<Instalacion | null>(null)
  const [activos, setActivos] = useState<string[] | null>(leerCache)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    if (!uid) return
    let vivo = true
    void (async () => {
      const [inst, mods] = await Promise.all([
        supabase.from('instalacion').select('nombre, nombre_corto, rubro, pais, locale, zona_horaria, moneda_base').maybeSingle(),
        supabase.from('modulos_instalacion').select('slug, activo'),
      ])
      if (!vivo) return
      if (mods.error) {
        setActivos([])
        guardarCache(null)
        setError('No se pudieron leer los módulos de la instalación.')
        return
      }
      const lista = ((mods.data ?? []) as { slug: string; activo: boolean }[]).filter((m) => m.activo).map((m) => m.slug)
      setActivos(lista)
      guardarCache(lista)
      setInstalacion(inst.error ? null : ((inst.data as Instalacion | null) ?? null))
      setError(null)
    })()
    return () => {
      vivo = false
    }
  }, [uid, intento])

  const reintentar = useCallback(() => {
    // activos vuelve a null para que cargando sea true mientras llega la lectura
    setActivos(null)
    setError(null)
    setIntento((n) => n + 1)
  }, [])

  const lista = activos ?? []
  const valor: EstadoInstalacion = {
    instalacion,
    activos: lista,
    cargando: activos === null && !error,
    error,
    tieneModulo: (slug) => estaActivo(lista, slug),
    reintentar,
  }
  return <InstalacionContext.Provider value={valor}>{children}</InstalacionContext.Provider>
}

export function useInstalacion() {
  const ctx = useContext(InstalacionContext)
  if (!ctx) throw new Error('useInstalacion debe usarse dentro de InstalacionProvider')
  return ctx
}
