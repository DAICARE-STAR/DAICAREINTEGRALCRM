// Fechas del shell. Dos clases de fecha, como en la base:
// · civiles (AAAA-MM-DD, columnas date: orden, entrega, cierre): se tratan
//   como texto y «hoy» es el de Bogotá, como los RPC de las migraciones 41
//   y 78. new Date('AAAA-MM-DD') sería medianoche UTC: en Bogotá, el día
//   anterior.
// · instantes (timestamptz): se muestran en la hora local del navegador.
// Funciones puras: se prueban sin DOM (src/lib/__tests__/fechas.test.ts).

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DIA_MS = 86400000

function partesCivil(civil: string | null | undefined): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(civil ?? '')
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** Fecha civil de hoy en Bogotá (AAAA-MM-DD). */
export function hoyBogota(ahora: Date = new Date()): string {
  return ahora.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

/** Medianoche local de una fecha civil; null si no es una fecha. */
export function civilADate(civil: string | null | undefined): Date | null {
  const p = partesCivil(civil)
  return p ? new Date(p[0], p[1] - 1, p[2]) : null
}

/** «26 oct» de una fecha civil, sin pasar por Date. */
export function fechaCorta(civil: string | null | undefined): string {
  if (!civil) return ''
  const p = partesCivil(civil)
  return p ? `${p[2]} ${MESES[p[1] - 1]}` : civil
}

/** «26 oct» de un instante, en hora local. */
export function fechaCortaIso(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${d.getDate()} ${MESES[d.getMonth()]}`
}

/** La fecha civil n días después (o antes, con n negativo). */
export function sumarDiasCivil(civil: string, n: number): string {
  const p = partesCivil(civil)
  if (!p) return civil
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10)
}

/** Días de la fecha civil a a la b (b − a): negativo si b es anterior. */
export function diasEntre(a: string, b: string): number {
  const pa = partesCivil(a)
  const pb = partesCivil(b)
  if (!pa || !pb) return Number.NaN
  return Math.round(
    (Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / DIA_MS
  )
}

/** Días enteros transcurridos desde un instante. */
export function diasDesde(iso: string, ahoraMs: number = Date.now()): number {
  return Math.floor((ahoraMs - new Date(iso).getTime()) / DIA_MS)
}

/** «hace 5 min», «hace 3 horas», «ayer», «hace 4 días». */
export function hace(iso: string, ahoraMs: number = Date.now()): string {
  const mins = Math.floor((ahoraMs - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `hace ${Math.max(1, mins)} min`
  const horas = Math.floor(mins / 60)
  if (horas < 24) return horas === 1 ? 'hace 1 hora' : `hace ${horas} horas`
  const dias = Math.floor(horas / 24)
  return dias === 1 ? 'ayer' : `hace ${dias} días`
}
