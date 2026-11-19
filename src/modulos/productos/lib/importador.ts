import { lotes, normalizar, PREFIJO_EJEMPLO } from '../../crm/lib/importador'
import { partirRuta, resolverRuta } from './categorias'
import { leerCodigo, normalizarCodigo, normalizarNombre } from './codigo'
import { leerConversiones, type ConversionLeida } from './conversiones'
import { errorDeFila } from './errores'
import { leerDecimal, type SeparadorDecimal } from './numeros'
import type { Catalogos, TipoProducto } from './tipos'

// Importador CSV de productos (docs/modulos/productos.md, 5.5). El navegador
// mapea cada fila al formato de productos_importar y detecta los repetidos
// sobre el archivo entero; crear, actualizar o sin cambio lo decide la base,
// lote a lote, primero en simulacro. Una celda vacía no cambia el valor
// guardado. Reutiliza del CRM la normalización de encabezados, los lotes y
// el prefijo de la fila de ejemplo.

export { lotes, PREFIJO_EJEMPLO }

export const TOPE_FILAS = 20000
export const TAMANO_LOTE = 100

// Columnas fijas, en el orden de la plantilla y del exportador
export const COLUMNAS = [
  'codigo', 'nombre', 'tipo', 'vendible', 'comprable', 'categoria', 'unidad_base',
  'unidades_alternas', 'impuesto', 'precio_lista', 'moneda', 'descripcion', 'archivado',
] as const
export type Columna = (typeof COLUMNAS)[number]

export const ENCABEZADOS: Record<Columna, string> = {
  codigo: 'Código', nombre: 'Nombre', tipo: 'Tipo', vendible: 'Se vende', comprable: 'Se compra',
  categoria: 'Categoría', unidad_base: 'Unidad base', unidades_alternas: 'Unidades alternas',
  impuesto: 'Impuesto', precio_lista: 'Precio de lista', moneda: 'Moneda', descripcion: 'Descripción',
  archivado: 'Archivado',
}

const ALIAS: Record<string, Columna> = {
  'codigo': 'codigo', 'nombre': 'nombre', 'tipo': 'tipo', 'se vende': 'vendible', 'vendible': 'vendible',
  'se compra': 'comprable', 'comprable': 'comprable', 'categoria': 'categoria', 'unidad base': 'unidad_base',
  'unidad': 'unidad_base', 'unidades alternas': 'unidades_alternas', 'impuesto': 'impuesto',
  'clase de impuesto': 'impuesto', 'precio de lista': 'precio_lista', 'precio': 'precio_lista',
  'moneda': 'moneda', 'descripcion': 'descripcion', 'archivado': 'archivado',
}

// Lo que recibe productos_importar por fila; una clave ausente no cambia nada
export type FilaRpc = {
  fila: number
  codigo?: string
  nombre?: string
  descripcion?: string
  tipo?: TipoProducto
  vendible?: boolean
  comprable?: boolean
  categoria_id?: string
  unidad_base?: string
  impuesto?: string
  precio_lista?: string
  archivado?: boolean
  conversiones?: ConversionLeida[]
}

export type FilaMapeada = {
  fila: number
  codigoOriginal: string | null
  codigo: string | null
  nombre: string | null
  conversiones: ConversionLeida[] | null
  unidadBase: string | null
  errores: string[]
  datos: FilaRpc
}

export type Mapeo = {
  // Error que invalida el archivo entero (vacío, sin columnas, demasiadas filas)
  error: string | null
  filas: FilaMapeada[]
  omitidas: number
  // Rutas de categoría del archivo que no existen, como se escribieron
  categoriasNuevas: string[]
}

export type EntradaMapeo = {
  filas: string[][]
  catalogos: Catalogos
  separador: SeparadorDecimal
  moneda: string
}

