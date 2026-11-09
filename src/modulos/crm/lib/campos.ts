import type { CampoDef, EntidadCampo } from './tipos'

export const MAX_TEXTO = 500

export type Resultado = { ok: true, valor: unknown } | { ok: false, error: string }

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/
// Formato colombiano con separador de miles: '1.234,5'
const RE_NUM_CO = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/
// Sin miles: '1234.5' o '1234,5'
const RE_NUM_SIMPLE = /^-?\d+([.,]\d+)?$/

export function esVacio(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
}

export function leerNumero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const s = v.trim().replace(/\s/g, '')
  if (RE_NUM_CO.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'))
  if (RE_NUM_SIMPLE.test(s)) return Number(s.replace(',', '.'))
  return null
}

export function fechaValida(s: string): boolean {
  const m = RE_FECHA.exec(s)
  if (!m) return false
  const a = Number(m[1])
  const me = Number(m[2])
  const d = Number(m[3])
  const f = new Date(Date.UTC(a, me - 1, d))
  return f.getUTCFullYear() === a && f.getUTCMonth() === me - 1 && f.getUTCDate() === d
}

export function validarValor(def: CampoDef, valor: unknown): Resultado {
  switch (def.tipo) {
    case 'numero': {
      const n = leerNumero(valor)
      return n === null ? { ok: false, error: `${def.etiqueta}: no es un número` } : { ok: true, valor: n }
    }
    case 'fecha': {
      const s = typeof valor === 'string' ? valor.trim() : ''
      return fechaValida(s) ? { ok: true, valor: s } : { ok: false, error: `${def.etiqueta}: fecha no válida (aaaa-mm-dd)` }
    }
    case 'lista': {
      const s = typeof valor === 'string' ? valor.trim() : ''
      return def.opciones.includes(s) ? { ok: true, valor: s } : { ok: false, error: `${def.etiqueta}: opción no válida` }
    }
    case 'booleano': {
      if (typeof valor === 'boolean') return { ok: true, valor }
      const s = typeof valor === 'string' ? valor.trim().toLowerCase() : ''
      if (s === 'true' || s === 'sí' || s === 'si') return { ok: true, valor: true }
      if (s === 'false' || s === 'no') return { ok: true, valor: false }
      return { ok: false, error: `${def.etiqueta}: debe ser sí o no` }
    }
    case 'texto': {
      if (typeof valor !== 'string' && typeof valor !== 'number') return { ok: false, error: `${def.etiqueta}: no es texto` }
      const s = String(valor).trim()
      if (s.length > MAX_TEXTO) return { ok: false, error: `${def.etiqueta}: más de ${MAX_TEXTO} caracteres` }
      return { ok: true, valor: s }
    }
  }
}

// Errores por clave: claves no definidas para la entidad, obligatorios
// ausentes y valores no válidos.
export function validarCampos(defs: CampoDef[], entidad: EntidadCampo, campos: Record<string, unknown>): Record<string, string> {
  const errores: Record<string, string> = {}
  const propias = new Map(defs.filter(d => d.entidad === entidad).map(d => [d.clave, d]))
  for (const [clave, valor] of Object.entries(campos)) {
    const def = propias.get(clave)
    if (!def) {
      errores[clave] = 'Campo no definido'
      continue
    }
    if (esVacio(valor)) continue
    const r = validarValor(def, valor)
    if (!r.ok) errores[clave] = r.error
  }
  for (const def of propias.values()) {
    if (def.obligatorio && esVacio(campos[def.clave])) errores[def.clave] = `${def.etiqueta}: obligatorio`
  }
  return errores
}

// Quita los valores vacíos (null, undefined, texto en blanco, listas vacías)
export function limpiarCampos(campos: Record<string, unknown>): Record<string, unknown> {
  const salida: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(campos)) {
    if (esVacio(v)) continue
    if (Array.isArray(v) && v.length === 0) continue
    salida[k] = typeof v === 'string' ? v.trim() : v
  }
  return salida
}
