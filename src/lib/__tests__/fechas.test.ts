import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  civilADate,
  diasDesde,
  diasEntre,
  fechaCorta,
  fechaCortaIso,
  hace,
  hoyBogota,
  sumarDiasCivil,
} from '../fechas'

afterEach(() => {
  vi.useRealTimers()
})

describe('hoyBogota', () => {
  it('a las 23:30 UTC en Bogotá todavía es el mismo día (UTC−5)', () => {
    expect(hoyBogota(new Date('2026-10-27T03:30:00Z'))).toBe('2026-10-26')
    expect(hoyBogota(new Date('2026-10-26T23:30:00Z'))).toBe('2026-10-26')
  })

  it('por defecto usa la hora del sistema', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T04:59:00Z'))
    expect(hoyBogota()).toBe('2025-12-31')
  })
})

describe('fechas civiles', () => {
  it('fechaCorta no pasa por Date (sin corrimiento de zona)', () => {
    expect(fechaCorta('2026-10-26')).toBe('26 oct')
    expect(fechaCorta('2026-01-01')).toBe('1 ene')
    expect(fechaCorta('2026-12-31T00:00:00')).toBe('31 dic')
    expect(fechaCorta(null)).toBe('')
    expect(fechaCorta('mañana')).toBe('mañana')
  })

  it('civilADate da la medianoche local', () => {
    const d = civilADate('2026-03-08')
    expect(d?.getFullYear()).toBe(2026)
    expect(d?.getMonth()).toBe(2)
    expect(d?.getDate()).toBe(8)
    expect(d?.getHours()).toBe(0)
    expect(civilADate('')).toBeNull()
  })

  it('sumarDiasCivil cruza meses y años', () => {
    expect(sumarDiasCivil('2026-10-26', 60)).toBe('2026-12-25')
    expect(sumarDiasCivil('2026-12-31', 1)).toBe('2027-01-01')
    expect(sumarDiasCivil('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('diasEntre cuenta días de calendario, sin horario de verano', () => {
    expect(diasEntre('2026-10-26', '2026-10-26')).toBe(0)
    expect(diasEntre('2026-10-26', '2026-10-27')).toBe(1)
    expect(diasEntre('2026-10-26', '2026-10-20')).toBe(-6)
    // Cambio de hora en Europa (29 de marzo) y en EE. UU. (8 de marzo)
    expect(diasEntre('2026-03-01', '2026-04-01')).toBe(31)
    expect(Number.isNaN(diasEntre('x', '2026-01-01'))).toBe(true)
  })
})

describe('instantes', () => {
  const ahora = new Date('2026-10-26T15:00:00Z').getTime()

  it('fechaCortaIso usa la hora local', () => {
    const d = new Date(2026, 9, 5, 12)
    expect(fechaCortaIso(d.toISOString())).toBe('5 oct')
    expect(fechaCortaIso('')).toBe('')
    expect(fechaCortaIso('no es fecha')).toBe('')
  })

  it('diasDesde cuenta días enteros', () => {
    expect(diasDesde('2026-10-26T10:00:00Z', ahora)).toBe(0)
    expect(diasDesde('2026-10-25T14:00:00Z', ahora)).toBe(1)
    expect(diasDesde('2026-10-20T15:00:00Z', ahora)).toBe(6)
  })

  it('hace pone el tiempo en palabras', () => {
    expect(hace('2026-10-26T14:59:50Z', ahora)).toBe('hace 1 min')
    expect(hace('2026-10-26T14:15:00Z', ahora)).toBe('hace 45 min')
    expect(hace('2026-10-26T14:00:00Z', ahora)).toBe('hace 1 hora')
    expect(hace('2026-10-26T10:00:00Z', ahora)).toBe('hace 5 horas')
    expect(hace('2026-10-25T10:00:00Z', ahora)).toBe('ayer')
    expect(hace('2026-10-22T10:00:00Z', ahora)).toBe('hace 4 días')
  })
})
