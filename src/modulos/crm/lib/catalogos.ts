import type { AjustesCrm, Cierre, Etapa } from './tipos'

export const RE_CLAVE_CATALOGO = /^[a-z][a-z0-9_]{1,30}$/

export const AJUSTES_POR_DEFECTO: AjustesCrm = {
  etapas: [
    { clave: 'solicitud', nombre: 'Solicitud', orden: 1, cierre: null },
    { clave: 'valoracion', nombre: 'Valoración', orden: 2, cierre: null },
    { clave: 'propuesta', nombre: 'Propuesta', orden: 3, cierre: null },
    { clave: 'activo', nombre: 'Activo', orden: 4, cierre: null },
    { clave: 'cerrado', nombre: 'Cerrado', orden: 5, cierre: 'ganada' },
    { clave: 'no_continuo', nombre: 'No continuó', orden: 6, cierre: 'perdida' },
  ],
  origenes: ['referido', 'redes', 'whatsapp', 'web', 'aliado', 'otro'],
  tipos_empresa: ['clinica', 'eps', 'aliado', 'proveedor', 'empresa'],
  relaciones: ['familiar', 'responsable', 'acudiente', 'contacto', 'otro'],
}

function copiaDefecto(): AjustesCrm {
  return {
    etapas: AJUSTES_POR_DEFECTO.etapas.map(e => ({ ...e })),
    origenes: [...AJUSTES_POR_DEFECTO.origenes],
    tipos_empresa: [...AJUSTES_POR_DEFECTO.tipos_empresa],
    relaciones: [...AJUSTES_POR_DEFECTO.relaciones],
  }
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function leerEtapa(v: unknown): Etapa | null {
  if (!esObjeto(v)) return null
  const { clave, nombre, orden, cierre } = v
  if (typeof clave !== 'string' || typeof nombre !== 'string') return null
  if (typeof orden !== 'number' || !Number.isFinite(orden)) return null
  const c: Cierre = cierre === 'ganada' || cierre === 'perdida' ? cierre : null
  return { clave, nombre, orden, cierre: c }
}

function leerLista(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length === 0) return null
  if (!v.every(x => typeof x === 'string' && x.trim() !== '')) return null
  return [...v] as string[]
}

// Acepta `instalacion.ajustes` completo o directamente su rama `crm`. Campo
// por campo: lo que no tenga la forma esperada (o no pase validarAjustes) cae
// al valor por defecto. Nunca lanza.
export function leerAjustes(ajustesInstalacion: unknown): AjustesCrm {
  const salida = copiaDefecto()
  try {
    if (!esObjeto(ajustesInstalacion)) return salida
    const raiz = esObjeto(ajustesInstalacion.crm) ? ajustesInstalacion.crm : ajustesInstalacion
    if (Array.isArray(raiz.etapas) && raiz.etapas.length > 0) {
      const etapas = raiz.etapas.map(leerEtapa)
      if (etapas.every(e => e !== null)) {
        const prueba = { ...copiaDefecto(), etapas: etapas as Etapa[] }
        if (validarAjustes(prueba).length === 0) salida.etapas = prueba.etapas
      }
    }
    for (const k of ['origenes', 'tipos_empresa', 'relaciones'] as const) {
      const lista = leerLista(raiz[k])
      if (lista && validarAjustes({ ...copiaDefecto(), [k]: lista }).length === 0) salida[k] = lista
    }
  } catch {
    return copiaDefecto()
  }
  return salida
}

export function validarAjustes(a: AjustesCrm): string[] {
  const errores: string[] = []
  if (a.etapas.length === 0) errores.push('No hay etapas')
  const claves = new Set<string>()
  const ordenes = new Set<number>()
  for (const e of a.etapas) {
    if (!RE_CLAVE_CATALOGO.test(e.clave)) errores.push(`Clave de etapa no válida: ${e.clave}`)
    if (claves.has(e.clave)) errores.push(`Clave de etapa duplicada: ${e.clave}`)
    claves.add(e.clave)
    if (ordenes.has(e.orden)) errores.push(`Orden de etapa repetido: ${e.orden}`)
    ordenes.add(e.orden)
    if (e.nombre.trim() === '') errores.push(`Etapa sin nombre: ${e.clave}`)
  }
  const listas: [string, string[]][] = [
    ['origen', a.origenes], ['tipo de empresa', a.tipos_empresa], ['relación', a.relaciones],
  ]
  for (const [nombre, lista] of listas) {
    const vistos = new Set<string>()
    for (const v of lista) {
      if (!RE_CLAVE_CATALOGO.test(v)) errores.push(`Clave de ${nombre} no válida: ${v}`)
      if (vistos.has(v)) errores.push(`Clave de ${nombre} duplicada: ${v}`)
      vistos.add(v)
    }
  }
  return errores
}

export function etapasOrdenadas(a: AjustesCrm): Etapa[] {
  return [...a.etapas].sort((x, y) => x.orden - y.orden)
}

export function nombreEtapa(a: AjustesCrm, clave: string): string {
  return a.etapas.find(e => e.clave === clave)?.nombre ?? clave
}
