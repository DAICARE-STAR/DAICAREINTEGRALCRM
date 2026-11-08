import { describe, expect, it } from 'vitest'
import { fmtDinero, fmtNumero } from '../moneda'

// Formato de dinero del shell (las apps estáticas no viajan al producto)
describe('fmtDinero', () => {
  it('pone código, símbolo e importe con miles con punto', () => {
    expect(fmtDinero(1234, 'USD')).toBe('USD $ 1.234')
    expect(fmtDinero(27299940, 'EUR')).toBe('EUR € 27.299.940')
    expect(fmtDinero(50000000, 'COP')).toBe('COP $ 50.000.000')
  })

  it('sin divisa usa USD y redondea sin decimales', () => {
    expect(fmtDinero(727424.6)).toBe('USD $ 727.425')
  })

  it('con decimales usa coma decimal', () => {
    expect(fmtDinero(4123.456, 'COP', 2)).toBe('COP $ 4.123,46')
  })

  it('una divisa sin símbolo conocido lleva solo el código', () => {
    expect(fmtDinero(10, 'CHF')).toBe('CHF 10')
  })

  it('acepta texto numérico y da — sin número', () => {
    expect(fmtDinero('1,234', 'USD')).toBe('USD $ 1.234')
    expect(fmtDinero(null, 'USD')).toBe('—')
    expect(fmtDinero(undefined)).toBe('—')
    expect(fmtDinero('', 'USD')).toBe('—')
    expect(fmtDinero(Number.NaN, 'USD')).toBe('—')
  })
})

describe('fmtNumero', () => {
  it('formatea sin divisa', () => {
    expect(fmtNumero(1234)).toBe('1.234')
    expect(fmtNumero(-12.5, 2)).toBe('-12,50')
    expect(fmtNumero(null)).toBe('—')
  })
})
