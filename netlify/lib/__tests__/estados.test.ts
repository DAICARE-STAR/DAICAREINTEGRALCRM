import { describe, expect, it } from 'vitest'
import { ESTADOS_PROYECTO, ESTADO_GANADO, ESTADO_PERDIDO, etiquetaEstado } from '../estados.mts'

// La copia de las apps estáticas (estados.js) no viaja al producto: la
// paridad con ella llega, si hace falta, con el módulo proyectos.

describe('etiquetaEstado', () => {
  it("muestra 'Listo' como «Ganado»", () => {
    expect(etiquetaEstado('Listo')).toBe('Ganado')
    expect(etiquetaEstado(ESTADO_GANADO)).toBe('Ganado')
  })

  it('los demás estados pasan igual', () => {
    for (const s of ESTADOS_PROYECTO.filter((e) => e !== ESTADO_GANADO)) {
      expect(etiquetaEstado(s)).toBe(s)
    }
  })

  it('sin estado no devuelve null ni vacío (va directo a un texto)', () => {
    expect(etiquetaEstado(null)).toBe('sin estado')
    expect(etiquetaEstado(undefined)).toBe('sin estado')
    expect(etiquetaEstado('')).toBe('sin estado')
  })

  it('los estados finales son parte del catálogo', () => {
    expect(ESTADOS_PROYECTO).toContain(ESTADO_GANADO)
    expect(ESTADOS_PROYECTO).toContain(ESTADO_PERDIDO)
  })
})
