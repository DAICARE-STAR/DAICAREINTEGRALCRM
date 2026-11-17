// Formato de dinero del shell: el mismo de /apps/shared/moneda.js
// (GUIA-UI.md, «Dinero»). «CÓDIGO SÍMBOLO importe»: EUR € 27.299.940 ·
// USD $ 727.425 · COP $ 50.000.000. El código va delante porque el símbolo
// solo no distingue las divisas ($ es dólar y peso). Miles con punto
// (es-CO), sin decimales salvo que se pidan y '—' cuando no hay número.
// Las divisas nunca se suman entre sí: se apilan.

// Solo el glifo: el código lo pone fmtDinero
export const MONEDAS: Readonly<Record<string, string>> = {
  USD: '$',
  COP: '$',
  EUR: '€',
  BOB: 'Bs',
  PEN: 'S/',
  BRL: 'R$',
  ARS: '$',
  CLP: '$',
  UYU: '$',
  DOP: 'RD$',
  GTQ: 'Q',
  MXN: '$',
}

// Un formateador por número de decimales (crearlos en cada llamada es caro)
const formateadores = new Map<number, Intl.NumberFormat>()

function formateador(decimales: number): Intl.NumberFormat {
  let f = formateadores.get(decimales)
  if (!f) {
    f = new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    })
    formateadores.set(decimales, f)
  }
  return f
}

function aNumero(n: unknown): number | null {
  const v = typeof n === 'string' && n.trim() !== '' ? Number(n.replace(/,/g, '')) : n
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Número con miles con punto y coma decimal ('—' sin número). */
export function fmtNumero(n: unknown, decimales = 0): string {
  const v = aNumero(n)
  if (v === null) return '—'
  return formateador(decimales).format(decimales === 0 ? Math.round(v) : v)
}

/** «USD $ 1.234»; con decimales, «COP $ 4.123,45». '—' sin número. */
export function fmtDinero(n: unknown, moneda?: string | null, decimales = 0): string {
  const v = aNumero(n)
  if (v === null) return '—'
  const cod = moneda || 'USD'
  const sim = MONEDAS[cod]
  return `${cod}${sim ? ` ${sim}` : ''} ${fmtNumero(v, decimales)}`
}

// Importe con moneda (PP-DEC-24, docs/esquema.md): en la base son dos
// columnas, <col> public.importe (numeric(18,4)) y <col>_moneda
// public.codigo_moneda, que van las dos o ninguna. Estas utilidades siguen
// las reglas de la base para avisar antes de escribir.

/** Código ISO 4217: tres letras mayúsculas, como el dominio codigo_moneda. */
export function esCodigoMoneda(c: unknown): c is string {
  return typeof c === 'string' && /^[A-Z]{3}$/.test(c)
}

const vacio = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

/**
 * Valida un par importe y moneda: null si es válido (también los dos
 * vacíos) o el motivo para mostrar. El importe es un número o el texto
 * numérico que entrega la API («1234.5»), con hasta 4 decimales y 14 cifras
 * enteras.
 */
export function validarImporte(importe: unknown, moneda: unknown): string | null {
  if (vacio(importe) && vacio(moneda)) return null
  if (vacio(moneda)) return 'Falta la moneda del importe.'
  if (vacio(importe)) return 'Falta el importe.'
  if (!esCodigoMoneda(moneda)) return 'La moneda va en tres letras mayúsculas (COP).'
  let n: number
  let decimalesOk: boolean
  if (typeof importe === 'number') {
    n = importe
    decimalesOk = Number.isFinite(n) && Number(n.toFixed(4)) === n
  } else if (typeof importe === 'string' && /^-?\d+(\.\d+)?$/.test(importe.trim())) {
    n = Number(importe.trim())
    decimalesOk = !/\.\d{5,}$/.test(importe.trim())
  } else {
    return 'El importe no es un número válido.'
  }
  if (!Number.isFinite(n)) return 'El importe no es un número válido.'
  if (Math.abs(n) >= 1e14) return 'El importe es demasiado grande.'
  if (!decimalesOk) return 'El importe admite hasta 4 decimales.'
  return null
}

/** Un importe con su moneda («COP $ 1.234.567»); '—' si falta uno o no es válido. */
export function fmtImporte(importe: unknown, moneda: unknown, decimales = 0): string {
  if (vacio(importe) || validarImporte(importe, moneda) !== null) return '—'
  return fmtDinero(importe, moneda as string, decimales)
}
