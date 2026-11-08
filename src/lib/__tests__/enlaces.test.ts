import { describe, expect, it } from 'vitest'
import { esEnlaceInterno } from '../enlaces'

describe('esEnlaceInterno', () => {
  it('acepta rutas del portal', () => {
    expect(esEnlaceInterno('/apps/x')).toBe(true)
    expect(esEnlaceInterno('/apps/proyectos?proyecto=12')).toBe(true)
    expect(esEnlaceInterno('/calendario#hoy')).toBe(true)
  })

  it('rechaza enlaces externos o de protocolo relativo', () => {
    expect(esEnlaceInterno('//evil')).toBe(false)
    expect(esEnlaceInterno('//evil.com/apps/x')).toBe(false)
    expect(esEnlaceInterno('/\\evil.com')).toBe(false)
    expect(esEnlaceInterno('https://evil.com/apps/x')).toBe(false)
    expect(esEnlaceInterno('http://localhost/apps/x')).toBe(false)
  })

  it('rechaza esquemas peligrosos', () => {
    expect(esEnlaceInterno('javascript:alert(1)')).toBe(false)
    expect(esEnlaceInterno('javascript:')).toBe(false)
    expect(esEnlaceInterno('data:text/html,hola')).toBe(false)
  })

  it('rechaza vacíos, la raíz sola y espacios delante', () => {
    expect(esEnlaceInterno('')).toBe(false)
    expect(esEnlaceInterno('/')).toBe(false)
    expect(esEnlaceInterno(' /apps/x')).toBe(false)
    expect(esEnlaceInterno(null)).toBe(false)
    expect(esEnlaceInterno(undefined)).toBe(false)
  })
})
