import { GRUPOS } from './widgets'

// Preferencia personal del Inicio, por navegador: qué widgets oculta cada
// quien y en qué orden los ve. Lo que existe, para qué roles y en qué orden
// base lo decide Administración → Widgets (portal_widgets). Lógica pura:
// src/lib/__tests__/widgetsPrefs.test.ts.
//
// v1 (hasta 1.11) era solo un mapa de ocultos { id: true }; v2 (1.11.13)
// guardaba el orden dentro de cada grupo; v3 (1.11.24) guarda el orden
// global que la persona arma arrastrando. No hay migración automática: un
// v2 (o nada) se sigue leyendo por grupo, con el orden del administrador
// para lo que nunca se movió, y v3 nace la primera vez que la persona
// acomoda una tarjeta. Desde ahí el orden del administrador ya no aplica a
// esa persona. Las versiones viejas no se borran (otra pestaña con la
// versión anterior sigue funcionando).

export const CLAVE_V3 = 'pt_widgets_v3'
export const CLAVE_V2 = 'pt_widgets_v2'
export const CLAVE_V1 = 'pt_widgets_v1'

// Solo para quien no tiene preferencia guardada: Referencia (contexto del
// día), Mi trabajo, Comercial y Leads visibles; lo que exige permisos
// especiales, oculto. Quien ya guardó preferencia conserva sus ocultos.
export const POR_DEFECTO_OCULTOS: readonly string[] = ['facturacion', 'analitica']

export interface PrefsWidgets {
  ocultos: string[]
  orden: string[]
}

/** Lo leído y de qué versión salió: con menos de 3, `orden` es por grupo. */
export interface LecturaPrefs extends PrefsWidgets {
  version: 0 | 1 | 2 | 3
}

function listaDeIds(v: unknown, conocidos: ReadonlySet<string>): string[] | null {
  if (!Array.isArray(v)) return null
  return [...new Set(v.filter((x): x is string => typeof x === 'string' && conocidos.has(x)))]
}

