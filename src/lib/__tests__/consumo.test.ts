import { describe, expect, it } from 'vitest'
import { cifraDestacada, filasDeModulos, porcentajeConsumo, type FilaModulo } from '../consumo'

describe('porcentajeConsumo', () => {
  it('límite null = sin límite y sin porcentaje', () => {
    expect(porcentajeConsumo(5, null)).toBeNull()
    expect(porcentajeConsumo(null, 10)).toBeNull()
  })
  it('0 de 0 es 0 % y algo de 0 es 100 %', () => {
    expect(porcentajeConsumo(0, 0)).toBe(0)
    expect(porcentajeConsumo(3, 0)).toBe(100)
  })
  it('redondea a una cifra decimal', () => {
    expect(porcentajeConsumo(1, 3)).toBe(33.3)
    expect(porcentajeConsumo(8, 10)).toBe(80)
  })
})

describe('filasDeModulos', () => {
  const base = [
    { slug: 'nucleo', activo: true, limites: { miembros: 10, almacenamiento_mb: 1000 } },
    { slug: 'correo', activo: false, limites: {} },
    { slug: 'chat', activo: true, limites: {} },
    { slug: 'viejo', activo: true, limites: {} },
  ]
  const filas = filasDeModulos(base, { miembros: 4, almacenamiento_mb: 250, ia_hoy: null })

  it('un módulo de la base que no existe en el registro se lista como desconocido, al final', () => {
    const ultima = filas[filas.length - 1]
    expect(ultima).toMatchObject({ slug: 'viejo', estado: 'desconocido' })
  })
  it('estado por fila y límites con su consumo', () => {
    const nucleo = filas.find((f) => f.slug === 'nucleo')!
    expect(nucleo.estado).toBe('activo')
    expect(nucleo.limites.find((l) => l.clave === 'miembros')).toEqual({ clave: 'miembros', limite: 10, usado: 4, porcentaje: 40 })
    expect(nucleo.limites.find((l) => l.clave === 'retencion_uso_dias')).toMatchObject({ limite: null, porcentaje: null })
    expect(filas.find((f) => f.slug === 'correo')!.estado).toBe('inactivo')
    expect(filas.find((f) => f.slug === 'crm')!.estado).toBe('inactivo')
    // Sin esquema todavía (PP-DEC-21): planeado aunque su fila figure activa
    expect(filas.find((f) => f.slug === 'chat')!.estado).toBe('planeado')
    expect(filas.find((f) => f.slug === 'calendario')!.estado).toBe('planeado')
  })
  it('las listas del registro no son topes', () => {
    expect(filas.find((f) => f.slug === 'correo')!.limites).toEqual([])
  })
})

describe('cifraDestacada', () => {
  const fila = (slug: string, ps: (number | null)[]): FilaModulo => ({
    slug,
    nombre: slug,
    estado: 'activo',
    depende: [],
    conectores: [],
    limites: ps.map((p, i) => ({ clave: `c${i}`, limite: 1, usado: 1, porcentaje: p })),
  })
  it('el porcentaje más alto; en un empate, el primero', () => {
    expect(cifraDestacada([fila('a', [20, 70]), fila('b', [70]), fila('c', [10])])).toEqual({ slug: 'a', nombre: 'a', clave: 'c1', porcentaje: 70 })
  })
  it('null si nada tiene porcentaje', () => {
    expect(cifraDestacada([fila('a', [null])])).toBeNull()
    expect(cifraDestacada([])).toBeNull()
  })
})
