import { useEffect, useRef, useState, type DependencyList } from 'react'

// Carga de los widgets del Inicio (patrón «cargado» de GUIA-UI.md):
// undefined = cargando (skeleton), null = sin datos, sin permiso o error
// (el widget se oculta). Además de lo que hacía cada widget a mano:
// · tiempo límite: una consulta colgada no deja el skeleton para siempre;
// · al volver a la pestaña (y como mucho una vez por minuto) se refresca
//   sin volver al skeleton, y un fallo del refresco no oculta lo que ya
//   se veía.

export const TIEMPO_LIMITE_MS = 12000
export const INTERVALO_REFRESCO_MS = 60000

/** null si la promesa no resuelve a tiempo o falla; el valor tardío se ignora. */
export function conTiempoLimite<T>(
  p: Promise<T | null>,
  ms: number = TIEMPO_LIMITE_MS
): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      () => {
        clearTimeout(t)
        resolve(null)
      }
    )
  })
}

/** ¿Toca refrescar? Nunca antes de la primera carga ni antes del mínimo. */
export function debeRefrescar(
  ultimaMs: number | null,
  ahoraMs: number,
  minimoMs: number = INTERVALO_REFRESCO_MS
): boolean {
  return ultimaMs !== null && ahoraMs - ultimaMs >= minimoMs
}

/**
 * `listo: false`: todavía no se sabe si cargar (el perfil no llegó) →
 * undefined sin consultar. `activo: false`: no corresponde (falta el
 * permiso) → null sin consultar.
 */
export function useWidgetData<T>(
  cargar: () => Promise<T | null>,
  deps: DependencyList,
  { listo = true, activo = true }: { listo?: boolean; activo?: boolean } = {}
): T | null | undefined {
  const [dato, setDato] = useState<T | null | undefined>(undefined)
  const cargarRef = useRef(cargar)
  const ultimaRef = useRef<number | null>(null)

  // La función más reciente, sin que su identidad dispare recargas
  useEffect(() => {
    cargarRef.current = cargar
  })

  useEffect(() => {
    if (!listo || !activo) return
    let vivo = true
    let enCurso = false

    const ejecutar = () => {
      const recarga = ultimaRef.current !== null
      enCurso = true
      void conTiempoLimite(cargarRef.current()).then((v) => {
        enCurso = false
        if (!vivo) return
        ultimaRef.current = Date.now()
        // En una recarga, un fallo conserva lo que ya se veía
        setDato((previo) => (recarga && v === null && previo != null ? previo : v))
      })
    }

    const alVolver = () => {
      if (document.visibilityState !== 'visible' || enCurso) return
      if (debeRefrescar(ultimaRef.current, Date.now())) ejecutar()
    }

    ejecutar()
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)
    return () => {
      vivo = false
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
    }
    // Las dependencias las fija quien llama; cargar va por ref
  }, [listo, activo, ...deps])

  // Sin perfil todavía no se sabe si hay permiso: skeleton, no un falso vacío
  if (!listo) return undefined
  if (!activo) return null
  return dato
}
