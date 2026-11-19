// Lectura de números escritos por personas, sin adivinar el formato: quien
// importa elige el separador decimal. Con coma decimal el punto es de miles
// y solo vale en grupos de tres cifras («1.234,5»); con punto decimal, al
// revés («1,234.5»). Devuelve el número como texto con punto decimal, para
// mandarlo exacto a un numeric de la base.

export type SeparadorDecimal = ',' | '.'

/** Texto decimal con punto («1234.5») o null si no es un número válido. */
export function leerDecimal(texto: string, separador: SeparadorDecimal = ','): string | null {
  const t = texto.trim().replace(/\s/g, '')
  if (t === '') return null
  const miles = separador === ',' ? '\\.' : ','
  const dec = separador === ',' ? ',' : '\\.'
  const re = new RegExp(`^(-?)(\\d{1,3}(?:${miles}\\d{3})+|\\d+)(?:${dec}(\\d+))?$`)
  const m = re.exec(t)
  if (!m) return null
  const enteros = m[2].replace(/[.,]/g, '').replace(/^0+(?=\d)/, '')
  const decimales = (m[3] ?? '').replace(/0+$/, '')
  const signo = m[1] && (enteros !== '0' || decimales !== '') ? '-' : ''
  return signo + enteros + (decimales ? '.' + decimales : '')
}

/** Número de la base (o texto con punto) escrito con coma decimal y sin miles, para el CSV. */
export function aTextoComa(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return ''
  const s = typeof n === 'number' ? String(n) : n.trim()
  if (!/^-?\d+(\.\d+)?$/.test(s)) return s
  const [e, d = ''] = s.split('.')
  const dec = d.replace(/0+$/, '')
  return dec ? `${e},${dec}` : e
}

/** Número para mostrar con coma decimal y punto de miles, sin ceros de relleno. */
export function fmtCantidad(n: number | string): string {
  const s = aTextoComa(n)
  const [e, d] = s.split(',')
  const neg = e.startsWith('-')
  const cifras = (neg ? e.slice(1) : e).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return (neg ? '-' : '') + cifras + (d ? ',' + d : '')
}
