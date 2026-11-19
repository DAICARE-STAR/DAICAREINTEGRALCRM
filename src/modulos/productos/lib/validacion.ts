import { validarImporte } from '../../../lib/moneda'
import { leerCodigo } from './codigo'
import { leerDecimal } from './numeros'
import type { Producto, TipoImpuesto, TipoProducto, Tratamiento } from './tipos'

// Validación en el navegador con las reglas de 22-catalogo.sql, para avisar
// antes de escribir. La base vuelve a comprobarlo todo.

export type FormProducto = {
  codigo: string
  nombre: string
  tipo: TipoProducto
  vendible: boolean
  comprable: boolean
  categoria_id: string
  unidad_base: string
  impuesto: string
  precio: string
  descripcion: string
}

// Lo que se escribe en productos; sin codigo en un alta, lo pone la serie
export type DatosProducto = {
  codigo?: string
  nombre: string
  descripcion: string | null
  tipo: TipoProducto
  vendible: boolean
  comprable: boolean
  categoria_id: string | null
  unidad_base: string
  impuesto: string
  precio_lista: string | null
}

export type CampoProducto = 'codigo' | 'nombre' | 'unidad_base' | 'impuesto' | 'precio' | 'descripcion'

/** Precio con coma decimal («1.250,5») a texto con punto, o el motivo. Vacío es sin precio. */
export function leerPrecio(texto: string, moneda: string): { ok: true; valor: string | null } | { ok: false; error: string } {
  if (texto.trim() === '') return { ok: true, valor: null }
  const v = leerDecimal(texto, ',')
  if (v === null) return { ok: false, error: 'El precio no es un número válido (coma decimal, punto de miles).' }
  if (v.startsWith('-')) return { ok: false, error: 'El precio no puede ser negativo.' }
  // Sin la moneda de la instalación todavía, se validan solo las cifras: la pone la base
  const error = validarImporte(v, moneda || 'XXX')
  return error ? { ok: false, error } : { ok: true, valor: v }
}

export function validarProducto(
  f: FormProducto,
  opciones: { nuevo: boolean; moneda: string },
): { ok: true; datos: DatosProducto } | { ok: false; errores: Partial<Record<CampoProducto, string>> } {
  const errores: Partial<Record<CampoProducto, string>> = {}
  const codigo = leerCodigo(f.codigo)
  if (!codigo.ok) errores.codigo = codigo.error
  else if (!opciones.nuevo && codigo.codigo === null) errores.codigo = 'El código no puede quedar vacío.'
  const nombre = f.nombre.trim()
  if (nombre === '') errores.nombre = 'Falta el nombre.'
  else if (nombre.length > 200) errores.nombre = 'El nombre admite hasta 200 caracteres.'
  if (f.descripcion.length > 4000) errores.descripcion = 'La descripción admite hasta 4000 caracteres.'
  if (!f.unidad_base) errores.unidad_base = 'Elige la unidad base.'
  if (!f.impuesto) errores.impuesto = 'Elige la clase de impuesto.'
  const precio = leerPrecio(f.precio, opciones.moneda)
  if (!precio.ok) errores.precio = precio.error
  if (Object.keys(errores).length > 0 || !codigo.ok || !precio.ok) return { ok: false, errores }
  const datos: DatosProducto = {
    nombre,
    descripcion: f.descripcion.trim() === '' ? null : f.descripcion.trim(),
    tipo: f.tipo,
    vendible: f.vendible,
    comprable: f.comprable,
    categoria_id: f.categoria_id || null,
    unidad_base: f.unidad_base,
    impuesto: f.impuesto,
    precio_lista: precio.valor,
  }
  if (codigo.codigo !== null) datos.codigo = codigo.codigo
  return { ok: true, datos }
}

/** Mismo número aunque uno venga como 12 y otro como «12.0000». */
export function mismoImporte(a: number | string | null | undefined, b: number | string | null | undefined): boolean {
  const n = (v: number | string | null | undefined) => {
    if (v === null || v === undefined || v === '') return null
    const s = String(v)
    if (!/^-?\d+(\.\d+)?$/.test(s)) return s
    const [e, d = ''] = s.split('.')
    const dec = d.replace(/0+$/, '')
    return e.replace(/^(-?)0+(?=\d)/, '$1') + (dec ? '.' + dec : '')
  }
  return n(a) === n(b)
}

/**
 * Solo los campos que cambian respecto al producto leído. El precio va con
 * su moneda en null, que la base pone con la moneda de la instalación; si el
 * precio no cambia no se manda, para no tocar su moneda.
 */
export function cambiosProducto(p: Producto, d: DatosProducto): Record<string, unknown> {
  const cambios: Record<string, unknown> = {}
  const comparar: (keyof DatosProducto & keyof Producto)[] = [
    'codigo', 'nombre', 'descripcion', 'tipo', 'vendible', 'comprable', 'categoria_id', 'unidad_base', 'impuesto',
  ]
  for (const k of comparar) if (d[k] !== undefined && d[k] !== p[k]) cambios[k] = d[k]
  if (!mismoImporte(p.precio_lista, d.precio_lista)) {
    cambios.precio_lista = d.precio_lista
    cambios.precio_lista_moneda = null
  }
  return cambios
}

// ---------- Catálogos ----------

export const RE_CLAVE_UNIDAD = /^[a-z][a-z0-9_]{0,19}$/
export const RE_CLAVE_IMPUESTO = /^[a-z][a-z0-9_]{0,29}$/

export type FormUnidad = { clave: string; nombre: string; simbolo: string; decimales: string }

export function validarUnidad(f: FormUnidad): string[] {
  const e: string[] = []
  if (!RE_CLAVE_UNIDAD.test(f.clave)) e.push('La clave va en minúsculas sin tildes, empieza por letra y tiene hasta 20 caracteres (letras, cifras y _).')
  const n = f.nombre.trim()
  if (n === '' || n.length > 40) e.push('El nombre tiene entre 1 y 40 caracteres.')
  if (f.simbolo.trim().length > 10) e.push('El símbolo admite hasta 10 caracteres.')
  if (!/^[0-6]$/.test(f.decimales.trim())) e.push('Los decimales van de 0 a 6.')
  return e
}

export function validarNombreCategoria(nombre: string): string | null {
  const n = nombre.trim()
  if (n === '' || n.length > 80) return 'El nombre tiene entre 1 y 80 caracteres.'
  if (n.includes('/')) return 'El nombre no puede llevar «/».'
  return null
}

export type FormClase = { clave: string; nombre: string; tipo: TipoImpuesto; tratamiento: Tratamiento; porcentaje: string }

/** Errores de una clase de impuesto; el porcentaje con coma decimal. */
export function validarClase(f: FormClase): string[] {
  const e: string[] = []
  if (!RE_CLAVE_IMPUESTO.test(f.clave)) e.push('La clave va en minúsculas sin tildes, empieza por letra y tiene hasta 30 caracteres (letras, cifras y _).')
  const n = f.nombre.trim()
  if (n === '' || n.length > 60) e.push('El nombre tiene entre 1 y 60 caracteres.')
  const p = leerDecimal(f.porcentaje || '0', ',')
  if (p === null || p.startsWith('-') || Number(p) > 100 || (p.split('.')[1] ?? '').length > 4) {
    e.push('El porcentaje va de 0 a 100, con hasta 4 decimales.')
  } else if (f.tratamiento !== 'gravado' && Number(p) !== 0) {
    e.push('Una clase exenta o excluida lleva porcentaje 0.')
  }
  return e
}
