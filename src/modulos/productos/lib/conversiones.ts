import { aTextoComa, fmtCantidad, leerDecimal, type SeparadorDecimal } from './numeros'
import type { Unidad } from './tipos'

// Unidades alternas: «1 caja = 12 und» es factor 12. Regla de la base
// (productos_conversiones): factor > 0, hasta 6 decimales y, si es menor que
// 1, el inverso exacto de un entero (0,001 sí; 0,083333 no).

const ESCALA = 1_000_000n

/**
 * Valida un factor ya leído (texto con punto decimal): null si la base lo
 * admite o el motivo para mostrar.
 */
export function validarFactor(factor: string): string | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(factor)
  if (!m) return 'El factor tiene que ser un número mayor que cero.'
  const decimales = m[2] ?? ''
  if (decimales.length > 6) return 'El factor admite hasta 6 decimales.'
  if (m[1].replace(/^0+(?=\d)/, '').length > 12) return 'El factor es demasiado grande.'
  const escalado = BigInt(m[1]) * ESCALA + BigInt(decimales.padEnd(6, '0') || '0')
  if (escalado === 0n) return 'El factor tiene que ser un número mayor que cero.'
  if (escalado < ESCALA && ESCALA % escalado !== 0n) {
    return 'Ese factor no es exacto: usa como unidad base la unidad menor.'
  }
  return null
}

/** «1 caja = 12 und»; el nombre corto es el símbolo o, si no hay, la clave. */
export function textoConversion(unidad: string, factor: number | string, base: string, unidades: Unidad[] = []): string {
  const corto = (c: string) => unidades.find((u) => u.clave === c)?.simbolo || c
  return `1 ${corto(unidad)} = ${fmtCantidad(factor)} ${corto(base)}`
}

export type ConversionLeida = { unidad: string; factor: string }

/**
 * Lee la celda «caja=12 | paquete=6» del CSV. `resolver` traduce lo escrito
 * (clave o nombre) a la clave de la unidad. Devuelve las conversiones o los
 * errores de la celda.
 */
export function leerConversiones(
  texto: string,
  separador: SeparadorDecimal,
  resolver: (u: string) => string | null,
): { conversiones: ConversionLeida[]; errores: string[] } {
  const conversiones: ConversionLeida[] = []
  const errores: string[] = []
  for (const parte of texto.split('|').map((x) => x.trim()).filter(Boolean)) {
    const i = parte.indexOf('=')
    if (i <= 0) {
      errores.push(`Unidad alterna sin el formato unidad=factor: ${parte}`)
      continue
    }
    const escrita = parte.slice(0, i).trim()
    const unidad = resolver(escrita)
    if (!unidad) {
      errores.push(`Unidad desconocida: ${escrita}`)
      continue
    }
    const factor = leerDecimal(parte.slice(i + 1), separador)
    const error = factor === null ? 'El factor tiene que ser un número mayor que cero.' : validarFactor(factor)
    if (error || factor === null) {
      errores.push(`${escrita}: ${error}`)
      continue
    }
    if (conversiones.some((c) => c.unidad === unidad)) {
      errores.push(`Unidad alterna repetida: ${escrita}`)
      continue
    }
    conversiones.push({ unidad, factor })
  }
  return { conversiones, errores }
}

/** Celda del CSV con coma decimal: «caja=12 | g=0,001». */
export function escribirConversiones(lista: { unidad: string; factor: number | string }[]): string {
  return [...lista]
    .sort((a, b) => a.unidad.localeCompare(b.unidad))
    .map((c) => `${c.unidad}=${aTextoComa(c.factor)}`)
    .join(' | ')
}
