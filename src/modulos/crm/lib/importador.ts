import { validarValor } from './campos'
import type { AjustesCrm, CampoDef, Cuenta, TipoCuenta } from './tipos'

export const TOPE_FILAS = 10000
export const PREFIJO_EJEMPLO = 'EJEMPLO-'

// Columnas fijas, en el orden en que las escribe el exportador
export const COLUMNAS = [
  'nombre', 'tipo', 'documento', 'etapa', 'origen', 'tipo_empresa', 'responsable',
  'telefono', 'email', 'direccion', 'ciudad', 'pais', 'etiquetas', 'notas',
] as const
export type Columna = typeof COLUMNAS[number]

export const ENCABEZADOS: Record<Columna, string> = {
  nombre: 'Nombre', tipo: 'Tipo', documento: 'Documento', etapa: 'Etapa', origen: 'Origen',
  tipo_empresa: 'Tipo de empresa', responsable: 'Responsable', telefono: 'Teléfono', email: 'Email',
  direccion: 'Dirección', ciudad: 'Ciudad', pais: 'País', etiquetas: 'Etiquetas', notas: 'Notas',
}

// Minúsculas, sin tildes, espacios colapsados
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// Documento sin puntos, guiones ni espacios, en mayúsculas
export function normalizarDocumento(s: string): string {
  return s.replace(/[.\-\s]/g, '').toUpperCase()
}

const ALIAS: Record<string, Columna> = {
  'nombre': 'nombre', 'tipo': 'tipo', 'documento': 'documento', 'cedula': 'documento', 'nit': 'documento',
  'etapa': 'etapa', 'origen': 'origen', 'tipo de empresa': 'tipo_empresa', 'tipo_empresa': 'tipo_empresa',
  'responsable': 'responsable', 'telefono': 'telefono', 'email': 'email', 'correo': 'email',
  'direccion': 'direccion', 'ciudad': 'ciudad', 'pais': 'pais', 'etiquetas': 'etiquetas', 'notas': 'notas',
}

// Campos de una cuenta que el importador puede escribir
export type DatosCuenta = Pick<Cuenta,
  'tipo' | 'nombre' | 'documento' | 'etapa' | 'origen' | 'tipo_empresa' | 'responsable_id'
  | 'telefono' | 'email' | 'direccion' | 'ciudad' | 'pais' | 'etiquetas' | 'campos' | 'notas'>

export type CuentaActual = DatosCuenta & { id: string }

export type FilaImportada =
  | { fila: number, accion: 'crear', datos: DatosCuenta }
  | { fila: number, accion: 'actualizar', id: string, cambios: Partial<DatosCuenta> }
  | { fila: number, accion: 'sin_cambio', id: string }
  | { fila: number, accion: 'error', errores: string[] }

export type ResultadoImportacion = {
  // Error que invalida el archivo entero (vacío, sin columna Nombre, demasiadas filas)
  error: string | null
  filas: FilaImportada[]
  omitidas: number
}

export type EntradaImportacion = {
  filas: string[][]
  ajustes: AjustesCrm
  defs: CampoDef[]
  // Correo o nombre (cualquier mayúscula o tilde) → id del perfil
  responsables: Record<string, string>
  cuentas: CuentaActual[]
}

// Revierte la neutralización de fórmulas de csv.ts para que exportar e
// importar sea una ida y vuelta exacta
function desneutralizar(v: string): string {
  return RE_NEUTRALIZADA.test(v) ? v.slice(1) : v
}

const RE_NEUTRALIZADA = /^'[=+\-@\t\r]/

type Mapa = { fijas: Partial<Record<Columna, number>>, campos: { def: CampoDef, i: number }[] }

function mapearEncabezados(enc: string[], defs: CampoDef[]): { mapa: Mapa, errores: string[] } {
  const mapa: Mapa = { fijas: {}, campos: [] }
  const errores: string[] = []
  const propias = defs.filter(d => d.entidad === 'cuenta')
  enc.forEach((e, i) => {
    const n = normalizar(e)
    if (n === '') return
    const col = ALIAS[n]
    if (col) {
      if (mapa.fijas[col] !== undefined) errores.push(`Columna repetida: ${e}`)
      else mapa.fijas[col] = i
      return
    }
    const def = propias.find(d => normalizar(d.etiqueta) === n || d.clave === n)
    if (def) {
      if (mapa.campos.some(c => c.def.clave === def.clave)) errores.push(`Columna repetida: ${e}`)
      else mapa.campos.push({ def, i })
      return
    }
    errores.push(`Columna desconocida: ${e}`)
  })
  if (mapa.fijas.nombre === undefined) errores.push('Falta la columna Nombre')
  return { mapa, errores }
}

