// Consumo de los módulos para Administración → Módulos (N-4), en código
// puro: cruza el registro (src/lib/modulos.ts), las filas de
// modulos_instalacion y lo que devuelve modulos_consumo(). Sin DOM ni red.

import { MODULOS, moduloPorSlug, type Conector } from './modulos'

export type FilaBase = { slug: string; activo: boolean; limites: Record<string, unknown> | null }
// Respuesta de modulos_consumo(): cifras o null si su tabla aún no existe
export type Consumo = Record<string, number | null>

export type EstadoFila = 'activo' | 'inactivo' | 'planeado' | 'desconocido'

export type LimiteFila = { clave: string; limite: number | null; usado: number | null; porcentaje: number | null }

export type FilaModulo = {
  slug: string
  nombre: string
  estado: EstadoFila
  depende: string[]
  conectores: Conector[]
  limites: LimiteFila[]
}

// Clave de límite → cifra de modulos_consumo() que la mide. Los límites sin
// cifra (por miembro, retención) se listan sin consumo.
const MEDIDA: Record<string, string> = {
  miembros: 'miembros',
  almacenamiento_mb: 'almacenamiento_mb',
  ia_dia_equipo: 'ia_hoy',
}

const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

// null si no hay límite o no se mide. 0 de 0 es 0 %; algo de 0, 100 %.
export function porcentajeConsumo(usado: number | null, limite: number | null): number | null {
  if (limite === null || usado === null) return null
  if (limite <= 0) return usado > 0 ? 100 : 0
  return Math.round((usado / limite) * 1000) / 10
}

// Una fila por módulo del registro, en su orden, y al final las filas de la
// base que el registro no conoce («desconocido»).
export function filasDeModulos(base: readonly FilaBase[], consumo: Consumo | null): FilaModulo[] {
  const porSlug = new Map(base.map((f) => [f.slug, f]))
  const deRegistro = MODULOS.map((m): FilaModulo => {
    const fila = porSlug.get(m.slug)
    const limites = fila?.limites ?? {}
    return {
      slug: m.slug,
      nombre: m.nombre,
      estado: m.estado === 'planeado' ? 'planeado' : fila?.activo ? 'activo' : 'inactivo',
      depende: m.depende.map((d) => moduloPorSlug(d)?.nombre ?? d),
      conectores: m.conectores,
      // Solo los enteros: las listas (buzones, fuentes) son ajustes, no topes
      limites: Object.keys(m.limites).filter((clave) => m.limites[clave] === 'entero').map((clave) => {
        const limite = numero(limites[clave])
        const medida = MEDIDA[clave]
        const usado = medida && consumo ? numero(consumo[medida]) : null
        return { clave, limite, usado, porcentaje: porcentajeConsumo(usado, limite) }
      }),
    }
  })
  const ajenas = base
    .filter((f) => !moduloPorSlug(f.slug))
    .map((f): FilaModulo => ({ slug: f.slug, nombre: f.slug, estado: 'desconocido', depende: [], conectores: [], limites: [] }))
  return [...deRegistro, ...ajenas]
}

export type Destacada = { slug: string; nombre: string; clave: string; porcentaje: number }

// El consumo más alto en porcentaje. En un empate gana el primero en el
// orden de las filas (el del registro). null si nada tiene porcentaje.
export function cifraDestacada(filas: readonly FilaModulo[]): Destacada | null {
  let mejor: Destacada | null = null
  for (const f of filas) {
    for (const l of f.limites) {
      if (l.porcentaje === null) continue
      if (!mejor || l.porcentaje > mejor.porcentaje) mejor = { slug: f.slug, nombre: f.nombre, clave: l.clave, porcentaje: l.porcentaje }
    }
  }
  return mejor
}
