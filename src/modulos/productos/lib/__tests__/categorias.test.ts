import { describe, expect, it } from 'vitest'
import { altura, aplanar, descendientes, opcionesArbol, padresPosibles, resolverRuta, ruta } from '../categorias'
import type { Categoria } from '../tipos'

const c = (id: string, nombre: string, padre_id: string | null = null, extra: Partial<Categoria> = {}): Categoria => ({
  id, nombre, padre_id, orden: 0, archivado_en: null, ...extra,
})

// Herramientas > Manuales > Llaves; Herramientas > Eléctricas; Insumos; Viejas (archivada)
const LISTA = [
  c('h', 'Herramientas'),
  c('m', 'Manuales', 'h'),
  c('l', 'Llaves', 'm'),
  c('e', 'Eléctricas', 'h', { orden: -1 }),
  c('i', 'Insumos'),
  c('v', 'Viejas', null, { archivado_en: '2026-11-01T00:00:00Z' }),
]

describe('árbol de categorías', () => {
  it('aplana en orden de lectura con su nivel; sin archivadas si se pide', () => {
    expect(aplanar(LISTA).map((n) => `${n.nivel}:${n.categoria.id}`)).toEqual(['1:h', '2:e', '2:m', '3:l', '1:i', '1:v'])
    expect(aplanar(LISTA, false).map((n) => n.categoria.id)).not.toContain('v')
  })

  it('termina aunque haya un ciclo en los datos', () => {
    const ciclo = [c('a', 'A', 'b'), c('b', 'B', 'a')]
    expect(() => aplanar(ciclo)).not.toThrow()
    expect(ruta(ciclo, 'a')).toBe('B / A')
    expect(descendientes(ciclo, 'a')).toEqual(new Set(['a', 'b']))
  })

  it('ruta, altura y descendientes', () => {
    expect(ruta(LISTA, 'l')).toBe('Herramientas / Manuales / Llaves')
    expect(ruta(LISTA, null)).toBe('')
    expect(altura(LISTA, 'h')).toBe(3)
    expect(altura(LISTA, 'l')).toBe(1)
    expect(descendientes(LISTA, 'h')).toEqual(new Set(['h', 'm', 'l', 'e']))
  })

  it('padres posibles: ni la propia ni sus descendientes, y el subárbol cabe en tres niveles', () => {
    expect(padresPosibles(LISTA, null).map((n) => n.categoria.id)).toEqual(['h', 'e', 'm', 'i'])
    // Manuales tiene una hija: solo cabe bajo una de primer nivel distinta de sí
    expect(padresPosibles(LISTA, 'm').map((n) => n.categoria.id)).toEqual(['h', 'i'])
    // Herramientas tiene tres niveles: no cabe bajo nada
    expect(padresPosibles(LISTA, 'h')).toEqual([])
  })

  it('opciones con sangría y marca de archivada', () => {
    expect(opcionesArbol(aplanar(LISTA)).map((o) => o.label)).toEqual([
      'Herramientas', '— Eléctricas', '— Manuales', '— — Llaves', 'Insumos', 'Viejas (archivada)',
    ])
  })

  it('resuelve la ruta del CSV sin mayúsculas ni espacios de más; prefiere la activa', () => {
    expect(resolverRuta(LISTA, 'herramientas /  MANUALES')).toBe('m')
    expect(resolverRuta(LISTA, 'Herramientas / Nada')).toBeNull()
    expect(resolverRuta(LISTA, ' / ')).toBeNull()
    expect(resolverRuta(LISTA, 'Viejas')).toBe('v')
    expect(resolverRuta([...LISTA, c('v2', 'viejas')], 'Viejas')).toBe('v2')
  })
})
