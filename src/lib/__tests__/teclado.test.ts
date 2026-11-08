import { describe, expect, it } from 'vitest'
import { indiceSiguiente } from '../teclado'

describe('indiceSiguiente', () => {
  it('avanza con la flecha derecha y vuelve al primero desde el último', () => {
    expect(indiceSiguiente(0, 4, 'ArrowRight')).toBe(1)
    expect(indiceSiguiente(2, 4, 'ArrowRight')).toBe(3)
    expect(indiceSiguiente(3, 4, 'ArrowRight')).toBe(0)
  })

  it('retrocede con la flecha izquierda y pasa al último desde el primero', () => {
    expect(indiceSiguiente(3, 4, 'ArrowLeft')).toBe(2)
    expect(indiceSiguiente(0, 4, 'ArrowLeft')).toBe(3)
  })

  it('Inicio y Fin van al primero y al último', () => {
    expect(indiceSiguiente(2, 5, 'Home')).toBe(0)
    expect(indiceSiguiente(2, 5, 'End')).toBe(4)
    expect(indiceSiguiente(0, 1, 'End')).toBe(0)
  })

  it('con un solo elemento las flechas se quedan en él', () => {
    expect(indiceSiguiente(0, 1, 'ArrowRight')).toBe(0)
    expect(indiceSiguiente(0, 1, 'ArrowLeft')).toBe(0)
  })

  it('sin elementos no hay destino', () => {
    expect(indiceSiguiente(0, 0, 'ArrowRight')).toBeNull()
    expect(indiceSiguiente(-1, 0, 'Home')).toBeNull()
    expect(indiceSiguiente(0, 0, 'End')).toBeNull()
  })

  it('una tecla ajena no navega', () => {
    expect(indiceSiguiente(1, 4, 'Enter')).toBeNull()
    expect(indiceSiguiente(1, 4, 'a')).toBeNull()
    expect(indiceSiguiente(1, 4, 'Tab')).toBeNull()
  })

  it('en horizontal las flechas verticales no navegan, y al revés', () => {
    expect(indiceSiguiente(1, 4, 'ArrowDown')).toBeNull()
    expect(indiceSiguiente(1, 4, 'ArrowUp')).toBeNull()
    expect(indiceSiguiente(1, 4, 'ArrowRight', 'vertical')).toBeNull()
    expect(indiceSiguiente(1, 4, 'ArrowLeft', 'vertical')).toBeNull()
  })

  it('en vertical navega con arriba y abajo, también circular', () => {
    expect(indiceSiguiente(1, 4, 'ArrowDown', 'vertical')).toBe(2)
    expect(indiceSiguiente(3, 4, 'ArrowDown', 'vertical')).toBe(0)
    expect(indiceSiguiente(0, 4, 'ArrowUp', 'vertical')).toBe(3)
    expect(indiceSiguiente(1, 4, 'Home', 'vertical')).toBe(0)
    expect(indiceSiguiente(1, 4, 'End', 'vertical')).toBe(3)
  })

  it('sin nada enfocado, avanzar va al primero y retroceder al último', () => {
    expect(indiceSiguiente(-1, 4, 'ArrowRight')).toBe(0)
    expect(indiceSiguiente(-1, 4, 'ArrowLeft')).toBe(3)
    expect(indiceSiguiente(-1, 4, 'ArrowDown', 'vertical')).toBe(0)
    expect(indiceSiguiente(7, 4, 'ArrowUp', 'vertical')).toBe(3)
  })
})
