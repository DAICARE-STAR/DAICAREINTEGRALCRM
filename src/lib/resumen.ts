// Resumen de dos niveles de una pantalla, las reglas de resumen.js de
// team-portal (GUIA-UI.md, «Resumen»): una sola cifra destacada y debajo
// contadores que suman el total; un contador en cero no se muestra.

export interface Destacado {
  label: string
  valor?: string | null
  /** Varias monedas: se apilan, nunca se suman. */
  montos?: string[]
  contexto?: (string | null | undefined | false)[]
}

export interface Cuenta {
  n: number
  label: string
  sub?: string
  /** 'idDelFiltro|valor': el contador aplica o suelta ese filtro. */
  filtro?: string
  activa?: boolean
}

export function valoresDestacado(d: Destacado): string[] {
  if (d.montos && d.montos.length) return d.montos
  return [d.valor == null ? '—' : d.valor]
}

export function contextoDestacado(d: Destacado): string[] {
  return (d.contexto ?? []).filter((t): t is string => !!t)
}

export function cuentasVisibles(cuentas: readonly Cuenta[]): Cuenta[] {
  return cuentas.filter((c) => c.n !== 0)
}

/** true si los contadores suman el total que se anuncia. */
export function sumanTotal(cuentas: readonly Cuenta[], total: number): boolean {
  return cuentas.reduce((s, c) => s + c.n, 0) === total
}

/** Separa 'id|valor'; null si no tiene la forma. */
export function partirFiltro(par: string): { id: string; valor: string } | null {
  const i = par.indexOf('|')
  if (i <= 0) return null
  return { id: par.slice(0, i), valor: par.slice(i + 1) }
}

/** Pulsar el contador activo suelta el filtro; uno inactivo lo aplica. */
export function alternarFiltro(actual: string, valor: string): string {
  return actual === valor ? '' : valor
}