function iguales(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => x === b[i])
  return a === b || ((a === null || a === undefined) && (b === null || b === undefined))
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function importar(e: EntradaImportacion): ResultadoImportacion {
  const vacio = { filas: [], omitidas: 0 }
  if (e.filas.length === 0) return { error: 'El archivo está vacío', ...vacio }
  if (e.filas.length - 1 > TOPE_FILAS) return { error: `El archivo supera ${TOPE_FILAS} filas`, ...vacio }
  const { mapa, errores: errEnc } = mapearEncabezados(e.filas[0], e.defs)
  if (errEnc.length > 0) return { error: errEnc.join('; '), ...vacio }

  const porDocumento = new Map<string, CuentaActual>()
  const porNombre = new Map<string, CuentaActual>()
  for (const c of e.cuentas) {
    if (c.documento) porDocumento.set(normalizarDocumento(c.documento), c)
    porNombre.set(c.tipo + '|' + normalizar(c.nombre), c)
  }
  const responsables = new Map(Object.entries(e.responsables).map(([k, v]) => [normalizar(k), v]))
  const etapas = new Map<string, string>()
  for (const et of e.ajustes.etapas) {
    etapas.set(normalizar(et.clave), et.clave)
    etapas.set(normalizar(et.nombre), et.clave)
  }
  const catalogo = (lista: string[]) => new Map(lista.map(x => [normalizar(x), x]))
  const origenes = catalogo(e.ajustes.origenes)
  const tiposEmpresa = catalogo(e.ajustes.tipos_empresa)

  const vistas = new Map<string, number>()
  const salida: FilaImportada[] = []
  let omitidas = 0

  for (let r = 1; r < e.filas.length; r++) {
    const fila = e.filas[r]
    // Número de fila del archivo, contando el encabezado como 1
    const num = r + 1
    const celda = (c: Columna): string | undefined => {
      const i = mapa.fijas[c]
      const v = i === undefined ? '' : desneutralizar((fila[i] ?? '').trim())
      return v === '' ? undefined : v
    }
    const nombre = celda('nombre')
    if (nombre?.startsWith(PREFIJO_EJEMPLO)) {
      omitidas++
      continue
    }
    if (fila.every(x => x.trim() === '')) continue

    const errores: string[] = []
    const datos: Partial<DatosCuenta> = {}
    if (nombre === undefined) errores.push('Falta el nombre')
    else datos.nombre = nombre

    const tipoTxt = celda('tipo')
    if (tipoTxt !== undefined) {
      const t = normalizar(tipoTxt)
      if (t === 'persona' || t === 'empresa') datos.tipo = t as TipoCuenta
      else errores.push(`Tipo no válido: ${tipoTxt}`)
    }
    const doc = celda('documento')
    if (doc !== undefined) {
      const d = normalizarDocumento(doc)
      if (d === '') errores.push(`Documento no válido: ${doc}`)
      else datos.documento = d
    }
    const etapa = celda('etapa')
    if (etapa !== undefined) {
      const clave = etapas.get(normalizar(etapa))
      if (clave) datos.etapa = clave
      else errores.push(`Etapa desconocida: ${etapa}`)
    }
    const origen = celda('origen')
    if (origen !== undefined) {
      const v = origenes.get(normalizar(origen))
      if (v) datos.origen = v
      else errores.push(`Origen desconocido: ${origen}`)
    }
    const te = celda('tipo_empresa')
    if (te !== undefined) {
      const v = tiposEmpresa.get(normalizar(te))
      if (v) datos.tipo_empresa = v
      else errores.push(`Tipo de empresa desconocido: ${te}`)
    }
    const resp = celda('responsable')
    if (resp !== undefined) {
      const id = responsables.get(normalizar(resp))
      if (id) datos.responsable_id = id
      else errores.push(`Responsable desconocido: ${resp}`)
    }
    const email = celda('email')
    if (email !== undefined) {
      if (RE_EMAIL.test(email)) datos.email = email.toLowerCase()
      else errores.push(`Email no válido: ${email}`)
    }
    const pais = celda('pais')
    if (pais !== undefined) {
      if (/^[a-z]{2}$/i.test(pais)) datos.pais = pais.toUpperCase()
      else errores.push(`País no válido (código de dos letras): ${pais}`)
    }
    for (const c of ['telefono', 'direccion', 'ciudad', 'notas'] as const) {
      const v = celda(c)
      if (v !== undefined) datos[c] = v
    }
    const etq = celda('etiquetas')
    if (etq !== undefined) datos.etiquetas = etq.split('|').map(x => x.trim()).filter(x => x !== '')

    const campos: Record<string, unknown> = {}
    for (const { def, i } of mapa.campos) {
      const v = desneutralizar((fila[i] ?? '').trim())
      if (v === '') continue
      const res = validarValor(def, v)
      if (res.ok) campos[def.clave] = res.valor
      else errores.push(res.error)
    }

    // Cruce: documento si viene; si no, nombre normalizado + tipo
    let actual: CuentaActual | undefined
    let llave: string
    if (datos.documento) {
      llave = 'doc|' + datos.documento
      actual = porDocumento.get(datos.documento)
    } else {
      const tipo = datos.tipo ?? 'persona'
      llave = 'nom|' + tipo + '|' + normalizar(nombre ?? '')
      actual = porNombre.get(tipo + '|' + normalizar(nombre ?? ''))
    }
    const tipoFinal = datos.tipo ?? actual?.tipo ?? 'persona'
    if (datos.tipo_empresa && tipoFinal !== 'empresa') errores.push('Tipo de empresa solo aplica a cuentas de tipo empresa')

    if (nombre !== undefined) {
      const previa = vistas.get(llave)
      if (previa !== undefined) errores.push(`Duplicada de la fila ${previa}`)
      else vistas.set(llave, num)
    }

    if (errores.length > 0) {
      salida.push({ fila: num, accion: 'error', errores })
      continue
    }

    if (!actual) {
      salida.push({
        fila: num,
        accion: 'crear',
        datos: {
          tipo: tipoFinal,
          nombre: nombre as string,
          documento: datos.documento ?? null,
          etapa: datos.etapa ?? null,
          origen: datos.origen ?? null,
          tipo_empresa: datos.tipo_empresa ?? null,
          responsable_id: datos.responsable_id ?? null,
          telefono: datos.telefono ?? null,
          email: datos.email ?? null,
          direccion: datos.direccion ?? null,
          ciudad: datos.ciudad ?? null,
          pais: datos.pais ?? 'CO',
          etiquetas: datos.etiquetas ?? [],
          campos,
          notas: datos.notas ?? null,
        },
      })
      continue
    }

    // Actualizar: solo lo que difiere; una celda vacía no borra. Documento y
    // nombre se comparan normalizados (puntos, tildes o mayúsculas no cuentan)
    const cambios: Partial<DatosCuenta> = {}
    for (const [k, v] of Object.entries(datos) as [keyof DatosCuenta, unknown][]) {
      if (k === 'documento' && actual.documento && normalizarDocumento(actual.documento) === v) continue
      if (k === 'nombre' && normalizar(actual.nombre) === normalizar(v as string)) continue
      if (!iguales(actual[k], v)) (cambios as Record<string, unknown>)[k] = v
    }
    const camposCambiados = Object.entries(campos).filter(([k, v]) => !iguales(actual.campos[k], v))
    if (camposCambiados.length > 0) cambios.campos = { ...actual.campos, ...Object.fromEntries(camposCambiados) }

    if (Object.keys(cambios).length === 0) salida.push({ fila: num, accion: 'sin_cambio', id: actual.id })
    else salida.push({ fila: num, accion: 'actualizar', id: actual.id, cambios })
  }
  return { error: null, filas: salida, omitidas }
}

export function lotes<T>(items: T[], tamano = 500): T[][] {
  const n = Math.max(1, Math.trunc(tamano))
  const salida: T[][] = []
  for (let i = 0; i < items.length; i += n) salida.push(items.slice(i, i + n))
  return salida
}
