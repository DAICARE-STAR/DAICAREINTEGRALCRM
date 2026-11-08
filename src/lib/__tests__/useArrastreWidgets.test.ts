import { describe, expect, it } from 'vitest'
import { velocidadBorde } from '../useArrastreWidgets'

// Auto-desplazamiento durante el arrastre de los widgets del Inicio
describe('velocidadBorde', () => {
  const ALTO = 1024

  it('lejos de los bordes no desplaza', () => {
    expect(velocidadBorde(512, ALTO)).toBe(0)
    expect(velocidadBorde(64, ALTO)).toBe(0)
    expect(velocidadBorde(ALTO - 64, ALTO)).toBe(0)
  })

  it('arriba desplaza hacia arriba y abajo hacia abajo', () => {
    expect(velocidadBorde(30, ALTO)).toBeLessThan(0)
    expect(velocidadBorde(ALTO - 30, ALTO)).toBeGreaterThan(0)
  })

  it('más rápido cuanto más cerca del borde, con tope', () => {
    expect(Math.abs(velocidadBorde(10, ALTO))).toBeGreaterThan(Math.abs(velocidadBorde(50, ALTO)))
    expect(velocidadBorde(0, ALTO)).toBe(-18)
    expect(velocidadBorde(ALTO, ALTO)).toBe(18)
  })

  it('con el puntero fuera de la ventana va a la velocidad máxima', () => {
    expect(velocidadBorde(-40, ALTO)).toBe(-18)
    expect(velocidadBorde(ALTO + 40, ALTO)).toBe(18)
  })

  it('apenas dentro del borde se mueve al menos un píxel', () => {
    expect(velocidadBorde(63.5, ALTO)).toBe(-1)
    expect(velocidadBorde(ALTO - 63.5, ALTO)).toBe(1)
  })

  it('en una ventana baja el borde no pasa de un cuarto del alto', () => {
    // 200 px de alto: borde de 50 px, el centro sigue quieto
    expect(velocidadBorde(55, 200)).toBe(0)
    expect(velocidadBorde(100, 200)).toBe(0)
    expect(velocidadBorde(45, 200)).toBeLessThan(0)
  })
})
