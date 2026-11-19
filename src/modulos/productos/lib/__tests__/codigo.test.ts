import { describe, expect, it } from 'vitest'
import { esCodigoValido, leerCodigo, normalizarCodigo, normalizarNombre } from '../codigo'
import { leerDecimal, aTextoComa, fmtCantidad } from '../numeros'

describe('código del producto (misma regla que productos_preparar)', () => {
  it('quita todos los espacios y pasa a mayúsculas (casos 19.2 y 19.3)', () => {
    expect(normalizarCodigo(' ab-12 ')).toBe('AB-12')
    expect(normalizarCodigo('ab-12')).toBe('AB-12')
    expect(normalizarCodigo(' AB 12')).toBe('AB12')
    expect(normalizarCodigo('AB12 ')).toBe('AB12')
    expect(normalizarCodigo('a\tb\n1')).toBe('AB1')
  })

  it('admite A-Z, cifras y . _ / -, empezando por letra o cifra, hasta 40', () => {
    for (const c of ['A', '9', 'P-00001', 'AB.12_X/3-4', 'X'.repeat(40)]) expect(esCodigoValido(c), c).toBe(true)
    for (const c of ['', '-A', '.A', 'AÑO', 'A+B', 'A,B', 'X'.repeat(41), 'ab']) expect(esCodigoValido(c), c).toBe(false)
  })

  it('leerCodigo: vacío es automático; uno inválido trae el motivo', () => {
    expect(leerCodigo('   ')).toEqual({ ok: true, codigo: null })
    expect(leerCodigo(' ab-12 ')).toEqual({ ok: true, codigo: 'AB-12' })
    expect(leerCodigo('niño').ok).toBe(false)
    expect(leerCodigo('X'.repeat(41))).toEqual({ ok: false, error: 'El código admite hasta 40 caracteres.' })
  })

  it('normalizarNombre como nombre_normalizado de la base', () => {
    expect(normalizarNombre('  Tornillo   de  Acero ')).toBe('tornillo de acero')
  })
})

describe('leerDecimal con el separador elegido, sin adivinar', () => {
  it('coma decimal: el punto es de miles y solo en grupos de tres', () => {
    expect(leerDecimal('1.250', ',')).toBe('1250')
    expect(leerDecimal('0,001', ',')).toBe('0.001')
    expect(leerDecimal('1.234,5', ',')).toBe('1234.5')
    expect(leerDecimal('1.234.567,50', ',')).toBe('1234567.5')
    expect(leerDecimal('12', ',')).toBe('12')
    expect(leerDecimal('12,0', ',')).toBe('12')
    expect(leerDecimal('1.25', ',')).toBeNull()
    expect(leerDecimal('1,234.5', ',')).toBeNull()
    expect(leerDecimal('abc', ',')).toBeNull()
    expect(leerDecimal('', ',')).toBeNull()
  })

  it('punto decimal: la coma es de miles', () => {
    expect(leerDecimal('1.250', '.')).toBe('1.25')
    expect(leerDecimal('1,234.5', '.')).toBe('1234.5')
    expect(leerDecimal('0.001', '.')).toBe('0.001')
    expect(leerDecimal('1.234,5', '.')).toBeNull()
  })

  it('signo, ceros y espacios', () => {
    expect(leerDecimal('-5', ',')).toBe('-5')
    expect(leerDecimal('-0', ',')).toBe('0')
    expect(leerDecimal('007,50', ',')).toBe('7.5')
    expect(leerDecimal(' 1 250 ', ',')).toBe('1250')
  })

  it('aTextoComa y fmtCantidad escriben con coma decimal', () => {
    expect(aTextoComa(1250.5)).toBe('1250,5')
    expect(aTextoComa('12.0000')).toBe('12')
    expect(aTextoComa(null)).toBe('')
    expect(fmtCantidad('1234567.25')).toBe('1.234.567,25')
    expect(fmtCantidad(0.001)).toBe('0,001')
  })
})
