// Reglas de la barra de filtros del shell, las mismas de filterbar.js de
// team-portal (GUIA-UI.md, «Barra de filtros»): un control cuenta como activo
// cuando su valor difiere del de por defecto; cinco controles visibles como
// máximo y el resto en «Más filtros» con su contador; un select sin etiqueta
// se nombra desde su opción neutra («Marca: todas» → Marca).

export interface ControlFiltro {
  id: string
  valor: string | boolean
  def: string | boolean
}

export const MAX_VISIBLES = 5

export function contarActivos(controles: readonly ControlFiltro[]): number {
  return controles.filter((c) => c.valor !== c.def).length
}

export function textoContador(n: number): string {
  return `${n} ${n === 1 ? 'filtro' : 'filtros'}`
}

/** Los primeros cinco quedan visibles; el resto va a «Más filtros». */
export function repartir<T>(controles: readonly T[], max = MAX_VISIBLES): { visibles: T[]; mas: T[] } {
  return { visibles: controles.slice(0, max), mas: controles.slice(max) }
}

/** «Más filtros» o «Más filtros · 2» si hay activos dentro. */
export function etiquetaMas(activosDentro: number): string {
  return activosDentro > 0 ? `Más filtros · ${activosDentro}` : 'Más filtros'
}

/** «Marca: todas» → «Marca»; una primera opción que es un valor no nombra. */
export function nombreDesdeOpcionNeutra(texto: string): string | null {
  const m = /^(.+?):\s*(todos|todas|toda|todo)$/i.exec(texto.trim())
  return m ? m[1] : null
}

/** Valores por defecto de todos los controles (Limpiar). */
export function limpiar(controles: readonly ControlFiltro[]): ControlFiltro[] {
  return controles.map((c) => ({ ...c, valor: c.def }))
}
