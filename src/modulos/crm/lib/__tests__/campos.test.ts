import { describe, expect, it } from 'vitest'
import { limpiarCampos, validarCampos, validarValor } from '../campos'
import type { CampoDef } from '../tipos'

function def(p: Partial<CampoDef>): CampoDef {
  return { clave: 'campo', entidad: 'cuenta', etiqueta: 'Campo', tipo: 'texto', opciones: [], obligatorio: false, filtrable: false, orden: 1, ...p }
}

describe('campos', () => {
  it('número con coma colombiana y con punto', () => {
    const d = def({ tipo: 'numero' })
    expect(validarValor(d, '1.234,5')).toEqual({ ok: true, valor: 1234.5 })
    expect(validarValor(d, '1234.5')).toEqual({ ok: true, valor: 1234.5 })
    expect(validarValor(d, '12,5')).toEqual({ ok: true, valor: 12.5 })
    expect(validarValor(d, '-3')).toEqual({ ok: true, valor: -3 })
    expect(validarValor(d, 'abc').ok).toBe(false)
    expect(validarValor(d, '1.2.3').ok).toBe(false)
  })

  it('fecha imposible', () => {
    const d = def({ tipo: 'fecha' })
    expect(validarValor(d, '2026-02-30').ok).toBe(false)
    expect(validarValor(d, '2026-13-01').ok).toBe(false)
    expect(validarValor(d, '2024-02-29')).toEqual({ ok: true, valor: '2024-02-29' })
    expect(validarValor(d, '29/02/2024').ok).toBe(false)
  })

  it('lista, booleano y texto', () => {
    expect(validarValor(def({ tipo: 'lista', opciones: ['a', 'b'] }), 'c').ok).toBe(false)
    expect(validarValor(def({ tipo: 'lista', opciones: ['a', 'b'] }), 'b')).toEqual({ ok: true, valor: 'b' })
    const b = def({ tipo: 'booleano' })
    expect(validarValor(b, 'Sí')).toEqual({ ok: true, valor: true })
    expect(validarValor(b, 'si')).toEqual({ ok: true, valor: true })
    expect(validarValor(b, 'no')).toEqual({ ok: true, valor: false })
    expect(validarValor(b, 'quizá').ok).toBe(false)
    expect(validarValor(def({}), 'x'.repeat(501)).ok).toBe(false)
    expect(validarValor(def({}), 'x'.repeat(500)).ok).toBe(true)
  })

  it('validarCampos: no definidos, de otra entidad y obligatorios', () => {
    const defs = [def({ clave: 'eps', obligatorio: true }), def({ clave: 'cargo', entidad: 'contacto' })]
    const e = validarCampos(defs, 'cuenta', { cargo: 'x', otro: 1 })
    expect(Object.keys(e).sort()).toEqual(['cargo', 'eps', 'otro'])
    expect(validarCampos(defs, 'cuenta', { eps: 'Sura' })).toEqual({})
  })

  it('limpiarCampos quita vacíos', () => {
    expect(limpiarCampos({ a: '', b: ' x ', c: null, d: [], e: 0, f: false })).toEqual({ b: 'x', e: 0, f: false })
  })
})
