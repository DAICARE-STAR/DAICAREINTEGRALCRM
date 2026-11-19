import { normalizarNombre } from './codigo'
import type { Categoria } from './tipos'

// Árbol de categorías (hasta tres niveles, 22-catalogo.sql). Todo recorrido
// lleva tope de nivel: un dato corrupto con ciclo no cuelga la pantalla.

export const NIVELES_MAX = 3
const TOPE = 10

export type NodoPlano = { categoria: Categoria; nivel: number }

/** El árbol en orden de lectura (hermanas por orden y nombre), con su nivel desde 1. */
export function aplanar(lista: Categoria[], conArchivadas = true): NodoPlano[] {
  const hijas = new Map<string | null, Categoria[]>()
  for (const c of lista) {
    if (!conArchivadas && c.archivado_en) continue
    const k = c.padre_id && lista.some((x) => x.id === c.padre_id) ? c.padre_id : null
    hijas.set(k, [...(hijas.get(k) ?? []), c])
  }
  for (const v of hijas.values()) v.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
  const salida: NodoPlano[] = []
  const vistos = new Set<string>()
  const recorrer = (padre: string | null, nivel: number) => {
    if (nivel > TOPE) return
    for (const c of hijas.get(padre) ?? []) {
      if (vistos.has(c.id)) continue
      vistos.add(c.id)
      salida.push({ categoria: c, nivel })
      recorrer(c.id, nivel + 1)
    }
  }
  recorrer(null, 1)
  return salida
}

/** Ancestros desde la raíz hasta la categoría, incluida. */
export function cadena(lista: Categoria[], id: string | null): Categoria[] {
  const salida: Categoria[] = []
  let actual = id
  for (let i = 0; actual && i < TOPE; i++) {
    const c = lista.find((x) => x.id === actual)
    if (!c || salida.includes(c)) break
    salida.unshift(c)
    actual = c.padre_id
  }
  return salida
}

/** «Herramientas / Manuales»; '' sin categoría. */
export function ruta(lista: Categoria[], id: string | null): string {
  return cadena(lista, id).map((c) => c.nombre).join(' / ')
}

export function nivelDe(lista: Categoria[], id: string): number {
  return cadena(lista, id).length
}

/** Niveles por debajo de la categoría, contándola (una hoja es 1). */
export function altura(lista: Categoria[], id: string): number {
  let max = 1
  const recorrer = (p: string, n: number) => {
    if (n > TOPE) return
    for (const h of lista.filter((x) => x.padre_id === p)) {
      max = Math.max(max, n + 1)
      recorrer(h.id, n + 1)
    }
  }
  recorrer(id, 1)
  return max
}

/** Ids de la categoría y sus descendientes. */
export function descendientes(lista: Categoria[], id: string): Set<string> {
  const salida = new Set<string>([id])
  for (let i = 0; i < TOPE; i++) {
    const antes = salida.size
    for (const c of lista) if (c.padre_id && salida.has(c.padre_id)) salida.add(c.id)
    if (salida.size === antes) break
  }
  return salida
}

/**
 * Padres posibles al crear o mover `id` (null en un alta): activos, que no
 * sean la propia categoría ni sus descendientes y donde el subárbol quepa en
 * tres niveles. Las mismas reglas que productos_categorias_validar.
 */
export function padresPosibles(lista: Categoria[], id: string | null): NodoPlano[] {
  const fuera = id ? descendientes(lista, id) : new Set<string>()
  const alto = id ? altura(lista, id) : 1
  return aplanar(lista, false).filter((n) => !fuera.has(n.categoria.id) && n.nivel + alto <= NIVELES_MAX)
}

/** Opciones con sangría para un select («Herramientas», «— Manuales»). */
export function opcionesArbol(nodos: NodoPlano[]): { valor: string; label: string }[] {
  return nodos.map((n) => ({
    valor: n.categoria.id,
    label: `${'— '.repeat(n.nivel - 1)}${n.categoria.nombre}${n.categoria.archivado_en ? ' (archivada)' : ''}`,
  }))
}

/** Trozos de una ruta del CSV, sin vacíos. */
export function partirRuta(texto: string): string[] {
  return texto.split('/').map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean)
}

/**
 * Busca la ruta «A / B» comparando nombres sin mayúsculas ni espacios de más
 * (como el índice único de la base); en cada tramo prefiere una categoría
 * activa y, si no hay, una archivada (la que exporta un producto que la
 * conserva). Devuelve el id o null si algún tramo no existe.
 */
export function resolverRuta(lista: Categoria[], texto: string): string | null {
  let padre: string | null = null
  const partes = partirRuta(texto)
  if (partes.length === 0) return null
  for (const p of partes) {
    const n = normalizarNombre(p)
    const hermanas = lista.filter((x) => x.padre_id === padre && normalizarNombre(x.nombre) === n)
    const c = hermanas.find((x) => !x.archivado_en) ?? hermanas[0]
    if (!c) return null
    padre = c.id
  }
  return padre
}