function parsear(raw: string | null): unknown {
  if (raw === null) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function leerObjeto(raw: string | null, ids: ReadonlySet<string>): PrefsWidgets | null {
  const v = parsear(raw)
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as { ocultos?: unknown; orden?: unknown }
  const ocultos = listaDeIds(o.ocultos, ids)
  const orden = listaDeIds(o.orden, ids)
  return ocultos && orden ? { ocultos, orden } : null
}

/**
 * Preferencia efectiva a partir de lo guardado. v3 manda; luego v2 (su
 * orden es por grupo, ver `ordenEfectivo`); luego v1; sin ninguna, los
 * ocultos por defecto. Los ids que el código ya no conoce (p. ej.
 * 'conversion') se descartan.
 */
export function leerPrefs(
  rawV3: string | null,
  rawV2: string | null,
  rawV1: string | null,
  conocidos: readonly string[]
): LecturaPrefs {
  const ids = new Set(conocidos)
  const v3 = leerObjeto(rawV3, ids)
  if (v3) return { ...v3, version: 3 }
  const v2 = leerObjeto(rawV2, ids)
  if (v2) return { ...v2, version: 2 }
  if (rawV1 !== null) {
    const v1 = parsear(rawV1)
    // Un v1 ilegible equivalía a «nada oculto»: se conserva ese criterio
    const mapa =
      v1 && typeof v1 === 'object' && !Array.isArray(v1) ? (v1 as Record<string, unknown>) : {}
    return {
      ocultos: Object.keys(mapa).filter((id) => mapa[id] === true && ids.has(id)),
      orden: [],
      version: 1,
    }
  }
  return { ocultos: POR_DEFECTO_OCULTOS.filter((id) => ids.has(id)), orden: [], version: 0 }
}

export function serializar(prefs: PrefsWidgets): string {
  return JSON.stringify({ ocultos: prefs.ocultos, orden: prefs.orden })
}

/** Oculta o vuelve a mostrar un widget. */
export function alternar(prefs: PrefsWidgets, id: string): PrefsWidgets {
  const ocultos = prefs.ocultos.includes(id)
    ? prefs.ocultos.filter((x) => x !== id)
    : [...prefs.ocultos, id]
  return { ...prefs, ocultos }
}

/**
 * Orden por defecto y el de v2: por grupo (en el orden de GRUPOS) y, dentro
 * del grupo, el orden personal; los que la persona nunca movió van detrás,
 * en el orden del administrador (el de `disponibles`).
 */
export function ordenarPorGrupo<T extends { id: string; grupo: string }>(
  disponibles: readonly T[],
  orden: readonly string[]
): T[] {
  const pos = new Map(orden.map((id, i) => [id, i]))
  const grupo = (g: string) => {
    const i = (GRUPOS as readonly string[]).indexOf(g)
    return i < 0 ? GRUPOS.length : i
  }
  return disponibles
    .map((w, i) => ({ w, i }))
    .sort((a, b) => {
      const g = grupo(a.w.grupo) - grupo(b.w.grupo)
      if (g !== 0) return g
      const pa = pos.get(a.w.id) ?? Number.POSITIVE_INFINITY
      const pb = pos.get(b.w.id) ?? Number.POSITIVE_INFINITY
      if (pa !== pb) return pa - pb
      return a.i - b.i
    })
    .map((x) => x.w)
}

/**
 * Orden de pintado (v3): primero los que tienen posición personal, en ese
 * orden; detrás, los que nunca se movieron (widgets nuevos), en el orden
 * por defecto. Los ids de `orden` que no están disponibles se ignoran.
 */
export function ordenar<T extends { id: string; grupo: string }>(
  disponibles: readonly T[],
  orden: readonly string[]
): T[] {
  const porId = new Map(disponibles.map((w) => [w.id, w]))
  const conPosicion = orden.flatMap((id) => {
    const w = porId.get(id)
    return w ? [w] : []
  })
  const puestos = new Set(conPosicion.map((w) => w.id))
  const resto = ordenarPorGrupo(
    disponibles.filter((w) => !puestos.has(w.id)),
    []
  )
  return [...conPosicion, ...resto]
}

/**
 * Orden en pantalla según la versión: v3 es el orden global de la persona;
 * con menos, el de su grupo (v2) sobre el del administrador. Se calcula en
 * cada render con lo disponible en ese momento: si el perfil o la
 * configuración llegan después, el orden se corrige solo.
 */
export function ordenEfectivo<T extends { id: string; grupo: string }>(
  disponibles: readonly T[],
  prefs: { orden: readonly string[]; version?: number }
): T[] {
  return prefs.version === 3 ? ordenar(disponibles, prefs.orden) : ordenarPorGrupo(disponibles, prefs.orden)
}

/**
 * Widgets de media columna que quedarían solos en su fila de la grilla de
 * dos columnas (sin dense): el que va justo antes de uno ancho o el último.
 * Esos se pintan a lo ancho para no dejar el hueco, sin tocar el orden.
 * `enPantalla` va en el orden de pantalla y solo con las tarjetas pintadas.
 */
export function mediasSolas(enPantalla: readonly { id: string; ancho: boolean }[]): string[] {
  const solas: string[] = []
  let abierta: string | null = null
  for (const w of enPantalla) {
    if (w.ancho) {
      if (abierta) solas.push(abierta)
      abierta = null
    } else {
      abierta = abierta ? null : w.id
    }
  }
  if (abierta) solas.push(abierta)
  return solas
}

/**
 * Lleva `id` a la posición `destino` entre los visibles. `efectivo` es la
 * lista completa (visibles y ocultos) en su orden actual; los ocultos
 * conservan su sitio y los visibles se reacomodan en los huecos que dejan.
 * Devuelve el orden personal nuevo, completo; con un id ajeno no cambia.
 */
export function reubicar(
  efectivo: readonly string[],
  visibles: readonly string[],
  id: string,
  destino: number
): string[] {
  if (!visibles.includes(id)) return [...efectivo]
  const sin = visibles.filter((x) => x !== id)
  const j = Math.max(0, Math.min(destino, sin.length))
  const nuevos = [...sin.slice(0, j), id, ...sin.slice(j)]
  const esVisible = new Set(visibles)
  let k = 0
  return efectivo.map((x) => (esVisible.has(x) ? nuevos[k++] : x))
}