// Revierte la neutralización de fórmulas de csv.ts (ida y vuelta exacta)
const desneutralizar = (v: string) => (/^'[=+\-@\t\r]/.test(v) ? v.slice(1) : v)

const SI = new Set(['si', 's', '1', 'x', 'true', 'verdadero'])
const NO = new Set(['no', 'n', '0', 'false', 'falso'])

export function leerBooleano(v: string): boolean | null {
  const n = normalizar(v)
  return SI.has(n) ? true : NO.has(n) ? false : null
}

function mapearEncabezados(enc: string[]): { mapa: Partial<Record<Columna, number>>; errores: string[] } {
  const mapa: Partial<Record<Columna, number>> = {}
  const errores: string[] = []
  enc.forEach((e, i) => {
    const n = normalizar(e)
    if (n === '') return
    const col = ALIAS[n]
    if (!col) errores.push(`Columna desconocida: ${e}`)
    else if (mapa[col] !== undefined) errores.push(`Columna repetida: ${e}`)
    else mapa[col] = i
  })
  if (mapa.codigo === undefined && mapa.nombre === undefined) errores.push('Falta la columna Código o la columna Nombre')
  return { mapa, errores }
}

/** Clave de unidad o de clase a partir de su clave o su nombre. */
function resolutor(lista: { clave: string; nombre: string }[]): (v: string) => string | null {
  return (v) => {
    const n = normalizar(v)
    return lista.find((x) => x.clave === v.trim().toLowerCase() || normalizar(x.nombre) === n)?.clave ?? null
  }
}

export function mapear(e: EntradaMapeo): Mapeo {
  const vacio = { filas: [], omitidas: 0, categoriasNuevas: [] }
  if (e.filas.length === 0) return { error: 'El archivo está vacío', ...vacio }
  if (e.filas.length - 1 > TOPE_FILAS) return { error: `El archivo supera ${TOPE_FILAS.toLocaleString('es-CO')} filas`, ...vacio }
  const { mapa, errores: errEnc } = mapearEncabezados(e.filas[0])
  if (errEnc.length > 0) return { error: errEnc.join('; '), ...vacio }

  const unidad = resolutor(e.catalogos.unidades)
  const impuesto = resolutor(e.catalogos.impuestos)
  const nuevas = new Map<string, string>()
  const salida: FilaMapeada[] = []
  let omitidas = 0

  for (let r = 1; r < e.filas.length; r++) {
    const fila = e.filas[r]
    const num = r + 1
    const celda = (c: Columna): string | undefined => {
      const i = mapa[c]
      const v = i === undefined ? '' : desneutralizar((fila[i] ?? '').trim())
      return v === '' ? undefined : v
    }
    if (fila.every((x) => x.trim() === '')) continue
    const codigoTxt = celda('codigo')
    const nombre = celda('nombre')
    if (codigoTxt?.startsWith(PREFIJO_EJEMPLO) || nombre?.startsWith(PREFIJO_EJEMPLO)) {
      omitidas++
      continue
    }

    const errores: string[] = []
    const datos: FilaRpc = { fila: num }
    let codigo: string | null = null
    if (codigoTxt !== undefined) {
      const c = leerCodigo(codigoTxt)
      if (c.ok) codigo = c.codigo
      else errores.push(`${c.error.replace(/\.$/, '')}: ${codigoTxt}`)
      if (codigo) datos.codigo = codigo
    }
    if (nombre !== undefined) {
      if (nombre.length > 200) errores.push('El nombre admite hasta 200 caracteres')
      else datos.nombre = nombre
    }
    if (codigoTxt === undefined && nombre === undefined) errores.push('Falta el código o el nombre')

    const tipo = celda('tipo')
    if (tipo !== undefined) {
      const t = normalizar(tipo)
      if (t === 'bien' || t === 'servicio') datos.tipo = t
      else errores.push(`Tipo no válido (bien o servicio): ${tipo}`)
    }
    for (const c of ['vendible', 'comprable', 'archivado'] as const) {
      const v = celda(c)
      if (v === undefined) continue
      const b = leerBooleano(v)
      if (b === null) errores.push(`${ENCABEZADOS[c]}: escribe sí o no (${v})`)
      else datos[c] = b
    }
    const cat = celda('categoria')
    if (cat !== undefined) {
      const id = resolverRuta(e.catalogos.categorias, cat)
      if (id) datos.categoria_id = id
      else if (partirRuta(cat).length > 3) errores.push(`Las categorías llegan hasta tres niveles: ${cat}`)
      else {
        const clave = partirRuta(cat).map(normalizarNombre).join('/')
        if (!nuevas.has(clave)) nuevas.set(clave, partirRuta(cat).join(' / '))
        errores.push(`Categoría que no existe: ${cat}`)
      }
    }
    const ub = celda('unidad_base')
    let unidadBase: string | null = null
    if (ub !== undefined) {
      unidadBase = unidad(ub)
      if (unidadBase) datos.unidad_base = unidadBase
      else errores.push(`Unidad desconocida: ${ub}`)
    }
    const alt = celda('unidades_alternas')
    let conversiones: ConversionLeida[] | null = null
    if (alt !== undefined) {
      const r2 = leerConversiones(alt, e.separador, unidad)
      errores.push(...r2.errores)
      if (r2.errores.length === 0) {
        if (unidadBase && r2.conversiones.some((c) => c.unidad === unidadBase)) errores.push('La unidad base no lleva conversión')
        conversiones = r2.conversiones
        datos.conversiones = r2.conversiones
      }
    }
    const imp = celda('impuesto')
    if (imp !== undefined) {
      const clave = impuesto(imp)
      if (clave) datos.impuesto = clave
      else errores.push(`Clase de impuesto desconocida: ${imp}`)
    }
    const precio = celda('precio_lista')
    if (precio !== undefined) {
      const v = leerDecimal(precio, e.separador)
      if (v === null || v.startsWith('-')) errores.push(`Precio no válido: ${precio}`)
      else if (v.replace(/\..*$/, '').length > 14 || (v.split('.')[1] ?? '').length > 4) errores.push(`Precio fuera de rango (hasta 14 cifras y 4 decimales): ${precio}`)
      else datos.precio_lista = v
      const moneda = celda('moneda')
      if (moneda !== undefined && moneda.toUpperCase() !== e.moneda) errores.push(`El precio va en ${e.moneda}, la moneda de la instalación (${moneda})`)
    }
    const desc = celda('descripcion')
    if (desc !== undefined) {
      if (desc.length > 4000) errores.push('La descripción admite hasta 4000 caracteres')
      else datos.descripcion = desc
    }

    salida.push({ fila: num, codigoOriginal: codigoTxt ?? null, codigo, nombre: nombre ?? null, conversiones, unidadBase, errores, datos })
  }
  marcarRepetidos(salida)
  return { error: null, filas: salida, omitidas, categoriasNuevas: [...nuevas.values()] }
}

/**
 * Sobre el archivo entero: el mismo código tras normalizar (y, aparte, dos
 * códigos escritos distinto que quedan iguales) y, entre las filas sin
 * código, el mismo nombre. Todas las implicadas quedan con error.
 */
export function marcarRepetidos(filas: FilaMapeada[]): void {
  const porCodigo = new Map<string, FilaMapeada[]>()
  const porNombre = new Map<string, FilaMapeada[]>()
  for (const f of filas) {
    if (f.codigoOriginal !== null) {
      const c = normalizarCodigo(f.codigoOriginal)
      porCodigo.set(c, [...(porCodigo.get(c) ?? []), f])
    } else if (f.nombre !== null) {
      const n = normalizarNombre(f.nombre)
      porNombre.set(n, [...(porNombre.get(n) ?? []), f])
    }
  }
  for (const grupo of porCodigo.values()) {
    if (grupo.length < 2) continue
    const nums = grupo.map((f) => f.fila).join(', ')
    const escritos = new Set(grupo.map((f) => f.codigoOriginal!.trim()))
    const msg = escritos.size > 1
      ? `Códigos escritos distinto que quedan iguales al guardarse (${[...escritos].map((x) => `«${x}»`).join(', ')}) en las filas ${nums}`
      : `Código repetido en las filas ${nums}`
    for (const f of grupo) f.errores.push(msg)
  }
  for (const grupo of porNombre.values()) {
    if (grupo.length < 2) continue
    const msg = `Nombre repetido sin código en las filas ${grupo.map((f) => f.fila).join(', ')}`
    for (const f of grupo) f.errores.push(msg)
  }
}

/** Las filas sin error, partidas en lotes para productos_importar. */
export function lotesParaEnviar(filas: FilaMapeada[], tamano = TAMANO_LOTE): FilaRpc[][] {
  return lotes(filas.filter((f) => f.errores.length === 0).map((f) => f.datos), tamano)
}

// ---------- Resultado ----------

export type Accion = 'crear' | 'actualizar' | 'sin_cambio' | 'error'

export type FilaResultado = { fila: number; accion: Accion; codigo: string | null; errores: string[] }

/** Lee la respuesta de productos_importar sin confiar en su forma. */
export function leerRespuesta(data: unknown): FilaResultado[] {
  const d = (typeof data === 'object' && data !== null ? data : {}) as { filas?: unknown }
  if (!Array.isArray(d.filas)) throw new Error('respuesta_importar')
  return d.filas.map((x: unknown) => {
    const f = (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>
    const accion = (['crear', 'actualizar', 'sin_cambio', 'error'] as const).find((a) => a === f.accion) ?? 'error'
    const errores = Array.isArray(f.errores) ? f.errores.map((e) => errorDeFila((e ?? {}) as { pista?: unknown; mensaje?: unknown })) : []
    return { fila: Number(f.fila), accion, codigo: typeof f.codigo === 'string' ? f.codigo : null, errores }
  })
}

/** Resultado por fila del archivo: los errores del navegador y lo que dijo la base. */
export function combinar(mapeadas: FilaMapeada[], base: FilaResultado[]): FilaResultado[] {
  const porFila = new Map(base.map((f) => [f.fila, f]))
  return mapeadas.map((m) => {
    if (m.errores.length > 0) return { fila: m.fila, accion: 'error', codigo: m.codigo, errores: m.errores }
    return porFila.get(m.fila) ?? { fila: m.fila, accion: 'error', codigo: m.codigo, errores: ['No se procesó'] }
  })
}

export type Conteo = Record<Accion, number>

export function contar(filas: FilaResultado[]): Conteo {
  const c: Conteo = { crear: 0, actualizar: 0, sin_cambio: 0, error: 0 }
  for (const f of filas) c[f.accion]++
  return c
}

const ACCION: Record<Accion, string> = { crear: 'crear', actualizar: 'actualizar', sin_cambio: 'sin cambio', error: 'error' }

/**
 * Filas del reporte CSV. `final` es el resultado de la escritura (null si no
 * se llegó a escribir); una fila sin resultado final no se escribió.
 */
export function filasReporte(mapeadas: FilaMapeada[], previa: FilaResultado[], final: FilaResultado[] | null): string[][] {
  const fin = new Map((final ?? []).map((f) => [f.fila, f]))
  const orig = new Map(mapeadas.map((m) => [m.fila, m]))
  return [
    ['Fila', 'Código en el archivo', 'Código', 'Acción', 'Resultado'],
    ...previa.map((p) => {
      const f = fin.get(p.fila)
      const r = f ?? p
      let resultado: string
      if (r.accion === 'error') resultado = r.errores.join('; ')
      else if (!f) resultado = p.accion === 'sin_cambio' ? 'sin cambio' : 'no escrita'
      else resultado = f.accion === 'sin_cambio' ? 'sin cambio' : 'escrita'
      return [String(p.fila), orig.get(p.fila)?.codigoOriginal ?? '', r.codigo ?? 'automático', ACCION[r.accion], resultado]
    }),
  ]
}
